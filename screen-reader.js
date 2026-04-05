/* ═══════════════════════════════════════════════════════════════════
   Web Screen Reader & Read Aloud
   Zero-dependency, browser-native TTS (speechSynthesis API)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Guard: speechSynthesis required ──
  if (!window.speechSynthesis) return;

  /* ═══════════════════════════════════════════════
     1. SHARED VOICE ENGINE
     ═══════════════════════════════════════════════ */
  var VoiceEngine = {
    synth: window.speechSynthesis,
    voices: [],
    selectedVoice: null,
    rate: 1,
    _utterance: null,
    _onEndCb: null,
    _chunkQueue: [],
    _paused: false,

    init: function () {
      var self = this;
      function loadVoices() {
        self.voices = self.synth.getVoices().filter(function (v) {
          return v.lang.indexOf('en') === 0;
        });
        if (self.voices.length && !self.selectedVoice) {
          // prefer a natural-sounding voice
          var preferred = self.voices.filter(function (v) {
            return v.name.indexOf('Google') > -1 || v.name.indexOf('Microsoft') > -1 || v.name.indexOf('Samantha') > -1;
          });
          self.selectedVoice = preferred.length ? preferred[0] : self.voices[0];
        }
      }
      loadVoices();
      if (self.synth.onvoiceschanged !== undefined) {
        self.synth.onvoiceschanged = loadVoices;
      }
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
        '<div class="wsr-status" id="ra-status" aria-live="polite">Ready</div>';

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
        // already playing: onEnd will advance
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
     3. WEB SCREEN READER
     ═══════════════════════════════════════════════ */
  var WebSR = {
    active: false,
    nodes: [],       // flat accessible node list
    cursor: -1,      // current position
    mode: 'browse',  // 'browse' | 'focus'

    _toolbar: null,
    _statusEl: null,
    _focusRing: null,
    _scrollRAF: null,

    init: function () {
      this._buildToolbar();
      this._buildFocusRing();
    },

    activate: function () {
      this.active = true;
      this.mode = 'browse';
      this.nodes = this._buildTree();
      this.cursor = -1;
      document.body.classList.add('wsr-toolbar-active');
      this._toolbar.setAttribute('aria-hidden', 'false');
      this._populateVoices();
      this._bindKeys();
      this._bindScroll();
      this._updateStatus('Screen Reader active. ' + this.nodes.length + ' elements found. Use Arrow keys to navigate. Press Alt+Shift+? for help.');
      announce('Web Screen Reader activated. ' + this.nodes.length + ' elements. Down arrow to start navigating.');
      VoiceEngine.speak('Web Screen Reader activated. Use down arrow to navigate. Alt Shift question mark for help.');
    },

    deactivate: function () {
      this.active = false;
      VoiceEngine.stop();
      this._toolbar.setAttribute('aria-hidden', 'true');
      this._focusRing.style.display = 'none';
      document.body.classList.remove('wsr-toolbar-active');
      this._unbindKeys();
      this._unbindScroll();
      announce('Web Screen Reader deactivated');
    },

    // ── Tree builder ──
    _buildTree: function () {
      var nodes = [];
      var root = document.getElementById('main-content') || document.querySelector('main') || document.body;

      // Also include header nav
      var header = document.querySelector('header[role="banner"]');

      var scanRoots = header ? [header, root] : [root];
      var self = this;

      for (var r = 0; r < scanRoots.length; r++) {
        self._walkDOM(scanRoots[r], nodes);
      }
      return nodes;
    },

    _walkDOM: function (root, nodes) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (node) {
          // Skip our own UI
          if (node.closest('.wsr-toolbar, .wsr-focus-ring')) return NodeFilter.FILTER_REJECT;
          // Skip hidden
          if (node.hidden || node.getAttribute('aria-hidden') === 'true') return NodeFilter.FILTER_REJECT;
          if (node.offsetParent === null && node.tagName !== 'HTML' && node.tagName !== 'BODY' &&
              window.getComputedStyle(node).position !== 'fixed') return NodeFilter.FILTER_REJECT;
          // Skip script/style
          var tag = node.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'BR') return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      var el;
      while ((el = walker.nextNode())) {
        var info = this._getNodeInfo(el);
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
        'LABEL': 'label', 'FIELDSET': 'group', 'LEGEND': 'legend'
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
        // Get label text excluding the control itself
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
          role === 'caption' || role === 'legend') {
        var tc = (el.textContent || '').trim();
        // Truncate long text for announcement
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
        'heading': 'heading',
        'link': 'link',
        'button': 'button',
        'image': 'image',
        'textbox': 'edit text',
        'searchbox': 'search edit',
        'checkbox': 'check box',
        'radio': 'radio button',
        'combobox': 'combo box',
        'slider': 'slider',
        'spinbutton': 'spin button',
        'navigation': 'navigation',
        'main': 'main',
        'complementary': 'complementary',
        'contentinfo': 'content info',
        'banner': 'banner',
        'region': 'region',
        'form': 'form',
        'search': 'search',
        'list': 'list',
        'listitem': 'list item',
        'table': 'table',
        'paragraph': 'text',
        'blockquote': 'block quote',
        'figure': 'figure',
        'caption': 'caption',
        'term': 'term',
        'definition': 'definition',
        'group': 'group',
        'legend': 'legend',
        'switch': 'switch',
        'tab': 'tab',
        'tabpanel': 'tab panel',
        'dialog': 'dialog',
        'alert': 'alert',
        'generic': 'text',
        'label': 'label'
      };
      return labels[role] || role;
    },

    // ── Navigation ──
    moveNext: function () {
      if (this.cursor < this.nodes.length - 1) {
        this.cursor++;
        this._announceAndFocus();
      } else {
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

    activateCurrent: function () {
      if (this.cursor < 0 || this.cursor >= this.nodes.length) return;
      var el = this.nodes[this.cursor].element;
      var role = this.nodes[this.cursor].role;

      if (role === 'link' || role === 'button') {
        el.click();
        VoiceEngine.speak('Activated');
      } else if (role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'checkbox' || role === 'radio') {
        this.mode = 'focus';
        el.focus();
        VoiceEngine.speak('Focus mode. Type to edit. Press Escape to return to browse mode.');
        this._updateStatus('FOCUS MODE — Escape to exit');
      } else {
        el.click();
      }
    },

    exitFocusMode: function () {
      this.mode = 'browse';
      VoiceEngine.speak('Browse mode');
      this._updateStatus('Browse mode');
      this._positionFocusRing();
    },

    _announceAndFocus: function () {
      var node = this.nodes[this.cursor];
      if (!node) return;
      var text = this._buildAnnouncement(node);
      VoiceEngine.speak(text);
      this._updateStatus(text);
      this._positionFocusRing();
      node.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      ring.style.width = (rect.width + 6) + 'px';
      ring.style.height = (rect.height + 6) + 'px';
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

        // Don't intercept when in focus mode (except Escape)
        if (self.mode === 'focus') {
          if (e.key === 'Escape') {
            e.preventDefault();
            self.exitFocusMode();
          }
          return;
        }

        // Don't intercept when typing in inputs (that aren't part of our toolbar)
        var t = e.target;
        if ((t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) &&
            !t.closest('.wsr-toolbar')) {
          return;
        }

        // Alt+Shift shortcuts for type-based navigation
        if (e.altKey && e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case 'h': e.preventDefault(); self.moveToNextOfType('heading'); return;
            case 'k': e.preventDefault(); self.moveToNextOfType('link'); return;
            case 'd': e.preventDefault(); self.moveToNextOfType('landmark'); return;
            case 'f': e.preventDefault(); self.moveToNextOfType('textbox'); return;
            case 'b': e.preventDefault(); self.moveToNextOfType('button'); return;
            case 'l': e.preventDefault(); self.moveToNextOfType('list'); return;
            case 'i': e.preventDefault(); self.moveToNextOfType('image'); return;
            case 't': e.preventDefault(); self.moveToNextOfType('table'); return;
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
          }
        }

        // Arrow-key navigation
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            self.moveNext();
            break;
          case 'ArrowUp':
            e.preventDefault();
            self.movePrev();
            break;
          case 'Enter':
            e.preventDefault();
            self.activateCurrent();
            break;
          case ' ':
            // Space to pause/resume speech
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
            self.deactivate();
            var sw = document.getElementById('a11y-screen-reader');
            if (sw) sw.setAttribute('aria-checked', 'false');
            localStorage.setItem('a11y-screen-reader', 'false');
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
        'Enter: activate current element. ' +
        'Alt Shift H: next heading. Alt Shift K: next link. ' +
        'Alt Shift D: next landmark. Alt Shift F: next form field. ' +
        'Alt Shift B: next button. Alt Shift L: next list. ' +
        'Alt Shift I: next image. Alt Shift T: next table. ' +
        'Alt Shift 1 through 6: heading by level. ' +
        'Space: pause or resume speech. Escape: deactivate screen reader.';
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
        '<div class="wsr-status" id="wsr-status" aria-live="polite">Ready</div>';

      document.body.appendChild(div);
      this._toolbar = div;
      this._statusEl = div.querySelector('#wsr-status');

      var self = this;
      div.querySelector('#wsr-prev').addEventListener('click', function () { self.movePrev(); });
      div.querySelector('#wsr-next').addEventListener('click', function () { self.moveNext(); });
      div.querySelector('#wsr-activate').addEventListener('click', function () { self.activateCurrent(); });
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

  // Wait for DOM (the a11y panel toggles are added to index.html)
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
          // Deactivate the other feature first
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

  // Global toggle shortcut: Alt+Shift+R for screen reader
  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'r') {
      var t = e.target;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      e.preventDefault();
      var sw = document.getElementById('a11y-screen-reader');
      if (sw) sw.click();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireToggles);
  } else {
    wireToggles();
  }

  // Expose for external reset integration
  window._wsrReadAloud = ReadAloud;
  window._wsrScreenReader = WebSR;

})();
