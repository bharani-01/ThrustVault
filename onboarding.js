/**
 * ThrustVault Onboarding Tour
 * Shown once per PAGE (not per role) — stored in localStorage by page slug.
 * Shared pages (e.g. performance_analytics) detect role and show role-specific content.
 *
 * Fixes:
 * - Per-page storage key (each page shows independently)
 * - position:fixed on spotlight & card (always visible, no scrolling needed)
 * - scrollToTarget() before spotlight renders
 * - No background blur on overlay
 */

(function () {
    'use strict';

    // =========================================================================
    // PAGE SLUG — unique key per HTML file
    // =========================================================================

    function getPageSlug() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('admin_audit_logs'))    return 'audit_logs';
        if (path.includes('performance'))         return 'performance';
        if (path.includes('admin_exports'))       return 'exports';
        if (path.includes('intern_dashboard'))    return 'intern_catalog';
        if (path.includes('guest_dashboard'))     return 'guest_catalog';
        return 'admin_catalog'; // admin_dashboard.html or root
    }

    function getPageRole() {
        const slug = getPageSlug();
        if (slug === 'intern_catalog') return 'intern';
        if (slug === 'guest_catalog')  return 'guest';
        // For shared pages, detect by DOM elements
        if (document.querySelector('[data-role="admin"]')) return 'admin';
        const email = (document.getElementById('session-email') || {}).textContent || '';
        if (email.includes('intern')) return 'intern';
        if (email.includes('guest'))  return 'guest';
        return 'admin';
    }

    // =========================================================================
    // STEP DEFINITIONS — per page
    // =========================================================================

    // --- ADMIN CATALOG (admin_dashboard.html) ---
    const STEPS_ADMIN_CATALOG = [
        {
            target: null,
            title: 'Welcome, Administrator',
            icon: 'aperture',
            content: `<p>ThrustVault is your centralized UAV propulsion database. As an admin, you have full control — adding motors, managing categories, running imports/exports, and reviewing audit logs.</p>
                      <p style="margin-top:10px;">This quick tour covers the key features of the Admin Catalog.</p>`,
            position: 'center'
        },
        {
            target: '.sidebar-stats',
            title: 'Live Database Stats',
            icon: 'bar-chart-2',
            content: `<p>Real-time counts of total motors and thrust level categories — updated instantly whenever data changes.</p>`,
            position: 'right'
        },
        {
            target: '.category-list',
            title: 'Thrust Categories',
            icon: 'layers',
            content: `<p>Motors are organized by thrust class (e.g. 1 kg, 5 kg, 20 kg). Click any category to switch the catalog view. Admins can add and rename categories from the sidebar.</p>`,
            position: 'right'
        },
        {
            target: '.search-container',
            title: 'Smart Search',
            icon: 'search',
            content: `<p>Search across <em>all categories at once</em> with fuzzy matching. Suggestions show motor name, manufacturer, ESC, and thrust class. Use <kbd>↑</kbd><kbd>↓</kbd> and <kbd>Enter</kbd> to pick a result.</p>`,
            position: 'bottom'
        },
        {
            target: '.topbar-actions',
            title: 'Import & Export',
            icon: 'file-output',
            content: `<p>Import motor data via CSV, JSON, or Excel. Export the full catalog in multiple formats. Use <em>Download Excel Template</em> to get the standardized import sheet.</p>`,
            position: 'bottom'
        },
        {
            target: '.motors-table-panel',
            title: 'Motor Catalog',
            icon: 'table',
            content: `<p>Browse, edit, or delete motors in the active thrust category. Click any row to open the full motor profile with telemetry test data and custom specs.</p>`,
            position: 'top'
        },
        {
            target: null,
            title: "You're all set!",
            icon: 'check-circle',
            content: `<p>Explore the sidebar for <strong>Performance Analytics</strong>, <strong>Audit Logs</strong>, and <strong>Data Exports</strong>. Each page has its own guided tour. You can replay any tour from the <strong>How it works</strong> button.</p>`,
            position: 'center'
        }
    ];

    // --- INTERN CATALOG (intern_dashboard.html) ---
    const STEPS_INTERN_CATALOG = [
        {
            target: null,
            title: 'Welcome, Intern',
            icon: 'aperture',
            content: `<p>ThrustVault is your motor specification workspace. As an intern, you can add and edit motor entries, import data, and export the catalog — but cannot manage system settings or audit logs.</p>`,
            position: 'center'
        },
        {
            target: '.sidebar-stats',
            title: 'Database Stats',
            icon: 'bar-chart-2',
            content: `<p>Real-time counts of total motors and thrust categories in the database.</p>`,
            position: 'right'
        },
        {
            target: '.category-list',
            title: 'Thrust Categories',
            icon: 'layers',
            content: `<p>Click any thrust category in the sidebar to filter the catalog to that class. You can also add new custom categories using the <strong>+</strong> button.</p>`,
            position: 'right'
        },
        {
            target: '.search-container',
            title: 'Smart Search',
            icon: 'search',
            content: `<p>Search across all categories at once with fuzzy matching and instant suggestions. Each result shows the motor's thrust level badge.</p>`,
            position: 'bottom'
        },
        {
            target: '.topbar-actions',
            title: 'Add Motor & Import Data',
            icon: 'plus-circle',
            content: `<p>Click <em>Add Motor</em> to create a new entry. Use <em>Data Operations</em> to bulk-import via CSV/JSON/Excel or export the catalog.</p>`,
            position: 'bottom'
        },
        {
            target: '.motors-table-panel',
            title: 'Motor Catalog',
            icon: 'table',
            content: `<p>Browse all motors in the selected category. Click any row to view the full profile, or use the <strong>Edit</strong> / <strong>Delete</strong> buttons in the Actions column.</p>`,
            position: 'top'
        },
        {
            target: null,
            title: "Ready to go!",
            icon: 'check-circle',
            content: `<p>Use the sidebar to navigate to <strong>Performance Analytics</strong>. You can replay this tour anytime from the <strong>How it works</strong> button.</p>`,
            position: 'center'
        }
    ];

    // --- GUEST CATALOG (guest_dashboard.html) ---
    const STEPS_GUEST_CATALOG = [
        {
            target: null,
            title: 'Welcome to ThrustVault',
            icon: 'aperture',
            content: `<p>ThrustVault is a read-only UAV motor specification database. You can browse, search, compare, and export motor specs — but cannot add or edit data in Guest mode.</p>`,
            position: 'center'
        },
        {
            target: '.banner-alert',
            title: 'Guest Access',
            icon: 'info',
            content: `<p>You're in <strong>read-only mode</strong>. To add or modify data, log in as an Intern or Admin.</p>`,
            position: 'bottom'
        },
        {
            target: '.category-list',
            title: 'Thrust Categories',
            icon: 'layers',
            content: `<p>Click any category to filter motors by thrust class (e.g. 1 kg, 5 kg, 20 kg).</p>`,
            position: 'right'
        },
        {
            target: '.search-container',
            title: 'Smart Search',
            icon: 'search',
            content: `<p>Search across all categories at once. Type any motor name, manufacturer, or ESC — fuzzy matching handles typos. Suggestions show the thrust level badge per result.</p>`,
            position: 'bottom'
        },
        {
            target: '.motors-table-panel',
            title: 'Motor Catalog',
            icon: 'table',
            content: `<p>Browse all motors in the selected category. Click any row to open its full profile — with specifications, custom parameters, reference links, and telemetry test data.</p>`,
            position: 'top'
        },
        {
            target: null,
            title: "You're all set!",
            icon: 'check-circle',
            content: `<p>Also check out <strong>Performance Analytics</strong> in the sidebar to view telemetry charts across motors. You can replay this tour from the <strong>How it works</strong> button.</p>`,
            position: 'center'
        }
    ];

    // --- PERFORMANCE ANALYTICS (shared across all roles) ---
    function buildPerformanceSteps() {
        const role = getPageRole();
        const roleNote = role === 'guest'
            ? `<p style="margin-top:10px;">As a guest, you have full read access to all test data and charts.</p>`
            : role === 'intern'
            ? `<p style="margin-top:10px;">As an intern, you can view all telemetry data and download charts.</p>`
            : `<p style="margin-top:10px;">As an admin, you can also upload new test run data from this page.</p>`;

        return [
            {
                target: null,
                title: 'Performance Analytics',
                icon: 'trending-up',
                content: `<p>This page visualizes motor telemetry data from real test runs — letting you compare thrust, efficiency, current draw, and RPM across different motors and configurations.</p>${roleNote}`,
                position: 'center'
            },
            {
                target: '.motor-selector, #motor-selector, .analytics-controls, .filter-panel',
                title: 'Motor & Filter Selection',
                icon: 'sliders',
                content: `<p>Select one or more motors to plot. You can also filter by propeller size, ESC, and throttle range to isolate specific test conditions.</p>`,
                position: 'right'
            },
            {
                target: '.chart-section, .telemetry-charts, #charts-container, .charts-grid',
                title: 'Telemetry Charts',
                icon: 'bar-chart-2',
                content: `<p>Charts display Thrust vs Throttle, Current vs RPM, and Efficiency curves from recorded test data. Hover any data point to see exact values. Click the legend to show/hide individual motor series.</p>`,
                position: 'top'
            },
            {
                target: null,
                title: "You're all set!",
                icon: 'check-circle',
                content: `<p>Navigate using the sidebar to return to the catalog or explore other tools. You can replay this tour anytime from the <strong>How it works</strong> button.</p>`,
                position: 'center'
            }
        ];
    }

    // --- AUDIT LOGS (admin only) ---
    const STEPS_AUDIT = [
        {
            target: null,
            title: 'Audit Logs',
            icon: 'shield-alert',
            content: `<p>A complete, tamper-evident activity log for the platform — every login, motor edit, category change, import, and schema modification is recorded here with full user attribution.</p>`,
            position: 'center'
        },
        {
            target: '.metric-cards-row, .audit-metrics, .metrics-grid, .stats-row',
            title: 'Activity Metrics',
            icon: 'activity',
            content: `<p>Summary cards show total events, data mutations, login sessions, and catalog changes at a glance — all scoped to the selected date range.</p>`,
            position: 'bottom'
        },
        {
            target: '.audit-log-table, #audit-log-table, .audit-table-section, .table-responsive',
            title: 'Event Feed',
            icon: 'list',
            content: `<p>Each row shows the user, action type, affected resource, and timestamp. Use the search and filter controls to narrow events by type, user, or date range.</p>`,
            position: 'top'
        },
        {
            target: null,
            title: "You're all set!",
            icon: 'check-circle',
            content: `<p>Navigate using the sidebar to explore other admin tools. You can replay this tour anytime from the <strong>How it works</strong> button.</p>`,
            position: 'center'
        }
    ];

    // --- DATA EXPORTS (admin only) ---
    const STEPS_EXPORTS = [
        {
            target: null,
            title: 'Data Exporter',
            icon: 'download',
            content: `<p>Export the entire motor catalog — or a filtered subset — in multiple formats: Excel (.xlsx), CSV, JSON, XML, and HTML tables. Choose exactly which columns to include.</p>`,
            position: 'center'
        },
        {
            target: '.export-config, .export-panel, #export-controls, .glass-panel',
            title: 'Configure Your Export',
            icon: 'settings',
            content: `<p>Select the thrust categories, choose your columns, pick the output format, and click Export. Large catalogs export instantly.</p>`,
            position: 'right'
        },
        {
            target: null,
            title: "You're all set!",
            icon: 'check-circle',
            content: `<p>Navigate using the sidebar to return to the catalog or explore other admin tools. You can replay this tour anytime from the <strong>How it works</strong> button.</p>`,
            position: 'center'
        }
    ];

    // Master step selector
    function getSteps() {
        const slug = getPageSlug();
        if (slug === 'audit_logs')     return STEPS_AUDIT;
        if (slug === 'performance')    return buildPerformanceSteps();
        if (slug === 'exports')        return STEPS_EXPORTS;
        if (slug === 'intern_catalog') return STEPS_INTERN_CATALOG;
        if (slug === 'guest_catalog')  return STEPS_GUEST_CATALOG;
        return STEPS_ADMIN_CATALOG;
    }

    // =========================================================================
    // STORAGE — database-backed onboarding status with localStorage fallback
    // =========================================================================

    let supabaseClientPromise = null;

    function getSupabaseClient() {
        if (supabaseClientPromise) return supabaseClientPromise;
        supabaseClientPromise = (async () => {
            try {
                const res = await fetch('/api/config');
                const config = await res.json();
                if (window.supabase) {
                    return window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
                }
            } catch (e) {
                console.error("Failed to initialize Supabase client in onboarding.js:", e);
            }
            return null;
        })();
        return supabaseClientPromise;
    }

    function storageKey() {
        return 'tv_tour_done_' + getPageSlug();
    }

    async function isCompleted() {
        const session = JSON.parse(localStorage.getItem('thrustvault_session'));
        if (!session || !session.uid) return true; // Do not show if no logged-in session

        try {
            const client = await getSupabaseClient();
            if (!client) {
                return localStorage.getItem(storageKey()) === '1';
            }

            const { data, error } = await client
                .from('user_onboarding')
                .select('tour_completed')
                .eq('user_id', session.uid)
                .maybeSingle();

            if (error) {
                console.error("Error fetching onboarding status:", error);
                return localStorage.getItem(storageKey()) === '1';
            }

            if (data) {
                return data.tour_completed;
            }
        } catch (e) {
            console.error("Failed to query onboarding status:", e);
        }
        return localStorage.getItem(storageKey()) === '1';
    }

    async function markCompleted() {
        localStorage.setItem(storageKey(), '1'); // Keep local storage fallback
        const session = JSON.parse(localStorage.getItem('thrustvault_session'));
        if (!session || !session.uid) return;

        try {
            const client = await getSupabaseClient();
            if (!client) return;

            const { error } = await client
                .from('user_onboarding')
                .upsert({
                    user_id: session.uid,
                    tour_completed: true,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) {
                console.error("Error saving onboarding status:", error);
            }
        } catch (e) {
            console.error("Failed to save onboarding status:", e);
        }
    }

    function resetOnboarding() {
        Object.keys(localStorage)
            .filter(k => k.startsWith('tv_tour_done_'))
            .forEach(k => localStorage.removeItem(k));
    }
    window.resetThrustVaultTour = resetOnboarding;

    // =========================================================================
    // DOM BUILDING
    // =========================================================================

    function buildUI() {
        if (document.getElementById('tv-onboarding-overlay')) return;

        const html = `
        <div id="tv-onboarding-overlay" class="tv-ob-overlay" aria-modal="true" role="dialog" aria-label="ThrustVault Onboarding Tour">
            <div id="tv-ob-spotlight" class="tv-ob-spotlight"></div>
            <div id="tv-ob-card" class="tv-ob-card">
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
    // POSITIONING — position:fixed, viewport-relative
    // =========================================================================

    const PAD = 14;
    const CARD_W = 360;
    const CARD_GAP = 16;

    function scrollToTarget(el) {
        if (!el) return Promise.resolve();
        return new Promise(resolve => {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            setTimeout(resolve, 320);
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

        const cardH = card.offsetHeight || 280;
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

        // Multi-selector support (comma-separated targets)
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
        if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
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

    // =========================================================================
    // INIT
    // =========================================================================

    function init() {
        // "How it works" button removed as requested.
        setTimeout(() => launchTour(false), 900);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 900);
    }

})();
