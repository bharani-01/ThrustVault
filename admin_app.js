// admin_app.js
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
        userProfileModal: document.getElementById('user-profile-modal'),
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
        btnDownloadTemplate: document.getElementById('btn-download-template'),
        btnShowSchema: document.getElementById('btn-show-schema'),
        schemaViewSection: document.getElementById('schema-view-section'),
        btnAddSchemaField: document.getElementById('btn-add-schema-field'),
        schemaFieldsList: document.getElementById('schema-fields-list-rows'),
        schemaEmptyState: document.getElementById('schema-empty-state'),
        schemaFieldForm: document.getElementById('schema-field-form'),
        schemaFieldModal: document.getElementById('schema-field-modal'),
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

    // Multi-View Dashboard Toggles
    elements.btnShowCatalog.onclick = () => {
        elements.btnShowCatalog.classList.add('active');
        elements.btnShowUsers.classList.remove('active');
        elements.catalogViewSection.style.display = 'flex';
        elements.usersViewSection.style.display = 'none';
        elements.catNavTitle.style.display = 'flex';
        elements.catList.style.display = 'flex';
        renderApp();
    };

    elements.btnShowUsers.onclick = () => {
        elements.btnShowUsers.classList.add('active');
        elements.btnShowCatalog.classList.remove('active');
        elements.catalogViewSection.style.display = 'none';
        elements.usersViewSection.style.display = 'block';
        elements.catNavTitle.style.display = 'none';
        elements.catList.style.display = 'none';
        fetchUserAccounts();
        lucide.createIcons();
    };

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
                <td class="row-actions" style="display:flex; gap:8px; justify-content:flex-end; align-items:center;">
                    <button class="btn-outline-sm btn-view-profile" data-id="${u.id}" title="View Profile" style="padding: 4px 8px; font-size: 0.75rem; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="user" style="width:12px; height:12px;"></i> Profile
                    </button>
                    <button class="btn-delete btn-delete-user" data-id="${u.id}" title="Delete User" ${isSelf ? 'disabled style="opacity:0.4;"' : ''}>
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>
            `;
            elements.usersTableBody.appendChild(tr);
        });

        // Bind view profile click
        elements.usersTableBody.querySelectorAll('.btn-view-profile').forEach(btn => {
            btn.onclick = () => {
                const userId = btn.dataset.id;
                const targetUser = state.users.find(x => x.id === userId);
                if (!targetUser) return;
                
                // Set text fields
                document.getElementById('profile-email').textContent = targetUser.email;
                document.getElementById('profile-uid').textContent = targetUser.id;
                document.getElementById('profile-created-at').textContent = new Date(targetUser.created_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                
                // Set Avatar Initial
                const initial = targetUser.email.charAt(0).toUpperCase();
                document.getElementById('profile-avatar').textContent = initial;
                
                // Set Badge
                const roleBadge = document.getElementById('profile-role-badge');
                roleBadge.className = `badge-role role-${targetUser.role}`;
                roleBadge.textContent = targetUser.role.charAt(0).toUpperCase() + targetUser.role.slice(1);
                
                // Copy UID Action
                const btnCopy = document.getElementById('btn-copy-profile-uid');
                btnCopy.onclick = () => {
                    navigator.clipboard.writeText(targetUser.id).then(() => {
                        const originalHtml = btnCopy.innerHTML;
                        btnCopy.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px; color: #059669;"></i>';
                        lucide.createIcons();
                        setTimeout(() => {
                            btnCopy.innerHTML = originalHtml;
                            lucide.createIcons();
                        }, 2000);
                    });
                };
                
                // Populate Permissions List
                const permList = document.getElementById('profile-permissions-list');
                let permsHtml = '';
                
                const checkIcon = `<span style="color: #059669; font-weight: bold; margin-right: 8px; font-size: 1rem;">✓</span>`;
                const crossIcon = `<span style="color: #e11d48; font-weight: bold; margin-right: 8px; font-size: 1rem;">✗</span>`;
                
                if (targetUser.role === 'admin') {
                    permsHtml = `
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #334155;">${checkIcon} Access motor catalog</div>
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #334155;">${checkIcon} Add, edit, or delete motors</div>
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #334155;">${checkIcon} Add, edit, or delete categories</div>
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #334155;">${checkIcon} Administer user roles & registrations</div>
                    `;
                } else if (targetUser.role === 'intern') {
                    permsHtml = `
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #334155;">${checkIcon} Access motor catalog</div>
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #334155;">${checkIcon} Add, edit, or delete motors</div>
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #334155;">${checkIcon} Add, edit, or delete categories</div>
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #64748b; text-decoration: line-through;">${crossIcon} Administer user roles & registrations</div>
                    `;
                } else {
                    permsHtml = `
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #334155;">${checkIcon} Access motor catalog</div>
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #64748b; text-decoration: line-through;">${crossIcon} Add, edit, or delete motors</div>
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #64748b; text-decoration: line-through;">${crossIcon} Add, edit, or delete categories</div>
                        <div style="display: flex; align-items: center; font-size: 0.85rem; color: #64748b; text-decoration: line-through;">${crossIcon} Administer user roles & registrations</div>
                    `;
                }
                
                permList.innerHTML = permsHtml;

                // Populate Activity Logs
                const logListEl = document.getElementById('profile-activity-log-list');
                const allLogs = JSON.parse(localStorage.getItem('thrustvault_global_activity_logs')) || [];
                const userLogs = allLogs.filter(log => log.email === targetUser.email)
                                       .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                if (userLogs.length === 0) {
                    logListEl.innerHTML = `
                        <div style="text-align: center; color: #64748b; font-size: 0.85rem; padding: 20px 0;">
                            <i data-lucide="info" style="width: 20px; height: 20px; margin: 0 auto 8px; display: block; opacity: 0.5;"></i>
                            No activity logged yet.
                        </div>
                    `;
                } else {
                    logListEl.innerHTML = userLogs.map(log => {
                        const date = new Date(log.timestamp);
                        const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                        const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        
                        let iconName = 'activity';
                        let iconColor = '#64748b';
                        if (log.action.includes('Login')) {
                            iconName = 'log-in';
                            iconColor = '#10b981';
                        } else if (log.action.includes('Logout')) {
                            iconName = 'log-out';
                            iconColor = '#f59e0b';
                        } else if (log.action.includes('Created') || log.action.includes('Added')) {
                            iconName = 'plus-circle';
                            iconColor = '#3b82f6';
                        } else if (log.action.includes('Updated')) {
                            iconName = 'edit-3';
                            iconColor = '#8b5cf6';
                        } else if (log.action.includes('Deleted')) {
                            iconName = 'trash-2';
                            iconColor = '#ef4444';
                        } else if (log.action.includes('Imported')) {
                            iconName = 'file-input';
                            iconColor = '#6366f1';
                        }
                        
                        return `
                            <div style="display: flex; gap: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; align-items: flex-start; margin-bottom: 8px;">
                                <div style="background: ${iconColor}15; color: ${iconColor}; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                                    <i data-lucide="${iconName}" style="width: 14px; height: 14px;"></i>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
                                        <span style="font-weight: 600; font-size: 0.85rem; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${log.action}</span>
                                        <span style="font-size: 0.75rem; color: #94a3b8; white-space: nowrap;">${dateStr}, ${timeStr}</span>
                                    </div>
                                    <p style="font-size: 0.8rem; color: #64748b; margin: 2px 0 0 0; line-height: 1.3; word-break: break-word;">${log.details}</p>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
                
                openModal(elements.userProfileModal);
                lucide.createIcons();
            };
        });

        // Bind update role changes
        elements.usersTableBody.querySelectorAll('.user-role-select').forEach(select => {
            select.onchange = async () => {
                const userId = select.dataset.id;
                const newRole = select.value;
                const targetUser = state.users.find(x => x.id === userId);
                const oldRole = targetUser ? targetUser.role : '';
                try {
                    const { error } = await supabase
                        .from('user_profiles')
                        .update({ role: newRole })
                        .eq('id', userId);
                    if (error) throw error;
                    logUserActivity(session.email, session.role, 'User Role Changed', `Changed role of ${targetUser ? targetUser.email : userId} from ${oldRole.toUpperCase()} to ${newRole.toUpperCase()}`);
                    await fetchUserAccounts();
                } catch (err) {
                    alert("Failed to update user role: " + err.message);
                }
            };
        });

        // Bind delete user via RPC function (removes from auth.users securely)
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
                        const { error } = await supabase.rpc('delete_vault_user', {
                            user_id: userId
                        });
                        if (error) throw error;
                        logUserActivity(session.email, session.role, 'User Account Deleted', `Deleted user account: ${targetUser.email}`);
                        await fetchUserAccounts();
                    } catch (err) {
                        alert("Failed to delete user profile: " + err.message);
                    }
                }
            };
        });
        lucide.createIcons();
    }

    // Add New User profile via RPC function (creates in auth.users securely)
    elements.userForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('form-user-email').value.trim();
        const password = document.getElementById('form-user-password').value;
        const role = document.getElementById('form-user-role').value;

        try {
            const { error } = await supabase.rpc('create_vault_user', {
                email_val: email,
                password_val: password,
                role_val: role
            });
            
            if (error) throw error;
            
            elements.userForm.reset();
            alert("Successfully created user account!");
            logUserActivity(session.email, session.role, 'User Account Created', `Created user account for ${email} with role ${role.toUpperCase()}`);
            await fetchUserAccounts();
        } catch (err) {
            console.error("Error creating user:", err);
            alert("Failed to create user account: " + err.message);
        }
    };

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
                        logUserActivity(session.email, session.role, 'Category Deleted', `Deleted category: ${cat.name}`);
                        
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
                document.getElementById('form-motor-thrust').value = m.thrust;
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
        
        let customRowsHtml = '';
        if (state.customSchema && state.customSchema.length > 0) {
            state.customSchema.forEach(f => {
                customRowsHtml += `
                    <tr>
                        <td><strong>${f.field_name}</strong></td>
                        ${selected.map(m => {
                            const val = m.custom_parameters && m.custom_parameters[f.field_key] !== undefined ? m.custom_parameters[f.field_key] : '-';
                            if (f.field_type === 'boolean') {
                                return `<td>${val === true || val === 'true' ? 'Yes ✓' : 'No ✗'}</td>`;
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
                const { data, error } = await supabase
                    .from('categories')
                    .insert([{ name: catName, description: catDesc }])
                    .select();
                if (error) throw error;
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
            const { error } = await supabase.from('motors').insert([motorData]);
            if (error) throw error;
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
                link_propeller: m.linkProp || m.link_propeller || null,
                custom_parameters: m.custom_parameters || {}
            };
            const { error } = await supabase.from('motors').insert([motorData]);
            if (error) throw error;
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
            const { data, error } = await supabase.from('categories').insert([{ name, description: desc }]).select();
            if (error) throw error;
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

        const motorData = {
            motor_name: document.getElementById('form-motor-name').value.trim(),
            company: document.getElementById('form-motor-company').value.trim(),
            max_thrust: document.getElementById('form-motor-thrust').value.trim(),
            category_id: document.getElementById('form-motor-category').value,
            recommended_esc: document.getElementById('form-motor-esc').value.trim() || null,
            recommended_propeller: document.getElementById('form-motor-propeller').value.trim() || null,
            link_motor: document.getElementById('form-motor-link').value.trim() || null,
            link_esc: document.getElementById('form-esc-link').value.trim() || null,
            link_propeller: document.getElementById('form-prop-link').value.trim() || null,
            custom_parameters: customParams
        };
        try {
            if (id) {
                const { error } = await supabase.from('motors').update(motorData).eq('id', id);
                if (error) throw error;
                logUserActivity(session.email, session.role, 'Motor Entry Updated', `Updated motor: ${motorData.motor_name} (Brand: ${motorData.company})`);
            } else {
                const { error } = await supabase.from('motors').insert([motorData]);
                if (error) throw error;
                logUserActivity(session.email, session.role, 'Motor Entry Created', `Added motor: ${motorData.motor_name} (Brand: ${motorData.company})`);
            }
            closeModal(elements.motorModal);
            await fetchData();
        } catch (err) { alert("Failed to save motor: " + err.message); }
    };

    elements.btnAddMotor.onclick = () => {
        elements.motorForm.reset();
        document.getElementById('modal-title').innerHTML = `<i data-lucide="plus-circle"></i> Add New Motor Entry`;
        document.getElementById('form-motor-index').value = '';
        document.getElementById('form-motor-category').value = state.activeCategory || '';
        renderCustomFieldsInMotorForm();
        openModal(elements.motorModal);
        lucide.createIcons();
    };

    elements.btnAddCat.onclick = () => {
        elements.catForm.reset();
        openModal(elements.catModal);
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
        if (session) {
            logUserActivity(session.email, session.role, 'Logout', 'Logged out successfully.');
        }
        if (supabase) {
            supabase.auth.signOut().catch(e => console.error("Supabase signOut error:", e));
        }
        localStorage.removeItem('thrustvault_session');
        window.location.href = 'index.html';
    };

    // =========================================================================
    // DYNAMIC SPEC SCHEMA CUSTOMIZER & EXPORTER ACTIONS
    // =========================================================================

    elements.btnShowSchema.onclick = () => {
        elements.btnShowCatalog.classList.remove('active');
        elements.btnShowUsers.classList.remove('active');
        elements.btnShowSchema.classList.add('active');
        elements.catalogViewSection.style.display = 'none';
        elements.usersViewSection.style.display = 'none';
        elements.schemaViewSection.style.display = 'block';
        elements.catNavTitle.style.display = 'none';
        elements.catList.style.display = 'none';
        renderSchemaBuilder();
    };

    function renderSchemaBuilder() {
        elements.schemaFieldsList.innerHTML = '';
        if (!state.customSchema || state.customSchema.length === 0) {
            elements.schemaEmptyState.style.display = 'block';
            document.getElementById('schema-fields-table').style.display = 'none';
        } else {
            elements.schemaEmptyState.style.display = 'none';
            document.getElementById('schema-fields-table').style.display = 'table';
            
            state.customSchema.forEach(f => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${f.field_name}</strong></td>
                    <td><code>${f.field_key}</code></td>
                    <td><span class="badge-thrust" style="text-transform: capitalize; border:1px solid #bfdbfe; background:#eff6ff; color:#2563eb;">${f.field_type}</span></td>
                    <td>${f.field_unit || '-'}</td>
                    <td class="row-actions" style="text-align:right;">
                        <button class="btn-delete btn-delete-schema" data-key="${f.field_key}" title="Delete Parameter"><i data-lucide="trash-2"></i></button>
                    </td>
                `;
                
                tr.querySelector('.btn-delete-schema').onclick = async () => {
                    const confirmDelete = await customConfirm(
                        "Delete Custom Parameter?",
                        `Are you sure you want to permanently delete the custom parameter "${f.field_name}"? Existing data in this column will be lost.`
                    );
                    if (confirmDelete) {
                        try {
                            if (supabase) {
                                await supabase.from('custom_specs_schema').delete().eq('field_key', f.field_key);
                            }
                        } catch (err) {
                            console.warn("Supabase delete failed, using localStorage fallback:", err);
                        }
                        state.customSchema = state.customSchema.filter(x => x.field_key !== f.field_key);
                        localStorage.setItem('thrustvault_custom_specs', JSON.stringify(state.customSchema));
                        logUserActivity(session.email, session.role, 'Schema Field Deleted', `Deleted custom parameter field: ${f.field_name}`);
                        renderSchemaBuilder();
                        await fetchData();
                    }
                };
                elements.schemaFieldsList.appendChild(tr);
            });
            lucide.createIcons();
        }
    }

    elements.btnShowCatalog.addEventListener('click', () => {
        elements.btnShowSchema.classList.remove('active');
    });
    elements.btnShowUsers.addEventListener('click', () => {
        elements.btnShowSchema.classList.remove('active');
    });

    elements.btnAddSchemaField.onclick = () => {
        elements.schemaFieldForm.reset();
        openModal(elements.schemaFieldModal);
    };

    elements.schemaFieldForm.onsubmit = async (e) => {
        e.preventDefault();
        const label = document.getElementById('form-field-name').value.trim();
        const key = document.getElementById('form-field-key').value.trim();
        const type = document.getElementById('form-field-type').value;
        const unit = document.getElementById('form-field-unit').value.trim() || null;
        
        if (state.customSchema && state.customSchema.some(x => x.field_key === key)) {
            alert("A field with this key already exists.");
            return;
        }
        
        const newField = { field_key: key, field_name: label, field_type: type, field_unit: unit };
        
        try {
            if (supabase) {
                const { error } = await supabase.from('custom_specs_schema').insert([newField]);
                if (error) throw error;
            }
        } catch (err) {
            console.warn("Supabase insert failed, using localStorage fallback:", err);
        }
        
        if (!state.customSchema) state.customSchema = [];
        state.customSchema.push(newField);
        localStorage.setItem('thrustvault_custom_specs', JSON.stringify(state.customSchema));
        logUserActivity(session.email, session.role, 'Schema Field Added', `Added custom parameter field: ${label} (${type})`);
        closeModal(elements.schemaFieldModal);
        renderSchemaBuilder();
        await fetchData();
    };

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
                const { data, error } = await supabase
                    .from('categories')
                    .insert([{ name: catName, description: catDesc }])
                    .select();
                if (error) throw error;
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
            
            const { error } = await supabase.from('motors').insert([motorData]);
            if (error) throw error;
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
    function logoutAndRedirect() {
        if (session) {
            logUserActivity(session.email, session.role, 'Logout', 'Logged out successfully.');
        }
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

            if (profileError || !profile || profile.role !== 'admin') {
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
