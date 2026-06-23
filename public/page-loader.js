// page-loader.js
// Handles premium, lightweight page loading, transition animations, and persistent sidebar UX
(function() {
    // Intercept fetch calls for guest users globally to call /api/guest/... SQLite endpoints
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        let url = typeof input === 'string' ? input : (input && input.url);
        const sessionStr = localStorage.getItem('thrustvault_session');
        let isGuest = false;
        if (sessionStr) {
            try {
                const s = JSON.parse(sessionStr);
                isGuest = s.role === 'guest';
            } catch(e) {}
        } else {
            isGuest = true;
        }

        if (isGuest && typeof url === 'string' && url.startsWith('/api/') && !url.startsWith('/api/auth/') && !url.startsWith('/api/guest/') && !url.startsWith('/api/public/') && !url.startsWith('/api/request-demo')) {
            const newUrl = url.replace('/api/', '/api/guest/');
            if (typeof input === 'string') {
                input = newUrl;
            } else {
                input = new Request(newUrl, input);
            }
        }
        return originalFetch(input, init);
    };

    // Immediately set data-theme to prevent flash
    const isLandingPage = window.location.pathname === '/' || 
                          window.location.pathname.endsWith('/index.html') || 
                          window.location.pathname.endsWith('index.html') || 
                          window.location.pathname === '';
    const currentTheme = isLandingPage ? 'light' : (localStorage.getItem('thrustvault_theme') || 'light');
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    const path = window.location.pathname;
    
    // Set page context classes to documentElement
    const isDashboard = path.includes('dashboard');
    if (isDashboard) {
        document.documentElement.classList.add('page-dashboard');
        document.documentElement.classList.remove('page-other');
    } else {
        document.documentElement.classList.add('page-other');
        document.documentElement.classList.remove('page-dashboard');
    }

    // Detect if page has a sidebar (all routes except landing, login, and access request)
    const hasSidebar = path.includes('/admin/') || path.includes('/user/') || path.includes('/guest/') ||
                       path.includes('dashboard') || path.includes('analytics') || path.includes('explorer') ||
                       path.includes('finder') ||
                       path.includes('users') || path.includes('requests') || path.includes('schema') ||
                       path.includes('exports') || path.includes('imports') || path.includes('audit');
    const transitionSelector = hasSidebar ? '.main-content-wrapper' : 'body';

    // 1. Immediately inject preload styling to prevent Content Flash (FOUC)
    const style = document.createElement('style');
    style.id = 'tv-loader-preload-style';
    style.innerHTML = `
        .main-content-wrapper {
            position: relative;
        }
        html.tv-loading-state ${transitionSelector} {
            opacity: 0 !important;
            pointer-events: none !important;
        }
        html.tv-loading-state.tv-loaded ${transitionSelector} {
            opacity: 1 !important;
            pointer-events: auto !important;
            transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        html.tv-sidebar-loaded .sidebar-skeleton-wrapper {
            display: none !important;
        }
        #tv-progress-bar {
            position: fixed;
            top: 0;
            left: 0;
            height: 3px;
            background: linear-gradient(90deg, #2563eb, #3b82f6, #10b981, #2563eb);
            background-size: 300% 100%;
            z-index: 100000;
            width: 0%;
            transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
            box-shadow: 0 0 10px rgba(37, 99, 235, 0.6), 0 0 4px rgba(59, 130, 246, 0.4);
            animation: tv-bar-flow 2s linear infinite;
        }
        #tv-page-loader-overlay {
            position: ${hasSidebar ? 'absolute' : 'fixed'};
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.4);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            opacity: 1;
            transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: all;
        }
        [data-theme="dark"] #tv-page-loader-overlay {
            background: rgba(15, 23, 42, 0.4) !important;
        }
        #tv-page-loader-overlay.fade-out {
            opacity: 0 !important;
            pointer-events: none !important;
        }
        .tv-loader-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            padding: 30px;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.85);
            border: 1px solid rgba(226, 232, 240, 0.8);
            box-shadow: 0 10px 30px -10px rgba(15, 23, 42, 0.15);
            transform: scale(0.95);
            animation: tv-card-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        [data-theme="dark"] .tv-loader-card {
            background: rgba(30, 41, 59, 0.9) !important;
            border: 1px solid rgba(255, 255, 255, 0.05) !important;
            box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5) !important;
        }
        .tv-loader-logo {
            width: 50px;
            height: 50px;
            border-radius: 14px;
            background: rgba(37, 99, 235, 0.08);
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(37, 99, 235, 0.15);
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.05);
            color: #2563eb;
            animation: tv-logo-spin 3s linear infinite;
        }
        .tv-loader-text {
            font-family: 'Outfit', sans-serif;
            font-size: 0.95rem;
            font-weight: 600;
            color: #0f172a;
            letter-spacing: -0.01em;
        }
        [data-theme="dark"] .tv-loader-text {
            color: #f8fafc !important;
        }
        .tv-loader-pulse {
            width: 80px;
            height: 2px;
            background: #e2e8f0;
            border-radius: 2px;
            overflow: hidden;
            position: relative;
        }
        .tv-loader-pulse-bar {
            position: absolute;
            height: 100%;
            width: 40%;
            background: #2563eb;
            border-radius: 2px;
            animation: tv-pulse-flow 1.2s infinite ease-in-out;
        }
        
        @keyframes tv-bar-flow {
            0% { background-position: 0% 50%; }
            100% { background-position: 300% 50%; }
        }
        @keyframes tv-card-in {
            to { transform: scale(1); }
        }
        @keyframes tv-logo-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        @keyframes tv-pulse-flow {
            0% { left: -40%; }
            100% { left: 100%; }
        }
    `;
    document.documentElement.appendChild(style);
    // document.documentElement.classList.add('tv-loading-state');

    // State trackers
    let progressInterval = null;
    let currentProgress = 0;

    function startProgress(pb) {
        if (progressInterval) clearInterval(progressInterval);
        currentProgress = 0;
        pb.style.width = '0%';
        pb.style.opacity = '1';
        
        progressInterval = setInterval(() => {
            if (currentProgress < 75) {
                currentProgress += Math.random() * 8 + 2;
            } else if (currentProgress < 92) {
                currentProgress += Math.random() * 2 + 0.3;
            }
            pb.style.width = currentProgress + '%';
        }, 120);
    }

    function completeProgress(pb) {
        if (progressInterval) clearInterval(progressInterval);
        if (pb) {
            pb.style.width = '100%';
            setTimeout(() => {
                pb.style.opacity = '0';
            }, 180);
        }
    }

    // Sidebar Utilities
    function highlightActiveSidebarLink(sidebarEl) {
        const currentPath = window.location.pathname;
        const currentPage = currentPath.substring(currentPath.lastIndexOf('/') + 1) || 'index.html';
        sidebarEl.querySelectorAll('.btn-sidebar-link').forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
                const isExactMatch = currentPath === href || currentPath.replace(/\/$/, '') === href.replace(/\/$/, '');
                const isRelativeMatch = currentPage.startsWith(href) || href.startsWith(currentPage);
                if (isExactMatch || isRelativeMatch) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            }
        });
    }

    function syncSidebarUserProfiles(sidebarEl) {
        const sessionEmailEl = sidebarEl.querySelector('#session-email');
        const sessionInitialsEl = sidebarEl.querySelector('#user-avatar-initials');
        const sessionStr = localStorage.getItem('thrustvault_session');
        if (sessionStr && sessionEmailEl) {
            try {
                const session = JSON.parse(sessionStr);
                sessionEmailEl.textContent = session.email;
                if (sessionInitialsEl && session.email) {
                    sessionInitialsEl.textContent = session.email.charAt(0).toUpperCase();
                }
            } catch(e) {}
        } else if (sessionEmailEl) {
            sessionEmailEl.textContent = 'Anonymous Guest';
            if (sessionInitialsEl) {
                sessionInitialsEl.textContent = 'G';
            }
        }
    }

    // 2. DOM Observer to immediately inject cached sidebar HTML during page parsing (prevents flicker of skeletons)
    let sidebarObserver = null;
    if (hasSidebar) {
        sidebarObserver = new MutationObserver(() => {
            const sidebarEl = document.querySelector('.sidebar');
            if (sidebarEl) {
                sidebarObserver.disconnect();
                
                let sidebarRole = sidebarEl.getAttribute('data-sidebar');
                if (sidebarRole === 'dynamic') {
                    const sessionStr = localStorage.getItem('thrustvault_session');
                    if (sessionStr) {
                        try {
                            const session = JSON.parse(sessionStr);
                            sidebarRole = session.role;
                        } catch(e) {
                            sidebarRole = 'guest';
                        }
                    } else {
                        sidebarRole = 'guest';
                    }
                }
                if (sidebarRole === 'user') {
                    sidebarRole = 'user';
                }
                
                const cacheKey = `thrustvault_sidebar_html_${sidebarRole}_v2.2`;
                const cachedHTML = sessionStorage.getItem(cacheKey);
                if (cachedHTML) {
                    const existingScript = sidebarEl.querySelector('script');
                    sidebarEl.innerHTML = '';
                    if (existingScript) {
                        sidebarEl.appendChild(existingScript);
                    }
                    
                    const templateWrapper = document.createElement('div');
                    templateWrapper.innerHTML = cachedHTML;
                    while (templateWrapper.firstChild) {
                        sidebarEl.appendChild(templateWrapper.firstChild);
                    }
                    
                    highlightActiveSidebarLink(sidebarEl);
                    syncSidebarUserProfiles(sidebarEl);
                    
                    window.sidebarLoaded = true;
                    window.sidebarRole = sidebarRole;
                    document.documentElement.classList.add('tv-sidebar-loaded');
                    if (window.lucide) window.lucide.createIcons();
                }
            }
        });
        sidebarObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    // 3. Initialize loader components on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        // Inject progress bar
        /*
        const pb = document.createElement('div');
        pb.id = 'tv-progress-bar';
        document.body.appendChild(pb);
        
        // Inject glassmorphic transition overlay inside the correct container
        const overlay = document.createElement('div');
        overlay.id = 'tv-page-loader-overlay';
        overlay.innerHTML = `
            <div class="tv-loader-card">
                <div class="tv-loader-logo">
                    <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83M16.62 12l-5.74 9.94"></path>
                    </svg>
                </div>
                <div class="tv-loader-text">Loading ThrustVault</div>
                <div class="tv-loader-pulse">
                    <div class="tv-loader-pulse-bar"></div>
                </div>
            </div>
        `;
        
        const loaderContainer = hasSidebar ? (document.querySelector('.main-content-wrapper') || document.body) : document.body;
        loaderContainer.appendChild(overlay);

        startProgress(pb);
        */

        // Sidebar handler
        const sidebarEl = document.querySelector('.sidebar');
        if (sidebarEl) {
            // Remove skeleton placeholder from DOM if cached sidebar is active
            if (window.sidebarLoaded) {
                const skeleton = sidebarEl.querySelector('.sidebar-skeleton-wrapper');
                if (skeleton) skeleton.remove();
            }

            let sidebarRole = sidebarEl.getAttribute('data-sidebar');
            if (sidebarRole === 'dynamic') {
                const sessionStr = localStorage.getItem('thrustvault_session');
                if (sessionStr) {
                    try {
                        const session = JSON.parse(sessionStr);
                        sidebarRole = session.role;
                    } catch(e) {
                        sidebarRole = 'guest';
                    }
                } else {
                    sidebarRole = 'guest';
                }
            }
            if (sidebarRole === 'user') {
                sidebarRole = 'user';
            }

            // Centralized Sidebar Event Initializer (reusable for cached and fetched versions)
            function initializeSidebarEvents(sidebarEl, role) {
                const sidebarFooter = sidebarEl.querySelector('.sidebar-footer');
                if (sidebarFooter) {
                    // Check if toggleBtn is already added
                    let toggleBtn = sidebarFooter.querySelector('#btn-theme-toggle');
                    if (!toggleBtn) {
                        toggleBtn = document.createElement('button');
                        toggleBtn.className = 'btn-theme-toggle';
                        toggleBtn.id = 'btn-theme-toggle';
                        toggleBtn.title = 'Toggle Theme';
                        
                        const currentTheme = localStorage.getItem('thrustvault_theme') || 'light';
                        const iconName = currentTheme === 'dark' ? 'sun' : 'moon';
                        const textLabel = currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode';
                        
                        toggleBtn.style.cssText = 'width:auto; padding:8px 16px; background:transparent; border:1px solid var(--border-color); border-radius:var(--radius-md); font-size:0.85rem; font-weight:600; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; color:var(--text-primary); transition:all 0.2s; white-space:nowrap; box-sizing: border-box;';
                        toggleBtn.innerHTML = `<i data-lucide="${iconName}" style="width:16px; height:16px;"></i> <span>${textLabel}</span>`;
                        
                        const logoutBtn = sidebarFooter.querySelector('#btn-logout') || sidebarFooter.querySelector('.btn-logout-premium');
                        if (logoutBtn) {
                            logoutBtn.parentNode.insertBefore(toggleBtn, logoutBtn);
                        } else {
                            sidebarFooter.appendChild(toggleBtn);
                        }
                    }
                    
                    const logoutBtn = sidebarFooter.querySelector('#btn-logout') || sidebarFooter.querySelector('.btn-logout-premium');
                    if (logoutBtn) {
                        const sessionStr = localStorage.getItem('thrustvault_session');
                        let showSignIn = !sessionStr;
                        if (sessionStr) {
                            try {
                                const session = JSON.parse(sessionStr);
                                if (session.role === 'guest') {
                                    showSignIn = true;
                                }
                            } catch(e) {}
                        }
                        if (showSignIn) {
                            logoutBtn.innerHTML = '<i data-lucide="log-in" style="width:16px; height:16px; vertical-align:middle; margin-right:8px;"></i>Sign In';
                            logoutBtn.title = 'Sign In';
                            logoutBtn.onclick = (e) => {
                                e.preventDefault();
                                window.location.href = '/login';
                            };
                        } else {
                            logoutBtn.onclick = (e) => {
                                e.preventDefault();
                                if (confirm("Are you sure you want to log out of ThrustVault?")) {
                                    const sessionStr = localStorage.getItem('thrustvault_session');
                                    if (sessionStr) {
                                        try {
                                            const session = JSON.parse(sessionStr);
                                            fetch('/api/log-activity', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    email: session.email,
                                                    role: session.role,
                                                    action: 'Logout',
                                                    details: 'Logged out successfully.'
                                                })
                                            }).catch(err => console.error(err));
                                        } catch(err) {}
                                    }
                                    localStorage.removeItem('thrustvault_session');
                                    
                                    fetch('/api/auth/logout', { method: 'POST' })
                                        .finally(() => {
                                            window.location.href = '/login';
                                        });
                                }
                            };
                        }
                    }
                    
                    toggleBtn.onclick = () => {
                        const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
                        document.documentElement.setAttribute('data-theme', theme);
                        if (theme === 'dark') {
                            document.documentElement.classList.add('dark');
                        } else {
                            document.documentElement.classList.remove('dark');
                        }
                        localStorage.setItem('thrustvault_theme', theme);
                        
                        const newIcon = theme === 'dark' ? 'sun' : 'moon';
                        const newText = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
                        toggleBtn.innerHTML = `<i data-lucide="${newIcon}" style="width:16px; height:16px;"></i> <span>${newText}</span>`;
                        if (window.lucide) window.lucide.createIcons();
                    };
                }
                
                const toggleBtn = sidebarEl.querySelector('.btn-toggle-sidebar');
                if (toggleBtn) {
                    toggleBtn.onclick = () => {
                        sidebarEl.classList.toggle('collapsed');
                        const isCollapsed = sidebarEl.classList.contains('collapsed');
                        localStorage.setItem('thrustvault_sidebar_collapsed', isCollapsed);
                    };
                }
                
                const catalogDropdownToggle = sidebarEl.querySelector('#catalog-dropdown-toggle');
                if (catalogDropdownToggle) {
                    catalogDropdownToggle.onclick = (e) => {
                        e.preventDefault();
                        const dropdownWrapper = catalogDropdownToggle.closest('.sidebar-dropdown-wrapper');
                        if (dropdownWrapper) {
                            dropdownWrapper.classList.toggle('expanded');
                        }
                    };
                }
                
                // Bind global search input handling (redirect to dashboard on Enter if on another page)
                const searchInput = sidebarEl.querySelector('#search-input');
                const isDashboard = window.location.pathname.includes('dashboard');
                const isExplorer = window.location.pathname.includes('explorer');
                if (searchInput && !isDashboard && !isExplorer) {
                    searchInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            const query = searchInput.value.trim();
                            if (query) {
                                window.location.href = '/dashboard?search=' + encodeURIComponent(query);
                            }
                        }
                    });
                }

                syncSidebarUserProfiles(sidebarEl);
                if (window.lucide) window.lucide.createIcons();
                window.dispatchEvent(new CustomEvent('sidebarLoaded', { detail: { role: role } }));
            }

            if (window.sidebarLoaded) {
                // Already injected synchronously, just bind event listeners
                initializeSidebarEvents(sidebarEl, sidebarRole);
            } else {
                // First load: fetch, cache, and then render
                const cacheKey = `thrustvault_sidebar_html_${sidebarRole}_v2.2`;
                fetch(`sidebar_${sidebarRole}.html`)
                    .then(res => {
                        if (!res.ok) throw new Error("Failed to load sidebar template");
                        return res.text();
                    })
                    .then(html => {
                        sessionStorage.setItem(cacheKey, html);
                        
                        const existingScript = sidebarEl.querySelector('script');
                        sidebarEl.innerHTML = '';
                        if (existingScript) {
                            sidebarEl.appendChild(existingScript);
                        }
                        
                        const templateWrapper = document.createElement('div');
                        templateWrapper.innerHTML = html;
                        while (templateWrapper.firstChild) {
                            sidebarEl.appendChild(templateWrapper.firstChild);
                        }
                        
                        // Clean up skeletons if parsed
                        const skeleton = sidebarEl.querySelector('.sidebar-skeleton-wrapper');
                        if (skeleton) skeleton.remove();

                        highlightActiveSidebarLink(sidebarEl);
                        window.sidebarLoaded = true;
                        window.sidebarRole = sidebarRole;
                        document.documentElement.classList.add('tv-sidebar-loaded');
                        initializeSidebarEvents(sidebarEl, sidebarRole);
                    })
                    .catch(err => {
                        console.error("Sidebar loading error:", err);
                    });
            }
        }

        // 3b. Background session validation check
        const isProtectedRoute = path.includes('/admin/') || path.includes('/user/') || path.includes('/guest/') ||
                                 path.includes('dashboard') || path.includes('analytics') || path.includes('explorer') ||
                                 path.includes('finder') ||
                                 path.includes('users') || path.includes('requests') || path.includes('schema') ||
                                 path.includes('exports') || path.includes('imports') || path.includes('audit');
        
        if (isProtectedRoute) {
            fetch('/api/auth/session')
                .then(res => res.json())
                .then(sessionRes => {
                    if (!sessionRes.logged_in) {
                        localStorage.removeItem('thrustvault_session');
                        const isGuestAllowedPage = path.endsWith('/dashboard') || path.includes('dashboard') ||
                                                   path.endsWith('/analytics') || path.includes('analytics') ||
                                                   path.endsWith('/explorer') || path.includes('explorer');
                        if (!isGuestAllowedPage) {
                            window.location.href = '/login';
                        }
                    } else {
                        const sessionData = {
                            email: sessionRes.email,
                            role: sessionRes.role,
                            uid: sessionRes.uid,
                            timestamp: Date.now()
                        };
                        localStorage.setItem('thrustvault_session', JSON.stringify(sessionData));
                    }
                })
                .catch(err => {
                    console.error("Session verification error:", err);
                });
        }
    });

    // 4. Page load completed event
    function revealPage() {
        if (document.documentElement.classList.contains('tv-loaded')) return;
        
        const pb = document.getElementById('tv-progress-bar');
        const overlay = document.getElementById('tv-page-loader-overlay');
        
        completeProgress(pb);
        
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }
        
        // Remove loading state AND add loaded — must remove tv-loading-state so its
        // opacity:0 rule no longer applies.
        document.documentElement.classList.remove('tv-loading-state');
        document.documentElement.classList.add('tv-loaded');
        if (window.lucide) window.lucide.createIcons();
    }

    window.addEventListener('load', revealPage);
    setTimeout(revealPage, 800);

    // 5. Intercept link navigation (Disabled to remove custom loading transitions)
    /*
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a');
        if (!anchor) return;
        
        const href = anchor.getAttribute('href');
        const target = anchor.getAttribute('target');
        
        if (href && 
            !href.startsWith('#') && 
            !href.startsWith('javascript:') && 
            !anchor.hasAttribute('download') &&
            !target && 
            !e.ctrlKey && 
            !e.metaKey &&
            !anchor.classList.contains('disabled')) {
            
            e.preventDefault();
            
            // Re-inject overlay or restore it inside the scoped container
            let overlay = document.getElementById('tv-page-loader-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'tv-page-loader-overlay';
                overlay.classList.add('fade-out');
                overlay.innerHTML = `
                    <div class="tv-loader-card">
                        <div class="tv-loader-logo">
                            <svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M14.31 8l5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16L3.95 6.06M14.31 16H2.83M16.62 12l-5.74 9.94"></path>
                            </svg>
                        </div>
                        <div class="tv-loader-text">Loading Panel</div>
                        <div class="tv-loader-pulse">
                            <div class="tv-loader-pulse-bar"></div>
                        </div>
                    </div>
                `;
                const loaderContainer = hasSidebar ? (document.querySelector('.main-content-wrapper') || document.body) : document.body;
                loaderContainer.appendChild(overlay);
            }
            
            // Adjust overlay text based on destination
            const textEl = overlay.querySelector('.tv-loader-text');
            if (textEl) {
                if (href.includes('analytics')) textEl.textContent = 'Analyzing Curation Matrix';
                else if (href.includes('finder')) textEl.textContent = 'Configuring Propulsion Matrix';
                else if (href.includes('users')) textEl.textContent = 'Syncing Profile Registry';
                else if (href.includes('requests')) textEl.textContent = 'Retrieving Credentials';
                else if (href.includes('schema')) textEl.textContent = 'Parsing Template Columns';
                else if (href.includes('export')) textEl.textContent = 'Configuring Data compiler';
                else if (href.includes('import')) textEl.textContent = 'Initializing Import Pipeline';
                else if (href.includes('audit')) textEl.textContent = 'Syncing Operation Logs';
                else textEl.textContent = 'Loading Page';
            }

            const pb = document.getElementById('tv-progress-bar');
            if (pb) {
                pb.style.width = '0%';
                pb.style.opacity = '1';
                setTimeout(() => {
                    pb.style.width = '70%';
                }, 10);
            }

            // Start fade out of transition target selector, fade in of transition loader
            document.documentElement.classList.remove('tv-loaded');
            overlay.classList.remove('fade-out');
            
            setTimeout(() => {
                window.location.href = href;
            }, 200);
        }
    });
    */

    // 6. Handle back-forward cache restores
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            document.documentElement.classList.add('tv-loaded');
            const overlay = document.getElementById('tv-page-loader-overlay');
            if (overlay) overlay.classList.add('fade-out');
            const pb = document.getElementById('tv-progress-bar');
            if (pb) pb.style.opacity = '0';
        }
    });

    // 7. Global Custom Authentication / Sign-In Dialog helper
    window.showCustomAuthModal = function(message, targetUrl = '/login') {
        const existing = document.getElementById('custom-auth-modal');
        if (existing) {
            existing.remove();
        }

        const backdrop = document.createElement('div');
        backdrop.className = 'custom-auth-modal-backdrop';
        backdrop.id = 'custom-auth-modal';

        const lockIconHtml = `
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
        `;

        backdrop.innerHTML = `
            <div class="custom-auth-modal-container">
                <div class="custom-auth-modal-icon">
                    ${lockIconHtml}
                </div>
                <h3 class="custom-auth-modal-title">Sign In Required</h3>
                <p class="custom-auth-modal-message">${message || 'Sign In is required to access detailed pages and data.'}</p>
                <div class="custom-auth-modal-actions">
                    <button class="btn-custom-auth-cancel">Cancel</button>
                    <button class="btn-custom-auth-confirm">Sign In Now</button>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);

        // Force a style recalculation to trigger transition animation
        backdrop.offsetHeight;
        backdrop.classList.add('show');

        const destroyModal = () => {
            backdrop.classList.remove('show');
            setTimeout(() => {
                backdrop.remove();
            }, 250);
        };

        const btnCancel = backdrop.querySelector('.btn-custom-auth-cancel');
        const btnConfirm = backdrop.querySelector('.btn-custom-auth-confirm');

        btnCancel.onclick = () => {
            destroyModal();
        };

        btnConfirm.onclick = () => {
            destroyModal();
            if (targetUrl) {
                window.location.href = targetUrl;
            }
        };

        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                destroyModal();
            }
        };
    };
})();

