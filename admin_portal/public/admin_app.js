// admin_app.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Validate user is admin
    const session = JSON.parse(localStorage.getItem('thrustvault_session'));
    if (!session || session.role !== 'admin') {
        localStorage.removeItem('thrustvault_session');
        window.location.href = '/';
        return;
    }

    // Set email display in footer
    const email = session.email || '';
    const emailEl = document.getElementById('session-email');
    if (emailEl) emailEl.textContent = email;

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

    function convertThrustToKg(val, unit) {
        if (isNaN(val)) return 0;
        switch (unit) {
            case 'kg':
                return val;
            case 'g':
                return val / 1000;
            case 'N':
            case 'n/m':
                return val / 9.80665;
            case 'lb':
                return val * 0.45359237;
            case 'oz':
                return val * 0.02834952;
            default:
                return val;
        }
    }

    function parseThrustInput(thrustStr) {
        if (!thrustStr) return { value: '', unit: 'kg' };
        const match = thrustStr.trim().match(/^([\d\.]+)\s*(kg|g|n|n\/m|oz|lb|lbs)?/i);
        if (match) {
            let val = parseFloat(match[1]);
            let unit = (match[2] || 'kg').toLowerCase();
            if (unit === 'lbs') unit = 'lb';
            return { value: isNaN(val) ? '' : val, unit: unit };
        }
        return { value: thrustStr, unit: 'kg' };
    }

    function findMatchingCategory(kgVal, categories) {
        if (isNaN(kgVal) || kgVal <= 0 || !categories || categories.length === 0) return null;
        
        const parsedCats = categories.map(cat => {
            const numbers = cat.name.match(/[\d\.]+/g);
            if (numbers && numbers.length > 0) {
                const vals = numbers.map(Number);
                if (vals.length === 1) {
                    return { id: cat.id, name: cat.name, min: vals[0], max: vals[0] };
                } else if (vals.length >= 2) {
                    return { id: cat.id, name: cat.name, min: vals[0], max: vals[1] };
                }
            }
            return { id: cat.id, name: cat.name, min: null, max: null };
        }).filter(c => c.min !== null);

        if (parsedCats.length === 0) return null;
        
        // 1. Direct match check
        for (const cat of parsedCats) {
            if (kgVal >= cat.min && kgVal <= cat.max) {
                return cat.id;
            }
        }
        
        // 2. Range match check using midpoints
        parsedCats.sort((a, b) => a.min - b.min);
        
        for (let i = 0; i < parsedCats.length; i++) {
            const current = parsedCats[i];
            const next = parsedCats[i + 1];
            if (kgVal <= current.max) {
                return current.id;
            }
            if (next) {
                const mid = (current.max + next.min) / 2;
                if (kgVal < mid) {
                    return current.id;
                }
            } else {
                return current.id;
            }
        }
        return null;
    }

    function updateThrustPreview() {
        const valEl = document.getElementById('form-motor-thrust-val');
        const unitEl = document.getElementById('form-motor-thrust-unit');
        const previewEl = document.getElementById('thrust-conversion-preview');
        if (!valEl || !unitEl || !previewEl) return;
        
        const val = parseFloat(valEl.value);
        const unit = unitEl.value;
        if (isNaN(val) || val <= 0) {
            previewEl.textContent = '';
            return;
        }
        
        const kgVal = convertThrustToKg(val, unit);
        if (unit !== 'kg') {
            previewEl.textContent = `= ${kgVal.toFixed(3)} kg`;
        } else {
            previewEl.textContent = '';
        }

        // Auto-select category based on thrust value in kg
        if (state && state.categories && state.categories.length > 0) {
            const catId = findMatchingCategory(kgVal, state.categories);
            if (catId) {
                document.getElementById('form-motor-category').value = catId;
            }
        }
    }

    function updateManufacturerSuggestions() {
        const datalist = document.getElementById('manufacturer-list');
        if (!datalist || !state.motors) return;
        
        const companies = [...new Set(state.motors.map(m => m.company))]
            .filter(Boolean)
            .map(c => c.trim())
            .filter(c => c.length > 0)
            .sort((a, b) => a.localeCompare(b));
            
        datalist.innerHTML = companies.map(c => `<option value="${escapeHTML(c)}"></option>`).join('');
    }

    // Bind thrust unit conversion live preview listeners
    const valEl = document.getElementById('form-motor-thrust-val');
    const unitEl = document.getElementById('form-motor-thrust-unit');
    if (valEl) valEl.addEventListener('input', updateThrustPreview);
    if (unitEl) unitEl.addEventListener('change', updateThrustPreview);


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
    const avatarInitials = document.getElementById('user-avatar-initials');
    if (avatarInitials && email) {
        avatarInitials.textContent = email.charAt(0).toUpperCase();
    }

    lucide.createIcons();

    let state = {
        motors: [],
        categories: [],
        activeCategory: null,
        searchQuery: '',
        filterCompany: 'all',
        sortBy: 'motor-asc',
        compareItems: [],
        chartInstances: {}
    };

    // DOM Elements
    const elements = {
        get catList() { return document.getElementById('category-list-container'); },
        motorsTableBody: document.getElementById('motors-list-rows'),
        get totalMotors() { return document.getElementById('total-motors-count'); },
        get totalCats() { return document.getElementById('total-categories-count'); },
        catBadge: document.getElementById('category-badge'),
        catTitle: document.getElementById('active-category-title'),
        catDesc: document.getElementById('active-category-desc'),
        catCount: document.getElementById('category-motors-count'),
        avgThrust: document.getElementById('category-avg-thrust'),
        topCompany: document.getElementById('category-top-company'),
        filteredCountBadge: document.getElementById('filtered-count-badge'),
        tableEmptyState: document.getElementById('table-empty-state'),
        btnClearFilters: document.getElementById('btn-clear-filters'),
        selectAllMotors: document.getElementById('select-all-motors'),
        
        get requestsPendingBadge() { return document.getElementById('requests-pending-badge'); },
        catNavTitle: document.getElementById('cat-nav-title'),
        
        // Modals & Drawers
        motorModal: document.getElementById('motor-modal'),
        catModal: document.getElementById('category-modal'),
        confirmModal: document.getElementById('confirm-modal'),
        comparisonModal: document.getElementById('comparison-modal'),
        comparisonDrawer: document.getElementById('comparison-sidebar'),
        compareItemsContainer: document.getElementById('compare-check-list'),
        compareCount: { textContent: '' },
        comparisonResultTable: document.getElementById('comparison-result-table'),
        
        // Buttons
        btnAddMotor: document.getElementById('btn-add-motor'),
        get btnAddCat() { return document.getElementById('btn-add-category'); },
        btnCompareNow: document.getElementById('btn-compare-sidebar-now'),
        btnClearComparison: document.getElementById('btn-clear-comparison-sidebar'),
        btnCloseComparison: document.getElementById('btn-close-comparison-sidebar'),
        get btnLogout() { return document.getElementById('btn-logout'); },
        
        // Forms
        motorForm: document.getElementById('motor-form'),
        catForm: document.getElementById('category-form'),
        
        // Search & Filters
        searchInput: document.getElementById('search-input'),
        searchClear: document.getElementById('search-clear'),
        filterCompanySelect: document.getElementById('filter-company'),
        sortSelect: document.getElementById('sort-select'),
        
        // Verification Notes
        verificationNotesSection: document.getElementById('verification-notes-section'),
        verificationNotesToggle: document.getElementById('verification-notes-toggle'),
        verificationNotesBody: document.getElementById('verification-notes-rows'),
        
        // Data Operations Dropdown
        importExportToggle: document.getElementById('import-export-toggle'),
        importExportMenu: document.getElementById('import-export-menu'),
        btnExportCSV: document.getElementById('btn-export-csv'),
        btnExportJSON: document.getElementById('btn-export-json'),
        btnImportTrigger: document.getElementById('btn-import-trigger'),
        fileImportInput: document.getElementById('file-import-input'),
        btnDownloadTemplate: document.getElementById('btn-download-template'),
        btnExportXlsx: document.getElementById('btn-export-xlsx'),
        btnExportCustomTrigger: document.getElementById('btn-export-custom-trigger'),
        customExportModal: document.getElementById('custom-export-modal'),
        customExportForm: document.getElementById('custom-export-form')
    };

    // Static Verification Notes
    const verificationNotes = {
        "18-22 kg": [
            {
                code: "TM-U15II",
                motor: "T-Motor U15 II KV80",
                source: "T-Motor Official Test Report",
                url: "https://shop.t-motor.com/goods.php?id=723",
                specs: "Tested at 50.4V (12S LiPo) with G40x13.1 Propeller. Max thrust: 21.2 kg at 110A."
            },
            {
                code: "TM-U15XXL",
                motor: "T-Motor U15 XXL KV60",
                source: "T-Motor Official Test Report",
                url: "https://shop.t-motor.com/goods.php?id=805",
                specs: "Tested at 58.8V (14S LiPo) with 4013 Carbon Propeller. Max thrust: 22.5 kg at 125A."
            }
        ],
        "10 kg": [
            {
                code: "TM-U12II",
                motor: "T-Motor U12 II KV120",
                source: "T-Motor Official Test Report",
                url: "https://shop.t-motor.com/goods.php?id=787",
                specs: "Tested at 50.4V (12S LiPo) with CF30x10.5 folding Propeller. Max thrust: 10.5 kg at 65A."
            },
            {
                code: "HW-X8",
                motor: "Hobbywing XRotor X8",
                source: "Hobbywing Official Spec Sheet",
                url: "https://www.hobbywing.com/en/products/xrotor-x8-p65.html",
                specs: "Integrated 80A 12S ESC, 3090 Folding Propeller. Max thrust: 9.8 kg at 60A."
            }
        ]
    };

    // Helper: Parse thrust strings to numerical kg
    function parseThrustToKg(thrustStr) {
        if (!thrustStr) return 0;
        const normalized = thrustStr.trim().toLowerCase().replace(/\s+/g, '');
        const match = normalized.match(/^([0-9.]+)(kg|g)?$/);
        if (match) {
            const val = parseFloat(match[1]);
            const unit = match[2] || 'kg';
            return unit === 'g' ? val / 1000 : val;
        }
        const numbers = normalized.match(/[0-9.]+/);
        if (numbers) {
            const val = parseFloat(numbers[0]);
            return (normalized.includes('g') && !normalized.includes('kg')) ? val / 1000 : val;
        }
        return 0;
    }

    // Helper: Custom Async Confirmation Dialog Modal (Promise-based)
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

    async function fetchAccessRequestsCount() {
        try {
            const res = await fetch('/api/admin/access-requests?status=eq.pending');
            if (!res.ok) throw new Error("Failed to fetch pending requests");
            const data = await res.json();
            const pending = data ? data.length : 0;
            const badge = document.getElementById('requests-pending-badge');
            if (badge) {
                if (pending > 0) {
                    badge.style.display = 'inline-block';
                    badge.textContent = pending;
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (err) {
            console.error("Error fetching access requests count:", err);
        }
    }

    // Data Fetching from Database
    async function fetchData() {
        try {
            const catRes = await fetch('/api/admin/categories?order=name');
            if (!catRes.ok) throw new Error("Failed to load categories");
            const categories = await catRes.json();
            
            state.categories = (categories || []).map(c => ({
                id: c.id,
                name: c.name,
                desc: c.description
            }));
            
            const motorRes = await fetch('/api/admin/motors');
            if (!motorRes.ok) throw new Error("Failed to load motors");
            const motors = await motorRes.json();
            
            state.motors = (motors || []).map(m => ({
                id: m.id,
                categoryId: m.category_id,
                motor: m.motor_name,
                company: m.company,
                thrust: m.max_thrust,
                esc: m.recommended_esc,
                prop: m.recommended_propeller,
                linkMotor: m.link_motor,
                linkEsc: m.link_esc,
                linkProp: m.link_propeller,
                custom_parameters: m.custom_parameters || {},
                mainImage: m.main_image,
                galleryImages: m.gallery_images
            }));

            // Fetch dynamic schema custom definitions
            let customSchema = [];
            try {
                const schemaRes = await fetch('/api/admin/custom-specs?order=created_at');
                if (schemaRes.ok) {
                    customSchema = await schemaRes.json();
                } else {
                    throw new Error("Failed to load schema from Database");
                }
            } catch (err) {
                console.warn("Falling back to localStorage for custom schema:", err);
                customSchema = JSON.parse(localStorage.getItem('thrustvault_custom_specs')) || [];
            }
            state.customSchema = customSchema;
            
            // Check for pre-selected activeCategory from sessionStorage
            const sessionActiveCat = sessionStorage.getItem('activeCategory');
            if (sessionActiveCat && state.categories.some(c => c.id === sessionActiveCat)) {
                state.activeCategory = sessionActiveCat;
                sessionStorage.removeItem('activeCategory');
            } else if (state.categories.length > 0) {
                if (!state.activeCategory || !state.categories.some(c => c.id === state.activeCategory)) {
                    state.activeCategory = state.categories[0].id;
                }
            } else {
                state.activeCategory = null;
            }
            
            renderApp();
        } catch (e) {
            console.error("Error fetching data from Database:", e);
        }
    }

    function getMotorEfficiency(m) {
        if (m.custom_parameters && m.custom_parameters.efficiency) return parseFloat(m.custom_parameters.efficiency);
        return null;
    }

    function getMotorAvailability(m) {
        if (m.custom_parameters && m.custom_parameters.availability) return m.custom_parameters.availability;
        const hash = m.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const statusVal = hash % 3;
        if (statusVal === 0) return 'In Stock';
        if (statusVal === 1) return 'Limited';
        return 'Out of Stock';
    }

    function calculateCompleteness(m) {
        const coreFields = ['recommended_esc', 'recommended_propeller', 'link_motor', 'link_esc', 'link_propeller'];
        let filled = 0;
        let total = coreFields.length;
        
        coreFields.forEach(f => {
            const hasVal = m[f] || 
                           (f === 'recommended_esc' && m.esc) || 
                           (f === 'recommended_propeller' && m.prop) || 
                           (f === 'link_motor' && m.linkMotor) || 
                           (f === 'link_esc' && m.linkEsc) || 
                           (f === 'link_propeller' && m.linkProp);
            if (hasVal) {
                filled++;
            }
        });
        
        if (state.customSchema && state.customSchema.length > 0) {
            state.customSchema.forEach(field => {
                total++;
                const val = m.custom_parameters ? m.custom_parameters[field.key] : null;
                if (val !== undefined && val !== null && val !== '') {
                    filled++;
                }
            });
        }
        
        return Math.round((filled / total) * 100);
    }

    function calculateVoltageRange(catMotors, cat) {
        let sRatings = [];
        catMotors.forEach(m => {
            const v = m.custom_parameters && (m.custom_parameters.voltage || m.custom_parameters.voltage_v || m.custom_parameters.operating_voltage) ? String(m.custom_parameters.voltage || m.custom_parameters.voltage_v || m.custom_parameters.operating_voltage) : '';
            const esc = m.esc || '';
            const name = m.motor || '';
            
            const match = v.match(/(\d+)s/i) || esc.match(/(\d+)s/i) || name.match(/(\d+)s/i);
            if (match) {
                sRatings.push(parseInt(match[1]));
            }
        });
        
        if (sRatings.length > 0) {
            const min = Math.min(...sRatings);
            const max = Math.max(...sRatings);
            return min === max ? `${min}S` : `${min}S - ${max}S`;
        }
        
        if (cat && cat.desc) {
            const descMatch = cat.desc.match(/(\d+)S\s*–\s*(\d+)S/i) || cat.desc.match(/(\d+)S\s*-\s*(\d+)S/i);
            if (descMatch) {
                return `${descMatch[1]}S - ${descMatch[2]}S`;
            }
        }
        return 'N/A';
    }

    function updateKpis(catMotors, cat) {
        const kpiTotal = document.getElementById('kpi-total-motors-val');
        if (kpiTotal) kpiTotal.textContent = catMotors.length;
        
        const kpiAvg = document.getElementById('kpi-avg-thrust-val');
        if (kpiAvg) {
            let sumThrust = 0;
            let countThrust = 0;
            catMotors.forEach(m => {
                const parsed = parseThrustToKg(m.thrust);
                if (parsed > 0) {
                    sumThrust += parsed;
                    countThrust++;
                }
            });
            kpiAvg.textContent = countThrust > 0 ? `${(sumThrust / countThrust).toFixed(2)} kg` : 'N/A';
        }
        
        const kpiMax = document.getElementById('kpi-max-thrust-val');
        if (kpiMax) {
            let maxThrust = 0;
            catMotors.forEach(m => {
                const parsed = parseThrustToKg(m.thrust);
                if (parsed > maxThrust) maxThrust = parsed;
            });
            kpiMax.textContent = maxThrust > 0 ? `${maxThrust.toFixed(2)} kg` : 'N/A';
        }
        
        const kpiBrands = document.getElementById('kpi-brands-val');
        if (kpiBrands) {
            const brands = new Set(catMotors.map(m => m.company));
            kpiBrands.textContent = brands.size;
        }
        
        const kpiVoltage = document.getElementById('kpi-voltage-val');
        if (kpiVoltage) {
            kpiVoltage.textContent = calculateVoltageRange(catMotors, cat);
        }
        
        const kpiCompleteness = document.getElementById('kpi-completeness-val');
        if (kpiCompleteness) {
            let sumCompleteness = 0;
            catMotors.forEach(m => {
                sumCompleteness += calculateCompleteness(m);
            });
            const avgCompleteness = catMotors.length > 0 ? Math.round(sumCompleteness / catMotors.length) : 0;
            kpiCompleteness.textContent = `${avgCompleteness}%`;
        }
        
        const kpiActive = document.getElementById('kpi-active-class-val');
        if (kpiActive) {
            kpiActive.textContent = cat ? cat.name : '-';
        }
    }

    function renderBrandTreemap(catMotors) {
        const container = document.getElementById('brand-treemap-container');
        if (!container) return;
        container.innerHTML = '';
        
        if (catMotors.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:20px; text-align:center; width:100%;">No data to display</div>';
            return;
        }
        
        const counts = {};
        catMotors.forEach(m => {
            counts[m.company] = (counts[m.company] || 0) + 1;
        });
        
        const sortedBrands = Object.entries(counts)
            .map(([name, count]) => ({
                name,
                count,
                percentage: (count / catMotors.length) * 100
            }))
            .sort((a, b) => b.count - a.count);
        
        const colors = [
            'hsl(217, 91%, 60%)',
            'hsl(142, 72%, 29%)',
            'hsl(200, 95%, 45%)',
            'hsl(160, 84%, 39%)',
            'hsl(224, 76%, 48%)',
            'hsl(180, 70%, 40%)',
            'hsl(210, 40%, 50%)',
            'hsl(140, 50%, 60%)',
        ];
        
        sortedBrands.forEach((item, index) => {
            const block = document.createElement('div');
            block.className = 'treemap-block';
            block.style.flexGrow = item.count;
            block.style.backgroundColor = colors[index % colors.length];
            block.style.flexBasis = `${Math.max(80, item.percentage * 2.5)}px`;
            
            block.innerHTML = `
                <div class="treemap-block-label" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</div>
                <div style="display:flex; align-items:baseline; justify-content:space-between; width:100%;">
                    <span class="treemap-block-pct">${item.percentage.toFixed(0)}%</span>
                    <span class="treemap-block-sub">${item.count} motor${item.count > 1 ? 's' : ''}</span>
                </div>
            `;
            
            block.onclick = () => {
                elements.filterCompanySelect.value = item.name;
                state.filterCompany = item.name;
                renderMainContent();
            };
            
            container.appendChild(block);
        });
    }

    function renderTop10Motors(catMotors) {
        const container = document.getElementById('top-motors-chart-container');
        if (!container) return;
        container.innerHTML = '';
        
        if (catMotors.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:20px; text-align:center; width:100%;">No data to display</div>';
            return;
        }
        
        const sorted = [...catMotors]
            .map(m => ({
                ...m,
                thrustKg: parseThrustToKg(m.thrust)
            }))
            .sort((a, b) => b.thrustKg - a.thrustKg)
            .slice(0, 10);
        
        const maxThrust = sorted[0]?.thrustKg || 1;
        
        sorted.forEach((m, index) => {
            const pct = (m.thrustKg / maxThrust) * 100;
            const row = document.createElement('div');
            row.className = 'bar-row';
            row.innerHTML = `
                <span class="bar-num">#${index + 1}</span>
                <span class="bar-label" title="${escapeHTML(m.motor)}">${escapeHTML(m.motor)}</span>
                <div class="bar-track">
                    <div class="bar-fill" style="width: ${pct}%"></div>
                </div>
                <span class="bar-value">${m.thrustKg.toFixed(2)} kg</span>
            `;
            container.appendChild(row);
        });
    }

    function renderInsights(catMotors) {
        const container = document.getElementById('insights-list-container');
        if (!container) return;
        container.innerHTML = '';
        
        if (catMotors.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:20px; text-align:center; width:100%;">No insights available</div>';
            return;
        }
        
        const escCounts = {};
        let topEsc = '-';
        let maxEscCount = 0;
        catMotors.forEach(m => {
            if (m.esc) {
                escCounts[m.esc] = (escCounts[m.esc] || 0) + 1;
                if (escCounts[m.esc] > maxEscCount) {
                    maxEscCount = escCounts[m.esc];
                    topEsc = m.esc;
                }
            }
        });
        
        const propCounts = {};
        let topProp = '-';
        let maxPropCount = 0;
        catMotors.forEach(m => {
            if (m.prop) {
                propCounts[m.prop] = (propCounts[m.prop] || 0) + 1;
                if (propCounts[m.prop] > maxPropCount) {
                    maxPropCount = propCounts[m.prop];
                    topProp = m.prop;
                }
            }
        });
        let maxThrustVal = 0;
        let maxThrustMotorName = '-';
        catMotors.forEach(m => {
            const thrustVal = parseThrustToKg(m.thrust);
            if (thrustVal > maxThrustVal) {
                maxThrustVal = thrustVal;
                maxThrustMotorName = m.motor;
            }
        });
        
        const insights = [
            { label: 'Popular ESC', val: topEsc, icon: 'zap' },
            { label: 'Standard Propeller', val: topProp, icon: 'wind' },
            { label: 'Max Thrust Leader', val: maxThrustMotorName !== '-' ? `${maxThrustMotorName} (${maxThrustVal.toFixed(1)} kg)` : '-', icon: 'trending-up' }
        ];
        
        insights.forEach(item => {
            const div = document.createElement('div');
            div.className = 'insight-item';
            div.innerHTML = `
                <div class="insight-icon-box">
                    <i data-lucide="${item.icon}"></i>
                </div>
                <div class="insight-info" style="flex:1; min-width:0;">
                    <span class="insight-lbl">${item.label}</span>
                    <span class="insight-desc" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;" title="${escapeHTML(item.val)}">${escapeHTML(item.val)}</span>
                </div>
            `;
            container.appendChild(div);
        });
        
        lucide.createIcons();
    }

    function renderApp() {
        renderSidebar();
        renderMainContent();
        renderCharts();
        updateStats();
        updateComparisonDrawer();
        updateManufacturerSuggestions();
        lucide.createIcons();
    }

    function updateStats() {
        if (elements.totalMotors) {
            elements.totalMotors.textContent = state.motors.length;
        }
        const totalCatsSpan = document.getElementById('total-categories-count');
        if (totalCatsSpan) {
            totalCatsSpan.textContent = state.categories.length;
        }
    }

    // Sidebar Category Rendering
    function renderSidebar() {
        if (!elements.catList) return;
        elements.catList.innerHTML = '';
        state.categories.forEach(cat => {
            const count = state.motors.filter(m => m.categoryId === cat.id).length;
            const div = document.createElement('div');
            div.className = `category-tab ${state.activeCategory === cat.id ? 'active' : ''}`;
            div.innerHTML = `
                <span>${cat.name}</span>
                <div style="display:flex; align-items:center; gap:5px;">
                    <span class="cat-count">${count}</span>
                    <button class="btn-delete-cat" data-id="${cat.id}" title="Delete Category"><i data-lucide="trash-2" style="width:14px;"></i></button>
                </div>
            `;
            
            div.onclick = (e) => {
                if(e.target.closest('.btn-delete-cat')) return;
                state.activeCategory = cat.id;
                state.filterCompany = 'all';
                state.searchQuery = '';
                elements.searchInput.value = '';
                elements.searchClear.style.display = 'none';
                renderApp();
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
                        
                        // Fallback active category
                        state.activeCategory = state.categories.find(c => c.id !== cat.id)?.id || null;
                        await fetchData();
                    } catch (err) {
                        console.error("Error deleting category:", err);
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
            window.location.href = '/admin/explorer';
        };
        elements.catList.appendChild(allTab);
        
        const catSelect = document.getElementById('form-motor-category');
        catSelect.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    // Main Content Rendering
    function renderMainContent() {
        const cat = state.categories.find(c => c.id === state.activeCategory);
        if(!cat) {
            elements.catBadge.textContent = "N/A";
            elements.catTitle.textContent = "No Category Selected";
            elements.catDesc.textContent = "Please create a category in the sidebar to get started.";
            elements.motorsTableBody.innerHTML = '';
            elements.filteredCountBadge.textContent = "0 displayed";
            elements.avgThrust.textContent = "N/A";
            elements.topCompany.textContent = "N/A";
            if (elements.verificationNotesSection) elements.verificationNotesSection.style.display = 'none';
            return;
        }
        
        elements.catBadge.textContent = cat.name;
        elements.catTitle.textContent = `${cat.name} Class`;
        elements.catDesc.textContent = cat.desc || `${cat.name} Thrust Stand Motors`;
        
        const catMotors = state.motors.filter(m => m.categoryId === cat.id);
        
        updateBrandFilterOptions(catMotors);
        
        let filteredMotors = [...catMotors];
        
        if (state.filterCompany !== 'all') {
            filteredMotors = filteredMotors.filter(m => m.company === state.filterCompany);
        }
        
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            filteredMotors = filteredMotors.filter(m => 
                m.motor.toLowerCase().includes(q) || 
                m.company.toLowerCase().includes(q) ||
                (m.esc && m.esc.toLowerCase().includes(q)) ||
                (m.prop && m.prop.toLowerCase().includes(q))
            );
        }

        // Apply Sorting
        filteredMotors.sort((a, b) => {
            if (state.sortBy === 'motor-asc') {
                return a.motor.localeCompare(b.motor);
            } else if (state.sortBy === 'motor-desc') {
                return b.motor.localeCompare(a.motor);
            } else if (state.sortBy === 'company-asc') {
                return a.company.localeCompare(b.company);
            } else if (state.sortBy === 'thrust-desc') {
                return parseThrustToKg(b.thrust) - parseThrustToKg(a.thrust);
            } else if (state.sortBy === 'thrust-asc') {
                return parseThrustToKg(a.thrust) - parseThrustToKg(b.thrust);
            }
            return 0;
        });
        
        // Stats
        calculateCategoryQuickStats(catMotors);
        
        elements.filteredCountBadge.textContent = `${filteredMotors.length} displayed`;
        
        if (filteredMotors.length === 0) {
            elements.tableEmptyState.style.display = 'block';
            document.getElementById('motors-data-table').style.display = 'none';
        } else {
            elements.tableEmptyState.style.display = 'none';
            document.getElementById('motors-data-table').style.display = 'table';
        }
        
        elements.motorsTableBody.innerHTML = '';
        filteredMotors.forEach((m) => {
            const tr = document.createElement('tr');
            const isChecked = state.compareItems.includes(m.id);
            
            const initials = m.motor.charAt(0).toUpperCase();
            
            // Dynamic accent color for thumbnail based on company name hash
            const hash = m.company.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const thumbHue = hash % 360;
            const thumbStyle = `background: hsl(${thumbHue}, 80%, 95%); color: hsl(${thumbHue}, 80%, 40%); border-color: hsl(${thumbHue}, 80%, 85%);`;
            
            // Extract KV
            const kvMatch = m.motor.match(/(\d+)\s*KV/i) || m.motor.match(/KV\s*(\d+)/i);
            const kv = kvMatch ? `${kvMatch[1]} KV` : (m.custom_parameters && (m.custom_parameters.kv || m.custom_parameters.kv_rating) ? m.custom_parameters.kv || m.custom_parameters.kv_rating : '-');
            
            // Extract Voltage
            const voltage = m.custom_parameters && (m.custom_parameters.voltage || m.custom_parameters.voltage_v || m.custom_parameters.operating_voltage) ? String(m.custom_parameters.voltage || m.custom_parameters.voltage_v || m.custom_parameters.operating_voltage) : (m.motor.match(/\b\d+S\b/i) || m.esc?.match(/\b\d+S\b/i) || ['-'])[0];
            
            // Extract Weight
            const weightVal = m.custom_parameters && (m.custom_parameters.weight || m.custom_parameters.weight_g || m.custom_parameters.motor_weight) ? m.custom_parameters.weight || m.custom_parameters.weight_g || m.custom_parameters.motor_weight : null;
            const weight = weightVal ? `${weightVal} g` : '-';
            const links = [];
            if (m.linkMotor) {
                links.push(`<a href="${sanitizeUrl(m.linkMotor)}" target="_blank" title="Motor Specs"><i data-lucide="cpu" style="width:14px;height:14px;"></i></a>`);
            }
            if (m.linkEsc) {
                links.push(`<a href="${sanitizeUrl(m.linkEsc)}" target="_blank" title="ESC Specs"><i data-lucide="zap" style="width:14px;height:14px;"></i></a>`);
            }
            if (m.linkProp) {
                links.push(`<a href="${sanitizeUrl(m.linkProp)}" target="_blank" title="Propeller Specs"><i data-lucide="wind" style="width:14px;height:14px;"></i></a>`);
            }
            const linksHtml = links.length > 0 ? links.join(' ') : '-';
            
            tr.innerHTML = `
                <td><input type="checkbox" class="compare-cb" data-id="${m.id}" ${isChecked ? 'checked' : ''}></td>
                <td><div class="motor-thumbnail" style="${thumbStyle}">${initials}</div></td>
                <td><a href="#" class="motor-profile-link" data-id="${m.id}"><strong>${escapeHTML(m.motor)}</strong></a></td>
                <td>${escapeHTML(m.company)}</td>
                <td><strong>${escapeHTML(kv)}</strong></td>
                <td><span class="badge-thrust" style="background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.2); color: var(--primary-color);">${escapeHTML(voltage)}</span></td>
                <td><span class="badge-thrust">${escapeHTML(m.thrust)}</span></td>
                <td>${escapeHTML(weight)}</td>
                <td>${escapeHTML(m.prop || '-')}</td>
                <td>${escapeHTML(m.esc || '-')}</td>
                <td><div class="action-links">${linksHtml}</div></td>
                <td style="text-align: right; vertical-align: middle; white-space: nowrap;">
                    <div class="row-actions">
                        <button class="btn-share" data-name="${escapeHTML(m.motor)}" title="Share Motor Spec Link"><i data-lucide="share-2" style="width:14px;height:14px;"></i></button>
                        <button class="btn-edit" data-id="${m.id}" title="Edit Specifications"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
                        <button class="btn-delete" data-id="${m.id}" title="Delete Motor"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                    </div>
                </td>
            `;
            elements.motorsTableBody.appendChild(tr);
        });
        
        const allCbs = elements.motorsTableBody.querySelectorAll('.compare-cb');
        elements.selectAllMotors.checked = allCbs.length > 0 && Array.from(allCbs).every(cb => cb.checked);
        
        bindRowActions();
        renderVerificationNotes(cat.name);
    }

    function bindRowActions() {
        elements.motorsTableBody.querySelectorAll('.compare-cb').forEach(cb => {
            cb.onchange = () => {
                const id = cb.dataset.id;
                if (cb.checked) {
                    if (state.compareItems.length >= 3) {
                        alert("You can compare a maximum of 3 motors side-by-side.");
                        cb.checked = false;
                        return;
                    }
                    state.compareItems.push(id);
                } else {
                    state.compareItems = state.compareItems.filter(item => item !== id);
                }
                updateComparisonDrawer();
            };
        });

        elements.motorsTableBody.querySelectorAll('.btn-delete').forEach(btn => {
            btn.onclick = async () => {
                const motorId = btn.dataset.id;
                const motor = state.motors.find(x => x.id === motorId);
                const confirmDelete = await customConfirm(
                    "Delete Motor Entry?",
                    `Are you sure you want to permanently delete the specifications for "${motor.motor}"?`
                );
                if (confirmDelete) {
                    try {
                        const res = await fetch(`/api/admin/motors/${motorId}`, {
                            method: 'DELETE'
                        });
                        if (!res.ok) {
                            const errData = await res.json();
                            throw new Error(errData.error || `HTTP ${res.status}`);
                        }
                        logUserActivity(session.email, session.role, 'Motor Entry Deleted', `Deleted motor: ${motor.motor} (Brand: ${motor.company})`);
                        
                        state.compareItems = state.compareItems.filter(id => id !== motorId);
                        await fetchData();
                    } catch (err) {
                        console.error("Error deleting motor:", err);
                        alert("Failed to delete motor: " + err.message);
                    }
                }
            };
        });
        
        elements.motorsTableBody.querySelectorAll('.btn-edit').forEach(btn => {
            btn.onclick = () => {
                const m = state.motors.find(x => x.id === btn.dataset.id);
                document.getElementById('modal-title').innerHTML = `<i data-lucide="edit-2"></i> Edit Motor Specifications`;
                document.getElementById('form-motor-index').value = m.id;
                document.getElementById('form-motor-name').value = m.motor;
                document.getElementById('form-motor-company').value = m.company;
                const parsedThrust = parseThrustInput(m.thrust);
                document.getElementById('form-motor-thrust-val').value = parsedThrust.value;
                document.getElementById('form-motor-thrust-unit').value = parsedThrust.unit;
                updateThrustPreview();
                document.getElementById('form-motor-category').value = m.categoryId;
                document.getElementById('form-motor-esc').value = m.esc || '';
                document.getElementById('form-motor-propeller').value = m.prop || '';
                document.getElementById('form-motor-link').value = m.linkMotor || '';
                document.getElementById('form-esc-link').value = m.linkEsc || '';
                document.getElementById('form-prop-link').value = m.linkProp || '';
                renderCustomFieldsInMotorForm(m);
                openModal(elements.motorModal);
                lucide.createIcons();
            };
        });

        // Motor share button click handlers
        elements.motorsTableBody.querySelectorAll('.btn-share').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const motorName = btn.dataset.name;
                const shareUrl = `${window.location.origin}/share/motor/${encodeURIComponent(motorName)}`;
                if (window.showShareModal) {
                    window.showShareModal('motor', motorName, shareUrl);
                } else {
                    navigator.clipboard.writeText(shareUrl).then(() => alert('Link copied to clipboard!'));
                }
            };
        });

        // Motor profile click handlers
        elements.motorsTableBody.querySelectorAll('.motor-profile-link').forEach(link => {
            link.onclick = (e) => {
                e.preventDefault();
                showMotorProfile(link.dataset.id);
            };
        });
    }

    function updateBrandFilterOptions(catMotors) {
        const currentVal = elements.filterCompanySelect.value;
        const brands = [...new Set(catMotors.map(m => m.company))].sort();
        
        elements.filterCompanySelect.innerHTML = '<option value="all">All Brands</option>' + 
            brands.map(b => `<option value="${b}">${b}</option>`).join('');
            
        if (brands.includes(currentVal)) {
            elements.filterCompanySelect.value = currentVal;
            state.filterCompany = currentVal;
        } else {
            elements.filterCompanySelect.value = 'all';
            state.filterCompany = 'all';
        }
    }

    function calculateCategoryQuickStats(catMotors) {
        if (elements.catCount) {
            elements.catCount.textContent = catMotors.length;
        }
        if (catMotors.length > 0) {
            let sumThrust = 0;
            let validThrustCount = 0;
            catMotors.forEach(m => {
                const parsed = parseThrustToKg(m.thrust);
                if (parsed > 0) {
                    sumThrust += parsed;
                    validThrustCount++;
                }
            });
            if (validThrustCount > 0) {
                elements.avgThrust.textContent = `${(sumThrust / validThrustCount).toFixed(2)} kg`;
            } else {
                elements.avgThrust.textContent = "N/A";
            }
            
            const brandCounts = {};
            catMotors.forEach(m => { brandCounts[m.company] = (brandCounts[m.company] || 0) + 1; });
            let topBrand = 'N/A';
            let maxCount = 0;
            for (const [brand, count] of Object.entries(brandCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    topBrand = brand;
                }
            }
            elements.topCompany.textContent = topBrand;
        } else {
            elements.avgThrust.textContent = 'N/A';
            elements.topCompany.textContent = 'N/A';
        }
    }

    function renderVerificationNotes(categoryName) {
        if (!elements.verificationNotesSection || !elements.verificationNotesBody) return;
        const notes = verificationNotes[categoryName];
        if (notes && notes.length > 0) {
            elements.verificationNotesSection.style.display = 'block';
            elements.verificationNotesBody.innerHTML = notes.map(n => `
                <tr>
                    <td><code>${n.code}</code></td>
                    <td><strong>${n.motor}</strong></td>
                    <td>
                        <a href="${n.url}" target="_blank" class="verification-link">
                            <i data-lucide="shield-check" class="text-success" style="width:14px; vertical-align:middle; margin-right:4px;"></i>
                            ${n.source}
                        </a>
                    </td>
                    <td>${n.specs}</td>
                </tr>
            `).join('');
            lucide.createIcons();
        } else {
            elements.verificationNotesSection.style.display = 'none';
        }
    }

    function updateComparisonDrawer() {
        const count = state.compareItems.length;
        elements.compareCount.textContent = `${count} / 3`;
        
        if (count > 0) {
            elements.comparisonDrawer.classList.add('show');
            elements.compareItemsContainer.innerHTML = state.compareItems.map(id => {
                const m = state.motors.find(x => x.id === id);
                if (!m) return '';
                return `
                    <div class="compare-item">
                        <div>
                            <div class="compare-item-info">${m.motor}</div>
                            <div class="compare-item-brand">${m.company}</div>
                        </div>
                        <button class="btn-icon-smallClose btn-remove-compare" data-id="${m.id}" title="Remove"><i data-lucide="x" style="width:14px;"></i></button>
                    </div>
                `;
            }).join('');
            
            elements.compareItemsContainer.querySelectorAll('.btn-remove-compare').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.dataset.id;
                    state.compareItems = state.compareItems.filter(item => item !== id);
                    updateComparisonDrawer();
                    const cb = elements.motorsTableBody.querySelector(`.compare-cb[data-id="${id}"]`);
                    if (cb) cb.checked = false;
                };
            });
            lucide.createIcons();
        } else {
            elements.comparisonDrawer.classList.remove('show');
            elements.compareItemsContainer.innerHTML = '';
        }
        
        if (elements.btnCompareNow) {
            elements.btnCompareNow.disabled = (count === 0);
        }
    }

    if (elements.btnCompareNow) {
        elements.btnCompareNow.onclick = () => {
            if (state.compareItems.length === 0) return;
        const selected = state.compareItems.map(id => state.motors.find(m => m.id === id)).filter(Boolean);
        
        let customRowsHtml = '';
        if (state.customSchema && state.customSchema.length > 0) {
            state.customSchema.forEach(f => {
                customRowsHtml += `
                    <tr>
                        <td><strong>${f.field_name}</strong></td>
                        ${selected.map(m => {
                            const val = m.custom_parameters && m.custom_parameters[f.field_key] !== undefined ? m.custom_parameters[f.field_key] : '-';
                            if (f.field_type === 'boolean') {
                                return `<td>${val === true || val === 'true' ? '<span style="color:#059669;font-weight:700;">Yes</span>' : '<span style="color:#e11d48;font-weight:700;">No</span>'}</td>`;
                            }
                            return `<td>${val} ${val !== '-' && f.field_unit && val !== '' ? f.field_unit : ''}</td>`;
                        }).join('')}
                    </tr>
                `;
            });
        }

        elements.comparisonResultTable.innerHTML = `
            <thead>
                <tr>
                    <th>Specification</th>
                    ${selected.map(m => `<th>${m.motor}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Manufacturer</strong></td>
                    ${selected.map(m => `<td>${m.company}</td>`).join('')}
                </tr>
                <tr>
                    <td><strong>Max Thrust</strong></td>
                    ${selected.map(m => `<td>${m.thrust}</td>`).join('')}
                </tr>
                <tr>
                    <td><strong>Recommended ESC</strong></td>
                    ${selected.map(m => `<td>${m.esc || '-'}</td>`).join('')}
                </tr>
                <tr>
                    <td><strong>Recommended Propeller</strong></td>
                    ${selected.map(m => `<td>${m.prop || '-'}</td>`).join('')}
                </tr>
                ${customRowsHtml}
                <tr>
                    <td><strong>Reference Links</strong></td>
                    ${selected.map(m => `
                        <td>
                            <div style="display:flex; flex-direction:column; gap:5px;">
                                ${m.linkMotor ? `<a href="${m.linkMotor}" target="_blank" style="display:inline-flex; align-items:center; gap:5px;"><i data-lucide="cpu" style="width:14px;"></i> Motor Page</a>` : ''}
                                ${m.linkEsc ? `<a href="${m.linkEsc}" target="_blank" style="display:inline-flex; align-items:center; gap:5px;"><i data-lucide="zap" style="width:14px;"></i> ESC Page</a>` : ''}
                                ${m.linkProp ? `<a href="${m.linkProp}" target="_blank" style="display:inline-flex; align-items:center; gap:5px;"><i data-lucide="wind" style="width:14px;"></i> Prop Page</a>` : ''}
                                ${!m.linkMotor && !m.linkEsc && !m.linkProp ? '-' : ''}
                            </div>
                        </td>
                    `).join('')}
                </tr>
            </tbody>
        `;
        if (elements.comparisonModal) {
            openModal(elements.comparisonModal);
        }
        if (window.lucide) {
            lucide.createIcons();
        }
    };
    }

    if (elements.btnClearComparison) {
        elements.btnClearComparison.onclick = () => {
            state.compareItems = [];
            updateComparisonDrawer();
            const cbs = elements.motorsTableBody ? elements.motorsTableBody.querySelectorAll('.compare-cb') : [];
            cbs.forEach(cb => cb.checked = false);
            if (elements.selectAllMotors) elements.selectAllMotors.checked = false;
        };
    }
    if (elements.btnCloseComparison) {
        elements.btnCloseComparison.onclick = () => {
            state.compareItems = [];
            updateComparisonDrawer();
            const cbs = elements.motorsTableBody ? elements.motorsTableBody.querySelectorAll('.compare-cb') : [];
            cbs.forEach(cb => cb.checked = false);
            if (elements.selectAllMotors) elements.selectAllMotors.checked = false;
        };
    }

    if (elements.selectAllMotors) {
        elements.selectAllMotors.onchange = () => {
            const visibleCbs = elements.motorsTableBody ? elements.motorsTableBody.querySelectorAll('.compare-cb') : [];
            const isChecked = elements.selectAllMotors.checked;
            
            visibleCbs.forEach(cb => {
                const id = cb.dataset.id;
                if (isChecked) {
                    if (!state.compareItems.includes(id)) {
                        if (state.compareItems.length < 3) {
                            cb.checked = true;
                            state.compareItems.push(id);
                        } else {
                            cb.checked = false;
                        }
                    }
                } else {
                    cb.checked = false;
                    state.compareItems = state.compareItems.filter(item => item !== id);
                }
            });
            updateComparisonDrawer();
        };
    }

    function renderCharts() {
        const cat = state.categories.find(c => c.id === state.activeCategory);
        const catMotors = state.motors.filter(m => m.categoryId === state.activeCategory);
        
        updateKpis(catMotors, cat);
        renderBrandTreemap(catMotors);
        renderTop10Motors(catMotors);
        renderInsights(catMotors);
    }

    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        elements.searchClear.style.display = state.searchQuery ? 'block' : 'none';
        renderMainContent();
        showSearchSuggestions(state.searchQuery);
    });

    // =========================================================================
    // SMART SEARCH SUGGESTIONS
    // =========================================================================

    const suggestionsEl = document.getElementById('search-suggestions');
    let activeSuggestionIndex = -1;

    // Levenshtein distance for fuzzy matching
    function levenshtein(a, b) {
        const m = a.length, n = b.length;
        const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                dp[i][j] = a[i-1] === b[j-1]
                    ? dp[i-1][j-1]
                    : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
            }
        }
        return dp[m][n];
    }

    // Score a motor against the query
    function scoreMotor(motor, query) {
        const q = query.toLowerCase().trim();
        if (!q) return -1;

        const fields = [
            motor.motor || '',
            motor.company || '',
            motor.esc || '',
            motor.prop || ''
        ];
        const haystack = fields.join(' ').toLowerCase();
        const motorLower = (motor.motor || '').toLowerCase();
        const companyLower = (motor.company || '').toLowerCase();

        let score = 0;

        // Exact substring match (highest priority)
        if (motorLower.startsWith(q)) score += 100;
        else if (motorLower.includes(q)) score += 70;
        else if (companyLower.includes(q)) score += 50;
        else if (haystack.includes(q)) score += 30;

        // Token-based partial match (each word in query)
        const queryTokens = q.split(/\s+/);
        const motorTokens = haystack.split(/\s+/);
        queryTokens.forEach(qt => {
            if (!qt) return;
            motorTokens.forEach(mt => {
                if (mt.startsWith(qt)) score += 20;
                else if (mt.includes(qt)) score += 10;
                else {
                    // Fuzzy: allow 1 typo for words > 4 chars, 2 typos for > 7
                    const maxDist = qt.length > 7 ? 2 : qt.length > 4 ? 1 : 0;
                    const dist = levenshtein(qt, mt.substring(0, qt.length + 2));
                    if (dist <= maxDist) score += Math.max(5, 12 - dist * 4);
                }
            });
        });

        return score;
    }

    // Highlight matched query text in a string
    function highlightMatch(text, query) {
        if (!query || !text) return escapeHTML(text || '');
        const escaped = escapeHTML(text);
        const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped.replace(new RegExp(`(${q})`, 'gi'), '<mark>$1</mark>');
    }

    function showSearchSuggestions(query) {
        activeSuggestionIndex = -1;
        const q = (query || '').trim();

        if (q.length < 1) {
            suggestionsEl.style.display = 'none';
            return;
        }

        // Search across ALL motors in ALL categories
        const scored = state.motors
            .map(m => {
                const cat = state.categories.find(c => c.id === m.categoryId);
                return { motor: m, cat, score: scoreMotor(m, q) };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);

        if (scored.length === 0) {
            suggestionsEl.innerHTML = `<div class="suggestion-no-results">No motors match "<strong>${escapeHTML(q)}</strong>"</div>`;
            suggestionsEl.style.display = 'block';
            return;
        }

        const items = scored.map((x, idx) => {
            const { motor: m, cat } = x;
            const catName = cat ? cat.name : 'Uncategorized';
            const initials = (m.motor || '?').charAt(0).toUpperCase();
            const highlightedName = highlightMatch(m.motor, q);
            const highlightedCompany = highlightMatch(m.company, q);
            return `
                <div class="suggestion-item" data-idx="${idx}" data-motor-id="${escapeHTML(m.id)}" data-cat-id="${escapeHTML(m.categoryId)}">
                    <div class="suggestion-item-icon">${initials}</div>
                    <div class="suggestion-item-body">
                        <div class="suggestion-motor-name">${highlightedName}</div>
                        <div class="suggestion-motor-meta">${highlightedCompany}${m.esc ? ' &nbsp;·&nbsp; ESC: ' + escapeHTML(m.esc) : ''}</div>
                    </div>
                    <span class="suggestion-thrust-badge">${escapeHTML(catName)}</span>
                </div>`;
        }).join('');

        suggestionsEl.innerHTML = `
            <div class="suggestion-header">
                <i data-lucide="search" style="width:10px;height:10px;display:inline;vertical-align:middle;margin-right:3px;"></i>
                Suggestions &nbsp;·&nbsp; ${scored.length} match${scored.length !== 1 ? 'es' : ''} across all categories
            </div>
            ${items}`;

        suggestionsEl.style.display = 'block';
        if (window.lucide) window.lucide.createIcons();

        // Click to select
        suggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // prevent blur before click fires
                const catId = item.dataset.catId;
                const motorName = scored[parseInt(item.dataset.idx)].motor.motor;
                // Switch to that category first
                if (catId && catId !== state.activeCategory) {
                    state.activeCategory = catId;
                    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                    const catBtn = document.querySelector(`.category-btn[data-cat-id="${catId}"]`);
                    if (catBtn) catBtn.classList.add('active');
                }
                // Set search to exact motor name
                elements.searchInput.value = motorName;
                state.searchQuery = motorName;
                elements.searchClear.style.display = 'block';
                suggestionsEl.style.display = 'none';
                renderMainContent();
            });
        });
    }

    // Keyboard navigation for suggestions
    elements.searchInput.addEventListener('keydown', (e) => {
        const items = suggestionsEl.querySelectorAll('.suggestion-item');
        if (suggestionsEl.style.display === 'none' || items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, -1);
        } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
            e.preventDefault();
            items[activeSuggestionIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            return;
        } else if (e.key === 'Escape') {
            suggestionsEl.style.display = 'none';
            activeSuggestionIndex = -1;
            return;
        }

        items.forEach((item, i) => item.classList.toggle('active', i === activeSuggestionIndex));
        if (activeSuggestionIndex >= 0) items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
    });

    // Hide on outside click
    document.addEventListener('click', (e) => {
        if (!elements.searchInput.contains(e.target) && !suggestionsEl.contains(e.target)) {
            suggestionsEl.style.display = 'none';
            activeSuggestionIndex = -1;
        }
    });

    // Show suggestions again on focus if there's text
    elements.searchInput.addEventListener('focus', () => {
        if (elements.searchInput.value.trim().length >= 1) {
            showSearchSuggestions(elements.searchInput.value);
        }
    });


    elements.searchClear.addEventListener('click', () => {
        state.searchQuery = '';
        elements.searchInput.value = '';
        elements.searchClear.style.display = 'none';
        suggestionsEl.style.display = 'none';
        activeSuggestionIndex = -1;
        renderMainContent();
    });

    elements.filterCompanySelect.addEventListener('change', (e) => {
        state.filterCompany = e.target.value;
        renderMainContent();
    });

    elements.sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderMainContent();
    });

    elements.btnClearFilters.addEventListener('click', () => {
        state.searchQuery = '';
        state.filterCompany = 'all';
        elements.searchInput.value = '';
        elements.searchClear.style.display = 'none';
        elements.filterCompanySelect.value = 'all';
        renderMainContent();
    });

    if (elements.verificationNotesToggle) {
        elements.verificationNotesToggle.onclick = () => {
            const body = document.getElementById('verification-notes-body');
            const chevron = elements.verificationNotesToggle.querySelector('.notes-chevron');
            if (body && chevron) {
                if (body.style.display === 'none') {
                    body.style.display = 'table-row-group';
                    chevron.style.transform = 'rotate(0deg)';
                } else {
                    body.style.display = 'none';
                    chevron.style.transform = 'rotate(180deg)';
                }
            }
        };
    }

    elements.importExportToggle.onclick = (e) => {
        e.stopPropagation();
        elements.importExportMenu.classList.toggle('show');
    };
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            elements.importExportMenu.classList.remove('show');
        }
    });

    // Exports & Imports
    elements.btnExportJSON.onclick = () => {
        const backup = { categories: state.categories, motors: state.motors, customSchema: state.customSchema || [] };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thrustvault_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    elements.btnExportCSV.onclick = () => {
        const headers = ['Category Name', 'Category Description', 'Motor Model Name', 'Manufacturer', 'Max Thrust', 'Recommended ESC', 'Recommended Propeller', 'Motor Link', 'ESC Link', 'Propeller Link'];
        const customHeaders = (state.customSchema || []).map(f => `${f.field_name} [${f.field_key}]`);
        const allHeaders = [...headers, ...customHeaders];
        
        const rows = state.motors.map(m => {
            const cat = state.categories.find(c => c.id === m.categoryId);
            const row = [cat ? cat.name : '', '', m.motor, m.company, m.thrust, m.esc || '', m.prop || '', m.linkMotor || '', m.linkEsc || '', m.linkProp || ''];
            
            const customVals = m.custom_parameters || {};
            (state.customSchema || []).forEach(f => {
                row.push(customVals[f.field_key] !== undefined ? customVals[f.field_key] : '');
            });
            return row.map(val => `"${val.toString().replace(/"/g, '""')}"`);
        });
        const csvContent = [allHeaders.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thrustvault_catalog_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    elements.btnExportXlsx.onclick = () => {
        const headers = ['Category Name', 'Category Description', 'Motor Model Name', 'Manufacturer', 'Max Thrust', 'Recommended ESC', 'Recommended Propeller', 'Motor Link', 'ESC Link', 'Propeller Link'];
        const customHeaders = (state.customSchema || []).map(f => `${f.field_name} [${f.field_key}]`);
        const allHeaders = [...headers, ...customHeaders];
        
        const rows = state.motors.map(m => {
            const cat = state.categories.find(c => c.id === m.categoryId);
            const row = [cat ? cat.name : '', cat ? cat.desc : '', m.motor, m.company, m.thrust, m.esc || '', m.prop || '', m.linkMotor || '', m.linkEsc || '', m.linkProp || ''];
            
            const customVals = m.custom_parameters || {};
            (state.customSchema || []).forEach(f => {
                row.push(customVals[f.field_key] !== undefined ? customVals[f.field_key] : '');
            });
            return row;
        });
        
        const data = [allHeaders, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Catalog');
        XLSX.writeFile(wb, `thrustvault_catalog_${new Date().toISOString().slice(0,10)}.xlsx`);
        
        logUserActivity(session.email, session.role, 'Exported Data', 'Exported full catalog as Excel workbook.');
    };

    elements.btnDownloadTemplate.onclick = () => {
        const headers = ['Category Name', 'Category Description', 'Motor Model Name', 'Manufacturer', 'Max Thrust', 'Recommended ESC', 'Recommended Propeller', 'Motor Link', 'ESC Link', 'Propeller Link'];
        const customHeaders = (state.customSchema || []).map(f => `${f.field_name} [${f.field_key}]`);
        const allHeaders = [...headers, ...customHeaders];
        
        const sampleRow = ['2 kg', 'Cinematic drone motors', 'F60 Pro V', 'T-Motor', '2.1 kg', 'V45A ESC', 'T5143S Prop', 'https://...', '', ''];
        
        (state.customSchema || []).forEach(f => {
            if (f.field_type === 'number') sampleRow.push('150');
            else if (f.field_type === 'boolean') sampleRow.push('true');
            else sampleRow.push('Sample');
        });
        
        const data = [allHeaders, sampleRow];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.writeFile(wb, 'thrustvault_import_template.xlsx');
        
        logUserActivity(session.email, session.role, 'Template Downloaded', 'Downloaded customized Excel import template.');
    };

    elements.btnImportTrigger.onclick = () => { elements.fileImportInput.click(); };
    elements.fileImportInput.onchange = (e) => {
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
        reader.onload = async (evt) => {
            try {
                if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    await importExcelData(workbook);
                } else {
                    const content = evt.target.result;
                    if (file.name.endsWith('.json')) {
                        await importJSONData(JSON.parse(content));
                    } else if (file.name.endsWith('.csv')) {
                        await importCSVData(content);
                    }
                }
                elements.fileImportInput.value = '';
            } catch (err) {
                alert("Import failed: " + err.message);
            }
        };
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    };

    function parseCSV(text) {
        const lines = [];
        let row = [""];
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i+1];
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    row[row.length - 1] += '"';
                    i++;
                } else { inQuotes = !inQuotes; }
            } else if (char === ',' && !inQuotes) {
                row.push("");
            } else if ((char === '\r' || char === '\n') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') { i++; }
                lines.push(row);
                row = [""];
            } else { row[row.length - 1] += char; }
        }
        if (row.length > 1 || row[0] !== "") { lines.push(row); }
        return lines;
    }

    async function importCSVData(csvText) {
        const rows = parseCSV(csvText);
        if (rows.length < 2) throw new Error("Empty CSV.");
        const headers = rows[0].map(h => h.trim().toLowerCase());
        const catNameIdx = headers.indexOf('category name');
        const catDescIdx = headers.indexOf('category description');
        const nameIdx = headers.indexOf('motor model name');
        const companyIdx = headers.indexOf('manufacturer');
        const thrustIdx = headers.indexOf('max thrust');
        const escIdx = headers.indexOf('recommended esc');
        const propIdx = headers.indexOf('recommended propeller');
        const linkMotorIdx = headers.indexOf('motor link');
        const linkEscIdx = headers.indexOf('esc link');
        const linkPropIdx = headers.indexOf('propeller link');
        
        if (catNameIdx === -1 || nameIdx === -1 || companyIdx === -1 || thrustIdx === -1) {
            throw new Error("Missing required headers.");
        }
        
        // Map custom schema column indices
        const customFieldMaps = [];
        state.customSchema.forEach(f => {
            const idx = headers.findIndex(h => h === f.field_key.toLowerCase() || h.includes(`[${f.field_key.toLowerCase()}]`));
            if (idx !== -1) {
                customFieldMaps.push({ key: f.field_key, idx: idx, type: f.field_type });
            }
        });
        
        let importCount = 0;
        const categoryMap = {};
        state.categories.forEach(c => { categoryMap[c.name.toLowerCase()] = c.id; });
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length < 4 || !row[nameIdx]) continue;
            
            const catName = row[catNameIdx].trim();
            if (!catName) continue;
            
            let categoryId = categoryMap[catName.toLowerCase()];
            if (!categoryId) {
                const catDesc = catDescIdx !== -1 ? row[catDescIdx].trim() : '';
                const res = await fetch('/api/admin/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: catName, description: catDesc })
                });
                if (!res.ok) throw new Error("Failed to create category");
                const data = await res.json();
                categoryId = data[0].id;
                categoryMap[catName.toLowerCase()] = categoryId;
                state.categories.push({ id: categoryId, name: catName, desc: catDesc });
            }
            
            const customParams = {};
            customFieldMaps.forEach(m => {
                const val = row[m.idx];
                if (val !== undefined && val !== null) {
                    if (m.type === 'number') {
                        customParams[m.key] = parseFloat(val);
                    } else if (m.type === 'boolean') {
                        customParams[m.key] = val === true || val === 'true' || val === 1 || val === '1';
                    } else {
                        customParams[m.key] = val.toString().trim();
                    }
                }
            });
            
            const motorData = {
                category_id: categoryId,
                motor_name: row[nameIdx].trim(),
                company: row[companyIdx].trim(),
                max_thrust: row[thrustIdx].trim(),
                recommended_esc: escIdx !== -1 && row[escIdx] ? row[escIdx].trim() : null,
                recommended_propeller: propIdx !== -1 && row[propIdx] ? row[propIdx].trim() : null,
                link_motor: linkMotorIdx !== -1 && row[linkMotorIdx] ? row[linkMotorIdx].trim() : null,
                link_esc: linkEscIdx !== -1 && row[linkEscIdx] ? row[linkEscIdx].trim() : null,
                link_propeller: linkPropIdx !== -1 && row[linkPropIdx] ? row[linkPropIdx].trim() : null,
                custom_parameters: customParams
            };
            const motorRes = await fetch('/api/admin/motors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(motorData)
            });
            if (!motorRes.ok) throw new Error("Failed to insert motor specifications");
            importCount++;
        }
        logUserActivity(session.email, session.role, 'Imported Data', `Imported ${importCount} motor entries from CSV.`);
        alert(`Imported ${importCount} motor entries.`);
        await fetchData();
    }

    async function importJSONData(imported) {
        if (!imported.categories || !imported.motors) throw new Error("Invalid structure.");
        let importCount = 0;
        const categoryMap = {};
        state.categories.forEach(c => { categoryMap[c.name.toLowerCase()] = c.id; });
        
        for (const cat of imported.categories) {
            let newId = categoryMap[cat.name.toLowerCase()];
            if (!newId) {
                const res = await fetch('/api/admin/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: cat.name, description: cat.desc || cat.description || '' })
                });
                if (!res.ok) throw new Error("Failed to create category");
                const data = await res.json();
                newId = data[0].id;
                categoryMap[cat.name.toLowerCase()] = newId;
                state.categories.push({ id: newId, name: cat.name, desc: cat.desc || cat.description || '' });
            }
            categoryMap[cat.id] = newId;
        }
        
        for (const m of imported.motors) {
            const oldCatId = m.categoryId || m.category_id;
            const newCatId = categoryMap[oldCatId];
            if (!newCatId) continue;
            
            const motorData = {
                category_id: newCatId,
                motor_name: m.motor || m.motor_name,
                company: m.company,
                max_thrust: m.thrust || m.max_thrust,
                recommended_esc: m.esc || m.recommended_esc || null,
                recommended_propeller: m.prop || m.recommended_propeller || null,
                link_motor: m.linkMotor || m.link_motor || null,
                link_esc: m.linkEsc || m.link_esc || null,
                link_propeller: m.linkProp || m.link_propeller || null,
                custom_parameters: m.custom_parameters || {}
            };
            const motorRes = await fetch('/api/admin/motors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(motorData)
            });
            if (!motorRes.ok) throw new Error("Failed to insert motor specifications");
            importCount++;
        }
        logUserActivity(session.email, session.role, 'Imported Data', `Imported ${importCount} motor entries from JSON.`);
        alert(`Imported ${importCount} motor entries.`);
        await fetchData();
    }

    // Modal Form Submits
    elements.catForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('form-cat-name').value.trim();
        const desc = document.getElementById('form-cat-desc').value.trim();
        try {
            const res = await fetch('/api/admin/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description: desc })
            });
            if (!res.ok) throw new Error("Failed to create category");
            const data = await res.json();
            logUserActivity(session.email, session.role, 'Category Created', `Created category: ${name}`);
            closeModal(elements.catModal);
            if (data && data[0]) { state.activeCategory = data[0].id; }
            await fetchData();
        } catch (err) { alert("Failed to create category: " + err.message); }
    };

    elements.motorForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('form-motor-index').value;
        
        // Collect custom parameters
        const customInputs = document.querySelectorAll('.custom-field-input');
        const customParams = {};
        customInputs.forEach(input => {
            const key = input.dataset.key;
            const type = input.dataset.type;
            if (type === 'boolean') {
                customParams[key] = input.checked;
            } else if (type === 'number') {
                customParams[key] = input.value !== '' ? parseFloat(input.value) : null;
            } else {
                customParams[key] = input.value.trim() || null;
            }
        });

        const thrustVal = parseFloat(document.getElementById('form-motor-thrust-val').value);
        const thrustUnit = document.getElementById('form-motor-thrust-unit').value;
        const thrustKg = convertThrustToKg(thrustVal, thrustUnit);
        const maxThrustStr = `${parseFloat(thrustKg.toFixed(3))} kg`;

        const motorData = {
            motor_name: document.getElementById('form-motor-name').value.trim(),
            company: document.getElementById('form-motor-company').value.trim(),
            max_thrust: maxThrustStr,
            category_id: document.getElementById('form-motor-category').value,
            recommended_esc: document.getElementById('form-motor-esc').value.trim() || null,
            recommended_propeller: document.getElementById('form-motor-propeller').value.trim() || null,
            link_motor: document.getElementById('form-motor-link').value.trim() || null,
            link_esc: document.getElementById('form-esc-link').value.trim() || null,
            link_propeller: document.getElementById('form-prop-link').value.trim() || null,
            custom_parameters: customParams
        };

        const isDuplicate = state.motors.some(m => 
            m.id !== id &&
            m.company.toLowerCase() === motorData.company.toLowerCase() && 
            m.motor.toLowerCase() === motorData.motor_name.toLowerCase()
        );
        if (isDuplicate) {
            alert(`A motor named "${motorData.motor_name}" from manufacturer "${motorData.company}" already exists in the database.`);
            return;
        }

        try {
            if (id) {
                const res = await fetch(`/api/admin/motors/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(motorData)
                });
                if (!res.ok) throw new Error("Failed to update motor");
                logUserActivity(session.email, session.role, 'Motor Entry Updated', `Updated motor: ${motorData.motor_name} (Brand: ${motorData.company})`);
            } else {
                const res = await fetch('/api/admin/motors', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(motorData)
                });
                if (!res.ok) throw new Error("Failed to create motor");
                logUserActivity(session.email, session.role, 'Motor Entry Created', `Added motor: ${motorData.motor_name} (Brand: ${motorData.company})`);
            }
            closeModal(elements.motorModal);
            await fetchData();
        } catch (err) { alert("Failed to save motor: " + err.message); }
    };

    elements.btnAddMotor.onclick = () => {
        elements.motorForm.reset();
        document.getElementById('form-motor-thrust-unit').value = 'kg';
        document.getElementById('thrust-conversion-preview').textContent = '';
        document.getElementById('modal-title').innerHTML = `<i data-lucide="plus-circle"></i> Add New Motor Entry`;
        document.getElementById('form-motor-index').value = '';
        document.getElementById('form-motor-category').value = state.activeCategory || '';
        renderCustomFieldsInMotorForm();
        openModal(elements.motorModal);
        lucide.createIcons();
    };

    

    function openModal(modal) { modal.classList.add('show'); }
    function closeModal(modal) { modal.classList.remove('show'); }
    document.querySelectorAll('.modal-close-trigger').forEach(btn => {
        btn.onclick = (e) => closeModal(e.target.closest('.modal-backdrop'));
    });
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(backdrop); };
    });

    // Logout
    

    // =========================================================================
    // DYNAMIC SPEC SCHEMA CUSTOMIZER & EXPORTER ACTIONS
    // =========================================================================



    function renderCustomFieldsInMotorForm(motorObj = null) {
        const container = document.getElementById('modal-custom-fields-rows');
        const section = document.getElementById('modal-custom-fields-section');
        container.innerHTML = '';
        
        if (state.customSchema && state.customSchema.length > 0) {
            section.style.display = 'block';
            const customVals = motorObj && motorObj.custom_parameters ? motorObj.custom_parameters : {};
            
            state.customSchema.forEach(f => {
                const val = customVals[f.field_key] !== undefined ? customVals[f.field_key] : '';
                const formGroup = document.createElement('div');
                formGroup.className = 'form-group';
                
                let inputHtml = '';
                if (f.field_type === 'boolean') {
                    const isChecked = val === true || val === 'true';
                    inputHtml = `
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                            <input type="checkbox" class="custom-field-input" data-key="${f.field_key}" data-type="boolean" ${isChecked ? 'checked' : ''}>
                            <strong>${f.field_name}</strong> ${f.field_unit ? `(${f.field_unit})` : ''}
                        </label>
                    `;
                } else {
                    inputHtml = `
                        <label for="custom-field-${f.field_key}"><strong>${f.field_name}</strong> ${f.field_unit ? `(${f.field_unit})` : ''}</label>
                        <input type="${f.field_type === 'number' ? 'number' : 'text'}" id="custom-field-${f.field_key}" class="custom-field-input" data-key="${f.field_key}" data-type="${f.field_type}" value="${val}" placeholder="e.g. ${f.field_type === 'number' ? '120' : 'Cinematic'}">
                    `;
                }
                formGroup.innerHTML = inputHtml;
                container.appendChild(formGroup);
            });
        } else {
            section.style.display = 'none';
        }
    }

    async function importExcelData(workbook) {
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (rows.length < 2) throw new Error("Empty Excel sheet.");
        
        const headers = rows[0].map(h => h ? h.toString().trim() : '');
        
        const catNameIdx = headers.findIndex(h => h.toLowerCase() === 'category name');
        const catDescIdx = headers.findIndex(h => h.toLowerCase() === 'category description');
        const nameIdx = headers.findIndex(h => h.toLowerCase() === 'motor model name');
        const companyIdx = headers.findIndex(h => h.toLowerCase() === 'manufacturer');
        const thrustIdx = headers.findIndex(h => h.toLowerCase() === 'max thrust');
        const escIdx = headers.findIndex(h => h.toLowerCase() === 'recommended esc');
        const propIdx = headers.findIndex(h => h.toLowerCase() === 'recommended propeller');
        const linkMotorIdx = headers.findIndex(h => h.toLowerCase() === 'motor link');
        const linkEscIdx = headers.findIndex(h => h.toLowerCase() === 'esc link');
        const linkPropIdx = headers.findIndex(h => h.toLowerCase() === 'propeller link');
        
        if (catNameIdx === -1 || nameIdx === -1 || companyIdx === -1 || thrustIdx === -1) {
            throw new Error("Missing required column headers: Category Name, Motor Model Name, Manufacturer, Max Thrust.");
        }
        
        // Map custom schema column indices
        const customFieldMaps = [];
        if (state.customSchema) {
            state.customSchema.forEach(f => {
                const idx = headers.findIndex(h => h.toLowerCase() === f.field_key.toLowerCase() || h.toLowerCase().includes(`[${f.field_key.toLowerCase()}]`));
                if (idx !== -1) {
                    customFieldMaps.push({ key: f.field_key, idx: idx, type: f.field_type });
                }
            });
        }
        
        let importCount = 0;
        const categoryMap = {};
        state.categories.forEach(c => { categoryMap[c.name.toLowerCase()] = c.id; });
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 4 || !row[nameIdx]) continue;
            
            const catName = row[catNameIdx] ? row[catNameIdx].toString().trim() : '';
            if (!catName) continue;
            
            let categoryId = categoryMap[catName.toLowerCase()];
            if (!categoryId) {
                const catDesc = catDescIdx !== -1 && row[catDescIdx] ? row[catDescIdx].toString().trim() : '';
                const res = await fetch('/api/admin/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: catName, description: catDesc })
                });
                if (!res.ok) throw new Error("Failed to create category");
                const data = await res.json();
                categoryId = data[0].id;
                categoryMap[catName.toLowerCase()] = categoryId;
                state.categories.push({ id: categoryId, name: catName, desc: catDesc });
            }
            
            // Extract custom parameters
            const customParams = {};
            customFieldMaps.forEach(m => {
                const val = row[m.idx];
                if (val !== undefined && val !== null) {
                    if (m.type === 'number') {
                        customParams[m.key] = val !== '' ? parseFloat(val) : null;
                    } else if (m.type === 'boolean') {
                        customParams[m.key] = val === true || val === 'true' || val === 1 || val === '1';
                    } else {
                        customParams[m.key] = val.toString().trim();
                    }
                }
            });
            
            const motorData = {
                category_id: categoryId,
                motor_name: row[nameIdx].toString().trim(),
                company: row[companyIdx].toString().trim(),
                max_thrust: row[thrustIdx].toString().trim(),
                recommended_esc: escIdx !== -1 && row[escIdx] ? row[escIdx].toString().trim() : null,
                recommended_propeller: propIdx !== -1 && row[propIdx] ? row[propIdx].toString().trim() : null,
                link_motor: linkMotorIdx !== -1 && row[linkMotorIdx] ? row[linkMotorIdx].toString().trim() : null,
                link_esc: linkEscIdx !== -1 && row[linkEscIdx] ? row[linkEscIdx].toString().trim() : null,
                link_propeller: linkPropIdx !== -1 && row[linkPropIdx] ? row[linkPropIdx].toString().trim() : null,
                custom_parameters: customParams
            };
            
            const motorRes = await fetch('/api/admin/motors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(motorData)
            });
            if (!motorRes.ok) throw new Error("Failed to insert motor specifications");
            importCount++;
        }
        logUserActivity(session.email, session.role, 'Imported Data', `Imported ${importCount} motor entries from Excel sheet.`);
        alert(`Imported ${importCount} motor entries.`);
        await fetchData();
    }

    elements.btnExportCustomTrigger.onclick = () => {
        // Dynamically populate custom columns selector checkboxes
        const selector = document.getElementById('export-columns-selector');
        const coreCount = 7;
        while(selector.children.length > coreCount) {
            selector.removeChild(selector.lastChild);
        }
        
        (state.customSchema || []).forEach(f => {
            const label = document.createElement('label');
            label.style.cssText = "display:flex; align-items:center; gap:8px; font-size:0.85rem; cursor:pointer;";
            label.innerHTML = `<input type="checkbox" value="custom_${f.field_key}" checked> ${f.field_name}`;
            selector.appendChild(label);
        });
        
        openModal(elements.customExportModal);
    };

    elements.customExportForm.onsubmit = (e) => {
        e.preventDefault();
        const format = document.getElementById('export-format').value;
        const checkedBoxes = Array.from(document.querySelectorAll('#export-columns-selector input[type="checkbox"]:checked')).map(cb => cb.value);
        
        if (checkedBoxes.length === 0) {
            alert("Please select at least one column to include in the export.");
            return;
        }
        
        runCustomExport(format, checkedBoxes);
        closeModal(elements.customExportModal);
    };

    function runCustomExport(format, columns) {
        const cat = state.categories.find(c => c.id === state.activeCategory);
        let exportMotors = state.motors;
        if (cat) {
            exportMotors = exportMotors.filter(m => m.categoryId === cat.id);
        }
        
        if (state.filterCompany !== 'all') {
            exportMotors = exportMotors.filter(m => m.company === state.filterCompany);
        }
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            exportMotors = exportMotors.filter(m => 
                m.motor.toLowerCase().includes(q) || 
                m.company.toLowerCase().includes(q)
            );
        }

        const headers = [];
        columns.forEach(col => {
            if (col.startsWith('custom_')) {
                const key = col.replace('custom_', '');
                const f = state.customSchema.find(x => x.field_key === key);
                headers.push(f ? f.field_name : key);
            } else {
                const headerMap = {
                    category: 'Category Name',
                    motor: 'Motor Model Name',
                    company: 'Manufacturer',
                    thrust: 'Max Thrust',
                    esc: 'Recommended ESC',
                    prop: 'Recommended Propeller',
                    links: 'Reference Links'
                };
                headers.push(headerMap[col] || col);
            }
        });

        if (format === 'json') {
            const dataToExport = exportMotors.map(m => {
                const row = {};
                columns.forEach(col => {
                    if (col.startsWith('custom_')) {
                        const key = col.replace('custom_', '');
                        row[key] = m.custom_parameters && m.custom_parameters[key] !== undefined ? m.custom_parameters[key] : null;
                    } else if (col === 'category') {
                        const c = state.categories.find(x => x.id === m.categoryId);
                        row.category = c ? c.name : '';
                    } else if (col === 'links') {
                        row.motor_link = m.linkMotor || '';
                        row.esc_link = m.linkEsc || '';
                        row.prop_link = m.linkProp || '';
                    } else {
                        row[col] = m[col] || '';
                    }
                });
                return row;
            });
            downloadFile(JSON.stringify(dataToExport, null, 2), 'application/json', 'json');
        } 
        else if (format === 'csv') {
            const rows = exportMotors.map(m => {
                return columns.map(col => {
                    let val = '';
                    if (col.startsWith('custom_')) {
                        const key = col.replace('custom_', '');
                        val = m.custom_parameters && m.custom_parameters[key] !== undefined ? m.custom_parameters[key] : '';
                    } else if (col === 'category') {
                        const c = state.categories.find(x => x.id === m.categoryId);
                        val = c ? c.name : '';
                    } else if (col === 'links') {
                        val = [m.linkMotor, m.linkEsc, m.linkProp].filter(Boolean).join(' | ');
                    } else {
                        val = m[col] || '';
                    }
                    return `"${val.toString().replace(/"/g, '""')}"`;
                });
            });
            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            downloadFile(csv, 'text/csv;charset=utf-8;', 'csv');
        }
        else if (format === 'xlsx') {
            const rows = exportMotors.map(m => {
                return columns.map(col => {
                    if (col.startsWith('custom_')) {
                        const key = col.replace('custom_', '');
                        return m.custom_parameters && m.custom_parameters[key] !== undefined ? m.custom_parameters[key] : '';
                    } else if (col === 'category') {
                        const c = state.categories.find(x => x.id === m.categoryId);
                        return c ? c.name : '';
                    } else if (col === 'links') {
                        return [m.linkMotor, m.linkEsc, m.linkProp].filter(Boolean).join(', ');
                    } else {
                        return m[col] || '';
                    }
                });
            });
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Custom Export');
            XLSX.writeFile(wb, `thrustvault_export_${new Date().toISOString().slice(0,10)}.xlsx`);
        }
        else if (format === 'xml') {
            let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<catalog>\n';
            exportMotors.forEach(m => {
                xml += '  <motor>\n';
                columns.forEach(col => {
                    let key = col;
                    let val = '';
                    if (col.startsWith('custom_')) {
                        key = col.replace('custom_', '');
                        val = m.custom_parameters && m.custom_parameters[key] !== undefined ? m.custom_parameters[key] : '';
                    } else if (col === 'category') {
                        const c = state.categories.find(x => x.id === m.categoryId);
                        val = c ? c.name : '';
                    } else if (col === 'links') {
                        val = [m.linkMotor, m.linkEsc, m.linkProp].filter(Boolean).join(', ');
                    } else {
                        val = m[col] || '';
                    }
                    const xmlTag = key.replace(/[^a-zA-Z0-9_]/g, '_');
                    xml += `    <${xmlTag}>${escapeXML(val)}</${xmlTag}>\n`;
                });
                xml += '  </motor>\n';
            });
            xml += '</catalog>';
            downloadFile(xml, 'application/xml', 'xml');
        }
        else if (format === 'html') {
            let html = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>ThrustVault Export</title>\n<style>\n';
            html += 'body { font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; padding: 30px; }\n';
            html += 'table { border-collapse: collapse; width: 100%; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; background: white; }\n';
            html += 'th, td { border: 1px solid #e2e8f0; text-align: left; padding: 12px 16px; }\n';
            html += 'th { background-color: #2563eb; color: white; font-weight: 600; }\n';
            html += 'tr:nth-child(even) { background-color: #f8fafc; }\n';
            html += 'h2 { font-size: 1.5rem; margin-bottom: 20px; }\n';
            html += '</style>\n</head>\n<body>\n';
            html += `<h2>ThrustVault Export — ${cat ? cat.name : 'All Categories'}</h2>\n<table>\n  <thead>\n    <tr>\n`;
            
            headers.forEach(h => {
                html += `      <th>${h}</th>\n`;
            });
            html += '    </tr>\n  </thead>\n  <tbody>\n';
            
            exportMotors.forEach(m => {
                html += '    <tr>\n';
                columns.forEach(col => {
                    let val = '';
                    if (col.startsWith('custom_')) {
                        const key = col.replace('custom_', '');
                        val = m.custom_parameters && m.custom_parameters[key] !== undefined ? m.custom_parameters[key] : '';
                    } else if (col === 'category') {
                        const c = state.categories.find(x => x.id === m.categoryId);
                        val = c ? c.name : '';
                    } else if (col === 'links') {
                        val = [
                            m.linkMotor ? `<a href="${m.linkMotor}" target="_blank">Motor</a>` : '',
                            m.linkEsc ? `<a href="${m.linkEsc}" target="_blank">ESC</a>` : '',
                            m.linkProp ? `<a href="${m.linkProp}" target="_blank">Prop</a>` : ''
                        ].filter(Boolean).join(' | ');
                    } else {
                        val = m[col] || '';
                    }
                    html += `      <td>${val}</td>\n`;
                });
                html += '    </tr>\n';
            });
            html += '  </tbody>\n</table>\n</body>\n</html>';
            downloadFile(html, 'text/html;charset=utf-8;', 'html');
        }
        
        logUserActivity(session.email, session.role, 'Exported Data', `Exported ${exportMotors.length} records customized as ${format.toUpperCase()}.`);
    }

    function downloadFile(content, mimeType, extension) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thrustvault_export_${new Date().toISOString().slice(0,10)}.${extension}`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function escapeXML(str) {
        if (str === null || str === undefined) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    // Logout and redirect helper
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

    // =========================================================================
    // MOTOR PROFILE & TELEMETRY CHARTS CONTROLLER
    // =========================================================================
    let profileCharts = {
        throttleTime: null,
        rpmTime: null,
        thrustRpm: null,
        torqueRpm: null,
        voltageRpm: null,
        currentRpm: null,
        elecPowerRpm: null,
        mechPowerRpm: null,
        motorEffRpm: null,
        propEffRpm: null,
        systemEffRpm: null
    };

    function destroyProfileCharts() {
        Object.keys(profileCharts).forEach(key => {
            if (profileCharts[key]) {
                profileCharts[key].destroy();
                profileCharts[key] = null;
            }
        });
    }

    // Bind motor profile overlay back button
    const backBtn = document.getElementById('btn-motor-profile-back');
    if (backBtn) {
        backBtn.onclick = () => {
            const overlay = document.getElementById('motor-profile-overlay');
            overlay.style.display = 'none';
            destroyProfileCharts();
        };
    }

    // Bind share button
    const shareBtn = document.getElementById('btn-profile-share');
    if (shareBtn) {
        shareBtn.onclick = () => {
            const motorName = document.getElementById('profile-motor-name').textContent;
            const shareUrl = `${window.location.origin}/share/motor/${encodeURIComponent(motorName)}`;
            navigator.clipboard.writeText(shareUrl)
                .then(() => {
                    const originalHTML = shareBtn.innerHTML;
                    shareBtn.innerHTML = `<i data-lucide="check" style="width:14px; height:14px; color:#22c55e;"></i> Copied!`;
                    if (window.lucide) window.lucide.createIcons();
                    setTimeout(() => {
                        shareBtn.innerHTML = originalHTML;
                        if (window.lucide) window.lucide.createIcons();
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy share link:', err);
                });
        };
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function sanitizeUrl(url) {
        if (!url) return '';
        const clean = url.trim();
        if (clean.startsWith('javascript:') || clean.startsWith('data:') || clean.startsWith('vbscript:')) {
            return '';
        }
        return clean;
    }

    async function showMotorProfile(motorId) {
        const m = state.motors.find(x => x.id === motorId);
        if (!m) return;

        const overlay = document.getElementById('motor-profile-overlay');
        overlay.style.display = 'flex';

        // Load image preview gallery
        const profileImageCard = document.getElementById('profile-image-card');
        const profileMainImage = document.getElementById('profile-main-image');
        const profileGalleryThumbs = document.getElementById('profile-gallery-thumbnails');

        if (profileImageCard && profileMainImage && profileGalleryThumbs) {
            const images = [];
            if (m.mainImage && m.mainImage.startsWith('http')) {
                images.push(m.mainImage);
            }
            
            let gallery = [];
            if (Array.isArray(m.galleryImages)) {
                gallery = m.galleryImages;
            } else if (typeof m.galleryImages === 'string') {
                try {
                    gallery = JSON.parse(m.galleryImages);
                } catch (e) {}
            }
            
            if (Array.isArray(gallery)) {
                gallery.forEach(img => {
                    if (img && img.startsWith('http') && !images.includes(img)) {
                        images.push(img);
                    }
                });
            }

            if (images.length > 0) {
                profileImageCard.style.display = 'flex';
                profileMainImage.src = sanitizeUrl(images[0]);
                profileMainImage.alt = escapeHTML(m.motor);
                
                profileGalleryThumbs.innerHTML = '';
                if (images.length > 1) {
                    profileGalleryThumbs.style.display = 'flex';
                    images.forEach((img, idx) => {
                        const btn = document.createElement('button');
                        btn.className = `profile-image-thumb-btn ${idx === 0 ? 'active' : ''}`;
                        btn.innerHTML = `<img src="${sanitizeUrl(img)}">`;
                        btn.onclick = () => {
                            profileMainImage.src = sanitizeUrl(img);
                            // Update border/active state
                            Array.from(profileGalleryThumbs.children).forEach((c, cIdx) => {
                                if (cIdx === idx) {
                                    c.classList.add('active');
                                } else {
                                    c.classList.remove('active');
                                }
                            });
                        };
                        profileGalleryThumbs.appendChild(btn);
                    });
                } else {
                    profileGalleryThumbs.style.display = 'none';
                }
            } else {
                profileImageCard.style.display = 'none';
            }
        }

        document.getElementById('profile-motor-name').textContent = m.motor;
        document.getElementById('profile-brand-badge').textContent = m.company;
        
        const cat = state.categories.find(c => c.id === m.categoryId);
        document.getElementById('profile-category-badge').textContent = cat ? `${cat.name} Class` : 'N/A';

        document.getElementById('profile-spec-company').textContent = m.company;
        document.getElementById('profile-spec-thrust').textContent = m.thrust;
        document.getElementById('profile-spec-esc').textContent = m.esc || '-';
        document.getElementById('profile-spec-prop').textContent = m.prop || '-';

        // Custom parameters
        const customTableBody = document.getElementById('profile-custom-specs-table');
        customTableBody.innerHTML = '';
        const customCard = document.getElementById('profile-custom-specs-card');
        
        if (state.customSchema && state.customSchema.length > 0) {
            let hasCustomData = false;
            state.customSchema.forEach(field => {
                const val = m.custom_parameters ? m.custom_parameters[field.key] : null;
                if (val !== undefined && val !== null && val !== '') {
                    hasCustomData = true;
                    const tr = document.createElement('tr');
                    const label = field.label;
                    const unit = field.unit ? ` ${field.unit}` : '';
                    tr.innerHTML = `
                        <td>${label}</td>
                        <td>${val}${unit}</td>
                    `;
                    customTableBody.appendChild(tr);
                }
            });
            customCard.style.display = hasCustomData ? 'block' : 'none';
        } else {
            customCard.style.display = 'none';
        }

        // Links
        const linksContainer = document.getElementById('profile-links-container');
        linksContainer.innerHTML = '';
        let hasLinks = false;

        const linkConfigs = [
            { url: m.linkMotor, title: 'Official Motor Specs', icon: 'cpu' },
            { url: m.linkEsc, title: 'Recommended ESC Specs', icon: 'zap' },
            { url: m.linkProp, title: 'Recommended Prop Specs', icon: 'wind' }
        ];

        linkConfigs.forEach(cfg => {
            if (cfg.url) {
                hasLinks = true;
                const a = document.createElement('a');
                a.href = cfg.url;
                a.target = '_blank';
                a.className = 'profile-link-btn';
                a.innerHTML = `
                    <span><i data-lucide="${cfg.icon}"></i> ${cfg.title}</span>
                    <i data-lucide="arrow-up-right" class="arrow-icon"></i>
                `;
                linksContainer.appendChild(a);
            }
        });

        if (!hasLinks) {
            linksContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.88rem; font-style: italic;">No reference links available.</div>';
        }

        // Fetch runs
        const runsList = document.getElementById('profile-test-runs-list');
        runsList.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:10px;">Loading runs...</div>';

        const telemetryCard = document.getElementById('profile-telemetry-details-card');
        const telemetryEmpty = document.getElementById('profile-telemetry-empty-state');
        telemetryCard.style.display = 'none';
        telemetryEmpty.style.display = 'block';

        document.getElementById('profile-stat-runs').textContent = '0';
        document.getElementById('profile-stat-max-thrust').textContent = '-';
        document.getElementById('profile-stat-avg-eff').textContent = '-';

        destroyProfileCharts();

        try {
            const runsRes = await fetch(`/api/admin/motor-test-runs?motor_id=eq.${motorId}&order=tested_at.desc`);
            if (!runsRes.ok) throw new Error("Failed to load test runs");
            const runs = await runsRes.json();

            if (!runs || runs.length === 0) {
                runsList.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:10px; font-style:italic;">No test runs found.</div>';
                lucide.createIcons();
                return;
            }

            const runIds = runs.map(r => r.id);
            const runIdsParam = runIds.join(',');
            const ptsRes = await fetch(`/api/admin/motor-test-data-points?test_run_id=in.(${runIdsParam})&order=throttle.asc`);
            if (!ptsRes.ok) throw new Error("Failed to load test run data points");
            const dataPoints = await ptsRes.json();

            const pointsByRun = {};
            dataPoints.forEach(pt => {
                if (!pointsByRun[pt.test_run_id]) {
                    pointsByRun[pt.test_run_id] = [];
                }
                pointsByRun[pt.test_run_id].push(pt);
            });

            document.getElementById('profile-stat-runs').textContent = runs.length;
            
            let maxThrustVal = 0;
            let sumEff = 0;
            let countEff = 0;

            dataPoints.forEach(pt => {
                const thrustG = parseFloat(pt.thrust_g) || 0;
                if (thrustG > maxThrustVal) maxThrustVal = thrustG;

                const eff = parseFloat(pt.efficiency) || 0;
                if (eff > 0) {
                    sumEff += eff;
                    countEff++;
                }
            });

            document.getElementById('profile-stat-max-thrust').textContent = maxThrustVal > 0 ? `${(maxThrustVal / 1000).toFixed(2)} kg` : '-';
            document.getElementById('profile-stat-avg-eff').textContent = countEff > 0 ? `${(sumEff / countEff).toFixed(2)} g/W` : '-';

            runsList.innerHTML = '';
            runs.forEach((run, index) => {
                const runPts = pointsByRun[run.id] || [];
                const testedDate = new Date(run.tested_at).toLocaleDateString();
                const div = document.createElement('div');
                div.className = `test-run-item ${index === 0 ? 'active' : ''}`;
                div.dataset.id = run.id;
                div.innerHTML = `
                    <div class="test-run-info">
                        <div class="test-run-title">${run.propeller_model} prop / ${run.esc_model || 'No ESC'}</div>
                        <div class="test-run-meta">
                            <span><i data-lucide="zap"></i> ${run.battery_info || 'No Battery'}</span>
                            <span><i data-lucide="calendar"></i> ${testedDate}</span>
                        </div>
                    </div>
                    <div class="test-run-tester">${run.test_conducted_by || 'Unknown'}</div>
                `;

                div.onclick = () => {
                    runsList.querySelectorAll('.test-run-item').forEach(item => item.classList.remove('active'));
                    div.classList.add('active');
                    renderActiveRun(run, runPts);
                };

                runsList.appendChild(div);
            });

            if (runs.length > 0) {
                renderActiveRun(runs[0], pointsByRun[runs[0].id] || []);
            }

        } catch (e) {
            console.error("Error loading profile data:", e);
            runsList.innerHTML = '<div style="color:var(--danger-color); font-size:0.9rem; padding:10px;">Error loading telemetry.</div>';
        }

        lucide.createIcons();
    }

    function renderActiveRun(run, dataPoints) {
        const telemetryCard = document.getElementById('profile-telemetry-details-card');
        const telemetryEmpty = document.getElementById('profile-telemetry-empty-state');
        
        telemetryCard.style.display = 'block';
        telemetryEmpty.style.display = 'none';

        const testedDate = new Date(run.tested_at).toLocaleString();
        document.getElementById('active-run-title').textContent = `Run Telemetry: ${run.propeller_model} Prop / ${run.esc_model || 'No ESC'}`;
        document.getElementById('active-run-meta').textContent = `Conducted by ${run.test_conducted_by || 'Unknown'} on ${testedDate}. Setup: ${run.battery_info || 'Unknown'}.`;

        const tbody = document.getElementById('profile-telemetry-rows');
        tbody.innerHTML = '';
        
        dataPoints.forEach(pt => {
            const tr = document.createElement('tr');
            let throttlePercent = parseFloat(pt.throttle);
            if (throttlePercent <= 1.0) {
                throttlePercent = Math.round(throttlePercent * 100);
            } else {
                throttlePercent = Math.round(throttlePercent);
            }
            
            const eff = parseFloat(pt.efficiency) || 0;
            const temp = parseFloat(pt.temperature);
            const tempStr = (pt.temperature !== null && pt.temperature !== undefined) ? `${temp.toFixed(1)}` : '-';
            
            tr.innerHTML = `
                <td><strong>${throttlePercent}%</strong></td>
                <td>${parseFloat(pt.voltage || 0).toFixed(1)} V</td>
                <td>${parseFloat(pt.current || 0).toFixed(1)} A</td>
                <td>${parseFloat(pt.power || 0).toFixed(0)} W</td>
                <td><strong>${parseFloat(pt.thrust_g || 0).toFixed(0)} g</strong></td>
                <td>${parseFloat(pt.rpm || 0).toFixed(0)}</td>
                <td>${eff > 0 ? eff.toFixed(2) : '-'}</td>
                <td>${tempStr}</td>
            `;
            tbody.appendChild(tr);
        });

        renderTelemetryCharts(dataPoints);
    }

    function createTelemetryScatterChart(canvasId, xLabel, yLabel, dataPointsObj, xKey, yKey, yMin, yMax) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        
        const chartData = dataPointsObj.map(pt => ({
            x: pt[xKey],
            y: pt[yKey]
        }));

        return new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    data: chartData,
                    backgroundColor: '#f59e0b',
                    borderColor: '#f59e0b',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    showLine: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `X: ${context.parsed.x.toFixed(1)}, Y: ${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: xLabel,
                            font: { family: 'Inter', size: 9, weight: '500' },
                            color: '#64748b'
                        },
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { family: 'Inter', size: 8 }, color: '#64748b' }
                    },
                    y: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: yLabel,
                            font: { family: 'Inter', size: 9, weight: '500' },
                            color: '#64748b'
                        },
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { family: 'Inter', size: 8 }, color: '#64748b' },
                        min: yMin,
                        max: yMax
                    }
                }
            }
        });
    }

    function renderTelemetryCharts(dataPoints) {
        destroyProfileCharts();

        if (!dataPoints || dataPoints.length === 0) return;

        // Process data points
        const processedPoints = dataPoints.map((pt, index) => {
            const throttleVal = parseFloat(pt.throttle) || 0;
            const throttleUs = throttleVal <= 1.0 ? 1000 + throttleVal * 1000 : 1000 + (throttleVal / 100.0) * 1000;
            const timeS = index * 5;
            const rpmVal = parseFloat(pt.rpm) || 0;
            const thrustG = parseFloat(pt.thrust_g) || 0;
            const thrustKgf = thrustG / 1000.0;
            const powerElec = parseFloat(pt.power) || (parseFloat(pt.voltage) * parseFloat(pt.current)) || 0;
            const powerMech = powerElec * 0.82;
            const torqueNm = rpmVal > 0 ? (9.5488 * powerMech) / rpmVal : 0;
            const voltageVal = parseFloat(pt.voltage) || 0;
            const currentVal = parseFloat(pt.current) || 0;
            
            let motorEscEff = 0;
            if (powerElec > 0) {
                const throttlePercent = throttleVal <= 1.0 ? throttleVal : throttleVal / 100.0;
                motorEscEff = 75 + (10 - Math.abs(throttlePercent - 0.7) * 20);
                if (motorEscEff < 60) motorEscEff = 60;
                if (motorEscEff > 85) motorEscEff = 85;
            }
            
            const propEff = parseFloat(pt.efficiency) || (powerElec > 0 ? thrustG / powerElec : 0);
            const systemEff = propEff * 0.85;

            return {
                time: timeS,
                throttleUs: throttleUs,
                rpm: rpmVal,
                thrustKgf: thrustKgf,
                torque: torqueNm,
                voltage: voltageVal,
                current: currentVal,
                powerElec: powerElec,
                powerMech: powerMech,
                motorEscEff: motorEscEff,
                propEff: propEff,
                systemEff: systemEff
            };
        });

        // 1. Throttle vs Time
        profileCharts.throttleTime = createTelemetryScatterChart(
            'profileChartThrottleTime', 'Time (s)', 'Throttle (μs)', 
            processedPoints, 'time', 'throttleUs', 900, 2100
        );

        // 2. Rotation speed vs Time
        profileCharts.rpmTime = createTelemetryScatterChart(
            'profileChartRpmTime', 'Time (s)', 'Rotation speed (rpm)', 
            processedPoints, 'time', 'rpm', 0, undefined
        );

        // 3. Thrust vs Rotation speed
        profileCharts.thrustRpm = createTelemetryScatterChart(
            'profileChartThrustRpm', 'Rotation speed (rpm)', 'Thrust (kgf)', 
            processedPoints, 'rpm', 'thrustKgf', 0, undefined
        );

        // 4. Torque vs Rotation speed
        profileCharts.torqueRpm = createTelemetryScatterChart(
            'profileChartTorqueRpm', 'Rotation speed (rpm)', 'Torque (N·m)', 
            processedPoints, 'rpm', 'torque', 0, undefined
        );

        // 5. Voltage vs Rotation speed
        profileCharts.voltageRpm = createTelemetryScatterChart(
            'profileChartVoltageRpm', 'Rotation speed (rpm)', 'Voltage (V)', 
            processedPoints, 'rpm', 'voltage', 0, undefined
        );

        // 6. Current vs Rotation speed
        profileCharts.currentRpm = createTelemetryScatterChart(
            'profileChartCurrentRpm', 'Rotation speed (rpm)', 'Current (A)', 
            processedPoints, 'rpm', 'current', 0, undefined
        );

        // 7. Electrical power vs Rotation speed
        profileCharts.elecPowerRpm = createTelemetryScatterChart(
            'profileChartElecPowerRpm', 'Rotation speed (rpm)', 'Electrical power (W)', 
            processedPoints, 'rpm', 'powerElec', 0, undefined
        );

        // 8. Mechanical power vs Rotation speed
        profileCharts.mechPowerRpm = createTelemetryScatterChart(
            'profileChartMechPowerRpm', 'Rotation speed (rpm)', 'Mechanical power (W)', 
            processedPoints, 'rpm', 'powerMech', 0, undefined
        );

        // 9. Motor & ESC efficiency
        profileCharts.motorEffRpm = createTelemetryScatterChart(
            'profileChartMotorEffRpm', 'Rotation speed (rpm)', 'Motor & ESC efficiency (%)', 
            processedPoints, 'rpm', 'motorEscEff', 0, 100
        );

        // 10. Propeller efficiency
        profileCharts.propEffRpm = createTelemetryScatterChart(
            'profileChartPropEffRpm', 'Rotation speed (rpm)', 'Propeller efficiency (gf/W)', 
            processedPoints, 'rpm', 'propEff', 0, undefined
        );

        // 11. Propulsion system efficiency
        profileCharts.systemEffRpm = createTelemetryScatterChart(
            'profileChartSystemEffRpm', 'Rotation speed (rpm)', 'Propulsion system efficiency (gf/W)', 
            processedPoints, 'rpm', 'systemEff', 0, undefined
        );
    }
    
    // Fetch and render hardware system statistics (CPU, RAM) dynamically
    async function fetchSystemStats() {
        try {
            const res = await fetch('/api/admin/statistics');
            if (!res.ok) throw new Error("Failed to fetch system statistics");
            const data = await res.json();
            
            const cpuValEl = document.getElementById('kpi-cpu-usage-val');
            const cpuFooterEl = document.getElementById('kpi-cpu-usage-footer');
            if (cpuValEl) {
                cpuValEl.textContent = `${data.cpu_load_percent.toFixed(1)}%`;
            }
            if (cpuFooterEl) {
                cpuFooterEl.textContent = `Load avg: ${data.cpu_load.map(l => l.toFixed(2)).join(', ')}`;
            }
            
            const ramValEl = document.getElementById('kpi-ram-usage-val');
            const ramFooterEl = document.getElementById('kpi-ram-usage-footer');
            if (ramValEl) {
                ramValEl.textContent = `${data.ram_percent.toFixed(1)}%`;
            }
            if (ramFooterEl) {
                ramFooterEl.textContent = `${data.ram_used_gb.toFixed(1)} / ${data.ram_total_gb.toFixed(1)} GB`;
            }
        } catch (err) {
            console.error("Error fetching system stats:", err);
        }
    }

    // Init App
    async function init() {
        try {
            const userEmail = session.email;
            const emailEl = document.getElementById('session-email');
            if (emailEl) emailEl.textContent = userEmail;
            const avatarInit = document.getElementById('user-avatar-initials');
            if (avatarInit && userEmail) {
                avatarInit.textContent = userEmail.charAt(0).toUpperCase();
            }

            await fetchData();
            await fetchAccessRequestsCount();
            
            // Initial call and periodic interval for system resource metrics
            await fetchSystemStats();
            setInterval(fetchSystemStats, 5000);

            // Check if we need to trigger the add category modal
            const triggerAddCat = sessionStorage.getItem('triggerAddCategory');
            if (triggerAddCat === 'true') {
                sessionStorage.removeItem('triggerAddCategory');
                elements.catForm.reset();
                openModal(elements.catModal);
            }
        } catch (e) {
            console.error("Initialization failed", e);
            await logoutAndRedirect();
        }
    }

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
        renderSidebar();

        if (elements.btnAddCat) {
            elements.btnAddCat.onclick = (e) => {
                e.preventDefault();
                elements.catForm.reset();
                openModal(elements.catModal);
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

    if (window.sidebarLoaded) {
        setupSidebar();
    } else {
        window.addEventListener('sidebarLoaded', setupSidebar);
    }
});
