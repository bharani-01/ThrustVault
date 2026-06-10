// admin_audit_logs_app.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Validate user is admin
    const session = JSON.parse(localStorage.getItem('thrustvault_session'));
    if (!session || session.role !== 'admin') {
        localStorage.removeItem('thrustvault_session');
        window.location.href = 'index.html';
        return;
    }

    // Set email display in footer
    const email = session.email || '';
    document.getElementById('session-email').textContent = email;
    const avatarInitials = document.getElementById('user-avatar-initials');
    if (avatarInitials && email) {
        avatarInitials.textContent = email.charAt(0).toUpperCase();
    }
    // Populate role badge
    const roleBadge = document.getElementById('session-role-badge');
    if (roleBadge && session.role) {
        roleBadge.textContent = session.role.charAt(0).toUpperCase() + session.role.slice(1);
        roleBadge.className = `badge-role role-${session.role}`;
    }

    // Populate sidebar stats (motors + categories count)
    (async () => {
        try {
            const res = await fetch('/api/config');
            const config = await res.json();
            const sb = window.supabase ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY) : null;
            if (sb) {
                const [mRes, cRes] = await Promise.all([
                    sb.from('motors').select('id', { count: 'exact', head: true }),
                    sb.from('categories').select('id', { count: 'exact', head: true })
                ]);
                const mEl = document.getElementById('total-motors-count');
                const cEl = document.getElementById('total-categories-count');
                if (mEl) mEl.textContent = mRes.count ?? '—';
                if (cEl) cEl.textContent = cRes.count ?? '—';
            }
        } catch(e) { /* stats are optional */ }
    })();

    // XSS Escaping Utilities
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // State Variables
    let allLogs = [];
    let expandedLogId = null;

    // DOM Elements
    const elements = {
        tableBody: document.getElementById('logs-table-body'),
        emptyState: document.getElementById('table-empty-state'),
        searchInput: document.getElementById('search-input'),
        riskFilter: document.getElementById('risk-filter'),
        statusFilter: document.getElementById('status-filter'),
        btnRefresh: document.getElementById('btn-refresh-logs'),
        btnLogout: document.getElementById('btn-logout'),
        totalRequests: document.getElementById('metric-total-requests'),
        warningRequests: document.getElementById('metric-warning-requests'),
        suspiciousRequests: document.getElementById('metric-suspicious-requests')
    };

    // Logout Handler
    elements.btnLogout.onclick = () => {
        localStorage.removeItem('thrustvault_session');
        document.cookie = 'thrustvault_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict; Secure';
        window.location.href = 'login.html';
    };

    // Fetch Logs from Server API Proxy
    async function fetchLogs() {
        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:40px; color:var(--text-muted);">
                    <i data-lucide="loader-2" class="animate-spin" style="width:24px; height:24px; margin:0 auto 10px; display:inline-block;"></i>
                    <div style="margin-top:10px;">Loading audit logs...</div>
                </td>
            </tr>
        `;
        if (window.lucide) window.lucide.createIcons();

        try {
            const response = await fetch('/api/audit-logs');
            if (!response.ok) {
                throw new Error(`Failed to load: ${response.status}`);
            }
            allLogs = await response.json();
            updateMetrics();
            renderLogs();
        } catch (e) {
            console.error("Failed to load audit logs:", e);
            elements.tableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:40px; color:var(--danger-color); font-weight:600;">
                        <i data-lucide="shield-alert" style="width:24px; height:24px; margin:0 auto 10px; display:inline-block;"></i>
                        <div style="margin-top:10px;">Failed to fetch logs from server.</div>
                    </td>
                </tr>
            `;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    // Calculate Metrics
    function updateMetrics() {
        elements.totalRequests.textContent = allLogs.length;
        elements.warningRequests.textContent = allLogs.filter(log => log.risk_level === 'warning').length;
        elements.suspiciousRequests.textContent = allLogs.filter(log => log.risk_level === 'suspicious').length;
    }

    // Render Logs Table
    function renderLogs() {
        const query = elements.searchInput.value.trim().toLowerCase();
        const riskVal = elements.riskFilter.value;
        const statusVal = elements.statusFilter.value;

        const filtered = allLogs.filter(log => {
            // 1. Search Query filter (checks route, email, details, IP)
            if (query) {
                const routeMatch = log.route && log.route.toLowerCase().includes(query);
                const emailMatch = log.email && log.email.toLowerCase().includes(query);
                const ipMatch = log.ip_address && log.ip_address.toLowerCase().includes(query);
                const detailMatch = log.details && log.details.toLowerCase().includes(query);
                if (!routeMatch && !emailMatch && !ipMatch && !detailMatch) return false;
            }

            // 2. Risk Level filter
            if (riskVal !== 'all' && log.risk_level !== riskVal) return false;

            // 3. Response Status filter
            if (statusVal !== 'all') {
                const status = log.status;
                if (statusVal === 'success' && (status < 200 || status >= 300)) return false;
                if (statusVal === 'redirect' && (status < 300 || status >= 400)) return false;
                if (statusVal === 'error' && (status < 400 || status >= 500)) return false;
                if (statusVal === 'server-error' && status < 500) return false;
            }

            return true;
        });

        elements.tableBody.innerHTML = '';
        if (filtered.length === 0) {
            elements.emptyState.style.display = 'block';
            return;
        }
        elements.emptyState.style.display = 'none';

        filtered.forEach(log => {
            const dateStr = new Date(log.timestamp).toLocaleString();
            
            // Format status code class
            let statusStyle = 'color: #059669; font-weight:600;'; // green
            if (log.status >= 400) {
                statusStyle = 'color: #e11d48; font-weight:700;'; // red
            } else if (log.status >= 300) {
                statusStyle = 'color: #d97706; font-weight:600;'; // orange
            }

            const tr = document.createElement('tr');
            tr.className = 'log-detail-row';
            tr.style.borderBottom = '1px solid #e2e8f0';
            tr.innerHTML = `
                <td style="padding:12px 16px; color:#64748b;">${dateStr}</td>
                <td style="padding:12px 16px; font-weight:500;">${escapeHTML(log.email)}</td>
                <td style="padding:12px 16px;"><span class="badge-role role-${log.role}">${escapeHTML(log.role)}</span></td>
                <td style="padding:12px 16px; font-family:monospace; word-break:break-all;"><strong>${escapeHTML(log.method)}</strong> ${escapeHTML(log.route)}</td>
                <td style="padding:12px 16px; text-align:center; ${statusStyle}">${log.status}</td>
                <td style="padding:12px 16px; color:#475569;">${escapeHTML(log.ip_address)}</td>
                <td style="padding:12px 16px; color:#64748b;">${escapeHTML(log.location || 'Unknown')}</td>
                <td style="padding:12px 16px; text-align:center;">
                    <span class="badge-risk risk-${log.risk_level}">${escapeHTML(log.risk_level)}</span>
                </td>
            `;

            // Expand details when clicked
            tr.onclick = (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

                if (expandedLogId === log.id) {
                    expandedLogId = null;
                } else {
                    expandedLogId = log.id;
                }
                renderLogs();
            };

            elements.tableBody.appendChild(tr);

            // Render expanded details row
            if (expandedLogId === log.id) {
                const detailsTr = document.createElement('tr');
                detailsTr.innerHTML = `
                    <td colspan="8" style="padding:0;">
                        <div class="expanded-details">
                            <div style="display:grid; grid-template-columns: 100px 1fr; gap:10px; margin-bottom:8px;">
                                <strong>User Agent:</strong>
                                <span style="font-family:monospace; word-break:break-all;">${escapeHTML(log.user_agent || 'N/A')}</span>
                            </div>
                            <div style="display:grid; grid-template-columns: 100px 1fr; gap:10px;">
                                <strong>Log Details:</strong>
                                <span>${escapeHTML(log.details || 'No additional details logged.')}</span>
                            </div>
                        </div>
                    </td>
                `;
                detailsTr.style.borderBottom = '1px solid #cbd5e1';
                elements.tableBody.appendChild(detailsTr);
            }
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // Bind Controls
    elements.searchInput.oninput = () => renderLogs();
    elements.riskFilter.onchange = () => renderLogs();
    elements.statusFilter.onchange = () => renderLogs();
    elements.btnRefresh.onclick = () => fetchLogs();

    // Initial Fetch
    fetchLogs();
});
