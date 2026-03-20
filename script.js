// Mobile navigation toggle
(function () {
  'use strict';

  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('nav-menu');

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      menu.classList.toggle('active');
    });

    // Close menu when a link is clicked
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        toggle.setAttribute('aria-expanded', 'false');
        menu.classList.remove('active');
      });
    });

    // Close menu on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('active')) {
        toggle.setAttribute('aria-expanded', 'false');
        menu.classList.remove('active');
        toggle.focus();
      }
    });
  }

  // Contact form validation
  var form = document.querySelector('.contact-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var valid = true;

      // Clear previous errors
      form.querySelectorAll('.form-error').forEach(function (el) {
        el.remove();
      });
      form.querySelectorAll('[aria-invalid]').forEach(function (el) {
        el.removeAttribute('aria-invalid');
        el.removeAttribute('aria-describedby');
      });

      // Validate required fields
      var requiredFields = form.querySelectorAll('[required]');
      requiredFields.forEach(function (field) {
        var value = field.value.trim();
        if (!value) {
          valid = false;
          showError(field, 'This field is required.');
        } else if (field.type === 'email' && !isValidEmail(value)) {
          valid = false;
          showError(field, 'Please enter a valid email address.');
        }
      });

      if (valid) {
        // Disable submit button to prevent double submission
        var submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Sending...';
        }

        // Send via EmailJS
        var templateParams = {
          from_name: document.getElementById('name').value.trim(),
          from_email: document.getElementById('email').value.trim(),
          subject: document.getElementById('subject').value.trim() || 'No subject',
          message: document.getElementById('message').value.trim()
        };

        if (typeof emailjs !== 'undefined') {
          emailjs.send('service_dvp0x0o', 'template_qh6mgwh', templateParams)
            .then(function () {
              var successMsg = document.createElement('div');
              successMsg.setAttribute('role', 'status');
              successMsg.setAttribute('aria-live', 'polite');
              successMsg.className = 'form-success';
              successMsg.style.cssText = 'background:#d4edda;color:#155724;padding:1rem;border-radius:8px;margin-top:1rem;font-weight:500;';
              successMsg.textContent = 'Thank you for your message! I will get back to you soon.';
              form.appendChild(successMsg);
              form.reset();
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Message';
              }
              setTimeout(function () {
                if (successMsg.parentNode) successMsg.parentNode.removeChild(successMsg);
              }, 5000);
            })
            .catch(function (err) {
              var errorMsg = document.createElement('div');
              errorMsg.setAttribute('role', 'alert');
              errorMsg.className = 'form-error';
              errorMsg.style.cssText = 'background:#f8d7da;color:#721c24;padding:1rem;border-radius:8px;margin-top:1rem;font-weight:500;';
              var errText = (err && err.text) ? err.text : (err && err.message) ? err.message : String(err);
              errorMsg.textContent = 'Error: ' + errText + '. Please email me directly at akhilesh.malani@gmail.com';
              form.appendChild(errorMsg);
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Message';
              }
              setTimeout(function () {
                if (errorMsg.parentNode) errorMsg.parentNode.removeChild(errorMsg);
              }, 15000);
            });
        } else {
          // EmailJS not loaded fallback
          window.location.href = 'mailto:akhilesh.malani@gmail.com?subject=' +
            encodeURIComponent(templateParams.subject) +
            '&body=' + encodeURIComponent(templateParams.message);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Message';
          }
        }
      }
    });
  }

  function showError(field, message) {
    var errorId = field.id + '-error';
    var errorEl = document.createElement('div');
    errorEl.id = errorId;
    errorEl.className = 'form-error';
    errorEl.setAttribute('role', 'alert');
    errorEl.textContent = message;
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', errorId);
    field.parentNode.appendChild(errorEl);
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Active nav highlight on scroll
  var sections = document.querySelectorAll('.section, .hero');
  var navLinks = document.querySelectorAll('.nav-links a');

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.getAttribute('id');
          navLinks.forEach(function (link) {
            if (link.getAttribute('href') === '#' + id) {
              link.style.color = 'var(--color-primary)';
            } else {
              link.style.color = '';
            }
          });
        }
      });
    }, { threshold: 0.3, rootMargin: '-80px 0px 0px 0px' });

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }
})();

