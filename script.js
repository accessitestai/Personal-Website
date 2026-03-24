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
// Screen Reader Live Announcer
// ===========================
(function () {
  'use strict';

  // Create a single live region for all announcements
  var announcer = document.createElement('div');
  announcer.id = 'sr-announcer';
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  document.body.appendChild(announcer);

  // Also create an assertive announcer for important changes
  var assertiveAnnouncer = document.createElement('div');
  assertiveAnnouncer.id = 'sr-announcer-assertive';
  assertiveAnnouncer.setAttribute('role', 'alert');
  assertiveAnnouncer.setAttribute('aria-live', 'assertive');
  assertiveAnnouncer.setAttribute('aria-atomic', 'true');
  assertiveAnnouncer.className = 'sr-only';
  document.body.appendChild(assertiveAnnouncer);

  // Expose globally for other scripts to use
  window.srAnnounce = function (message, isAssertive) {
    var el = isAssertive ? assertiveAnnouncer : announcer;
    // Clear first, then set after a brief delay so screen readers detect the change
    el.textContent = '';
    setTimeout(function () {
      el.textContent = message;
    }, 100);
  };
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
  var panelTitle = document.getElementById('a11y-panel-title');

  if (!panel || !toggleBtn) return;

  // Size buttons
  var sizeBtns = panel.querySelectorAll('.a11y-size-btn');
  var contrastSwitch = document.getElementById('a11y-contrast');
  var dyslexiaSwitch = document.getElementById('a11y-dyslexia');
  var motionSwitch = document.getElementById('a11y-motion');

  // Size labels for announcements
  var sizeLabels = { normal: 'Normal', large: 'Large', larger: 'Larger' };

  // --- Panel open/close ---
  function openPanel() {
    panel.classList.add('open');
    panel.removeAttribute('hidden');
    if (backdrop) backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Focus the panel title for JAWS to announce the dialog
    if (panelTitle) {
      panelTitle.setAttribute('tabindex', '-1');
      panelTitle.focus();
    }
  }

  function closePanel() {
    panel.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
    toggleBtn.focus();
    if (window.srAnnounce) window.srAnnounce('Accessibility settings closed');
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
      e.stopPropagation();
      closePanel();
    }
    // Focus trap
    if (e.key === 'Tab') {
      var focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      var focusableArray = Array.prototype.slice.call(focusable);
      var first = focusableArray[0];
      var last = focusableArray[focusableArray.length - 1];
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
  function applyTextSize(size, announce) {
    if (size && size !== 'normal') {
      html.setAttribute('data-text-size', size);
    } else {
      html.removeAttribute('data-text-size');
    }
    sizeBtns.forEach(function (btn) {
      var isSelected = btn.getAttribute('data-size') === (size || 'normal');
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
    if (announce && window.srAnnounce) {
      window.srAnnounce('Text size changed to ' + sizeLabels[size || 'normal']);
    }
  }

  sizeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var size = btn.getAttribute('data-size');
      localStorage.setItem('a11y-text-size', size);
      applyTextSize(size, true);
    });
    // Also support Space key for toggle buttons
    btn.addEventListener('keydown', function (e) {
      if (e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });

  // --- Toggle Switches ---
  function applyToggle(switchEl, attrName, key, label) {
    if (!switchEl) return;

    function doToggle() {
      var isOn = switchEl.getAttribute('aria-checked') === 'true';
      var newState = !isOn;
      switchEl.setAttribute('aria-checked', String(newState));
      if (newState) {
        html.setAttribute(attrName, 'true');
      } else {
        html.removeAttribute(attrName);
      }
      localStorage.setItem(key, String(newState));
      // Announce the change to screen readers
      if (window.srAnnounce) {
        window.srAnnounce(label + (newState ? ' enabled' : ' disabled'));
      }
    }

    switchEl.addEventListener('click', doToggle);

    // Support Space and Enter keys for role="switch"
    switchEl.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        doToggle();
      }
    });
  }

  applyToggle(contrastSwitch, 'data-high-contrast', 'a11y-high-contrast', 'High contrast');
  applyToggle(dyslexiaSwitch, 'data-dyslexia-font', 'a11y-dyslexia-font', 'Dyslexia-friendly font');
  applyToggle(motionSwitch, 'data-reduce-motion', 'a11y-reduce-motion', 'Reduce motion');

  // --- Restore from localStorage ---
  var savedSize = localStorage.getItem('a11y-text-size') || 'normal';
  applyTextSize(savedSize, false);

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
      applyTextSize('normal', false);
      if (contrastSwitch) contrastSwitch.setAttribute('aria-checked', 'false');
      if (dyslexiaSwitch) dyslexiaSwitch.setAttribute('aria-checked', 'false');
      if (motionSwitch) motionSwitch.setAttribute('aria-checked', 'false');
      if (window.srAnnounce) window.srAnnounce('All accessibility preferences have been reset to defaults');
    });
  }
})();

