// app.js
document.addEventListener('DOMContentLoaded', () => {
    // Initialize icons
    lucide.createIcons();

    let state = {
        motors: [],
        categories: [],
        activeCategory: null,
        searchQuery: '',
        filterCompany: 'all',
        sortBy: 'motor-asc',
        compareItems: [], // List of motor IDs
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
        motorModal: document.getElementById('motor-modal'),
        catModal: document.getElementById('category-modal'),
        confirmModal: document.getElementById('confirm-modal'),
        comparisonModal: document.getElementById('comparison-modal'),
        comparisonDrawer: document.getElementById('comparison-drawer'),
        compareItemsContainer: document.getElementById('compare-items-container'),
        compareCount: document.getElementById('compare-count'),
        comparisonResultTable: document.getElementById('comparison-result-table'),
        
        // Buttons
        btnAddMotor: document.getElementById('btn-add-motor'),
        btnAddCat: document.getElementById('btn-add-category'),
        btnCompareNow: document.getElementById('btn-compare-now'),
        btnClearComparison: document.getElementById('btn-clear-comparison'),
        btnCloseComparison: document.getElementById('btn-close-comparison'),
        
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
        btnDownloadTemplate: document.getElementById('btn-download-template')
    };

    // Static Official Verification Notes mapping by Category Name
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

    // Helper: Parse thrust strings (e.g., "20.4 kg", "380g", "2400 g") to numerical kg
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
                linkProp: m.link_propeller
            }));
            
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
        updateManufacturerSuggestions();
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
                <div style="display:flex; align-items:center; gap:5px;">
                    <span class="cat-count">${count}</span>
                    <button class="btn-delete-cat" data-id="${cat.id}" title="Delete Category"><i data-lucide="trash-2" style="width:14px;"></i></button>
                </div>
            `;
            
            div.onclick = (e) => {
                if(e.target.closest('.btn-delete-cat')) return;
                state.activeCategory = cat.id;
                // Reset search and filters on category switch
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
                        const { error } = await supabase
                            .from('categories')
                            .delete()
                            .eq('id', cat.id);
                        if (error) throw error;
                        
                        // Clean comparison items that belong to deleted category motors
                        const remainingMotors = state.motors.filter(m => m.categoryId !== cat.id);
                        state.compareItems = state.compareItems.filter(id => remainingMotors.some(m => m.id === id));
                        
                        if (state.activeCategory === cat.id) {
                            state.activeCategory = null;
                        }
                        await fetchData();
                    } catch (err) {
                        console.error("Error deleting category:", err);
                        alert("Failed to delete category: " + err.message);
                    }
                }
            };
            elements.catList.appendChild(div);
        });
        
        // Update Category Select in Add/Edit Modal
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
            elements.verificationNotesSection.style.display = 'none';
            return;
        }
        
        elements.catBadge.textContent = cat.name;
        elements.catTitle.textContent = `${cat.name} Class`;
        elements.catDesc.textContent = cat.desc || `${cat.name} Thrust Stand Motors`;
        
        const catMotors = state.motors.filter(m => m.categoryId === cat.id);
        
        // Update Brand Filter Dropdown Options dynamically
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
        
        // Update Category Quick Stats
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
        
        // Render rows
        elements.motorsTableBody.innerHTML = '';
        filteredMotors.forEach((m) => {
            const tr = document.createElement('tr');
            const isChecked = state.compareItems.includes(m.id);
            
            // Build reference links beautifully
            const links = [];
            if (m.linkMotor) {
                links.push(`<a href="${m.linkMotor}" target="_blank" title="Motor Specs Link"><i data-lucide="cpu"></i></a>`);
            }
            if (m.linkEsc) {
                links.push(`<a href="${m.linkEsc}" target="_blank" title="ESC Specs Link"><i data-lucide="zap"></i></a>`);
            }
            if (m.linkProp) {
                links.push(`<a href="${m.linkProp}" target="_blank" title="Prop Specs Link"><i data-lucide="wind"></i></a>`);
            }
            const linksHtml = links.length > 0 ? links.join(' ') : '-';
            
            tr.innerHTML = `
                <td><input type="checkbox" class="compare-cb" data-id="${m.id}" ${isChecked ? 'checked' : ''}></td>
                <td><strong>${m.motor}</strong></td>
                <td>${m.company}</td>
                <td><span class="badge-thrust">${m.thrust}</span></td>
                <td>${m.esc || '-'}</td>
                <td>${m.prop || '-'}</td>
                <td><div class="action-links">${linksHtml}</div></td>
                <td class="row-actions">
                    <button class="btn-edit" data-id="${m.id}" title="Edit Specifications"><i data-lucide="edit-2"></i></button>
                    <button class="btn-delete" data-id="${m.id}" title="Delete Motor"><i data-lucide="trash-2"></i></button>
                </td>
            `;
            elements.motorsTableBody.appendChild(tr);
        });
        
        // Handle "Select All" checkbox state
        const allCbs = elements.motorsTableBody.querySelectorAll('.compare-cb');
        if (allCbs.length > 0 && Array.from(allCbs).every(cb => cb.checked)) {
            elements.selectAllMotors.checked = true;
        } else {
            elements.selectAllMotors.checked = false;
        }
        
        // Bind Actions
        bindRowActions();
        
        // Render Official Verification Notes
        renderVerificationNotes(cat.name);
    }

    // Bind checkboxes, edit, and delete buttons inside table
    function bindRowActions() {
        // Compare checkboxes
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

        // Delete motor button
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
                        const { error } = await supabase
                            .from('motors')
                            .delete()
                            .eq('id', motorId);
                        if (error) throw error;
                        
                        state.compareItems = state.compareItems.filter(id => id !== motorId);
                        await fetchData();
                    } catch (err) {
                        console.error("Error deleting motor:", err);
                        alert("Failed to delete motor: " + err.message);
                    }
                }
            };
        });
        
        // Edit motor button
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
                openModal(elements.motorModal);
                lucide.createIcons();
            };
        });
    }

    // Dynamic Brand Filter Options builder
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

    // Calculate Average Thrust & Brand Distribution Leader
    function calculateCategoryQuickStats(catMotors) {
        if (catMotors.length > 0) {
            // Average Thrust
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
            
            // Leading Brand
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

    // Official Verification Notes Panel Renderer
    function renderVerificationNotes(categoryName) {
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

    // Side-by-Side Comparison Drawer & Modal Logic
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
            
            // Drawer items removal actions
            elements.compareItemsContainer.querySelectorAll('.btn-remove-compare').forEach(btn => {
                btn.onclick = () => {
                    const id = btn.dataset.id;
                    state.compareItems = state.compareItems.filter(item => item !== id);
                    updateComparisonDrawer();
                    // Sync main table checkboxes
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

    // Populate Comparison side-by-side spec grid
    if (elements.btnCompareNow) {
        elements.btnCompareNow.onclick = () => {
            if (state.compareItems.length === 0) return;
        const selected = state.compareItems.map(id => state.motors.find(m => m.id === id)).filter(Boolean);
        
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
    }
    };

    // Table Select All Change Listener
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

    // Render Premium Charts
    function renderCharts() {
        const catMotors = state.motors.filter(m => m.categoryId === state.activeCategory);
        
        // 1. Doughnut Chart: Manufacturer Distribution
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
                        backgroundColor: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'],
                        borderWidth: 1,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { font: { family: 'Inter', size: 11 } } },
                        title: {
                            display: true,
                            text: 'Motors by Brand',
                            color: '#1e293b',
                            font: { family: 'Outfit', size: 14, weight: '600' },
                            padding: { bottom: 10 }
                        }
                    }
                }
            });
        }

        // 2. Bar Chart: Thrust Distribution
        const ctx2 = document.getElementById('thrustDistributionChart');
        if(state.chartInstances.thrust) state.chartInstances.thrust.destroy();
        
        if (ctx2 && catMotors.length > 0) {
            const sorted = [...catMotors]
                .sort((a, b) => parseThrustToKg(b.thrust) - parseThrustToKg(a.thrust))
                .slice(0, 10);
            
            const canvasCtx = ctx2.getContext('2d');
            let gradient = '#2563eb';
            if (canvasCtx) {
                gradient = canvasCtx.createLinearGradient(0, 0, 400, 0);
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
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            beginAtZero: true,
                            title: { display: true, text: 'Max Thrust (kg)', font: { family: 'Inter', weight: '600' } },
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                font: { family: 'Inter', size: 10 }
                            }
                        },
                        y: {
                            grid: { display: false },
                            ticks: {
                                font: { family: 'Inter', size: 10 },
                                callback: function(value, index) {
                                    const label = this.getLabelForValue(value);
                                    if (typeof label === 'string' && label.length > 18) {
                                        return label.substring(0, 15) + '...';
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: 'Top 10 Motors by Max Thrust',
                            color: '#1e293b',
                            font: { family: 'Outfit', size: 14, weight: '600' },
                            padding: { bottom: 10 }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `Max Thrust: ${context.parsed.x.toFixed(2)} kg`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    // Search and Filters Event Listeners
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        elements.searchClear.style.display = state.searchQuery ? 'block' : 'none';
        renderMainContent();
    });
    
    elements.searchClear.addEventListener('click', () => {
        state.searchQuery = '';
        elements.searchInput.value = '';
        elements.searchClear.style.display = 'none';
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

    // Verification Notes Toggle Collapsible
    elements.verificationNotesToggle.onclick = () => {
        const body = document.getElementById('verification-notes-body');
        const chevron = elements.verificationNotesToggle.querySelector('.notes-chevron');
        if (body.style.display === 'none') {
            body.style.display = 'table-row-group';
            chevron.style.transform = 'rotate(0deg)';
        } else {
            body.style.display = 'none';
            chevron.style.transform = 'rotate(180deg)';
        }
    };

    // Dropdown Data Operations Toggle
    elements.importExportToggle.onclick = (e) => {
        e.stopPropagation();
        elements.importExportMenu.classList.toggle('show');
    };
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            elements.importExportMenu.classList.remove('show');
        }
    });

    // Export Data JSON
    elements.btnExportJSON.onclick = () => {
        const backup = {
            categories: state.categories,
            motors: state.motors
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thrustvault_backup_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        elements.importExportMenu.classList.remove('show');
    };

    // Export Data CSV
    elements.btnExportCSV.onclick = () => {
        const headers = ['Category Name', 'Category Description', 'Motor Model Name', 'Manufacturer', 'Max Thrust', 'Recommended ESC', 'Recommended Propeller', 'Motor Link', 'ESC Link', 'Propeller Link'];
        const rows = state.motors.map(m => {
            const cat = state.categories.find(c => c.id === m.categoryId);
            const catName = cat ? cat.name : '';
            const catDesc = cat ? cat.desc : '';
            return [
                catName,
                catDesc || '',
                m.motor,
                m.company,
                m.thrust,
                m.esc || '',
                m.prop || '',
                m.linkMotor || '',
                m.linkEsc || '',
                m.linkProp || ''
            ].map(val => `"${val.replace(/"/g, '""')}"`);
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thrustvault_catalog_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        elements.importExportMenu.classList.remove('show');
    };

    // Download Import CSV Template
    elements.btnDownloadTemplate.onclick = () => {
        const headers = ['Category Name', 'Category Description', 'Motor Model Name', 'Manufacturer', 'Max Thrust', 'Recommended ESC', 'Recommended Propeller', 'Motor Link', 'ESC Link', 'Propeller Link'];
        const sample = ['2 kg', 'Freestyle / Cinematic motors', 'F60 Pro V 1750KV', 'T-Motor', '2.1 kg', 'V45A 4-6S ESC', 'T5143S 3-Blade', 'https://shop.t-motor.com/goods.php?id=1037', '', ''];
        const csvContent = [headers.join(','), sample.map(v => `"${v}"`).join(',')].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'thrustvault_import_template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        elements.importExportMenu.classList.remove('show');
    };

    // Import File Selection
    elements.btnImportTrigger.onclick = () => {
        elements.fileImportInput.click();
        elements.importExportMenu.classList.remove('show');
    };

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
            const content = evt.target.result;
            try {
                if (file.name.endsWith('.json')) {
                    const parsed = JSON.parse(content);
                    await importJSONData(parsed);
                } else if (file.name.endsWith('.csv')) {
                    await importCSVData(content);
                } else {
                    alert("Unsupported format. Please select a .csv or .json file.");
                }
                elements.fileImportInput.value = '';
            } catch (err) {
                console.error("Import failed:", err);
                alert("Import failed: " + err.message);
            }
        };
        reader.readAsText(file);
    };

    // CSV String Parser (handles quotes and commas)
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
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                row.push("");
            } else if ((char === '\r' || char === '\n') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
                lines.push(row);
                row = [""];
            } else {
                row[row.length - 1] += char;
            }
        }
        if (row.length > 1 || row[0] !== "") {
            lines.push(row);
        }
        return lines;
    }

    // CSV Bulk Importer
    async function importCSVData(csvText) {
        const rows = parseCSV(csvText);
        if (rows.length < 2) throw new Error("Empty CSV file.");
        
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
            throw new Error("Missing required columns: Category Name, Motor Model Name, Manufacturer, Max Thrust");
        }
        
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
                const { data, error } = await supabase
                    .from('categories')
                    .insert([{ name: catName, description: catDesc }])
                    .select();
                    
                if (error) throw error;
                categoryId = data[0].id;
                categoryMap[catName.toLowerCase()] = categoryId;
                state.categories.push({ id: categoryId, name: catName, desc: catDesc });
            }
            
            const motorData = {
                category_id: categoryId,
                motor_name: row[nameIdx].trim(),
                company: row[companyIdx].trim(),
                max_thrust: row[thrustIdx].trim(),
                recommended_esc: escIdx !== -1 && row[escIdx] ? row[escIdx].trim() : null,
                recommended_propeller: propIdx !== -1 && row[propIdx] ? row[propIdx].trim() : null,
                link_motor: linkMotorIdx !== -1 && row[linkMotorIdx] ? row[linkMotorIdx].trim() : null,
                link_esc: linkEscIdx !== -1 && row[linkEscIdx] ? row[linkEscIdx].trim() : null,
                link_propeller: linkPropIdx !== -1 && row[linkPropIdx] ? row[linkPropIdx].trim() : null
            };
            
            const { error } = await supabase.from('motors').insert([motorData]);
            if (error) throw error;
            importCount++;
        }
        
        alert(`Successfully imported ${importCount} motor specifications!`);
        await fetchData();
    }

    // JSON Bulk Importer
    async function importJSONData(imported) {
        if (!imported.categories || !imported.motors) {
            throw new Error("Invalid structure. JSON must contain 'categories' and 'motors' arrays.");
        }
        
        let importCount = 0;
        const categoryMap = {};
        state.categories.forEach(c => { categoryMap[c.name.toLowerCase()] = c.id; });
        
        for (const cat of imported.categories) {
            const name = cat.name || cat.name;
            let newId = categoryMap[name.toLowerCase()];
            if (!newId) {
                const { data, error } = await supabase
                    .from('categories')
                    .insert([{ name: name, description: cat.desc || cat.description || '' }])
                    .select();
                if (error) throw error;
                newId = data[0].id;
                categoryMap[name.toLowerCase()] = newId;
                state.categories.push({ id: newId, name: name, desc: cat.desc || cat.description || '' });
            }
            categoryMap[cat.id] = newId; // maps both old ID or name to current ID
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
                link_propeller: m.linkProp || m.link_propeller || null
            };
            
            const { error } = await supabase.from('motors').insert([motorData]);
            if (error) throw error;
            importCount++;
        }
        
        alert(`Successfully imported ${importCount} motor specifications!`);
        await fetchData();
    }

    // Modals Handling
    function openModal(modal) { modal.classList.add('show'); }
    function closeModal(modal) { modal.classList.remove('show'); }
    
    document.querySelectorAll('.modal-close-trigger').forEach(btn => {
        btn.onclick = (e) => closeModal(e.target.closest('.modal-backdrop'));
    });

    // Close modal when clicking on backdrop
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.onclick = (e) => {
            if (e.target === backdrop) closeModal(backdrop);
        };
    });

    elements.btnAddMotor.onclick = () => {
        elements.motorForm.reset();
        document.getElementById('form-motor-thrust-unit').value = 'kg';
        document.getElementById('thrust-conversion-preview').textContent = '';
        document.getElementById('modal-title').innerHTML = `<i data-lucide="plus-circle"></i> Add New Motor Entry`;
        document.getElementById('form-motor-index').value = '';
        document.getElementById('form-motor-category').value = state.activeCategory || '';
        openModal(elements.motorModal);
        lucide.createIcons();
    };
    
    elements.btnAddCat.onclick = () => {
        elements.catForm.reset();
        openModal(elements.catModal);
    };

    // Category Form Submit
    elements.catForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('form-cat-name').value.trim();
        const desc = document.getElementById('form-cat-desc').value.trim();
        
        try {
            const { data, error } = await supabase
                .from('categories')
                .insert([{ name, description: desc }])
                .select();
                
            if (error) throw error;
            
            closeModal(elements.catModal);
            if (data && data[0]) {
                state.activeCategory = data[0].id;
            }
            await fetchData();
        } catch (err) {
            console.error("Error creating category:", err);
            alert("Failed to create category: " + err.message);
        }
    };

    // Motor Form Submit
    elements.motorForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('form-motor-index').value;
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
            link_propeller: document.getElementById('form-prop-link').value.trim() || null
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
                // Update
                const { error } = await supabase
                    .from('motors')
                    .update(motorData)
                    .eq('id', id);
                if (error) throw error;
            } else {
                // Insert
                const { error } = await supabase
                    .from('motors')
                    .insert([motorData]);
                if (error) throw error;
            }
            closeModal(elements.motorModal);
            await fetchData();
        } catch (err) {
            console.error("Error saving motor:", err);
            alert("Failed to save motor: " + err.message);
        }
    };

    // Init Application
    async function init() {
        try {
            const res = await fetch('/api/config');
            const config = await res.json();
            if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
                console.error("Supabase URL or Anon Key is missing in .env configuration!");
                alert("Supabase configuration is missing. Please check your .env file.");
                return;
            }
            supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
            await fetchData();
        } catch (e) {
            console.error("Initialization failed", e);
        }
    }

    init();
});
