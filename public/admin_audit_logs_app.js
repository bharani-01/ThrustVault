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
    const emailEl = document.getElementById('session-email');
    if (emailEl) emailEl.textContent = email;
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

    let supabase = null;
    let state = {
        motors: [],
        categories: [],
        accessRequests: []
    };

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
    let currentPage = 1;
    let pageSize = 15;
    let sortBy = 'timestamp';
    let sortDir = 'desc';
    let viewMode = 'table'; // 'table' or 'timeline'
    let liveInterval = null;
    let statusChart = null;
    let activityChart = null;
    let riskChart = null;

    // DOM Elements
    const elements = {
        tableBody: document.getElementById('logs-table-body'),
        emptyState: document.getElementById('table-empty-state'),
        searchInput: document.getElementById('search-input'),
        riskFilter: document.getElementById('risk-filter'),
        statusFilter: document.getElementById('status-filter'),
        btnRefresh: document.getElementById('btn-refresh-logs'),
        get totalMotors() { return document.getElementById('total-motors-count'); },
        get totalCats() { return document.getElementById('total-categories-count'); },
        get catList() { return document.getElementById('category-list-container'); },
        get requestsPendingBadge() { return document.getElementById('requests-pending-badge'); },
        get btnAddCat() { return document.getElementById('btn-add-category'); },
        confirmModal: document.getElementById('confirm-modal'),
        get btnLogout() { return document.getElementById('btn-logout'); },
        totalRequests: document.getElementById('metric-total-requests'),
        warningRequests: document.getElementById('metric-warning-requests'),
        suspiciousRequests: document.getElementById('metric-suspicious-requests'),
        btnViewTable: document.getElementById('btn-view-table'),
        btnViewTimeline: document.getElementById('btn-view-timeline'),
        tableViewPanel: document.getElementById('table-view-panel'),
        timelineViewPanel: document.getElementById('timeline-view-panel'),
        timelineContainer: document.getElementById('logs-timeline-container'),
        liveStreamToggle: document.getElementById('live-stream-toggle'),
        livePulseIndicator: document.getElementById('live-pulse-indicator'),
        dateFrom: document.getElementById('date-from'),
        dateTo: document.getElementById('date-to'),
        collapseDupToggle: document.getElementById('collapse-dup-toggle'),
        btnExportCsv: document.getElementById('btn-export-csv'),
        btnExportJson: document.getElementById('btn-export-json'),
        pageSizeSelect: document.getElementById('page-size-select'),
        paginationButtons: document.getElementById('pagination-buttons'),
        pageStartIdx: document.getElementById('page-start-idx'),
        pageEndIdx: document.getElementById('page-end-idx'),
        pageTotalCount: document.getElementById('page-total-count'),
        paginationFooter: document.getElementById('pagination-footer')
    };

    // Logout and redirect helper
    function logoutAndRedirect(action = 'Logout', details = 'Logged out successfully.') {
        if (session) {
            try {
                fetch('/api/log-activity', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: session.email, role: session.role, action, details })
                }).catch(err => console.error("Error posting log:", err));
            } catch (e) {
                console.error("Error writing activity log:", e);
            }
        }
        fetch('/api/auth/logout', { method: 'POST' }).catch(e => console.error("Logout error:", e));
        localStorage.removeItem('thrustvault_session');
        const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `thrustvault_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict${secureFlag}`;
        window.location.href = 'index.html';
    }

    // Logout Handler
    

    // Close handlers for confirm modal
    document.querySelectorAll('.modal-close-trigger').forEach(btn => {
        btn.onclick = (e) => closeModal(e.target.closest('.modal-backdrop'));
    });
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(backdrop); };
    });

    // Helper: Custom Async Confirmation Dialog Modal (Promise-based)
    function customConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = elements.confirmModal;
            if (!modal) {
                resolve(confirm(message));
                return;
            }
            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;
            
            const btnConfirm = document.getElementById('btn-confirm-action');
            const newBtnConfirm = btnConfirm.cloneNode(true);
            btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);
            
            openModal(modal);
            
            newBtnConfirm.onclick = () => {
                closeModal(modal);
                resolve(true);
            };
            
            modal.querySelectorAll('.modal-close-trigger, .btn-secondary').forEach(btn => {
                btn.onclick = () => {
                    closeModal(modal);
                    resolve(false);
                };
            });
        });
    }

    function openModal(modal) { modal.classList.add('show'); }
    function closeModal(modal) { modal.classList.remove('show'); }

    // Sidebar navigation trigger is setup dynamically in setupSidebar()

    async function fetchSidebarCounts() {
        try {
            const [motorsData, catsData, requestsData] = await Promise.all([
                fetch('/api/guest/motors').then(r => r.json()),
                fetch('/api/guest/categories').then(r => r.json()),
                fetch('/api/admin/access-requests').then(r => r.json())
            ]);

            state.motors = motorsData || [];
            state.categories = catsData || [];
            state.accessRequests = requestsData || [];

            if (elements.totalMotors) elements.totalMotors.textContent = state.motors.length;
            if (elements.totalCats) elements.totalCats.textContent = state.categories.length;

            // Update Access Requests Pending Badge
            const pendingRequests = state.accessRequests.filter(r => r.status === 'pending').length;
            if (elements.requestsPendingBadge) {
                if (pendingRequests > 0) {
                    elements.requestsPendingBadge.style.display = 'inline-block';
                    elements.requestsPendingBadge.textContent = pendingRequests;
                } else {
                    elements.requestsPendingBadge.style.display = 'none';
                }
            }

            renderSidebar();
        } catch (err) {
            console.error("Error fetching sidebar metrics:", err);
        }
    }

    function renderSidebar() {
        if (!elements.catList) return;
        elements.catList.innerHTML = '';
        state.categories.forEach(cat => {
            const count = state.motors.filter(m => m.category_id === cat.id).length;
            const div = document.createElement('div');
            div.className = 'category-tab';
            div.innerHTML = `
                <span>${cat.name}</span>
                <div style="display:flex; align-items:center; gap:5px;">
                    <span class="cat-count">${count}</span>
                    <button class="btn-delete-cat" data-id="${cat.id}" title="Delete Category"><i data-lucide="trash-2" style="width:14px;"></i></button>
                </div>
            `;
            
            div.onclick = (e) => {
                if (e.target.closest('.btn-delete-cat')) return;
                sessionStorage.setItem('activeCategory', cat.id);
                window.location.href = 'admin_dashboard';
            };
            
            const delBtn = div.querySelector('.btn-delete-cat');
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                const confirmDelete = await customConfirm(
                    "Delete Category?",
                    `Are you sure you want to delete the category "${cat.name}"? All specifications inside it will be permanently deleted.`
                );
                if (confirmDelete) {
                    try {
                        const res = await fetch(`/api/intern/categories/${cat.id}`, {
                            method: 'DELETE'
                        });
                        if (!res.ok) {
                            const errData = await res.json();
                            throw new Error(errData.error || `HTTP ${res.status}`);
                        }
                        // log activity on server
                        fetch('/api/log-activity', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: session.email, role: session.role, action: 'Category Deleted', details: `Deleted category: ${cat.name}` })
                        }).catch(e => console.error("Error logging category deletion:", e));

                        await fetchSidebarCounts();
                    } catch (err) {
                        alert("Failed to delete category: " + err.message);
                    }
                }
            };
            elements.catList.appendChild(div);
        });

        // Add static All Motors tab
        const allTab = document.createElement('div');
        allTab.className = 'category-tab';
        allTab.innerHTML = '<span>All Motors</span>';
        allTab.onclick = () => {
            window.location.href = 'motor_explorer';
        };
        elements.catList.appendChild(allTab);
        if (window.lucide) window.lucide.createIcons();
    }

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
            renderLogsPage();
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

    // Helper: Dynamic Activity Binning
    function getActivityTrendData(logs) {
        if (logs.length === 0) return { labels: [], data: [] };
        
        // Sort chronologically ascending
        const sorted = [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const first = new Date(sorted[0].timestamp);
        const last = new Date(sorted[sorted.length - 1].timestamp);
        const durationMs = last - first;

        const isMultiDay = durationMs > 36 * 60 * 60 * 1000;
        const groups = {};

        sorted.forEach(log => {
            const date = new Date(log.timestamp);
            let key;
            if (isMultiDay) {
                key = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            } else {
                key = date.toLocaleTimeString([], { hour: '2-digit', hour12: true }).replace(':00', '');
            }
            groups[key] = (groups[key] || 0) + 1;
        });

        return {
            labels: Object.keys(groups),
            data: Object.values(groups)
        };
    }

    // Helper: Render Chart.js visualisations
    function renderCharts(logs) {
        if (typeof Chart === 'undefined') return;
        const trendData = getActivityTrendData(logs);
        const riskData = {
            info: logs.filter(l => l.risk_level === 'info' || !l.risk_level).length,
            warning: logs.filter(l => l.risk_level === 'warning').length,
            suspicious: logs.filter(l => l.risk_level === 'suspicious').length
        };
        
        const statusData = {
            '2xx': logs.filter(l => l.status >= 200 && l.status < 300).length,
            '3xx': logs.filter(l => l.status >= 300 && l.status < 400).length,
            '4xx': logs.filter(l => l.status >= 400 && l.status < 500).length,
            '5xx': logs.filter(l => l.status >= 500).length
        };

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0';
        const primaryColor = isDark ? '#3b82f6' : '#2563eb';
        const primaryBg = isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.03)';

        // 0. Traffic Status Codes Chart
        const ctxStatus = document.getElementById('chart-traffic-status');
        if (ctxStatus) {
            if (statusChart) statusChart.destroy();
            statusChart = new Chart(ctxStatus, {
                type: 'bar',
                data: {
                    labels: ['2xx OK', '3xx Redirect', '4xx Client Err', '5xx Server Err'],
                    datasets: [{
                        data: [statusData['2xx'], statusData['3xx'], statusData['4xx'], statusData['5xx']],
                        backgroundColor: ['#059669', '#3b82f6', '#f59e0b', '#e11d48'],
                        borderRadius: 4,
                        barThickness: 12
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { color: gridColor },
                            ticks: { precision: 0, color: textColor, font: { size: 9, family: 'Inter' } }
                        },
                        y: {
                            grid: { display: false },
                            ticks: { color: textColor, font: { size: 9, family: 'Inter', weight: '500' } }
                        }
                    }
                }
            });
        }

        // 1. Activity Trend Chart
        const ctxTrend = document.getElementById('chart-activity-trend');
        if (ctxTrend) {
            if (activityChart) activityChart.destroy();
            activityChart = new Chart(ctxTrend, {
                type: 'line',
                data: {
                    labels: trendData.labels,
                    datasets: [{
                        label: 'Requests',
                        data: trendData.data,
                        borderColor: primaryColor,
                        backgroundColor: primaryBg,
                        borderWidth: 2,
                        fill: true,
                        tension: 0.35,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: textColor, font: { size: 9, family: 'Inter' } }
                        },
                        y: {
                            grid: { color: gridColor },
                            ticks: { precision: 0, color: textColor, font: { size: 9, family: 'Inter' } }
                        }
                    }
                }
            });
        }

        // 2. Risk Breakdown Doughnut Chart
        const ctxRisk = document.getElementById('chart-risk-breakdown');
        if (ctxRisk) {
            if (riskChart) riskChart.destroy();
            const panelColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel-solid').trim() || '#ffffff';
            riskChart = new Chart(ctxRisk, {
                type: 'doughnut',
                data: {
                    labels: ['Info', 'Warning', 'Suspicious'],
                    datasets: [{
                        data: [riskData.info, riskData.warning, riskData.suspicious],
                        backgroundColor: ['#0ea5e9', '#f59e0b', '#ef4444'],
                        borderWidth: isDark ? 2 : 1,
                        borderColor: panelColor,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                color: textColor,
                                font: { size: 9, family: 'Inter', weight: '500' },
                                boxWidth: 10
                            }
                        }
                    },
                    cutout: '70%'
                }
            });
        }
    }

    // Calculate Metrics
    function updateMetrics() {
        const total = allLogs.length;
        const warnings = allLogs.filter(log => log.risk_level === 'warning').length;
        const suspicious = allLogs.filter(log => log.risk_level === 'suspicious').length;

        if (elements.totalRequests) elements.totalRequests.textContent = total;
        if (elements.warningRequests) elements.warningRequests.textContent = warnings;
        if (elements.suspiciousRequests) elements.suspiciousRequests.textContent = suspicious;

        // Render trend lines & status & doughnut
        renderCharts(allLogs);
    }

    // Collapse adjacent duplicate events (same email, method, route, status, risk within 1 min)
    function collapseDuplicates(logs) {
        if (logs.length === 0) return [];
        
        // Sort chronologically ascending to find sequential adjacent items
        const sorted = [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const result = [];
        
        let current = { ...sorted[0], duplicateCount: 1, duplicates: [] };
        
        for (let i = 1; i < sorted.length; i++) {
            const log = sorted[i];
            const prevTime = new Date(current.timestamp);
            const currTime = new Date(log.timestamp);
            
            const isDuplicate = 
                log.email === current.email &&
                log.method === current.method &&
                log.route === current.route &&
                log.status === current.status &&
                log.risk_level === current.risk_level &&
                (currTime - prevTime) <= 60000;
                
            if (isDuplicate) {
                current.duplicateCount++;
                current.duplicates.push(log);
                current.timestamp = log.timestamp; // update to latest occurrence time
            } else {
                result.push(current);
                current = { ...log, duplicateCount: 1, duplicates: [] };
            }
        }
        result.push(current);
        return result;
    }

    // Sort logs array based on active column and direction
    function sortLogs(logs) {
        const dirMultiplier = sortDir === 'asc' ? 1 : -1;
        return logs.sort((a, b) => {
            let valA, valB;
            if (sortBy === 'timestamp') {
                valA = new Date(a.timestamp).getTime();
                valB = new Date(b.timestamp).getTime();
                return (valA - valB) * dirMultiplier;
            } else if (sortBy === 'risk_level') {
                const riskWeights = { 'suspicious': 3, 'warning': 2, 'info': 1 };
                valA = riskWeights[a.risk_level] || 0;
                valB = riskWeights[b.risk_level] || 0;
                return (valA - valB) * dirMultiplier;
            } else if (sortBy === 'status') {
                valA = Number(a.status) || 0;
                valB = Number(b.status) || 0;
                return (valA - valB) * dirMultiplier;
            } else if (sortBy === 'route') {
                valA = `${a.method || ''} ${a.route || ''}`;
                valB = `${b.method || ''} ${b.route || ''}`;
                return valA.localeCompare(valB) * dirMultiplier;
            } else {
                valA = String(a[sortBy] || '').toLowerCase();
                valB = String(b[sortBy] || '').toLowerCase();
                return valA.localeCompare(valB) * dirMultiplier;
            }
        });
    }

    // Filter and Process Logs
    function getProcessedLogs() {
        const query = elements.searchInput.value.trim().toLowerCase();
        const riskVal = elements.riskFilter.value;
        const statusVal = elements.statusFilter.value;
        const dateFromVal = elements.dateFrom ? elements.dateFrom.value : '';
        const dateToVal = elements.dateTo ? elements.dateTo.value : '';

        let filtered = allLogs.filter(log => {
            // 1. Search Query filter (checks method, route, email, details, IP)
            if (query) {
                const routeMatch = log.route && log.route.toLowerCase().includes(query);
                const methodMatch = log.method && log.method.toLowerCase().includes(query);
                const emailMatch = log.email && log.email.toLowerCase().includes(query);
                const ipMatch = log.ip_address && log.ip_address.toLowerCase().includes(query);
                const detailMatch = log.details && log.details.toLowerCase().includes(query);
                if (!routeMatch && !methodMatch && !emailMatch && !ipMatch && !detailMatch) return false;
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

            // 4. Date Range filters (Local bounds)
            const logDate = new Date(log.timestamp);
            if (dateFromVal) {
                const fromDate = new Date(dateFromVal + 'T00:00:00');
                if (logDate < fromDate) return false;
            }
            if (dateToVal) {
                const toDate = new Date(dateToVal + 'T23:59:59.999');
                if (logDate > toDate) return false;
            }

            return true;
        });

        // Duplicate collapsing
        if (elements.collapseDupToggle && elements.collapseDupToggle.checked) {
            filtered = collapseDuplicates(filtered);
        }

        // Sorting
        sortLogs(filtered);

        return filtered;
    }

    // Pagination numbers generator
    function getPageNumbers(current, total) {
        const pages = [];
        if (total <= 7) {
            for (let i = 1; i <= total; i++) pages.push(i);
        } else {
            pages.push(1);
            if (current > 3) pages.push('...');
            
            const start = Math.max(2, current - 1);
            const end = Math.min(total - 1, current + 1);
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
            
            if (current < total - 2) pages.push('...');
            pages.push(total);
        }
        return pages;
    }

    // Render Pagination Controls
    function renderPagination(totalItems) {
        if (!elements.paginationButtons) return;
        
        const totalPages = Math.ceil(totalItems / pageSize) || 1;
        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const startIdx = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
        const endIdx = Math.min(currentPage * pageSize, totalItems);

        if (elements.pageStartIdx) elements.pageStartIdx.textContent = startIdx;
        if (elements.pageEndIdx) elements.pageEndIdx.textContent = endIdx;
        if (elements.pageTotalCount) elements.pageTotalCount.textContent = totalItems;

        elements.paginationButtons.innerHTML = '';

        // Prev Button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.disabled = currentPage === 1;
        prevBtn.innerHTML = '<i data-lucide="chevron-left" style="width:16px; height:16px;"></i>';
        prevBtn.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                renderLogsPage();
            }
        };
        elements.paginationButtons.appendChild(prevBtn);

        // Numeric buttons
        const pageNumbers = getPageNumbers(currentPage, totalPages);
        pageNumbers.forEach(p => {
            if (p === '...') {
                const span = document.createElement('span');
                span.style.padding = '0 8px';
                span.style.color = 'var(--text-muted)';
                span.textContent = '...';
                elements.paginationButtons.appendChild(span);
            } else {
                const btn = document.createElement('button');
                btn.className = `pagination-number ${p === currentPage ? 'active' : ''}`;
                btn.textContent = p;
                btn.onclick = () => {
                    currentPage = p;
                    renderLogsPage();
                };
                elements.paginationButtons.appendChild(btn);
            }
        });

        // Next Button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.innerHTML = '<i data-lucide="chevron-right" style="width:16px; height:16px;"></i>';
        nextBtn.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderLogsPage();
            }
        };
        elements.paginationButtons.appendChild(nextBtn);

        if (window.lucide) window.lucide.createIcons();
    }

    // Main layout renderer page router
    function renderLogsPage() {
        const processed = getProcessedLogs();

        // Update overall metric counters
        updateMetrics();

        // Render page controls
        renderPagination(processed.length);

        const startIdx = (currentPage - 1) * pageSize;
        const endIdx = startIdx + pageSize;
        const pageItems = processed.slice(startIdx, endIdx);

        if (processed.length === 0) {
            elements.emptyState.style.display = 'block';
            if (elements.tableViewPanel) elements.tableViewPanel.style.display = 'none';
            if (elements.timelineViewPanel) elements.timelineViewPanel.style.display = 'none';
            if (elements.paginationFooter) elements.paginationFooter.style.display = 'none';
            return;
        }

        elements.emptyState.style.display = 'none';
        if (elements.paginationFooter) elements.paginationFooter.style.display = 'flex';

        if (viewMode === 'table') {
            if (elements.tableViewPanel) elements.tableViewPanel.style.display = 'block';
            if (elements.timelineViewPanel) elements.timelineViewPanel.style.display = 'none';
            renderTableRows(pageItems);
        } else {
            if (elements.tableViewPanel) elements.tableViewPanel.style.display = 'none';
            if (elements.timelineViewPanel) elements.timelineViewPanel.style.display = 'block';
            renderTimelineCards(pageItems);
        }
    }

    // Render Table view mode
    function renderTableRows(items) {
        elements.tableBody.innerHTML = '';

        items.forEach(log => {
            const dateStr = new Date(log.timestamp).toLocaleString();
            
            let statusStyle = 'color: var(--success-color); font-weight:600;'; // green
            if (log.status >= 400) {
                statusStyle = 'color: var(--danger-color); font-weight:700;'; // red
            } else if (log.status >= 300) {
                statusStyle = 'color: #d97706; font-weight:600;'; // orange (warning)
            }

            const dupBadge = log.duplicateCount > 1 
                ? ` <span class="badge-role" style="background:var(--bg-base); color:var(--text-secondary); font-size:0.75rem; border:1px solid var(--border-color); padding:2px 6px; margin-left:4px; font-weight:600;">×${log.duplicateCount}</span>`
                : '';

            const tr = document.createElement('tr');
            tr.className = 'log-detail-row';
            tr.style.borderBottom = '1px solid var(--border-color)';
            tr.innerHTML = `
                <td style="padding:12px 16px; color:var(--text-muted);">${dateStr}</td>
                <td style="padding:12px 16px; font-weight:500;">${escapeHTML(log.email)}</td>
                <td style="padding:12px 16px;"><span class="badge-role role-${log.role}">${escapeHTML(log.role)}</span></td>
                <td style="padding:12px 16px; font-family:monospace; word-break:break-all;">
                    <strong>${escapeHTML(log.method)}</strong> ${escapeHTML(log.route)}
                    ${dupBadge}
                </td>
                <td style="padding:12px 16px; text-align:center; ${statusStyle}">${log.status}</td>
                <td style="padding:12px 16px; color:var(--text-secondary);">${escapeHTML(log.ip_address)}</td>
                <td style="padding:12px 16px; color:var(--text-muted);">${escapeHTML(log.location || 'Unknown')}</td>
                <td style="padding:12px 16px; text-align:center;">
                    <span class="badge-risk risk-${log.risk_level}">${escapeHTML(log.risk_level)}</span>
                </td>
            `;

            tr.onclick = (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

                if (expandedLogId === log.id) {
                    expandedLogId = null;
                } else {
                    expandedLogId = log.id;
                }
                renderTableRows(items);
            };

            elements.tableBody.appendChild(tr);

            if (expandedLogId === log.id) {
                const detailsTr = document.createElement('tr');
                
                let dupBlock = '';
                if (log.duplicates && log.duplicates.length > 0) {
                    const dupList = log.duplicates.map(d => {
                        return `<li>[${new Date(d.timestamp).toLocaleTimeString()}] Status: ${d.status}, IP: ${d.ip_address}</li>`;
                    }).join('');
                    dupBlock = `
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-color);">
                            <strong>Collapsed Occurrences:</strong>
                            <ul style="margin: 4px 0 0 16px; padding: 0; font-family:monospace; font-size:0.8rem; list-style-type: disc;">
                                ${dupList}
                            </ul>
                        </div>
                    `;
                }

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
                            ${dupBlock}
                        </div>
                    </td>
                `;
                detailsTr.style.borderBottom = '1px solid var(--border-color)';
                elements.tableBody.appendChild(detailsTr);
            }
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // Render Timeline view mode
    function renderTimelineCards(items) {
        if (!elements.timelineContainer) return;
        elements.timelineContainer.innerHTML = '';

        items.forEach(log => {
            const dateStr = new Date(log.timestamp).toLocaleDateString();
            const timeStr = new Date(log.timestamp).toLocaleTimeString();
            
            let iconName = 'activity';
            const method = (log.method || '').toUpperCase();
            const route = (log.route || '').toLowerCase();
            const details = (log.details || '').toLowerCase();
            
            if (method === 'POST' && (route.includes('login') || details.includes('login'))) {
                iconName = 'log-in';
            } else if (route.includes('logout') || details.includes('logout')) {
                iconName = 'log-out';
            } else if (details.includes('delete') || details.includes('remove')) {
                iconName = 'trash-2';
            } else if (details.includes('update') || details.includes('edit') || details.includes('modify')) {
                iconName = 'edit-3';
            } else if (details.includes('create') || details.includes('add') || details.includes('insert')) {
                iconName = 'plus-circle';
            } else if (route.includes('export') || details.includes('export')) {
                iconName = 'download';
            } else if (route.includes('schema') || details.includes('schema')) {
                iconName = 'sliders';
            } else if (route.includes('access') || details.includes('access')) {
                iconName = 'user-check';
            }

            const card = document.createElement('div');
            card.className = 'timeline-item';
            
            const riskClass = `risk-${log.risk_level}`;
            const dupBadge = log.duplicateCount > 1 
                ? `<span class="badge-role" style="background:var(--bg-base); color:var(--text-secondary); font-size:0.75rem; border:1px solid var(--border-color); padding:2px 6px; font-weight:600;">×${log.duplicateCount} repeated events</span>`
                : '';

            let statusStyle = 'color: var(--success-color); font-weight:600;';
            if (log.status >= 400) {
                statusStyle = 'color: var(--danger-color); font-weight:700;';
            } else if (log.status >= 300) {
                statusStyle = 'color: #d97706; font-weight:600;';
            }

            const isExpanded = expandedLogId === log.id;
            const expandedBlock = isExpanded 
                ? `
                <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border-color); font-size:0.8rem; color:var(--text-secondary);">
                    <div><strong>User Agent:</strong> <span style="font-family:monospace; word-break:break-all;">${escapeHTML(log.user_agent || 'N/A')}</span></div>
                    <div><strong>IP Address:</strong> ${escapeHTML(log.ip_address)} | <strong>Location:</strong> ${escapeHTML(log.location || 'Unknown')}</div>
                    ${log.duplicates && log.duplicates.length > 0 ? `
                    <div style="margin-top:6px; padding-top:6px; border-top:1px dashed var(--border-color);">
                        <strong>Collapsed Occurrences:</strong>
                        <ul style="margin:4px 0 0 16px; padding:0; list-style-type:disc; font-family:monospace;">
                            ${log.duplicates.map(d => `<li>[${new Date(d.timestamp).toLocaleTimeString()}] Status: ${d.status}, IP: ${d.ip_address}</li>`).join('')}
                        </ul>
                    </div>` : ''}
                </div>` 
                : '';

            card.innerHTML = `
                <div class="timeline-badge ${riskClass}">
                    <i data-lucide="${iconName}" style="width:20px; height:20px;"></i>
                </div>
                <div class="timeline-card">
                    <div class="timeline-card-header">
                        <div class="timeline-card-title">
                            <strong>${escapeHTML(log.method)}</strong> ${escapeHTML(log.route)}
                            <span class="badge-role role-${log.role}" style="margin-left:6px; font-size:0.72rem;">${escapeHTML(log.role)}</span>
                        </div>
                        <div class="timeline-card-time">${dateStr} ${timeStr}</div>
                    </div>
                    <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:2px;">
                        by <span style="font-weight:600; color:var(--text-primary);">${escapeHTML(log.email)}</span>
                    </div>
                    <div class="timeline-card-body">
                        ${escapeHTML(log.details || 'No additional details logged.')}
                    </div>
                    <div class="timeline-card-footer">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span>Status: <span style="${statusStyle}">${log.status}</span></span>
                            ${dupBadge}
                        </div>
                        <span class="badge-risk risk-${log.risk_level}">${escapeHTML(log.risk_level)}</span>
                    </div>
                    ${expandedBlock}
                </div>
            `;
            
            card.querySelector('.timeline-card').onclick = (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
                
                if (expandedLogId === log.id) {
                    expandedLogId = null;
                } else {
                    expandedLogId = log.id;
                }
                renderTimelineCards(items);
            };

            elements.timelineContainer.appendChild(card);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // Bind Header Click Event Handlers for sorting
    function bindHeaderSorting() {
        const headers = {
            'th-time': 'timestamp',
            'th-email': 'email',
            'th-role': 'role',
            'th-request': 'route',
            'th-status': 'status',
            'th-ip': 'ip_address',
            'th-location': 'location',
            'th-risk': 'risk_level'
        };
        
        Object.keys(headers).forEach(headerId => {
            const el = document.getElementById(headerId);
            if (el) {
                el.onclick = () => {
                    const field = headers[headerId];
                    if (sortBy === field) {
                        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                    } else {
                        sortBy = field;
                        sortDir = field === 'timestamp' ? 'desc' : 'asc';
                    }
                    
                    Object.keys(headers).forEach(hId => {
                        const hEl = document.getElementById(hId);
                        if (hEl) hEl.classList.remove('asc', 'desc');
                    });
                    
                    el.classList.add(sortDir);
                    currentPage = 1;
                    renderLogsPage();
                };
            }
        });
    }

    // Toggle polling for live refresh
    function handleLiveStreamToggle() {
        if (elements.liveStreamToggle && elements.liveStreamToggle.checked) {
            if (elements.livePulseIndicator) elements.livePulseIndicator.style.display = 'inline-block';
            if (!liveInterval) {
                liveInterval = setInterval(async () => {
                    try {
                        const response = await fetch('/api/audit-logs');
                        if (response.ok) {
                            const incomingLogs = await response.json();
                            const existingIds = new Set(allLogs.map(l => l.id));
                            const newLogs = incomingLogs.filter(l => !existingIds.has(l.id));
                            if (newLogs.length > 0) {
                                allLogs = [...newLogs, ...allLogs];
                                renderLogsPage();
                            }
                        }
                    } catch (err) {
                        console.error("Live streaming sync error:", err);
                    }
                }, 5000);
            }
        } else {
            if (elements.livePulseIndicator) elements.livePulseIndicator.style.display = 'none';
            if (liveInterval) {
                clearInterval(liveInterval);
                liveInterval = null;
            }
        }
    }

    // CSV file generator
    function exportToCSV(logs) {
        const headers = ["ID", "Timestamp (UTC)", "Timestamp (Local)", "Email", "Role", "Method", "Route", "Status", "IP Address", "Location", "Risk Level", "Details", "Duplicates Count"];
        const csvRows = [headers.join(",")];
        
        logs.forEach(log => {
            const localTime = new Date(log.timestamp).toLocaleString();
            const row = [
                log.id,
                log.timestamp,
                localTime,
                log.email,
                log.role,
                log.method,
                log.route,
                log.status,
                log.ip_address,
                log.location || 'Unknown',
                log.risk_level,
                log.details || '',
                log.duplicateCount || 1
            ];
            
            const escapedRow = row.map(val => {
                const str = String(val === null || val === undefined ? '' : val);
                const escaped = str.replace(/"/g, '""');
                return `"${escaped}"`;
            });
            csvRows.push(escapedRow.join(","));
        });
        
        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `thrustvault_audit_logs_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // JSON file generator
    function exportToJSON(logs) {
        const jsonContent = JSON.stringify(logs, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `thrustvault_audit_logs_${new Date().toISOString().slice(0,10)}.json`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Bind Controls
    elements.searchInput.oninput = () => {
        currentPage = 1;
        renderLogsPage();
    };
    elements.riskFilter.onchange = () => {
        currentPage = 1;
        renderLogsPage();
    };
    elements.statusFilter.onchange = () => {
        currentPage = 1;
        renderLogsPage();
    };
    if (elements.dateFrom) {
        elements.dateFrom.onchange = () => {
            currentPage = 1;
            renderLogsPage();
        };
    }
    if (elements.dateTo) {
        elements.dateTo.onchange = () => {
            currentPage = 1;
            renderLogsPage();
        };
    }
    if (elements.collapseDupToggle) {
        elements.collapseDupToggle.onchange = () => {
            currentPage = 1;
            renderLogsPage();
        };
    }
    if (elements.pageSizeSelect) {
        elements.pageSizeSelect.onchange = () => {
            pageSize = Number(elements.pageSizeSelect.value) || 15;
            currentPage = 1;
            renderLogsPage();
        };
    }
    if (elements.liveStreamToggle) {
        elements.liveStreamToggle.onchange = () => {
            handleLiveStreamToggle();
        };
    }
    window.addEventListener('beforeunload', () => {
        if (liveInterval) clearInterval(liveInterval);
    });

    if (elements.btnViewTable && elements.btnViewTimeline) {
        elements.btnViewTable.onclick = () => {
            elements.btnViewTable.classList.add('active');
            elements.btnViewTimeline.classList.remove('active');
            viewMode = 'table';
            renderLogsPage();
        };
        elements.btnViewTimeline.onclick = () => {
            elements.btnViewTimeline.classList.add('active');
            elements.btnViewTable.classList.remove('active');
            viewMode = 'timeline';
            renderLogsPage();
        };
    }

    if (elements.btnExportCsv) {
        elements.btnExportCsv.onclick = () => {
            const processed = getProcessedLogs();
            exportToCSV(processed);
        };
    }
    if (elements.btnExportJson) {
        elements.btnExportJson.onclick = () => {
            const processed = getProcessedLogs();
            exportToJSON(processed);
        };
    }

    bindHeaderSorting();
    elements.btnRefresh.onclick = () => fetchLogs();


    // Sidebar Profile Click Trigger is setup dynamically in setupSidebar()

    // Inactivity Session Expiry (10 minutes)
    let inactivityTimeout;
    let lastSyncTime = Date.now();

    function resetInactivityTimer() {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(autoLogout, 600000); // 10 minutes

        // Throttled cookie timestamp sync (at most once every 30 seconds)
        const now = Date.now();
        if (now - lastSyncTime > 30000) {
            lastSyncTime = now;
            const currentSession = JSON.parse(localStorage.getItem('thrustvault_session'));
            if (currentSession) {
                currentSession.timestamp = now;
                localStorage.setItem('thrustvault_session', JSON.stringify(currentSession));
                const cookieValue = encodeURIComponent(JSON.stringify({
                    email: currentSession.email,
                    role: currentSession.role,
                    timestamp: now
                }));
                const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
                document.cookie = `thrustvault_session=${cookieValue}; path=/; max-age=86400; SameSite=Strict${secureFlag}`;
            }
        }
    }

    function autoLogout() {
        alert("You have been logged out due to 10 minutes of inactivity.");
        logoutAndRedirect('Inactivity Logout', 'Logged out due to 10 minutes of inactivity.');
    }

    const activityEvents = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(evt => {
        window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });

    // Start initial timer
    resetInactivityTimer();

    // Listen for theme changes to update chart colors dynamically
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme') {
                updateMetrics(); // triggers chart recreation with correct theme colors
            }
        });
    });
    themeObserver.observe(document.documentElement, { attributes: true });

    // Initial Fetch
    fetchLogs();
    
    function setupSidebar() {
        if (typeof fetchSidebarCounts === 'function') {
            fetchSidebarCounts();
        }

        if (elements.btnAddCat) {
            elements.btnAddCat.onclick = () => {
                sessionStorage.setItem('triggerAddCategory', 'true');
                window.location.href = 'admin_dashboard';
            };
        }

        const sidebarProfileCard = document.querySelector('.sidebar-user-profile');
        if (sidebarProfileCard) {
            sidebarProfileCard.style.cursor = 'pointer';
            sidebarProfileCard.title = 'View My Profile';
            sidebarProfileCard.onclick = () => {
                sessionStorage.setItem('showMyProfile', 'true');
                window.location.href = 'admin_users';
            };
        }
    }

    if (window.sidebarLoaded) {
        setupSidebar();
    } else {
        window.addEventListener('sidebarLoaded', setupSidebar);
    }
});