// ===========================
// Keyboard Shortcuts
// ===========================
(function () {
  'use strict';

  // Track the element that had focus before the help dialog opened
  var previousFocus = null;

  // Create help dialog dynamically — role="dialog" on the inner dialog, not the overlay
  var helpHTML = '<div class="kbd-help-overlay" id="kbd-help">' +
    '<div class="kbd-help-dialog" role="dialog" aria-labelledby="kbd-help-title" aria-modal="true">' +
    '<h2 id="kbd-help-title" tabindex="-1">Keyboard Shortcuts</h2>' +
    '<ul class="kbd-help-list" role="list">' +
    '<li>Go to Home: <kbd>Alt + 1</kbd></li>' +
    '<li>Go to Blog: <kbd>Alt + 2</kbd></li>' +
    '<li>Go to Contact: <kbd>Alt + 3</kbd></li>' +
    '<li>Accessibility Settings: <kbd>Alt + 0</kbd></li>' +
    '<li>Show this help: <kbd>?</kbd></li>' +
    '</ul>' +
    '<button type="button" class="kbd-help-close" id="kbd-help-close">Close</button>' +
    '</div></div>';

  document.body.insertAdjacentHTML('beforeend', helpHTML);

  var helpOverlay = document.getElementById('kbd-help');
  var helpDialog = helpOverlay ? helpOverlay.querySelector('.kbd-help-dialog') : null;
  var helpTitle = document.getElementById('kbd-help-title');
  var helpClose = document.getElementById('kbd-help-close');

  function showHelp() {
    if (!helpOverlay) return;
    previousFocus = document.activeElement;
    helpOverlay.classList.add('open');
    // Focus the dialog title so JAWS announces "Keyboard Shortcuts dialog"
    if (helpTitle) {
      helpTitle.focus();
    }
  }

  function hideHelp() {
    if (!helpOverlay) return;
    helpOverlay.classList.remove('open');
    // Restore focus to the element that triggered the dialog
    if (previousFocus && previousFocus.focus) {
      previousFocus.focus();
    }
    previousFocus = null;
  }

  if (helpClose) helpClose.addEventListener('click', hideHelp);
  if (helpOverlay) {
    helpOverlay.addEventListener('click', function (e) {
      if (e.target === helpOverlay) hideHelp();
    });
  }

  // Focus trap inside help dialog
  if (helpDialog) {
    helpDialog.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        hideHelp();
        return;
      }
      if (e.key === 'Tab') {
        var focusable = helpDialog.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
        var focusableArray = Array.prototype.slice.call(focusable);
        var first = focusableArray[0];
        var last = focusableArray[focusableArray.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

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

    // ?: Show help (not when typing in an input)
    if (e.key === '?' && !isInput && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (helpOverlay && helpOverlay.classList.contains('open')) {
        hideHelp();
      } else {
        showHelp();
      }
    }

    // Escape: Close help dialog
    if (e.key === 'Escape' && helpOverlay && helpOverlay.classList.contains('open')) {
      hideHelp();
    }
  });
})();