// ============================================================
// Library Authentication & Access Control (Firebase)
// ============================================================
(function () {
  'use strict';

  // DOM elements
  var guestView = document.getElementById('library-guest');
  var pendingView = document.getElementById('library-pending');
  var contentView = document.getElementById('library-content');
  var authModal = document.getElementById('auth-modal');
  var loginView = document.getElementById('auth-login');
  var registerView = document.getElementById('auth-register');
  var loginForm = document.getElementById('login-form');
  var registerForm = document.getElementById('register-form');
  var loginError = document.getElementById('login-error');
  var registerError = document.getElementById('register-error');
  var userNameEl = document.getElementById('library-user-name');

  // Check if Firebase is configured
  function isFirebaseConfigured() {
    return auth !== null && db !== null;
  }

  // Modal management
  var lastFocusedElement = null;

  function openModal(showRegister) {
    lastFocusedElement = document.activeElement;
    authModal.hidden = false;
    document.body.style.overflow = 'hidden';

    if (showRegister) {
      loginView.hidden = true;
      registerView.hidden = false;
      authModal.setAttribute('aria-labelledby', 'auth-modal-title-register');
      var firstInput = document.getElementById('reg-name');
    } else {
      loginView.hidden = false;
      registerView.hidden = true;
      authModal.setAttribute('aria-labelledby', 'auth-modal-title');
      var firstInput = document.getElementById('login-email');
    }

    clearErrors();
    setTimeout(function () { firstInput.focus(); }, 100);
  }

  function closeModal() {
    authModal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocusedElement) lastFocusedElement.focus();
  }

  function clearErrors() {
    loginError.hidden = true;
    loginError.textContent = '';
    registerError.hidden = true;
    registerError.textContent = '';
  }

  // Button event listeners
  var btnLoginOpen = document.getElementById('btn-login-open');
  var btnRegisterOpen = document.getElementById('btn-register-open');
  var btnModalClose = document.getElementById('btn-modal-close');
  var switchToRegister = document.getElementById('switch-to-register');
  var switchToLogin = document.getElementById('switch-to-login');
  var btnSignout = document.getElementById('btn-signout');
  var btnSignoutPending = document.getElementById('btn-signout-pending');

  if (btnLoginOpen) btnLoginOpen.addEventListener('click', function () { openModal(false); });
  if (btnRegisterOpen) btnRegisterOpen.addEventListener('click', function () { openModal(true); });
  if (btnModalClose) btnModalClose.addEventListener('click', closeModal);
  if (switchToRegister) switchToRegister.addEventListener('click', function () { openModal(true); });
  if (switchToLogin) switchToLogin.addEventListener('click', function () { openModal(false); });

  // Close modal on overlay click or Escape
  if (authModal) {
    authModal.addEventListener('click', function (e) {
      if (e.target === authModal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !authModal.hidden) closeModal();
    });
  }

  // Trap focus inside modal
  if (authModal) {
    authModal.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusable = authModal.querySelectorAll('input:not([hidden]), textarea:not([hidden]), button:not([hidden]), [tabindex]:not([tabindex="-1"])');
      var visible = Array.prototype.filter.call(focusable, function (el) {
        return el.offsetParent !== null && !el.closest('[hidden]');
      });
      if (visible.length === 0) return;
      var first = visible[0];
      var last = visible[visible.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  // Flag to prevent auth state listener from interfering during registration
  var isRegistering = false;

  // Sign out
  function handleSignOut() {
    if (isFirebaseConfigured()) {
      auth.signOut();
    }
    showView('guest');
  }

  if (btnSignout) btnSignout.addEventListener('click', handleSignOut);
  if (btnSignoutPending) btnSignoutPending.addEventListener('click', handleSignOut);

  // Show the right view
  function showView(view) {
    guestView.hidden = view !== 'guest';
    pendingView.hidden = view !== 'pending';
    contentView.hidden = view !== 'content';
  }

  // Login form
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors();

      var email = document.getElementById('login-email').value.trim();
      var password = document.getElementById('login-password').value;

      if (!email || !password) {
        loginError.textContent = 'Please fill in all fields.';
        loginError.hidden = false;
        return;
      }

      if (!isFirebaseConfigured()) {
        loginError.textContent = 'Firebase is not configured yet. See SETUP-GUIDE.md for instructions.';
        loginError.hidden = false;
        return;
      }

      auth.signInWithEmailAndPassword(email, password)
        .then(function () {
          closeModal();
        })
        .catch(function (error) {
          var msg = 'Sign in failed. Please check your credentials.';
          if (error.code === 'auth/user-not-found') msg = 'No account found with this email.';
          if (error.code === 'auth/wrong-password') msg = 'Incorrect password.';
          if (error.code === 'auth/invalid-credential') msg = 'Invalid credentials. Please try again.';
          loginError.textContent = msg;
          loginError.hidden = false;
        });
    });
  }

  // Register form
  if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors();

      var name = document.getElementById('reg-name').value.trim();
      var email = document.getElementById('reg-email').value.trim();
      var password = document.getElementById('reg-password').value;
      var reason = document.getElementById('reg-reason').value.trim();

      if (!name || !email || !password || !reason) {
        registerError.textContent = 'Please fill in all fields.';
        registerError.hidden = false;
        return;
      }

      if (password.length < 8) {
        registerError.textContent = 'Password must be at least 8 characters.';
        registerError.hidden = false;
        return;
      }

      if (!isFirebaseConfigured()) {
        registerError.textContent = 'Firebase is not configured yet. See SETUP-GUIDE.md for instructions.';
        registerError.hidden = false;
        return;
      }

      isRegistering = true;
      var createdUser = null;

      auth.createUserWithEmailAndPassword(email, password)
        .then(function (cred) {
          createdUser = cred.user;
          return cred.user.updateProfile({ displayName: name });
        })
        .then(function () {
          return db.collection('members').doc(createdUser.uid).set({
            name: name,
            email: email,
            reason: reason,
            approved: false,
            requestedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        })
        .then(function () {
          // Send email notification to admin via EmailJS
          if (typeof emailjs !== 'undefined') {
            emailjs.send('service_dvp0x0o', 'template_j0ss7rf', {
              from_name: name,
              from_email: email,
              reason: reason
            }).catch(function () {
              // Silent fail - registration still succeeds
            });
          }
          isRegistering = false;
          closeModal();
          showView('pending');
        })
        .catch(function (error) {
          isRegistering = false;
          var msg = 'Registration failed. Please try again.';
          if (error.code === 'auth/email-already-in-use') msg = 'An account with this email already exists.';
          if (error.code === 'auth/weak-password') msg = 'Password is too weak. Use at least 8 characters.';
          if (error.code === 'auth/invalid-email') msg = 'Please enter a valid email address.';
          if (error.code === 'auth/network-request-failed') msg = 'Network error. Please check your internet connection.';
          if (error.code === 'permission-denied' || error.code === 'PERMISSION_DENIED') msg = 'Account created but profile save failed. Please sign in to retry.';
          registerError.textContent = msg;
          registerError.hidden = false;
        });
    });
  }

  // Auth state listener
  if (isFirebaseConfigured()) {
    auth.onAuthStateChanged(function (user) {
      if (!user) {
        showView('guest');
        return;
      }

      // Skip if registration is in progress (let the registration handler manage the view)
      if (isRegistering) return;

      // Check approval status in Firestore (with retry for new registrations)
      function checkApproval(retries) {
        db.collection('members').doc(user.uid).get()
          .then(function (doc) {
            if (doc.exists && doc.data().approved) {
              userNameEl.textContent = 'Welcome, ' + (user.displayName || user.email);
              showView('content');
            } else if (doc.exists && !doc.data().approved) {
              showView('pending');
            } else if (retries > 0) {
              // Document might not exist yet if just registered — retry after a short delay
              setTimeout(function () { checkApproval(retries - 1); }, 1500);
            } else {
              showView('pending');
            }
          })
          .catch(function () {
            showView('pending');
          });
      }

      checkApproval(2);
    });
  }

  // Library filter buttons
  var filterBtns = document.querySelectorAll('.filter-btn');
  var libraryCards = document.querySelectorAll('.library-card');

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var filter = btn.getAttribute('data-filter');

      filterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');

      libraryCards.forEach(function (card) {
        if (filter === 'all' || card.getAttribute('data-category') === filter) {
          card.hidden = false;
        } else {
          card.hidden = true;
        }
      });

      // Announce filter change for screen readers
      var count = document.querySelectorAll('.library-card:not([hidden])').length;
      var announcement = document.getElementById('filter-announcement');
      if (!announcement) {
        announcement = document.createElement('div');
        announcement.id = 'filter-announcement';
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.className = 'sr-only';
        var librarySection = document.getElementById('library');
        (librarySection || document.body).appendChild(announcement);
      }
      announcement.textContent = count + ' resource' + (count !== 1 ? 's' : '') + ' shown.';
    });
  });
})();

