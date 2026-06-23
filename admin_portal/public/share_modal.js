(function() {
    // 1. Inject Styles
    const styleId = 'share-modal-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            #share-modal-backdrop {
                position: fixed;
                inset: 0;
                background-color: rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                z-index: 100000;
                display: none;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #share-modal-backdrop.show {
                opacity: 1;
            }
            #share-modal-container {
                --sm-bg: #ffffff;
                --sm-text: #191c1d;
                --sm-input-bg: #f3f4f5;
                --sm-input-text: #43474f;
                --sm-subtext: #737780;
                --sm-border: rgba(115, 119, 128, 0.15);
                --sm-copy-bg: #d0e1fb;
                --sm-copy-text: #0f172a;
                --sm-close-color: #737780;
                --sm-divider: rgba(115, 119, 128, 0.1);
                
                background-color: var(--sm-bg);
                color: var(--sm-text);
                border-radius: 24px;
                padding: 24px;
                max-width: 480px;
                width: 90%;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                transform: scale(0.95);
                transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                box-sizing: border-box;
                font-family: 'Inter', sans-serif;
            }
            html.dark #share-modal-container {
                --sm-bg: #1c1c1e;
                --sm-text: #f5f5f7;
                --sm-input-bg: #2c2c2e;
                --sm-input-text: #e5e5ea;
                --sm-subtext: #8e8e93;
                --sm-border: rgba(255, 255, 255, 0.05);
                --sm-copy-bg: #a8c7fa;
                --sm-copy-text: #041e49;
                --sm-close-color: #aeaeb2;
                --sm-divider: rgba(255, 255, 255, 0.06);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
            }
            #share-modal-backdrop.show #share-modal-container {
                transform: scale(1);
            }
            .share-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 20px;
            }
            .share-modal-title {
                font-size: 20px;
                font-weight: 700;
                margin: 0;
                letter-spacing: -0.02em;
            }
            .share-modal-close-btn {
                background: none;
                border: none;
                color: var(--sm-close-color);
                cursor: pointer;
                padding: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: background-color 0.2s, color 0.2s;
            }
            .share-modal-close-btn:hover {
                background-color: var(--sm-input-bg);
                color: var(--sm-text);
            }
            .share-modal-input-group {
                display: flex;
                align-items: center;
                background-color: var(--sm-input-bg);
                border: 1px solid var(--sm-border);
                border-radius: 30px;
                padding: 4px 4px 4px 16px;
                margin-bottom: 16px;
                gap: 8px;
            }
            .share-modal-input {
                flex: 1;
                background: none;
                border: none;
                color: var(--sm-input-text);
                font-size: 14px;
                font-weight: 500;
                outline: none;
                padding: 6px 0;
                text-overflow: ellipsis;
                overflow: hidden;
                white-space: nowrap;
            }
            .share-modal-copy-btn {
                background-color: var(--sm-copy-bg);
                color: var(--sm-copy-text);
                border: none;
                border-radius: 24px;
                padding: 10px 18px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: opacity 0.2s, background-color 0.2s, transform 0.1s;
                white-space: nowrap;
            }
            .share-modal-copy-btn:hover {
                opacity: 0.95;
            }
            .share-modal-copy-btn:active {
                transform: scale(0.97);
            }
            .share-modal-note-area {
                display: flex;
                gap: 10px;
                align-items: flex-start;
                margin-bottom: 24px;
            }
            .share-modal-info-icon {
                color: var(--sm-subtext);
                flex-shrink: 0;
                margin-top: 2px;
            }
            .share-modal-note-text {
                font-size: 12px;
                color: var(--sm-subtext);
                line-height: 1.4;
                margin: 0;
            }
            .share-modal-divider {
                border-top: 1px solid var(--sm-divider);
                margin-bottom: 20px;
            }
            .share-modal-socials-grid {
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-start;
                gap: 16px 20px;
            }
            .share-modal-social-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                text-decoration: none;
                cursor: pointer;
                width: 58px;
            }
            .share-modal-social-icon-wrapper {
                width: 46px;
                height: 46px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .share-modal-social-item:hover .share-modal-social-icon-wrapper {
                transform: translateY(-3px);
                box-shadow: 0 6px 12px rgba(0, 0, 0, 0.12);
            }
            .share-modal-social-label {
                font-size: 11px;
                font-weight: 500;
                color: var(--sm-subtext);
                margin-top: 6px;
                text-align: center;
                white-space: nowrap;
            }
        `;
        document.head.appendChild(style);
    }

    // 2. Build the show function
    window.showShareModal = function(type, name, customUrl) {
        const shareUrl = customUrl || `${window.location.origin}/share/${type}/${encodeURIComponent(name)}`;
        const text = `Check out this ${type}: ${name}`;
        
        let backdrop = document.getElementById('share-modal-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'share-modal-backdrop';
            document.body.appendChild(backdrop);
        }
        
        backdrop.innerHTML = `
            <div id="share-modal-container">
                <div class="share-modal-header">
                    <h3 class="share-modal-title">Shareable public link</h3>
                    <button class="share-modal-close-btn" id="share-modal-close" title="Close">
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="share-modal-input-group">
                    <input type="text" class="share-modal-input" value="${shareUrl}" readonly id="share-modal-link-input">
                    <button class="share-modal-copy-btn" id="share-modal-copy">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" id="copy-btn-icon">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span id="copy-btn-text">Copy link</span>
                    </button>
                </div>
                <div class="share-modal-note-area">
                    <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="share-modal-info-icon">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                    <p class="share-modal-note-text">
                        Public links can be reshared. Share responsibly, delete at any time. If sharing with third parties, their policies apply.
                    </p>
                </div>
                <div class="share-modal-divider"></div>
                <div class="share-modal-socials-grid">
                    <a class="share-modal-social-item" href="https://api.whatsapp.com/send?text=${encodeURIComponent(text + ': ' + shareUrl)}" target="_blank" title="Share on WhatsApp">
                        <div class="share-modal-social-icon-wrapper" style="background-color: #25D366;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
                                <path d="M12.012 2c-5.506 0-9.969 4.471-9.969 9.986 0 1.762.459 3.479 1.33 4.99L1.696 23l6.135-1.613c1.46.797 3.109 1.217 4.793 1.217 5.505 0 9.968-4.471 9.968-9.986 0-2.67-1.036-5.18-2.918-7.067C17.747 3.66 14.995 2.62 12.012 2zm5.727 14.161c-.25.353-1.46 1.412-2.002 1.453-.54.041-1.026.195-3.398-.748-2.862-1.139-4.707-4.062-4.85-4.252-.143-.19-1.144-1.524-1.144-2.907 0-1.383.722-2.062 1.002-2.344.28-.282.608-.353.81-.353.203 0 .406.002.583.01.183.008.43-.072.675.52.25.603.856 2.084.93 2.227.075.143.125.31.026.509-.1.2-.15.322-.3.5-.15.176-.314.392-.45.526-.149.149-.304.31-.13.61.174.3.774 1.277 1.66 2.067.953.85 1.75 1.112 2.002 1.238.252.126.398.106.548-.067.15-.173.647-.754.82-1.01.173-.256.347-.215.584-.127.237.088 1.503.708 1.761.838.258.13.43.195.493.303.063.108.063.626-.188.979z"/>
                            </svg>
                        </div>
                        <span class="share-modal-social-label">WhatsApp</span>
                    </a>
                    <a class="share-modal-social-item" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}" target="_blank" title="Share on LinkedIn">
                        <div class="share-modal-social-icon-wrapper" style="background-color: #0077b5;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z"/>
                            </svg>
                        </div>
                        <span class="share-modal-social-label">LinkedIn</span>
                    </a>
                    <a class="share-modal-social-item" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}" target="_blank" title="Share on Facebook">
                        <div class="share-modal-social-icon-wrapper" style="background-color: #1877f2;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
                                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                            </svg>
                        </div>
                        <span class="share-modal-social-label">Facebook</span>
                    </a>
                    <a class="share-modal-social-item" href="https://x.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}" target="_blank" title="Share on X">
                        <div class="share-modal-social-icon-wrapper" style="background-color: #000000;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                            </svg>
                        </div>
                        <span class="share-modal-social-label">X</span>
                    </a>
                    <a class="share-modal-social-item" href="https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(text)}" target="_blank" title="Share on Reddit">
                        <div class="share-modal-social-icon-wrapper" style="background-color: #ff4500;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="white">
                                <path d="M24 11.5c0-1.65-1.35-3-3-3-.96 0-1.86.48-2.42 1.24-1.64-1-3.75-1.64-5.99-1.72l1.2-3.8 3.9.8c.1.9 1 1.6 2.0 1.6 1.1 0 2-.9 2-2s-.9-2-2-2c-.9 0-1.7.6-1.9 1.4l-4.3-.9c-.2-.05-.4.1-.5.3l-1.4 4.5c-2.32.04-4.5.67-6.19 1.7C5.86 8.98 4.96 8.5 4 8.5c-1.65 0-3 1.35-3 3 0 1.12.63 2.1 1.56 2.62-.04.19-.06.38-.06.57 0 3.32 4.02 6.01 9 6.01s9-2.69 9-6.01c0-.19-.02-.38-.06-.57.93-.52 1.56-1.5 1.56-2.62zM9 11.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zm7.5 4.5c-1.8 1.8-5.2 1.8-7 0-.2-.2-.2-.5 0-.7.2-.2.5-.2.7 0 1.4 1.4 4.2 1.4 5.6 0 .2-.2.5-.2.7 0 .2.2.2.5 0 .7zm-.5-1.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                            </svg>
                        </div>
                        <span class="share-modal-social-label">Reddit</span>
                    </a>
                </div>
            </div>
        `;
        
        backdrop.style.display = 'flex';
        backdrop.offsetHeight; // Force reflow
        backdrop.classList.add('show');
        
        const closeBtn = document.getElementById('share-modal-close');
        const copyBtn = document.getElementById('share-modal-copy');
        const linkInput = document.getElementById('share-modal-link-input');
        
        const hideModal = () => {
            backdrop.classList.remove('show');
            setTimeout(() => {
                backdrop.style.display = 'none';
            }, 300);
        };
        
        closeBtn.onclick = hideModal;
        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                hideModal();
            }
        };
        
        copyBtn.onclick = () => {
            linkInput.select();
            navigator.clipboard.writeText(shareUrl)
                .then(() => {
                    copyBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: inherit;">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Link copied</span>
                    `;
                    
                    setTimeout(() => {
                        copyBtn.innerHTML = `
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span>Copy link</span>
                        `;
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy share link:', err);
                });
        };
    };
})();
