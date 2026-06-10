// guest_app.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Validate user is guest
    const session = JSON.parse(localStorage.getItem('thrustvault_session'));
    if (!session || session.role !== 'guest') {
        localStorage.removeItem('thrustvault_session');
        window.location.href = 'index.html';
        return;
    }

    // Set email display in footer
    const email = session.email || '';
    document.getElementById('session-email').textContent = email;

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

    let supabase = null;

    // DOM Elements
    const elements = {
        catList: document.getElementById('category-list-container'),
        motorsTableBody: document.getElementById('motors-list-rows'),
        totalMotors: document.getElementById('total-motors-count'),
        totalCats: document.getElementById('total-categories-count'),
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
        
        // Modals & Drawers
        comparisonModal: document.getElementById('comparison-modal'),
        comparisonDrawer: document.getElementById('comparison-drawer'),
        compareItemsContainer: document.getElementById('compare-items-container'),
        compareCount: document.getElementById('compare-count'),
        comparisonResultTable: document.getElementById('comparison-result-table'),
        
        // Buttons
        btnCompareNow: document.getElementById('btn-compare-now'),
        btnClearComparison: document.getElementById('btn-clear-comparison'),
        btnCloseComparison: document.getElementById('btn-close-comparison'),
        btnLogout: document.getElementById('btn-logout'),
        
        // Search & Filters
        searchInput: document.getElementById('search-input'),
        searchClear: document.getElementById('search-clear'),
        filterCompanySelect: document.getElementById('filter-company'),
        sortSelect: document.getElementById('sort-select'),
        
        // Verification Notes
        verificationNotesSection: document.getElementById('verification-notes-section'),
        verificationNotesToggle: document.getElementById('verification-notes-toggle'),
        verificationNotesBody: document.getElementById('verification-notes-rows')
    };

    // Static Official Verification Notes mapping
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

    // Data Fetching from Supabase
    async function fetchData() {
        try {
            // Fetch categories ordered by name
            const { data: categories, error: catError } = await supabase
                .from('categories')
                .select('*')
                .order('name');
                
            if (catError) throw catError;
            
            state.categories = (categories || []).map(c => ({
                id: c.id,
                name: c.name,
                desc: c.description
            }));
            
            // Fetch motors
            const { data: motors, error: motorError } = await supabase
                .from('motors')
                .select('*');
                
            if (motorError) throw motorError;
            
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
                custom_parameters: m.custom_parameters || {}
            }));

            // Fetch dynamic schema custom definitions
            let customSchema = [];
            try {
                const { data, error } = await supabase
                    .from('custom_specs_schema')
                    .select('*')
                    .order('created_at');
                if (!error && data) {
                    customSchema = data;
                } else {
                    throw error || new Error("Failed to load schema from Supabase");
                }
            } catch (err) {
                console.warn("Falling back to localStorage for custom schema:", err);
                customSchema = JSON.parse(localStorage.getItem('thrustvault_custom_specs')) || [];
            }
            state.customSchema = customSchema;
            
            if (state.categories.length > 0) {
                if (!state.activeCategory || !state.categories.some(c => c.id === state.activeCategory)) {
                    state.activeCategory = state.categories[0].id;
                }
            } else {
                state.activeCategory = null;
            }
            
            renderApp();
        } catch (e) {
            console.error("Error fetching data from Supabase:", e);
        }
    }

    function renderApp() {
        renderSidebar();
        renderMainContent();
        renderCharts();
        updateStats();
        updateComparisonDrawer();
        lucide.createIcons();
    }

    function updateStats() {
        elements.totalMotors.textContent = state.motors.length;
        elements.totalCats.textContent = state.categories.length;
    }

    // Sidebar Category Rendering
    function renderSidebar() {
        elements.catList.innerHTML = '';
        state.categories.forEach(cat => {
            const count = state.motors.filter(m => m.categoryId === cat.id).length;
            const div = document.createElement('div');
            div.className = `category-tab ${state.activeCategory === cat.id ? 'active' : ''}`;
            div.innerHTML = `
                <span>${cat.name}</span>
                <span class="cat-count">${count}</span>
            `;
            
            div.onclick = () => {
                state.activeCategory = cat.id;
                state.filterCompany = 'all';
                state.searchQuery = '';
                elements.searchInput.value = '';
                elements.searchClear.style.display = 'none';
                renderApp();
            };
            
            elements.catList.appendChild(div);
        });
    }

    // Main Content Rendering
    function renderMainContent() {
        const cat = state.categories.find(c => c.id === state.activeCategory);
        if(!cat) {
            elements.catBadge.textContent = "N/A";
            elements.catTitle.textContent = "No Category Selected";
            elements.catDesc.textContent = "There are no motor categories loaded in the database.";
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
        
        // Update Brand Filter Dropdown Options
        updateBrandFilterOptions(catMotors);
        
        // Apply Filters
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
        
        // Update Quick Stats
        calculateCategoryQuickStats(catMotors);
        
        elements.filteredCountBadge.textContent = `${filteredMotors.length} displayed`;
        
        // Show/Hide Empty State
        if (filteredMotors.length === 0) {
            elements.tableEmptyState.style.display = 'block';
            document.getElementById('motors-data-table').style.display = 'none';
        } else {
            elements.tableEmptyState.style.display = 'none';
            document.getElementById('motors-data-table').style.display = 'table';
        }
        
        // Render rows without editing/deleting controls
        elements.motorsTableBody.innerHTML = '';
        filteredMotors.forEach((m) => {
            const tr = document.createElement('tr');
            const isChecked = state.compareItems.includes(m.id);
            
            const links = [];
            if (m.linkMotor) {
                links.push(`<a href="${sanitizeUrl(m.linkMotor)}" target="_blank" title="Motor Specs"><i data-lucide="cpu"></i></a>`);
            }
            if (m.linkEsc) {
                links.push(`<a href="${sanitizeUrl(m.linkEsc)}" target="_blank" title="ESC Specs"><i data-lucide="zap"></i></a>`);
            }
            if (m.linkProp) {
                links.push(`<a href="${sanitizeUrl(m.linkProp)}" target="_blank" title="Propeller Specs"><i data-lucide="wind"></i></a>`);
            }
            const linksHtml = links.length > 0 ? links.join(' ') : '-';
            
            tr.innerHTML = `
                <td><input type="checkbox" class="compare-cb" data-id="${m.id}" ${isChecked ? 'checked' : ''}></td>
                <td><a href="#" class="motor-profile-link" data-id="${m.id}"><strong>${escapeHTML(m.motor)}</strong></a></td>
                <td>${escapeHTML(m.company)}</td>
                <td><span class="badge-thrust">${escapeHTML(m.thrust)}</span></td>
                <td>${escapeHTML(m.esc || '-')}</td>
                <td>${escapeHTML(m.prop || '-')}</td>
                <td><div class="action-links">${linksHtml}</div></td>
            `;
            elements.motorsTableBody.appendChild(tr);
        });
        
        // Checkbox binding
        bindRowActions();
        
        // Notes Panel
        renderVerificationNotes(cat.name);
    }

    function bindRowActions() {
        elements.motorsTableBody.querySelectorAll('.compare-cb').forEach(cb => {
            cb.onchange = () => {
                const id = cb.dataset.id;
                if (cb.checked) {
                    if (state.compareItems.length >= 3) {
                        alert("You can compare a maximum of 3 motors.");
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
    }

    // Modal Compare
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
        openModal(elements.comparisonModal);
        lucide.createIcons();
    };

    // Table Select All
    elements.selectAllMotors.onchange = () => {
        const visibleCbs = elements.motorsTableBody.querySelectorAll('.compare-cb');
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

    function renderCharts() {
        const catMotors = state.motors.filter(m => m.categoryId === state.activeCategory);
        const companies = {};
        catMotors.forEach(m => { companies[m.company] = (companies[m.company] || 0) + 1; });
        
        const ctx1 = document.getElementById('manufacturerChart');
        if(state.chartInstances.company) state.chartInstances.company.destroy();
        
        if (ctx1 && catMotors.length > 0) {
            state.chartInstances.company = new Chart(ctx1, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(companies),
                    datasets: [{
                        data: Object.values(companies),
                        backgroundColor: ['#2563eb', '#059669', '#3b82f6', '#10b981', '#60a5fa', '#34d399', '#93c5fd', '#a7f3d0'],
                        borderWidth: 1.5,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                color: '#475569',
                                font: { family: "'Inter', sans-serif", size: 11, weight: '500' },
                                boxWidth: 12,
                                padding: 12
                            }
                        }
                    }
                }
            });
        }

        const ctx2 = document.getElementById('thrustDistributionChart');
        if(state.chartInstances.thrust) state.chartInstances.thrust.destroy();
        
        if (ctx2 && catMotors.length > 0) {
            const sorted = [...catMotors].sort((a, b) => parseThrustToKg(a.thrust) - parseThrustToKg(b.thrust));
            const canvasCtx = ctx2.getContext('2d');
            let gradient = '#2563eb';
            if (canvasCtx) {
                gradient = canvasCtx.createLinearGradient(0, 0, 0, 200);
                gradient.addColorStop(0, '#2563eb');
                gradient.addColorStop(1, '#60a5fa');
            }
            state.chartInstances.thrust = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: sorted.map(m => m.motor),
                    datasets: [{
                        label: 'Max Thrust (kg)',
                        data: sorted.map(m => parseThrustToKg(m.thrust)),
                        backgroundColor: gradient,
                        borderColor: '#2563eb',
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#e2e8f0' },
                            ticks: {
                                color: '#475569',
                                font: { family: "'Inter', sans-serif", size: 10 }
                            }
                        },
                        x: {
                            grid: { display: false },
                            ticks: {
                                color: '#475569',
                                font: { family: "'Inter', sans-serif", size: 10 }
                            }
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    }

    // Event Listeners
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

    function levenshtein(a, b) {
        const m = a.length, n = b.length;
        const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
            }
        }
        return dp[m][n];
    }

    function scoreMotor(motor, query) {
        const q = query.toLowerCase().trim();
        if (!q) return -1;
        const fields = [motor.motor || '', motor.company || '', motor.esc || '', motor.prop || ''];
        const haystack = fields.join(' ').toLowerCase();
        const motorLower = (motor.motor || '').toLowerCase();
        const companyLower = (motor.company || '').toLowerCase();
        let score = 0;
        if (motorLower.startsWith(q)) score += 100;
        else if (motorLower.includes(q)) score += 70;
        else if (companyLower.includes(q)) score += 50;
        else if (haystack.includes(q)) score += 30;
        const queryTokens = q.split(/\s+/);
        const motorTokens = haystack.split(/\s+/);
        queryTokens.forEach(qt => {
            if (!qt) return;
            motorTokens.forEach(mt => {
                if (mt.startsWith(qt)) score += 20;
                else if (mt.includes(qt)) score += 10;
                else {
                    const maxDist = qt.length > 7 ? 2 : qt.length > 4 ? 1 : 0;
                    const dist = levenshtein(qt, mt.substring(0, qt.length + 2));
                    if (dist <= maxDist) score += Math.max(5, 12 - dist * 4);
                }
            });
        });
        return score;
    }

    function escH(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function highlightMatch(text, query) {
        if (!query || !text) return escH(text || '');
        const escaped = escH(text);
        const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped.replace(new RegExp(`(${q})`, 'gi'), '<mark>$1</mark>');
    }

    function showSearchSuggestions(query) {
        activeSuggestionIndex = -1;
        const q = (query || '').trim();
        if (q.length < 1) { suggestionsEl.style.display = 'none'; return; }

        const scored = state.motors
            .map(m => { const cat = state.categories.find(c => c.id === m.categoryId); return { motor: m, cat, score: scoreMotor(m, q) }; })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);

        if (scored.length === 0) {
            suggestionsEl.innerHTML = `<div class="suggestion-no-results">No motors match "<strong>${escH(q)}</strong>"</div>`;
            suggestionsEl.style.display = 'block';
            return;
        }

        const items = scored.map((x, idx) => {
            const { motor: m, cat } = x;
            const catName = cat ? cat.name : 'Uncategorized';
            const initials = (m.motor || '?').charAt(0).toUpperCase();
            return `<div class="suggestion-item" data-idx="${idx}" data-motor-id="${escH(m.id)}" data-cat-id="${escH(m.categoryId)}">
                <div class="suggestion-item-icon">${initials}</div>
                <div class="suggestion-item-body">
                    <div class="suggestion-motor-name">${highlightMatch(m.motor, q)}</div>
                    <div class="suggestion-motor-meta">${highlightMatch(m.company, q)}${m.esc ? ' &nbsp;·&nbsp; ESC: ' + escH(m.esc) : ''}</div>
                </div>
                <span class="suggestion-thrust-badge">${escH(catName)}</span>
            </div>`;
        }).join('');

        suggestionsEl.innerHTML = `<div class="suggestion-header">Suggestions &nbsp;·&nbsp; ${scored.length} match${scored.length !== 1 ? 'es' : ''} across all categories</div>${items}`;
        suggestionsEl.style.display = 'block';

        suggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const catId = item.dataset.catId;
                const motorName = scored[parseInt(item.dataset.idx)].motor.motor;
                if (catId && catId !== state.activeCategory) {
                    state.activeCategory = catId;
                    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                    const catBtn = document.querySelector(`.category-btn[data-cat-id="${catId}"]`);
                    if (catBtn) catBtn.classList.add('active');
                }
                elements.searchInput.value = motorName;
                state.searchQuery = motorName;
                elements.searchClear.style.display = 'block';
                suggestionsEl.style.display = 'none';
                renderMainContent();
            });
        });
    }

    elements.searchInput.addEventListener('keydown', (e) => {
        const items = suggestionsEl.querySelectorAll('.suggestion-item');
        if (suggestionsEl.style.display === 'none' || items.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, -1); }
        else if (e.key === 'Enter' && activeSuggestionIndex >= 0) { e.preventDefault(); items[activeSuggestionIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return; }
        else if (e.key === 'Escape') { suggestionsEl.style.display = 'none'; activeSuggestionIndex = -1; return; }
        items.forEach((item, i) => item.classList.toggle('active', i === activeSuggestionIndex));
        if (activeSuggestionIndex >= 0) items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
    });

    document.addEventListener('click', (e) => {
        if (!elements.searchInput.contains(e.target) && !suggestionsEl.contains(e.target)) {
            suggestionsEl.style.display = 'none'; activeSuggestionIndex = -1;
        }
    });

    elements.searchInput.addEventListener('focus', () => {
        if (elements.searchInput.value.trim().length >= 1) showSearchSuggestions(elements.searchInput.value);
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

    // Modals
    function openModal(modal) { modal.classList.add('show'); }
    function closeModal(modal) { modal.classList.remove('show'); }
    document.querySelectorAll('.modal-close-trigger').forEach(btn => {
        btn.onclick = (e) => closeModal(e.target.closest('.modal-backdrop'));
    });

    // Logout
    elements.btnLogout.onclick = () => {
        logoutAndRedirect();
    };

    // Logout and redirect helper
    function logoutAndRedirect() {
        if (session) {
            logUserActivity(session.email, session.role, 'Logout', 'Logged out successfully.');
        }
        if (supabase) {
            supabase.auth.signOut().catch(e => console.error("SignOut error:", e));
        }
        localStorage.removeItem('thrustvault_session');
        // Clear cookie
        document.cookie = 'thrustvault_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict; Secure';
        window.location.href = 'index.html';
    }

    // =========================================================================
    // MOTOR PROFILE & TELEMETRY CHARTS CONTROLLER
    // =========================================================================
    let profileCharts = {
        thrustEff: null,
        currentRpm: null
    };

    // Bind back button
    const backBtn = document.getElementById('btn-profile-back');
    if (backBtn) {
        backBtn.onclick = () => {
            const overlay = document.getElementById('motor-profile-overlay');
            overlay.style.display = 'none';
            if (profileCharts.thrustEff) {
                profileCharts.thrustEff.destroy();
                profileCharts.thrustEff = null;
            }
            if (profileCharts.currentRpm) {
                profileCharts.currentRpm.destroy();
                profileCharts.currentRpm = null;
            }
        };
    }

    async function showMotorProfile(motorId) {
        const m = state.motors.find(x => x.id === motorId);
        if (!m) return;

        const overlay = document.getElementById('motor-profile-overlay');
        overlay.style.display = 'flex';

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

        if (profileCharts.thrustEff) {
            profileCharts.thrustEff.destroy();
            profileCharts.thrustEff = null;
        }
        if (profileCharts.currentRpm) {
            profileCharts.currentRpm.destroy();
            profileCharts.currentRpm = null;
        }

        try {
            const { data: runs, error: runsError } = await supabase
                .from('motor_test_runs')
                .select('*')
                .eq('motor_id', motorId)
                .order('tested_at', { ascending: false });

            if (runsError) throw runsError;

            if (!runs || runs.length === 0) {
                runsList.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem; padding:10px; font-style:italic;">No test runs found.</div>';
                lucide.createIcons();
                return;
            }

            const runIds = runs.map(r => r.id);
            const { data: dataPoints, error: pointsError } = await supabase
                .from('motor_test_data_points')
                .select('*')
                .in('test_run_id', runIds)
                .order('throttle', { ascending: true });

            if (pointsError) throw pointsError;

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

    function renderTelemetryCharts(dataPoints) {
        if (profileCharts.thrustEff) {
            profileCharts.thrustEff.destroy();
            profileCharts.thrustEff = null;
        }
        if (profileCharts.currentRpm) {
            profileCharts.currentRpm.destroy();
            profileCharts.currentRpm = null;
        }

        const labels = dataPoints.map(pt => {
            let throttle = parseFloat(pt.throttle);
            return throttle <= 1.0 ? `${Math.round(throttle * 100)}%` : `${Math.round(throttle)}%`;
        });
        const thrusts = dataPoints.map(pt => parseFloat(pt.thrust_g) || 0);
        const efficiencies = dataPoints.map(pt => parseFloat(pt.efficiency) || 0);
        const currents = dataPoints.map(pt => parseFloat(pt.current) || 0);
        const rpms = dataPoints.map(pt => parseFloat(pt.rpm) || 0);

        const ctx1 = document.getElementById('profileThrustEffChart');
        if (ctx1) {
            profileCharts.thrustEff = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Thrust (g)',
                            data: thrusts,
                            borderColor: '#2563eb',
                            backgroundColor: 'rgba(37, 99, 235, 0.05)',
                            yAxisID: 'yThrust',
                            tension: 0.2,
                            fill: true
                        },
                        {
                            label: 'Efficiency (g/W)',
                            data: efficiencies,
                            borderColor: '#10b981',
                            backgroundColor: 'transparent',
                            yAxisID: 'yEff',
                            tension: 0.2,
                            borderDash: [5, 5]
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        yThrust: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'Thrust (g)', font: { family: 'Inter', weight: '600', size: 10 } },
                            grid: { color: '#f1f5f9' }
                        },
                        yEff: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: { display: true, text: 'Efficiency (g/W)', font: { family: 'Inter', weight: '600', size: 10 } },
                            grid: { drawOnChartArea: false }
                        },
                        x: {
                            grid: { display: false }
                        }
                    },
                    plugins: {
                        legend: { position: 'top', labels: { boxWidth: 12, font: { family: 'Inter', size: 10 } } }
                    }
                }
            });
        }

        const ctx2 = document.getElementById('profileCurrentRpmChart');
        if (ctx2) {
            profileCharts.currentRpm = new Chart(ctx2, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Current (A)',
                            data: currents,
                            borderColor: '#f43f5e',
                            backgroundColor: 'rgba(244, 63, 94, 0.05)',
                            yAxisID: 'yCurrent',
                            tension: 0.2,
                            fill: true
                        },
                        {
                            label: 'RPM',
                            data: rpms,
                            borderColor: '#8b5cf6',
                            backgroundColor: 'transparent',
                            yAxisID: 'yRpm',
                            tension: 0.2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        yCurrent: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'Current (A)', font: { family: 'Inter', weight: '600', size: 10 } },
                            grid: { color: '#f1f5f9' }
                        },
                        yRpm: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: { display: true, text: 'RPM', font: { family: 'Inter', weight: '600', size: 10 } },
                            grid: { drawOnChartArea: false }
                        },
                        x: {
                            grid: { display: false }
                        }
                    },
                    plugins: {
                        legend: { position: 'top', labels: { boxWidth: 12, font: { family: 'Inter', size: 10 } } }
                    }
                }
            });
        }
    }

    // Init App
    async function init() {
        try {
            const res = await fetch('/api/config');
            const config = await res.json();
            supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
            
            // Check active session with Supabase
            const { data: { session: sbSession }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sbSession) {
                console.warn("No active Supabase session found.");
                await logoutAndRedirect();
                return;
            }

            // Verify user profile role from DB
            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('role')
                .eq('id', sbSession.user.id)
                .single();

            if (profileError || !profile || profile.role !== 'guest') {
                console.error("Session verification failed: invalid profile or role mismatch.");
                await logoutAndRedirect();
                return;
            }

            // Sync local storage session
            const sessionData = {
                email: sbSession.user.email,
                role: profile.role,
                uid: sbSession.user.id,
                token: sbSession.access_token,
                timestamp: new Date().getTime()
            };
            localStorage.setItem('thrustvault_session', JSON.stringify(sessionData));
            const userEmail = sbSession.user.email;
            document.getElementById('session-email').textContent = userEmail;
            const avatarInit = document.getElementById('user-avatar-initials');
            if (avatarInit && userEmail) {
                avatarInit.textContent = userEmail.charAt(0).toUpperCase();
            }

            await fetchData();
        } catch (e) {
            console.error("Initialization failed", e);
            await logoutAndRedirect();
        }
    }

    init();
});