// ===========================
// Translation Feature — Accessible Menu Button Pattern
// Single Enter press on any language = instant translation
// Full keyboard: Arrow keys, Enter, Escape, Home, End, type-ahead
// ===========================
(function () {
  'use strict';

  // Language groups
  var indianLanguages = [
    { code: 'hi', label: '\u0939\u093F\u0928\u094D\u0926\u0940 (Hindi)' },
    { code: 'ta', label: '\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD (Tamil)' },
    { code: 'te', label: '\u0C24\u0C46\u0C32\u0C41\u0C17\u0C41 (Telugu)' },
    { code: 'kn', label: '\u0C95\u0CA8\u0CCD\u0CA8\u0CA1 (Kannada)' },
    { code: 'ml', label: '\u0D2E\u0D32\u0D2F\u0D3E\u0D33\u0D02 (Malayalam)' },
    { code: 'bn', label: '\u09AC\u09BE\u0982\u09B2\u09BE (Bengali)' },
    { code: 'mr', label: '\u092E\u0930\u093E\u0920\u0940 (Marathi)' },
    { code: 'gu', label: '\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0 (Gujarati)' },
    { code: 'pa', label: '\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40 (Punjabi)' },
    { code: 'ur', label: '\u0627\u0631\u062F\u0648 (Urdu)' },
    { code: 'or', label: '\u0B13\u0B21\u0B3F\u0B06 (Odia)' },
    { code: 'as', label: '\u0985\u09B8\u09AE\u09C0\u09AF\u09BC\u09BE (Assamese)' }
  ];

  var internationalLanguages = [
    { code: 'es', label: 'Espa\u00F1ol (Spanish)' },
    { code: 'fr', label: 'Fran\u00E7ais (French)' },
    { code: 'de', label: 'Deutsch (German)' },
    { code: 'pt', label: 'Portugu\u00EAs (Portuguese)' },
    { code: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629 (Arabic)' },
    { code: 'zh-CN', label: '\u4E2D\u6587 (Chinese)' },
    { code: 'ja', label: '\u65E5\u672C\u8A9E (Japanese)' },
    { code: 'ko', label: '\uD55C\uAD6D\uC5B4 (Korean)' },
    { code: 'ru', label: '\u0420\u0443\u0441\u0441\u043A\u0438\u0439 (Russian)' },
    { code: 'it', label: 'Italiano (Italian)' },
    { code: 'nl', label: 'Nederlands (Dutch)' },
    { code: 'tr', label: 'T\u00FCrk\u00E7e (Turkish)' },
    { code: 'th', label: '\u0E44\u0E17\u0E22 (Thai)' },
    { code: 'vi', label: 'Ti\u1EBFng Vi\u1EC7t (Vietnamese)' },
    { code: 'id', label: 'Bahasa Indonesia' },
    { code: 'ms', label: 'Bahasa Melayu (Malay)' },
    { code: 'pl', label: 'Polski (Polish)' },
    { code: 'sv', label: 'Svenska (Swedish)' }
  ];

  var supportedCodes = 'hi,ta,te,kn,ml,bn,mr,gu,pa,ur,or,as,es,fr,de,pt,ar,zh-CN,ja,ko,ru,it,nl,tr,th,vi,id,ms,pl,sv';

  // Find the nav-actions container
  var navActions = document.querySelector('.nav-actions');
  if (!navActions) return;

  // Check if translation is currently active
  var activeLang = null;
  var cookieMatch = document.cookie.match(/googtrans=\/en\/([^;]+)/);
  if (cookieMatch && cookieMatch[1]) {
    activeLang = cookieMatch[1];
  }

  // Find the label for a language code
  function getLangLabel(code) {
    var all = indianLanguages.concat(internationalLanguages);
    for (var i = 0; i < all.length; i++) {
      if (all[i].code === code) return all[i].label;
    }
    return code;
  }

  // =============================================
  // Build the menu button UI
  // =============================================
  var wrapper = document.createElement('div');
  wrapper.className = 'translate-wrapper';

  // The trigger button
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'translate-btn';
  btn.id = 'translate-btn';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'translate-menu');

  if (activeLang) {
    btn.innerHTML = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> <span class="translate-btn-text">' + getLangLabel(activeLang).split('(')[0].trim() + '</span>';
    btn.setAttribute('aria-label', 'Translate page. Currently: ' + getLangLabel(activeLang) + '. Press to change language.');
  } else {
    btn.innerHTML = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> <span class="translate-btn-text">Translate</span>';
    btn.setAttribute('aria-label', 'Translate this page to another language');
  }

  // The dropdown menu
  var menu = document.createElement('div');
  menu.className = 'translate-menu';
  menu.id = 'translate-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Select a language');

  // Build menu items
  var menuItems = []; // Track all focusable menu items

  // "Restore English" item (only if translation is active)
  if (activeLang) {
    var restoreItem = document.createElement('button');
    restoreItem.type = 'button';
    restoreItem.className = 'translate-menu-item translate-menu-item--restore';
    restoreItem.setAttribute('role', 'menuitem');
    restoreItem.setAttribute('data-lang', '');
    restoreItem.textContent = 'English (Restore original)';
    menu.appendChild(restoreItem);
    menuItems.push(restoreItem);

    var sep0 = document.createElement('div');
    sep0.className = 'translate-menu-separator';
    sep0.setAttribute('role', 'separator');
    menu.appendChild(sep0);
  }

  // Indian Languages group
  var groupLabel1 = document.createElement('div');
  groupLabel1.className = 'translate-menu-group';
  groupLabel1.setAttribute('role', 'presentation');
  groupLabel1.id = 'translate-group-indian';
  groupLabel1.textContent = 'Indian Languages';
  menu.appendChild(groupLabel1);

  indianLanguages.forEach(function (lang) {
    var item = document.createElement('button');
    item.type = 'button';
    item.className = 'translate-menu-item';
    item.setAttribute('role', 'menuitem');
    item.setAttribute('data-lang', lang.code);
    item.textContent = lang.label;
    if (lang.code === activeLang) {
      item.classList.add('translate-menu-item--active');
      item.setAttribute('aria-current', 'true');
    }
    menu.appendChild(item);
    menuItems.push(item);
  });

  // Separator
  var sep1 = document.createElement('div');
  sep1.className = 'translate-menu-separator';
  sep1.setAttribute('role', 'separator');
  menu.appendChild(sep1);

  // International Languages group
  var groupLabel2 = document.createElement('div');
  groupLabel2.className = 'translate-menu-group';
  groupLabel2.setAttribute('role', 'presentation');
  groupLabel2.id = 'translate-group-intl';
  groupLabel2.textContent = 'International Languages';
  menu.appendChild(groupLabel2);

  internationalLanguages.forEach(function (lang) {
    var item = document.createElement('button');
    item.type = 'button';
    item.className = 'translate-menu-item';
    item.setAttribute('role', 'menuitem');
    item.setAttribute('data-lang', lang.code);
    item.textContent = lang.label;
    if (lang.code === activeLang) {
      item.classList.add('translate-menu-item--active');
      item.setAttribute('aria-current', 'true');
    }
    menu.appendChild(item);
    menuItems.push(item);
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(menu);
  navActions.insertBefore(wrapper, navActions.firstChild);

  // =============================================
  // Menu state management
  // =============================================
  var isOpen = false;
  var focusIndex = -1;

  function openMenu() {
    isOpen = true;
    btn.setAttribute('aria-expanded', 'true');
    menu.classList.add('translate-menu--open');
    // Focus the first item (or the active language if one is set)
    var startIndex = 0;
    for (var i = 0; i < menuItems.length; i++) {
      if (menuItems[i].getAttribute('aria-current') === 'true') {
        startIndex = i;
        break;
      }
    }
    focusItem(startIndex);
  }

  function closeMenu(returnFocus) {
    isOpen = false;
    btn.setAttribute('aria-expanded', 'false');
    menu.classList.remove('translate-menu--open');
    focusIndex = -1;
    if (returnFocus !== false) {
      btn.focus();
    }
  }

  function focusItem(index) {
    if (index < 0) index = menuItems.length - 1;
    if (index >= menuItems.length) index = 0;
    focusIndex = index;
    menuItems[focusIndex].focus();
  }

  // =============================================
  // Button events
  // =============================================
  btn.addEventListener('click', function () {
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  btn.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'Down') {
      e.preventDefault();
      if (!isOpen) openMenu();
      else focusItem(0);
    } else if (e.key === 'ArrowUp' || e.key === 'Up') {
      e.preventDefault();
      if (!isOpen) openMenu();
      focusItem(menuItems.length - 1);
    }
  });

  // =============================================
  // Menu keyboard navigation
  // =============================================
  var typeAheadBuffer = '';
  var typeAheadTimer = null;

  menu.addEventListener('keydown', function (e) {
    var key = e.key;

    if (key === 'ArrowDown' || key === 'Down') {
      e.preventDefault();
      focusItem(focusIndex + 1);
    } else if (key === 'ArrowUp' || key === 'Up') {
      e.preventDefault();
      focusItem(focusIndex - 1);
    } else if (key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (key === 'End') {
      e.preventDefault();
      focusItem(menuItems.length - 1);
    } else if (key === 'Escape' || key === 'Esc') {
      e.preventDefault();
      closeMenu();
    } else if (key === 'Tab') {
      closeMenu(false);
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      if (focusIndex >= 0 && focusIndex < menuItems.length) {
        selectLanguage(menuItems[focusIndex].getAttribute('data-lang'));
      }
    } else if (key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Type-ahead: jump to item starting with typed character
      e.preventDefault();
      clearTimeout(typeAheadTimer);
      typeAheadBuffer += key.toLowerCase();
      typeAheadTimer = setTimeout(function () { typeAheadBuffer = ''; }, 600);

      for (var i = 0; i < menuItems.length; i++) {
        var text = menuItems[i].textContent.toLowerCase();
        // Match by the English name in parentheses or the native name
        if (text.indexOf(typeAheadBuffer) !== -1 ||
            text.replace(/.*\(/, '').replace(/\).*/, '').indexOf(typeAheadBuffer) === 0) {
          focusItem(i);
          break;
        }
      }
    }
  });

  // =============================================
  // Menu item click events
  // =============================================
  menuItems.forEach(function (item) {
    item.addEventListener('click', function () {
      selectLanguage(item.getAttribute('data-lang'));
    });
  });

  // Close menu on outside click
  document.addEventListener('click', function (e) {
    if (isOpen && !wrapper.contains(e.target)) {
      closeMenu(false);
    }
  });

  // =============================================
  // Translation engine (Google Translate)
  // =============================================

  // Google Translate container
  var gtContainer = document.createElement('div');
  gtContainer.id = 'google_translate_element';
  gtContainer.style.cssText = 'position:fixed;bottom:0;right:0;opacity:0.01;pointer-events:none;z-index:-1;height:0;overflow:hidden;';
  document.body.appendChild(gtContainer);

  var gtReady = false;
  var pendingLang = null;

  window.googleTranslateElementInit = function () {
    new google.translate.TranslateElement({
      pageLanguage: 'en',
      includedLanguages: supportedCodes,
      autoDisplay: false,
      layout: google.translate.TranslateElement.InlineLayout.SIMPLE
    }, 'google_translate_element');
    gtReady = true;
    if (pendingLang) {
      doTranslate(pendingLang);
      pendingLang = null;
    }
  };

  // Load Google Translate eagerly
  var gtScript = document.createElement('script');
  gtScript.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  gtScript.async = true;
  gtScript.onerror = function () {
    console.warn('[Translate] Google Translate script failed to load.');
  };
  document.head.appendChild(gtScript);

  function selectLanguage(langCode) {
    closeMenu();

    if (!langCode && langCode !== '') return;

    if (langCode === '') {
      // Restore to English
      if (window.srAnnounce) window.srAnnounce('Restoring page to English. Please wait.');
      clearTranslationCookies();
      location.reload();
      return;
    }

    var langName = getLangLabel(langCode);
    if (window.srAnnounce) {
      window.srAnnounce('Translating page to ' + langName + '. Please wait.');
    }

    if (gtReady) {
      doTranslate(langCode);
    } else {
      pendingLang = langCode;
      setTimeout(function () {
        if (pendingLang === langCode && !gtReady) {
          setCookieAndReload(langCode);
        }
      }, 8000);
    }
  }

  function doTranslate(langCode) {
    var attempts = 0;
    function tryNow() {
      var combo = document.querySelector('.goog-te-combo');
      if (combo) {
        combo.value = langCode;
        combo.dispatchEvent(new Event('change'));
      } else if (attempts < 50) {
        attempts++;
        setTimeout(tryNow, 200);
      } else {
        setCookieAndReload(langCode);
      }
    }
    tryNow();
  }

  function setCookieAndReload(langCode) {
    var domain = location.hostname;
    document.cookie = 'googtrans=/en/' + langCode + '; path=/;';
    document.cookie = 'googtrans=/en/' + langCode + '; path=/; domain=.' + domain;
    location.reload();
  }

  function clearTranslationCookies() {
    var domain = location.hostname;
    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.' + domain;
    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=' + domain;
  }
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
