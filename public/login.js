// login.js
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    // Bind password visibility toggles
    document.querySelectorAll('.btn-password-toggle').forEach(btn => {
        btn.onclick = () => {
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            if (targetInput) {
                const isPass = targetInput.type === 'password';
                targetInput.type = isPass ? 'text' : 'password';
                btn.innerHTML = `<i data-lucide="${isPass ? 'eye-off' : 'eye'}" style="position:static; color:inherit; pointer-events:none; width:16px; height:16px;"></i>`;
                if (window.lucide) window.lucide.createIcons();
            }
        };
    });

    let supabase = null;
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');

    // Forgot password state
    let forgotEmail = '';
    let forgotOtp = '';

    // Initialize Supabase Client
    async function init() {
        try {
            const res = await fetch('/api/config');
            const config = await res.json();
            if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
                console.error("Supabase config is missing!");
                alert("Database configuration not loaded. Ensure .env is set up.");
                return;
            }
            supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
        } catch (e) {
            console.error("Initialization failed", e);
        }
    }

    function logUserActivity(email, role, action, details) {
        try {
            fetch('/api/log-activity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role, action, details })
            }).catch(err => console.error("Error posting log:", err));
        } catch (e) {
            console.error("Error writing activity log:", e);
        }
    }

    // View switcher helper with transition animations
    function switchView(viewId, title, subtitle) {
        document.querySelectorAll('.login-view').forEach(v => {
            v.classList.remove('active');
            v.style.display = 'none';
        });

        const activeView = document.getElementById(viewId);
        if (activeView) {
            activeView.style.display = 'block';
            // Force reflow
            activeView.offsetHeight;
            activeView.classList.add('active');
        }

        if (title) document.getElementById('login-card-title').innerHTML = title;
        if (subtitle) document.getElementById('login-card-subtitle').textContent = subtitle;

        if (window.lucide) window.lucide.createIcons();
    }

    // Caps Lock Warning Handler
    const capsLockHandler = (e, warningId) => {
        const warning = document.getElementById(warningId);
        if (!warning) return;
        if (e.getModifierState && e.getModifierState('CapsLock')) {
            warning.style.display = 'flex';
        } else {
            warning.style.display = 'none';
        }
    };

    const clearCapsLock = (warningId) => {
        const warning = document.getElementById(warningId);
        if (warning) warning.style.display = 'none';
    };

    const pwFields = [
        { id: 'login-password', warn: 'caps-warning-login-password' },
        { id: 'reset-password', warn: 'caps-warning-reset-password' },
        { id: 'reset-password-confirm', warn: 'caps-warning-reset-password-confirm' }
    ];

    pwFields.forEach(field => {
        const input = document.getElementById(field.id);
        if (input) {
            input.addEventListener('keyup', (e) => capsLockHandler(e, field.warn));
            input.addEventListener('keydown', (e) => capsLockHandler(e, field.warn));
            input.addEventListener('focus', (e) => capsLockHandler(e, field.warn));
            input.addEventListener('blur', () => clearCapsLock(field.warn));
        }
    });

    // Password Strength Meter Handler
    const evaluateStrength = (password) => {
        let score = 0;
        if (!password) return { score, text: 'Weak', color: '#ef4444', width: '0%' };
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;

        switch(score) {
            case 0:
            case 1:
                return { score, text: 'Weak', color: '#ef4444', width: '25%' };
            case 2:
                return { score, text: 'Fair', color: '#f97316', width: '50%' };
            case 3:
                return { score, text: 'Good', color: '#3b82f6', width: '75%' };
            case 4:
            default:
                return { score, text: 'Strong', color: '#10b981', width: '100%' };
        }
    };

    const resetPwInput = document.getElementById('reset-password');
    const resetPwStrength = document.getElementById('strength-reset-password');
    if (resetPwInput && resetPwStrength) {
        const fill = resetPwStrength.querySelector('.strength-bar-fill');
        const text = resetPwStrength.querySelector('.strength-label-text');

        resetPwInput.addEventListener('input', () => {
            const val = resetPwInput.value;
            if (!val) {
                resetPwStrength.style.display = 'none';
                return;
            }
            resetPwStrength.style.display = 'flex';
            const res = evaluateStrength(val);
            fill.style.width = res.width;
            fill.style.backgroundColor = res.color;
            text.textContent = res.text;
            text.style.color = res.color;
        });
    }

    // Bind navigation triggers
    const linkGotoForgot = document.getElementById('link-goto-forgot');
    if (linkGotoForgot) {
        linkGotoForgot.onclick = (e) => {
            e.preventDefault();
            switchView('view-forgot-email', 'Forgot <span>Password</span>', 'Enter your email to request a verification OTP code.');
        };
    }

    document.querySelectorAll('.link-back-to-login').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            switchView('view-signin', 'Welcome to <span>ThrustVault</span>', 'Sign in to access the UAV motor database console.');
        };
    });

    // ── Sign In Submission ───────────────────────────────────────────────────
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!supabase) {
            alert("Database connection is initializing. Please try again.");
            return;
        }

        const submitBtn = loginForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        submitBtn.innerHTML = '<div class="spinner-dual"></div> Signing In...';
        emailInput.disabled = true;
        passwordInput.disabled = true;

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                alert("Login failed: " + error.message);
                submitBtn.disabled = false;
                submitBtn.classList.remove('loading');
                submitBtn.innerHTML = 'Sign In <i data-lucide="arrow-right" style="width: 18px; height: 18px;"></i>';
                emailInput.disabled = false;
                passwordInput.disabled = false;
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            if (data && data.user) {
                const { data: profile, error: profileError } = await supabase
                    .from('user_profiles')
                    .select('role')
                    .eq('id', data.user.id)
                    .single();

                if (profileError || !profile) {
                    alert("Authentication succeeded, but no profile role was found for this user.");
                    await supabase.auth.signOut();
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('loading');
                    submitBtn.innerHTML = 'Sign In <i data-lucide="arrow-right" style="width: 18px; height: 18px;"></i>';
                    emailInput.disabled = false;
                    passwordInput.disabled = false;
                    if (window.lucide) window.lucide.createIcons();
                    return;
                }

                const session = {
                    email: data.user.email,
                    role: profile.role,
                    uid: data.user.id,
                    token: data.session.access_token,
                    timestamp: new Date().getTime()
                };
                localStorage.setItem('thrustvault_session', JSON.stringify(session));
                
                // Set secure server-readable cookie for dashboard route verification
                const cookieValue = encodeURIComponent(JSON.stringify({
                    email: data.user.email,
                    role: profile.role,
                    timestamp: new Date().getTime()
                }));
                const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
                document.cookie = `thrustvault_session=${cookieValue}; path=/; max-age=86400; SameSite=Strict${secureFlag}`;

                logUserActivity(data.user.email, profile.role, 'Login', 'Logged in successfully.');

                if (profile.role === 'admin') {
                    window.location.href = 'admin_dashboard';
                } else if (profile.role === 'intern') {
                    window.location.href = 'intern_dashboard';
                } else if (profile.role === 'guest') {
                    window.location.href = 'guest_dashboard';
                } else {
                    alert("Invalid role assigned to this account.");
                    await supabase.auth.signOut();
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('loading');
                    submitBtn.innerHTML = 'Sign In <i data-lucide="arrow-right" style="width: 18px; height: 18px;"></i>';
                    emailInput.disabled = false;
                    passwordInput.disabled = false;
                    if (window.lucide) window.lucide.createIcons();
                }
            }
        } catch (err) {
            console.error("Login request failed:", err);
            alert("Verification failed: " + err.message);
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            submitBtn.innerHTML = 'Sign In <i data-lucide="arrow-right" style="width: 18px; height: 18px;"></i>';
            emailInput.disabled = false;
            passwordInput.disabled = false;
            if (window.lucide) window.lucide.createIcons();
        }
    };

    // ── Forgot Password: Send OTP ─────────────────────────────────────────────
    const forgotEmailForm = document.getElementById('forgot-email-form');
    if (forgotEmailForm) {
        forgotEmailForm.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgot-email').value.trim();
            if (!email) return;

            if (!supabase) {
                alert("Supabase client not initialized.");
                return;
            }

            const submitBtn = forgotEmailForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.classList.add('loading');
            submitBtn.innerHTML = '<div class="spinner-dual"></div> Sending...';

            try {
                const { error } = await supabase.auth.signInWithOtp({
                    email: email,
                    options: {
                        shouldCreateUser: false
                    }
                });

                if (error) {
                    alert("Failed to send code: " + error.message);
                    return;
                }

                forgotEmail = email;
                switchView('view-forgot-otp', 'Verify <span>Verification Code</span>', `We sent a 6-digit code to ${email}.`);
            } catch (err) {
                console.error("OTP request failed:", err);
                alert("Error requesting OTP: " + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.classList.remove('loading');
                submitBtn.innerHTML = 'Send Verification Code <i data-lucide="send" style="width: 16px; height: 16px;"></i>';
                if (window.lucide) window.lucide.createIcons();
            }
        };
    }

    // ── Forgot Password: Verify OTP ───────────────────────────────────────────
    const forgotOtpForm = document.getElementById('forgot-otp-form');
    if (forgotOtpForm) {
        forgotOtpForm.onsubmit = async (e) => {
            e.preventDefault();
            const code = document.getElementById('forgot-otp').value.trim();
            if (!code || code.length !== 6) {
                alert("Please enter a valid 6-digit verification code.");
                return;
            }

            if (!supabase) {
                alert("Supabase client not initialized.");
                return;
            }

            const submitBtn = forgotOtpForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.classList.add('loading');
            submitBtn.innerHTML = '<div class="spinner-dual"></div> Verifying...';

            try {
                const { error } = await supabase.auth.verifyOtp({
                    email: forgotEmail,
                    token: code,
                    type: 'email'
                });

                if (error) {
                    alert("Verification failed: " + error.message);
                    return;
                }

                forgotOtp = code;
                switchView('view-forgot-reset', 'Reset <span>Password</span>', 'Choose a strong new password for your account.');
            } catch (err) {
                console.error("OTP verification failed:", err);
                alert("Error verifying code: " + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.classList.remove('loading');
                submitBtn.innerHTML = 'Verify Code <i data-lucide="check-circle" style="width: 16px; height: 16px;"></i>';
                if (window.lucide) window.lucide.createIcons();
            }
        };
    }

    // ── Forgot Password: Resend OTP ───────────────────────────────────────────
    const linkResendOtp = document.getElementById('link-resend-otp');
    if (linkResendOtp) {
        linkResendOtp.onclick = async (e) => {
            e.preventDefault();
            if (!forgotEmail) return;

            linkResendOtp.style.pointerEvents = 'none';
            linkResendOtp.style.opacity = '0.5';
            linkResendOtp.textContent = 'Sending...';

            try {
                const { error } = await supabase.auth.signInWithOtp({
                    email: forgotEmail,
                    options: { shouldCreateUser: false }
                });

                if (error) {
                    alert("Failed to resend code: " + error.message);
                    return;
                }
                alert("A new verification code has been sent to your email.");
            } catch (err) {
                console.error("Resend OTP error:", err);
                alert("Error sending code: " + err.message);
            } finally {
                linkResendOtp.style.pointerEvents = 'auto';
                linkResendOtp.style.opacity = '1';
                linkResendOtp.textContent = 'Resend Code';
            }
        };
    }

    // ── Forgot Password: Reset Password ───────────────────────────────────────
    const forgotResetForm = document.getElementById('forgot-reset-form');
    if (forgotResetForm) {
        forgotResetForm.onsubmit = async (e) => {
            e.preventDefault();
            const password = document.getElementById('reset-password').value;
            const confirm = document.getElementById('reset-password-confirm').value;

            if (password.length < 6) {
                alert("Password must be at least 6 characters long.");
                return;
            }

            if (password !== confirm) {
                alert("Passwords do not match.");
                return;
            }

            const submitBtn = forgotResetForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.classList.add('loading');
            submitBtn.innerHTML = '<div class="spinner-dual"></div> Updating...';

            try {
                const { error } = await supabase.auth.updateUser({
                    password: password
                });

                if (error) {
                    alert("Password update failed: " + error.message);
                    return;
                }

                alert("Your password has been reset successfully! Please log in with your new credentials.");
                
                // Sign out to clear temporary session
                await supabase.auth.signOut().catch(e => console.error("SignOut error after reset:", e));
                localStorage.removeItem('thrustvault_session');
                
                // Return to Sign In view
                switchView('view-signin', 'Welcome to <span>ThrustVault</span>', 'Sign in to access the UAV motor database console.');

                // Reset forms
                document.getElementById('reset-password').value = '';
                document.getElementById('reset-password-confirm').value = '';
                document.getElementById('forgot-email').value = '';
                document.getElementById('forgot-otp').value = '';
                passwordInput.value = '';
            } catch (err) {
                console.error("Error updating password:", err);
                alert("Error updating password: " + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.classList.remove('loading');
                submitBtn.innerHTML = 'Update Password & Log In <i data-lucide="save" style="width: 16px; height: 16px;"></i>';
                if (window.lucide) window.lucide.createIcons();
            }
        };
    }

    init();
});
