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
        // Submit form to Netlify
        var formData = new FormData(form);
        fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(formData).toString()
        })
        .then(function (response) {
          if (response.ok) {
            var successMsg = document.createElement('div');
            successMsg.setAttribute('role', 'status');
            successMsg.setAttribute('aria-live', 'polite');
            successMsg.className = 'form-success';
            successMsg.style.cssText = 'background:#d4edda;color:#155724;padding:1rem;border-radius:8px;margin-top:1rem;font-weight:500;';
            successMsg.textContent = 'Thank you for your message! I will get back to you soon.';
            form.appendChild(successMsg);
            form.reset();
            setTimeout(function () {
              if (successMsg.parentNode) successMsg.parentNode.removeChild(successMsg);
            }, 5000);
          } else {
            throw new Error('Form submission failed');
          }
        })
        .catch(function () {
          var errorMsg = document.createElement('div');
          errorMsg.setAttribute('role', 'alert');
          errorMsg.className = 'form-error';
          errorMsg.style.cssText = 'background:#f8d7da;color:#721c24;padding:1rem;border-radius:8px;margin-top:1rem;font-weight:500;';
          errorMsg.textContent = 'Something went wrong. Please email me directly at akhilesh.malani@gmail.com';
          form.appendChild(errorMsg);
          setTimeout(function () {
            if (errorMsg.parentNode) errorMsg.parentNode.removeChild(errorMsg);
          }, 7000);
        });
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
        document.body.appendChild(announcement);
      }
      announcement.textContent = count + ' resource' + (count !== 1 ? 's' : '') + ' shown.';
    });
  });
})();
