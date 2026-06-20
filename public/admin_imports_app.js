// admin_imports_app.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Validate user is admin
    const session = JSON.parse(localStorage.getItem('thrustvault_session'));
    if (!session || session.role !== 'admin') {
        localStorage.removeItem('thrustvault_session');
        window.location.href = '/';
        return;
    }

    // Set email display in sidebar footer once sidebar is loaded
    function syncSidebarProfile() {
        const emailEl = document.getElementById('session-email');
        if (emailEl) emailEl.textContent = session.email || 'admin@thrustvault.com';
        const avatarInitials = document.getElementById('user-avatar-initials');
        if (avatarInitials && session.email) {
            avatarInitials.textContent = session.email.charAt(0).toUpperCase();
        }
    }
    if (window.sidebarLoaded) syncSidebarProfile();
    else window.addEventListener('sidebarLoaded', syncSidebarProfile);

    // Initial state object
    let state = {
        categories: [],
        motors: [],
        customSchema: [],
        parsedRows: [], // raw array of objects or arrays parsed from file
        fileHeaders: [], // list of keys/headers in parsed file
        mappings: {} // maps target schema field -> file header index/key
    };

    // DOM Elements
    const elements = {
        categoryMode: document.getElementById('category-mode'),
        globalCategoryWrapper: document.getElementById('global-category-wrapper'),
        targetCategorySelect: document.getElementById('target-category-select'),
        dropzoneContainer: document.getElementById('dropzone-container'),
        filePickerInput: document.getElementById('file-picker-input'),
        loadedFileContainer: document.getElementById('loaded-file-container'),
        infoFileName: document.getElementById('info-file-name'),
        infoFileSize: document.getElementById('info-file-size'),
        btnResetFile: document.getElementById('btn-reset-file'),
        btnDownloadTemplate: document.getElementById('btn-download-template'),
        importerEmptyState: document.getElementById('importer-empty-state'),
        previewWorkspaceContainer: document.getElementById('preview-workspace-container'),
        dupStrategy: document.getElementById('dup-strategy'),
        statsTotalRows: document.getElementById('stats-total-rows'),
        statsValidRows: document.getElementById('stats-valid-rows'),
        statsDupRows: document.getElementById('stats-dup-rows'),
        statsErrRows: document.getElementById('stats-err-rows'),
        previewTableMappings: document.getElementById('preview-table-mappings'),
        previewTableHeaders: document.getElementById('preview-table-headers'),
        previewTableRows: document.getElementById('preview-table-rows'),
        btnCancelPreview: document.getElementById('btn-cancel-preview'),
        btnSaveImports: document.getElementById('btn-save-imports'),
        confirmModal: document.getElementById('confirm-modal'),
        get totalMotors() { return document.getElementById('total-motors-count'); },
        get totalCats() { return document.getElementById('total-categories-count'); },
        get catList() { return document.getElementById('category-list-container'); },
        get btnAddCat() { return document.getElementById('btn-add-category'); },
        get requestsPendingBadge() { return document.getElementById('requests-pending-badge'); }
    };

    // Stepper progress modal helper
    const progressModal = {
        overlay: document.getElementById('import-progress-modal'),
        title: document.getElementById('import-modal-title'),
        status: document.getElementById('import-modal-status'),
        bar: document.getElementById('import-progress-bar'),
        percent: document.getElementById('import-progress-percent'),

        show() {
            this.title.textContent = "Importing Motors";
            this.status.textContent = "Starting import...";
            this.bar.style.width = "0%";
            this.percent.textContent = "0%";
            this.overlay.style.display = "flex";

            // Reset milestones
            for (let i = 0; i <= 3; i++) {
                const step = document.getElementById(`step-import-${i}`);
                if (step) {
                    step.className = 'stepper-step';
                    const indicator = step.querySelector('.step-indicator');
                    if (indicator) indicator.innerHTML = '<i data-lucide="circle"></i>';
                }
            }

            this.overlay.offsetHeight; // Force reflow
            this.overlay.classList.add('show');
            if (window.lucide) window.lucide.createIcons();
        },

        update(percentVal, statusText, milestoneIndex = -1) {
            this.bar.style.width = `${percentVal}%`;
            this.percent.textContent = `${percentVal}%`;
            if (statusText) this.status.textContent = statusText;

            if (milestoneIndex !== -1) {
                for (let i = 0; i <= 3; i++) {
                    const step = document.getElementById(`step-import-${i}`);
                    if (!step) continue;
                    const indicator = step.querySelector('.step-indicator');
                    
                    if (i < milestoneIndex) {
                        step.className = 'stepper-step completed';
                        if (indicator) indicator.innerHTML = '<i data-lucide="check-circle-2"></i>';
                    } else if (i === milestoneIndex) {
                        step.className = 'stepper-step active';
                        if (indicator) indicator.innerHTML = '<i data-lucide="loader-2" class="spin-animation"></i>';
                    } else {
                        step.className = 'stepper-step';
                        if (indicator) indicator.innerHTML = '<i data-lucide="circle"></i>';
                    }
                }
            }
            if (window.lucide) window.lucide.createIcons();
        },

        hide() {
            this.overlay.classList.remove('show');
            setTimeout(() => {
                this.overlay.style.display = "none";
            }, 300);
        }
    };

    // Prompt confirmations utility (custom modal)
    function customConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = elements.confirmModal;
            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;

            const btnConfirm = document.getElementById('btn-confirm-action');
            const newBtnConfirm = btnConfirm.cloneNode(true);
            btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

            modal.classList.add('show');

            newBtnConfirm.onclick = () => {
                modal.classList.remove('show');
                resolve(true);
            };

            modal.querySelectorAll('.modal-close-trigger, .btn-secondary').forEach(btn => {
                btn.onclick = () => {
                    modal.classList.remove('show');
                    resolve(false);
                };
            });
        });
    }

    // Helper to log audit logs back to database
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

    // Initialize Database config connection
    async function init() {
        try {
            // Fetch dynamic categories, custom schema fields, and all current motor models
            const [catsRes, schemaRes, motorsRes] = await Promise.all([
                fetch('/api/admin/categories?order=name'),
                fetch('/api/admin/custom-specs?order=field_name'),
                fetch('/api/admin/motors')
            ]);

            if (!catsRes.ok) throw new Error(`Categories load failed: ${catsRes.statusText}`);
            if (!schemaRes.ok) throw new Error(`Schema load failed: ${schemaRes.statusText}`);
            if (!motorsRes.ok) throw new Error(`Motors load failed: ${motorsRes.statusText}`);

            state.categories = await catsRes.json() || [];
            state.customSchema = await schemaRes.json() || [];
            state.motors = await motorsRes.json() || [];

            renderCategoriesSelect();
        } catch (err) {
            console.error("Initialization error:", err);
            alert("Database connection failed. Logging out.");
            localStorage.removeItem('thrustvault_session');
            window.location.href = '/login';
        }
    }

    function renderCategoriesSelect() {
        elements.targetCategorySelect.innerHTML = '<option value="">-- Select Category --</option>';
        state.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            elements.targetCategorySelect.appendChild(opt);
        });
    }

    // Dropzone Drag-and-drop binds
    elements.dropzoneContainer.onclick = () => elements.filePickerInput.click();

    elements.dropzoneContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropzoneContainer.classList.add('dragover');
    });

    ['dragleave', 'dragend', 'drop'].forEach(evt => {
        elements.dropzoneContainer.addEventListener(evt, () => {
            elements.dropzoneContainer.classList.remove('dragover');
        });
    });

    elements.dropzoneContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFileSelect(files[0]);
    });

    elements.filePickerInput.onchange = (e) => {
        if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
    };

    // File Parsing Pipeline
    function handleFileSelect(file) {
        if (!file) return;

        elements.infoFileName.textContent = file.name;
        elements.infoFileSize.textContent = formatBytes(file.size);
        elements.dropzoneContainer.style.display = 'none';
        elements.loadedFileContainer.style.display = 'block';

        const reader = new FileReader();
        const extension = file.name.split('.').pop().toLowerCase();

        reader.onload = (e) => {
            try {
                const data = e.target.result;
                if (extension === 'json') {
                    const json = JSON.parse(data);
                    // Standardize input format
                    const rows = Array.isArray(json) ? json : (json.motors || []);
                    processParsedData(rows);
                } else {
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const allItems = [];
                    
                    // Sort sheet names numerically so that sheets (2kg, 5kg, 10kg...) are parsed in order
                    const sortedSheetNames = [...workbook.SheetNames].sort((a, b) => {
                        const valA = parseFloat(a) || 0;
                        const valB = parseFloat(b) || 0;
                        return valA - valB;
                    });
                    
                    sortedSheetNames.forEach(sheetName => {
                        const worksheet = workbook.Sheets[sheetName];
                        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                        
                        // Find header row in this sheet (first row with >= 2 non-empty cells, fallback to >= 1)
                        let headerRowIdx = -1;
                        for (let i = 0; i < rows.length; i++) {
                            const row = rows[i];
                            if (!row) continue;
                            const nonEmptyCount = row.filter(v => v !== "" && v !== undefined && v !== null).length;
                            if (nonEmptyCount >= 2) {
                                headerRowIdx = i;
                                break;
                            }
                        }
                        
                        if (headerRowIdx === -1) {
                            for (let i = 0; i < rows.length; i++) {
                                const row = rows[i];
                                if (row && row.some(v => v !== "" && v !== undefined && v !== null)) {
                                    headerRowIdx = i;
                                    break;
                                }
                            }
                        }
                        
                        if (headerRowIdx !== -1) {
                            const headers = rows[headerRowIdx].map(h => String(h || "").trim());
                            
                            for (let i = headerRowIdx + 1; i < rows.length; i++) {
                                const row = rows[i];
                                // Skip completely empty lines
                                if (!row || row.every(v => v === "" || v === undefined || v === null)) continue;
                                
                                const item = {};
                                headers.forEach((h, colIdx) => {
                                    if (h) item[h] = row[colIdx] !== undefined ? row[colIdx] : "";
                                });
                                // Inject Sheet Name as virtual column for Category matching
                                item["Sheet Name"] = sheetName;
                                allItems.push(item);
                            }
                        }
                    });

                    if (allItems.length > 0) {
                        processParsedData(allItems);
                    } else {
                        throw new Error("Spreadsheet appears to be empty.");
                    }
                }
            } catch (err) {
                alert("File parsing error: " + err.message);
                resetFilePicker();
            }
        };

        if (extension === 'json') {
            reader.readAsText(file);
        } else {
            reader.readAsBinaryString(file);
        }
    }

    function formatBytes(bytes, decimals = 1) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function resetFilePicker() {
        elements.filePickerInput.value = '';
        elements.dropzoneContainer.style.display = 'flex';
        elements.loadedFileContainer.style.display = 'none';
        elements.importerEmptyState.style.display = 'flex';
        elements.previewWorkspaceContainer.style.display = 'none';
        state.parsedRows = [];
        state.fileHeaders = [];
        state.mappings = {};
    }

    elements.btnResetFile.onclick = resetFilePicker;
    elements.btnCancelPreview.onclick = resetFilePicker;

    // Dynamic Template Generator
    function downloadTemplate() {
        const targets = getTargetFields();
        const headers = [];
        const sampleRow = [];

        targets.forEach(target => {
            let headerName = target.name;
            if (target.key.startsWith('custom_')) {
                headerName = target.key.replace('custom_', '');
            } else if (target.key === 'motor_name') {
                headerName = 'Motor Name';
            } else if (target.key === 'company') {
                headerName = 'Manufacturer';
            } else if (target.key === 'max_thrust') {
                headerName = 'Max Thrust (g or kg)';
            } else if (target.key === 'recommended_esc') {
                headerName = 'Recommended ESC';
            } else if (target.key === 'recommended_propeller') {
                headerName = 'Recommended Propeller';
            } else if (target.key === 'category') {
                headerName = 'Category';
            }

            headers.push(headerName);

            if (target.key === 'motor_name') sampleRow.push('MN3110 KV470');
            else if (target.key === 'company') sampleRow.push('T-MOTOR');
            else if (target.key === 'max_thrust') sampleRow.push('2400g');
            else if (target.key === 'recommended_esc') sampleRow.push('Flame 40A');
            else if (target.key === 'recommended_propeller') sampleRow.push('T-MOTOR 13*4.4CF');
            else if (target.key === 'category') sampleRow.push('4kg Class');
            else if (target.key.startsWith('custom_')) {
                if (target.type === 'number') sampleRow.push('14.8');
                else if (target.type === 'boolean') sampleRow.push('TRUE');
                else sampleRow.push('Sample Value');
            } else {
                sampleRow.push('');
            }
        });

        const csvContent = "\uFEFF" + [
            headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','),
            sampleRow.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "thrustvault_import_template.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    elements.btnDownloadTemplate.onclick = downloadTemplate;

    // Process parsed columns and setup initial maps
    function processParsedData(rows) {
        if (rows.length === 0) {
            alert("No data rows found to import.");
            resetFilePicker();
            return;
        }

        state.parsedRows = rows;

        // Gather all unique keys from parsed rows
        const headerSet = new Set();
        // Place "Sheet Name" first if present, so Category classification is immediately visible
        const hasSheetName = rows.some(row => Object.prototype.hasOwnProperty.call(row, "Sheet Name"));
        if (hasSheetName) {
            headerSet.add("Sheet Name");
        }
        
        rows.forEach(row => {
            Object.keys(row).forEach(k => {
                if (k !== "Sheet Name") {
                    headerSet.add(k);
                }
            });
        });
        state.fileHeaders = Array.from(headerSet);

        // Build mappings block
        elements.importerEmptyState.style.display = 'none';
        elements.previewWorkspaceContainer.style.display = 'flex';

        buildMapperUI();
        autoMapHeaders();
        validateMappedData();
    }

    // Build lists of standard database target targets
    function getTargetFields() {
        const fields = [
            { key: 'motor_name', name: 'Motor Model Name', required: true, type: 'text' },
            { key: 'company', name: 'Manufacturer / Brand', required: false, type: 'text' },
            { key: 'max_thrust', name: 'Max Thrust Value', required: false, type: 'number' },
            { key: 'recommended_esc', name: 'Recommended ESC', required: false, type: 'text' },
            { key: 'recommended_propeller', name: 'Recommended Propeller', required: false, type: 'text' },
            { key: 'link_motor', name: 'Motor Product Link', required: false, type: 'url' },
            { key: 'link_esc', name: 'ESC Product Link', required: false, type: 'url' },
            { key: 'link_propeller', name: 'Propeller Product Link', required: false, type: 'url' }
        ];

        // Dynamic category column mapping option
        if (elements.categoryMode.value === 'dynamic') {
            fields.push({ key: 'category', name: 'Category / Thrust Class', required: true, type: 'text', description: 'Matched by category name' });
        }

        // Add dynamic custom parameters from DB schema
        state.customSchema.forEach(field => {
            fields.push({
                key: `custom_${field.field_key}`,
                name: `[Custom] ${field.field_name}`,
                required: false,
                type: field.field_type,
                unit: field.field_unit,
                description: `Saves inside custom_parameters.${field.field_key}`
            });
        });

        return fields;
    }

    // Column Mapping Selector Renderer
    function buildMapperUI() {
        elements.previewTableMappings.innerHTML = '';
        const targets = getTargetFields();

        state.fileHeaders.forEach((header, index) => {
            const th = document.createElement('th');
            
            const select = document.createElement('select');
            select.className = 'mapper-select';
            select.style.width = '100%';
            select.style.minWidth = '140px';
            select.dataset.header = header;
            select.dataset.colIdx = index;

            const optIgnore = document.createElement('option');
            optIgnore.value = "";
            optIgnore.textContent = "-- Ignore Column --";
            select.appendChild(optIgnore);

            targets.forEach(target => {
                const opt = document.createElement('option');
                opt.value = target.key;
                opt.textContent = target.name + (target.required ? ' *' : '');
                select.appendChild(opt);
            });

            select.onchange = (e) => {
                const newTargetKey = e.target.value;
                const prevTargetKey = select.dataset.mappedValue || "";

                if (newTargetKey) {
                    state.fileHeaders.forEach((otherHeader, otherIdx) => {
                        if (otherIdx !== index) {
                            const otherSelect = elements.previewTableMappings.querySelector(`select[data-col-idx="${otherIdx}"]`);
                            if (otherSelect && otherSelect.value === newTargetKey) {
                                otherSelect.value = "";
                                otherSelect.dataset.mappedValue = "";
                                Object.keys(state.mappings).forEach(k => {
                                    if (state.mappings[k] === otherHeader) {
                                        delete state.mappings[k];
                                    }
                                });
                            }
                        }
                    });
                }

                if (prevTargetKey) {
                    delete state.mappings[prevTargetKey];
                }

                if (newTargetKey) {
                    state.mappings[newTargetKey] = header;
                    select.dataset.mappedValue = newTargetKey;
                } else {
                    select.dataset.mappedValue = "";
                }

                validateMappedData();
            };

            th.appendChild(select);
            elements.previewTableMappings.appendChild(th);
        });

        const thStatus = document.createElement('th');
        thStatus.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Mapping</span>';
        elements.previewTableMappings.appendChild(thStatus);
    }

    // Match column names with standard database keys automatically
    function autoMapHeaders() {
        const targets = getTargetFields();
        state.mappings = {};

        state.fileHeaders.forEach((header, index) => {
            const select = elements.previewTableMappings.querySelector(`select[data-col-idx="${index}"]`);
            if (!select) return;

            const headerLower = header.toLowerCase().trim();
            const headerClean = headerLower.replace(/[^a-z0-9]/g, '');

            let matchedTargetKey = "";

            const matchedTarget = targets.find(target => {
                const targetKey = target.key.toLowerCase();
                const targetName = target.name.toLowerCase();
                const targetKeyClean = targetKey.replace(/[^a-z0-9]/g, '');
                
                if (headerLower === targetKey || headerLower === targetName || headerClean === targetKeyClean) {
                    return true;
                }
                
                if (target.key === 'motor_name' && /^(motor|model|name|motor model|motor_name|model_name|item no|item no\.)$/i.test(headerLower)) {
                    return true;
                }
                if (target.key === 'company' && /^(company|brand|manufacturer|mfg|brand name)$/i.test(headerLower)) {
                    return true;
                }
                if (target.key === 'max_thrust' && /^(thrust|max thrust|max_thrust|thrust_max|thrust (g)|thrust(g)|thrust (kg)|thrust(kg))$/i.test(headerLower)) {
                    return true;
                }
                if (target.key === 'recommended_esc' && /^(esc|recommended esc|esc model|esc_model)$/i.test(headerLower)) {
                    return true;
                }
                if (target.key === 'recommended_propeller' && /^(prop|propeller|recommended prop|recommended propeller|prop model)$/i.test(headerLower)) {
                    return true;
                }
                if (target.key === 'category' && /^(category|thrust class|class|sheet name|sheet_name|sheet)$/i.test(headerLower)) {
                    return true;
                }
                if (target.key.startsWith('custom_')) {
                    const customKey = target.key.replace('custom_', '').toLowerCase();
                    return headerLower === customKey || headerClean === customKey;
                }
                return false;
            });

            if (matchedTarget) {
                const alreadyMapped = Object.prototype.hasOwnProperty.call(state.mappings, matchedTarget.key);
                if (!alreadyMapped) {
                    matchedTargetKey = matchedTarget.key;
                    select.value = matchedTargetKey;
                    select.dataset.mappedValue = matchedTargetKey;
                    state.mappings[matchedTargetKey] = header;
                }
            }
        });
    }

    // Watch category mode swaps
    elements.categoryMode.onchange = () => {
        if (elements.categoryMode.value === 'global') {
            elements.globalCategoryWrapper.style.display = 'block';
        } else {
            elements.globalCategoryWrapper.style.display = 'none';
        }
        buildMapperUI();
        autoMapHeaders();
        validateMappedData();
    };

    elements.targetCategorySelect.onchange = () => validateMappedData();
    elements.dupStrategy.onchange = () => validateMappedData();

    // Data parsing clean helpers
    function parseNumericVal(val) {
        if (val === null || val === undefined || val === '') return null;
        // Strip text labels e.g. "2.4kg" -> "2.4"
        const clean = String(val).replace(/[^0-9\.\-]/g, '').trim();
        const parsed = parseFloat(clean);
        return isNaN(parsed) ? null : parsed;
    }

    function parseBooleanVal(val) {
        if (val === null || val === undefined) return false;
        const str = String(val).toLowerCase().trim();
        return str === 'true' || str === '1' || str === 'yes' || val === true || val === 1;
    }

    // Main real-time validator engine
    function validateMappedData() {
        const isGlobalCategory = elements.categoryMode.value === 'global';
        const globalCategoryId = elements.targetCategorySelect.value;
        const targets = getTargetFields();
        const dupStrategyVal = elements.dupStrategy.value;

        let total = state.parsedRows.length;
        let validCount = 0;
        let dupCount = 0;
        let errCount = 0;

        // Populate preview headers row (row 2 of table head)
        elements.previewTableHeaders.innerHTML = '';
        state.fileHeaders.forEach(header => {
            const th = document.createElement('th');
            const mappedTarget = targets.find(t => state.mappings[t.key] === header);
            if (mappedTarget) {
                th.innerHTML = `${header} <span style="display:inline-block; font-size:0.62rem; padding: 2px 5px; border-radius:4px; background: rgba(37,99,235,0.1); color: var(--primary-color); font-weight:bold; margin-left:4px;">Mapped</span>`;
            } else {
                th.textContent = header;
            }
            elements.previewTableHeaders.appendChild(th);
        });
        
        // Add status badge header column
        const thStatus = document.createElement('th');
        thStatus.textContent = 'Verification';
        elements.previewTableHeaders.appendChild(thStatus);

        elements.previewTableRows.innerHTML = '';

        state.parsedRows.forEach((rawRow, rowIndex) => {
            const item = {
                motor_name: '',
                company: null,
                max_thrust: null,
                recommended_esc: null,
                recommended_propeller: null,
                link_motor: null,
                link_esc: null,
                link_propeller: null,
                custom_parameters: {},
                category_name: '' // used in dynamic category resolution
            };

            let rowHasError = false;
            let errorMessage = '';

            // Extract values using mappings
            targets.forEach(target => {
                const header = state.mappings[target.key];
                const rawVal = header ? rawRow[header] : undefined;

                if (target.key.startsWith('custom_')) {
                    const customKey = target.key.replace('custom_', '');
                    if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
                        if (target.type === 'number') {
                            const val = parseNumericVal(rawVal);
                            if (val === null) {
                                rowHasError = true;
                                errorMessage = `Invalid number in '${target.name}'`;
                            }
                            item.custom_parameters[customKey] = val;
                        } else if (target.type === 'boolean') {
                            item.custom_parameters[customKey] = parseBooleanVal(rawVal);
                        } else {
                            item.custom_parameters[customKey] = String(rawVal).trim();
                        }
                    }
                } else if (target.key === 'category') {
                    if (rawVal !== undefined && rawVal !== null) {
                        item.category_name = String(rawVal).trim();
                    }
                } else {
                    if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
                        if (target.key === 'max_thrust') {
                            const parsedThrust = parseNumericVal(rawVal);
                            if (parsedThrust === null) {
                                rowHasError = true;
                                errorMessage = "Max Thrust value must be numeric.";
                            } else {
                                const rawStr = String(rawVal).toLowerCase();
                                let unit = 'kg';
                                if (rawStr.includes('g') && !rawStr.includes('k')) unit = 'g';
                                if (rawStr.includes('n')) unit = 'N';
                                
                                if (unit === 'g') {
                                    item.max_thrust = `${(parsedThrust / 1000).toFixed(3)} kg`;
                                } else {
                                    item.max_thrust = `${parsedThrust} ${unit}`;
                                }
                            }
                        } else {
                            item[target.key] = String(rawVal).trim();
                        }
                    }
                }
            });

            // Enforce required Motor Name
            if (!item.motor_name) {
                rowHasError = true;
                errorMessage = "Missing Motor Model Name.";
            }

            // Determine Target Category ID
            let categoryId = null;
            if (isGlobalCategory) {
                if (!globalCategoryId) {
                    rowHasError = true;
                    errorMessage = "Global category not selected.";
                } else {
                    categoryId = globalCategoryId;
                }
            } else {
                if (!item.category_name) {
                    rowHasError = true;
                    errorMessage = "Row Category spec not mapped or missing.";
                } else {
                    const matchedCat = state.categories.find(c => c.name.toLowerCase() === item.category_name.toLowerCase());
                    if (matchedCat) {
                        categoryId = matchedCat.id;
                    } else {
                        categoryId = 'NEW';
                    }
                }
            }
            item.category_id = categoryId;

            // Check for duplication in catalog database
            let isDuplicate = false;
            if (!rowHasError && categoryId && categoryId !== 'NEW') {
                isDuplicate = state.motors.some(m => 
                    m.category_id === categoryId && 
                    m.motor_name.toLowerCase().trim() === item.motor_name.toLowerCase().trim()
                );
            }

            // Update metrics
            let rowStatus = 'valid';
            if (rowHasError) {
                rowStatus = 'error';
                errCount++;
            } else if (isDuplicate) {
                rowStatus = 'duplicate';
                dupCount++;
                if (dupStrategyVal === 'skip') {
                    // skipped
                } else {
                    validCount++;
                }
            } else {
                validCount++;
            }

            // Build preview rows rendering
            const tr = document.createElement('tr');
            if (rowStatus === 'error') tr.className = 'row-invalid';

            // Show ALL spreadsheet columns in original order
            state.fileHeaders.forEach(header => {
                const td = document.createElement('td');
                let displayVal = rawRow[header] !== undefined ? rawRow[header] : '-';
                
                const mappedTarget = targets.find(t => state.mappings[t.key] === header);
                if (mappedTarget && mappedTarget.key === 'max_thrust' && item.max_thrust && rowStatus !== 'error') {
                    displayVal = item.max_thrust;
                }

                td.textContent = displayVal;
                tr.appendChild(td);
            });

            // Status Badge column
            const tdBadge = document.createElement('td');
            let badgeHTML = '';
            if (rowStatus === 'error') {
                badgeHTML = `<span class="validation-badge invalid" title="${errorMessage}"><i data-lucide="alert-circle" style="width:12px;height:12px;"></i> ${errorMessage}</span>`;
            } else if (rowStatus === 'duplicate') {
                const action = dupStrategyVal === 'skip' ? 'Skipping' : 'Overwrite';
                badgeHTML = `<span class="validation-badge duplicate" title="Motor model duplicate found"><i data-lucide="copy" style="width:12px;height:12px;"></i> Duplicate (${action})</span>`;
            } else {
                const actionText = categoryId === 'NEW' ? 'Valid (New Class)' : 'Valid';
                badgeHTML = `<span class="validation-badge valid" title="Integrity looks good"><i data-lucide="check" style="width:12px;height:12px;"></i> ${actionText}</span>`;
            }
            tdBadge.innerHTML = badgeHTML;
            tr.appendChild(tdBadge);

            elements.previewTableRows.appendChild(tr);

            rawRow._processed = item;
            rawRow._status = rowStatus;
            rawRow._error = errorMessage;
        });

        // Update stats DOM values
        elements.statsTotalRows.textContent = total;
        elements.statsValidRows.textContent = validCount;
        elements.statsDupRows.textContent = dupCount;
        elements.statsErrRows.textContent = errCount;

        // Toggle button states
        const hasRequiredMappings = !!state.mappings['motor_name'];
        const hasValidEntries = validCount > 0;
        
        elements.btnSaveImports.disabled = !hasRequiredMappings || !hasValidEntries || errCount === total;

        if (window.lucide) window.lucide.createIcons();
    }

    // Commit database save functions
    elements.btnSaveImports.onclick = async () => {
        const confirmSave = await customConfirm(
            "Import Motors?",
            `Are you sure you want to save these motors into the database?`
        );
        if (confirmSave) saveImports();
    };

    async function saveImports() {
        progressModal.show();
        
        try {
            // Milestone 0: Filter payload & validate mappings
            progressModal.update(5, "Checking data...", 0);
            await new Promise(r => setTimeout(r, 600));

            const dupStrategyVal = elements.dupStrategy.value;
            const isGlobalCategory = elements.categoryMode.value === 'global';

            // Gather rows ready to process
            const importRows = state.parsedRows.filter(r => r._status === 'valid' || (r._status === 'duplicate' && dupStrategyVal === 'overwrite'));
            
            if (importRows.length === 0) {
                throw new Error("No importable rows found after duplicate filter application.");
            }

            // Milestone 1: Resolve dynamic categories if mode is dynamic
            progressModal.update(20, "Setting up categories...", 1);
            
            const categoryMap = {};
            state.categories.forEach(c => { categoryMap[c.name.toLowerCase()] = c.id; });

            if (!isGlobalCategory) {
                // Find distinct new categories to register
                const newCatNames = Array.from(new Set(
                    importRows.filter(r => r._processed.category_id === 'NEW' && r._processed.category_name)
                              .map(r => r._processed.category_name)
                ));

                for (const catName of newCatNames) {
                    progressModal.update(25, `Creating category: ${catName}...`, 1);
                    
                    const res = await fetch('/api/admin/categories', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify([{ name: catName, description: 'Created dynamically during bulk import.' }])
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                    if (!data || data.length === 0) throw new Error(`Failed to create category: ${catName}`);
                    
                    const newId = data[0].id;
                    categoryMap[catName.toLowerCase()] = newId;
                    
                    // Add to memory list
                    state.categories.push(data[0]);
                }

                // Update rows category ID
                importRows.forEach(r => {
                    if (r._processed.category_id === 'NEW') {
                        r._processed.category_id = categoryMap[r._processed.category_name.toLowerCase()];
                    }
                });
            }

            // Milestone 2: Committing bulk records in chunks
            progressModal.update(40, "Preparing database updates...", 2);
            await new Promise(r => setTimeout(r, 400));

            // Classify into updates vs inserts
            const inserts = [];
            const updates = [];

            importRows.forEach(r => {
                const item = r._processed;
                
                // Construct clean payload for DB insertion
                const dbPayload = {
                    category_id: item.category_id,
                    motor_name: item.motor_name,
                    company: item.company,
                    max_thrust: item.max_thrust,
                    recommended_esc: item.recommended_esc,
                    recommended_propeller: item.recommended_propeller,
                    link_motor: item.link_motor,
                    link_esc: item.link_esc,
                    link_propeller: item.link_propeller,
                    custom_parameters: item.custom_parameters
                };

                if (r._status === 'duplicate') {
                    // Try to locate target record ID for update
                    const existing = state.motors.find(m => 
                        m.category_id === item.category_id && 
                        m.motor_name.toLowerCase().trim() === item.motor_name.toLowerCase().trim()
                    );
                    if (existing) {
                        updates.push({ id: existing.id, data: dbPayload });
                    } else {
                        inserts.push(dbPayload); // fallback to insert
                    }
                } else {
                    inserts.push(dbPayload);
                }
            });

            let completed = 0;
            const totalOperations = inserts.length + updates.length;
            const chunkSize = 25;

            // 1. Process inserts in batches
            for (let i = 0; i < inserts.length; i += chunkSize) {
                const chunk = inserts.slice(i, i + chunkSize);
                const progressPercent = Math.min(80, Math.round(40 + (completed / totalOperations) * 40));
                
                progressModal.update(progressPercent, `Saving new motors (${completed + 1} of ${totalOperations})...`, 2);

                const res = await fetch('/api/admin/motors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(chunk)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                completed += chunk.length;
            }

            // 2. Process updates sequentially (or batch update if supported, standard Supabase requires individual updates by ID)
            for (let i = 0; i < updates.length; i++) {
                const item = updates[i];
                const progressPercent = Math.min(80, Math.round(40 + (completed / totalOperations) * 40));
                
                progressModal.update(progressPercent, `Updating duplicates (${completed + 1} of ${totalOperations}): ${item.data.motor_name}...`, 2);

                const res = await fetch(`/api/admin/motors/${item.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item.data)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                completed++;
            }

            // Milestone 3: Generating operations audit log
            progressModal.update(90, "Saving activity log...", 3);
            await new Promise(r => setTimeout(r, 600));

            // Log activity to API
            const actionText = `Bulk Import: Added ${inserts.length} and Updated ${updates.length} motor specs.`;
            logUserActivity(session.email, session.role, 'Bulk Imported Data', actionText);

            progressModal.update(100, "Done!", 3);
            await new Promise(r => setTimeout(r, 800));

            progressModal.hide();
            alert(`Import successful! Added ${inserts.length} motors and updated ${updates.length} duplicates.`);
            
            // Redirect to dashboard Catalog View
            window.location.href = '/admin/dashboard';

        } catch (err) {
            console.error("Import error:", err);
            progressModal.hide();
            alert("Database insert transaction failed: " + err.message);
        }
    }

    async function fetchSidebarCounts() {
        try {
            const [motorsRes, catsRes] = await Promise.all([
                fetch('/api/admin/motors'),
                fetch('/api/admin/categories?order=name')
            ]);

            if (!motorsRes.ok) throw new Error("Failed to load motors");
            if (!catsRes.ok) throw new Error("Failed to load categories");

            state.motors = await motorsRes.json();
            state.categories = await catsRes.json();
            
            let accessRequests = [];
            if (session && session.role === 'admin') {
                try {
                    const reqsRes = await fetch('/api/admin/access-requests?order=created_at.desc');
                    if (reqsRes.ok) {
                        accessRequests = await reqsRes.json();
                    }
                } catch (e) {
                    console.warn("Could not load access requests:", e);
                }
            }

            if (elements.totalMotors) elements.totalMotors.textContent = state.motors.length;
            if (elements.totalCats) elements.totalCats.textContent = state.categories.length;

            const pendingRequests = accessRequests.filter(r => r.status === 'pending').length;
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
                window.location.href = '/admin/dashboard';
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
                        const res = await fetch(`/api/admin/categories/${cat.id}`, {
                            method: 'DELETE'
                        });
                        if (!res.ok) {
                            const errData = await res.json();
                            throw new Error(errData.error || `HTTP ${res.status}`);
                        }
                        logUserActivity(session.email, session.role, 'Category Deleted', `Deleted category: ${cat.name}`);
                        await fetchSidebarCounts();
                        renderCategoriesSelect(); // refresh options select in bulk importer
                    } catch (err) {
                        alert("Failed to delete category: " + err.message);
                    }
                }
            };
            elements.catList.appendChild(div);
        });

        const allTab = document.createElement('div');
        allTab.className = 'category-tab';
        allTab.innerHTML = '<span>All Motors</span>';
        allTab.onclick = () => {
            window.location.href = '/admin/explorer';
        };
        elements.catList.appendChild(allTab);
        if (window.lucide) window.lucide.createIcons();
    }

    function setupSidebar() {
        if (typeof fetchSidebarCounts === 'function') {
            fetchSidebarCounts();
        }

        if (elements.btnAddCat) {
            elements.btnAddCat.onclick = () => {
                sessionStorage.setItem('triggerAddCategory', 'true');
                window.location.href = '/admin/dashboard';
            };
        }

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

    // Bootstrap app
    init();

    if (window.sidebarLoaded) {
        setupSidebar();
    } else {
        window.addEventListener('sidebarLoaded', setupSidebar);
    }
});
