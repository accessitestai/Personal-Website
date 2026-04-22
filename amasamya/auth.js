/* ═══════════════════════════════════════════════════════════════
   AMASAMYA — Firebase Authentication (auth.js)
   Providers: Google · Email / Password
   Post-login destination: ./index.html (main audit platform)
   WCAG 2.2 AA compliant interactions.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Config ── */
  var REDIRECT_AFTER_AUTH = './index.html';

  /* ════════════════════════════════════════════════════
     ACCESSIBILITY HELPERS
  ════════════════════════════════════════════════════ */
  function announce(msg) {
    var el = document.getElementById('sr-live');
    if (!el) return;
    el.textContent = '';
    window.requestAnimationFrame(function () { el.textContent = msg; });
  }

  /* Ask the browser to save the email/password so it can autofill next time.
     Uses the Credential Management API where supported; silently resolves
     otherwise so the login flow is never blocked. */
  function storePasswordCredential(email, password, name) {
    try {
      if (window.PasswordCredential && navigator.credentials && navigator.credentials.store) {
        var cred = new window.PasswordCredential({
          id:       email,
          password: password,
          name:     name || email
        });
        return navigator.credentials.store(cred).catch(function () { /* user declined or unsupported */ });
      }
    } catch (e) { /* ignore and fall through */ }
    return Promise.resolve();
  }

  function setStatus(msg, isError) {
    var el = document.getElementById('auth-status');
    if (!el) return;
    el.textContent = msg;
    el.hidden      = !msg;
    el.className   = 'auth-status' + (isError ? ' error' : '');
    if (msg) announce(msg);
  }

  function showFieldError(errId, msg) {
    var errEl = document.getElementById(errId);
    if (!errEl) return;
    errEl.textContent = msg;
    /* Mark the associated input invalid */
    var prev = errEl.previousElementSibling;
    var input = (prev && prev.classList.contains('password-wrap'))
      ? prev.querySelector('input')
      : (prev && prev.tagName === 'INPUT' ? prev : null);
    if (input) {
      if (msg) input.setAttribute('aria-invalid', 'true');
      else     input.removeAttribute('aria-invalid');
    }
  }

  function clearFormErrors(formId) {
    var form = document.getElementById(formId);
    if (!form) return;
    form.querySelectorAll('[role="alert"]').forEach(function (el) {
      el.textContent = '';
    });
    form.querySelectorAll('[aria-invalid]').forEach(function (el) {
      el.removeAttribute('aria-invalid');
    });
  }

  /* ════════════════════════════════════════════════════
     FIREBASE ERROR → FRIENDLY MESSAGE
  ════════════════════════════════════════════════════ */
  function friendlyError(code, rawMessage) {
    var MAP = {
      'auth/email-already-in-use':     'An account with that email already exists. Try signing in instead.',
      'auth/invalid-email':            'Please enter a valid email address.',
      'auth/user-not-found':           'No account found with that email. Create an account instead.',
      'auth/wrong-password':           'Incorrect password. Please try again.',
      'auth/invalid-credential':       'Incorrect email or password. Please try again.',
      'auth/weak-password':            'Password must be at least 8 characters.',
      'auth/too-many-requests':        'Too many sign-in attempts. Please wait a moment and try again.',
      'auth/popup-closed-by-user':     'Sign-in cancelled — the pop-up was closed.',
      'auth/cancelled-popup-request':  'Sign-in cancelled.',
      'auth/popup-blocked':            'Your browser blocked the sign-in pop-up. Please allow pop-ups for this site and try again.',
      'auth/account-exists-with-different-credential': 'An account with that email exists, but it uses a different sign-in method. Try another provider.',
      'auth/network-request-failed':   'Network error. Please check your internet connection.',
      'auth/user-disabled':            'This account has been disabled. Please contact support.',
      'auth/requires-recent-login':    'Please sign in again to continue.',
      'auth/expired-action-code':      'This link has expired. Please request a new one.',
      'auth/invalid-action-code':      'This link is invalid. It may have already been used.',
    };

    /* Firebase Password Policy — extract the specific requirements from the raw message.
       Firebase returns messages like:
         "Firebase: Password does not meet requirements [Password must contain an upper case character, Password must contain a numeric character]. (auth/password-does-not-meet-requirements)." */
    if (code === 'auth/password-does-not-meet-requirements') {
      var match = rawMessage && rawMessage.match(/\[([^\]]+)\]/);
      if (match && match[1]) {
        return 'Your password doesn\u2019t meet the requirements: ' + match[1] + '.';
      }
      return 'Your password doesn\u2019t meet the security requirements. It must include upper case, lower case, a number, and a symbol.';
    }

    return MAP[code] || 'Sign-in failed (' + (code || 'unknown') + '). Please try again.';
  }

  /* ════════════════════════════════════════════════════
     GUARD — Already signed in → go straight to app
  ════════════════════════════════════════════════════ */
  if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
    setStatus('Authentication service unavailable. Please refresh the page.', true);
  } else {
    var guardUnsub = firebase.auth().onAuthStateChanged(function (user) {
      guardUnsub(); // fire once only
      if (user) {
        window.location.href = REDIRECT_AFTER_AUTH;
      }
    });
  }

  /* ════════════════════════════════════════════════════
     TAB SWITCHING — Sign In / Create Account
  ════════════════════════════════════════════════════ */
  var tabBtns   = Array.from(document.querySelectorAll('.auth-tab'));
  var panelMap  = {
    'tab-signin': document.getElementById('panel-signin'),
    'tab-signup': document.getElementById('panel-signup'),
  };

  function activateTab(activeTab) {
    tabBtns.forEach(function (t) {
      var on = (t === activeTab);
      t.setAttribute('aria-selected', String(on));
      t.setAttribute('tabindex', on ? '0' : '-1');
    });
    Object.keys(panelMap).forEach(function (tid) {
      if (panelMap[tid]) panelMap[tid].hidden = (tid !== activeTab.id);
    });
    /* Update heading copy */
    var h1  = document.getElementById('auth-heading');
    var sub = document.getElementById('auth-sub');
    if (activeTab.id === 'tab-signup') {
      if (h1)  h1.textContent  = 'Create Your Account';
      if (sub) sub.textContent = 'Sign up to access the AMASAMYA accessibility audit platform.';
    } else {
      if (h1)  h1.textContent  = 'Sign in to AMASAMYA';
      if (sub) sub.textContent = 'Continue to your accessibility audit platform.';
    }
    setStatus('', false);
  }

  tabBtns.forEach(function (tab) {
    tab.addEventListener('click', function () { activateTab(tab); });
    tab.addEventListener('keydown', function (e) {
      var cur  = tabBtns.indexOf(tab);
      var next = null;
      if (e.key === 'ArrowRight') next = tabBtns[(cur + 1) % tabBtns.length];
      if (e.key === 'ArrowLeft')  next = tabBtns[(cur - 1 + tabBtns.length) % tabBtns.length];
      if (next) { e.preventDefault(); activateTab(next); next.focus(); }
    });
  });

  /* ════════════════════════════════════════════════════
     OAUTH PROVIDER CLICK HANDLER
  ════════════════════════════════════════════════════ */
  document.querySelectorAll('.provider-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var provider = btn.dataset.provider;
      setStatus('', false);
      triggerOAuth(provider, btn);
    });
  });

  function triggerOAuth(providerKey, btn) {
    if (typeof firebase === 'undefined') {
      setStatus('Authentication service unavailable. Please refresh.', true);
      return;
    }

    var provider;
    try {
      if (providerKey === 'google') {
        provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
      } else {
        setStatus('Unknown provider. Please use Google or email sign-in.', true);
        return;
      }
    } catch (err) {
      setStatus('Could not start sign-in: ' + err.message, true);
      return;
    }

    setBtnLoading(btn, true);
    announce('Opening ' + providerKey + ' sign-in window. Please wait.');

    firebase.auth().signInWithPopup(provider)
      .then(function () {
        announce('Signed in. Redirecting to your dashboard.');
        window.location.href = REDIRECT_AFTER_AUTH;
      })
      .catch(function (err) {
        setBtnLoading(btn, false);
        setStatus(friendlyError(err.code, err.message), true);
      });
  }

  function setBtnLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.origText = btn.textContent.trim();
      btn.textContent = 'Signing in\u2026';
      btn.classList.add('loading');
    } else {
      btn.textContent = btn.dataset.origText || btn.textContent;
      btn.classList.remove('loading');
    }
  }

  /* ════════════════════════════════════════════════════
     EMAIL / PASSWORD — SIGN IN
  ════════════════════════════════════════════════════ */
  var signinForm = document.getElementById('signin-form');
  if (signinForm) {
    signinForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearFormErrors('signin-form');
      setStatus('', false);

      var email    = document.getElementById('signin-email').value.trim();
      var password = document.getElementById('signin-password').value;
      var btn      = document.getElementById('signin-btn');

      var ok = true;
      if (!email)    { showFieldError('signin-email-err', 'Email address is required.'); ok = false; }
      if (!password) { showFieldError('signin-pass-err',  'Password is required.'); ok = false; }
      if (!ok) { announce('Please fix the errors highlighted on screen.'); return; }

      btn.disabled    = true;
      btn.textContent = 'Signing in\u2026';
      announce('Signing in. Please wait.');

      firebase.auth().signInWithEmailAndPassword(email, password)
        .then(function () {
          announce('Signed in. Redirecting to your dashboard.');
          return storePasswordCredential(email, password);
        })
        .then(function () {
          window.location.href = REDIRECT_AFTER_AUTH;
        })
        .catch(function (err) {
          btn.disabled    = false;
          btn.textContent = 'Sign In';
          var msg = friendlyError(err.code, err.message);
          if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
            showFieldError('signin-email-err', msg);
            document.getElementById('signin-email').focus();
          } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            showFieldError('signin-pass-err', msg);
            document.getElementById('signin-password').focus();
          } else {
            document.getElementById('signin-general-err').textContent = msg;
            announce(msg);
          }
        });
    });
  }

  /* ════════════════════════════════════════════════════
     EMAIL / PASSWORD — CREATE ACCOUNT
  ════════════════════════════════════════════════════ */
  /* ────────────────────────────────────────────────────
     Live password-policy validation.
     Checks the 5 Firebase requirements on every keystroke
     and updates the visible checklist + aria-live summary
     so users know instantly what is missing.
  ──────────────────────────────────────────────────── */
  var PASSWORD_RULES = [
    { id: 'rule-length', label: 'At least 8 characters',        test: function (v) { return v.length >= 8; } },
    { id: 'rule-upper',  label: 'One upper case letter (A\u2013Z)', test: function (v) { return /[A-Z]/.test(v); } },
    { id: 'rule-lower',  label: 'One lower case letter (a\u2013z)', test: function (v) { return /[a-z]/.test(v); } },
    { id: 'rule-number', label: 'One number (0\u20139)',            test: function (v) { return /[0-9]/.test(v); } },
    { id: 'rule-symbol', label: 'One symbol (e.g. ! @ # $ %)',      test: function (v) { return /[^A-Za-z0-9]/.test(v); } }
  ];
  function passwordAllValid(v) {
    for (var i = 0; i < PASSWORD_RULES.length; i++) {
      if (!PASSWORD_RULES[i].test(v)) return false;
    }
    return true;
  }
  function updatePasswordChecklist(value) {
    var listEl = document.getElementById('signup-pass-checklist');
    if (!listEl) return;
    PASSWORD_RULES.forEach(function (rule) {
      var li = document.getElementById(rule.id);
      if (!li) return;
      var passed = rule.test(value);
      li.setAttribute('data-passed', passed ? 'true' : 'false');
      /* Icon is decorative; the text is what SR reads. Prefix the
         state word so SR users hear "Met" / "Not met" unambiguously. */
      var state = li.querySelector('.rule-state');
      if (state) state.textContent = passed ? 'Met: ' : 'Not met: ';
    });
  }
  var signupPassInput = document.getElementById('signup-password');
  if (signupPassInput) {
    /* Initialize checklist as unmet on load. */
    updatePasswordChecklist('');
    var announceTimer = null;
    var lastAnnounced = '';
    signupPassInput.addEventListener('input', function () {
      var v = signupPassInput.value;
      updatePasswordChecklist(v);
      /* Clear any stale server error once the user starts typing again. */
      var errEl = document.getElementById('signup-pass-err');
      if (errEl && errEl.textContent) errEl.textContent = '';
      /* Debounced live summary for screen readers — announces only
         when the user pauses typing, to avoid per-keystroke spam. */
      if (announceTimer) clearTimeout(announceTimer);
      announceTimer = setTimeout(function () {
        var metCount = PASSWORD_RULES.filter(function (r) { return r.test(v); }).length;
        var summary;
        if (!v) { summary = ''; }
        else if (metCount === PASSWORD_RULES.length) { summary = 'All password requirements met.'; }
        else {
          var missing = PASSWORD_RULES.filter(function (r) { return !r.test(v); })
                                      .map(function (r) { return r.label.toLowerCase(); });
          summary = metCount + ' of ' + PASSWORD_RULES.length + ' requirements met. Still needed: ' + missing.join(', ') + '.';
        }
        if (summary && summary !== lastAnnounced) {
          lastAnnounced = summary;
          announce(summary);
        }
      }, 700);
    });
  }

  var signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      clearFormErrors('signup-form');
      setStatus('', false);

      var name     = document.getElementById('signup-name').value.trim();
      var email    = document.getElementById('signup-email').value.trim();
      var password = document.getElementById('signup-password').value;
      var btn      = document.getElementById('signup-btn');

      var ok = true;
      if (!name)              { showFieldError('signup-name-err',  'Full name is required.'); ok = false; }
      if (!email)             { showFieldError('signup-email-err', 'Email address is required.'); ok = false; }
      if (!password) {
        showFieldError('signup-pass-err', 'Password is required.'); ok = false;
      } else if (!passwordAllValid(password)) {
        /* Build a specific message listing the unmet requirements so SR users hear exactly what's missing. */
        var missing = PASSWORD_RULES.filter(function (r) { return !r.test(password); })
                                    .map(function (r) { return r.label.toLowerCase(); });
        showFieldError('signup-pass-err', 'Password is missing: ' + missing.join(', ') + '.');
        document.getElementById('signup-password').focus();
        ok = false;
      }
      if (!ok) { announce('Please fix the errors highlighted on screen.'); return; }

      btn.disabled    = true;
      btn.textContent = 'Creating account\u2026';
      announce('Creating your account. Please wait.');

      firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(function (cred) {
          return cred.user.updateProfile({ displayName: name });
        })
        .then(function () {
          return storePasswordCredential(email, password, name);
        })
        .then(function () {
          announce('Account created. Redirecting to your dashboard.');
          window.location.href = REDIRECT_AFTER_AUTH;
        })
        .catch(function (err) {
          btn.disabled    = false;
          btn.textContent = 'Create Account';
          var msg = friendlyError(err.code, err.message);
          if (err.code === 'auth/email-already-in-use' || err.code === 'auth/invalid-email') {
            showFieldError('signup-email-err', msg);
            document.getElementById('signup-email').focus();
          } else if (err.code === 'auth/weak-password' || err.code === 'auth/password-does-not-meet-requirements') {
            showFieldError('signup-pass-err', msg);
            document.getElementById('signup-password').focus();
          } else {
            document.getElementById('signup-general-err').textContent = msg;
            announce(msg);
          }
        });
    });
  }

  /* ════════════════════════════════════════════════════
     SHOW / HIDE PASSWORD TOGGLE
  ════════════════════════════════════════════════════ */
  [['toggle-signin-pass', 'signin-password'], ['toggle-signup-pass', 'signup-password']].forEach(function (pair) {
    var btnEl   = document.getElementById(pair[0]);
    var inputEl = document.getElementById(pair[1]);
    if (!btnEl || !inputEl) return;
    btnEl.addEventListener('click', function () {
      var showing = (inputEl.type === 'text');
      inputEl.type = showing ? 'password' : 'text';
      btnEl.setAttribute('aria-pressed', String(!showing));
      btnEl.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      announce(showing ? 'Password hidden.' : 'Password is now visible.');
    });
  });

  /* ════════════════════════════════════════════════════
     FORGOT PASSWORD MODAL
  ════════════════════════════════════════════════════ */
  var forgotModal    = document.getElementById('forgot-modal');
  var forgotLink     = document.getElementById('forgot-password-link');
  var forgotCancel   = document.getElementById('forgot-cancel-btn');
  var forgotBackdrop = document.getElementById('forgot-backdrop');
  var forgotForm     = document.getElementById('forgot-form');
  var forgotSuccess  = document.getElementById('forgot-success');

  function openForgotModal(e) {
    if (e) e.preventDefault();
    forgotModal.hidden = false;
    var emailInput = document.getElementById('forgot-email');
    if (emailInput) emailInput.focus();
    announce('Password reset dialog opened. Enter your email address to receive a reset link.');
    document.addEventListener('keydown', escCloseForgot);
  }

  function closeForgotModal() {
    forgotModal.hidden = true;
    document.removeEventListener('keydown', escCloseForgot);
    if (forgotLink) forgotLink.focus();
    announce('Password reset dialog closed.');
  }

  function escCloseForgot(e) { if (e.key === 'Escape') closeForgotModal(); }

  if (forgotLink)     forgotLink.addEventListener('click', openForgotModal);
  if (forgotCancel)   forgotCancel.addEventListener('click', closeForgotModal);
  if (forgotBackdrop) forgotBackdrop.addEventListener('click', closeForgotModal);

  if (forgotForm) {
    forgotForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email   = document.getElementById('forgot-email').value.trim();
      var errEl   = document.getElementById('forgot-email-err');
      var genErr  = document.getElementById('forgot-general-err');
      var btn     = document.getElementById('forgot-submit-btn');
      errEl.textContent  = '';
      genErr.textContent = '';

      if (!email) {
        errEl.textContent = 'Email address is required.';
        announce('Email address is required.');
        return;
      }

      btn.disabled    = true;
      btn.textContent = 'Sending\u2026';
      announce('Sending password reset email. Please wait.');

      firebase.auth().sendPasswordResetEmail(email)
        .then(function () {
          btn.disabled    = false;
          btn.textContent = 'Send Reset Link';
          forgotForm.hidden      = true;
          forgotSuccess.textContent = 'Reset link sent to ' + email + '. Check your inbox (and spam folder).';
          forgotSuccess.hidden   = false;
          announce('Password reset email sent to ' + email + '.');
        })
        .catch(function (err) {
          btn.disabled    = false;
          btn.textContent = 'Send Reset Link';
          var msg = friendlyError(err.code, err.message);
          genErr.textContent = msg;
          announce(msg);
        });
    });
  }

})();
