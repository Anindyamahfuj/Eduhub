// StudyHub — sign in / create account.
// Reuses the existing design tokens from style.css; no other page is changed.

(function () {
    'use strict';

    var form = document.getElementById('authForm');
    var emailEl = document.getElementById('authEmail');
    var passwordEl = document.getElementById('authPassword');
    var submitBtn = document.getElementById('authSubmit');
    var messageEl = document.getElementById('authMessage');
    var titleEl = document.getElementById('authTitle');
    var switchText = document.getElementById('authSwitchText');
    var switchLink = document.getElementById('authSwitchLink');

    var mode = 'login';

    function setMessage(text, kind) {
        messageEl.textContent = text || '';
        messageEl.className = 'auth-message' + (kind ? ' is-' + kind : '');
    }

    function setMode(next) {
        mode = next;
        var registering = mode === 'register';
        titleEl.textContent = registering ? 'Create your account' : 'Sign in to StudyHub';
        submitBtn.textContent = registering ? 'Create account' : 'Sign in';
        switchText.textContent = registering ? 'Already have an account?' : 'New to StudyHub?';
        switchLink.textContent = registering ? 'Sign in' : 'Create an account';
        setMessage('');
    }

    switchLink.addEventListener('click', function (e) {
        e.preventDefault();
        setMode(mode === 'login' ? 'register' : 'login');
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = emailEl.value.trim();
        var password = passwordEl.value;

        if (!email || !password) {
            setMessage('Please enter your email and password.', 'error');
            return;
        }

        submitBtn.disabled = true;
        setMessage(mode === 'register' ? 'Creating your account...' : 'Signing you in...', 'info');

        fetch('/api/auth/' + (mode === 'register' ? 'register' : 'login'), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        })
            .then(function (res) {
                return res.text().then(function (text) {
                    var data = {};
                    try { data = text ? JSON.parse(text) : {}; } catch (err) { data = {}; }
                    return { status: res.status, ok: res.ok, data: data };
                });
            })
            .then(function (res) {
                if (!res.ok) {
                    setMessage((res.data && res.data.error) || 'Something went wrong. Please try again.', 'error');
                    submitBtn.disabled = false;
                    return;
                }
                setMessage('Success - taking you to your workspace...', 'ok');
                window.location.href = '/index.html';
            })
            .catch(function () {
                setMessage('Could not reach the server. Please try again.', 'error');
                submitBtn.disabled = false;
            });
    });

    // Already signed in? Go straight to the dashboard.
    fetch('/api/auth/me', { credentials: 'same-origin' })
        .then(function (res) { if (res.ok) window.location.href = '/index.html'; })
        .catch(function () { /* stay here */ });

    setMode('login');
    emailEl.focus();
})();
