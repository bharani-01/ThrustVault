// login.js
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

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
            const logs = JSON.parse(localStorage.getItem('thrustvault_global_activity_logs')) || [];
            logs.push({
                id: 'log-' + Math.random().toString(36).substr(2, 9),
                email: email,
                role: role,
                action: action,
                details: details,
                timestamp: new Date().toISOString()
            });
            localStorage.setItem('thrustvault_global_activity_logs', JSON.stringify(logs));
        } catch (e) {
            console.error("Error writing activity log:", e);
        }
    }

    // View switcher helper
    function switchView(viewId, title, subtitle) {
        document.getElementById('view-signin').style.display = 'none';
        document.getElementById('view-forgot-email').style.display = 'none';
        document.getElementById('view-forgot-otp').style.display = 'none';
        document.getElementById('view-forgot-reset').style.display = 'none';

        document.getElementById(viewId).style.display = 'block';

        if (title) document.getElementById('login-card-title').innerHTML = title;
        if (subtitle) document.getElementById('login-card-subtitle').textContent = subtitle;

        if (window.lucide) window.lucide.createIcons();
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

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                alert("Login failed: " + error.message);
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
                document.cookie = `thrustvault_session=${cookieValue}; path=/; max-age=86400; SameSite=Strict; Secure`;

                logUserActivity(data.user.email, profile.role, 'Login', 'Logged in successfully.');

                if (profile.role === 'admin') {
                    window.location.href = 'admin_dashboard.html';
                } else if (profile.role === 'intern') {
                    window.location.href = 'intern_dashboard.html';
                } else if (profile.role === 'guest') {
                    window.location.href = 'guest_dashboard.html';
                } else {
                    alert("Invalid role assigned to this account.");
                    await supabase.auth.signOut();
                }
            }
        } catch (err) {
            console.error("Login request failed:", err);
            alert("Verification failed: " + err.message);
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
            submitBtn.innerHTML = 'Sending...';

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
            submitBtn.innerHTML = 'Verifying...';

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
            submitBtn.innerHTML = 'Updating...';

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
                submitBtn.innerHTML = 'Update Password & Log In <i data-lucide="save" style="width: 16px; height: 16px;"></i>';
                if (window.lucide) window.lucide.createIcons();
            }
        };
    }

    // Auto-fill credentials on click
    document.querySelectorAll('.quick-credentials li').forEach(li => {
        li.addEventListener('click', () => {
            emailInput.value = li.dataset.email;
            passwordInput.value = li.dataset.pass;

            // Also fill forgot email input
            const forgotEmailInput = document.getElementById('forgot-email');
            if (forgotEmailInput) {
                forgotEmailInput.value = li.dataset.email;
            }
        });
    });

    init();
});
