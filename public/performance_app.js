// performance_app.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Validate session exists
    const session = JSON.parse(localStorage.getItem('thrustvault_session'));
    if (!session) {
        localStorage.removeItem('thrustvault_session');
        window.location.href = '/';
        return;
    }

    // Set user profile in sidebar footer
    const email = session.email || '';
    const emailEl = document.getElementById('session-email');
    if (emailEl) emailEl.textContent = email;
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

    function getMotorDisplayString(motor) {
        if (!motor) return '';
        const cat = state.categories.find(c => c.id === motor.category_id);
        const catLabel = cat ? (cat.name.toLowerCase().includes('class') ? cat.name : `${cat.name} Class`) : '';
        const thrustLabel = motor.max_thrust ? ` | Thrust: ${motor.max_thrust}` : '';
        return `${motor.company} - ${motor.motor_name} (${catLabel}${thrustLabel})`;
    }

    function setFormTestMotor(motorId) {
        elements.formTestMotor.value = motorId || '';
        if (elements.formTestMotorInput) {
            if (!motorId) {
                elements.formTestMotorInput.value = '';
            } else if (state.allMotors) {
                const motor = state.allMotors.find(m => m.id === motorId);
                elements.formTestMotorInput.value = motor ? getMotorDisplayString(motor) : '';
            }
        }
    }

    function setPlotMotor(motorId) {
        elements.plotMotorSelect.value = motorId || '';
        const inputEl = document.getElementById('plot-motor-input');
        if (inputEl) {
            if (!motorId) {
                inputEl.value = '';
            } else if (state.allMotors) {
                const motor = state.allMotors.find(m => m.id === motorId);
                inputEl.value = motor ? getMotorDisplayString(motor) : '';
            }
        }
    }


    // Show creator tab for all; disable/lock it for guests
    const isWriter = session.role === 'admin' || session.role === 'user';
    const tabBtnCreator = document.getElementById('tab-btn-creator');
    if (tabBtnCreator) {
        tabBtnCreator.style.display = 'flex';
        if (!isWriter) {
            tabBtnCreator.disabled = true;
            tabBtnCreator.title = 'Create Dataset is only available to Admins and Interns';
            tabBtnCreator.style.opacity = '0.45';
            tabBtnCreator.style.cursor = 'not-allowed';
            tabBtnCreator.style.filter = 'grayscale(0.5)';
            // Prepend lock icon
            const lockIcon = document.createElement('i');
            lockIcon.setAttribute('data-lucide', 'lock');
            lockIcon.style.cssText = 'width:13px;height:13px;margin-right:2px;flex-shrink:0;';
            tabBtnCreator.insertBefore(lockIcon, tabBtnCreator.firstChild);
        }
    }



    // createIcons AFTER sidebar HTML is fully written so all injected icons render
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
        pendingBulkRuns: [],
        editingDraftRunId: null
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
        statTotalSteps: document.getElementById('stat-total-steps'),
        statMaxThrust: document.getElementById('stat-max-thrust'),
        statPeakEfficiency: document.getElementById('stat-peak-efficiency'),
        formCategorySelect: document.getElementById('form-category-select'),
        formCatInfoBadge: document.getElementById('form-cat-info-badge'),
        formCatInfoText: document.getElementById('form-cat-info-text'),
        formTestMotor: document.getElementById('form-test-motor'),
        formTestMotorInput: document.getElementById('form-test-motor-input'),
        formTestMotorDatalist: document.getElementById('form-test-motor-datalist'),
        formTestPropeller: document.getElementById('form-test-propeller'),
        formTestEsc: document.getElementById('form-test-esc'),
        formTestBattery: document.getElementById('form-test-battery'),
        formTestTester: document.getElementById('form-test-tester'),
        btnDownloadRunsTemplate: document.getElementById('btn-download-runs-template'),
        btnImportFile: document.getElementById('btn-import-file'),
        btnAddStepRow: document.getElementById('btn-add-step-row'),
        creatorTableRows: document.getElementById('creator-table-rows'),
        btnResetCreator: document.getElementById('btn-reset-creator'),
        get totalMotors() { return document.getElementById('total-motors-count'); },
        get totalCats() { return document.getElementById('total-categories-count'); },
        get catList() { return document.getElementById('category-list-container'); },
        get requestsPendingBadge() { return document.getElementById('requests-pending-badge'); },
        get btnAddCat() { return document.getElementById('btn-add-category'); },
        get btnLogout() { return document.getElementById('btn-logout'); }
    };

    // Logging helper
    function logUserActivity(email, role, action, details) {
        try {
            fetch('/api/log-activity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role, action, details })
            }).catch(err => console.error("Error posting log:", err));
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
    if (elements.tabBtnVisualizer) {
        elements.tabBtnVisualizer.onclick = () => {
            // Disabled: Visualizer is removed
        };
    }

    elements.tabBtnCreator.onclick = () => {
        // Disabled: Creator is always active
    };

    // Logout
    

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

    // Function to calculate and update visual stat cards above the table in real-time
    function updateLiveStats() {
        const rows = Array.from(elements.creatorTableRows.querySelectorAll('tr'));
        const totalSteps = rows.length;
        
        let maxThrust = 0;
        let peakEfficiency = 0;
        
        rows.forEach(row => {
            const thrustInp = row.querySelector('.inp-thrust');
            const voltageInp = row.querySelector('.inp-voltage');
            const currentInp = row.querySelector('.inp-current');
            
            if (thrustInp) {
                const thrustVal = parseFloat(thrustInp.value) || 0;
                if (thrustVal > maxThrust) {
                    maxThrust = thrustVal;
                }
                
                const v = parseFloat(voltageInp ? voltageInp.value : 0) || 0;
                const a = parseFloat(currentInp ? currentInp.value : 0) || 0;
                const power = v * a;
                if (power > 0 && thrustVal > 0) {
                    const eff = thrustVal / power;
                    if (eff > peakEfficiency) {
                        peakEfficiency = eff;
                    }
                }
            }
        });
        
        if (elements.statTotalSteps) {
            elements.statTotalSteps.textContent = totalSteps;
        }
        if (elements.statMaxThrust) {
            elements.statMaxThrust.textContent = maxThrust > 0 ? `${maxThrust} g` : '0 g';
        }
        if (elements.statPeakEfficiency) {
            elements.statPeakEfficiency.textContent = peakEfficiency > 0 ? `${peakEfficiency.toFixed(2)} g/W` : '0.00 g/W';
        }
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
            updateLiveStats();
        }

        voltageInp.addEventListener('input', calculateFields);
        currentInp.addEventListener('input', calculateFields);
        thrustInp.addEventListener('input', calculateFields);

        // Run initial calculation for loaded values
        calculateFields();

        // Bind delete row
        tr.querySelector('.btn-row-delete').onclick = () => {
            tr.remove();
            updateLiveStats();
        };

        elements.creatorTableRows.appendChild(tr);
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    if (elements.btnAddStepRow) {
        elements.btnAddStepRow.onclick = () => {
            addCreatorRow();
        };
    }

    if (elements.btnDownloadRunsTemplate) {
        elements.btnDownloadRunsTemplate.onclick = () => {
            const headers = [
                'Item No.',
                'Voltage (V)',
                'Prop',
                'Throttle',
                'Current (A)',
                'Power (W)',
                'Thrust (G)',
                'RPM',
                'Efficiency (G/W)',
                'Operating Temperature (℃)'
            ];
            
            const sampleRows = [
                ['MN3110 KV470', 14.8, 'T-MOTOR 13*4.4CF', '50%', 1.5, 22.20, 290, 3300, 13.06, 40],
                ['MN3110 KV470', 14.8, 'T-MOTOR 13*4.4CF', '65%', 2.6, 38.48, 410, 4000, 10.65, 40],
                ['MN3110 KV470', 14.8, 'T-MOTOR 13*4.4CF', '100%', 5.8, 85.84, 780, 5500, 9.09, 40]
            ];
            
            const data = [headers, ...sampleRows];
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Template');
            XLSX.writeFile(wb, 'thrustvault_runs_template.xlsx');
            
            logUserActivity(session.email, session.role, 'Template Downloaded', 'Downloaded Excel runs template.');
        };
    }

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

                    // Look for Type, Voltage and Propeller columns to group runs
                    let typeColIdx = -1;
                    let propColIdx = -1;
                    let voltColIdx = -1;

                    headers.forEach((h, idx) => {
                        const lower = h.toLowerCase().trim();
                        if (lower.includes('type') || lower === 'motor' || lower.includes('motor model') || lower.includes('motor type') || lower.includes('item') || lower.includes('model') || lower.includes('no.')) {
                            if (typeColIdx === -1) typeColIdx = idx;
                        }
                        if (lower.includes('propeller') || lower.includes('prop')) {
                            if (propColIdx === -1) propColIdx = idx;
                        }
                        if (lower.includes('voltage') || lower.includes('volt') || lower === 'v') {
                            if (voltColIdx === -1) voltColIdx = idx;
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
                        let voltageVal = "";

                        if (typeColIdx !== -1) motorModel = String(pRow.cells[typeColIdx]).trim();
                        if (propColIdx !== -1) propellerModel = String(pRow.cells[propColIdx]).trim();
                        if (voltColIdx !== -1) voltageVal = String(pRow.cells[voltColIdx]).trim();

                        // Clean up newlines or extra spaces from values (since sheet html might have \n)
                        motorModel = motorModel.replace(/\s+/g, ' ');
                        propellerModel = propellerModel.replace(/\s+/g, ' ');
                        voltageVal = voltageVal.replace(/\s+/g, ' ');

                        // Fallbacks to comments metadata
                        if (!motorModel) motorModel = metadata['motor model'] || metadata['motor'] || '';
                        if (!propellerModel) propellerModel = metadata['propeller model'] || metadata['propeller'] || '';
                        if (!voltageVal) voltageVal = metadata['voltage'] || '';

                        // General defaults if none found
                        if (!motorModel) motorModel = "Unknown Motor";
                        if (!propellerModel) propellerModel = "Unknown Propeller";
                        if (!voltageVal) voltageVal = "Unknown Voltage";

                        const key = `${motorModel}::${voltageVal}::${propellerModel}`;
                        if (!runs[key]) {
                            runs[key] = {
                                motorModel: motorModel,
                                voltage: voltageVal,
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
                const voltage = runItem.voltage;

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
                        voltage: voltage,
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
        
        // Build motor options for matching datalist
        let motorDatalistOptionsHtml = '';
        state.categories.forEach(cat => {
            if (cat.id === state.draftCategoryId) return;
            const catMotors = state.motorsByCat[cat.id] || [];
            catMotors.forEach(m => {
                const displayVal = getMotorDisplayString(m);
                motorDatalistOptionsHtml += `<option value="${escapeHTML(displayVal)}"></option>`;
            });
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
                    <div style="position: relative;">
                        <i data-lucide="search" style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); width: 12px; height: 12px; color: #94a3b8;"></i>
                        <input type="text" class="bulk-run-motor-input" data-run-index="${index}" placeholder="Search and match motor..." list="bulk-run-motor-datalist-${index}" style="width: 100%; padding: 6px 8px 6px 26px; border-radius: 6px; border: 1px solid #cbd5e1; font-family: 'Inter'; font-size: 0.8rem; box-sizing: border-box; background: #ffffff;">
                        <datalist id="bulk-run-motor-datalist-${index}">
                            ${motorDatalistOptionsHtml}
                        </datalist>
                        <input type="hidden" class="bulk-run-motor-select" data-run-index="${index}">
                    </div>
                </td>
                <td style="padding:10px 8px; font-weight:600; color:#3b82f6;">${escapeHTML(run.voltage || '-')}${run.voltage ? ' V' : ''}</td>
                <td style="padding:10px 8px;">${escapeHTML(run.propellerModel)}</td>
                <td style="padding:10px 8px;">${escapeHTML(run.metadata.esc_model || '-')}</td>
                <td style="padding:10px 8px;">${escapeHTML(run.metadata.battery_info || '-')}</td>
                <td style="padding:10px 8px;">${escapeHTML(run.metadata.test_conducted_by || '-')}</td>
                <td style="text-align:center; font-weight:600; padding:10px 8px;">${rowCount}</td>
                <td style="text-align:center; padding:10px 8px;">
                    <button type="button" class="btn-outline-sm btn-run-keep-editing" data-run-index="${index}" style="padding:4px 8px; font-size:0.75rem; border-radius:4px; display:inline-flex; align-items:center; gap:2px; font-family:'Inter'; font-weight:500;">
                        <i data-lucide="edit-2" style="width:12px; height:12px;"></i> Keep Editing
                    </button>
                </td>
            `;

            listContainer.appendChild(tr);

            const selectEl = tr.querySelector('.bulk-run-motor-select');
            const inputEl = tr.querySelector('.bulk-run-motor-input');

            if (isMatched) {
                selectEl.value = run.matchedMotorId;
                const motor = state.allMotors.find(m => m.id === run.matchedMotorId);
                inputEl.value = motor ? getMotorDisplayString(motor) : '';
            } else {
                selectEl.value = '';
                inputEl.value = '';
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

            inputEl.oninput = (e) => {
                const val = e.target.value;
                const matched = state.allMotors.find(m => getMotorDisplayString(m) === val);
                if (matched) {
                    selectEl.value = matched.id;
                    run.matchedMotorId = matched.id;
                } else {
                    selectEl.value = '';
                    run.matchedMotorId = '';
                }
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
                setFormTestMotor(motor.id);
            }
        } else {
            elements.formCategorySelect.value = '';
            elements.formCategorySelect.dispatchEvent(new Event('change'));
            setFormTestMotor('');
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
            let duplicateCount = 0;
            let errorCount = 0;
            let firstError = null;

            for (const item of runsToSave) {
                const { run, selectedMotorId } = item;
                
                let motorId = selectedMotorId;
                let propellerModel = run.propellerModel;
                
                // Duplicate check
                const testVoltageVal = parseFloat(run.voltage) || (run.rows[0] ? parseFloat(run.rows[0].voltage) : null);
                let isDuplicate = false;
                
                try {
                    if (!motorId) {
                        let url = `/api/draft-test-runs?motor_model=eq.${encodeURIComponent(run.motorModel)}&propeller_model=eq.${encodeURIComponent(propellerModel)}`;
                        url += run.metadata.esc_model ? `&esc_model=eq.${encodeURIComponent(run.metadata.esc_model)}` : '&esc_model=is.null';
                        url += run.metadata.battery_info ? `&battery_info=eq.${encodeURIComponent(run.metadata.battery_info)}` : '&battery_info=is.null';
                        const draftRes = await fetch(url);
                        if (!draftRes.ok) throw new Error("Failed to query draft test runs");
                        const existingDrafts = await draftRes.json();
                        if (existingDrafts && existingDrafts.length > 0 && testVoltageVal !== null) {
                            isDuplicate = existingDrafts.some(d => {
                                const pts = d.data_points || [];
                                return pts.some(pt => (parseFloat(pt.voltage) === testVoltageVal));
                            });
                        }
                    } else {
                        let url = `/api/motor-test-runs?motor_id=eq.${motorId}&propeller_model=eq.${encodeURIComponent(propellerModel)}`;
                        url += run.metadata.esc_model ? `&esc_model=eq.${encodeURIComponent(run.metadata.esc_model)}` : '&esc_model=is.null';
                        url += run.metadata.battery_info ? `&battery_info=eq.${encodeURIComponent(run.metadata.battery_info)}` : '&battery_info=is.null';
                        const runsRes = await fetch(url);
                        if (!runsRes.ok) throw new Error("Failed to query motor test runs");
                        const existingRuns = await runsRes.json();
                        if (existingRuns && existingRuns.length > 0 && testVoltageVal !== null) {
                            const runIds = existingRuns.map(r => r.id);
                            const runIdsParam = runIds.join(',');
                            const ptsRes = await fetch(`/api/motor-test-data-points?test_run_id=in.(${runIdsParam})&voltage=eq.${testVoltageVal}&limit=1`);
                            if (!ptsRes.ok) throw new Error("Failed to query data points");
                            const existingPoints = await ptsRes.json();
                            if (existingPoints && existingPoints.length > 0) {
                                isDuplicate = true;
                            }
                        }
                    }
                } catch (checkErr) {
                    console.error("Duplicate check error during bulk import:", checkErr);
                }
                
                if (isDuplicate) {
                    duplicateCount++;
                    continue;
                }

                if (!motorId) {
                    try {
                        const draftRes = await fetch('/api/draft-test-runs', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                motor_model: run.motorModel,
                                propeller_model: run.propellerModel,
                                esc_model: run.metadata.esc_model || null,
                                battery_info: run.metadata.battery_info || null,
                                test_conducted_by: run.metadata.test_conducted_by || null,
                                data_points: run.rows.map(pt => ({
                                    throttle: pt.throttle,
                                    voltage: pt.voltage,
                                    current: pt.current,
                                    power: pt.power,
                                    thrust_g: pt.thrust_g,
                                    rpm: pt.rpm,
                                    efficiency: pt.efficiency,
                                    temperature: pt.temperature,
                                    extra_data: pt.extra_data
                                }))
                            })
                        });
                        if (!draftRes.ok) throw new Error("Failed to insert draft");
                        savedCount++;
                    } catch (err) {
                        console.error("Failed to import draft:", run.motorModel, err);
                        errorCount++;
                        if (!firstError) firstError = err;
                    }
                } else {
                    try {
                        // 1. Insert into motor_test_runs
                        const runRes = await fetch('/api/motor-test-runs', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                motor_id: motorId,
                                propeller_model: propellerModel,
                                esc_model: run.metadata.esc_model || null,
                                battery_info: run.metadata.battery_info || null,
                                test_conducted_by: run.metadata.test_conducted_by || null
                            })
                        });
                        if (!runRes.ok) throw new Error("Failed to save test run");
                        const runData = await runRes.json();
                        const runId = runData[0].id;

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

                        const ptsRes = await fetch('/api/motor-test-data-points', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(pointsPayload)
                        });
                        if (!ptsRes.ok) throw new Error("Failed to save data points");
                        savedCount++;
                    } catch (err) {
                        console.error("Failed to import run:", run.motorModel, err);
                        errorCount++;
                        if (!firstError) firstError = err;
                    }
                }
            }

            closeModal(document.getElementById('bulk-preview-modal'));
            saveBtn.disabled = false;
            saveBtn.innerHTML = oldHtml;

            if (errorCount === 0 && duplicateCount === 0) {
                alert(`Successfully saved ${savedCount} test run(s)!`);
            } else {
                alert(`Import completed. Saved: ${savedCount}, Duplicates skipped: ${duplicateCount}, Failed: ${errorCount}.${firstError ? ' First error: ' + firstError.message : ''}`);
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
                const res = await fetch(`/api/motor-test-runs?id=eq.${run.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        motor_id: selectedMotorId,
                        propeller_model: cleanPropeller
                    })
                });
                if (!res.ok) throw new Error("Failed to finalize run");

                alert("Successfully finalized draft run!");
                closeModal(modal);

                const newMotor = state.allMotors.find(m => m.id === selectedMotorId);
                if (newMotor) {
                    state.activeMotorId = selectedMotorId;
                    state.activeRunId = run.id;
                    await refreshVisualizerData();
                    elements.plotCategorySelect.value = newMotor.category_id;
                    onPlotCategoryChange();
                    setPlotMotor(selectedMotorId);
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

    // No draft category & motor setup needed in this version

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

        const isDraftCheckbox = document.getElementById('form-is-draft');
        const isDraft = isDraftCheckbox ? isDraftCheckbox.checked : false;

        let motorId = null;
        let propeller = elements.formTestPropeller.value.trim();
        let motorModel = '';
        let draftMotorName = '';

        if (isDraft) {
            const draftMotorInp = document.getElementById('form-draft-motor-model');
            draftMotorName = draftMotorInp ? draftMotorInp.value.trim() : 'Unknown';
            if (!draftMotorName) {
                alert("Please enter a Draft Motor Model.");
                if (submitBtn) {
                    submitBtn.disabled = false;
                    updateCreatorSubmitButton();
                }
                return;
            }
            motorModel = `Draft Motor: ${draftMotorName}`;
        } else {
            motorId = elements.formTestMotor.value;
            if (!motorId) {
                alert("Please select a Thrust Level and then a Motor Model.");
                if (submitBtn) {
                    submitBtn.disabled = false;
                    updateCreatorSubmitButton();
                }
                return;
            }
            const matchedMotor = state.allMotors.find(m => m.id === motorId);
            motorModel = matchedMotor ? `${matchedMotor.company} - ${matchedMotor.motor_name}` : 'Unknown';
        }

        const esc = elements.formTestEsc.value.trim() || null;
        const battery = elements.formTestBattery.value.trim() || null;
        const tester = elements.formTestTester.value.trim() || null;

        const rowEls = Array.from(elements.creatorTableRows.querySelectorAll('tr'));
        if (rowEls.length === 0) {
            alert("Please add at least one throttle step row.");
            if (submitBtn) {
                submitBtn.disabled = false;
                updateCreatorSubmitButton();
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
                    updateCreatorSubmitButton();
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

        // Check for duplicate test run
        const testVoltage = stepsData[0] ? stepsData[0].voltage : null;
        let isDuplicate = false;
        let runIdForCheck = state.editingDraftRunId;

        try {
            if (isDraft) {
                let url = `/api/draft-test-runs?motor_model=eq.${encodeURIComponent(draftMotorName)}&propeller_model=eq.${encodeURIComponent(propeller)}`;
                url += esc ? `&esc_model=eq.${encodeURIComponent(esc)}` : '&esc_model=is.null';
                url += battery ? `&battery_info=eq.${encodeURIComponent(battery)}` : '&battery_info=is.null';
                if (runIdForCheck) {
                    url += `&id=ne.${runIdForCheck}`;
                }
                const draftRes = await fetch(url);
                if (!draftRes.ok) throw new Error("Failed to query draft test runs");
                const existingDrafts = await draftRes.json();
                if (existingDrafts && existingDrafts.length > 0 && testVoltage !== null) {
                    isDuplicate = existingDrafts.some(d => {
                        const pts = d.data_points || [];
                        return pts.some(pt => pt.voltage === testVoltage);
                    });
                }
            } else {
                let url = `/api/motor-test-runs?motor_id=eq.${motorId}&propeller_model=eq.${encodeURIComponent(propeller)}`;
                url += esc ? `&esc_model=eq.${encodeURIComponent(esc)}` : '&esc_model=is.null';
                url += battery ? `&battery_info=eq.${encodeURIComponent(battery)}` : '&battery_info=is.null';
                if (runIdForCheck) {
                    const draftCheckRes = await fetch(`/api/draft-test-runs?id=eq.${runIdForCheck}`);
                    const draftCheck = draftCheckRes.ok ? await draftCheckRes.json() : [];
                    if (draftCheck.length === 0) {
                        url += `&id=ne.${runIdForCheck}`;
                    }
                }
                const runsRes = await fetch(url);
                if (!runsRes.ok) throw new Error("Failed to query motor test runs");
                const existingRuns = await runsRes.json();
                if (existingRuns && existingRuns.length > 0 && testVoltage !== null) {
                    const runIds = existingRuns.map(r => r.id);
                    const runIdsParam = runIds.join(',');
                    const ptsRes = await fetch(`/api/motor-test-data-points?test_run_id=in.(${runIdsParam})&voltage=eq.${testVoltage}&limit=1`);
                    if (!ptsRes.ok) throw new Error("Failed to query data points");
                    const existingPoints = await ptsRes.json();
                    if (existingPoints && existingPoints.length > 0) {
                        isDuplicate = true;
                    }
                }
            }
        } catch (err) {
            console.error("Duplicate checking error:", err);
        }

        if (isDuplicate) {
            alert(`A test run for this motor, propeller, ESC, and battery at ${testVoltage} V already exists in the database.`);
            if (submitBtn) {
                submitBtn.disabled = false;
                updateCreatorSubmitButton();
            }
            return;
        }

        try {
            let runId = state.editingDraftRunId;
            let finalizedMotorId = motorId;
            let finalizedRunId = null;

            if (isDraft) {
                if (runId) {
                    // Update existing draft in draft_test_runs
                    const res = await fetch(`/api/draft-test-runs?id=eq.${runId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            motor_model: draftMotorName,
                            propeller_model: propeller,
                            esc_model: esc,
                            battery_info: battery,
                            test_conducted_by: tester,
                            data_points: stepsData
                        })
                    });
                    if (!res.ok) throw new Error("Failed to update draft");
                } else {
                    // Insert new draft in draft_test_runs
                    const res = await fetch('/api/draft-test-runs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            motor_model: draftMotorName,
                            propeller_model: propeller,
                            esc_model: esc,
                            battery_info: battery,
                            test_conducted_by: tester,
                            data_points: stepsData
                        })
                    });
                    if (!res.ok) throw new Error("Failed to create draft");
                }
            } else {
                let wasEditingDraft = false;

                if (runId) {
                    const draftCheckRes = await fetch(`/api/draft-test-runs?id=eq.${runId}`);
                    const draftCheck = draftCheckRes.ok ? await draftCheckRes.json() : [];
                    if (draftCheck && draftCheck.length > 0) {
                        wasEditingDraft = true;
                    }
                }

                if (runId && !wasEditingDraft) {
                    // Update existing finalized run in motor_test_runs
                    const runRes = await fetch(`/api/motor-test-runs?id=eq.${runId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            motor_id: motorId,
                            propeller_model: propeller,
                            esc_model: esc,
                            battery_info: battery,
                            test_conducted_by: tester
                        })
                    });
                    if (!runRes.ok) throw new Error("Failed to update test run");

                    // Delete existing points
                    const delRes = await fetch(`/api/motor-test-data-points?test_run_id=eq.${runId}`, {
                        method: 'DELETE'
                    });
                    if (!delRes.ok) throw new Error("Failed to clear old data points");

                    // Insert new points
                    const pointsPayload = stepsData.map(pt => ({
                        test_run_id: runId,
                        ...pt
                    }));

                    const ptsRes = await fetch('/api/motor-test-data-points', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(pointsPayload)
                    });
                    if (!ptsRes.ok) throw new Error("Failed to save data points");
                    finalizedRunId = runId;
                } else {
                    // Insert brand new finalized run in motor_test_runs
                    const runRes = await fetch('/api/motor-test-runs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            motor_id: motorId,
                            propeller_model: propeller,
                            esc_model: esc,
                            battery_info: battery,
                            test_conducted_by: tester
                        })
                    });
                    if (!runRes.ok) throw new Error("Failed to create test run");
                    const runData = await runRes.json();
                    finalizedRunId = runData[0].id;

                    // Insert data points
                    const pointsPayload = stepsData.map(pt => ({
                        test_run_id: finalizedRunId,
                        ...pt
                    }));

                    const ptsRes = await fetch('/api/motor-test-data-points', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(pointsPayload)
                    });
                    if (!ptsRes.ok) throw new Error("Failed to save data points");

                    // Clean up and delete draft row if finalizing
                    if (wasEditingDraft) {
                        const delDraftRes = await fetch(`/api/draft-test-runs/${runId}`, {
                            method: 'DELETE'
                        });
                        if (!delDraftRes.ok) console.error("Failed to delete finalized draft");
                    }
                }
            }

            // Log activity
            const logAction = state.editingDraftRunId ? (isDraft ? 'Draft Dataset Updated' : 'Draft Dataset Finalized') : 'Performance Dataset Created';
            const logDetails = state.editingDraftRunId 
                ? `Updated dataset for ${motorModel} (Prop: ${elements.formTestPropeller.value.trim()}, ESC: ${esc || 'None'})`
                : `Added performance dataset for ${motorModel} (Prop: ${elements.formTestPropeller.value.trim()}, ESC: ${esc || 'None'})`;
            logUserActivity(session.email, session.role, logAction, logDetails);

            alert(state.editingDraftRunId ? (isDraft ? "Successfully updated draft!" : "Successfully finalized draft run!") : "Successfully saved performance dataset!");
            
            // Reset Form and State
            resetDraftEditingState();

            // Fetch latest count and refresh
            await fetchStats();
            
            if (!isDraft && finalizedRunId) {
                // Select finalized run in the curves visualizer
                const newMotor = state.allMotors.find(m => m.id === finalizedMotorId);
                if (newMotor) {
                    state.activeMotorId = finalizedMotorId;
                    state.activeRunId = finalizedRunId;
                    await refreshVisualizerData();
                    elements.plotCategorySelect.value = newMotor.category_id;
                    onPlotCategoryChange();
                    setPlotMotor(finalizedMotorId);
                    await loadMotorRuns(finalizedMotorId);
                    loadGridPoints(finalizedRunId);
                    elements.activeRunLabel.textContent = `Inspecting Configuration: Prop ${propeller} + ESC ${esc || 'None'}`;
                }
                elements.tabBtnVisualizer.click();
            }
        } catch (err) {
            console.error("Error saving dataset:", err);
            alert("Failed to save performance dataset: " + err.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                updateCreatorSubmitButton();
            }
        }
    };

    // Count-up animation helper
    function animateCountUp(el, target, duration = 700) {
        if (!el) return;
        const start = parseInt(el.textContent) || 0;
        const delta = target - start;
        if (delta === 0) { el.textContent = target; return; }
        const startTime = performance.now();
        function step(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(start + delta * eased);
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // Fetch quick counts
    async function fetchStats() {
        try {
            const runsRes = await fetch('/api/motor-test-runs');
            if (!runsRes.ok) throw new Error("Failed to fetch runs");
            const runs = await runsRes.json();
            const runsCount = runs ? runs.length : 0;

            const ptsRes = await fetch('/api/motor-test-data-points');
            if (!ptsRes.ok) throw new Error("Failed to fetch points");
            const pts = await ptsRes.json();
            const ptsCount = pts ? pts.length : 0;

            const activeMotors = runs ? new Set(runs.map(r => r.motor_id).filter(Boolean)).size : 0;

            const runsEl = document.getElementById('total-test-runs-count');
            const ptsEl = document.getElementById('total-data-points-count');
            const motorsEl = document.getElementById('total-active-motors-count');

            if (runsEl) { runsEl.innerHTML = ''; animateCountUp(runsEl, runsCount || 0); }
            if (ptsEl)  { ptsEl.innerHTML  = ''; animateCountUp(ptsEl,  ptsCount  || 0); }
            if (motorsEl){ motorsEl.innerHTML=''; animateCountUp(motorsEl, activeMotors); }

            // Legacy element refs for backward compat
            if (elements.totalTestRunsCount) {
                // already rendered above via ID lookup
            }
            if (elements.totalDataPointsCount) {
                // already rendered above via ID lookup
            }

            // Sync drafts list
            await loadSavedDraftsList();
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
            state.categories.filter(c => c.id !== state.draftCategoryId).map(c => {
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
        elements.testRunsList.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 0;gap:10px;color:var(--text-muted);"><i data-lucide="mouse-pointer-click" style="width:28px;height:28px;color:#cbd5e1;"></i><span style="font-size:0.82rem;text-align:center;">Select a motor to view test runs.</span></div>`;
        if (state.chartInstance) { state.chartInstance.destroy(); state.chartInstance = null; }
        // Show chart empty state
        const emptyState = document.getElementById('chart-empty-state');
        const chartCanvas = document.getElementById('performanceCurveChart');
        if (emptyState) emptyState.style.display = 'flex';
        if (chartCanvas) chartCanvas.style.display = 'none';

        const bannerEl = document.getElementById('draft-run-banner');
        if (bannerEl) bannerEl.style.display = 'none';
        if (window.lucide) window.lucide.createIcons();

        const datalist = document.getElementById('plot-motor-datalist');
        const inputEl = document.getElementById('plot-motor-input');
        
        if (datalist && inputEl) {
            datalist.innerHTML = '';
            inputEl.value = '';
            elements.plotMotorSelect.value = '';
            
            if (!catId) {
                inputEl.disabled = true;
                inputEl.placeholder = '-- Select Thrust Level First --';
                return;
            }
            
            inputEl.disabled = false;
            inputEl.placeholder = 'Type to select motor...';
            
            const list = state.motorsByCat[catId] || [];
            datalist.innerHTML = list.map(m => {
                const displayVal = getMotorDisplayString(m);
                return `<option value="${escapeHTML(displayVal)}"></option>`;
            }).join('');
        }
    }

    if (elements.plotCategorySelect) {
        elements.plotCategorySelect.onchange = onPlotCategoryChange;
    }

    // ── Creator Form: category change → populate motor dropdown + info badge ──
    function onFormCategoryChange() {
        const catId = elements.formCategorySelect.value;
        setFormTestMotor('');

        if (elements.formTestMotorDatalist && elements.formTestMotorInput) {
            elements.formTestMotorDatalist.innerHTML = '';
            elements.formTestMotorInput.value = '';
            
            if (!catId) {
                elements.formTestMotorInput.disabled = true;
                elements.formTestMotorInput.placeholder = '-- Select Thrust Level First --';
                if (elements.formCatInfoBadge) {
                    elements.formCatInfoBadge.classList.remove('visible');
                }
                return;
            }
            
            elements.formTestMotorInput.disabled = false;
            elements.formTestMotorInput.placeholder = 'Type to select motor...';
        }

        // Show category description badge
        const cat = state.categories.find(c => c.id === catId);
        if (cat && elements.formCatInfoBadge && elements.formCatInfoText) {
            elements.formCatInfoText.textContent = cat.description || '';
            elements.formCatInfoBadge.classList.toggle('visible', !!cat.description);
            lucide.createIcons();
        }

        const list = state.motorsByCat[catId] || [];
        if (elements.formTestMotorDatalist) {
            elements.formTestMotorDatalist.innerHTML = list.map(m => {
                const displayVal = getMotorDisplayString(m);
                return `<option value="${escapeHTML(displayVal)}"></option>`;
            }).join('');
        }
    }

    if (elements.formCategorySelect) {
        elements.formCategorySelect.onchange = onFormCategoryChange;
    }

    // Setup Drafts controls
    const isDraftCheckbox = document.getElementById('form-is-draft');
    const draftMotorGroup = document.getElementById('form-draft-motor-group');
    const draftMotorModel = document.getElementById('form-draft-motor-model');
    const btnCancelEditDraft = document.getElementById('btn-cancel-edit-draft');

    if (isDraftCheckbox) {
        isDraftCheckbox.onchange = () => {
            const isChecked = isDraftCheckbox.checked;
            const catGroup = elements.formCategorySelect.closest('.form-group');
            const motorGroup = elements.formTestMotor.closest('.form-group');

            if (isChecked) {
                if (draftMotorGroup) draftMotorGroup.style.display = 'block';
                if (draftMotorModel) draftMotorModel.setAttribute('required', 'true');
                
                if (catGroup) catGroup.style.display = 'none';
                elements.formCategorySelect.removeAttribute('required');
                
                if (motorGroup) motorGroup.style.display = 'none';
                if (elements.formTestMotorInput) {
                    elements.formTestMotorInput.removeAttribute('required');
                }
            } else {
                if (draftMotorGroup) draftMotorGroup.style.display = 'none';
                if (draftMotorModel) {
                    draftMotorModel.removeAttribute('required');
                    draftMotorModel.value = '';
                }
                
                if (catGroup) catGroup.style.display = 'block';
                elements.formCategorySelect.setAttribute('required', 'true');
                
                if (motorGroup) motorGroup.style.display = 'block';
                if (elements.formTestMotorInput) {
                    elements.formTestMotorInput.setAttribute('required', 'true');
                }
            }
            updateCreatorSubmitButton();
        };
    }

    if (btnCancelEditDraft) {
        btnCancelEditDraft.onclick = () => {
            resetDraftEditingState();
        };
    }

    async function loadSavedDraftsList() {
        try {
            const res = await fetch('/api/draft-test-runs?order=created_at.desc');
            if (!res.ok) throw new Error("Failed to load drafts");
            const drafts = await res.json();

            const listEl = document.getElementById('creator-drafts-list');
            const badgeEl = document.getElementById('drafts-count-badge');
            if (badgeEl) badgeEl.textContent = drafts ? drafts.length : 0;

            if (!listEl) return;

            if (!drafts || drafts.length === 0) {
                listEl.innerHTML = `
                    <div style="color: #64748b; font-size: 0.85rem; text-align: center; padding: 20px 0;">
                        No saved drafts.
                    </div>
                `;
                return;
            }

            listEl.innerHTML = drafts.map(run => {
                const date = new Date(run.tested_at || run.created_at).toLocaleDateString();
                const displayProp = run.propeller_model || 'Unknown';
                
                return `
                    <div class="draft-card">
                        <div class="draft-card-header">
                            <div style="min-width:0;">
                                <span class="draft-card-title">${escapeHTML(run.motor_model)}</span>
                                <span class="draft-card-sub">Prop: ${escapeHTML(displayProp)}</span>
                            </div>
                            <div class="draft-card-actions">
                                <button type="button" class="btn-outline-sm btn-edit-draft" data-draft-id="${run.id}" title="Edit and Save Draft" style="padding:4px 8px; font-size:0.75rem; border-radius:6px; display:inline-flex; align-items:center; gap:4px; height:24px; cursor:pointer;">
                                    <i data-lucide="edit-3" style="width:12px; height:12px;"></i> Edit
                                </button>
                                <button type="button" class="btn-draft-delete" data-run-id="${run.id}" title="Delete draft" style="border:none; background:none; padding:4px; color:var(--danger-color); cursor:pointer; display:inline-flex; align-items:center; border-radius:4px; transition:all 0.15s;">
                                    <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                                </button>
                            </div>
                        </div>
                        <div class="draft-card-footer">
                            <span>Tested: ${date}</span>
                            ${run.esc_model ? `<span class="draft-card-badge">ESC: ${escapeHTML(run.esc_model)}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');

            // Bind delete buttons in drafts list
            listEl.querySelectorAll('.btn-draft-delete').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const runId = btn.dataset.runId;
                    if (!confirm("Are you sure you want to delete this draft?")) return;
                    try {
                        const res = await fetch(`/api/draft-test-runs/${runId}`, {
                            method: 'DELETE'
                        });
                        if (!res.ok) throw new Error("Failed to delete draft");
                        alert("Deleted draft successfully!");
                        if (state.editingDraftRunId === runId) {
                            resetDraftEditingState();
                        }
                        await loadSavedDraftsList();
                        await fetchStats();
                    } catch (err) {
                        alert("Failed to delete draft: " + err.message);
                    }
                };
            });

            // Bind edit buttons
            listEl.querySelectorAll('.btn-edit-draft').forEach(btn => {
                btn.onclick = async () => {
                    const draftId = btn.dataset.draftId;
                    const draft = drafts.find(d => d.id === draftId);
                    if (draft) {
                        await startEditDraft(draft);
                    }
                };
            });

            if (window.lucide) window.lucide.createIcons();
        } catch (err) {
            console.error("Error loading drafts:", err);
        }
    }

    // Load a draft into the creator form for editing
    async function startEditDraft(draft) {
        state.editingDraftRunId = draft.id;
        
        // Show/update editing banner
        const banner = document.getElementById('creator-editing-banner');
        const bannerName = document.getElementById('creator-editing-draft-name');
        
        if (banner && bannerName) {
            bannerName.textContent = draft.motor_model;
            banner.style.display = 'flex';
        }

        // Set "Save as Draft" checkbox to checked (since it was loaded from drafts)
        const isDraftCheckbox = document.getElementById('form-is-draft');
        if (isDraftCheckbox) {
            isDraftCheckbox.checked = true;
            // Trigger checkbox change listener to adjust fields visibility
            const event = new Event('change');
            isDraftCheckbox.dispatchEvent(event);
        }

        // Populate Draft Motor input field
        const draftMotorInp = document.getElementById('form-draft-motor-model');
        if (draftMotorInp) {
            draftMotorInp.value = draft.motor_model;
        }

        // Populate other metadata
        elements.formTestPropeller.value = draft.propeller_model || '';
        elements.formTestEsc.value = draft.esc_model || '';
        elements.formTestBattery.value = draft.battery_info || '';
        elements.formTestTester.value = draft.test_conducted_by || '';

        // Load data points
        try {
            const pts = draft.data_points || [];

            elements.creatorTableRows.innerHTML = '';
            if (pts && pts.length > 0) {
                pts.forEach(p => {
                    const throttlePercent = Math.round(p.throttle * 100);
                    addCreatorRow(throttlePercent, p);
                });
            } else {
                initializeCreatorTable();
            }
        } catch (err) {
            console.error("Error loading draft data points:", err);
            alert("Failed to load draft data points: " + err.message);
        }

        updateCreatorSubmitButton();
        
        // Scroll creator form into view or focus propeller field
        elements.formTestPropeller.focus();
    }

    // Reset draft editing state and clean form
    function resetDraftEditingState() {
        state.editingDraftRunId = null;
        
        // Hide editing banner
        const banner = document.getElementById('creator-editing-banner');
        if (banner) banner.style.display = 'none';

        // Reset the form values
        elements.creatorForm.reset();

        // Uncheck the checkbox
        const isDraftCheckbox = document.getElementById('form-is-draft');
        if (isDraftCheckbox) {
            isDraftCheckbox.checked = false;
            isDraftCheckbox.dispatchEvent(new Event('change'));
        }

        // Update submit button text
        updateCreatorSubmitButton();

        // Reset the steps table to default 5 rows
        state.extraColumns = [];
        rebuildTableHeaders();
        initializeCreatorTable();
    }

    // Update submit button text and icons based on draft/edit status
    function updateCreatorSubmitButton() {
        const submitBtn = elements.creatorForm.querySelector('button[type="submit"]');
        if (!submitBtn) return;
        
        const isDraftCheckbox = document.getElementById('form-is-draft');
        const isDraft = isDraftCheckbox ? isDraftCheckbox.checked : false;

        if (state.editingDraftRunId) {
            if (isDraft) {
                submitBtn.innerHTML = '<i data-lucide="save" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> Update Draft';
            } else {
                submitBtn.innerHTML = '<i data-lucide="check-square" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> Save & Finalize Draft';
            }
        } else {
            if (isDraft) {
                submitBtn.innerHTML = '<i data-lucide="save" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> Save as Draft';
            } else {
                submitBtn.innerHTML = '<i data-lucide="save" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> Save Performance Dataset';
            }
        }
        if (window.lucide) window.lucide.createIcons();
    }

    // Refresh visualizer selects and charts
    async function refreshVisualizerData() {
        try {
            // Fetch categories (with description)
            const catRes = await fetch('/api/categories');
            if (!catRes.ok) throw new Error("Failed to fetch categories");
            const categories = await catRes.json();

            // Fetch all motors
            const motorRes = await fetch('/api/motors?order=company,motor_name');
            if (!motorRes.ok) throw new Error("Failed to fetch motors");
            const motors = await motorRes.json();

            const parseMinWeight = (name) => {
                const match = name.match(/(\d+)/);
                return match ? parseInt(match[1], 10) : 9999;
            };

            state.categories = (categories || []).sort((a, b) => parseMinWeight(a.name) - parseMinWeight(b.name));
            state.allMotors  = motors || [];

            // Update sidebar stats
            if (elements.totalMotors) elements.totalMotors.textContent = state.allMotors.length;
            if (elements.totalCats) elements.totalCats.textContent = state.categories.length;
            renderSidebar();

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
                    setPlotMotor(state.activeMotorId);
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
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 0;gap:10px;color:var(--text-muted);">
                    <i data-lucide="mouse-pointer-click" style="width:28px;height:28px;color:#cbd5e1;"></i>
                    <span style="font-size:0.82rem;text-align:center;">Select a motor to view test runs.</span>
                </div>
            `;
            if (state.chartInstance) {
                state.chartInstance.destroy();
                state.chartInstance = null;
            }
            const emSt = document.getElementById('chart-empty-state');
            const emCv = document.getElementById('performanceCurveChart');
            if (emSt) emSt.style.display = 'flex';
            if (emCv) emCv.style.display = 'none';
            if (window.lucide) window.lucide.createIcons();
        }
    };

    if (elements.plotMetricSelect) {
        elements.plotMetricSelect.onchange = () => {
            state.activeMetric = elements.plotMetricSelect.value;
            if (state.activeMotorId) {
                drawPerformanceCurve();
            }
        };
    }

    // Load available runs for a specific motor
    async function loadMotorRuns(motorId) {
        try {
            const runsRes = await fetch(`/api/motor-test-runs?motor_id=eq.${motorId}&order=created_at.desc`);
            if (!runsRes.ok) throw new Error("Failed to load test runs");
            const runs = await runsRes.json();
            state.testRuns = runs || [];

            if (state.testRuns.length === 0) {
                elements.testRunsList.innerHTML = `
                    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 0;gap:10px;color:var(--text-muted);">
                        <i data-lucide="inbox" style="width:28px;height:28px;color:#cbd5e1;"></i>
                        <span style="font-size:0.82rem;text-align:center;">No calibration datasets found for this motor.</span>
                    </div>
                `;
                if (state.chartInstance) {
                    state.chartInstance.destroy();
                    state.chartInstance = null;
                }
                // Show empty state
                const emSt = document.getElementById('chart-empty-state');
                const emCv = document.getElementById('performanceCurveChart');
                if (emSt) emSt.style.display = 'flex';
                if (emCv) emCv.style.display = 'none';
                const bannerEl = document.getElementById('draft-run-banner');
                if (bannerEl) bannerEl.style.display = 'none';
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            // Update runs badge
            const runsBadge = document.getElementById('test-runs-count-badge');
            if (runsBadge) { runsBadge.textContent = state.testRuns.length; runsBadge.style.display = 'inline-block'; }

            elements.testRunsList.innerHTML = state.testRuns.map(run => {
                const date = new Date(run.tested_at).toLocaleDateString();
                const isSelected = state.activeRunId === run.id;
                const isDraft = run.motor_id === state.draftMotorId;
                const displayProp = isDraft ? run.propeller_model.replace(/^\[DRAFT:.*?\]\s*/, '') : run.propeller_model;
                const draftBadge = isDraft ? `<span class="run-draft-badge">Draft</span>` : '';
                const deleteBtn = isWriter ? `<button class="btn-run-del btn-run-delete" data-run-id="${run.id}" title="Delete this test run"><i data-lucide="trash-2"></i></button>` : '';

                return `
                    <div class="run-card ${isSelected ? 'active-run' : ''}" data-id="${run.id}">
                        <div class="run-card-title">
                            ${escapeHTML(displayProp)} ${draftBadge}
                            <span class="run-card-date">${date}${deleteBtn}</span>
                        </div>
                        <div class="run-card-meta">
                            <span><strong>ESC:</strong> ${escapeHTML(run.esc_model || '—')}</span>
                            <span><strong>Battery:</strong> ${escapeHTML(run.battery_info || '—')}</span>
                        </div>
                        <div class="run-card-footer">
                            <span>Tester: ${escapeHTML(run.test_conducted_by || '—')}</span>
                            <span class="run-card-action-text">Click to inspect ›</span>
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
                        c.classList.remove('active-run');
                    });
                    card.classList.add('active-run');

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
                                const res = await fetch(`/api/motor-test-runs?id=eq.${runId}`, {
                                    method: 'DELETE'
                                });
                                if (!res.ok) throw new Error("Failed to delete test run");
                                
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
            const ptsRes = await fetch(`/api/motor-test-data-points?test_run_id=eq.${runId}&order=throttle.asc`);
            if (!ptsRes.ok) throw new Error("Failed to load data points");
            const pts = await ptsRes.json();
            
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
        const emptyState = document.getElementById('chart-empty-state');
        const chartCanvas = document.getElementById('performanceCurveChart');
        if (!chartCanvas) return;
        if (!state.activeMotorId || state.testRuns.length === 0) {
            if (state.chartInstance) {
                state.chartInstance.destroy();
                state.chartInstance = null;
            }
            if (emptyState) emptyState.style.display = 'flex';
            if (chartCanvas) chartCanvas.style.display = 'none';
            return;
        }
        // Hide empty state, show canvas
        if (emptyState) emptyState.style.display = 'none';
        if (chartCanvas) chartCanvas.style.display = 'block';

        try {
            // Fetch all data points for all runs of this motor
            const runIds = state.testRuns.map(r => r.id);
            
            const runIdsParam = runIds.join(',');
            const ptsRes = await fetch(`/api/motor-test-data-points?test_run_id=in.(${runIdsParam})&order=throttle.asc`);
            if (!ptsRes.ok) throw new Error("Failed to load data points");
            const pts = await ptsRes.json();

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

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0';
            const titleColor = isDark ? '#cbd5e1' : '#1e293b';
            const ticksColor = isDark ? '#94a3b8' : '#475569';
            const legendColor = isDark ? '#cbd5e1' : '#475569';

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
                                color: titleColor
                            },
                            grid: { color: gridColor },
                            ticks: {
                                color: ticksColor,
                                font: { family: 'Inter', size: 10 }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: yAxisTitle,
                                font: { family: 'Outfit', weight: '600', size: 12 },
                                color: titleColor
                            },
                            grid: { color: gridColor },
                            ticks: {
                                color: ticksColor,
                                font: { family: 'Inter', size: 10 }
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { family: 'Inter', size: 11 },
                                color: legendColor,
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

    // Sidebar navigation trigger is setup dynamically in setupSidebar()

    async function fetchSidebarCounts() {
        try {
            const [motorsRes, catsRes] = await Promise.all([
                fetch('/api/motors'),
                fetch('/api/categories')
            ]);

            if (!motorsRes.ok) throw new Error("Failed to load motors");
            if (!catsRes.ok) throw new Error("Failed to load categories");

            const rawCats = await catsRes.json();
            const parseMinWeight = (name) => {
                const match = name.match(/(\d+)/);
                return match ? parseInt(match[1], 10) : 9999;
            };

            state.allMotors = await motorsRes.json();
            state.categories = (rawCats || []).sort((a, b) => parseMinWeight(a.name) - parseMinWeight(b.name));
            state.accessRequests = [];

            if (session && session.role === 'admin') {
                try {
                    const reqsRes = await fetch('/api/admin/access-requests?order=created_at.desc');
                    if (reqsRes.ok) {
                        state.accessRequests = await reqsRes.json();
                    }
                } catch (e) {
                    console.warn("Could not load access requests:", e);
                }
            }

            if (elements.totalMotors) elements.totalMotors.textContent = state.allMotors.length;
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
            if (cat.id === state.draftCategoryId) return; // Hide System Drafts
            const count = state.allMotors.filter(m => m.category_id === cat.id).length;
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
                const targetDash = (session && session.role === 'user') ? '/dashboard' : ((session && session.role === 'guest') ? '/dashboard' : '/admin/dashboard');
                window.location.href = targetDash;
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
                        const res = await fetch(`/api/categories/${cat.id}`, {
                            method: 'DELETE'
                        });
                        if (!res.ok) {
                            const errData = await res.json();
                            throw new Error(errData.error || `HTTP ${res.status}`);
                        }
                        logUserActivity(session.email, session.role, 'Category Deleted', `Deleted category: ${cat.name}`);
                        await fetchSidebarCounts();
                        // also refresh local UI selects
                        if (typeof refreshVisualizerData === 'function') {
                            await refreshVisualizerData();
                        }
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
            window.location.href = `/${session.role}/explorer`;
        };
        elements.catList.appendChild(allTab);
        if (window.lucide) window.lucide.createIcons();
    }

    // Init App
    async function init() {
        try {
            // Load visualizer options and data creator rows
            await fetchSidebarCounts();
            await refreshVisualizerData();
            await fetchStats();
            initializeCreatorTable();
            bindCopyDownHandlers();
            // Ensure creator selects start locked
            if (elements.formCategorySelect) elements.formCategorySelect.value = '';
            if (elements.formTestMotorInput) {
                elements.formTestMotorInput.value = '';
                elements.formTestMotorInput.placeholder = '-- Select Thrust Level First --';
                elements.formTestMotorInput.disabled = true;
            }
            if (elements.formTestMotor) elements.formTestMotor.value = '';

            // Bind manual filter searches for motor select dropdowns
            const plotMotorInput = document.getElementById('plot-motor-input');
            if (plotMotorInput) {
                plotMotorInput.oninput = (e) => {
                    const val = e.target.value;
                    const catId = elements.plotCategorySelect.value;
                    if (!catId) return;
                    
                    const list = state.motorsByCat[catId] || [];
                    const matched = list.find(m => getMotorDisplayString(m) === val);
                    
                    if (matched) {
                        if (elements.plotMotorSelect.value !== matched.id) {
                            elements.plotMotorSelect.value = matched.id;
                            elements.plotMotorSelect.dispatchEvent(new Event('change'));
                        }
                    } else {
                        if (elements.plotMotorSelect.value !== '') {
                            elements.plotMotorSelect.value = '';
                            elements.plotMotorSelect.dispatchEvent(new Event('change'));
                        }
                    }
                };
            }

            if (elements.formTestMotorInput) {
                elements.formTestMotorInput.oninput = (e) => {
                    const val = e.target.value;
                    const catId = elements.formCategorySelect.value;
                    if (!catId) return;
                    
                    const list = state.motorsByCat[catId] || [];
                    const matched = list.find(m => getMotorDisplayString(m) === val);
                    
                    if (matched) {
                        elements.formTestMotor.value = matched.id;
                    } else {
                        elements.formTestMotor.value = '';
                    }
                };
            }
        } catch (e) {
            console.error("Initialization failed", e);
            logoutAndRedirect();
        }
    }

    function logoutAndRedirect(action = 'Logout', details = 'Logged out successfully.') {
        if (session) {
            logUserActivity(session.email, session.role, action, details);
        }
        localStorage.removeItem('thrustvault_session');
        // Clear cookie
        const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `thrustvault_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict${secureFlag}`;
        window.location.href = '/';
    }

    // Sidebar Profile Click Trigger is setup dynamically in setupSidebar()

    // Inactivity Session Expiry (10 minutes)
    let inactivityTimeout;
    let lastSyncTime = Date.now();

    function resetInactivityTimer() {
        clearTimeout(inactivityTimeout);
        // inactivityTimeout = setTimeout(autoLogout, 600000); // 10 minutes (disabled)

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

    init();
    
    function setupSidebar() {
        if (typeof fetchSidebarCounts === 'function') {
            fetchSidebarCounts();
        }

        if (elements.btnAddCat) {
            elements.btnAddCat.onclick = () => {
                sessionStorage.setItem('triggerAddCategory', 'true');
                const targetDash = (session && session.role === 'user') ? '/dashboard' : '/admin/dashboard';
                window.location.href = targetDash;
            };
        }

        if (session && session.role === 'admin') {
            const sidebarProfileCard = document.querySelector('.sidebar-user-profile');
            if (sidebarProfileCard) {
                sidebarProfileCard.style.cursor = 'pointer';
                sidebarProfileCard.title = 'View My Profile';
                sidebarProfileCard.onclick = () => {
                    sessionStorage.setItem('showMyProfile', 'true');
                    window.location.href = '/admin/users';
                };
            }
        }
    }


    if (window.sidebarLoaded) {
        setupSidebar();
    } else {
        window.addEventListener('sidebarLoaded', setupSidebar);
    }
});
