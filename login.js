// login.js
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    let supabase = null;
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');

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

    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!supabase) {
            alert("Database connection is initializing. Please try again.");
            return;
        }

        try {
            // Sign in using Supabase native auth
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                alert("Login failed: " + error.message);
                return;
            }

            if (data && data.user) {
                // Fetch the user's assigned role from public.user_profiles
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

                // Store active session in localStorage
                const session = {
                    email: data.user.email,
                    role: profile.role,
                    uid: data.user.id,
                    token: data.session.access_token,
                    timestamp: new Date().getTime()
                };
                localStorage.setItem('thrustvault_session', JSON.stringify(session));

                // Redirect based on role
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
    // Auto-fill credentials on click
    document.querySelectorAll('.quick-credentials li').forEach(li => {
        li.addEventListener('click', () => {
            emailInput.value = li.dataset.email;
            passwordInput.value = li.dataset.pass;
        });
    });

    init();
});
