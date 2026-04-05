/* ═══════════════════════════════════════════════════════════════════
   Web Screen Reader & Read Aloud — v2.0
   Zero-dependency, browser-native TTS (speechSynthesis API)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Guard: speechSynthesis required ──
  if (!window.speechSynthesis) return;

  /* ═══════════════════════════════════════════════
     1. SHARED VOICE ENGINE (multi-language)
     ═══════════════════════════════════════════════ */
  var VoiceEngine = {
    synth: window.speechSynthesis,
    allVoices: [],   // all available voices
    voices: [],      // filtered for current language
    selectedVoice: null,
    rate: 1,
    lang: 'en',      // current language prefix
    _utterance: null,
    _onEndCb: null,
    _chunkQueue: [],
    _paused: false,

    init: function () {
      var self = this;
      function loadVoices() {
        self.allVoices = self.synth.getVoices();
        self._filterVoicesForLang(self.lang);
      }
      loadVoices();
      if (self.synth.onvoiceschanged !== undefined) {
        self.synth.onvoiceschanged = loadVoices;
      }
    },

    _filterVoicesForLang: function (langPrefix) {
      this.lang = langPrefix;
      this.voices = this.allVoices.filter(function (v) {
        return v.lang.indexOf(langPrefix) === 0;
      });
      // Fallback: if no voices for this language, show all
      if (!this.voices.length) this.voices = this.allVoices.slice();
      // Auto-select best voice
      if (this.voices.length) {
        var preferred = this.voices.filter(function (v) {
          return v.name.indexOf('Google') > -1 || v.name.indexOf('Microsoft') > -1 || v.name.indexOf('Samantha') > -1;
        });
        this.selectedVoice = preferred.length ? preferred[0] : this.voices[0];
      }
    },

    setLanguage: function (langPrefix) {
      this._filterVoicesForLang(langPrefix);
    },

    speak: function (text, onEnd) {
      if (!text) { if (onEnd) onEnd(); return; }
      this.stop();
      this._paused = false;

      // Chrome bug: speech stops after ~15s. Chunk long text.
      var chunks = this._chunkText(text, 180);
      this._chunkQueue = chunks.slice(1);
      this._onEndCb = onEnd || null;
      this._speakChunk(chunks[0]);
    },

    _chunkText: function (text, maxLen) {
      if (text.length <= maxLen) return [text];
      var chunks = [];
      var sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [text];
      var current = '';
      for (var i = 0; i < sentences.length; i++) {
        if ((current + sentences[i]).length > maxLen && current) {
          chunks.push(current.trim());
          current = '';
        }
        current += sentences[i];
      }
      if (current.trim()) chunks.push(current.trim());
      return chunks;
    },

    _speakChunk: function (text) {
      var self = this;
      var utt = new SpeechSynthesisUtterance(text);
      utt.rate = self.rate;
      utt.pitch = 1;
      if (self.selectedVoice) utt.voice = self.selectedVoice;
      utt.onend = function () {
        if (self._chunkQueue.length && !self._paused) {
          self._speakChunk(self._chunkQueue.shift());
        } else if (!self._chunkQueue.length && self._onEndCb) {
          self._onEndCb();
          self._onEndCb = null;
        }
      };
      utt.onerror = function () {
        self._chunkQueue = [];
        if (self._onEndCb) { self._onEndCb(); self._onEndCb = null; }
      };
      self._utterance = utt;
      self.synth.speak(utt);
    },

    pause: function () {
      this._paused = true;
      this.synth.pause();
    },

    resume: function () {
      this._paused = false;
      this.synth.resume();
    },

    stop: function () {
      this._paused = false;
      this._chunkQueue = [];
      this._onEndCb = null;
      this.synth.cancel();
    },

    isSpeaking: function () {
      return this.synth.speaking;
    }
  };

  VoiceEngine.init();

  /* Helper: announce via the site's existing live region */
  function announce(msg) {
    if (window.srAnnounce) window.srAnnounce(msg);
  }

  /* Language map: translation langCode → speechSynthesis lang prefix */
  var langMap = {
    'hi': 'hi', 'ta': 'ta', 'te': 'te', 'kn': 'kn', 'ml': 'ml',
    'bn': 'bn', 'mr': 'mr', 'gu': 'gu', 'pa': 'pa', 'ur': 'ur',
    'es': 'es', 'fr': 'fr', 'de': 'de', 'zh': 'zh', 'ja': 'ja',
    'ko': 'ko', 'ar': 'ar', 'pt': 'pt', 'ru': 'ru', 'it': 'it'
  };

  /* ═══════════════════════════════════════════════
     2. READ ALOUD FEATURE
     ═══════════════════════════════════════════════ */
  var ReadAloud = {
    active: false,
    playing: false,
    elements: [],
    currentIdx: -1,

    _toolbar: null,
    _statusEl: null,
    _playBtn: null,
    _speedSlider: null,
    _speedVal: null,
    _voiceSelect: null,

    init: function () {
      this._buildToolbar();
    },

    activate: function () {
      this.active = true;
      this.elements = this._collectContent();
      this.currentIdx = -1;
      document.body.classList.add('wsr-toolbar-active');
      this._toolbar.setAttribute('aria-hidden', 'false');
      this._populateVoices();
      this._updateStatus('Ready. ' + this.elements.length + ' sections found. Press Play to start.');
      announce('Read Aloud activated. ' + this.elements.length + ' sections found.');
    },

    deactivate: function () {
      this.active = false;
      this.playing = false;
      VoiceEngine.stop();
      VoiceEngine.speak('Read Aloud deactivated');
      this._clearHighlight();
      this._toolbar.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('wsr-toolbar-active');
      announce('Read Aloud deactivated');
    },

    play: function () {
      if (!this.active) return;
      if (this.playing && VoiceEngine.synth.paused) {
        VoiceEngine.resume();
        this._playBtn.textContent = 'Pause';
        return;
      }
      this.playing = true;
      this._playBtn.textContent = 'Pause';
      if (this.currentIdx < 0) this.currentIdx = 0;
      this._readCurrent();
    },

    pauseToggle: function () {
      if (!this.playing) { this.play(); return; }
      if (VoiceEngine.synth.paused) {
        VoiceEngine.resume();
        this._playBtn.textContent = 'Pause';
      } else {
        VoiceEngine.pause();
        this._playBtn.textContent = 'Resume';
      }
    },

    stopReading: function () {
      this.playing = false;
      VoiceEngine.stop();
      this._clearHighlight();
      this.currentIdx = -1;
      this._playBtn.textContent = 'Play';
      this._updateStatus('Stopped.');
    },

    _readCurrent: function () {
      if (!this.playing || this.currentIdx >= this.elements.length) {
        this.stopReading();
        this._updateStatus('Finished reading.');
        announce('Read Aloud finished');
        return;
      }
      var el = this.elements[this.currentIdx];
      var text = (el.textContent || '').trim();
      this._highlightElement(el);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this._updateStatus('Reading section ' + (this.currentIdx + 1) + ' of ' + this.elements.length);

      var self = this;
      VoiceEngine.speak(text, function () {
        self._clearHighlight();
        self.currentIdx++;
        if (self.playing) self._readCurrent();
      });
    },

    _highlightElement: function (el) {
      this._clearHighlight();
      el.classList.add('wsr-reading-highlight');
    },

    _clearHighlight: function () {
      var prev = document.querySelector('.wsr-reading-highlight');
      if (prev) prev.classList.remove('wsr-reading-highlight');
    },

    _collectContent: function () {
      var main = document.getElementById('main-content');
      if (!main) main = document.querySelector('main') || document.body;
      var blocks = main.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, td, th, figcaption, blockquote, dt, dd');
      var result = [];
      for (var i = 0; i < blocks.length; i++) {
        var el = blocks[i];
        if (el.closest('[hidden], [aria-hidden="true"], .wsr-toolbar')) continue;
        if (el.offsetParent === null && el.tagName !== 'BODY') continue;
        var text = (el.textContent || '').trim();
        if (text.length > 2) result.push(el);
      }
      return result;
    },

    // Rebuild content after translation
    rebuildContent: function () {
      if (!this.active) return;
      var wasPlaying = this.playing;
      if (wasPlaying) this.stopReading();
      this.elements = this._collectContent();
      this._updateStatus('Content refreshed. ' + this.elements.length + ' sections.');
      if (wasPlaying) this.play();
    },

    _updateStatus: function (msg) {
      if (this._statusEl) this._statusEl.textContent = msg;
    },

    _populateVoices: function () {
      if (!this._voiceSelect) return;
      this._voiceSelect.innerHTML = '';
      var voices = VoiceEngine.voices;
      for (var i = 0; i < voices.length; i++) {
        var opt = document.createElement('option');
        opt.value = i;
        opt.textContent = voices[i].name.replace(/Microsoft |Google /, '') + ' (' + voices[i].lang + ')';
        if (voices[i] === VoiceEngine.selectedVoice) opt.selected = true;
        this._voiceSelect.appendChild(opt);
      }
    },

    _buildToolbar: function () {
      var div = document.createElement('div');
      div.className = 'wsr-toolbar';
      div.id = 'ra-toolbar';
      div.setAttribute('role', 'region');
      div.setAttribute('aria-label', 'Read Aloud controls');
      div.setAttribute('aria-hidden', 'true');

      div.innerHTML =
        '<div class="wsr-toolbar-row">' +
          '<span class="wsr-mode-badge">Read Aloud</span>' +
          '<div class="wsr-sep" aria-hidden="true"></div>' +
          '<button type="button" id="ra-play" aria-label="Play">Play</button>' +
          '<button type="button" id="ra-stop" aria-label="Stop reading">Stop</button>' +
          '<button type="button" id="ra-prev" aria-label="Previous section">&laquo; Prev</button>' +
          '<button type="button" id="ra-next" aria-label="Next section">Next &raquo;</button>' +
          '<div class="wsr-sep" aria-hidden="true"></div>' +
          '<label for="ra-speed">Speed</label>' +
          '<input type="range" id="ra-speed" min="0.5" max="2" step="0.25" value="1">' +
          '<span class="wsr-speed-val" id="ra-speed-val">1x</span>' +
          '<div class="wsr-sep" aria-hidden="true"></div>' +
          '<label for="ra-voice">Voice</label>' +
          '<select id="ra-voice"></select>' +
          '<button type="button" class="wsr-close-btn" id="ra-close" aria-label="Close Read Aloud">Close</button>' +
        '</div>' +
        '<div class="wsr-status" id="ra-status" aria-live="polite" aria-atomic="true">Ready</div>';

      document.body.appendChild(div);
      this._toolbar = div;
      this._statusEl = div.querySelector('#ra-status');
      this._playBtn = div.querySelector('#ra-play');
      this._speedSlider = div.querySelector('#ra-speed');
      this._speedVal = div.querySelector('#ra-speed-val');
      this._voiceSelect = div.querySelector('#ra-voice');

      var self = this;
      this._playBtn.addEventListener('click', function () { self.pauseToggle(); });
      div.querySelector('#ra-stop').addEventListener('click', function () { self.stopReading(); });
      div.querySelector('#ra-prev').addEventListener('click', function () {
        if (self.currentIdx > 0) { self.currentIdx -= 2; VoiceEngine.stop(); self._readCurrent(); }
      });
      div.querySelector('#ra-next').addEventListener('click', function () {
        VoiceEngine.stop();
        if (!self.playing) { self.currentIdx++; self.play(); }
      });
      div.querySelector('#ra-close').addEventListener('click', function () {
        self.deactivate();
        var sw = document.getElementById('a11y-read-aloud');
        if (sw) sw.setAttribute('aria-checked', 'false');
        localStorage.setItem('a11y-read-aloud', 'false');
      });
      this._speedSlider.addEventListener('input', function () {
        VoiceEngine.rate = parseFloat(this.value);
        self._speedVal.textContent = this.value + 'x';
      });
      this._voiceSelect.addEventListener('change', function () {
        VoiceEngine.selectedVoice = VoiceEngine.voices[parseInt(this.value)] || VoiceEngine.voices[0];
      });
    }
  };

  /* ═══════════════════════════════════════════════
     3. WEB SCREEN READER — v2.0
     ═══════════════════════════════════════════════ */
  var WebSR = {
    active: false,
    nodes: [],       // flat accessible node list
    cursor: -1,      // current position
    mode: 'browse',  // 'browse' | 'focus'
    _continuousReading: false,

    _toolbar: null,
    _statusEl: null,
    _focusRing: null,
    _scrollRAF: null,
    _listDialog: null,

    init: function () {
      this._buildToolbar();
      this._buildFocusRing();
      this._buildListDialog();
    },

    activate: function () {
      this.active = true;
      this.mode = 'browse';
      this._continuousReading = false;
      this.nodes = this._buildTree();
      this.cursor = -1;
      document.body.classList.add('wsr-toolbar-active');
      this._toolbar.setAttribute('aria-hidden', 'false');
      this._populateVoices();
      this._bindKeys();
      this._bindScroll();
      this._updateStatus('Screen Reader active. ' + this.nodes.length + ' elements. Arrow keys to navigate, Enter to activate, Ctrl to stop speech.');
      announce('Web Screen Reader activated. ' + this.nodes.length + ' elements. Down arrow to start navigating.');
      VoiceEngine.speak('Web Screen Reader activated. ' + this.nodes.length + ' elements found. Use down arrow to navigate. Enter to activate. Alt Shift question mark for help.');
    },

    deactivate: function () {
      this.active = false;
      this._continuousReading = false;
      VoiceEngine.stop();
      // Speak deactivation feedback AFTER stopping current speech
      VoiceEngine.speak('Screen Reader deactivated');
      this._toolbar.setAttribute('aria-hidden', 'true');
      this._focusRing.style.display = 'none';
      this._hideListDialog();
      document.body.classList.remove('wsr-toolbar-active');
      this._unbindKeys();
      this._unbindScroll();
      announce('Web Screen Reader deactivated');
    },

    // Rebuild tree (after translation or dynamic content change)
    rebuildTree: function () {
      if (!this.active) return;
      var oldCursorEl = (this.cursor >= 0 && this.cursor < this.nodes.length) ? this.nodes[this.cursor].element : null;
      this.nodes = this._buildTree();
      // Try to restore cursor to same element
      if (oldCursorEl) {
        for (var i = 0; i < this.nodes.length; i++) {
          if (this.nodes[i].element === oldCursorEl) { this.cursor = i; break; }
        }
      }
      this._updateStatus('Content refreshed. ' + this.nodes.length + ' elements.');
      this._populateVoices();
    },

    // ── Tree builder ──
    _buildTree: function () {
      var nodes = [];
      var root = document.getElementById('main-content') || document.querySelector('main') || document.body;
      var header = document.querySelector('header[role="banner"]');
      var scanRoots = header ? [header, root] : [root];

      for (var r = 0; r < scanRoots.length; r++) {
        this._walkDOM(scanRoots[r], nodes);
      }
      return nodes;
    },

    _walkDOM: function (root, nodes) {
      var self = this;
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (node) {
          // Skip our own UI
          if (node.closest('.wsr-toolbar, .wsr-focus-ring, .wsr-list-dialog')) return NodeFilter.FILTER_REJECT;
          // Skip hidden elements and aria-hidden ancestors
          if (node.hidden || node.getAttribute('aria-hidden') === 'true') return NodeFilter.FILTER_REJECT;
          // Check for aria-hidden ancestor (not just the element itself)
          if (node.parentElement && node.parentElement.closest('[aria-hidden="true"]')) return NodeFilter.FILTER_REJECT;
          if (node.offsetParent === null && node.tagName !== 'HTML' && node.tagName !== 'BODY' &&
              window.getComputedStyle(node).position !== 'fixed') return NodeFilter.FILTER_REJECT;
          var tag = node.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'BR' || tag === 'SVG') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      var el;
      while ((el = walker.nextNode())) {
        var info = self._getNodeInfo(el);
        if (info) nodes.push(info);
      }
    },

    _getNodeInfo: function (el) {
      var tag = el.tagName;
      var role = this._getRole(el, tag);
      var name = this._getName(el, tag, role);

      // Skip presentational / decorative elements
      if (role === 'presentation' || role === 'none') return null;
      // Skip generic elements with no name and no semantic role
      if (role === 'generic' && !name) return null;
      // Skip containers that just wrap other content
      if ((tag === 'DIV' || tag === 'SPAN' || tag === 'SECTION') && role === 'generic') return null;
      // Skip images with no alt text (decorative)
      if (role === 'image' && !name) return null;

      return {
        element: el,
        role: role,
        name: name,
        tag: tag,
        level: this._getLevel(el, tag),
        isLandmark: this._isLandmark(role),
        states: this._getStates(el)
      };
    },

    _getRole: function (el, tag) {
      var explicit = el.getAttribute('role');
      if (explicit) return explicit;

      var roleMap = {
        'H1': 'heading', 'H2': 'heading', 'H3': 'heading',
        'H4': 'heading', 'H5': 'heading', 'H6': 'heading',
        'A': 'link', 'BUTTON': 'button', 'IMG': 'image',
        'NAV': 'navigation', 'MAIN': 'main', 'ASIDE': 'complementary',
        'FOOTER': 'contentinfo', 'HEADER': 'banner',
        'FORM': 'form', 'TABLE': 'table',
        'UL': 'list', 'OL': 'list', 'LI': 'listitem',
        'SELECT': 'combobox', 'TEXTAREA': 'textbox',
        'P': 'paragraph', 'BLOCKQUOTE': 'blockquote',
        'FIGCAPTION': 'caption', 'FIGURE': 'figure',
        'DL': 'list', 'DT': 'term', 'DD': 'definition',
        'LABEL': 'label', 'FIELDSET': 'group', 'LEGEND': 'legend',
        'TH': 'columnheader', 'TD': 'cell', 'TR': 'row',
        'THEAD': 'rowgroup', 'TBODY': 'rowgroup'
      };

      if (tag === 'INPUT') return this._getInputRole(el);
      if (tag === 'SECTION') {
        return (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) ? 'region' : 'generic';
      }
      if (tag === 'HEADER' && el.closest('main, article, section')) return 'generic';
      if (tag === 'FOOTER' && el.closest('main, article, section')) return 'generic';

      return roleMap[tag] || 'generic';
    },

    _getInputRole: function (el) {
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      var map = {
        'text': 'textbox', 'email': 'textbox', 'tel': 'textbox',
        'url': 'textbox', 'search': 'searchbox', 'password': 'textbox',
        'number': 'spinbutton', 'range': 'slider',
        'checkbox': 'checkbox', 'radio': 'radio',
        'submit': 'button', 'reset': 'button', 'button': 'button',
        'file': 'button'
      };
      return map[type] || 'textbox';
    },

    _getName: function (el, tag, role) {
      // aria-labelledby
      var labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        var parts = labelledBy.split(/\s+/);
        var text = '';
        for (var i = 0; i < parts.length; i++) {
          var ref = document.getElementById(parts[i]);
          if (ref) text += (ref.textContent || '') + ' ';
        }
        if (text.trim()) return text.trim();
      }

      // aria-label
      var ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel;

      // alt (images)
      if (tag === 'IMG') return el.getAttribute('alt') || '';

      // label element (for form controls)
      if (el.id && (role === 'textbox' || role === 'checkbox' || role === 'radio' || role === 'combobox' || role === 'searchbox' || role === 'spinbutton' || role === 'slider')) {
        var label = document.querySelector('label[for="' + el.id + '"]');
        if (label) return (label.textContent || '').trim();
      }
      // wrapped in label
      if (el.closest && el.closest('label')) {
        var lbl = el.closest('label');
        var clone = lbl.cloneNode(true);
        var inputs = clone.querySelectorAll('input, select, textarea, button');
        for (var j = 0; j < inputs.length; j++) inputs[j].remove();
        var lblText = (clone.textContent || '').trim();
        if (lblText) return lblText;
      }

      // title attribute
      if (el.getAttribute('title')) return el.getAttribute('title');

      // Text content for interactive/heading elements
      if (role === 'heading' || role === 'link' || role === 'button' || role === 'listitem' ||
          role === 'paragraph' || role === 'blockquote' || role === 'term' || role === 'definition' ||
          role === 'caption' || role === 'legend' || role === 'switch' ||
          role === 'cell' || role === 'columnheader') {
        var tc = (el.textContent || '').trim();
        return tc.length > 200 ? tc.substring(0, 200) + '...' : tc;
      }

      // placeholder for inputs
      if (el.getAttribute('placeholder')) return el.getAttribute('placeholder');

      // Value for inputs
      if (role === 'textbox' && el.value) return 'containing: ' + el.value;

      return '';
    },

    _getLevel: function (el, tag) {
      if (/^H[1-6]$/.test(tag)) return parseInt(tag.charAt(1));
      var level = el.getAttribute('aria-level');
      return level ? parseInt(level) : null;
    },

    _isLandmark: function (role) {
      return ['navigation', 'main', 'complementary', 'contentinfo', 'banner', 'region', 'form', 'search'].indexOf(role) > -1;
    },

    _getStates: function (el) {
      var states = [];
      if (el.getAttribute('aria-expanded') === 'true') states.push('expanded');
      if (el.getAttribute('aria-expanded') === 'false') states.push('collapsed');
      if (el.getAttribute('aria-checked') === 'true') states.push('checked');
      if (el.getAttribute('aria-checked') === 'false') states.push('not checked');
      if (el.getAttribute('aria-pressed') === 'true') states.push('pressed');
      if (el.getAttribute('aria-pressed') === 'false') states.push('not pressed');
      if (el.getAttribute('aria-selected') === 'true') states.push('selected');
      if (el.required || el.getAttribute('aria-required') === 'true') states.push('required');
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') states.push('disabled');
      if (el.getAttribute('aria-current')) states.push('current ' + el.getAttribute('aria-current'));
      return states;
    },

    // ── Announcement formatter ──
    _buildAnnouncement: function (node) {
      if (!node) return '';
      var parts = [];

      // Name first
      if (node.name) parts.push(node.name);

      // Role description
      var roleLabel = this._getRoleLabel(node.role);
      if (node.role === 'heading' && node.level) {
        roleLabel = 'heading level ' + node.level;
      }
      if (node.role === 'list' && node.element) {
        var items = node.element.querySelectorAll(':scope > li, :scope > dt');
        if (items.length) roleLabel += ', ' + items.length + ' items';
      }
      if (node.role === 'table' && node.element) {
        var rows = node.element.querySelectorAll('tr');
        var cols = node.element.querySelector('tr') ? node.element.querySelector('tr').children.length : 0;
        roleLabel += ', ' + rows.length + ' rows, ' + cols + ' columns';
      }
      if (node.role === 'form' && node.element) {
        var fields = node.element.querySelectorAll('input, select, textarea');
        if (fields.length) roleLabel += ', ' + fields.length + ' fields';
      }
      if (node.role === 'image' && !node.name) {
        parts.push('image, no alternative text');
        return parts.join(', ');
      }
      if (roleLabel && roleLabel !== 'text') parts.push(roleLabel);

      // States
      if (node.states.length) parts.push(node.states.join(', '));

      // Landmark qualifier
      if (node.isLandmark) parts.push('landmark');

      return parts.join(', ');
    },

    _getRoleLabel: function (role) {
      var labels = {
        'heading': 'heading', 'link': 'link', 'button': 'button',
        'image': 'image', 'textbox': 'edit text', 'searchbox': 'search edit',
        'checkbox': 'check box', 'radio': 'radio button',
        'combobox': 'combo box', 'slider': 'slider', 'spinbutton': 'spin button',
        'navigation': 'navigation', 'main': 'main',
        'complementary': 'complementary', 'contentinfo': 'content info',
        'banner': 'banner', 'region': 'region', 'form': 'form', 'search': 'search',
        'list': 'list', 'listitem': 'list item',
        'table': 'table', 'row': 'row', 'cell': 'cell', 'columnheader': 'column header',
        'rowgroup': 'row group',
        'paragraph': 'text', 'blockquote': 'block quote',
        'figure': 'figure', 'caption': 'caption',
        'term': 'term', 'definition': 'definition',
        'group': 'group', 'legend': 'legend',
        'switch': 'switch', 'tab': 'tab', 'tabpanel': 'tab panel',
        'dialog': 'dialog', 'alert': 'alert',
        'generic': 'text', 'label': 'label'
      };
      return labels[role] || role;
    },

    // ── Navigation ──
    moveNext: function () {
      if (this.cursor < this.nodes.length - 1) {
        this.cursor++;
        this._announceAndFocus();
      } else {
        this._continuousReading = false;
        VoiceEngine.speak('End of page');
        this._updateStatus('End of page');
      }
    },

    movePrev: function () {
      if (this.cursor > 0) {
        this.cursor--;
        this._announceAndFocus();
      } else {
        VoiceEngine.speak('Beginning of page');
        this._updateStatus('Beginning of page');
      }
    },

    moveToNextOfType: function (roleFilter, levelFilter) {
      for (var i = this.cursor + 1; i < this.nodes.length; i++) {
        var n = this.nodes[i];
        if (n.role === roleFilter || (roleFilter === 'landmark' && n.isLandmark)) {
          if (levelFilter && n.level !== levelFilter) continue;
          this.cursor = i;
          this._announceAndFocus();
          return;
        }
      }
      var label = levelFilter ? roleFilter + ' level ' + levelFilter : roleFilter;
      VoiceEngine.speak('No more ' + label + ' elements');
      this._updateStatus('No more ' + label + ' elements');
    },

    moveToPrevOfType: function (roleFilter, levelFilter) {
      for (var i = this.cursor - 1; i >= 0; i--) {
        var n = this.nodes[i];
        if (n.role === roleFilter || (roleFilter === 'landmark' && n.isLandmark)) {
          if (levelFilter && n.level !== levelFilter) continue;
          this.cursor = i;
          this._announceAndFocus();
          return;
        }
      }
      VoiceEngine.speak('No previous ' + roleFilter + ' elements');
    },

    // ── Continuous reading (Read From Here) ──
    readFromHere: function () {
      this._continuousReading = true;
      if (this.cursor < 0) this.cursor = 0;
      this._readContinuous();
    },

    _readContinuous: function () {
      if (!this._continuousReading || !this.active) return;
      if (this.cursor >= this.nodes.length) {
        this._continuousReading = false;
        VoiceEngine.speak('End of page');
        return;
      }
      var node = this.nodes[this.cursor];
      var text = this._buildAnnouncement(node);
      this._updateStatus(text);
      this._positionFocusRing();
      node.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      var self = this;
      VoiceEngine.speak(text, function () {
        if (self._continuousReading) {
          self.cursor++;
          self._readContinuous();
        }
      });
    },

    // ── Action handling ──
    activateCurrent: function () {
      if (this.cursor < 0 || this.cursor >= this.nodes.length) return;
      var node = this.nodes[this.cursor];
      var el = node.element;
      var role = node.role;

      // Links — click and handle anchor navigation
      if (role === 'link') {
        var href = el.getAttribute('href') || '';
        el.click();
        if (href.charAt(0) === '#') {
          // Anchor link — reset cursor to target section
          var self = this;
          setTimeout(function () {
            self.nodes = self._buildTree();
            var targetId = href.substring(1);
            var targetEl = document.getElementById(targetId);
            if (targetEl) {
              // Find the first node inside or near the target
              for (var i = 0; i < self.nodes.length; i++) {
                if (targetEl.contains(self.nodes[i].element) || self.nodes[i].element === targetEl) {
                  self.cursor = i;
                  self._announceAndFocus();
                  return;
                }
              }
            }
            VoiceEngine.speak('Navigated to ' + (targetId || 'section'));
          }, 300);
        } else {
          VoiceEngine.speak('Link activated');
        }
        return;
      }

      // Buttons — click and announce new state
      if (role === 'button') {
        var hadExpanded = el.hasAttribute('aria-expanded');
        el.click();
        // Re-read states after click (toggle may have changed)
        var self2 = this;
        setTimeout(function () {
          var newStates = self2._getStates(el);
          var stateText = newStates.length ? newStates.join(', ') : 'activated';
          self2.nodes[self2.cursor].states = newStates;
          var newLabel = el.getAttribute('aria-label') || '';
          VoiceEngine.speak(newLabel ? newLabel + ', ' + stateText : stateText);
          self2._updateStatus(stateText);
          // Rebuild tree if button toggled expanded state (new content may be visible)
          if (hadExpanded) {
            setTimeout(function () { self2.rebuildTree(); }, 200);
          }
        }, 150);
        return;
      }

      // Switches (role="switch") — toggle and announce
      if (role === 'switch') {
        el.click();
        var self3 = this;
        setTimeout(function () {
          var checked = el.getAttribute('aria-checked') === 'true';
          var newStates = self3._getStates(el);
          self3.nodes[self3.cursor].states = newStates;
          VoiceEngine.speak(checked ? 'checked' : 'not checked');
          self3._updateStatus(node.name + ', switch, ' + (checked ? 'checked' : 'not checked'));
        }, 100);
        return;
      }

      // Checkboxes — toggle and announce
      if (role === 'checkbox') {
        el.click();
        var self4 = this;
        setTimeout(function () {
          var checked = el.checked || el.getAttribute('aria-checked') === 'true';
          self4.nodes[self4.cursor].states = self4._getStates(el);
          VoiceEngine.speak(checked ? 'checked' : 'not checked');
        }, 50);
        return;
      }

      // Radio buttons — select and announce
      if (role === 'radio') {
        el.click();
        var self5 = this;
        setTimeout(function () {
          self5.nodes[self5.cursor].states = self5._getStates(el);
          VoiceEngine.speak('selected');
        }, 50);
        return;
      }

      // Text fields — enter focus mode
      if (role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'spinbutton') {
        this.mode = 'focus';
        el.focus();
        var fieldLabel = node.name || 'field';
        var fieldStates = node.states.length ? ', ' + node.states.join(', ') : '';
        VoiceEngine.speak('Focus mode. ' + fieldLabel + ', ' + this._getRoleLabel(role) + fieldStates + '. Type to edit. Press Escape to return to browse mode.');
        this._updateStatus('FOCUS MODE — ' + fieldLabel + ' — Escape to exit');
        return;
      }

      // Sliders — enter focus mode with value
      if (role === 'slider') {
        this.mode = 'focus';
        el.focus();
        var val = el.value || el.getAttribute('aria-valuenow') || '';
        VoiceEngine.speak('Slider, value ' + val + '. Use arrow keys to adjust. Escape to exit.');
        this._updateStatus('FOCUS MODE — Slider — Escape to exit');
        return;
      }

      // Default — just click
      el.click();
      VoiceEngine.speak('Activated');
    },

    exitFocusMode: function () {
      this.mode = 'browse';
      // Re-read the current element state after editing
      if (this.cursor >= 0 && this.cursor < this.nodes.length) {
        var node = this.nodes[this.cursor];
        node.states = this._getStates(node.element);
        node.name = this._getName(node.element, node.tag, node.role);
      }
      VoiceEngine.speak('Browse mode');
      this._updateStatus('Browse mode');
      this._positionFocusRing();
    },

    _announceAndFocus: function () {
      var node = this.nodes[this.cursor];
      if (!node) return;
      // Refresh name (text may have changed after translation)
      node.name = this._getName(node.element, node.tag, node.role);
      node.states = this._getStates(node.element);
      var text = this._buildAnnouncement(node);
      VoiceEngine.speak(text);
      this._updateStatus(text);
      this._positionFocusRing();
      node.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    // ── Element List Dialog ──
    _buildListDialog: function () {
      var div = document.createElement('div');
      div.className = 'wsr-list-dialog';
      div.setAttribute('role', 'dialog');
      div.setAttribute('aria-labelledby', 'wsr-list-title');
      div.setAttribute('aria-modal', 'true');
      div.style.display = 'none';
      div.innerHTML =
        '<div class="wsr-list-inner">' +
          '<h2 id="wsr-list-title" tabindex="-1">Elements</h2>' +
          '<div class="wsr-list-tabs" role="tablist">' +
            '<button role="tab" aria-selected="true" data-list="heading">Headings</button>' +
            '<button role="tab" aria-selected="false" data-list="link">Links</button>' +
            '<button role="tab" aria-selected="false" data-list="landmark">Landmarks</button>' +
            '<button role="tab" aria-selected="false" data-list="button">Buttons</button>' +
            '<button role="tab" aria-selected="false" data-list="form">Form Fields</button>' +
          '</div>' +
          '<ul class="wsr-list-items" role="listbox" aria-label="Element list" tabindex="0"></ul>' +
          '<button type="button" class="wsr-list-close">Close</button>' +
        '</div>';
      document.body.appendChild(div);
      this._listDialog = div;

      var self = this;
      // Tab switching
      var tabs = div.querySelectorAll('[role="tab"]');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function () {
          for (var j = 0; j < tabs.length; j++) tabs[j].setAttribute('aria-selected', 'false');
          this.setAttribute('aria-selected', 'true');
          self._populateListDialog(this.getAttribute('data-list'));
        });
      }
      // Close
      div.querySelector('.wsr-list-close').addEventListener('click', function () { self._hideListDialog(); });
      // Item selection
      div.querySelector('.wsr-list-items').addEventListener('click', function (e) {
        var li = e.target.closest('[data-idx]');
        if (li) {
          var idx = parseInt(li.getAttribute('data-idx'));
          self._hideListDialog();
          self.cursor = idx;
          self._announceAndFocus();
        }
      });
      // Keyboard in list
      div.querySelector('.wsr-list-items').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var focused = div.querySelector('[data-idx]:focus, [data-idx].wsr-list-active');
          if (focused) {
            var idx = parseInt(focused.getAttribute('data-idx'));
            self._hideListDialog();
            self.cursor = idx;
            self._announceAndFocus();
          }
        } else if (e.key === 'Escape') {
          self._hideListDialog();
        }
      });
    },

    showListDialog: function (type) {
      this._listDialog.style.display = 'flex';
      // Select right tab
      var tabs = this._listDialog.querySelectorAll('[role="tab"]');
      for (var i = 0; i < tabs.length; i++) {
        var isMatch = tabs[i].getAttribute('data-list') === type;
        tabs[i].setAttribute('aria-selected', String(isMatch));
      }
      this._populateListDialog(type);
      this._listDialog.querySelector('#wsr-list-title').focus();
      VoiceEngine.speak('Element list. ' + type + 's.');
    },

    _populateListDialog: function (type) {
      var ul = this._listDialog.querySelector('.wsr-list-items');
      ul.innerHTML = '';
      var isForm = type === 'form';
      var formRoles = ['textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'slider', 'spinbutton'];

      for (var i = 0; i < this.nodes.length; i++) {
        var n = this.nodes[i];
        var match = false;
        if (type === 'landmark') match = n.isLandmark;
        else if (isForm) match = formRoles.indexOf(n.role) > -1;
        else match = n.role === type;

        if (match) {
          var li = document.createElement('li');
          li.setAttribute('role', 'option');
          li.setAttribute('data-idx', i);
          li.tabIndex = 0;
          var label = n.name || '(unnamed)';
          if (n.role === 'heading' && n.level) label = 'H' + n.level + ': ' + label;
          else label = this._getRoleLabel(n.role) + ': ' + label;
          li.textContent = label;
          ul.appendChild(li);
        }
      }
      if (!ul.children.length) {
        ul.innerHTML = '<li class="wsr-list-empty">No ' + type + ' elements found.</li>';
      }
    },

    _hideListDialog: function () {
      if (this._listDialog) this._listDialog.style.display = 'none';
    },

    // ── Table cell navigation ──
    _getTableContext: function () {
      if (this.cursor < 0) return null;
      var el = this.nodes[this.cursor].element;
      var td = el.closest('td, th');
      if (!td) return null;
      var tr = td.parentElement;
      var table = td.closest('table');
      if (!table || !tr) return null;
      return { table: table, row: tr, cell: td };
    },

    _navigateTableCell: function (rowDelta, colDelta) {
      var ctx = this._getTableContext();
      if (!ctx) {
        VoiceEngine.speak('Not in a table');
        return;
      }
      var rows = ctx.table.querySelectorAll('tr');
      var rowIdx = Array.prototype.indexOf.call(rows, ctx.row);
      var colIdx = Array.prototype.indexOf.call(ctx.row.children, ctx.cell);

      var newRowIdx = rowIdx + rowDelta;
      var newColIdx = colIdx + colDelta;

      if (newRowIdx < 0 || newRowIdx >= rows.length) { VoiceEngine.speak('Edge of table'); return; }
      var newRow = rows[newRowIdx];
      if (newColIdx < 0 || newColIdx >= newRow.children.length) { VoiceEngine.speak('Edge of table'); return; }

      var newCell = newRow.children[newColIdx];
      // Find this cell in our nodes list
      for (var i = 0; i < this.nodes.length; i++) {
        if (this.nodes[i].element === newCell) {
          this.cursor = i;
          // Announce column header if available
          var header = '';
          var headerRow = ctx.table.querySelector('thead tr, tr:first-child');
          if (headerRow && headerRow.children[newColIdx]) {
            header = (headerRow.children[newColIdx].textContent || '').trim();
          }
          var cellText = (newCell.textContent || '').trim();
          var announcement = header ? header + ': ' + cellText : cellText;
          announcement += ', row ' + (newRowIdx + 1) + ', column ' + (newColIdx + 1);
          VoiceEngine.speak(announcement);
          this._updateStatus(announcement);
          this._positionFocusRing();
          newCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
      VoiceEngine.speak('Cell not accessible');
    },

    // ── Focus ring positioning ──
    _buildFocusRing: function () {
      var ring = document.createElement('div');
      ring.className = 'wsr-focus-ring';
      ring.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ring);
      this._focusRing = ring;
    },

    _positionFocusRing: function () {
      if (this.cursor < 0 || this.cursor >= this.nodes.length) {
        this._focusRing.style.display = 'none';
        return;
      }
      var el = this.nodes[this.cursor].element;
      var rect = el.getBoundingClientRect();
      var ring = this._focusRing;
      ring.style.display = 'block';
      ring.style.top = (rect.top - 3) + 'px';
      ring.style.left = (rect.left - 3) + 'px';
      ring.style.width = (Math.min(rect.width, window.innerWidth - 10) + 6) + 'px';
      ring.style.height = (Math.min(rect.height, window.innerHeight * 0.8) + 6) + 'px';
    },

    _bindScroll: function () {
      var self = this;
      this._scrollHandler = function () {
        if (self._scrollRAF) return;
        self._scrollRAF = requestAnimationFrame(function () {
          self._scrollRAF = null;
          if (self.active) self._positionFocusRing();
        });
      };
      window.addEventListener('scroll', this._scrollHandler, { passive: true });
      window.addEventListener('resize', this._scrollHandler, { passive: true });
    },

    _unbindScroll: function () {
      if (this._scrollHandler) {
        window.removeEventListener('scroll', this._scrollHandler);
        window.removeEventListener('resize', this._scrollHandler);
      }
    },

    // ── Keyboard handling ──
    _keyHandler: null,

    _bindKeys: function () {
      var self = this;
      this._keyHandler = function (e) {
        if (!self.active) return;

        // Ctrl stops speech globally (like real screen readers)
        if (e.key === 'Control') {
          if (VoiceEngine.isSpeaking()) {
            VoiceEngine.stop();
            self._continuousReading = false;
          }
          return;
        }

        // Focus mode — only Escape and Tab pass through
        if (self.mode === 'focus') {
          if (e.key === 'Escape') {
            e.preventDefault();
            self.exitFocusMode();
          }
          // Allow Tab for navigating between form fields
          if (e.key === 'Tab') {
            // Let browser handle Tab, then announce the new field
            setTimeout(function () {
              var focused = document.activeElement;
              if (focused) {
                // Find it in our tree
                for (var i = 0; i < self.nodes.length; i++) {
                  if (self.nodes[i].element === focused) {
                    self.cursor = i;
                    var node = self.nodes[i];
                    node.name = self._getName(node.element, node.tag, node.role);
                    node.states = self._getStates(node.element);
                    var text = self._buildAnnouncement(node);
                    VoiceEngine.speak(text);
                    self._updateStatus('FOCUS MODE — ' + text);
                    self._positionFocusRing();
                    return;
                  }
                }
              }
            }, 50);
          }
          return;
        }

        // Don't intercept when typing in inputs (that aren't part of our toolbar)
        var t = e.target;
        if ((t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) &&
            !t.closest('.wsr-toolbar')) {
          return;
        }

        // Prevent Tab in browse mode (real screen readers don't use Tab in browse mode)
        if (e.key === 'Tab' && !e.altKey) {
          e.preventDefault();
          if (e.shiftKey) self.movePrev();
          else self.moveNext();
          return;
        }

        // Alt+Shift shortcuts for type-based navigation
        if (e.altKey && e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case 'h': e.preventDefault(); e.ctrlKey ? self.moveToPrevOfType('heading') : self.moveToNextOfType('heading'); return;
            case 'k': e.preventDefault(); e.ctrlKey ? self.moveToPrevOfType('link') : self.moveToNextOfType('link'); return;
            case 'd': e.preventDefault(); e.ctrlKey ? self.moveToPrevOfType('landmark') : self.moveToNextOfType('landmark'); return;
            case 'f': e.preventDefault(); e.ctrlKey ? self.moveToPrevOfType('textbox') : self.moveToNextOfType('textbox'); return;
            case 'b': e.preventDefault(); e.ctrlKey ? self.moveToPrevOfType('button') : self.moveToNextOfType('button'); return;
            case 'l': e.preventDefault(); e.ctrlKey ? self.moveToPrevOfType('list') : self.moveToNextOfType('list'); return;
            case 'i': e.preventDefault(); e.ctrlKey ? self.moveToPrevOfType('image') : self.moveToNextOfType('image'); return;
            case 't': e.preventDefault(); e.ctrlKey ? self.moveToPrevOfType('table') : self.moveToNextOfType('table'); return;
            case '1': e.preventDefault(); self.moveToNextOfType('heading', 1); return;
            case '2': e.preventDefault(); self.moveToNextOfType('heading', 2); return;
            case '3': e.preventDefault(); self.moveToNextOfType('heading', 3); return;
            case '4': e.preventDefault(); self.moveToNextOfType('heading', 4); return;
            case '5': e.preventDefault(); self.moveToNextOfType('heading', 5); return;
            case '6': e.preventDefault(); self.moveToNextOfType('heading', 6); return;
            case '/': case '?':
              e.preventDefault();
              self._speakHelp();
              return;
            // Element list dialogs
            case 'e':
              e.preventDefault();
              self.showListDialog('heading');
              return;
            // Read from here (continuous reading)
            case 'c':
              e.preventDefault();
              self.readFromHere();
              return;
          }
        }

        // Ctrl+Alt+Arrow for table navigation
        if (e.ctrlKey && e.altKey) {
          switch (e.key) {
            case 'ArrowDown': e.preventDefault(); self._navigateTableCell(1, 0); return;
            case 'ArrowUp': e.preventDefault(); self._navigateTableCell(-1, 0); return;
            case 'ArrowRight': e.preventDefault(); self._navigateTableCell(0, 1); return;
            case 'ArrowLeft': e.preventDefault(); self._navigateTableCell(0, -1); return;
          }
        }

        // Basic navigation keys
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            self._continuousReading = false;
            self.moveNext();
            break;
          case 'ArrowUp':
            e.preventDefault();
            self._continuousReading = false;
            self.movePrev();
            break;
          case 'Enter':
            e.preventDefault();
            self._continuousReading = false;
            self.activateCurrent();
            break;
          case ' ':
            if (!t.closest('button, a, input, select, textarea')) {
              e.preventDefault();
              if (VoiceEngine.isSpeaking()) {
                if (VoiceEngine.synth.paused) VoiceEngine.resume();
                else VoiceEngine.pause();
              }
            }
            break;
          case 'Escape':
            e.preventDefault();
            if (self._listDialog.style.display !== 'none') {
              self._hideListDialog();
            } else {
              self._continuousReading = false;
              self.deactivate();
              var sw = document.getElementById('a11y-screen-reader');
              if (sw) sw.setAttribute('aria-checked', 'false');
              localStorage.setItem('a11y-screen-reader', 'false');
            }
            break;
        }
      };
      document.addEventListener('keydown', this._keyHandler, true);
    },

    _unbindKeys: function () {
      if (this._keyHandler) {
        document.removeEventListener('keydown', this._keyHandler, true);
        this._keyHandler = null;
      }
    },

    _speakHelp: function () {
      var helpText =
        'Web Screen Reader keyboard shortcuts. ' +
        'Down arrow: next element. Up arrow: previous element. ' +
        'Tab: next element. Shift Tab: previous element. ' +
        'Enter: activate current element. ' +
        'Ctrl: stop speech. Space: pause or resume. ' +
        'Alt Shift H: next heading. Alt Shift K: next link. ' +
        'Alt Shift D: next landmark. Alt Shift F: next form field. ' +
        'Alt Shift B: next button. Alt Shift L: next list. ' +
        'Alt Shift I: next image. Alt Shift T: next table. ' +
        'Alt Shift 1 through 6: heading by level. ' +
        'Ctrl Alt Arrow keys: navigate table cells. ' +
        'Alt Shift C: read from here continuously. ' +
        'Alt Shift E: open element list dialog. ' +
        'Escape: close dialog or deactivate screen reader.';
      VoiceEngine.speak(helpText);
      this._updateStatus('Keyboard help — listening...');
    },

    _updateStatus: function (msg) {
      if (this._statusEl) this._statusEl.textContent = msg;
    },

    _populateVoices: function () {
      var sel = this._toolbar.querySelector('#wsr-voice');
      if (!sel) return;
      sel.innerHTML = '';
      var voices = VoiceEngine.voices;
      for (var i = 0; i < voices.length; i++) {
        var opt = document.createElement('option');
        opt.value = i;
        opt.textContent = voices[i].name.replace(/Microsoft |Google /, '') + ' (' + voices[i].lang + ')';
        if (voices[i] === VoiceEngine.selectedVoice) opt.selected = true;
        sel.appendChild(opt);
      }
    },

    _buildToolbar: function () {
      var div = document.createElement('div');
      div.className = 'wsr-toolbar';
      div.id = 'wsr-toolbar';
      div.setAttribute('role', 'region');
      div.setAttribute('aria-label', 'Web Screen Reader controls');
      div.setAttribute('aria-hidden', 'true');

      div.innerHTML =
        '<div class="wsr-toolbar-row">' +
          '<span class="wsr-mode-badge">Screen Reader</span>' +
          '<div class="wsr-sep" aria-hidden="true"></div>' +
          '<button type="button" id="wsr-prev" aria-label="Previous element">&laquo; Prev</button>' +
          '<button type="button" id="wsr-next" aria-label="Next element">Next &raquo;</button>' +
          '<button type="button" id="wsr-activate" aria-label="Activate current element">Activate</button>' +
          '<button type="button" id="wsr-read" aria-label="Read from here">Read All</button>' +
          '<button type="button" id="wsr-list" aria-label="Show element list">List</button>' +
          '<div class="wsr-sep" aria-hidden="true"></div>' +
          '<label for="wsr-speed">Speed</label>' +
          '<input type="range" id="wsr-speed" min="0.5" max="2" step="0.25" value="1">' +
          '<span class="wsr-speed-val" id="wsr-speed-val">1x</span>' +
          '<div class="wsr-sep" aria-hidden="true"></div>' +
          '<label for="wsr-voice">Voice</label>' +
          '<select id="wsr-voice"></select>' +
          '<button type="button" id="wsr-help" aria-label="Keyboard shortcuts help">?</button>' +
          '<button type="button" class="wsr-close-btn" id="wsr-close" aria-label="Close Screen Reader">Close</button>' +
        '</div>' +
        '<div class="wsr-status" id="wsr-status" aria-live="polite" aria-atomic="true">Ready</div>';

      document.body.appendChild(div);
      this._toolbar = div;
      this._statusEl = div.querySelector('#wsr-status');

      var self = this;
      div.querySelector('#wsr-prev').addEventListener('click', function () { self.movePrev(); });
      div.querySelector('#wsr-next').addEventListener('click', function () { self.moveNext(); });
      div.querySelector('#wsr-activate').addEventListener('click', function () { self.activateCurrent(); });
      div.querySelector('#wsr-read').addEventListener('click', function () { self.readFromHere(); });
      div.querySelector('#wsr-list').addEventListener('click', function () { self.showListDialog('heading'); });
      div.querySelector('#wsr-help').addEventListener('click', function () { self._speakHelp(); });
      div.querySelector('#wsr-close').addEventListener('click', function () {
        self.deactivate();
        var sw = document.getElementById('a11y-screen-reader');
        if (sw) sw.setAttribute('aria-checked', 'false');
        localStorage.setItem('a11y-screen-reader', 'false');
      });
      div.querySelector('#wsr-speed').addEventListener('input', function () {
        VoiceEngine.rate = parseFloat(this.value);
        div.querySelector('#wsr-speed-val').textContent = this.value + 'x';
      });
      div.querySelector('#wsr-voice').addEventListener('change', function () {
        VoiceEngine.selectedVoice = VoiceEngine.voices[parseInt(this.value)] || VoiceEngine.voices[0];
      });
    }
  };

  /* ═══════════════════════════════════════════════
     4. INITIALISE & WIRE UP TOGGLES
     ═══════════════════════════════════════════════ */
  ReadAloud.init();
  WebSR.init();

  function wireToggles() {
    var raSwitch = document.getElementById('a11y-read-aloud');
    var srSwitch = document.getElementById('a11y-screen-reader');

    function handleToggle(switchEl, feature, other, otherSwitch) {
      if (!switchEl) return;

      function doToggle() {
        var isOn = switchEl.getAttribute('aria-checked') === 'true';
        var newState = !isOn;
        switchEl.setAttribute('aria-checked', String(newState));

        if (newState) {
          if (other.active) {
            other.deactivate();
            if (otherSwitch) otherSwitch.setAttribute('aria-checked', 'false');
          }
          feature.activate();
        } else {
          feature.deactivate();
        }
        localStorage.setItem(switchEl.id, String(newState));
      }

      switchEl.addEventListener('click', doToggle);
      switchEl.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          doToggle();
        }
      });

      // Restore from localStorage
      if (localStorage.getItem(switchEl.id) === 'true') {
        switchEl.setAttribute('aria-checked', 'true');
        feature.activate();
      }
    }

    handleToggle(raSwitch, ReadAloud, WebSR, srSwitch);
    handleToggle(srSwitch, WebSR, ReadAloud, raSwitch);
  }

  // Global toggle shortcuts: Alt+Shift+R for screen reader, Alt+Shift+A for read aloud
  document.addEventListener('keydown', function (e) {
    if (!e.altKey || !e.shiftKey) return;
    var t = e.target;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
    var key = e.key.toLowerCase();
    if (key === 'r') {
      e.preventDefault();
      var sr = document.getElementById('a11y-screen-reader');
      if (sr) sr.click();
    } else if (key === 'a') {
      e.preventDefault();
      var ra = document.getElementById('a11y-read-aloud');
      if (ra) ra.click();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireToggles);
  } else {
    wireToggles();
  }

  /* ═══════════════════════════════════════════════
     5. TRANSLATION HOOK — rebuild tree & switch voice
     ═══════════════════════════════════════════════ */
  // Detect translation by monitoring localStorage changes and DOM mutations
  // This avoids wrapping srAnnounce which could break the original live region
  var _lastTranslateLang = localStorage.getItem('translateLang') || '';

  function checkTranslation() {
    var currentLang = localStorage.getItem('translateLang') || '';
    if (currentLang === _lastTranslateLang) return;
    _lastTranslateLang = currentLang;

    // Switch voice language
    var newLang = 'en';
    if (currentLang && langMap[currentLang]) {
      newLang = langMap[currentLang];
    }
    VoiceEngine.setLanguage(newLang);

    // Rebuild trees after DOM settles
    setTimeout(function () {
      WebSR.rebuildTree();
      ReadAloud.rebuildContent();
      if (WebSR.active) {
        WebSR._populateVoices();
        VoiceEngine.speak('Page language changed. Content refreshed.');
      }
      if (ReadAloud.active) ReadAloud._populateVoices();
    }, 600);
  }

  // Poll localStorage for translation changes (storage event only fires cross-tab)
  setInterval(checkTranslation, 1000);

  // Expose for external integration
  window._wsrReadAloud = ReadAloud;
  window._wsrScreenReader = WebSR;
  window._wsrVoiceEngine = VoiceEngine;

})();
