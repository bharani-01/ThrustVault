/**
 * ThrustVault — Detailed Onboarding Tour v3
 * Covers every feature with animated mini-demos and role-specific content.
 * Stored per-page in localStorage. Can be replayed via window.launchThrustVaultTour().
 */

(function () {
    'use strict';

    // =========================================================================
    // MINI-DEMO ANIMATION STYLES (injected once)
    // =========================================================================

    const DEMO_STYLES = `
        /* Shared demo wrapper */
        .ob-demo { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; margin-top:12px; position:relative; overflow:hidden; }
        .ob-demo-label { font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:#94a3b8; margin-bottom:10px; display:flex; align-items:center; gap:5px; }
        .ob-demo-label i { width:12px; height:12px; }

        /* Animated search bar demo */
        .ob-search-demo { display:flex; align-items:center; gap:8px; background:#fff; border:2px solid #2563eb; border-radius:8px; padding:8px 12px; }
        .ob-search-demo .cursor { display:inline-block; width:2px; height:15px; background:#2563eb; animation:ob-blink 1s step-end infinite; vertical-align:middle; margin-left:1px; }
        @keyframes ob-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .ob-search-typing { font-size:0.9rem; color:#0f172a; font-family:'Inter',sans-serif; }
        .ob-search-icon { color:#2563eb; width:16px; height:16px; flex-shrink:0; }

        /* Animated suggestion pill */
        .ob-suggestion { display:flex; align-items:center; gap:8px; padding:8px 10px; background:#fff; border:1px solid #e2e8f0; border-radius:6px; margin-top:6px; cursor:pointer; transition:background 0.2s; animation:ob-slide-in 0.3s ease both; }
        .ob-suggestion:nth-child(2){animation-delay:0.1s}
        .ob-suggestion:nth-child(3){animation-delay:0.2s}
        @keyframes ob-slide-in { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        .ob-badge-pill { font-size:0.65rem; font-weight:700; padding:2px 7px; border-radius:10px; background:#dbeafe; color:#1d4ed8; }
        .ob-badge-pill.green { background:#d1fae5; color:#065f46; }
        .ob-badge-pill.amber { background:#fef3c7; color:#92400e; }

        /* Category list demo */
        .ob-cat-list { display:flex; flex-direction:column; gap:6px; }
        .ob-cat-item { display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; background:#fff; border:1px solid #e2e8f0; font-size:0.82rem; font-weight:500; color:#374151; cursor:pointer; transition:all 0.2s; }
        .ob-cat-item.active { background:linear-gradient(135deg,#2563eb,#1d4ed8); color:#fff; border-color:#2563eb; transform:translateX(4px); }
        .ob-cat-item .ob-cat-dot { width:8px; height:8px; border-radius:50%; background:#94a3b8; flex-shrink:0; }
        .ob-cat-item.active .ob-cat-dot { background:rgba(255,255,255,0.7); }
        .ob-cat-count { margin-left:auto; font-size:0.72rem; opacity:0.75; }

        /* Chart demo bars */
        .ob-chart-demo { display:flex; align-items:flex-end; gap:6px; height:65px; padding:0 4px; }
        .ob-bar { flex:1; border-radius:4px 4px 0 0; background:linear-gradient(to top,#3b82f6,#93c5fd); transition:height 0.6s cubic-bezier(.34,1.56,.64,1); position:relative; }
        .ob-bar:nth-child(2) { background:linear-gradient(to top,#10b981,#6ee7b7); }
        .ob-bar:nth-child(3) { background:linear-gradient(to top,#f59e0b,#fcd34d); }
        .ob-bar:nth-child(4) { background:linear-gradient(to top,#8b5cf6,#c4b5fd); }
        .ob-bar:nth-child(5) { background:linear-gradient(to top,#ef4444,#fca5a5); }
        .ob-chart-x { display:flex; gap:6px; padding:0 4px; }
        .ob-chart-x span { flex:1; text-align:center; font-size:0.6rem; color:#94a3b8; }

        /* Table demo */
        .ob-table-demo { width:100%; border-collapse:collapse; font-size:0.75rem; }
        .ob-table-demo th { background:#f1f5f9; color:#64748b; font-weight:600; padding:5px 8px; text-align:left; border-bottom:1px solid #e2e8f0; }
        .ob-table-demo td { padding:5px 8px; border-bottom:1px solid #f1f5f9; color:#374151; }
        .ob-table-demo tr:last-child td { border-bottom:none; }
        .ob-table-demo tr { animation:ob-slide-in 0.3s ease both; }
        .ob-table-demo tr:nth-child(2){animation-delay:0.05s}
        .ob-table-demo tr:nth-child(3){animation-delay:0.1s}
        .ob-table-demo .row-highlight { background:#eff6ff; }

        /* Import flow demo */
        .ob-flow { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .ob-flow-step { display:flex; align-items:center; gap:5px; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:600; }
        .ob-flow-step.blue  { background:#dbeafe; color:#1d4ed8; }
        .ob-flow-step.green { background:#d1fae5; color:#065f46; }
        .ob-flow-step.amber { background:#fef3c7; color:#92400e; }
        .ob-flow-arrow { color:#94a3b8; font-size:1rem; }

        /* Draft banner demo */
        .ob-draft-banner { padding:10px 12px; background:linear-gradient(135deg,#fef3c7,#fffbeb); border:1px solid #fde68a; border-radius:8px; color:#b45309; font-size:0.78rem; font-weight:500; display:flex; align-items:center; gap:8px; }
        .ob-draft-tag { font-size:0.65rem; font-weight:700; padding:2px 8px; border-radius:10px; background:#fde68a; color:#92400e; }

        /* Metric card demo */
        .ob-metrics { display:flex; gap:8px; }
        .ob-metric { flex:1; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; text-align:center; }
        .ob-metric .ob-metric-val { font-size:1.2rem; font-weight:800; color:#2563eb; font-family:'Outfit',sans-serif; }
        .ob-metric .ob-metric-lbl { font-size:0.65rem; color:#64748b; font-weight:500; margin-top:2px; }

        /* Pulsing dot for live indicator */
        .ob-live-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; animation:ob-pulse 1.5s ease-in-out infinite; margin-right:4px; }
        @keyframes ob-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.5);opacity:0.6} }

        /* Animated typing text */
        .ob-type-text { overflow:hidden; white-space:nowrap; border-right:2px solid #2563eb; animation:ob-typing 2s steps(20,end) infinite alternate, ob-blink 0.75s step-end infinite; width:0; display:inline-block; vertical-align:bottom; }
        @keyframes ob-typing { from{width:0} to{width:100%} }

        /* Comparison table demo */
        .ob-compare-table { width:100%; border-collapse:collapse; font-size:0.72rem; }
        .ob-compare-table th { background:linear-gradient(135deg,#2563eb,#1d4ed8); color:#fff; padding:5px 8px; text-align:left; }
        .ob-compare-table td { padding:5px 8px; border-bottom:1px solid #f1f5f9; }
        .ob-compare-table td:first-child { color:#64748b; font-weight:600; }
        .ob-compare-table .win { color:#10b981; font-weight:700; }
        .ob-compare-table .lose { color:#94a3b8; }

        /* Curve chart demo */
        .ob-curve-demo { position:relative; height:60px; }
        .ob-curve-svg { width:100%; height:100%; }

        /* Export format badges */
        .ob-fmt-row { display:flex; gap:6px; flex-wrap:wrap; }
        .ob-fmt { padding:4px 10px; border-radius:6px; font-size:0.72rem; font-weight:700; }
        .ob-fmt.xlsx { background:#d1fae5; color:#065f46; }
        .ob-fmt.csv  { background:#e0f2fe; color:#0369a1; }
        .ob-fmt.json { background:#fef3c7; color:#92400e; }
        .ob-fmt.xml  { background:#ede9fe; color:#5b21b6; }
        .ob-fmt.html { background:#fee2e2; color:#991b1b; }

        /* Audit timeline */
        .ob-audit-feed { display:flex; flex-direction:column; gap:6px; }
        .ob-audit-row { display:flex; align-items:center; gap:8px; font-size:0.75rem; }
        .ob-audit-icon { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .ob-audit-icon.edit  { background:#dbeafe; color:#2563eb; }
        .ob-audit-icon.add   { background:#d1fae5; color:#10b981; }
        .ob-audit-icon.login { background:#ede9fe; color:#8b5cf6; }
        .ob-audit-icon.del   { background:#fee2e2; color:#ef4444; }

        /* Role badge */
        .ob-role { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px; font-size:0.72rem; font-weight:700; }
        .ob-role.admin  { background:linear-gradient(135deg,#dbeafe,#eff6ff); color:#1d4ed8; border:1px solid #bfdbfe; }
        .ob-role.user { background:linear-gradient(135deg,#d1fae5,#ecfdf5); color:#065f46; border:1px solid #a7f3d0; }
        .ob-role.guest  { background:linear-gradient(135deg,#fef3c7,#fffbeb); color:#92400e; border:1px solid #fde68a; }

        /* Step fade-in */
        .tv-ob-card { transition: opacity 0.15s ease; }

        /* Tip box */
        .ob-tip { display:flex; align-items:flex-start; gap:8px; padding:9px 12px; background:linear-gradient(135deg,#eff6ff,#f0fdf4); border:1px solid #bfdbfe; border-radius:8px; margin-top:10px; font-size:0.8rem; color:#1e40af; }
        .ob-tip svg { width:14px; height:14px; flex-shrink:0; margin-top:1px; color:#2563eb; }

        /* Kbd style */
        kbd { display:inline-block; padding:1px 5px; border:1px solid #cbd5e1; border-radius:4px; background:#f8fafc; font-size:0.72rem; font-family:monospace; color:#374151; }

        /* Throttle step row demo */
        .ob-grid-demo { display:flex; gap:4px; align-items:center; }
        .ob-grid-inp { flex:1; background:#fff; border:1px solid #e2e8f0; border-radius:5px; padding:4px 6px; font-size:0.72rem; color:#374151; text-align:center; }
        .ob-grid-inp.computed { background:#f1f5f9; color:#64748b; font-style:italic; }
    `;

    function injectStyles() {
        if (document.getElementById('tv-ob-demo-styles')) return;
        const s = document.createElement('style');
        s.id = 'tv-ob-demo-styles';
        s.textContent = DEMO_STYLES;
        document.head.appendChild(s);
    }

    // =========================================================================
    // PAGE DETECTION
    // =========================================================================

    function getPageSlug() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('admin_audit_logs') || path.includes('audit-logs'))       return 'audit_logs';
        if (path.includes('performance') || path.includes('analytics'))            return 'performance';
        if (path.includes('admin_exports') || path.includes('exports'))          return 'exports';
        if (path.includes('user_dashboard') || path.includes('user/dashboard'))       return 'user_catalog';
        if (path.includes('guest_dashboard') || path.includes('guest/dashboard'))        return 'guest_catalog';
        if (path.includes('admin_users') || path.includes('admin/users'))            return 'admin_users';
        if (path.includes('admin_access_requests') || path.includes('access-requests'))  return 'admin_access_requests';
        if (path.includes('admin_schema_customizer') || path.includes('schema-customizer'))return 'admin_schema';
        return 'admin_catalog';
    }

    function getPageRole() {
        const slug = getPageSlug();
        if (slug === 'user_catalog') return 'user';
        if (slug === 'guest_catalog')  return 'guest';
        const badge = document.getElementById('session-role-badge');
        if (badge) {
            const t = badge.textContent.toLowerCase();
            if (t.includes('user')) return 'user';
            if (t.includes('guest'))  return 'guest';
        }
        const email = (document.getElementById('session-email') || {}).textContent || '';
        if (email.includes('user')) return 'user';
        if (email.includes('guest'))  return 'guest';
        return 'admin';
    }

    // =========================================================================
    // SHARED DEMO HTML HELPERS
    // =========================================================================

    function demoSearch(typedText) {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">⚡ Live Demo</div>
            <div class="ob-search-demo">
                <svg class="ob-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <span class="ob-search-typing">${typedText}</span><span class="cursor"></span>
            </div>
            <div style="margin-top:8px;">
                <div class="ob-suggestion"><span style="font-size:0.8rem;color:#0f172a;font-weight:500;">T-Motor U12 II KV120</span><span class="ob-badge-pill" style="margin-left:auto;">5 kg</span></div>
                <div class="ob-suggestion"><span style="font-size:0.8rem;color:#0f172a;font-weight:500;">Hobbywing X9 Plus</span><span class="ob-badge-pill green" style="margin-left:auto;">20 kg</span></div>
                <div class="ob-suggestion"><span style="font-size:0.8rem;color:#0f172a;font-weight:500;">SunnySky X2212</span><span class="ob-badge-pill amber" style="margin-left:auto;">2 kg</span></div>
            </div>
        </div>`;
    }

    function demoCategories() {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">⚡ Live Demo</div>
            <div class="ob-cat-list">
                <div class="ob-cat-item"><span class="ob-cat-dot"></span>1 kg Thrust <span class="ob-cat-count">4 motors</span></div>
                <div class="ob-cat-item active"><span class="ob-cat-dot"></span>5 kg Thrust <span class="ob-cat-count">8 motors</span></div>
                <div class="ob-cat-item"><span class="ob-cat-dot"></span>20 kg Thrust <span class="ob-cat-count">6 motors</span></div>
            </div>
        </div>`;
    }

    function demoChart() {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">📊 Telemetry Chart Preview</div>
            <div class="ob-chart-demo">
                <div class="ob-bar" style="height:30%;"></div>
                <div class="ob-bar" style="height:50%;"></div>
                <div class="ob-bar" style="height:70%;"></div>
                <div class="ob-bar" style="height:90%;"></div>
                <div class="ob-bar" style="height:100%;"></div>
                <div class="ob-bar" style="height:75%;"></div>
                <div class="ob-bar" style="height:55%;"></div>
            </div>
            <div class="ob-chart-x"><span>10%</span><span>20%</span><span>40%</span><span>60%</span><span>80%</span><span>90%</span><span>100%</span></div>
        </div>`;
    }

    function demoCurve() {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">📈 Calibration Curve Preview</div>
            <div class="ob-curve-demo">
                <svg class="ob-curve-svg" viewBox="0 0 200 60" preserveAspectRatio="none">
                    <defs><linearGradient id="cg1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3"/>
                        <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.02"/>
                    </linearGradient></defs>
                    <path d="M 0 55 C 30 50, 60 35, 100 20 S 160 5, 200 2" stroke="#3b82f6" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                    <path d="M 0 55 C 30 50, 60 35, 100 20 S 160 5, 200 2 V 60 H 0 Z" fill="url(#cg1)"/>
                    <path d="M 0 58 C 30 54, 60 45, 100 35 S 165 18, 200 12" stroke="#10b981" stroke-width="2" fill="none" stroke-dasharray="4,3"/>
                    <circle cx="100" cy="20" r="4" fill="#3b82f6"/>
                    <circle cx="160" cy="5" r="4" fill="#10b981"/>
                </svg>
            </div>
            <div style="display:flex;gap:12px;margin-top:6px;font-size:0.68rem;">
                <span style="color:#3b82f6;font-weight:600;">— T-Motor U12 II</span>
                <span style="color:#10b981;font-weight:600;">- - Hobbywing X9</span>
            </div>
        </div>`;
    }

    function demoImportFlow() {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">🔁 Import Flow</div>
            <div class="ob-flow">
                <div class="ob-flow-step blue">📂 Upload .xlsx / .csv</div>
                <span class="ob-flow-arrow">→</span>
                <div class="ob-flow-step amber">🗂 Map Columns</div>
                <span class="ob-flow-arrow">→</span>
                <div class="ob-flow-step green">✅ Import to DB</div>
            </div>
        </div>`;
    }

    function demoDraftBanner() {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">📋 Draft Run Banner</div>
            <div class="ob-draft-banner">
                <span>⚠️</span>
                <span>This is a <strong>Draft Run</strong> <span class="ob-draft-tag">DRAFT</span>. Original motor: <strong>KV120 UAV Motor</strong>. Associate with a registered motor to finalize.</span>
            </div>
        </div>`;
    }

    function demoThrottleGrid() {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">🗂 Throttle Steps Grid</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
                <div class="ob-grid-demo">
                    <div class="ob-grid-inp" style="max-width:48px;font-weight:700;color:#2563eb;">10%</div>
                    <div class="ob-grid-inp">14.8</div>
                    <div class="ob-grid-inp">2.1</div>
                    <div class="ob-grid-inp computed">31.1</div>
                    <div class="ob-grid-inp">180</div>
                    <div class="ob-grid-inp">2800</div>
                    <div class="ob-grid-inp computed">5.79</div>
                </div>
                <div class="ob-grid-demo">
                    <div class="ob-grid-inp" style="max-width:48px;font-weight:700;color:#2563eb;">50%</div>
                    <div class="ob-grid-inp">14.7</div>
                    <div class="ob-grid-inp">9.8</div>
                    <div class="ob-grid-inp computed">144.1</div>
                    <div class="ob-grid-inp">1050</div>
                    <div class="ob-grid-inp">7200</div>
                    <div class="ob-grid-inp computed">7.28</div>
                </div>
                <div class="ob-grid-demo">
                    <div class="ob-grid-inp" style="max-width:48px;font-weight:700;color:#2563eb;">100%</div>
                    <div class="ob-grid-inp">14.5</div>
                    <div class="ob-grid-inp">28.4</div>
                    <div class="ob-grid-inp computed">411.8</div>
                    <div class="ob-grid-inp">2900</div>
                    <div class="ob-grid-inp">11200</div>
                    <div class="ob-grid-inp computed">7.04</div>
                </div>
            </div>
            <div style="margin-top:6px;font-size:0.68rem;color:#94a3b8;">Throttle · Voltage · Current · Power(auto) · Thrust · RPM · Eff.(auto)</div>
        </div>`;
    }

    function demoCompare() {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">⚖️ Side-by-Side Comparison</div>
            <table class="ob-compare-table">
                <thead><tr><th>Spec</th><th>T-Motor U12</th><th>Hobbywing X9</th></tr></thead>
                <tbody>
                    <tr><td>Max Thrust</td><td class="win">5.2 kg</td><td class="lose">4.9 kg</td></tr>
                    <tr><td>KV</td><td>120</td><td>100</td></tr>
                    <tr><td>ESC</td><td>Air 40A</td><td class="win">Air 60A</td></tr>
                    <tr><td>Weight</td><td class="lose">315 g</td><td class="win">280 g</td></tr>
                </tbody>
            </table>
        </div>`;
    }

    function demoExportFormats() {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">📤 Export Formats</div>
            <div class="ob-fmt-row">
                <span class="ob-fmt xlsx">Excel (.xlsx)</span>
                <span class="ob-fmt csv">CSV</span>
                <span class="ob-fmt json">JSON</span>
                <span class="ob-fmt xml">XML</span>
                <span class="ob-fmt html">HTML Table</span>
            </div>
        </div>`;
    }

    function demoAuditFeed() {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">🛡️ Live Audit Feed</div>
            <div class="ob-audit-feed">
                <div class="ob-audit-row">
                    <div class="ob-audit-icon login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg></div>
                    <span style="color:#374151;">admin@thrustvault.com <strong>logged in</strong></span>
                    <span style="color:#94a3b8;font-size:0.68rem;margin-left:auto;">Just now</span>
                </div>
                <div class="ob-audit-row">
                    <div class="ob-audit-icon edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
                    <span style="color:#374151;">user@... edited <strong>T-Motor U12 II</strong></span>
                    <span style="color:#94a3b8;font-size:0.68rem;margin-left:auto;">2 min ago</span>
                </div>
                <div class="ob-audit-row">
                    <div class="ob-audit-icon add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div>
                    <span style="color:#374151;">admin@... added <strong>new motor</strong> (5 kg)</span>
                    <span style="color:#94a3b8;font-size:0.68rem;margin-left:auto;">5 min ago</span>
                </div>
            </div>
        </div>`;
    }

    function demoMetrics() {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label"><span class="ob-live-dot"></span>Live Stats</div>
            <div class="ob-metrics">
                <div class="ob-metric"><div class="ob-metric-val">24</div><div class="ob-metric-lbl">Motors</div></div>
                <div class="ob-metric"><div class="ob-metric-val" style="color:#10b981;">6</div><div class="ob-metric-lbl">Categories</div></div>
                <div class="ob-metric"><div class="ob-metric-val" style="color:#f59e0b;">3</div><div class="ob-metric-lbl">Brands</div></div>
            </div>
        </div>`;
    }

    function demoBulkImport() {
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">📦 Bulk Import Preview</div>
            <table class="ob-table-demo">
                <thead><tr><th>Motor (Sheet)</th><th>DB Match</th><th>Rows</th><th>Status</th></tr></thead>
                <tbody>
                    <tr class="row-highlight"><td>T-Motor U12 II</td><td>✅ Matched</td><td>12</td><td><span class="ob-badge-pill green">Ready</span></td></tr>
                    <tr><td>KV120 UAV Motor</td><td>❌ Not Found</td><td>9</td><td><span class="ob-badge-pill amber">Draft</span></td></tr>
                    <tr><td>Hobbywing X9+</td><td>✅ Matched</td><td>11</td><td><span class="ob-badge-pill green">Ready</span></td></tr>
                </tbody>
            </table>
        </div>`;
    }

    function demoRoleCard(role) {
        const config = {
            admin:  { label:'Administrator', cls:'admin',  icon:'🔑', perms:'Full read+write+manage access', color:'#1d4ed8' },
            user: { label:'User',        cls:'user', icon:'✏️', perms:'Read+write; no system settings', color:'#065f46' },
            guest:  { label:'Guest',         cls:'guest',  icon:'👁️', perms:'Read-only catalog & analytics',  color:'#92400e' },
        }[role] || { label:'User', cls:'admin', icon:'👤', perms:'Standard access', color:'#374151' };
        return `
        <div class="ob-demo">
            <div class="ob-demo-label">🔐 Your Access Level</div>
            <div style="display:flex;align-items:center;gap:12px;padding:8px 0;">
                <span style="font-size:1.8rem;">${config.icon}</span>
                <div>
                    <div class="ob-role ${config.cls}">${config.label}</div>
                    <div style="font-size:0.75rem;color:#64748b;margin-top:5px;">${config.perms}</div>
                </div>
            </div>
        </div>`;
    }

    function tip(text) {
        return `<div class="ob-tip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span>${text}</span></div>`;
    }

    // =========================================================================
    // STEP DEFINITIONS
    // =========================================================================

    // ── ADMIN CATALOG ────────────────────────────────────────────────────────
    const STEPS_ADMIN_CATALOG = [
        {
            target: null,
            title: 'Welcome, Administrator 👋',
            icon: 'aperture',
            content: `<p>ThrustVault is your centralized UAV propulsion database. As <strong>Admin</strong>, you have full control — add motors, manage users, run imports/exports, and review audit logs.</p>
                      ${demoRoleCard('admin')}
                      <p style="margin-top:10px;color:#64748b;font-size:0.82rem;">This tour covers every feature. Use <kbd>→</kbd> or click <strong>Next</strong> to advance, <kbd>←</kbd> to go back, <kbd>Esc</kbd> to close.</p>`,
            position: 'center'
        },
        {
            target: '.sidebar-stats',
            title: 'Live Database Stats',
            icon: 'bar-chart-2',
            content: `<p>The two stat cards in the sidebar show real-time totals updated whenever data changes — no manual refresh needed.</p>
                      ${demoMetrics()}
                      ${tip('These counts include every thrust category and are scoped to all motors across all categories.')}`,
            position: 'right'
        },
        {
            target: '.category-list',
            title: 'Thrust Level Categories',
            icon: 'layers',
            content: `<p>Motors are organized by <strong>thrust class</strong>. Click any category to switch the catalog view. The active category is highlighted in blue.</p>
                      ${demoCategories()}
                      <p style="margin-top:10px;font-size:0.82rem;color:#64748b;">Click the <strong>+</strong> button at the top of the list to add a new custom thrust level (e.g., "10 kg Agricultural").</p>`,
            position: 'right'
        },
        {
            target: '.search-container',
            title: 'Smart Global Search',
            icon: 'search',
            content: `<p>Search across <em>all categories at once</em> with fuzzy matching. Results show motor name, manufacturer, ESC, and thrust badge.</p>
                      ${demoSearch('u12 t-mo')}
                      <p style="margin-top:10px;font-size:0.82rem;color:#64748b;">Use <kbd>↑</kbd> <kbd>↓</kbd> to navigate suggestions, <kbd>Enter</kbd> to open the motor. The <strong>×</strong> button clears the search.</p>`,
            position: 'bottom'
        },
        {
            target: '.topbar-actions',
            title: 'Data Operations: Import & Export',
            icon: 'file-output',
            content: `<p>The <strong>Data Operations</strong> dropdown contains all import/export actions:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li><strong>Export to CSV / JSON / Excel</strong> — instant catalog snapshots</li>
                        <li><strong>Custom Export…</strong> — choose columns and filters</li>
                        <li><strong>Import Data</strong> — upload CSV, JSON, or XLSX files</li>
                        <li><strong>Download Excel Template</strong> — standardized import sheet</li>
                      </ul>
                      ${demoImportFlow()}`,
            position: 'bottom'
        },
        {
            target: '.stats-visualization-section',
            title: 'Category Charts & Insights',
            icon: 'pie-chart',
            content: `<p>Below the category header you'll find two auto-generated charts:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li><strong>Manufacturer Distribution</strong> — doughnut chart by brand</li>
                        <li><strong>Thrust Range Distribution</strong> — bar chart showing spread</li>
                      </ul>
                      ${demoChart()}
                      ${tip('Charts update automatically when you switch categories or add/edit motors.')}`,
            position: 'top'
        },
        {
            target: '.motors-table-panel',
            title: 'Motor Catalog Table',
            icon: 'table',
            content: `<p>The main table lists all motors in the active category. Key features:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li><strong>Sort</strong> by name, brand, or max thrust</li>
                        <li><strong>Filter</strong> by brand from the dropdown</li>
                        <li><strong>Click any row</strong> to open the full motor profile</li>
                        <li><strong>Edit / Delete</strong> via the Actions column</li>
                        <li><strong>Checkbox</strong> each row to add to the comparison drawer</li>
                      </ul>`,
            position: 'top'
        },
        {
            target: '.comparison-drawer, #comparison-drawer',
            title: 'Motor Comparison Drawer',
            icon: 'git-compare',
            content: `<p>Select up to <strong>3 motors</strong> using the checkboxes and they appear in the comparison drawer at the bottom of the screen.</p>
                      ${demoCompare()}
                      <p style="margin-top:10px;font-size:0.82rem;color:#64748b;">Click <strong>Compare Side-by-Side</strong> to open a full spec comparison modal with winning values highlighted in green.</p>`,
            position: 'top'
        },
        {
            target: null,
            title: "Admin Tools in the Sidebar",
            icon: 'layout',
            content: `<p>The sidebar links give you access to all admin sections:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li>📊 <strong>Test Runs</strong> — create and import telemetry datasets</li>
                        <li>👥 <strong>User Management</strong> — view and manage all accounts</li>
                        <li>✅ <strong>Access Requests</strong> — approve/reject pending access</li>
                        <li>⚙️ <strong>Schema Customizer</strong> — add custom motor fields</li>
                        <li>📤 <strong>Data Exporter</strong> — advanced multi-format exports</li>
                        <li>🛡️ <strong>Audit Logs</strong> — tamper-evident activity feed</li>
                      </ul>
                      ${tip('Each sidebar page has its own guided tour. Click "How it works" on any page to replay.')}`,
            position: 'center'
        },
        {
            target: null,
            title: "You're All Set! ✅",
            icon: 'check-circle',
            content: `<p>You've completed the <strong>Admin Catalog Tour</strong>. Here's a quick recap:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li>Sidebar stats → live counts</li>
                        <li>Category list → filter by thrust class</li>
                        <li>Search → fuzzy search across all motors</li>
                        <li>Data Operations → import / export</li>
                        <li>Catalog table → browse, edit, compare</li>
                      </ul>
                      <p style="margin-top:10px;font-size:0.82rem;color:#64748b;">You can replay this tour anytime from the <strong>How it works</strong> button in the sidebar footer.</p>`,
            position: 'center'
        }
    ];

    // ── USER CATALOG ───────────────────────────────────────────────────────
    const STEPS_USER_CATALOG = [
        {
            target: null,
            title: 'Welcome, User ✏️',
            icon: 'aperture',
            content: `<p>ThrustVault is your motor specification workspace. As an <strong>User</strong>, you can add and edit motors, import data, and export the catalog — but you cannot manage users, approve access, or view audit logs.</p>
                      ${demoRoleCard('user')}`,
            position: 'center'
        },
        {
            target: '.sidebar-stats',
            title: 'Live Database Stats',
            icon: 'bar-chart-2',
            content: `<p>Real-time counts of total motors and thrust categories. These update automatically as data changes.</p>
                      ${demoMetrics()}`,
            position: 'right'
        },
        {
            target: '.category-list',
            title: 'Thrust Level Categories',
            icon: 'layers',
            content: `<p>Click any category to switch the catalog view. You can also add new custom thrust level categories using the <strong>+</strong> button at the top of the list.</p>
                      ${demoCategories()}
                      ${tip('Categories help organize motors by their maximum thrust class — e.g. 1 kg, 5 kg, 20 kg.')}`,
            position: 'right'
        },
        {
            target: '.search-container',
            title: 'Smart Global Search',
            icon: 'search',
            content: `<p>Search across all thrust categories at once with fuzzy matching. Each suggestion shows the thrust level badge.</p>
                      ${demoSearch('hobbywing')}
                      <p style="margin-top:8px;font-size:0.82rem;color:#64748b;">Use <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> to navigate suggestions. The search is instant — no need to press Enter first.</p>`,
            position: 'bottom'
        },
        {
            target: '.topbar-actions',
            title: 'Add Motor & Import Data',
            icon: 'plus-circle',
            content: `<p>Two primary actions are available from the topbar:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li><strong>Add Motor</strong> — opens the motor form to create a new entry</li>
                        <li><strong>Data Operations</strong> → bulk import via CSV/JSON/XLSX, or export the catalog</li>
                      </ul>
                      ${demoImportFlow()}`,
            position: 'bottom'
        },
        {
            target: '.motors-table-panel',
            title: 'Motor Catalog Table',
            icon: 'table',
            content: `<p>Browse all motors in the selected category. You can:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li><strong>Click any row</strong> to view the full motor profile (specs, custom params, reference links)</li>
                        <li><strong>Edit</strong> — modify motor data inline via the form modal</li>
                        <li><strong>Delete</strong> — remove a motor (requires confirmation)</li>
                        <li><strong>Checkbox</strong> — add to the comparison drawer (up to 3)</li>
                      </ul>`,
            position: 'top'
        },
        {
            target: null,
            title: "You're Ready to Go! 🚀",
            icon: 'check-circle',
            content: `<p>Explore the sidebar to navigate to <strong>Test Runs</strong> where you can create and import telemetry datasets.</p>
                      <p style="margin-top:10px;font-size:0.82rem;color:#64748b;">You can replay this tour anytime from the <strong>How it works</strong> button.</p>`,
            position: 'center'
        }
    ];

    // ── GUEST CATALOG ────────────────────────────────────────────────────────
    const STEPS_GUEST_CATALOG = [
        {
            target: null,
            title: 'Welcome to ThrustVault 👁️',
            icon: 'aperture',
            content: `<p>ThrustVault is a UAV propulsion database. In <strong>Guest mode</strong>, you can browse, search, compare, and export motor specs — but cannot add or edit data.</p>
                      ${demoRoleCard('guest')}`,
            position: 'center'
        },
        {
            target: '.banner-alert',
            title: 'Guest Read-Only Mode',
            icon: 'info',
            content: `<p>The yellow banner at the top confirms you're in <strong>read-only mode</strong>. All catalog data is visible, but buttons to add or edit motors are hidden.</p>
                      ${tip('To get write access, contact an administrator to upgrade your role to User or Admin.')}`,
            position: 'bottom'
        },
        {
            target: '.category-list',
            title: 'Browse by Thrust Class',
            icon: 'layers',
            content: `<p>Click any category in the sidebar to filter motors by thrust class — for example, 1 kg, 5 kg, or 20 kg UAV motors.</p>
                      ${demoCategories()}`,
            position: 'right'
        },
        {
            target: '.search-container',
            title: 'Global Fuzzy Search',
            icon: 'search',
            content: `<p>Search across all categories at once. Type any motor name, manufacturer, ESC, or propeller — fuzzy matching handles partial text and typos.</p>
                      ${demoSearch('t-motor kv')}`,
            position: 'bottom'
        },
        {
            target: '.motors-table-panel',
            title: 'Motor Catalog Table',
            icon: 'table',
            content: `<p>Browse all motors in the selected category. Click any row to open the full motor profile which includes:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li>Full specifications (KV, weight, dimensions)</li>
                        <li>Recommended ESC and propeller</li>
                        <li>Custom parameters added by admins</li>
                        <li>Reference links (datasheets, product pages)</li>
                        <li>Telemetry test data (if available)</li>
                      </ul>`,
            position: 'top'
        },
        {
            target: null,
            title: "Explore More Features",
            icon: 'trending-up',
            content: `<p>You also have access to <strong>Test Runs</strong> in the sidebar — create and import telemetry datasets for any motor.</p>
                      <p style="margin-top:8px;font-size:0.82rem;color:#64748b;">You can replay this tour anytime from the <strong>How it works</strong> button.</p>`,
            position: 'center'
        }
    ];

    // ── TEST RUNS ────────────────────────────────────────────────────────────
    function buildPerformanceSteps() {
        const role = getPageRole();
        const isAdmin = role === 'admin';
        const isUser = role === 'user';
        const canWrite = isAdmin || isUser;

        const roleNote = isAdmin
            ? `<p style="margin-top:10px;font-size:0.82rem;color:#64748b;">As an <strong>Admin</strong>, you can create new test runs, import sheets, and delete runs.</p>`
            : isUser
            ? `<p style="margin-top:10px;font-size:0.82rem;color:#64748b;">As an <strong>User</strong>, you can create new test runs and import spreadsheet data.</p>`
            : `<p style="margin-top:10px;font-size:0.82rem;color:#64748b;">As a <strong>Guest</strong>, you have read-only access to this page (data entry is restricted).</p>`;

        const steps = [
            {
                target: null,
                title: 'Test Runs 📋',
                icon: 'clipboard-list',
                content: `<p>Welcome to the Test Runs portal. Here, you can compile and import calibration datasets for brushless motors.</p>
                          ${roleNote}`,
                position: 'center'
            }
        ];

        if (canWrite) {
            steps.push({
                target: '#dataset-creator-form',
                title: 'Test Configuration',
                icon: 'info',
                content: `<p>Configure the physical parameters of your test run. Select the thrust category, select the motor, specify the propeller size, ESC, battery, and tester name.</p>`,
                position: 'right'
            });

            steps.push({
                target: '#btn-import-file',
                title: 'Spreadsheet Import',
                icon: 'upload',
                content: `<p>Use the <strong>Import Spreadsheet</strong> button to parse XLSX/CSV tables directly rather than typing throttle calibration points manually.</p>
                          ${demoImportFlow()}`,
                position: 'top'
            });

            steps.push({
                target: '#panel-saved-drafts',
                title: 'Saved Drafts',
                icon: 'clipboard-list',
                content: `<p>Drafts saved for unregistered motors are stored in the drafts panel. You can reload them to finalize details, or delete them.</p>`,
                position: 'right'
            });
        }

        steps.push({
            target: null,
            title: 'Test Runs Completed ✅',
            icon: 'check-circle',
            content: `<p>You've completed the Test Runs walkthrough. Use the sidebar to explore the rest of the application.</p>`,
            position: 'center'
        });

        return steps;
    }

    // ── AUDIT LOGS ───────────────────────────────────────────────────────────
    const STEPS_AUDIT = [
        {
            target: null,
            title: 'Audit Logs 🛡️',
            icon: 'shield-alert',
            content: `<p>A complete, tamper-evident activity log — every login, motor edit, category change, import, and schema modification is recorded here with full user attribution.</p>
                      ${demoAuditFeed()}`,
            position: 'center'
        },
        {
            target: '.metric-cards-row, .audit-metrics, .metrics-grid, .stats-row',
            title: 'Activity Metric Cards',
            icon: 'activity',
            content: `<p>Summary cards at the top of the page show key counts scoped to the selected date range:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li><strong>Total Events</strong> — all logged actions</li>
                        <li><strong>Data Mutations</strong> — create, update, delete operations</li>
                        <li><strong>Login Sessions</strong> — authenticated logins</li>
                        <li><strong>Catalog Changes</strong> — motor and category modifications</li>
                      </ul>
                      ${demoMetrics()}`,
            position: 'bottom'
        },
        {
            target: '.audit-log-table, #audit-log-table, .audit-table-section, .table-responsive',
            title: 'Event Feed Table',
            icon: 'list',
            content: `<p>Each row in the audit feed shows:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li><strong>User</strong> — email of who performed the action</li>
                        <li><strong>Action Type</strong> — login, create, update, delete, import, export</li>
                        <li><strong>Affected Resource</strong> — which motor, category, or system area</li>
                        <li><strong>Timestamp</strong> — exact UTC time</li>
                      </ul>
                      ${demoAuditFeed()}
                      ${tip('Use the search and filter controls to narrow events by type, user, or date range.')}`,
            position: 'top'
        },
        {
            target: null,
            title: 'Filtering & Exporting Logs',
            icon: 'filter',
            content: `<p>Above the table you'll find filter controls to narrow the audit feed:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li><strong>Date Range</strong> — today, last 7 days, last 30 days, custom</li>
                        <li><strong>Action Type</strong> — filter by login, create, update, delete…</li>
                        <li><strong>User</strong> — filter events by specific user email</li>
                      </ul>
                      ${tip('Audit logs are read-only and cannot be modified or deleted — even by admins.')}`,
            position: 'center'
        },
        {
            target: null,
            title: 'Audit Logs — Done! ✅',
            icon: 'check-circle',
            content: `<p>The audit log is your compliance and accountability layer. Any action taken on ThrustVault is recorded here for review.</p>
                      <p style="margin-top:10px;font-size:0.82rem;color:#64748b;">Return to the sidebar to explore other admin tools. You can replay this tour anytime from the <strong>How it works</strong> button.</p>`,
            position: 'center'
        }
    ];

    // ── DATA EXPORTS ─────────────────────────────────────────────────────────
    const STEPS_EXPORTS = [
        {
            target: null,
            title: 'Data Exporter 📤',
            icon: 'download',
            content: `<p>Export the entire motor catalog — or a filtered subset — in multiple formats. Choose exactly which columns to include and which categories to export.</p>
                      ${demoExportFormats()}`,
            position: 'center'
        },
        {
            target: '.export-config, .export-panel, #export-controls, .glass-panel',
            title: 'Configure Your Export',
            icon: 'settings',
            content: `<p>The left panel lets you configure the export:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li><strong>Thrust Categories</strong> — select one or all categories</li>
                        <li><strong>Columns</strong> — toggle which fields to include</li>
                        <li><strong>Format</strong> — Excel, CSV, JSON, XML, or HTML</li>
                      </ul>
                      ${demoExportFormats()}
                      ${tip('Large catalogs (500+ motors) export instantly. No wait time.')}`,
            position: 'right'
        },
        {
            target: null,
            title: 'Preview Before Exporting',
            icon: 'eye',
            content: `<p>Before downloading, you can preview the data in a table on the right side of the page — showing exactly which rows and columns will be exported.</p>
                      <div class="ob-demo">
                        <div class="ob-demo-label">📋 Export Preview (sample)</div>
                        <table class="ob-table-demo">
                            <thead><tr><th>Motor</th><th>Manufacturer</th><th>Max Thrust</th><th>KV</th></tr></thead>
                            <tbody>
                                <tr><td>U12 II KV120</td><td>T-Motor</td><td>5.2 kg</td><td>120</td></tr>
                                <tr><td>X9 Plus KV100</td><td>Hobbywing</td><td>4.9 kg</td><td>100</td></tr>
                            </tbody>
                        </table>
                      </div>`,
            position: 'center'
        },
        {
            target: null,
            title: 'Data Exporter — Done! ✅',
            icon: 'check-circle',
            content: `<p>Configure → Preview → Download. Exports are generated entirely in the browser — no server processing required.</p>
                      <p style="margin-top:10px;font-size:0.82rem;color:#64748b;">Navigate using the sidebar to return to the catalog or explore other admin tools.</p>`,
            position: 'center'
        }
    ];

    // ── USER MANAGEMENT ──────────────────────────────────────────────────────
    const STEPS_ADMIN_USERS = [
        {
            target: null,
            title: 'User Management 👥',
            icon: 'users',
            content: `<p>The User Management page lets you view and control all registered user accounts. You can see each user's role, email, and last login time.</p>
                      <div class="ob-demo">
                        <div class="ob-demo-label">👤 User Roles</div>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            <div style="display:flex;align-items:center;gap:8px;"><span class="ob-role admin">Admin</span><span style="font-size:0.8rem;color:#64748b;">Full access to all features</span></div>
                            <div style="display:flex;align-items:center;gap:8px;"><span class="ob-role user">User</span><span style="font-size:0.8rem;color:#64748b;">Add/edit motors, import data</span></div>
                            <div style="display:flex;align-items:center;gap:8px;"><span class="ob-role guest">Guest</span><span style="font-size:0.8rem;color:#64748b;">Read-only catalog and analytics</span></div>
                        </div>
                      </div>`,
            position: 'center'
        },
        {
            target: '.users-table, #users-table, .table-responsive',
            title: 'Users Table',
            icon: 'list',
            content: `<p>Each row shows a registered user with their email, role badge, and registration date. As an admin you can:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li><strong>Change Role</strong> — promote or demote a user</li>
                        <li><strong>Delete</strong> — remove a user account</li>
                      </ul>
                      ${tip('Role changes take effect on the user\'s next login.')}`,
            position: 'top'
        },
        {
            target: null,
            title: 'User Management — Done! ✅',
            icon: 'check-circle',
            content: `<p>Keep your team organized by assigning appropriate roles. Use the <strong>Access Requests</strong> page to review and approve new user sign-up requests.</p>`,
            position: 'center'
        }
    ];

    // ── ACCESS REQUESTS ──────────────────────────────────────────────────────
    const STEPS_ACCESS_REQUESTS = [
        {
            target: null,
            title: 'Access Requests ✅',
            icon: 'user-check',
            content: `<p>When someone signs up for ThrustVault and requests access, their request appears here for admin review. You can <strong>approve</strong> or <strong>reject</strong> requests and assign roles.</p>
                      <div class="ob-demo">
                        <div class="ob-demo-label">📋 Pending Request Example</div>
                        <div style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;">
                            <div style="font-size:0.85rem;font-weight:600;color:#0f172a;">newuser@example.com</div>
                            <div style="font-size:0.75rem;color:#64748b;margin-top:3px;">Requested: User access</div>
                            <div style="display:flex;gap:8px;margin-top:8px;">
                                <span style="padding:4px 10px;border-radius:6px;background:#d1fae5;color:#065f46;font-size:0.75rem;font-weight:600;">✅ Approve</span>
                                <span style="padding:4px 10px;border-radius:6px;background:#fee2e2;color:#991b1b;font-size:0.75rem;font-weight:600;">❌ Reject</span>
                            </div>
                        </div>
                      </div>`,
            position: 'center'
        },
        {
            target: '.requests-table, .table-responsive',
            title: 'Pending Requests Table',
            icon: 'inbox',
            content: `<p>The table shows all pending access requests with the requestor's email and their requested role. The red badge on the sidebar link shows the count of pending requests.</p>
                      ${tip('Approved users are immediately promoted to the assigned role. Rejected users are notified and remain at Guest level.')}`,
            position: 'top'
        },
        {
            target: null,
            title: 'Access Requests — Done! ✅',
            icon: 'check-circle',
            content: `<p>Keep your team secure by reviewing and approving access requests promptly. The sidebar badge will alert you when new requests arrive.</p>`,
            position: 'center'
        }
    ];

    // ── SCHEMA CUSTOMIZER ────────────────────────────────────────────────────
    const STEPS_ADMIN_SCHEMA = [
        {
            target: null,
            title: 'Schema Customizer ⚙️',
            icon: 'settings',
            content: `<p>The Schema Customizer lets you add <strong>custom fields</strong> to motor entries — beyond the standard fields like KV, max thrust, and ESC. For example: "Frame Compatibility", "IP Rating", or "Custom Test Notes".</p>
                      <div class="ob-demo">
                        <div class="ob-demo-label">🏷️ Custom Field Types</div>
                        <div class="ob-fmt-row">
                            <span class="ob-fmt xlsx">Text</span>
                            <span class="ob-fmt csv">Number</span>
                            <span class="ob-fmt json">Boolean</span>
                            <span class="ob-fmt xml">Select</span>
                            <span class="ob-fmt html">Date</span>
                        </div>
                      </div>`,
            position: 'center'
        },
        {
            target: '.schema-fields, .fields-panel, .glass-panel',
            title: 'Managing Custom Fields',
            icon: 'list',
            content: `<p>From this page you can:</p>
                      <ul style="margin:8px 0 0 16px;font-size:0.85rem;line-height:1.8;">
                        <li><strong>Add Field</strong> — define name, type, and whether it's required</li>
                        <li><strong>Reorder</strong> — drag to change the display order in motor forms</li>
                        <li><strong>Delete</strong> — removes the field from all motor entries</li>
                      </ul>
                      ${tip('Custom fields appear in the motor add/edit form and in the motor detail view for all users.')}`,
            position: 'right'
        },
        {
            target: null,
            title: 'Schema Customizer — Done! ✅',
            icon: 'check-circle',
            content: `<p>Use custom fields to capture data specific to your organization's workflow — from regulatory compliance fields to test lab notes.</p>
                      ${tip('Deleting a custom field is permanent and removes that data from all motors. Use with caution.')}`,
            position: 'center'
        }
    ];

    // Master step selector
    function getSteps() {
        const slug = getPageSlug();
        if (slug === 'audit_logs')            return STEPS_AUDIT;
        if (slug === 'performance')           return buildPerformanceSteps();
        if (slug === 'exports')               return STEPS_EXPORTS;
        if (slug === 'user_catalog')        return STEPS_USER_CATALOG;
        if (slug === 'guest_catalog')         return STEPS_GUEST_CATALOG;
        if (slug === 'admin_users')           return STEPS_ADMIN_USERS;
        if (slug === 'admin_access_requests') return STEPS_ACCESS_REQUESTS;
        if (slug === 'admin_schema')          return STEPS_ADMIN_SCHEMA;
        return STEPS_ADMIN_CATALOG;
    }

    // =========================================================================
    // STORAGE — per-page keys, localStorage + Supabase JSONB sync
    // =========================================================================

    // All possible pages per role
    const PAGE_DEFS = {
        admin:  [
            { slug: 'admin_catalog',        label: 'Catalog Dashboard',     icon: '🗄️' },
            { slug: 'performance',          label: 'Test Runs',             icon: '📋' },
            { slug: 'admin_users',          label: 'User Management',       icon: '👥' },
            { slug: 'admin_access_requests',label: 'Access Requests',       icon: '✅' },
            { slug: 'admin_schema',         label: 'Schema Customizer',     icon: '⚙️' },
            { slug: 'exports',              label: 'Data Exporter',         icon: '📤' },
            { slug: 'audit_logs',           label: 'Audit Logs',            icon: '🛡️' },
        ],
        user: [
            { slug: 'user_catalog', label: 'Catalog Dashboard',     icon: '🗄️' },
            { slug: 'performance',    label: 'Test Runs',             icon: '📋' },
        ],
        guest: [
            { slug: 'guest_catalog', label: 'Catalog Dashboard',     icon: '🗄️' },
            { slug: 'performance',   label: 'Test Runs',             icon: '📋' },
        ],
    };

    function getRole() {
        const session = JSON.parse(localStorage.getItem('thrustvault_session') || 'null');
        if (session && session.role) return session.role;
        return getPageRole();
    }

    function getPagesForRole() {
        const r = getRole();
        return PAGE_DEFS[r] || PAGE_DEFS.admin;
    }

    function pageKey(slug) { return 'tv_tour_page_' + slug; }

    function isPageDone(slug) { return localStorage.getItem(pageKey(slug)) === '1'; }
    function markPageDone(slug) { localStorage.setItem(pageKey(slug), '1'); }

    function getProgress() {
        const pages = getPagesForRole();
        const done  = pages.filter(p => isPageDone(p.slug)).length;
        return { done, total: pages.length, pages };
    }

    function anyPageDone() {
        return getPagesForRole().some(p => isPageDone(p.slug));
    }

    // ── Onboarding API (Server-Side Proxy) ──────────────────────────────────
    
    /**
     * Pull pages_progress from backend and merge into localStorage.
     * Called once on page load — keeps progress in sync across devices.
     */
    async function syncProgressFromSupabase() {
        const session = JSON.parse(localStorage.getItem('thrustvault_session') || 'null');
        if (!session || !session.uid) return;
        try {
            const res = await fetch('/api/admin/onboarding');
            const data = await res.json();
            if (!data || !data.pages_progress) return;
            let changed = false;
            Object.entries(data.pages_progress).forEach(([slug, done]) => {
                if (done && !isPageDone(slug)) { markPageDone(slug); changed = true; }
            });
            if (changed) renderProgressPill();
        } catch (e) { /* silent */ }
    }

    /**
     * Push a single page slug as done into backend pages_progress JSONB.
     * Fire-and-forget — does not block the UI.
     */
    async function pushPageDoneToSupabase(slug) {
        const session = JSON.parse(localStorage.getItem('thrustvault_session') || 'null');
        if (!session || !session.uid) return;
        try {
            let existingProgress = {};
            const pages = getPagesForRole();
            pages.forEach(p => {
                if (isPageDone(p.slug)) {
                    existingProgress[p.slug] = true;
                }
            });
            const updated = { ...existingProgress, [slug]: true };
            const allDone = getPagesForRole().every(p => updated[p.slug] === true);
            
            await fetch('/api/admin/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pages_progress: updated,
                    tour_completed: allDone
                })
            });
        } catch (e) { /* silent */ }
    }

    /**
     * Reset progress in backend for this user (used by resetOnboarding).
     */
    async function clearProgressInSupabase() {
        const session = JSON.parse(localStorage.getItem('thrustvault_session') || 'null');
        if (!session || !session.uid) return;
        try {
            await fetch('/api/admin/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pages_progress: {},
                    tour_completed: false
                })
            });
        } catch (e) { /* silent */ }
    }

    // ── Public API ───────────────────────────────────────────────────────────

    async function isCompleted() {
        if (isPageDone(getPageSlug())) return true;
        return false;
    }

    function markCompleted() {
        const slug = getPageSlug();
        markPageDone(slug);             // Instant — localStorage
        pushPageDoneToSupabase(slug);   // Async, non-blocking — Supabase JSONB
        renderProgressPill();
    }

    function resetOnboarding() {
        Object.keys(localStorage)
            .filter(k => k.startsWith('tv_tour_page_') || k.startsWith('tv_tour_done_'))
            .forEach(k => localStorage.removeItem(k));
        const pill = document.getElementById('tv-ob-progress-pill');
        if (pill) pill.remove();
        clearProgressInSupabase(); // Async, non-blocking
    }
    window.resetThrustVaultTour = resetOnboarding;

    // =========================================================================
    // PROGRESS PILL
    // =========================================================================

    function injectPillStyles() {
        if (document.getElementById('tv-ob-pill-styles')) return;
        const s = document.createElement('style');
        s.id = 'tv-ob-pill-styles';
        s.textContent = `
            #tv-ob-progress-pill {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 99990;
                font-family: 'Inter', sans-serif;
                animation: tv-pill-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
            }
            @keyframes tv-pill-in { from{opacity:0;transform:scale(0.7) translateY(20px)} to{opacity:1;transform:none} }

            .tv-pill-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 9px 14px;
                background: linear-gradient(135deg, #1e293b, #0f172a);
                border: 1px solid rgba(255,255,255,0.10);
                border-radius: 50px;
                cursor: pointer;
                box-shadow: 0 8px 24px rgba(0,0,0,0.25);
                transition: transform 0.2s, box-shadow 0.2s;
                user-select: none;
            }
            .tv-pill-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 12px 28px rgba(0,0,0,0.35);
            }
            .tv-pill-icon {
                font-size: 1rem;
                line-height: 1;
            }
            .tv-pill-text {
                font-size: 0.75rem;
                font-weight: 700;
                color: #e2e8f0;
                white-space: nowrap;
            }
            .tv-pill-count {
                background: linear-gradient(135deg, #2563eb, #06b6d4);
                color: #fff;
                font-size: 0.68rem;
                font-weight: 800;
                padding: 2px 8px;
                border-radius: 20px;
                min-width: 36px;
                text-align: center;
            }
            .tv-pill-count.done {
                background: linear-gradient(135deg, #10b981, #059669);
            }

            /* Dropdown panel */
            .tv-pill-panel {
                position: absolute;
                bottom: calc(100% + 10px);
                right: 0;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                box-shadow: 0 20px 50px rgba(15,23,42,0.18);
                padding: 16px;
                width: 240px;
                display: none;
                animation: tv-pill-panel-in 0.2s ease both;
            }
            @keyframes tv-pill-panel-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
            #tv-ob-progress-pill:hover .tv-pill-panel,
            .tv-pill-panel:hover { display: block; }
            .tv-pill-panel-title {
                font-size: 0.7rem;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: #94a3b8;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .tv-pill-progress-bar {
                height: 5px;
                background: #f1f5f9;
                border-radius: 10px;
                overflow: hidden;
                margin-bottom: 12px;
            }
            .tv-pill-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #2563eb, #06b6d4);
                border-radius: 10px;
                transition: width 0.5s ease;
            }
            .tv-pill-progress-fill.complete {
                background: linear-gradient(90deg, #10b981, #059669);
            }
            .tv-pill-page-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .tv-pill-page-item {
                display: flex;
                align-items: center;
                gap: 9px;
                padding: 6px 8px;
                border-radius: 8px;
                font-size: 0.78rem;
                font-weight: 500;
                color: #374151;
                cursor: pointer;
                transition: background 0.15s;
            }
            .tv-pill-page-item:hover { background: #f8fafc; }
            .tv-pill-page-item.current { background: #eff6ff; color: #1d4ed8; font-weight: 600; }
            .tv-pill-page-check {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                border: 2px solid #e2e8f0;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.6rem;
                transition: all 0.2s;
            }
            .tv-pill-page-check.done {
                background: #10b981;
                border-color: #10b981;
                color: #fff;
            }
            .tv-pill-page-check.current-undone {
                border-color: #2563eb;
                background: #eff6ff;
            }
            .tv-pill-replay {
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid #f1f5f9;
                width: 100%;
                background: none;
                border-left: none;
                border-right: none;
                border-bottom: none;
                font-family: 'Inter', sans-serif;
                font-size: 0.75rem;
                font-weight: 600;
                color: #2563eb;
                cursor: pointer;
                text-align: center;
                padding-bottom: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                transition: color 0.2s;
            }
            .tv-pill-replay:hover { color: #1d4ed8; }
        `;
        document.head.appendChild(s);
    }

    function renderProgressPill() {
        const { done, total, pages } = getProgress();

        // Hide pill if no pages started yet, OR if all pages are complete
        if (!anyPageDone()) return;
        const allDone = done === total;
        if (allDone) {
            const existing = document.getElementById('tv-ob-progress-pill');
            if (existing) existing.remove();
            return;
        }

        injectPillStyles();

        const existing = document.getElementById('tv-ob-progress-pill');
        if (existing) existing.remove();

        const pct     = Math.round((done / total) * 100);
        const curSlug = getPageSlug();

        const pageItems = pages.map(p => {
            const isDone    = isPageDone(p.slug);
            const isCurrent = p.slug === curSlug;
            const checkCls  = isDone ? 'done' : (isCurrent ? 'current-undone' : '');
            const checkIcon = isDone ? '✓' : (isCurrent ? '●' : '');
            const itemCls   = isCurrent ? 'tv-pill-page-item current' : 'tv-pill-page-item';
            return `
                <div class="${itemCls}">
                    <span class="tv-pill-page-check ${checkCls}">${checkIcon}</span>
                    <span>${p.icon} ${p.label}</span>
                    ${!isDone && isCurrent ? '<span style="margin-left:auto;font-size:0.65rem;background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:8px;font-weight:700;">HERE</span>' : ''}
                </div>`;
        }).join('');

        const pill = document.createElement('div');
        pill.id = 'tv-ob-progress-pill';
        pill.innerHTML = `
            <div class="tv-pill-panel">
                <div class="tv-pill-panel-title">
                    <span>Onboarding Progress</span>
                    <span style="color:#374151;font-weight:800;font-size:0.8rem;">${done}/${total}</span>
                </div>
                <div class="tv-pill-progress-bar">
                    <div class="tv-pill-progress-fill" style="width:${pct}%"></div>
                </div>
                <div class="tv-pill-page-list">${pageItems}</div>
                <button class="tv-pill-replay" onclick="window.launchThrustVaultTour && window.launchThrustVaultTour()">
                    ▶ Replay this page's tour
                </button>
            </div>
            <div class="tv-pill-btn">
                <span class="tv-pill-icon">🗺️</span>
                <span class="tv-pill-text">Onboarding</span>
                <span class="tv-pill-count">${done}/${total}</span>
            </div>
        `;
        document.body.appendChild(pill);
    }

    // =========================================================================
    // CARD STYLES (injected once)
    // =========================================================================

    function injectCardStyles() {
        if (document.getElementById('tv-ob-card-styles')) return;
        const s = document.createElement('style');
        s.id = 'tv-ob-card-styles';
        s.textContent = `
            .tv-ob-overlay {
                position: fixed; inset: 0; z-index: 99999;
                background: rgba(15,23,42,0.55);
                backdrop-filter: blur(2px);
                transition: opacity 0.3s ease;
            }
            .tv-ob-spotlight {
                position: fixed; z-index: 100000;
                box-shadow: 0 0 0 9999px rgba(15,23,42,0.55);
                pointer-events: none;
                transition: all 0.3s ease;
            }
            .tv-ob-card {
                position: fixed; z-index: 100001;
                width: 380px;
                background: #ffffff;
                border-radius: 16px;
                box-shadow: 0 25px 60px rgba(15,23,42,0.22), 0 0 0 1px rgba(255,255,255,0.1);
                padding: 22px 24px 18px;
                font-family: 'Inter', sans-serif;
                animation: tv-ob-card-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
                max-height: 88vh;
                overflow-y: auto;
                scrollbar-width: thin;
            }
            @keyframes tv-ob-card-in { from { opacity:0; transform: scale(0.95) translateY(8px); } to { opacity:1; transform:none; } }
            .tv-ob-card--center {
                top: 50% !important; left: 50% !important;
                transform: translate(-50%, -50%) !important;
            }
            .tv-ob-card-header {
                display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
            }
            .tv-ob-icon-wrap {
                width: 36px; height: 36px; border-radius: 10px;
                background: linear-gradient(135deg, #2563eb, #1d4ed8);
                display: flex; align-items: center; justify-content: center; flex-shrink: 0;
            }
            .tv-ob-icon-wrap svg, .tv-ob-icon-wrap i { width: 18px; height: 18px; color: #fff; }
            .tv-ob-step-counter {
                font-size: 0.72rem; font-weight: 600; color: #94a3b8;
                background: #f1f5f9; padding: 3px 8px; border-radius: 20px;
            }
            .tv-ob-skip {
                margin-left: auto; background: none; border: none; cursor: pointer;
                font-size: 0.75rem; color: #94a3b8; font-family: 'Inter',sans-serif;
                padding: 3px 6px; border-radius: 6px; transition: color 0.2s, background 0.2s;
            }
            .tv-ob-skip:hover { color: #ef4444; background: #fee2e2; }
            .tv-ob-title {
                font-family: 'Outfit', sans-serif; font-size: 1.15rem; font-weight: 700;
                color: #0f172a; margin: 0 0 10px; line-height: 1.3;
            }
            .tv-ob-body {
                font-size: 0.865rem; color: #475569; line-height: 1.65;
            }
            .tv-ob-body p { margin: 0 0 6px; }
            .tv-ob-body ul { margin: 0 0 6px 16px; padding: 0; }
            .tv-ob-body li { margin-bottom: 2px; }
            .tv-ob-body strong { color: #1e293b; }
            .tv-ob-body em { color: #2563eb; font-style: normal; font-weight: 500; }
            .tv-ob-dots {
                display: flex; gap: 5px; margin: 14px 0 10px; justify-content: center;
            }
            .tv-ob-dot {
                width: 7px; height: 7px; border-radius: 50%; background: #e2e8f0; cursor: pointer;
                transition: all 0.25s;
            }
            .tv-ob-dot.active { background: #2563eb; width: 18px; border-radius: 4px; }
            .tv-ob-actions {
                display: flex; gap: 10px; justify-content: flex-end; align-items: center;
                margin-top: 10px; border-top: 1px solid #f1f5f9; padding-top: 14px;
            }
            .tv-ob-btn-prev, .tv-ob-btn-next {
                display: flex; align-items: center; gap: 6px;
                padding: 9px 18px; border-radius: 9px; font-size: 0.85rem; font-weight: 600;
                cursor: pointer; font-family: 'Inter',sans-serif; border: none; transition: all 0.2s;
            }
            .tv-ob-btn-prev {
                background: #f1f5f9; color: #475569;
            }
            .tv-ob-btn-prev:hover { background: #e2e8f0; color: #1e293b; }
            .tv-ob-btn-next {
                background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff;
                box-shadow: 0 4px 14px rgba(37,99,235,0.3);
            }
            .tv-ob-btn-next:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(37,99,235,0.4); }
            .tv-ob-btn-next:active { transform: translateY(0); }
            .tv-ob-progress {
                position: absolute; bottom: 0; left: 0; height: 3px;
                background: linear-gradient(90deg, #2563eb, #06b6d4);
                border-radius: 0 0 16px 16px;
                transition: width 0.4s ease;
            }
        `;
        document.head.appendChild(s);
    }

    // =========================================================================
    // DOM BUILDING
    // =========================================================================

    function buildUI() {
        if (document.getElementById('tv-onboarding-overlay')) return;
        const html = `
        <div id="tv-onboarding-overlay" class="tv-ob-overlay" aria-modal="true" role="dialog" aria-label="ThrustVault Onboarding Tour">
            <div id="tv-ob-spotlight" class="tv-ob-spotlight"></div>
            <div id="tv-ob-card" class="tv-ob-card">
                <div class="tv-ob-progress" id="tv-ob-progress"></div>
                <div class="tv-ob-card-header">
                    <div class="tv-ob-icon-wrap">
                        <i data-lucide="aperture" id="tv-ob-icon"></i>
                    </div>
                    <div class="tv-ob-step-counter">
                        <span id="tv-ob-step-num">1</span> / <span id="tv-ob-step-total">7</span>
                    </div>
                    <button class="tv-ob-skip" id="tv-ob-skip">Skip tour</button>
                </div>
                <h2 class="tv-ob-title" id="tv-ob-title">Welcome</h2>
                <div class="tv-ob-body" id="tv-ob-body"></div>
                <div class="tv-ob-dots" id="tv-ob-dots"></div>
                <div class="tv-ob-actions">
                    <button class="tv-ob-btn-prev" id="tv-ob-prev">
                        <i data-lucide="arrow-left" style="width:14px;height:14px;"></i> Back
                    </button>
                    <button class="tv-ob-btn-next" id="tv-ob-next">
                        Next <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>
                    </button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        if (window.lucide) window.lucide.createIcons();
    }

    // =========================================================================
    // POSITIONING
    // =========================================================================

    const PAD = 14;
    const CARD_W = 390;
    const CARD_GAP = 16;

    function scrollToTarget(el) {
        if (!el) return Promise.resolve();
        return new Promise(resolve => {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            setTimeout(resolve, 350);
        });
    }

    function positionSpotlight(rect) {
        const el = document.getElementById('tv-ob-spotlight');
        if (!rect) { el.style.display = 'none'; return; }
        el.style.cssText = `
            display: block;
            position: fixed;
            top:    ${rect.top    - PAD}px;
            left:   ${rect.left   - PAD}px;
            width:  ${rect.width  + PAD * 2}px;
            height: ${rect.height + PAD * 2}px;
            border-radius: 12px;
        `;
    }

    function positionCard(rect, position) {
        const card = document.getElementById('tv-ob-card');
        card.className = 'tv-ob-card';

        if (!rect || position === 'center') {
            card.classList.add('tv-ob-card--center');
            card.style.cssText = '';
            return;
        }

        const cardH = card.offsetHeight || 320;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const sTop    = rect.top    - PAD;
        const sBottom = rect.bottom + PAD;
        const sLeft   = rect.left   - PAD;
        const sRight  = rect.right  + PAD;
        let top, left;

        if (position === 'right') {
            left = sRight + CARD_GAP;
            top  = sTop;
            if (left + CARD_W > vw - 8) left = sLeft - CARD_W - CARD_GAP;
        } else if (position === 'bottom') {
            top  = sBottom + CARD_GAP;
            left = rect.left + rect.width / 2 - CARD_W / 2;
            if (top + cardH > vh - 8) top = sTop - cardH - CARD_GAP;
        } else if (position === 'top') {
            top  = sTop - cardH - CARD_GAP;
            left = rect.left + rect.width / 2 - CARD_W / 2;
            if (top < 8) top = sBottom + CARD_GAP;
        } else if (position === 'left') {
            left = sLeft - CARD_W - CARD_GAP;
            top  = sTop;
            if (left < 8) left = sRight + CARD_GAP;
        } else {
            left = sRight + CARD_GAP;
            top  = sTop;
        }

        left = Math.max(8, Math.min(left, vw - CARD_W - 8));
        top  = Math.max(8, Math.min(top,  vh - cardH  - 8));
        card.style.cssText = `position:fixed; top:${top}px; left:${left}px; transform:none;`;
    }

    // =========================================================================
    // STEP RENDERING
    // =========================================================================

    let currentStep = 0;
    let steps = [];

    async function renderStep(idx) {
        const step = steps[idx];
        const total = steps.length;

        document.getElementById('tv-ob-step-num').textContent = idx + 1;
        document.getElementById('tv-ob-step-total').textContent = total;
        document.getElementById('tv-ob-title').textContent = step.title;
        document.getElementById('tv-ob-body').innerHTML = step.content;

        // Progress bar
        const pct = total > 1 ? (idx / (total - 1)) * 100 : 100;
        document.getElementById('tv-ob-progress').style.width = pct + '%';

        const iconEl = document.getElementById('tv-ob-icon');
        iconEl.setAttribute('data-lucide', step.icon);
        if (window.lucide) window.lucide.createIcons();

        const dotsContainer = document.getElementById('tv-ob-dots');
        dotsContainer.innerHTML = steps.map((_, i) =>
            `<span class="tv-ob-dot ${i === idx ? 'active' : ''}" data-step="${i}"></span>`
        ).join('');
        dotsContainer.querySelectorAll('.tv-ob-dot').forEach(dot => {
            dot.addEventListener('click', () => goToStep(parseInt(dot.dataset.step)));
        });

        const prevBtn = document.getElementById('tv-ob-prev');
        const nextBtn = document.getElementById('tv-ob-next');
        prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
        const isLast = idx === total - 1;
        nextBtn.innerHTML = isLast
            ? `<i data-lucide="check" style="width:14px;height:14px;"></i> Get Started`
            : `Next <i data-lucide="arrow-right" style="width:14px;height:14px;"></i>`;
        if (window.lucide) window.lucide.createIcons();

        // Find target
        let targetEl = null;
        if (step.target) {
            const selectors = step.target.split(',').map(s => s.trim());
            for (const sel of selectors) {
                targetEl = document.querySelector(sel);
                if (targetEl) break;
            }
        }

        if (targetEl) {
            document.getElementById('tv-ob-spotlight').style.display = 'none';
            await scrollToTarget(targetEl);
            const rect = targetEl.getBoundingClientRect();
            positionSpotlight(rect);
            positionCard(rect, step.position);
        } else {
            positionSpotlight(null);
            const card = document.getElementById('tv-ob-card');
            card.className = 'tv-ob-card tv-ob-card--center';
            card.style.cssText = '';
        }

        // Re-run lucide icons inside body content
        if (window.lucide) window.lucide.createIcons();
    }

    function goToStep(idx) {
        currentStep = idx;
        const card = document.getElementById('tv-ob-card');
        card.style.opacity = '0';
        setTimeout(() => {
            renderStep(idx).then(() => { card.style.opacity = '1'; });
        }, 120);
    }

    function nextStep() {
        if (currentStep < steps.length - 1) goToStep(currentStep + 1);
        else closeTour(true);
    }

    function prevStep() {
        if (currentStep > 0) goToStep(currentStep - 1);
    }

    function closeTour(completed) {
        if (completed) markCompleted();
        const overlay = document.getElementById('tv-onboarding-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        }
        document.removeEventListener('keydown', keyHandler);
    }

    function keyHandler(e) {
        if (e.key === 'ArrowRight' || (e.key === 'Enter' && document.activeElement.tagName !== 'INPUT')) nextStep();
        else if (e.key === 'ArrowLeft') prevStep();
        else if (e.key === 'Escape') closeTour(false);
    }

    // =========================================================================
    // LAUNCH
    // =========================================================================

    async function launchTour(force) {
        if (!force) {
            const completed = await isCompleted();
            if (completed) return;
        }

        const existing = document.getElementById('tv-onboarding-overlay');
        if (existing) existing.remove();

        injectStyles();
        injectCardStyles();

        steps = getSteps();
        currentStep = 0;

        buildUI();

        document.getElementById('tv-ob-next').addEventListener('click', nextStep);
        document.getElementById('tv-ob-prev').addEventListener('click', prevStep);
        document.getElementById('tv-ob-skip').addEventListener('click', () => closeTour(true));
        document.addEventListener('keydown', keyHandler);

        const overlay = document.getElementById('tv-onboarding-overlay');
        overlay.style.opacity = '0';
        requestAnimationFrame(() => {
            overlay.style.transition = 'opacity 0.3s ease';
            overlay.style.opacity = '1';
        });

        renderStep(0);
    }

    window.launchThrustVaultTour = () => {
        // Remove this page's done flag so the tour re-shows and the pill updates
        localStorage.removeItem(pageKey(getPageSlug()));
        launchTour(true);
    };

    // =========================================================================
    // INIT
    // =========================================================================

    function init() {
        // Disabled: for now remove that onboarding
        return;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }

})();
