// performance_app.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Validate session exists
    const session = JSON.parse(localStorage.getItem('thrustvault_session'));
    if (!session) {
        localStorage.removeItem('thrustvault_session');
        window.location.href = 'index.html';
        return;
    }

    // Set user profile in sidebar footer
    const email = session.email || '';
    document.getElementById('session-email').textContent = email;
    const avatarInitials = document.getElementById('user-avatar-initials');
    if (avatarInitials && email) {
        avatarInitials.textContent = email.charAt(0).toUpperCase();
    }
    const roleBadge = document.getElementById('session-role-badge');
    if (roleBadge) {
        roleBadge.textContent = session.role.charAt(0).toUpperCase() + session.role.slice(1);
        roleBadge.className = `badge-role role-${session.role}`;
    }

    // XSS Escaping and URL Sanitization Utilities
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function sanitizeUrl(url) {
        if (!url) return '';
        const trimmed = url.trim();
        if (/^(https?:\/\/|\/)/i.test(trimmed)) {
            return trimmed;
        }
        return '#';
    }


    // Enable/Disable creator views based on role
    const isWriter = session.role === 'admin' || session.role === 'intern';
    const tabBtnCreator = document.getElementById('tab-btn-creator');
    if (isWriter && tabBtnCreator) {
        tabBtnCreator.style.display = 'block';
    }

    // Setup catalog link based on role
    const sidebarMenu = document.querySelector('.sidebar-menu-links');
    if (session.role === 'admin' && sidebarMenu) {
        sidebarMenu.innerHTML = `
            <a href="admin_dashboard" class="btn-sidebar-link" title="Catalog Dashboard" style="text-decoration: none; box-sizing: border-box;">
                <i data-lucide="database"></i> Catalog Dashboard
            </a>
            <a href="admin_dashboard#users" class="btn-sidebar-link" title="User Management" style="text-decoration: none; box-sizing: border-box;">
                <i data-lucide="users"></i> User Management
            </a>
            <a href="admin_dashboard#schema" class="btn-sidebar-link" title="Template & Schema Customizer" style="text-decoration: none; box-sizing: border-box;">
                <i data-lucide="settings"></i> Schema Customizer
            </a>
            <a href="performance_analytics" class="btn-sidebar-link active" title="Performance Analytics" style="text-decoration: none; box-sizing: border-box;">
                <i data-lucide="trending-up"></i> Performance Analytics
            </a>
            <a href="admin_exports" class="btn-sidebar-link" title="Data Exporter" style="text-decoration: none; box-sizing: border-box;">
                <i data-lucide="download"></i> Data Exporter
            </a>
            <a href="admin_audit_logs" class="btn-sidebar-link" title="Audit Logs" style="text-decoration: none; box-sizing: border-box;">
                <i data-lucide="shield-alert"></i> Audit Logs
            </a>
        `;
    } else {
        const navLinkCatalog = document.getElementById('nav-link-catalog');
        if (navLinkCatalog) {
            if (session.role === 'intern') {
                navLinkCatalog.href = 'intern_dashboard';
            } else if (session.role === 'guest') {
                navLinkCatalog.href = 'guest_dashboard';
            }
        }
    }

    lucide.createIcons();

    let state = {
        categories: [],      // [{id, name, description}]
        allMotors: [],       // full motors list from DB
        motorsByCat: {},     // { categoryId: [motor, ...] }
        testRuns: [],
        activeMotorId: null,
        activeMetric: 'thrust',
        activeRunId: null,
        chartInstance: null,
        extraColumns: [],    // dynamic extra column names from import
        draftMotorId: null,
        draftCategoryId: null,
        pendingBulkRuns: []
    };

    let supabase = null;

    // DOM Elements
    const elements = {
        // Visualizer
        plotCategorySelect: document.getElementById('plot-category-select'),
        plotMotorSelect: document.getElementById('plot-motor-select'),
        plotMetricSelect: document.getElementById('plot-metric-select'),
        testRunsList: document.getElementById('test-runs-list'),
        activeRunLabel: document.getElementById('active-run-label'),
        dataPointsGridRows: document.getElementById('data-points-grid-rows'),
        totalTestRunsCount: document.getElementById('total-test-runs-count'),
        totalDataPointsCount: document.getElementById('total-data-points-count'),
        confirmModal: document.getElementById('confirm-modal'),
        
        // Tabs
        tabBtnVisualizer: document.getElementById('tab-btn-visualizer'),
        tabBtnCreator: document.getElementById('tab-btn-creator'),
        sectionVisualizer: document.getElementById('section-visualizer'),
        sectionCreator: document.getElementById('section-creator'),

        // Creator Form
        creatorForm: document.getElementById('dataset-creator-form'),
        formCategorySelect: document.getElementById('form-category-select'),
        formCatInfoBadge: document.getElementById('form-cat-info-badge'),
        formCatInfoText: document.getElementById('form-cat-info-text'),
        formTestMotor: document.getElementById('form-test-motor'),
        formTestPropeller: document.getElementById('form-test-propeller'),
        formTestEsc: document.getElementById('form-test-esc'),
        formTestBattery: document.getElementById('form-test-battery'),
        formTestTester: document.getElementById('form-test-tester'),
        btnImportFile: document.getElementById('btn-import-file'),
        btnAddStepRow: document.getElementById('btn-add-step-row'),
        creatorTableRows: document.getElementById('creator-table-rows'),
        btnResetCreator: document.getElementById('btn-reset-creator'),
        btnLogout: document.getElementById('btn-logout')
    };

    // Logging helper
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

    // Modal helpers
    function openModal(modal) { modal.classList.add('show'); }
    function closeModal(modal) { modal.classList.remove('show'); }
    document.querySelectorAll('.modal-close-trigger').forEach(btn => {
        btn.onclick = (e) => closeModal(e.target.closest('.modal-backdrop'));
    });

    // Custom Async Confirmation Dialog Modal
    function customConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = elements.confirmModal;
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

    // Tab Switching
    elements.tabBtnVisualizer.onclick = () => {
        elements.tabBtnVisualizer.classList.add('active');
        elements.tabBtnCreator.classList.remove('active');
        elements.sectionVisualizer.style.display = 'block';
        elements.sectionCreator.style.display = 'none';
        refreshVisualizerData();
    };

    elements.tabBtnCreator.onclick = () => {
        elements.tabBtnCreator.classList.add('active');
        elements.tabBtnVisualizer.classList.remove('active');
        elements.sectionCreator.style.display = 'block';
        elements.sectionVisualizer.style.display = 'none';
    };

    // Logout
    elements.btnLogout.onclick = () => {
        if (session) {
            logUserActivity(session.email, session.role, 'Logout', 'Logged out successfully.');
        }
        if (supabase) {
            supabase.auth.signOut().catch(e => console.error("SignOut error:", e));
        }
        localStorage.removeItem('thrustvault_session');
        window.location.href = 'index.html';
    };

    // Helper to map spreadsheet headers to database fields
    function findStandardField(headerName) {
        const lower = headerName.toLowerCase().trim();
        if (lower.includes('throttle') || lower === '%') return 'throttle';
        if (lower.includes('volt') || lower === 'v') return 'voltage';
        if (lower.includes('current') || lower.includes('amp') || lower === 'a') return 'current';
        if (lower.includes('thrust') || lower === 'g') return 'thrust_g';
        if (lower.includes('rpm') || lower.includes('speed')) return 'rpm';
        if (lower.includes('temp') || lower.includes('temperature') || lower === 'c' || lower === '℃') return 'temperature';
        return null;
    }

    // Rebind headers dynamically when extra columns are loaded
    function rebuildTableHeaders() {
        const tr = document.getElementById('creator-table-headers');
        if (!tr) return;

        let html = `
            <th style="width:80px; white-space:nowrap;">Throttle (%)</th>
            <th style="white-space:nowrap;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                    <span>Voltage (V)</span>
                    <button type="button" class="btn-header-copy-down" data-target-class="inp-voltage" title="Copy first row to all rows" style="border:none; background:none; padding:2px; color:var(--text-muted); cursor:pointer; display:inline-flex; align-items:center; border-radius:4px; transition:all 0.15s;"><i data-lucide="chevron-down" style="width:14px; height:14px;"></i></button>
                </div>
            </th>
            <th style="white-space:nowrap;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                    <span>Current (A)</span>
                    <button type="button" class="btn-header-copy-down" data-target-class="inp-current" title="Copy first row to all rows" style="border:none; background:none; padding:2px; color:var(--text-muted); cursor:pointer; display:inline-flex; align-items:center; border-radius:4px; transition:all 0.15s;"><i data-lucide="chevron-down" style="width:14px; height:14px;"></i></button>
                </div>
            </th>
            <th style="white-space:nowrap;">Power (W)</th>
            <th style="white-space:nowrap;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                    <span>Thrust (g)</span>
                    <button type="button" class="btn-header-copy-down" data-target-class="inp-thrust" title="Copy first row to all rows" style="border:none; background:none; padding:2px; color:var(--text-muted); cursor:pointer; display:inline-flex; align-items:center; border-radius:4px; transition:all 0.15s;"><i data-lucide="chevron-down" style="width:14px; height:14px;"></i></button>
                </div>
            </th>
            <th style="white-space:nowrap;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                    <span>RPM</span>
                    <button type="button" class="btn-header-copy-down" data-target-class="inp-rpm" title="Copy first row to all rows" style="border:none; background:none; padding:2px; color:var(--text-muted); cursor:pointer; display:inline-flex; align-items:center; border-radius:4px; transition:all 0.15s;"><i data-lucide="chevron-down" style="width:14px; height:14px;"></i></button>
                </div>
            </th>
            <th style="white-space:nowrap;">Efficiency (g/W)</th>
            <th style="white-space:nowrap;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                    <span>Temp (℃)</span>
                    <button type="button" class="btn-header-copy-down" data-target-class="inp-temp" title="Copy first row to all rows" style="border:none; background:none; padding:2px; color:var(--text-muted); cursor:pointer; display:inline-flex; align-items:center; border-radius:4px; transition:all 0.15s;"><i data-lucide="chevron-down" style="width:14px; height:14px;"></i></button>
                </div>
            </th>
        `;

        state.extraColumns.forEach(col => {
            html += `
                <th style="white-space:nowrap;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                        <span>${col}</span>
                        <button type="button" class="btn-header-copy-down" data-target-extra="${col.replace(/"/g, '&quot;')}" title="Copy first row to all rows" style="border:none; background:none; padding:2px; color:var(--text-muted); cursor:pointer; display:inline-flex; align-items:center; border-radius:4px; transition:all 0.15s;"><i data-lucide="chevron-down" style="width:14px; height:14px;"></i></button>
                    </div>
                </th>
            `;
        });

        html += `<th style="width:40px; text-align:center;"></th>`;
        tr.innerHTML = html;
        bindCopyDownHandlers();
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    // Bind copy down click actions
    function bindCopyDownHandlers() {
        const copyDownBtns = document.querySelectorAll('.btn-header-copy-down');
        copyDownBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const targetClass = btn.dataset.targetClass;
                const targetExtra = btn.dataset.targetExtra;
                
                const rows = Array.from(elements.creatorTableRows.querySelectorAll('tr'));
                if (rows.length <= 1) return;

                let valToCopy = '';
                if (targetClass) {
                    const firstInput = rows[0].querySelector('.' + targetClass);
                    valToCopy = firstInput ? firstInput.value : '';
                    
                    for (let i = 1; i < rows.length; i++) {
                        const inp = rows[i].querySelector('.' + targetClass);
                        if (inp) {
                            inp.value = valToCopy;
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                } else if (targetExtra) {
                    const firstInput = rows[0].querySelector(`.inp-extra[data-col-name="${targetExtra}"]`);
                    valToCopy = firstInput ? firstInput.value : '';

                    for (let i = 1; i < rows.length; i++) {
                        const inp = rows[i].querySelector(`.inp-extra[data-col-name="${targetExtra}"]`);
                        if (inp) {
                            inp.value = valToCopy;
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                }
            };
        });
    }

    // Dynamic row addition for dataset creator supporting extra columns
    function addCreatorRow(throttleVal = '', rowData = {}) {
        const tr = document.createElement('tr');
        
        let html = `
            <td><input type="number" step="any" min="0" max="100" class="inp-throttle" required placeholder="e.g. 50" value="${throttleVal}"></td>
            <td><input type="number" step="any" min="0" class="inp-voltage" required placeholder="14.8" value="${rowData.voltage !== undefined ? rowData.voltage : ''}"></td>
            <td><input type="number" step="any" min="0" class="inp-current" required placeholder="1.3" value="${rowData.current !== undefined ? rowData.current : ''}"></td>
            <td><input type="number" class="inp-power" readonly placeholder="0.00"></td>
            <td><input type="number" step="any" min="0" class="inp-thrust" required placeholder="350" value="${rowData.thrust_g !== undefined ? rowData.thrust_g : ''}"></td>
            <td><input type="number" step="any" min="0" class="inp-rpm" placeholder="2700" value="${rowData.rpm !== undefined ? rowData.rpm : ''}"></td>
            <td><input type="number" class="inp-efficiency" readonly placeholder="0.00"></td>
            <td><input type="number" step="any" class="inp-temp" placeholder="43" value="${rowData.temperature !== undefined ? rowData.temperature : ''}"></td>
        `;

        // Render inputs for dynamic extra columns
        state.extraColumns.forEach(col => {
            const val = rowData.extra_data && rowData.extra_data[col] !== undefined ? rowData.extra_data[col] : '';
            html += `
                <td><input type="text" class="inp-extra" data-col-name="${col.replace(/"/g, '&quot;')}" placeholder="Value" value="${val}"></td>
            `;
        });

        html += `
            <td style="text-align:center;">
                <button type="button" class="btn-delete btn-row-delete" style="padding:6px; background:none; border:none; color:var(--danger-color); cursor:pointer;"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
            </td>
        `;
        
        tr.innerHTML = html;

        // Bind auto-calculations on input changes
        const voltageInp = tr.querySelector('.inp-voltage');
        const currentInp = tr.querySelector('.inp-current');
        const thrustInp = tr.querySelector('.inp-thrust');
        const powerInp = tr.querySelector('.inp-power');
        const efficiencyInp = tr.querySelector('.inp-efficiency');

        function calculateFields() {
            const v = parseFloat(voltageInp.value) || 0;
            const a = parseFloat(currentInp.value) || 0;
            const t = parseFloat(thrustInp.value) || 0;
            
            const power = v * a;
            powerInp.value = power > 0 ? power.toFixed(2) : '';

            if (power > 0 && t > 0) {
                const eff = t / power;
                efficiencyInp.value = eff.toFixed(2);
            } else {
                efficiencyInp.value = '';
            }
        }

        voltageInp.addEventListener('input', calculateFields);
        currentInp.addEventListener('input', calculateFields);
        thrustInp.addEventListener('input', calculateFields);

        // Run initial calculation for loaded values
        calculateFields();

        // Bind delete row
        tr.querySelector('.btn-row-delete').onclick = () => {
            tr.remove();
        };

        elements.creatorTableRows.appendChild(tr);
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    elements.btnAddStepRow.onclick = () => {
        addCreatorRow();
    };

    // Initialize Creator Form defaults (50%, 65%, 75%, 85%, 100%)
    function initializeCreatorTable() {
        elements.creatorTableRows.innerHTML = '';
        const defaultSteps = [50, 65, 75, 85, 100];
        defaultSteps.forEach(step => addCreatorRow(step));
    }

    // Handle spreadsheet file upload
    if (elements.btnImportFile) {
        elements.btnImportFile.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Strict file extension and size validation
            const allowedExtensions = ['.xlsx', '.xls', '.json', '.csv'];
            const fileNameLower = file.name.toLowerCase();
            const hasValidExt = allowedExtensions.some(ext => fileNameLower.endsWith(ext));
            if (!hasValidExt) {
                alert("Security Error: Only spreadsheet files (.xlsx, .xls, .csv, .json) are allowed.");
                e.target.value = '';
                return;
            }
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                alert("Security Error: File size exceeds the 5MB limit.");
                e.target.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = new Uint8Array(evt.target.result);
                    
                    // Robust check: decode as UTF-8 string first to check if it is HTML
                    let htmlText = "";
                    try {
                        const decoder = new TextDecoder("utf-8");
                        htmlText = decoder.decode(data);
                    } catch (decodeErr) {
                        console.warn("Failed to decode as UTF-8, using binary XLSX parser:", decodeErr);
                    }

                    let workbook;
                    const trimmedText = htmlText.trim();
                    if (trimmedText.startsWith('<html') || trimmedText.startsWith('<table') || trimmedText.startsWith('<?xml')) {
                        workbook = XLSX.read(trimmedText, { type: 'string' });
                    } else {
                        workbook = XLSX.read(data, { type: 'array' });
                    }

                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    if (!worksheet) {
                        alert("Could not load worksheet.");
                        return;
                    }

                    // Pre-fill merged cells using worksheet['!merges']
                    if (worksheet['!merges']) {
                        worksheet['!merges'].forEach(merge => {
                            const startRow = merge.s.r;
                            const startCol = merge.s.c;
                            const endRow = merge.e.r;
                            const endCol = merge.e.c;
                            
                            const startCellRef = XLSX.utils.encode_cell({ r: startRow, c: startCol });
                            const startCell = worksheet[startCellRef];
                            const val = startCell ? startCell.v : undefined;
                            const formatted = startCell ? startCell.w : undefined;
                            
                            if (val !== undefined) {
                                for (let r = startRow; r <= endRow; r++) {
                                    for (let c = startCol; c <= endCol; c++) {
                                        const cellRef = XLSX.utils.encode_cell({ r: r, c: c });
                                        if (!worksheet[cellRef]) {
                                            worksheet[cellRef] = { v: val, t: startCell.t, w: formatted };
                                        } else {
                                            if (worksheet[cellRef].v === undefined) worksheet[cellRef].v = val;
                                            if (worksheet[cellRef].w === undefined) worksheet[cellRef].w = formatted;
                                        }
                                    }
                                }
                            }
                        });
                    }

                    const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    if (sheetData.length === 0) {
                        alert("The uploaded sheet is empty.");
                        return;
                    }

                    // 1. Scan rows to find the actual header row
                    let headerRowIndex = -1;
                    let headers = [];

                    for (let r = 0; r < sheetData.length; r++) {
                        const row = sheetData[r];
                        if (!row || row.length === 0) continue;
                        
                        let matchCount = 0;
                        row.forEach(cell => {
                            if (cell !== undefined && cell !== null) {
                                const lower = String(cell).toLowerCase().trim();
                                if (lower.includes('throttle') || lower === '%') matchCount++;
                                else if (lower.includes('volt') || lower === 'v') matchCount++;
                                else if (lower.includes('current') || lower.includes('amp') || lower === 'a') matchCount++;
                                else if (lower.includes('thrust') || lower === 'g') matchCount++;
                            }
                        });

                        if (matchCount >= 3) {
                            headerRowIndex = r;
                            headers = row.map(h => (h !== undefined && h !== null) ? String(h).trim() : '');
                            break;
                        }
                    }

                    // Fallback to row 0 if no header found
                    if (headerRowIndex === -1 && sheetData.length > 0) {
                        headers = sheetData[0].map(h => (h !== undefined && h !== null) ? String(h).trim() : '');
                        headerRowIndex = 0;
                    }

                    // 2. Extract metadata from comments and non-data cells
                    const metadata = {};
                    const processMetadataCell = (cell) => {
                        if (cell !== undefined && cell !== null) {
                            const cleanCell = String(cell).replace(/^#\s*/, '').trim();
                            if (cleanCell.includes(':')) {
                                const parts = cleanCell.split(':');
                                const key = parts[0].trim().toLowerCase();
                                const val = parts.slice(1).join(':').trim();
                                metadata[key] = val;
                            }
                        }
                    };

                    const limit = headerRowIndex !== -1 ? headerRowIndex : sheetData.length;
                    for (let r = 0; r < limit; r++) {
                        const row = sheetData[r];
                        if (row) {
                            row.forEach(processMetadataCell);
                        }
                    }

                    // 3. Process all rows and detect runs
                    const startDataIdx = headerRowIndex !== -1 ? headerRowIndex + 1 : 1;
                    const parsedRows = [];

                    for (let r = startDataIdx; r < sheetData.length; r++) {
                        const row = sheetData[r];
                        if (!row || row.length === 0) continue;
                        
                        // Check if it is a trailing metadata comment
                        if (row[0] !== undefined && row[0] !== null && String(row[0]).trim().startsWith('#')) {
                            processMetadataCell(row[0]);
                            continue;
                        }

                        // Just record raw cells for mapping later
                        const rawRowCells = [];
                        let hasData = false;
                        for (let c = 0; c < headers.length; c++) {
                            const val = row[c];
                            rawRowCells.push(val !== undefined && val !== null ? val : '');
                            if (val !== undefined && val !== null && String(val).trim() !== '') {
                                hasData = true;
                            }
                        }

                        if (hasData) {
                            parsedRows.push({
                                rowIndex: r,
                                cells: rawRowCells
                            });
                        }
                    }

                    if (parsedRows.length === 0) {
                        alert("No valid data rows found.");
                        return;
                    }

                    // Look for Type and Propeller columns to group runs
                    let typeColIdx = -1;
                    let propColIdx = -1;

                    headers.forEach((h, idx) => {
                        const lower = h.toLowerCase().trim();
                        if (lower.includes('type') || lower === 'motor' || lower.includes('motor model') || lower.includes('motor type')) {
                            if (typeColIdx === -1) typeColIdx = idx;
                        }
                        if (lower.includes('propeller') || lower.includes('prop')) {
                            if (propColIdx === -1) propColIdx = idx;
                        }
                    });

                    // Group runs based on the parsed rows
                    const runs = {};
                    parsedRows.forEach(pRow => {
                        // Skip row if it looks like a trailing note/explanation rather than a data point
                        if (pRow.cells[0] && String(pRow.cells[0]).toLowerCase().startsWith('note:')) {
                            return;
                        }

                        let motorModel = "";
                        let propellerModel = "";

                        if (typeColIdx !== -1) motorModel = String(pRow.cells[typeColIdx]).trim();
                        if (propColIdx !== -1) propellerModel = String(pRow.cells[propColIdx]).trim();

                        // Fallbacks to comments metadata
                        if (!motorModel) motorModel = metadata['motor model'] || metadata['motor'] || '';
                        if (!propellerModel) propellerModel = metadata['propeller model'] || metadata['propeller'] || '';

                        // General defaults if none found
                        if (!motorModel) motorModel = "Unknown Motor";
                        if (!propellerModel) propellerModel = "Unknown Propeller";

                        const key = `${motorModel}::${propellerModel}`;
                        if (!runs[key]) {
                            runs[key] = {
                                motorModel: motorModel,
                                propellerModel: propellerModel,
                                rows: []
                            };
                        }
                        runs[key].rows.push(pRow);
                    });

                    const runKeys = Object.keys(runs);
                    if (runKeys.length === 0) {
                        alert("No valid test runs detected.");
                        return;
                    }

                    // Open column mapper directly for the entire set of runs
                    openColumnMapper(headers, runs, metadata);

                } catch (err) {
                    console.error("Error reading spreadsheet file:", err);
                    alert("Failed to parse file: " + err.message);
                } finally {
                    elements.btnImportFile.value = '';
                }
            };
            reader.readAsArrayBuffer(file);
        };
    }

    // Displays the Column Mapping & Preview Workspace modal
    function openColumnMapper(headers, runs, fileMetadata) {
        const modal = document.getElementById('column-mapping-modal');
        const headerTr = document.getElementById('mapping-table-header');
        const bodyTbody = document.getElementById('mapping-table-body');
        const validationAlert = document.getElementById('mapping-validation-alert');
        const validationText = document.getElementById('mapping-validation-text');
        const infoSummary = document.getElementById('mapping-info-summary');
        const btnConfirm = document.getElementById('btn-confirm-mapping');

        headerTr.innerHTML = '';
        bodyTbody.innerHTML = '';
        validationAlert.style.display = 'none';

        const runKeys = Object.keys(runs);
        const previewRun = runs[runKeys[0]];

        // 1. Determine default mappings
        const defaultMappings = headers.map(h => {
            const lower = h.toLowerCase().trim();
            // Check standard data columns
            const stdField = findStandardField(h);
            if (stdField) return stdField;

            // Check metadata columns
            if (lower.includes('type') || lower === 'motor' || lower.includes('motor model') || lower.includes('motor type')) return 'meta_motor_model';
            if (lower.includes('propeller') || lower.includes('prop')) return 'meta_propeller_model';
            if (lower.includes('esc')) return 'meta_esc_model';
            if (lower.includes('battery')) return 'meta_battery_info';
            if (lower.includes('tester') || lower.includes('conducted by')) return 'meta_test_conducted_by';

            return 'ignore';
        });

        // 2. Build the Header rows
        const trSelects = document.createElement('tr');
        const trNames = document.createElement('tr');

        headers.forEach((h, cIdx) => {
            const thSelect = document.createElement('th');
            thSelect.style.padding = '10px';
            thSelect.style.minWidth = '165px';
            thSelect.style.background = '#f1f5f9';
            thSelect.style.borderBottom = '1px solid #cbd5e1';

            const defaultVal = defaultMappings[cIdx];

            thSelect.innerHTML = `
                <select class="mapping-select" data-col-idx="${cIdx}" style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid #cbd5e1; font-family:'Inter'; font-size:0.8rem; outline:none; background:#ffffff; color:#0f172a; box-sizing:border-box;">
                    <option value="ignore" ${defaultVal === 'ignore' ? 'selected' : ''}>-- Ignore Column --</option>
                    <option value="throttle" ${defaultVal === 'throttle' ? 'selected' : ''}>Throttle (%)</option>
                    <option value="voltage" ${defaultVal === 'voltage' ? 'selected' : ''}>Voltage (V)</option>
                    <option value="current" ${defaultVal === 'current' ? 'selected' : ''}>Current (A)</option>
                    <option value="thrust_g" ${defaultVal === 'thrust_g' ? 'selected' : ''}>Thrust (g)</option>
                    <option value="rpm" ${defaultVal === 'rpm' ? 'selected' : ''}>RPM</option>
                    <option value="temperature" ${defaultVal === 'temperature' ? 'selected' : ''}>Temperature (℃)</option>
                    <option value="meta_motor_model" ${defaultVal === 'meta_motor_model' ? 'selected' : ''}>Motor Model Name</option>
                    <option value="meta_propeller_model" ${defaultVal === 'meta_propeller_model' ? 'selected' : ''}>Propeller Model Name</option>
                    <option value="meta_esc_model" ${defaultVal === 'meta_esc_model' ? 'selected' : ''}>ESC Model</option>
                    <option value="meta_battery_info" ${defaultVal === 'meta_battery_info' ? 'selected' : ''}>Battery Spec</option>
                    <option value="meta_test_conducted_by" ${defaultVal === 'meta_test_conducted_by' ? 'selected' : ''}>Tester Name</option>
                    <option value="custom">Custom Column...</option>
                </select>
                <input type="text" class="mapping-custom-name" data-col-idx="${cIdx}" placeholder="Enter column name" style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid #cbd5e1; font-family:'Inter'; font-size:0.8rem; margin-top:6px; display:none; box-sizing:border-box; background:#ffffff; color:#0f172a;">
            `;

            trSelects.appendChild(thSelect);

            const thName = document.createElement('th');
            thName.style.padding = '10px';
            thName.style.background = '#e2e8f0';
            thName.style.borderBottom = '2px solid #cbd5e1';
            thName.style.color = '#334155';
            thName.style.fontWeight = '600';
            thName.style.fontSize = '0.8rem';
            thName.style.textAlign = 'left';
            thName.textContent = h || `[Column ${cIdx + 1}]`;
            trNames.appendChild(thName);
        });

        headerTr.appendChild(trSelects);
        headerTr.appendChild(trNames);

        // 3. Build Preview Rows (max 10 rows) using the first run
        const previewRows = previewRun.rows.slice(0, 10);
        previewRows.forEach(pRow => {
            const tr = document.createElement('tr');
            pRow.cells.forEach(cell => {
                const td = document.createElement('td');
                td.style.padding = '8px 10px';
                td.style.borderBottom = '1px solid #e2e8f0';
                td.style.fontSize = '0.8rem';
                td.style.color = '#475569';
                td.textContent = cell !== undefined && cell !== null ? String(cell) : '';
                tr.appendChild(td);
            });
            bodyTbody.appendChild(tr);
        });

        // 4. Set up change event listeners for Validation
        const selects = headerTr.querySelectorAll('.mapping-select');
        const customInputs = headerTr.querySelectorAll('.mapping-custom-name');

        function runValidation() {
            const customNames = {};
            let throttleMapped = false;
            let thrustMapped = false;
            let hasDuplicates = false;
            let blankCustom = false;
            let duplicateCustom = false;

            const mappedFieldsCount = {};

            selects.forEach((select, idx) => {
                const val = select.value;
                const customInput = customInputs[idx];

                if (val === 'custom') {
                    customInput.style.display = 'block';
                    const customName = customInput.value.trim();
                    if (!customName) {
                        blankCustom = true;
                    } else {
                        const lowerName = customName.toLowerCase();
                        if (customNames[lowerName]) {
                            duplicateCustom = true;
                        }
                        customNames[lowerName] = true;
                    }
                } else {
                    customInput.style.display = 'none';
                    if (val !== 'ignore') {
                        if (mappedFieldsCount[val]) {
                            hasDuplicates = true;
                        }
                        mappedFieldsCount[val] = true;

                        if (val === 'throttle') throttleMapped = true;
                        if (val === 'thrust_g') thrustMapped = true;
                    }
                }
            });

            // Check if errors exist
            let errMsg = "";
            if (!throttleMapped || !thrustMapped) {
                errMsg = "Both 'Throttle (%)' and 'Thrust (g)' columns must be mapped to import the dataset.";
            } else if (hasDuplicates) {
                errMsg = "You have mapped multiple columns to the same field. Each field can only be mapped once.";
            } else if (blankCustom) {
                errMsg = "Please enter a name for all Custom Columns.";
            } else if (duplicateCustom) {
                errMsg = "Custom column names must be unique.";
            }

            if (errMsg) {
                validationText.textContent = errMsg;
                validationAlert.style.display = 'flex';
                btnConfirm.disabled = true;
            } else {
                validationAlert.style.display = 'none';
                btnConfirm.disabled = false;
            }

            infoSummary.textContent = `Spreadsheet Columns Detected | ${runKeys.length} test run(s) found`;
            if (window.lucide) window.lucide.createIcons();
        }

        selects.forEach((select, idx) => {
            select.onchange = () => {
                const customInput = customInputs[idx];
                if (select.value === 'custom') {
                    customInput.value = headers[idx] || "";
                }
                runValidation();
            };
        });

        customInputs.forEach(input => {
            input.oninput = runValidation;
        });

        // Run initial validation
        runValidation();

        // 5. Confirm mapping button handler
        btnConfirm.onclick = () => {
            const mappings = [];
            const extraCols = [];

            selects.forEach((select, idx) => {
                const target = select.value;
                if (target !== 'ignore') {
                    if (target === 'custom') {
                        const customName = customInputs[idx].value.trim();
                        mappings.push({ colIdx: idx, targetField: 'extra_data', customName: customName });
                        extraCols.push(customName);
                    } else {
                        mappings.push({ colIdx: idx, targetField: target });
                    }
                }
            });

            state.extraColumns = extraCols;
            
            // Loop through all runs and parse them
            state.pendingBulkRuns = [];
            runKeys.forEach(key => {
                const runItem = runs[key];
                const metaValues = { ...fileMetadata };
                
                mappings.forEach(map => {
                    if (map.targetField.startsWith('meta_')) {
                        const cleanField = map.targetField.replace('meta_', '');
                        for (let r = 0; r < runItem.rows.length; r++) {
                            const val = runItem.rows[r].cells[map.colIdx];
                            if (val !== undefined && val !== null && String(val).trim() !== '') {
                                metaValues[cleanField] = String(val).trim();
                                break;
                            }
                        }
                    }
                });

                const tester = metaValues.test_conducted_by || metaValues.tester || '';
                const propeller = metaValues.propeller_model || metaValues.propeller || runItem.propellerModel;
                const esc = metaValues.esc_model || metaValues.esc || '';
                const battery = metaValues.battery_info || metaValues.battery || '';
                const motorName = metaValues.motor_model || runItem.motorModel;

                // Match motor model from database
                let matchedMotorId = null;
                if (motorName && state.allMotors) {
                    const cleanSearchName = motorName.toLowerCase().replace(/[\s\-_]/g, '');
                    const matchedMotor = state.allMotors.find(m => {
                        // Skip draft run
                        if (m.id === state.draftMotorId) return false;
                        const fullName = (m.company + ' ' + m.motor_name).toLowerCase().replace(/[\s\-_]/g, '');
                        const partialName = m.motor_name.toLowerCase().replace(/[\s\-_]/g, '');
                        return cleanSearchName.includes(fullName) || cleanSearchName.includes(partialName) || fullName.includes(cleanSearchName) || partialName.includes(cleanSearchName);
                    });

                    if (matchedMotor) {
                        matchedMotorId = matchedMotor.id;
                    }
                }

                // Process rows
                const parsedRows = [];
                runItem.rows.forEach(pRow => {
                    const rowData = { extra_data: {} };
                    let throttleVal = null;
                    let thrustVal = null;

                    mappings.forEach(map => {
                        const cellVal = pRow.cells[map.colIdx];
                        if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
                            if (map.targetField === 'throttle') {
                                let t = parseFloat(cellVal);
                                if (t <= 1.0) {
                                    t = Math.round(t * 100);
                                }
                                throttleVal = t;
                            } else if (map.targetField === 'thrust_g') {
                                thrustVal = parseFloat(cellVal);
                                rowData.thrust_g = thrustVal;
                            } else if (map.targetField === 'extra_data') {
                                rowData.extra_data[map.customName] = cellVal;
                            } else if (!map.targetField.startsWith('meta_')) {
                                rowData[map.targetField] = cellVal;
                            }
                        }
                    });

                    if (throttleVal !== null && !isNaN(throttleVal) && thrustVal !== null && !isNaN(thrustVal)) {
                        parsedRows.push({
                            throttle: throttleVal / 100, // convert percentage (e.g. 50% -> 0.5)
                            voltage: rowData.voltage !== undefined ? parseFloat(rowData.voltage) : null,
                            current: rowData.current !== undefined ? parseFloat(rowData.current) : null,
                            power: (rowData.voltage && rowData.current) ? parseFloat(rowData.voltage) * parseFloat(rowData.current) : null,
                            thrust_g: thrustVal,
                            rpm: rowData.rpm !== undefined ? parseFloat(rowData.rpm) : null,
                            efficiency: (rowData.voltage && rowData.current && parseFloat(rowData.voltage) * parseFloat(rowData.current) > 0) ? thrustVal / (parseFloat(rowData.voltage) * parseFloat(rowData.current)) : null,
                            temperature: rowData.temperature !== undefined ? parseFloat(rowData.temperature) : null,
                            extra_data: rowData.extra_data
                        });
                    }
                });

                if (parsedRows.length > 0) {
                    state.pendingBulkRuns.push({
                        motorModel: motorName,
                        propellerModel: propeller,
                        metadata: {
                            esc_model: esc,
                            battery_info: battery,
                            test_conducted_by: tester
                        },
                        rows: parsedRows,
                        matchedMotorId: matchedMotorId,
                        extraColumns: extraCols
                    });
                }
            });

            closeModal(modal);
            
            if (state.pendingBulkRuns.length === 0) {
                alert("No valid data rows found in any run.");
            } else {
                openBulkPreviewModal();
            }
        };

        openModal(modal);
        if (window.lucide) window.lucide.createIcons();
    }

    // Displays the list of detected test runs in a modal
    function openBulkPreviewModal() {
        const modal = document.getElementById('bulk-preview-modal');
        const listContainer = document.getElementById('bulk-preview-list');
        listContainer.innerHTML = '';
        
        // Build motor options for matching dropdown
        let motorDropdownOptionsHtml = '<option value="">-- Match Motor (Unmatched, Save as Draft) --</option>';
        state.categories.forEach(cat => {
            if (cat.id === state.draftCategoryId) return; // Hide System Drafts
            const label = cat.name.toLowerCase().includes('class') ? cat.name : `${cat.name} Class`;
            motorDropdownOptionsHtml += `<optgroup label="${label}">`;
            const catMotors = state.motorsByCat[cat.id] || [];
            catMotors.forEach(m => {
                motorDropdownOptionsHtml += `<option value="${m.id}">${escapeHTML(m.company)} - ${escapeHTML(m.motor_name)}</option>`;
            });
            motorDropdownOptionsHtml += `</optgroup>`;
        });

        state.pendingBulkRuns.forEach((run, index) => {
            const tr = document.createElement('tr');
            
            const isMatched = !!run.matchedMotorId;
            const rowCount = run.rows.length;
            
            tr.innerHTML = `
                <td style="text-align:center; padding:10px 4px;">
                    <input type="checkbox" class="bulk-run-import-check" data-run-index="${index}" checked style="width:16px; height:16px; cursor:pointer;">
                </td>
                <td style="font-weight:600; font-family:'Outfit'; color:#0f172a; padding:10px 8px;">${escapeHTML(run.motorModel)}</td>
                <td style="padding:10px 8px;">
                    <select class="bulk-run-motor-select" data-run-index="${index}" style="width:100%; padding:6px 8px; border-radius:6px; border:1px solid #cbd5e1; font-family:'Inter'; font-size:0.8rem; background:#ffffff;">
                        ${motorDropdownOptionsHtml}
                    </select>
                </td>
                <td style="padding:10px 8px;">${escapeHTML(run.propellerModel)}</td>
                <td style="padding:10px 8px;">${escapeHTML(run.metadata.esc_model || '—')}</td>
                <td style="padding:10px 8px;">${escapeHTML(run.metadata.battery_info || '—')}</td>
                <td style="padding:10px 8px;">${escapeHTML(run.metadata.test_conducted_by || '—')}</td>
                <td style="text-align:center; font-weight:600; padding:10px 8px;">${rowCount}</td>
                <td style="text-align:center; padding:10px 8px;">
                    <button type="button" class="btn-outline-sm btn-run-keep-editing" data-run-index="${index}" style="padding:4px 8px; font-size:0.75rem; border-radius:4px; display:inline-flex; align-items:center; gap:2px; font-family:'Inter'; font-weight:500;">
                        <i data-lucide="edit-2" style="width:12px; height:12px;"></i> Keep Editing
                    </button>
                </td>
            `;

            listContainer.appendChild(tr);

            const selectEl = tr.querySelector('.bulk-run-motor-select');
            if (isMatched) {
                selectEl.value = run.matchedMotorId;
            } else {
                selectEl.value = '';
            }

            function updateRowStyle() {
                const checked = tr.querySelector('.bulk-run-import-check').checked;
                const motorId = selectEl.value;
                if (!checked) {
                    tr.style.opacity = '0.5';
                    tr.style.background = 'none';
                } else if (motorId) {
                    tr.style.opacity = '1.0';
                    tr.style.background = '#f0fdf4'; // Light green
                } else {
                    tr.style.opacity = '1.0';
                    tr.style.background = '#fffbeb'; // Light amber
                }
            }

            selectEl.onchange = (e) => {
                run.matchedMotorId = e.target.value;
                updateRowStyle();
                updateBulkSummary();
            };

            tr.querySelector('.bulk-run-import-check').onchange = () => {
                updateRowStyle();
                updateBulkSummary();
            };

            updateRowStyle();

            tr.querySelector('.btn-run-keep-editing').onclick = () => {
                closeModal(modal);
                loadRunIntoCreatorForm(run);
            };
        });

        if (window.lucide) window.lucide.createIcons();
        updateBulkSummary();
        openModal(modal);
    }

    function updateBulkSummary() {
        const modal = document.getElementById('bulk-preview-modal');
        const rows = Array.from(modal.querySelectorAll('#bulk-preview-list tr'));
        
        let importCount = 0;
        let draftCount = 0;
        let excludedCount = 0;

        rows.forEach(tr => {
            const checked = tr.querySelector('.bulk-run-import-check').checked;
            const motorId = tr.querySelector('.bulk-run-motor-select').value;
            if (!checked) {
                excludedCount++;
            } else if (motorId) {
                importCount++;
            } else {
                draftCount++;
            }
        });

        document.getElementById('bulk-preview-summary').innerHTML = `
            Ready to Import: <strong style="color:var(--success-color);">${importCount}</strong> | 
            Save as Draft: <strong style="color:#d97706;">${draftCount}</strong> | 
            Excluded: <span style="color:#64748b;">${excludedCount}</span>
        `;
    }

    // Loads a single run into manual editor
    function loadRunIntoCreatorForm(run) {
        state.extraColumns = run.extraColumns || [];
        rebuildTableHeaders();
        elements.creatorTableRows.innerHTML = '';

        elements.formTestPropeller.value = run.propellerModel || '';
        elements.formTestEsc.value = run.metadata.esc_model || '';
        elements.formTestBattery.value = run.metadata.battery_info || '';
        elements.formTestTester.value = run.metadata.test_conducted_by || '';

        if (run.matchedMotorId) {
            const motor = state.allMotors.find(m => m.id === run.matchedMotorId);
            if (motor) {
                elements.formCategorySelect.value = motor.category_id;
                elements.formCategorySelect.dispatchEvent(new Event('change'));
                elements.formTestMotor.value = motor.id;
            }
        } else {
            elements.formCategorySelect.value = '';
            elements.formCategorySelect.dispatchEvent(new Event('change'));
        }

        run.rows.forEach(pt => {
            const rowData = {
                voltage: pt.voltage,
                current: pt.current,
                thrust_g: pt.thrust_g,
                rpm: pt.rpm,
                temperature: pt.temperature,
                extra_data: pt.extra_data
            };
            addCreatorRow(pt.throttle * 100, rowData);
        });

        elements.tabBtnCreator.click();
        alert(`Loaded test run for "${run.motorModel}" into editor! You can now adjust and save manually.`);
    }

    // Save all selected bulk runs (Save as drafts if unmatched)
    const btnBulkSave = document.getElementById('btn-bulk-save');
    if (btnBulkSave) {
        btnBulkSave.onclick = async () => {
            const saveBtn = document.getElementById('btn-bulk-save');
            saveBtn.disabled = true;
            const oldHtml = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="animate-pulse">Saving All...</i>';

            const rows = Array.from(document.querySelectorAll('#bulk-preview-list tr'));
            const runsToSave = [];

            rows.forEach(tr => {
                const checked = tr.querySelector('.bulk-run-import-check').checked;
                if (!checked) return;

                const runIdx = parseInt(tr.querySelector('.bulk-run-import-check').dataset.runIndex);
                const run = state.pendingBulkRuns[runIdx];
                const selectedMotorId = tr.querySelector('.bulk-run-motor-select').value;
                
                runsToSave.push({
                    run: run,
                    selectedMotorId: selectedMotorId
                });
            });

            if (runsToSave.length === 0) {
                alert("No runs selected for import.");
                saveBtn.disabled = false;
                saveBtn.innerHTML = oldHtml;
                return;
            }

            let savedCount = 0;
            let errorCount = 0;
            let firstError = null;

            for (const item of runsToSave) {
                const { run, selectedMotorId } = item;
                
                let motorId = selectedMotorId;
                let propellerModel = run.propellerModel;
                
                if (!motorId) {
                    motorId = state.draftMotorId;
                    propellerModel = `[DRAFT: ${run.motorModel}] ${run.propellerModel}`;
                }

                try {
                    // 1. Insert into motor_test_runs
                    const { data: runData, error: runError } = await supabase
                        .from('motor_test_runs')
                        .insert([{
                            motor_id: motorId,
                            propeller_model: propellerModel,
                            esc_model: run.metadata.esc_model || null,
                            battery_info: run.metadata.battery_info || null,
                            test_conducted_by: run.metadata.test_conducted_by || null
                        }])
                        .select()
                        .single();

                    if (runError) throw runError;
                    const runId = runData.id;

                    // 2. Insert all data points
                    const pointsPayload = run.rows.map(pt => ({
                        test_run_id: runId,
                        throttle: pt.throttle,
                        voltage: pt.voltage,
                        current: pt.current,
                        power: pt.power,
                        thrust_g: pt.thrust_g,
                        rpm: pt.rpm,
                        efficiency: pt.efficiency,
                        temperature: pt.temperature,
                        extra_data: pt.extra_data
                    }));

                    const { error: pointsError } = await supabase
                        .from('motor_test_data_points')
                        .insert(pointsPayload);

                    if (pointsError) throw pointsError;
                    savedCount++;
                } catch (err) {
                    console.error("Failed to import run:", run.motorModel, err);
                    errorCount++;
                    if (!firstError) firstError = err;
                }
            }

            closeModal(document.getElementById('bulk-preview-modal'));
            saveBtn.disabled = false;
            saveBtn.innerHTML = oldHtml;

            if (errorCount === 0) {
                alert(`Successfully saved ${savedCount} test run(s)!`);
            } else {
                alert(`Import completed with errors. Saved: ${savedCount}, Failed: ${errorCount}. First error: ${firstError.message}`);
            }

            state.pendingBulkRuns = [];
            await refreshVisualizerData();
            await fetchStats();
            elements.tabBtnVisualizer.click();
        };
    }

    // Opens draft finalizing modal
    function openFinalizeModal(run, originalMotorName) {
        const modal = document.getElementById('finalize-draft-modal');
        const originalNameEl = document.getElementById('finalize-original-motor-name');
        const selectEl = document.getElementById('finalize-motor-select');
        const saveBtn = document.getElementById('btn-save-finalize');

        originalNameEl.textContent = originalMotorName;
        
        // Build motor options
        let optionsHtml = '<option value="">-- Select Registered Motor --</option>';
        state.categories.forEach(cat => {
            if (cat.id === state.draftCategoryId) return; // Skip System Drafts
            const label = cat.name.toLowerCase().includes('class') ? cat.name : `${cat.name} Class`;
            optionsHtml += `<optgroup label="${label}">`;
            const catMotors = state.motorsByCat[cat.id] || [];
            catMotors.forEach(m => {
                optionsHtml += `<option value="${m.id}">${m.company} - ${m.motor_name}</option>`;
            });
            optionsHtml += `</optgroup>`;
        });
        selectEl.innerHTML = optionsHtml;

        // Auto-detect matching registered motor
        if (originalMotorName && state.allMotors) {
            const cleanSearchName = originalMotorName.toLowerCase().replace(/[\s\-_]/g, '');
            const matchedMotor = state.allMotors.find(m => {
                if (m.id === state.draftMotorId) return false;
                const fullName = (m.company + ' ' + m.motor_name).toLowerCase().replace(/[\s\-_]/g, '');
                const partialName = m.motor_name.toLowerCase().replace(/[\s\-_]/g, '');
                return cleanSearchName.includes(fullName) || cleanSearchName.includes(partialName) || fullName.includes(cleanSearchName) || partialName.includes(cleanSearchName);
            });

            if (matchedMotor) {
                selectEl.value = matchedMotor.id;
            } else {
                selectEl.value = '';
            }
        }

        saveBtn.onclick = async () => {
            const selectedMotorId = selectEl.value;
            if (!selectedMotorId) {
                alert("Please select a registered motor model.");
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            try {
                const cleanPropeller = run.propeller_model.replace(/^\[DRAFT:.*?\]\s*/, '');
                const { error } = await supabase
                    .from('motor_test_runs')
                    .update({
                        motor_id: selectedMotorId,
                        propeller_model: cleanPropeller
                    })
                    .eq('id', run.id);

                if (error) throw error;

                alert("Successfully finalized draft run!");
                closeModal(modal);

                const newMotor = state.allMotors.find(m => m.id === selectedMotorId);
                if (newMotor) {
                    state.activeMotorId = selectedMotorId;
                    state.activeRunId = run.id;
                    await refreshVisualizerData();
                    elements.plotCategorySelect.value = newMotor.category_id;
                    onPlotCategoryChange();
                    elements.plotMotorSelect.value = selectedMotorId;
                    await loadMotorRuns(selectedMotorId);
                    loadGridPoints(run.id);
                    elements.activeRunLabel.textContent = `Inspecting Configuration: Prop ${cleanPropeller} + ESC ${run.esc_model || 'None'}`;
                } else {
                    await refreshVisualizerData();
                }

                await fetchStats();
            } catch (err) {
                console.error("Error finalizing draft:", err);
                alert("Failed to finalize draft run: " + err.message);
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save & Finalize';
            }
        };

        openModal(modal);
    }

    // Ensures dummy category & motor exists for storing unmatched draft runs
    async function ensureDraftMotor() {
        try {
            let { data: catData, error: catError } = await supabase
                .from('categories')
                .select('id')
                .eq('name', 'System Drafts')
                .maybeSingle();
            
            let catId;
            if (catError || !catData) {
                const { data: newCat, error: createCatError } = await supabase
                    .from('categories')
                    .insert([{ name: 'System Drafts', description: 'Temporary drafts from spreadsheet imports' }])
                    .select('id')
                    .single();
                if (createCatError) throw createCatError;
                catId = newCat.id;
            } else {
                catId = catData.id;
            }

            let { data: motorData, error: motorError } = await supabase
                .from('motors')
                .select('id')
                .eq('category_id', catId)
                .eq('motor_name', 'Draft Run')
                .maybeSingle();

            let motorId;
            if (motorError || !motorData) {
                const { data: newMotor, error: createMotorError } = await supabase
                    .from('motors')
                    .insert([{
                        category_id: catId,
                        motor_name: 'Draft Run',
                        company: 'System',
                        max_thrust: '0 kg'
                    }])
                    .select('id')
                    .single();
                if (createMotorError) throw createMotorError;
                motorId = newMotor.id;
            } else {
                motorId = motorData.id;
            }

            state.draftMotorId = motorId;
            state.draftCategoryId = catId;
        } catch (err) {
            console.error("Error ensuring draft motor exists:", err);
        }
    }

    // Intercept copy-paste on the creator table rows container
    if (elements.creatorTableRows) {
        elements.creatorTableRows.addEventListener('paste', (e) => {
            const activeEl = document.activeElement;
            if (!activeEl || !activeEl.closest('#creator-table-rows')) return;

            const targetTd = activeEl.closest('td');
            const targetTr = activeEl.closest('tr');
            if (!targetTd || !targetTr) return;

            const clipboardData = e.clipboardData || window.clipboardData;
            const pastedText = clipboardData.getData('text');
            if (!pastedText) return;

            const lines = pastedText.split(/\r?\n/).map(line => line.split('\t')).filter(line => line.length > 0 && line[0] !== '');
            if (lines.length === 0) return;

            e.preventDefault();

            const standardEditableClasses = ['inp-throttle', 'inp-voltage', 'inp-current', 'inp-thrust', 'inp-rpm', 'inp-temp'];
            let startColIndex = -1;
            let isExtra = false;
            let startExtraIndex = -1;

            for (let idx = 0; idx < standardEditableClasses.length; idx++) {
                if (activeEl.classList.contains(standardEditableClasses[idx])) {
                    startColIndex = idx;
                    break;
                }
            }

            if (startColIndex === -1 && activeEl.classList.contains('inp-extra')) {
                isExtra = true;
                const colName = activeEl.dataset.colName;
                startExtraIndex = state.extraColumns.indexOf(colName);
            }

            let rows = Array.from(elements.creatorTableRows.querySelectorAll('tr'));
            const startRowIndex = rows.indexOf(targetTr);

            lines.forEach((line, lineIdx) => {
                const targetRowIdx = startRowIndex + lineIdx;
                if (targetRowIdx >= rows.length) {
                    addCreatorRow();
                    rows = Array.from(elements.creatorTableRows.querySelectorAll('tr'));
                }

                const row = rows[targetRowIdx];

                line.forEach((cellVal, cellIdx) => {
                    const cleanVal = cellVal.trim();
                    if (!cleanVal) return;

                    if (!isExtra) {
                        const colIndex = startColIndex + cellIdx;
                        if (colIndex < standardEditableClasses.length) {
                            const inpClass = standardEditableClasses[colIndex];
                            const inp = row.querySelector('.' + inpClass);
                            if (inp) {
                                inp.value = cleanVal;
                                inp.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        } else {
                            const extraIdx = colIndex - standardEditableClasses.length;
                            if (extraIdx < state.extraColumns.length) {
                                const extraColName = state.extraColumns[extraIdx];
                                const inp = row.querySelector(`.inp-extra[data-col-name="${extraColName}"]`);
                                if (inp) {
                                    inp.value = cleanVal;
                                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                                }
                            }
                        }
                    } else {
                        const extraIdx = startExtraIndex + cellIdx;
                        if (extraIdx < state.extraColumns.length) {
                            const extraColName = state.extraColumns[extraIdx];
                            const inp = row.querySelector(`.inp-extra[data-col-name="${extraColName}"]`);
                            if (inp) {
                                inp.value = cleanVal;
                                inp.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        }
                    }
                });
            });
        });
    }

    elements.btnResetCreator.onclick = async () => {
        const confirmReset = await customConfirm("Clear Dataset?", "Are you sure you want to clear all metadata inputs and data rows?");
        if (confirmReset) {
            elements.creatorForm.reset();
            state.extraColumns = [];
            rebuildTableHeaders();
            initializeCreatorTable();
            // Re-lock motor select and hide category badge
            if (elements.formCatInfoBadge) elements.formCatInfoBadge.classList.remove('visible');
            if (elements.formTestMotor) {
                elements.formTestMotor.innerHTML = '<option value="">-- Select Thrust Level First --</option>';
                elements.formTestMotor.disabled = true;
            }
        }
    };


    elements.creatorForm.onsubmit = async (e) => {
        e.preventDefault();

        const submitBtn = elements.creatorForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="animate-pulse">Saving...</i>';
        }

        const motorId = elements.formTestMotor.value;
        if (!motorId) {
            alert("Please select a Thrust Level and then a Motor Model.");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i data-lucide="save" style="width:16px;"></i> Save Performance Dataset';
                if (window.lucide) window.lucide.createIcons();
            }
            return;
        }

        const propeller = elements.formTestPropeller.value.trim();
        const esc = elements.formTestEsc.value.trim() || null;
        const battery = elements.formTestBattery.value.trim() || null;
        const tester = elements.formTestTester.value.trim() || null;

        const motorModel = elements.formTestMotor.options[elements.formTestMotor.selectedIndex].text;

        const rowEls = Array.from(elements.creatorTableRows.querySelectorAll('tr'));
        if (rowEls.length === 0) {
            alert("Please add at least one throttle step row.");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i data-lucide="save" style="width:16px;"></i> Save Performance Dataset';
                if (window.lucide) window.lucide.createIcons();
            }
            return;
        }


        // Validate values
        const stepsData = [];
        for (const row of rowEls) {
            const throttle = parseFloat(row.querySelector('.inp-throttle').value);
            const voltage = parseFloat(row.querySelector('.inp-voltage').value) || null;
            const current = parseFloat(row.querySelector('.inp-current').value) || null;
            const power = parseFloat(row.querySelector('.inp-power').value) || null;
            const thrust = parseFloat(row.querySelector('.inp-thrust').value);
            const rpm = parseFloat(row.querySelector('.inp-rpm').value) || null;
            const efficiency = parseFloat(row.querySelector('.inp-efficiency').value) || null;
            const temp = parseFloat(row.querySelector('.inp-temp').value) || null;

            if (isNaN(throttle) || isNaN(thrust)) {
                alert("Throttle (%) and Thrust (g) are required and must be numeric values.");
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i data-lucide="save" style="width:16px;"></i> Save Performance Dataset';
                    if (window.lucide) window.lucide.createIcons();
                }
                return;
            }

            // Extract dynamic extra columns
            const extraData = {};
            row.querySelectorAll('.inp-extra').forEach(inp => {
                const colName = inp.dataset.colName;
                if (colName && inp.value.trim() !== '') {
                    const rawVal = inp.value.trim();
                    const numVal = parseFloat(rawVal);
                    extraData[colName] = isNaN(numVal) ? rawVal : numVal;
                }
            });

            stepsData.push({
                throttle: throttle / 100, // convert percentage (e.g. 50% -> 0.5)
                voltage,
                current,
                power,
                thrust_g: thrust,
                rpm,
                efficiency,
                temperature: temp,
                extra_data: extraData
            });
        }

        try {
            // 1. Insert into motor_test_runs
            const { data: runData, error: runError } = await supabase
                .from('motor_test_runs')
                .insert([{
                    motor_id: motorId,
                    propeller_model: propeller,
                    esc_model: esc,
                    battery_info: battery,
                    test_conducted_by: tester
                }])
                .select()
                .single();

            if (runError) throw runError;
            const runId = runData.id;

            // 2. Insert all data points
            const pointsPayload = stepsData.map(pt => ({
                test_run_id: runId,
                ...pt
            }));

            const { error: pointsError } = await supabase
                .from('motor_test_data_points')
                .insert(pointsPayload);

            if (pointsError) throw pointsError;

            // Log activity
            logUserActivity(session.email, session.role, 'Performance Dataset Created', `Added performance dataset for ${motorModel} (Prop: ${propeller}, ESC: ${esc || 'None'})`);

            alert("Successfully saved performance dataset!");
            elements.creatorForm.reset();
            state.extraColumns = [];
            rebuildTableHeaders();
            initializeCreatorTable();
            
            // Fetch latest count and refresh
            await fetchStats();
            elements.tabBtnVisualizer.click();
        } catch (err) {
            console.error("Error saving dataset:", err);
            alert("Failed to save performance dataset: " + err.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i data-lucide="save" style="width:16px;"></i> Save Performance Dataset';
                if (window.lucide) window.lucide.createIcons();
            }
        }
    };

    // Fetch quick counts
    async function fetchStats() {
        try {
            const { count: runsCount, error: runsError } = await supabase
                .from('motor_test_runs')
                .select('*', { count: 'exact', head: true });
            if (runsError) throw runsError;

            const { count: ptsCount, error: ptsError } = await supabase
                .from('motor_test_data_points')
                .select('*', { count: 'exact', head: true });
            if (ptsError) throw ptsError;

            elements.totalTestRunsCount.textContent = runsCount || 0;
            elements.totalDataPointsCount.textContent = ptsCount || 0;
        } catch (err) {
            console.error("Error fetching stats counts:", err);
        }
    }

    // Helper: build motor options HTML for a given category ID
    function buildMotorOptions(categoryId, placeholder) {
        const list = state.motorsByCat[categoryId] || [];
        if (list.length === 0) {
            return `<option value="">${placeholder || 'No motors in this class'}</option>`;
        }
        let html = `<option value="">-- Select Motor --</option>`;
        list.forEach(m => {
            html += `<option value="${m.id}">${m.company} - ${m.motor_name}</option>`;
        });
        return html;
    }

    // Populate both category selects after fetching data
    function populateCategorySelects() {
        const catHtml = '<option value="">-- Select Thrust Level --</option>' +
            state.categories.map(c => {
                const label = c.name.toLowerCase().includes('class') ? c.name : `${c.name} Class`;
                return `<option value="${c.id}">${label}</option>`;
            }).join('');

        if (elements.plotCategorySelect) {
            elements.plotCategorySelect.innerHTML = catHtml;
        }
        if (elements.formCategorySelect) {
            elements.formCategorySelect.innerHTML = catHtml;
        }
    }

    // ── Visualizer: category change → populate motor dropdown ─────────────────
    function onPlotCategoryChange() {
        const catId = elements.plotCategorySelect.value;
        state.activeMotorId = null;
        state.activeRunId = null;
        elements.activeRunLabel.textContent = 'Select a test run to inspect readings';
        elements.dataPointsGridRows.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#64748b; font-size:0.85rem; padding:30px 0;">No configuration selected. Choose a motor and click a test run.</td></tr>`;
        elements.testRunsList.innerHTML = `<div style="color:#64748b; font-size:0.85rem; text-align:center; padding:20px 0;">Select a motor to view test runs.</div>`;
        if (state.chartInstance) { state.chartInstance.destroy(); state.chartInstance = null; }

        const bannerEl = document.getElementById('draft-run-banner');
        if (bannerEl) bannerEl.style.display = 'none';

        if (!catId) {
            elements.plotMotorSelect.innerHTML = '<option value="">-- Select Thrust Level First --</option>';
            elements.plotMotorSelect.disabled = true;
            return;
        }

        elements.plotMotorSelect.innerHTML = buildMotorOptions(catId);
        elements.plotMotorSelect.disabled = false;
        elements.plotMotorSelect.value = '';
    }

    if (elements.plotCategorySelect) {
        elements.plotCategorySelect.onchange = onPlotCategoryChange;
    }

    // ── Creator Form: category change → populate motor dropdown + info badge ──
    function onFormCategoryChange() {
        const catId = elements.formCategorySelect.value;
        elements.formTestMotor.value = '';

        if (!catId) {
            elements.formTestMotor.innerHTML = '<option value="">-- Select Thrust Level First --</option>';
            elements.formTestMotor.disabled = true;
            if (elements.formCatInfoBadge) {
                elements.formCatInfoBadge.classList.remove('visible');
            }
            return;
        }

        // Show category description badge
        const cat = state.categories.find(c => c.id === catId);
        if (cat && elements.formCatInfoBadge && elements.formCatInfoText) {
            elements.formCatInfoText.textContent = cat.description || '';
            elements.formCatInfoBadge.classList.toggle('visible', !!cat.description);
            lucide.createIcons();
        }

        elements.formTestMotor.innerHTML = buildMotorOptions(catId);
        elements.formTestMotor.disabled = false;
        elements.formTestMotor.value = '';
    }

    if (elements.formCategorySelect) {
        elements.formCategorySelect.onchange = onFormCategoryChange;
    }

    // Refresh visualizer selects and charts
    async function refreshVisualizerData() {
        try {
            // Fetch categories (with description)
            const { data: categories, error: categoryError } = await supabase
                .from('categories')
                .select('id, name, description')
                .order('name');
            if (categoryError) throw categoryError;

            // Fetch all motors
            const { data: motors, error: motorError } = await supabase
                .from('motors')
                .select('id, motor_name, company, category_id')
                .order('company')
                .order('motor_name');
            if (motorError) throw motorError;

            state.categories = categories || [];
            state.allMotors  = motors || [];

            // Update sidebar stats
            const mEl = document.getElementById('total-motors-count');
            const cEl = document.getElementById('total-categories-count');
            if (mEl) mEl.textContent = state.allMotors.length;
            if (cEl) cEl.textContent = state.categories.length;

            // Build lookup map: categoryId → [motors]
            state.motorsByCat = {};
            state.categories.forEach(c => { state.motorsByCat[c.id] = []; });
            const uncatKey = '__uncat__';
            state.motorsByCat[uncatKey] = [];
            state.allMotors.forEach(m => {
                if (m.category_id && state.motorsByCat[m.category_id] !== undefined) {
                    state.motorsByCat[m.category_id].push(m);
                } else {
                    state.motorsByCat[uncatKey].push(m);
                }
            });

            // Populate category dropdowns
            populateCategorySelects();

            // Reset motor selects to locked state
            elements.plotMotorSelect.innerHTML  = '<option value="">-- Select Thrust Level First --</option>';
            elements.plotMotorSelect.disabled   = true;
            elements.formTestMotor.innerHTML    = '<option value="">-- Select Thrust Level First --</option>';
            elements.formTestMotor.disabled     = true;

            // Restore active motor if there was a previous selection
            if (state.activeMotorId) {
                const motor = state.allMotors.find(m => m.id === state.activeMotorId);
                if (motor && motor.category_id) {
                    elements.plotCategorySelect.value = motor.category_id;
                    onPlotCategoryChange();
                    elements.plotMotorSelect.value = state.activeMotorId;
                    await loadMotorRuns(state.activeMotorId);
                }
            }
        } catch (err) {
            console.error("Error refreshing visualizer:", err);
        }
    }

    // Load runs on motor select change
    elements.plotMotorSelect.onchange = async () => {
        const motorId = elements.plotMotorSelect.value;
        state.activeMotorId = motorId;
        state.activeRunId = null;
        elements.activeRunLabel.textContent = 'Select a test run to inspect readings';
        elements.dataPointsGridRows.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; color:#64748b; font-size:0.85rem; padding: 30px 0;">
                    No configuration selected. Choose a motor and click a test run.
                </td>
            </tr>
        `;
        
        const bannerEl = document.getElementById('draft-run-banner');
        if (bannerEl) bannerEl.style.display = 'none';

        if (motorId) {
            await loadMotorRuns(motorId);
        } else {
            elements.testRunsList.innerHTML = `
                <div style="color: #64748b; font-size: 0.85rem; text-align: center; padding: 20px 0;">
                    Select a motor to view test runs.
                </div>
            `;
            if (state.chartInstance) {
                state.chartInstance.destroy();
                state.chartInstance = null;
            }
        }
    };

    elements.plotMetricSelect.onchange = () => {
        state.activeMetric = elements.plotMetricSelect.value;
        if (state.activeMotorId) {
            drawPerformanceCurve();
        }
    };

    // Load available runs for a specific motor
    async function loadMotorRuns(motorId) {
        try {
            const { data: runs, error } = await supabase
                .from('motor_test_runs')
                .select('*')
                .eq('motor_id', motorId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            state.testRuns = runs || [];

            if (state.testRuns.length === 0) {
                elements.testRunsList.innerHTML = `
                    <div style="color: #64748b; font-size: 0.85rem; text-align: center; padding: 20px 0;">
                        No calibration datasets found for this motor.
                    </div>
                `;
                if (state.chartInstance) {
                    state.chartInstance.destroy();
                    state.chartInstance = null;
                }
                const bannerEl = document.getElementById('draft-run-banner');
                if (bannerEl) bannerEl.style.display = 'none';
                return;
            }

            elements.testRunsList.innerHTML = state.testRuns.map(run => {
                const date = new Date(run.tested_at).toLocaleDateString();
                const isSelected = state.activeRunId === run.id;
                const isDraft = run.motor_id === state.draftMotorId;
                const displayProp = isDraft ? run.propeller_model.replace(/^\[DRAFT:.*?\]\s*/, '') : run.propeller_model;
                const badgeHtml = isDraft ? `<span style="background:#ffedd5; color:#c2410c; border:1px solid #fed7aa; padding:2px 6px; font-size:0.65rem; border-radius:4px; font-weight:600; text-transform:uppercase; margin-left:6px; display:inline-block; font-family:'Inter';">Draft</span>` : '';
                
                return `
                    <div class="glass-panel btn-sidebar-link ${isSelected ? 'active' : ''}" data-id="${run.id}" style="cursor:pointer; display:flex; flex-direction:column; gap:8px; align-items:start; padding:12px; margin-bottom:8px; width:100%; border:1px solid ${isSelected ? 'var(--primary-color)' : '#cbd5e1'};">
                        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                            <span style="font-weight:700; font-family:'Outfit'; font-size:0.9rem; color:#0f172a; word-break:break-all;">${escapeHTML(displayProp)} ${badgeHtml}</span>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span style="font-size:0.75rem; color:#94a3b8;">${date}</span>
                                ${isWriter ? `
                                <button class="btn-run-delete" data-run-id="${run.id}" title="Delete this test run" style="border:none; background:none; padding:2px; color:var(--danger-color); cursor:pointer; display:inline-flex; align-items:center; border-radius:4px; transition:all 0.15s; margin-left:4px;">
                                    <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                                </button>
                                ` : ''}
                            </div>
                        </div>
                        <div style="font-size:0.8rem; color:#64748b; display:flex; flex-direction:column; gap:2px; text-align:left;">
                            <span><strong>ESC:</strong> ${escapeHTML(run.esc_model || '-')}</span>
                            <span><strong>Battery:</strong> ${escapeHTML(run.battery_info || '-')}</span>
                            <span><strong>Tester:</strong> ${escapeHTML(run.test_conducted_by || '-')}</span>
                        </div>
                    </div>
                `;
            }).join('');

            // Bind click to runs cards
            elements.testRunsList.querySelectorAll('[data-id]').forEach(card => {
                card.onclick = () => {
                    const runId = card.dataset.id;
                    state.activeRunId = runId;
                    
                    // Mark card as active visually
                    elements.testRunsList.querySelectorAll('[data-id]').forEach(c => {
                        c.style.borderColor = '#cbd5e1';
                        c.style.background = 'none';
                    });
                    card.style.borderColor = 'var(--primary-color)';
                    card.style.background = '#eff6ff';

                    const run = state.testRuns.find(x => x.id === runId);
                    
                    const isDraft = run.motor_id === state.draftMotorId;
                    const bannerEl = document.getElementById('draft-run-banner');
                    if (isDraft && bannerEl) {
                        const originalMotorMatch = run.propeller_model.match(/^\[DRAFT:\s*(.*?)\s*\]/);
                        const originalMotorName = originalMotorMatch ? originalMotorMatch[1] : 'Unknown';
                        document.getElementById('draft-original-motor-label').textContent = originalMotorName;
                        bannerEl.style.display = 'flex';
                        
                        const btnFinalize = document.getElementById('btn-trigger-finalize');
                        if (btnFinalize) {
                            btnFinalize.onclick = () => openFinalizeModal(run, originalMotorName);
                        }
                    } else if (bannerEl) {
                        bannerEl.style.display = 'none';
                    }

                    elements.activeRunLabel.textContent = `Inspecting Configuration: Prop ${isDraft ? run.propeller_model.replace(/^\[DRAFT:.*?\]\s*/, '') : run.propeller_model} + ESC ${run.esc_model || 'None'}`;
                    loadGridPoints(runId);
                };
            });

            // Bind click to delete buttons
            if (isWriter) {
                elements.testRunsList.querySelectorAll('.btn-run-delete').forEach(btn => {
                    btn.onclick = async (e) => {
                        e.stopPropagation(); // Prevent card selection click event
                        const runId = btn.dataset.runId;
                        const confirmDelete = await customConfirm("Delete Test Run?", "Are you sure you want to delete this test run and all its recorded calibration data points?");
                        if (confirmDelete) {
                            try {
                                const { error } = await supabase
                                    .from('motor_test_runs')
                                    .delete()
                                    .eq('id', runId);
                                if (error) throw error;
                                
                                logUserActivity(session.email, session.role, 'Performance Dataset Deleted', `Deleted test run ${runId}`);
                                
                                // Reset selection if active was deleted
                                if (state.activeRunId === runId) {
                                    state.activeRunId = null;
                                    elements.activeRunLabel.textContent = 'Select a test run to inspect readings';
                                    elements.dataPointsGridRows.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#64748b; font-size:0.85rem; padding: 30px 0;">No configuration selected. Choose a motor and click a test run.</td></tr>`;
                                    const bannerEl = document.getElementById('draft-run-banner');
                                    if (bannerEl) bannerEl.style.display = 'none';
                                }

                                // Refresh list
                                await loadMotorRuns(state.activeMotorId);
                                await fetchStats();
                            } catch (err) {
                                console.error("Error deleting run:", err);
                                alert("Failed to delete test run: " + err.message);
                            }
                        }
                    };
                });
            }

            // Draw multi-line line chart
            drawPerformanceCurve();
        } catch (err) {
            console.error("Error loading motor runs:", err);
        }
    }

    // Load data points table for selected run
    async function loadGridPoints(runId) {
        try {
            const { data: pts, error } = await supabase
                .from('motor_test_data_points')
                .select('*')
                .eq('test_run_id', runId)
                .order('throttle', { ascending: true });
            
            if (error) throw error;
            
            if (!pts || pts.length === 0) {
                elements.dataPointsGridRows.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align:center; color:#64748b; font-size:0.85rem; padding: 20px 0;">
                            No steps data recorded for this run.
                        </td>
                    </tr>
                `;
                return;
            }

            elements.dataPointsGridRows.innerHTML = pts.map(p => {
                const throttlePercent = Math.round(p.throttle * 100);
                const power = p.power ? p.power.toFixed(2) : '-';
                const efficiency = p.efficiency ? p.efficiency.toFixed(2) : '-';
                return `
                    <tr>
                        <td><strong>${throttlePercent}%</strong></td>
                        <td>${p.voltage || '-'} V</td>
                        <td>${p.current || '-'} A</td>
                        <td>${power} W</td>
                        <td><span class="badge-thrust">${p.thrust_g} g</span></td>
                        <td>${p.rpm || '-'}</td>
                        <td><strong style="color:var(--success-color);">${efficiency}</strong> g/W</td>
                        <td>${p.temperature || '-'} ℃</td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error("Error loading grid points:", err);
        }
    }

    // Draw Comparative Chart
    async function drawPerformanceCurve() {
        if (!state.activeMotorId || state.testRuns.length === 0) {
            if (state.chartInstance) {
                state.chartInstance.destroy();
                state.chartInstance = null;
            }
            return;
        }

        try {
            // Fetch all data points for all runs of this motor
            const runIds = state.testRuns.map(r => r.id);
            
            const { data: pts, error } = await supabase
                .from('motor_test_data_points')
                .select('*')
                .in('test_run_id', runIds)
                .order('throttle', { ascending: true });

            if (error) throw error;

            const datasets = [];
            const borderColors = ['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

            // Group data points by test run
            state.testRuns.forEach((run, index) => {
                const runPts = pts.filter(p => p.test_run_id === run.id);
                if (runPts.length === 0) return;

                let labelText = `Prop: ${run.propeller_model}`;
                if (run.esc_model) labelText += ` (ESC: ${run.esc_model})`;

                let chartData = [];

                if (state.activeMetric === 'thrust') {
                    // Y: Thrust (g), X: Throttle (%)
                    chartData = runPts.map(p => ({
                        x: Math.round(p.throttle * 100),
                        y: p.thrust_g
                    }));
                } else if (state.activeMetric === 'efficiency') {
                    // Y: Efficiency (g/W), X: Thrust (g)
                    chartData = runPts.map(p => ({
                        x: p.thrust_g,
                        y: p.efficiency
                    })).sort((a,b) => a.x - b.x);
                } else if (state.activeMetric === 'current') {
                    // Y: Current (A), X: Throttle (%)
                    chartData = runPts.map(p => ({
                        x: Math.round(p.throttle * 100),
                        y: p.current
                    }));
                } else if (state.activeMetric === 'rpm') {
                    // Y: RPM, X: Throttle (%)
                    chartData = runPts.map(p => ({
                        x: Math.round(p.throttle * 100),
                        y: p.rpm
                    }));
                }

                datasets.push({
                    label: labelText,
                    data: chartData,
                    borderColor: borderColors[index % borderColors.length],
                    backgroundColor: borderColors[index % borderColors.length] + '15',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            });

            // Chart Configuration
            const ctx = document.getElementById('performanceCurveChart').getContext('2d');
            if (state.chartInstance) {
                state.chartInstance.destroy();
            }

            let xAxisTitle = 'Throttle (%)';
            let yAxisTitle = 'Max Thrust (g)';

            if (state.activeMetric === 'thrust') {
                xAxisTitle = 'Throttle (%)';
                yAxisTitle = 'Max Thrust (g)';
            } else if (state.activeMetric === 'efficiency') {
                xAxisTitle = 'Thrust Stand Output (g)';
                yAxisTitle = 'Efficiency (g/W)';
            } else if (state.activeMetric === 'current') {
                xAxisTitle = 'Throttle (%)';
                yAxisTitle = 'Current Consumption (A)';
            } else if (state.activeMetric === 'rpm') {
                xAxisTitle = 'Throttle (%)';
                yAxisTitle = 'RPM Speed';
            }

            state.chartInstance = new Chart(ctx, {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear',
                            title: {
                                display: true,
                                text: xAxisTitle,
                                font: { family: 'Outfit', weight: '600', size: 12 },
                                color: '#1e293b'
                            },
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                color: '#475569',
                                font: { family: 'Inter', size: 10 }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: yAxisTitle,
                                font: { family: 'Outfit', weight: '600', size: 12 },
                                color: '#1e293b'
                            },
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                color: '#475569',
                                font: { family: 'Inter', size: 10 }
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { family: 'Inter', size: 11 },
                                boxWidth: 12,
                                padding: 15
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const yVal = context.parsed.y;
                                    const xVal = context.parsed.x;
                                    if (state.activeMetric === 'efficiency') {
                                        return `${context.dataset.label}: ${yVal.toFixed(2)} g/W at ${xVal}g thrust`;
                                    } else if (state.activeMetric === 'thrust') {
                                        return `${context.dataset.label}: ${yVal}g thrust at ${xVal}% throttle`;
                                    } else if (state.activeMetric === 'current') {
                                        return `${context.dataset.label}: ${yVal}A current at ${xVal}% throttle`;
                                    } else if (state.activeMetric === 'rpm') {
                                        return `${context.dataset.label}: ${yVal} RPM at ${xVal}% throttle`;
                                    }
                                }
                            }
                        }
                    }
                }
            });

        } catch (err) {
            console.error("Error drawing performance curve:", err);
        }
    }

    // Init App
    async function init() {
        try {
            const res = await fetch('/api/config');
            const config = await res.json();
            
            let sbSession = null;
            let profile = null;

            if (localStorage.getItem('bypass_auth') === 'true') {
                const bypassKey = localStorage.getItem('bypass_service_role_key') || config.SUPABASE_ANON_KEY;
                supabase = window.supabase.createClient(config.SUPABASE_URL, bypassKey);
                sbSession = { user: { id: localStorage.getItem('bypass_uid') || 'a3fbdcab-d0ea-425b-8cdc-349a81868519', email: 'bypass@thrustvault.com' } };
                profile = { role: localStorage.getItem('bypass_role') || 'admin' };
            } else {
                supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
                
                // Check active session with Supabase
                const { data: { session: sbSess }, error: sessionError } = await supabase.auth.getSession();
                if (sessionError || !sbSess) {
                    console.warn("No active Supabase session found.");
                    logoutAndRedirect();
                    return;
                }
                sbSession = sbSess;

                // Verify role matches local storage
                const { data: prof, error: profileError } = await supabase
                    .from('user_profiles')
                    .select('role')
                    .eq('id', sbSession.user.id)
                    .single();

                if (profileError || !prof || prof.role !== session.role) {
                    console.error("Session verification failed: invalid profile or role mismatch.");
                    logoutAndRedirect();
                    return;
                }
                profile = prof;
            }

            // Ensure draft category and motor exists
            await ensureDraftMotor();

            // Load visualizer options and data creator rows
            await refreshVisualizerData();
            await fetchStats();
            initializeCreatorTable();
            bindCopyDownHandlers();
            // Ensure creator selects start locked
            if (elements.formCategorySelect) elements.formCategorySelect.value = '';
            if (elements.formTestMotor) { elements.formTestMotor.innerHTML = '<option value="">-- Select Thrust Level First --</option>'; elements.formTestMotor.disabled = true; }
        } catch (e) {
            console.error("Initialization failed", e);
            logoutAndRedirect();
        }
    }

    function logoutAndRedirect() {
        localStorage.removeItem('thrustvault_session');
        window.location.href = 'index.html';
    }

    init();
});