// ===========================
// Dark Mode Toggle
// ===========================
(function () {
  'use strict';

  var toggle = document.getElementById('theme-toggle');
  var sunIcon = document.getElementById('theme-icon-sun');
  var moonIcon = document.getElementById('theme-icon-moon');
  var html = document.documentElement;

  function setTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
      toggle.setAttribute('aria-label', 'Switch to light mode');
    } else {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
      toggle.setAttribute('aria-label', 'Switch to dark mode');
    }
  }

  // Check saved preference, then system preference
  var saved = localStorage.getItem('theme');
  if (saved) {
    setTheme(saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    setTheme('dark');
  }

  // Listen for system preference changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      var current = html.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }
})();

// ===========================
// Scroll Animations (Intersection Observer)
// ===========================
(function () {
  'use strict';

  // Respect reduced motion preference
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right, .stagger-children').forEach(function (el) {
      el.classList.add('visible');
    });
    return;
  }

  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right, .stagger-children').forEach(function (el) {
      el.classList.add('visible');
    });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right, .stagger-children').forEach(function (el) {
    observer.observe(el);
  });
})();

// ===========================
// Back to Top Button
// ===========================
(function () {
  'use strict';

  var btn = document.getElementById('back-to-top');
  if (!btn) return;

  window.addEventListener('scroll', function () {
    if (window.scrollY > 400) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  });

  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Move focus to skip link or top of page for accessibility
    var skipLink = document.querySelector('.skip-link');
    if (skipLink) {
      skipLink.focus();
    }
  });
})();

