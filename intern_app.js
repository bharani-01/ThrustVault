// intern_app.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Validate user is intern
    const session = JSON.parse(localStorage.getItem('thrustvault_session'));
    if (!session || session.role !== 'intern') {
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

    lucide.createIcons();

    let state = {
        motors: [],
        categories: [],
        users: [],
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
        
        // Multi-view navigation
        btnShowCatalog: document.getElementById('btn-show-catalog'),
        btnShowUsers: document.getElementById('btn-show-users'),
        catalogViewSection: document.getElementById('catalog-view-section'),
        usersViewSection: document.getElementById('users-view-section'),
        catNavTitle: document.getElementById('cat-nav-title'),
        
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
        btnLogout: document.getElementById('btn-logout'),
        
        // Forms
        motorForm: document.getElementById('motor-form'),
        catForm: document.getElementById('category-form'),
        userForm: document.getElementById('admin-user-form'),
        
        // User list rows
        usersTableBody: document.getElementById('user-accounts-list-rows'),
        
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

    // Multi-View Dashboard Toggles
    // Multi-View Dashboard Toggles (Guarded for Intern Dashboard)
    if (elements.btnShowCatalog) {
        elements.btnShowCatalog.onclick = () => {
            elements.btnShowCatalog.classList.add('active');
            if (elements.btnShowUsers) elements.btnShowUsers.classList.remove('active');
            if (elements.catalogViewSection) elements.catalogViewSection.style.display = 'flex';
            if (elements.usersViewSection) elements.usersViewSection.style.display = 'none';
            if (elements.catNavTitle) elements.catNavTitle.style.display = 'flex';
            if (elements.catList) elements.catList.style.display = 'flex';
            renderApp();
        };
    }

    if (elements.btnShowUsers) {
        elements.btnShowUsers.onclick = () => {
            elements.btnShowUsers.classList.add('active');
            if (elements.btnShowCatalog) elements.btnShowCatalog.classList.remove('active');
            if (elements.catalogViewSection) elements.catalogViewSection.style.display = 'none';
            if (elements.usersViewSection) elements.usersViewSection.style.display = 'block';
            if (elements.catNavTitle) elements.catNavTitle.style.display = 'none';
            if (elements.catList) elements.catList.style.display = 'none';
            fetchUserAccounts();
            lucide.createIcons();
        };
    }

    // User Management Fetching & Rendering
    async function fetchUserAccounts() {
        try {
            const { data: users, error } = await supabase
                .from('user_profiles')
                .select('*')
                .order('email');
            
            if (error) throw error;
            state.users = users || [];
            renderUserAccountsList();
        } catch (err) {
            console.error("Error fetching users:", err);
        }
    }

    function renderUserAccountsList() {
        elements.usersTableBody.innerHTML = '';
        state.users.forEach(u => {
            const tr = document.createElement('tr');
            const createdDate = new Date(u.created_at).toLocaleDateString();
            const isSelf = u.email === session.email;
            
            tr.innerHTML = `
                <td><strong>${u.email}</strong> ${isSelf ? '<span class="count-badge" style="font-size:0.65rem; padding:2px 6px;">You</span>' : ''}</td>
                <td>
                    <select class="user-role-select form-group" style="padding:4px 8px; font-size:0.85rem;" data-id="${u.id}" ${isSelf ? 'disabled' : ''}>
                        <option value="guest" ${u.role === 'guest' ? 'selected' : ''}>Guest (Read-only)</option>
                        <option value="intern" ${u.role === 'intern' ? 'selected' : ''}>Intern (Read/Write Catalog)</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin (Full Control)</option>
                    </select>
                </td>
                <td>${createdDate}</td>
                <td class="row-actions">
                    <button class="btn-delete btn-delete-user" data-id="${u.id}" title="Delete User" ${isSelf ? 'disabled style="opacity:0.4;"' : ''}>
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>
            `;
            elements.usersTableBody.appendChild(tr);
        });

        // Bind update role changes
        elements.usersTableBody.querySelectorAll('.user-role-select').forEach(select => {
            select.onchange = async () => {
                const userId = select.dataset.id;
                const newRole = select.value;
                try {
                    const { error } = await supabase
                        .from('user_profiles')
                        .update({ role: newRole })
                        .eq('id', userId);
                    if (error) throw error;
                    await fetchUserAccounts();
                } catch (err) {
                    alert("Failed to update user role: " + err.message);
                }
            };
        });

        // Bind delete user
        elements.usersTableBody.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.onclick = async () => {
                const userId = btn.dataset.id;
                const targetUser = state.users.find(x => x.id === userId);
                const confirmDelete = await customConfirm(
                    "Delete User Account?",
                    `Are you sure you want to permanently delete the login credentials for "${targetUser.email}"?`
                );
                if (confirmDelete) {
                    try {
                        const { error } = await supabase
                            .from('user_profiles')
                            .delete()
                            .eq('id', userId);
                        if (error) throw error;
                        await fetchUserAccounts();
                    } catch (err) {
                        alert("Failed to delete user profile: " + err.message);
                    }
                }
            };
        });
        lucide.createIcons();
    }

    // Add New User profile
    // Add New User profile (Guarded for Intern Dashboard)
    if (elements.userForm) {
        elements.userForm.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('form-user-email').value.trim();
            const password = document.getElementById('form-user-password').value;
            const role = document.getElementById('form-user-role').value;

            try {
                const { error } = await supabase
                    .from('user_profiles')
                    .insert([{ email, password, role }]);
                
                if (error) throw error;
                
                elements.userForm.reset();
                alert("Successfully created user account!");
                await fetchUserAccounts();
            } catch (err) {
                console.error("Error creating user:", err);
                alert("Failed to create user account: " + err.message);
            }
        };
    }

    // Data Fetching from Supabase
    async function fetchData() {
        try {
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
            
            const links = [];
            if (m.linkMotor) {
                links.push(`<a href="${m.linkMotor}" target="_blank" title="Motor Specs"><i data-lucide="cpu"></i></a>`);
            }
            if (m.linkEsc) {
                links.push(`<a href="${m.linkEsc}" target="_blank" title="ESC Specs"><i data-lucide="zap"></i></a>`);
            }
            if (m.linkProp) {
                links.push(`<a href="${m.linkProp}" target="_blank" title="Propeller Specs"><i data-lucide="wind"></i></a>`);
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
        
        elements.motorsTableBody.querySelectorAll('.btn-edit').forEach(btn => {
            btn.onclick = () => {
                const m = state.motors.find(x => x.id === btn.dataset.id);
                document.getElementById('modal-title').innerHTML = `<i data-lucide="edit-2"></i> Edit Motor Specifications`;
                document.getElementById('form-motor-index').value = m.id;
                document.getElementById('form-motor-name').value = m.motor;
                document.getElementById('form-motor-company').value = m.company;
                document.getElementById('form-motor-thrust').value = m.thrust;
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
        openModal(elements.comparisonModal);
        lucide.createIcons();
    };

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
        const backup = { categories: state.categories, motors: state.motors };
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
        const rows = state.motors.map(m => {
            const cat = state.categories.find(c => c.id === m.categoryId);
            return [cat ? cat.name : '', '', m.motor, m.company, m.thrust, m.esc || '', m.prop || '', m.linkMotor || '', m.linkEsc || '', m.linkProp || ''].map(val => `"${val.replace(/"/g, '""')}"`);
        });
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thrustvault_catalog_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    elements.btnDownloadTemplate.onclick = () => {
        const headers = ['Category Name', 'Category Description', 'Motor Model Name', 'Manufacturer', 'Max Thrust', 'Recommended ESC', 'Recommended Propeller', 'Motor Link', 'ESC Link', 'Propeller Link'];
        const sample = ['2 kg', 'Cinematic drone motors', 'F60 Pro V', 'T-Motor', '2.1 kg', 'V45A ESC', 'T5143S Prop', 'https://...', '', ''];
        const csvContent = [headers.join(','), sample.map(v => `"${v}"`).join(',')].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'thrustvault_import_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    elements.btnImportTrigger.onclick = () => { elements.fileImportInput.click(); };
    elements.fileImportInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const content = evt.target.result;
            try {
                if (file.name.endsWith('.json')) {
                    await importJSONData(JSON.parse(content));
                } else if (file.name.endsWith('.csv')) {
                    await importCSVData(content);
                }
                elements.fileImportInput.value = '';
            } catch (err) {
                alert("Import failed: " + err.message);
            }
        };
        reader.readAsText(file);
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
                const { data, error } = await supabase
                    .from('categories')
                    .insert([{ name: cat.name, description: cat.desc || cat.description || '' }])
                    .select();
                if (error) throw error;
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
                link_propeller: m.linkProp || m.link_propeller || null
            };
            const { error } = await supabase.from('motors').insert([motorData]);
            if (error) throw error;
            importCount++;
        }
        alert(`Imported ${importCount} motor entries.`);
        await fetchData();
    }

    // Modal Form Submits
    elements.catForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('form-cat-name').value.trim();
        const desc = document.getElementById('form-cat-desc').value.trim();
        try {
            const { data, error } = await supabase.from('categories').insert([{ name, description: desc }]).select();
            if (error) throw error;
            closeModal(elements.catModal);
            if (data && data[0]) { state.activeCategory = data[0].id; }
            await fetchData();
        } catch (err) { alert("Failed to create category: " + err.message); }
    };

    elements.motorForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('form-motor-index').value;
        const motorData = {
            motor_name: document.getElementById('form-motor-name').value.trim(),
            company: document.getElementById('form-motor-company').value.trim(),
            max_thrust: document.getElementById('form-motor-thrust').value.trim(),
            category_id: document.getElementById('form-motor-category').value,
            recommended_esc: document.getElementById('form-motor-esc').value.trim() || null,
            recommended_propeller: document.getElementById('form-motor-propeller').value.trim() || null,
            link_motor: document.getElementById('form-motor-link').value.trim() || null,
            link_esc: document.getElementById('form-esc-link').value.trim() || null,
            link_propeller: document.getElementById('form-prop-link').value.trim() || null
        };
        try {
            if (id) {
                const { error } = await supabase.from('motors').update(motorData).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('motors').insert([motorData]);
                if (error) throw error;
            }
            closeModal(elements.motorModal);
            await fetchData();
        } catch (err) { alert("Failed to save motor: " + err.message); }
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
    elements.btnLogout.onclick = () => {
        logoutAndRedirect();
    };

    // Logout and redirect helper
    function logoutAndRedirect() {
        if (supabase) {
            supabase.auth.signOut().catch(e => console.error("SignOut error:", e));
        }
        localStorage.removeItem('thrustvault_session');
        window.location.href = 'index.html';
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

            if (profileError || !profile || profile.role !== 'intern') {
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
