// page-loader.js
// Handles premium, lightweight page loading and transition animations
(function() {
    // 1. Immediately inject preload styling to prevent Content Flash (FOUC)
    const style = document.createElement('style');
    style.id = 'tv-loader-preload-style';
    style.innerHTML = `
        html.tv-loading-state body {
            opacity: 0 !important;
            pointer-events: none !important;
        }
        html.tv-loading-state.tv-loaded body {
            opacity: 1 !important;
            pointer-events: auto !important;
            transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
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
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(15, 23, 42, 0.35);
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
    document.documentElement.classList.add('tv-loading-state');

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

    // 2. Initialize loader components on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        // Inject progress bar
        const pb = document.createElement('div');
        pb.id = 'tv-progress-bar';
        document.body.appendChild(pb);
        
        // Inject glassmorphic transition overlay
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
        document.body.appendChild(overlay);

        startProgress(pb);
    });

    // 3. Page load completed event
    window.addEventListener('load', () => {
        const pb = document.getElementById('tv-progress-bar');
        const overlay = document.getElementById('tv-page-loader-overlay');
        
        completeProgress(pb);
        
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }
        
        // Reveal page contents
        document.documentElement.classList.add('tv-loaded');
    });

    // 4. Intercept link navigation to trigger slide-out animations
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a');
        if (!anchor) return;
        
        const href = anchor.getAttribute('href');
        const target = anchor.getAttribute('target');
        
        // Exclude specific links:
        // - Hash links/Javascript voids
        // - Outer targets (like _blank)
        // - Download actions
        // - Key-modifier clicks (Ctrl/Cmd)
        // - Disabled anchors
        if (href && 
            !href.startsWith('#') && 
            !href.startsWith('javascript:') && 
            !anchor.hasAttribute('download') &&
            !target && 
            !e.ctrlKey && 
            !e.metaKey &&
            !anchor.classList.contains('disabled')) {
            
            e.preventDefault();
            
            // Re-inject overlay or restore it
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
                document.body.appendChild(overlay);
            }
            
            // Adjust overlay text based on destination
            const textEl = overlay.querySelector('.tv-loader-text');
            if (textEl) {
                if (href.includes('analytics')) textEl.textContent = 'Analyzing Curation Matrix';
                else if (href.includes('users')) textEl.textContent = 'Syncing Profile Registry';
                else if (href.includes('requests')) textEl.textContent = 'Retrieving Credentials';
                else if (href.includes('schema')) textEl.textContent = 'Parsing Template Columns';
                else if (href.includes('export')) textEl.textContent = 'Configuring Data compiler';
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

            // Start fade out of current page, fade in of transition loader
            document.documentElement.classList.remove('tv-loaded');
            overlay.classList.remove('fade-out');
            
            setTimeout(() => {
                window.location.href = href;
            }, 200);
        }
    });

    // 5. Handle back-forward cache restores
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            document.documentElement.classList.add('tv-loaded');
            const overlay = document.getElementById('tv-page-loader-overlay');
            if (overlay) overlay.classList.add('fade-out');
            const pb = document.getElementById('tv-progress-bar');
            if (pb) pb.style.opacity = '0';
        }
    });
})();