// ===========================
// Accessibility Preferences Panel
// ===========================
(function () {
  'use strict';

  var html = document.documentElement;
  var toggleBtn = document.getElementById('a11y-toggle');
  var panel = document.getElementById('a11y-panel');
  var backdrop = document.getElementById('a11y-backdrop');
  var closeBtn = document.getElementById('a11y-panel-close');
  var resetBtn = document.getElementById('a11y-reset');

  if (!panel || !toggleBtn) return;

  // Size buttons
  var sizeBtns = panel.querySelectorAll('.a11y-size-btn');
  var contrastSwitch = document.getElementById('a11y-contrast');
  var dyslexiaSwitch = document.getElementById('a11y-dyslexia');
  var motionSwitch = document.getElementById('a11y-motion');

  // --- Panel open/close ---
  function openPanel() {
    panel.classList.add('open');
    panel.removeAttribute('hidden');
    if (backdrop) backdrop.classList.add('open');
    closeBtn.focus();
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    panel.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
    toggleBtn.focus();
    // Wait for transition, then hide
    setTimeout(function () {
      if (!panel.classList.contains('open')) {
        panel.setAttribute('hidden', '');
      }
    }, 300);
  }

  toggleBtn.addEventListener('click', function () {
    if (panel.classList.contains('open')) {
      closePanel();
    } else {
      openPanel();
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  if (backdrop) backdrop.addEventListener('click', closePanel);

  // Close on Escape
  panel.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closePanel();
    }
    // Focus trap
    if (e.key === 'Tab') {
      var focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // --- Text Size ---
  function applyTextSize(size) {
    if (size && size !== 'normal') {
      html.setAttribute('data-text-size', size);
    } else {
      html.removeAttribute('data-text-size');
    }
    sizeBtns.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-size') === (size || 'normal') ? 'true' : 'false');
    });
  }

  sizeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var size = btn.getAttribute('data-size');
      localStorage.setItem('a11y-text-size', size);
      applyTextSize(size);
    });
  });

  // --- Toggle Switches ---
  function applyToggle(switchEl, attrName, key) {
    if (!switchEl) return;
    switchEl.addEventListener('click', function () {
      var isOn = switchEl.getAttribute('aria-checked') === 'true';
      var newState = !isOn;
      switchEl.setAttribute('aria-checked', String(newState));
      if (newState) {
        html.setAttribute(attrName, 'true');
      } else {
        html.removeAttribute(attrName);
      }
      localStorage.setItem(key, String(newState));
    });
  }

  applyToggle(contrastSwitch, 'data-high-contrast', 'a11y-high-contrast');
  applyToggle(dyslexiaSwitch, 'data-dyslexia-font', 'a11y-dyslexia-font');
  applyToggle(motionSwitch, 'data-reduce-motion', 'a11y-reduce-motion');

  // --- Restore from localStorage ---
  var savedSize = localStorage.getItem('a11y-text-size') || 'normal';
  applyTextSize(savedSize);

  if (localStorage.getItem('a11y-high-contrast') === 'true' && contrastSwitch) {
    contrastSwitch.setAttribute('aria-checked', 'true');
  }
  if (localStorage.getItem('a11y-dyslexia-font') === 'true' && dyslexiaSwitch) {
    dyslexiaSwitch.setAttribute('aria-checked', 'true');
  }
  if (localStorage.getItem('a11y-reduce-motion') === 'true' && motionSwitch) {
    motionSwitch.setAttribute('aria-checked', 'true');
  }

  // --- Reset ---
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      localStorage.removeItem('a11y-text-size');
      localStorage.removeItem('a11y-high-contrast');
      localStorage.removeItem('a11y-dyslexia-font');
      localStorage.removeItem('a11y-reduce-motion');
      html.removeAttribute('data-text-size');
      html.removeAttribute('data-high-contrast');
      html.removeAttribute('data-dyslexia-font');
      html.removeAttribute('data-reduce-motion');
      applyTextSize('normal');
      if (contrastSwitch) contrastSwitch.setAttribute('aria-checked', 'false');
      if (dyslexiaSwitch) dyslexiaSwitch.setAttribute('aria-checked', 'false');
      if (motionSwitch) motionSwitch.setAttribute('aria-checked', 'false');
    });
  }
})();

// ===========================
// Keyboard Shortcuts
// ===========================
(function () {
  'use strict';

  // Create help dialog dynamically
  var helpHTML = '<div class="kbd-help-overlay" id="kbd-help" role="dialog" aria-labelledby="kbd-help-title" aria-modal="true">' +
    '<div class="kbd-help-dialog">' +
    '<h2 id="kbd-help-title">Keyboard Shortcuts</h2>' +
    '<ul class="kbd-help-list">' +
    '<li><span>Go to Home</span> <kbd>Alt + 1</kbd></li>' +
    '<li><span>Go to Blog</span> <kbd>Alt + 2</kbd></li>' +
    '<li><span>Go to Contact</span> <kbd>Alt + 3</kbd></li>' +
    '<li><span>Accessibility Settings</span> <kbd>Alt + 0</kbd></li>' +
    '<li><span>Show this help</span> <kbd>?</kbd></li>' +
    '</ul>' +
    '<button type="button" class="kbd-help-close" id="kbd-help-close">Close <kbd>Esc</kbd></button>' +
    '</div></div>';

  document.body.insertAdjacentHTML('beforeend', helpHTML);

  var helpOverlay = document.getElementById('kbd-help');
  var helpClose = document.getElementById('kbd-help-close');

  function showHelp() {
    if (helpOverlay) {
      helpOverlay.classList.add('open');
      helpClose.focus();
    }
  }

  function hideHelp() {
    if (helpOverlay) {
      helpOverlay.classList.remove('open');
    }
  }

  if (helpClose) helpClose.addEventListener('click', hideHelp);
  if (helpOverlay) helpOverlay.addEventListener('click', function (e) {
    if (e.target === helpOverlay) hideHelp();
  });

  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName;
    var isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
    var isBlog = window.location.pathname.indexOf('/blog/') !== -1;
    var prefix = isBlog ? '../' : '';

    // Alt+1: Home
    if (e.altKey && e.key === '1') {
      e.preventDefault();
      window.location.href = prefix + 'index.html';
    }

    // Alt+2: Blog
    if (e.altKey && e.key === '2') {
      e.preventDefault();
      window.location.href = prefix + 'index.html#blog';
    }

    // Alt+3: Contact
    if (e.altKey && e.key === '3') {
      e.preventDefault();
      window.location.href = prefix + 'index.html#contact';
    }

    // Alt+0: Accessibility Settings
    if (e.altKey && e.key === '0') {
      e.preventDefault();
      var a11yToggle = document.getElementById('a11y-toggle');
      if (a11yToggle) a11yToggle.click();
    }

    // ?: Show help (not when typing)
    if (e.key === '?' && !isInput && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      showHelp();
    }

    // Escape: Close help
    if (e.key === 'Escape' && helpOverlay && helpOverlay.classList.contains('open')) {
      hideHelp();
    }
  });
})();

// ===========================
// Reading Time Calculator (for blog pages)
// ===========================
(function () {
  'use strict';
  var content = document.querySelector('.blog-post-content');
  var meta = document.querySelector('.blog-meta');
  if (content && meta && !meta.querySelector('.reading-time')) {
    var words = content.textContent.trim().split(/\s+/).length;
    var minutes = Math.max(1, Math.ceil(words / 200));
    var span = document.createElement('span');
    span.className = 'reading-time';
    span.textContent = ' \u00B7 ' + minutes + ' min read';
    meta.appendChild(span);
  }
})();
