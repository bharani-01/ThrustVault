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
        users: [],
        accessRequests: [],
        activeCategory: null,
        searchQuery: '',
        filterCompany: 'all',
        sortBy: 'motor-asc',
        compareItems: [],
        chartInstances: {}
    };

    let supabase = null;
    let profileUserEmail = null;
    let profileBackTarget = 'users';
    let currentUserLogs = [];

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
        btnShowRequests: document.getElementById('btn-show-requests'),
        catalogViewSection: document.getElementById('catalog-view-section'),
        usersViewSection: document.getElementById('users-view-section'),
        requestsViewSection: document.getElementById('requests-view-section'),
        requestsTableBody: document.getElementById('access-requests-list-rows'),
        requestsEmptyState: document.getElementById('requests-empty-state'),
        requestsSearch: document.getElementById('requests-search-input'),
        requestsFilterStatus: document.getElementById('requests-filter-status'),
        requestsPendingBadge: document.getElementById('requests-pending-badge'),
        catNavTitle: document.getElementById('cat-nav-title'),
        
        // Modals & Drawers
        motorModal: document.getElementById('motor-modal'),
        catModal: document.getElementById('category-modal'),
        confirmModal: document.getElementById('confirm-modal'),
        comparisonModal: document.getElementById('comparison-modal'),
        profileViewSection: document.getElementById('profile-view-section'),
        btnProfileBack: document.getElementById('btn-profile-back'),
        profileActivitySearch: document.getElementById('profile-activity-search'),
        profileActivityFilter: document.getElementById('profile-activity-filter'),
        profileTotalOps: document.getElementById('profile-total-ops'),
        profileTotalMutations: document.getElementById('profile-total-mutations'),
        fullProfileAvatar: document.getElementById('full-profile-avatar'),
        fullProfileEmail: document.getElementById('full-profile-email'),
        fullProfileRoleBadge: document.getElementById('full-profile-role-badge'),
        fullProfileUid: document.getElementById('full-profile-uid'),
        btnCopyFullProfileUid: document.getElementById('btn-copy-full-profile-uid'),
        fullProfileCreatedAt: document.getElementById('full-profile-created-at'),
        fullProfilePermissionsList: document.getElementById('full-profile-permissions-list'),
        fullProfileActivityContainer: document.getElementById('full-profile-activity-container'),
        profileActivityEmpty: document.getElementById('profile-activity-empty'),
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
        elements.btnShowRequests.classList.remove('active');
        elements.btnShowSchema.classList.remove('active');
        elements.catalogViewSection.style.display = 'flex';
        elements.usersViewSection.style.display = 'none';
        elements.requestsViewSection.style.display = 'none';
        elements.schemaViewSection.style.display = 'none';
        elements.profileViewSection.style.display = 'none';
        elements.catNavTitle.style.display = 'flex';
        elements.catList.style.display = 'flex';
        renderApp();
    };

    elements.btnShowUsers.onclick = () => {
        elements.btnShowUsers.classList.add('active');
        elements.btnShowCatalog.classList.remove('active');
        elements.btnShowRequests.classList.remove('active');
        elements.btnShowSchema.classList.remove('active');
        elements.catalogViewSection.style.display = 'none';
        elements.usersViewSection.style.display = 'block';
        elements.requestsViewSection.style.display = 'none';
        elements.schemaViewSection.style.display = 'none';
        elements.profileViewSection.style.display = 'none';
        elements.catNavTitle.style.display = 'none';
        elements.catList.style.display = 'none';
        fetchUserAccounts();
        lucide.createIcons();
    };

    elements.btnShowRequests.onclick = () => {
        elements.btnShowRequests.classList.add('active');
        elements.btnShowCatalog.classList.remove('active');
        elements.btnShowUsers.classList.remove('active');
        elements.btnShowSchema.classList.remove('active');
        elements.catalogViewSection.style.display = 'none';
        elements.usersViewSection.style.display = 'none';
        elements.requestsViewSection.style.display = 'block';
        elements.schemaViewSection.style.display = 'none';
        elements.profileViewSection.style.display = 'none';
        elements.catNavTitle.style.display = 'none';
        elements.catList.style.display = 'none';
        fetchAccessRequests();
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

        // Bind view profile click to transition to full-page user profile
        elements.usersTableBody.querySelectorAll('.btn-view-profile').forEach(btn => {
            btn.onclick = () => {
                const userId = btn.dataset.id;
                const targetUser = state.users.find(x => x.id === userId);
                if (!targetUser) return;
                showUserProfile(targetUser, 'users');
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

    // =========================================================================
    // ACCESS REQUESTS FETCHING, RENDERING & ACTIONS
    // =========================================================================

    async function fetchAccessRequests() {
        try {
            const { data: requests, error } = await supabase
                .from('access_requests')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            state.accessRequests = requests || [];
            
            // Render the access requests list
            renderAccessRequestsList();
            
            // Update stats counters
            updateAccessRequestsCounters();
        } catch (err) {
            console.error("Error fetching access requests:", err);
        }
    }

    function updateAccessRequestsCounters() {
        const total = state.accessRequests.length;
        const pending = state.accessRequests.filter(r => r.status === 'pending').length;
        const approved = state.accessRequests.filter(r => r.status === 'approved').length;
        const rejected = state.accessRequests.filter(r => r.status === 'rejected').length;

        const totalEl = document.getElementById('req-stat-total');
        const pendingEl = document.getElementById('req-stat-pending');
        const approvedEl = document.getElementById('req-stat-approved');
        const rejectedEl = document.getElementById('req-stat-rejected');

        if (totalEl) totalEl.textContent = total;
        if (pendingEl) pendingEl.textContent = pending;
        if (approvedEl) approvedEl.textContent = approved;
        if (rejectedEl) rejectedEl.textContent = rejected;

        // Update sidebar pending badge
        if (elements.requestsPendingBadge) {
            if (pending > 0) {
                elements.requestsPendingBadge.style.display = 'inline-block';
                elements.requestsPendingBadge.textContent = pending;
            } else {
                elements.requestsPendingBadge.style.display = 'none';
            }
        }
    }

    function renderAccessRequestsList() {
        if (!elements.requestsTableBody) return;
        elements.requestsTableBody.innerHTML = '';
        
        const filterStatus = elements.requestsFilterStatus.value;
        const searchQuery = elements.requestsSearch.value.trim().toLowerCase();
        
        const filtered = state.accessRequests.filter(r => {
            const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
            const matchesSearch = !searchQuery || 
                                 (r.full_name && r.full_name.toLowerCase().includes(searchQuery)) ||
                                 (r.email && r.email.toLowerCase().includes(searchQuery)) ||
                                 (r.justification && r.justification.toLowerCase().includes(searchQuery));
            return matchesStatus && matchesSearch;
        });

        if (filtered.length === 0) {
            elements.requestsEmptyState.style.display = 'block';
            elements.requestsTableBody.closest('table').style.display = 'none';
        } else {
            elements.requestsEmptyState.style.display = 'none';
            elements.requestsTableBody.closest('table').style.display = 'table';
            
            filtered.forEach(r => {
                const tr = document.createElement('tr');
                const createdDate = new Date(r.created_at).toLocaleDateString() + ' ' + new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                // Role badge
                let roleClass = 'role-guest';
                let roleLabel = 'Guest';
                if (r.requested_role === 'admin') {
                    roleClass = 'role-admin';
                    roleLabel = 'Admin';
                } else if (r.requested_role === 'intern') {
                    roleClass = 'role-intern';
                    roleLabel = 'Intern';
                }
                
                // Status badge
                let statusStyle = '';
                if (r.status === 'pending') {
                    statusStyle = 'background: #fffbeb; color: #d97706; border: 1px solid #fde68a; padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; display: inline-block;';
                } else if (r.status === 'approved') {
                    statusStyle = 'background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; display: inline-block;';
                } else if (r.status === 'rejected') {
                    statusStyle = 'background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; display: inline-block;';
                }

                // Actions cell
                let actionsHtml = '';
                if (r.status === 'pending') {
                    actionsHtml = `
                        <button class="btn-primary-sm btn-auto-confirm-req" data-id="${r.id}" title="Auto Confirm with Default Password" style="background-color: #059669; color: white; border: none; padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                            <i data-lucide="zap" style="width: 12px; height: 12px;"></i> Auto Confirm
                        </button>
                        <button class="btn-primary-sm btn-approve-req" data-id="${r.id}" title="Approve Request" style="background-color: #2563eb; color: white; border: none; padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                            <i data-lucide="check" style="width: 12px; height: 12px;"></i> Approve
                        </button>
                        <button class="btn-delete-sm btn-reject-req" data-id="${r.id}" title="Reject Request" style="background-color: #e11d48; color: white; border: none; padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                            <i data-lucide="x" style="width: 12px; height: 12px;"></i> Reject
                        </button>
                    `;
                } else if (r.status === 'approved') {
                    actionsHtml = `<span style="color: #64748b; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px; font-weight: 500;"><i data-lucide="lock" style="width: 14px;"></i> Completed</span>`;
                } else if (r.status === 'rejected') {
                    actionsHtml = `<span style="color: #94a3b8; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px; font-weight: 500;"><i data-lucide="slash" style="width: 14px;"></i> Rejected</span>`;
                }

                tr.innerHTML = `
                    <td><strong>${escapeHTML(r.full_name)}</strong></td>
                    <td><a href="mailto:${r.email}" style="color: var(--primary-color); text-decoration: none;">${r.email}</a></td>
                    <td><span class="badge-role ${roleClass}">${roleLabel}</span></td>
                    <td style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(r.justification)}">${escapeHTML(r.justification)}</td>
                    <td>${createdDate}</td>
                    <td><span style="${statusStyle}">${r.status.toUpperCase()}</span></td>
                    <td class="row-actions" style="display:flex; gap:6px; justify-content:flex-end; align-items:center;">
                        ${actionsHtml}
                    </td>
                `;
                elements.requestsTableBody.appendChild(tr);
            });
            
            // Bind action buttons
            elements.requestsTableBody.querySelectorAll('.btn-auto-confirm-req').forEach(btn => {
                btn.onclick = () => handleAccessRequestAction(btn.dataset.id, 'auto-approve');
            });
            elements.requestsTableBody.querySelectorAll('.btn-approve-req').forEach(btn => {
                btn.onclick = () => handleAccessRequestAction(btn.dataset.id, 'approve');
            });
            elements.requestsTableBody.querySelectorAll('.btn-reject-req').forEach(btn => {
                btn.onclick = () => handleAccessRequestAction(btn.dataset.id, 'reject');
            });
        }
        lucide.createIcons();
    }

    async function handleAccessRequestAction(requestId, actionType) {
        const req = state.accessRequests.find(r => r.id === requestId);
        if (!req) return;

        if (actionType === 'reject') {
            const confirmReject = await customConfirm(
                "Reject Access Request?",
                `Are you sure you want to reject the access request from "${req.full_name}" (${req.email})?`
            );
            if (!confirmReject) return;

            try {
                // Update access_requests status
                const { error: updateErr } = await supabase
                    .from('access_requests')
                    .update({ status: 'rejected' })
                    .eq('id', requestId);
                
                if (updateErr) throw updateErr;

                // Log activity
                logUserActivity(session.email, session.role, 'Access Request Rejected', `Rejected access request from ${req.email}`);

                // Send rejection email via backend Resend endpoint
                try {
                    await fetch('/api/send-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: 'rejected',
                            to: req.email,
                            full_name: req.full_name
                        })
                    });
                } catch (emailErr) {
                    console.error("Failed to send rejection email notification:", emailErr);
                }

                alert("Access request successfully rejected.");
                await fetchAccessRequests();
            } catch (err) {
                console.error("Rejection failed:", err);
                alert("Failed to reject request: " + err.message);
            }
            return;
        }

        // Approval / Auto-Confirm logic
        let password = '';
        if (actionType === 'auto-approve') {
            password = 'ThrustVault@Default2026!';
        } else {
            // Prompt admin for password, or generate a random one
            const promptVal = prompt(
                `Enter a password for "${req.email}" (min 6 characters), or leave empty to auto-generate a secure random password:`, 
                "VaultWelcome2026!"
            );
            if (promptVal === null) return; // User cancelled prompt
            
            const trimmedPass = promptVal.trim();
            if (trimmedPass === '') {
                // Auto-generate random secure password
                password = Math.random().toString(36).slice(-8) + 'V@' + Math.floor(Math.random() * 1000);
            } else {
                if (trimmedPass.length < 6) {
                    alert("Password must be at least 6 characters long.");
                    return;
                }
                password = trimmedPass;
            }
        }

        try {
            // Check if user account already exists in profiles
            const { data: existingUser } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('email', req.email)
                .maybeSingle();

            if (existingUser) {
                alert(`An active user profile already exists for "${req.email}". We will mark this request as completed.`);
                // Just update status to approved
                await supabase.from('access_requests').update({ status: 'approved' }).eq('id', requestId);
                await fetchAccessRequests();
                return;
            }

            // Show approval loading indicator
            const btn = document.querySelector(`.row-actions button[data-id="${requestId}"]`);
            if (btn) btn.textContent = 'Creating User...';

            // 1. Create User in Auth & Profiles using RPC create_vault_user
            const { data: newUid, error: createErr } = await supabase.rpc('create_vault_user', {
                email_val: req.email,
                password_val: password,
                role_val: req.requested_role
            });

            if (createErr) throw createErr;

            // 2. Generate Supabase password recovery reset link using the admin API
            let resetLink = '';
            try {
                const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
                    type: 'recovery',
                    email: req.email,
                    options: { redirectTo: window.location.origin + '/login' }
                });
                if (!linkErr && linkData && linkData.properties) {
                    resetLink = linkData.properties.action_link;
                }
            } catch (err) {
                console.warn("Failed to generate password recovery link via Supabase Admin API:", err);
            }

            // 3. Update request status in access_requests
            const { error: updateErr } = await supabase
                .from('access_requests')
                .update({ status: 'approved' })
                .eq('id', requestId);

            if (updateErr) throw updateErr;

            // 4. Log admin activity
            logUserActivity(
                session.email, 
                session.role, 
                'Access Request Approved', 
                `Approved request for ${req.email} with role ${req.requested_role.toUpperCase()}`
            );

            // 5. Send approved email notification via backend Resend endpoint
            try {
                await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'approved',
                        to: req.email,
                        full_name: req.full_name,
                        requested_role: req.requested_role,
                        reset_link: resetLink,
                        temp_password: password
                    })
                });
            } catch (emailErr) {
                console.error("Failed to trigger approval email notification:", emailErr);
            }

            // 6. Display success modal/dialog
            showApprovalSuccessModal(req.email, password, resetLink);

            // Refresh requests list
            await fetchAccessRequests();
            await fetchUserAccounts(); // refresh user list too
        } catch (err) {
            console.error("Approval failed:", err);
            alert("Failed to approve access request: " + err.message);
            await fetchAccessRequests();
        }
    }

    function showApprovalSuccessModal(email, password, resetLink) {
        // Build a beautiful premium modal overlay dynamically
        const modalId = 'dynamic-approval-success-modal';
        let existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const backdrop = document.createElement('div');
        backdrop.id = modalId;
        backdrop.className = 'modal-backdrop';
        backdrop.style.display = 'flex';
        backdrop.style.justifyContent = 'center';
        backdrop.style.alignItems = 'center';
        backdrop.style.zIndex = '99999';

        const linkHtml = resetLink ? `
            <div class="form-group" style="margin-top: 14px;">
                <label>Set Password Link (Recovery Link)</label>
                <div style="display: flex; gap: 8px; margin-top: 4px;">
                    <input type="text" readonly value="${resetLink}" id="success-copy-link" style="flex: 1; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem; font-family: monospace; outline: none; background: #f8fafc;">
                    <button id="btn-success-copy-link" class="btn-primary-sm" style="padding: 0 12px; border-radius: 8px; display: flex; align-items: center; justify-content: center;"><i data-lucide="copy" style="width: 16px;"></i></button>
                </div>
            </div>
        ` : '';

        backdrop.innerHTML = `
            <div class="modal-container" style="max-width: 480px; width: 90%; transform: scale(1.02); transition: transform 0.2s; box-shadow: var(--shadow-lg); background: white; border-radius: 12px;">
                <div class="modal-header" style="border-bottom: 1px solid #f1f5f9; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="display: flex; align-items: center; gap: 8px; font-family: 'Outfit'; color: #059669; font-size: 1.15rem; font-weight: 700; margin: 0;"><i data-lucide="check-circle" style="color: #059669; width: 20px; height: 20px;"></i> Access Approved Successfully</h3>
                    <button class="btn-icon-close" id="btn-close-success-modal" style="background: none; border: none; cursor: pointer; color: #94a3b8;"><i data-lucide="x" style="width: 18px; height: 18px;"></i></button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <p style="font-size: 0.88rem; color: #475569; margin: 0 0 15px; line-height: 1.5;">
                        User credentials have been created, and the onboarding email was successfully triggered. You can also manually copy the login details below:
                    </p>
                    
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Applicant Email</label>
                        <input type="text" readonly value="${email}" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem; outline: none; background: #f8fafc; font-family: inherit;">
                    </div>

                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="font-size: 0.78rem; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Temporary Password</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" readonly value="${password}" id="success-copy-password" style="flex: 1; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem; font-family: monospace; outline: none; background: #f8fafc;">
                            <button id="btn-success-copy-pass" class="btn-primary-sm" style="padding: 0 12px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background-color: var(--primary-color); border: none; color: white; cursor: pointer;"><i data-lucide="copy" style="width: 15px;"></i></button>
                        </div>
                    </div>

                    ${linkHtml}
                </div>
                <div class="modal-footer" style="border-top: 1px solid #f1f5f9; padding: 15px 20px; text-align: right; background: #f8fafc; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;">
                    <button class="btn-secondary" id="btn-close-success-modal-footer" style="padding: 8px 16px; border-radius: 8px; cursor: pointer;">Dismiss</button>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        lucide.createIcons();

        // Copy button event handlers
        const copyPassBtn = document.getElementById('btn-success-copy-pass');
        if (copyPassBtn) {
            copyPassBtn.onclick = () => {
                const passVal = document.getElementById('success-copy-password');
                passVal.select();
                document.execCommand('copy');
                copyPassBtn.innerHTML = '<i data-lucide="check" style="width: 15px; color: #10b981;"></i>';
                lucide.createIcons();
                setTimeout(() => {
                    copyPassBtn.innerHTML = '<i data-lucide="copy" style="width: 15px;"></i>';
                    lucide.createIcons();
                }, 2000);
            };
        }

        const copyLinkBtn = document.getElementById('btn-success-copy-link');
        if (copyLinkBtn) {
            copyLinkBtn.onclick = () => {
                const linkVal = document.getElementById('success-copy-link');
                linkVal.select();
                document.execCommand('copy');
                copyLinkBtn.innerHTML = '<i data-lucide="check" style="width: 15px; color: #10b981;"></i>';
                lucide.createIcons();
                setTimeout(() => {
                    copyLinkBtn.innerHTML = '<i data-lucide="copy" style="width: 15px;"></i>';
                    lucide.createIcons();
                }, 2000);
            };
        }

        // Close handlers
        const closeModal = () => backdrop.remove();
        document.getElementById('btn-close-success-modal').onclick = closeModal;
        document.getElementById('btn-close-success-modal-footer').onclick = closeModal;
    }

    // Navigate to full-page User Profile
    async function showUserProfile(targetUser, backTarget = 'users') {
        profileUserEmail = targetUser.email;
        profileBackTarget = backTarget;

        // Reset search/filter inputs
        elements.profileActivitySearch.value = '';
        elements.profileActivityFilter.value = 'all';

        // Hide other navigation menus and main sections
        elements.btnShowCatalog.classList.remove('active');
        elements.btnShowUsers.classList.remove('active');
        elements.btnShowRequests.classList.remove('active');
        elements.btnShowSchema.classList.remove('active');
        
        elements.catalogViewSection.style.display = 'none';
        elements.usersViewSection.style.display = 'none';
        elements.requestsViewSection.style.display = 'none';
        elements.schemaViewSection.style.display = 'none';
        elements.catNavTitle.style.display = 'none';
        elements.catList.style.display = 'none';
        
        // Show profile section
        elements.profileViewSection.style.display = 'block';

        // Set User Details
        elements.fullProfileEmail.textContent = targetUser.email;
        elements.fullProfileUid.textContent = targetUser.id;
        
        const registeredDate = new Date(targetUser.created_at || targetUser.createdDate || Date.now());
        elements.fullProfileCreatedAt.textContent = registeredDate.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Set Avatar Initial
        const initial = targetUser.email.charAt(0).toUpperCase();
        elements.fullProfileAvatar.textContent = initial;

        // Set Badge
        elements.fullProfileRoleBadge.className = `badge-role role-${targetUser.role}`;
        elements.fullProfileRoleBadge.textContent = targetUser.role.charAt(0).toUpperCase() + targetUser.role.slice(1);

        // Copy UID Action
        elements.btnCopyFullProfileUid.onclick = () => {
            navigator.clipboard.writeText(targetUser.id).then(() => {
                const originalHtml = elements.btnCopyFullProfileUid.innerHTML;
                elements.btnCopyFullProfileUid.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px; color: #059669;"></i>';
                lucide.createIcons();
                setTimeout(() => {
                    elements.btnCopyFullProfileUid.innerHTML = originalHtml;
                    lucide.createIcons();
                }, 2000);
            });
        };

        // Populate Permissions List
        const checkIcon = `<span style="color: #059669; font-weight: 700; margin-right: 8px; font-size: 1rem; font-family: monospace;">+</span>`;
        const crossIcon = `<span style="color: #e11d48; font-weight: 700; margin-right: 8px; font-size: 1rem; font-family: monospace;">-</span>`;
        
        let permsHtml = '';
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
        elements.fullProfilePermissionsList.innerHTML = permsHtml;

        // Fetch user activities
        currentUserLogs = [];
        try {
            // Fetch from audit logs proxy API endpoint (which retrieves from Supabase secondary logs database)
            const response = await fetch('/api/audit-logs');
            if (response.ok) {
                const logs = await response.json();
                currentUserLogs = logs.filter(log => log.email && log.email.toLowerCase() === targetUser.email.toLowerCase());
            }
        } catch (e) {
            console.warn("Failed to retrieve audit logs from secondary Supabase database, using local logs fallback:", e);
        }

        // If proxy database logs are empty, fallback to localStorage logs
        if (currentUserLogs.length === 0) {
            const localLogs = JSON.parse(localStorage.getItem('thrustvault_global_activity_logs')) || [];
            currentUserLogs = localLogs.filter(log => log.email && log.email.toLowerCase() === targetUser.email.toLowerCase())
                                      .map(log => ({
                                          timestamp: log.timestamp,
                                          route: log.details || '',
                                          method: 'LOCAL',
                                          action: log.action || 'Logged Action',
                                          status: 200,
                                          ip_address: '127.0.0.1',
                                          location: 'Local Cache',
                                          risk_level: 'info',
                                          details: log.details || ''
                                      }));
        }

        // Sort descending by timestamp
        currentUserLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // ---- Calculate metrics ----
        elements.profileTotalOps.textContent = currentUserLogs.length;

        // Mutations
        const mutations = currentUserLogs.filter(log => {
            const actionText = (log.action || log.route || '').toLowerCase();
            return actionText.includes('create') || actionText.includes('add') || actionText.includes('update') ||
                   actionText.includes('delete') || actionText.includes('import') || actionText.includes('write') ||
                   (log.method && ['POST', 'PUT', 'DELETE'].includes(log.method.toUpperCase()));
        });
        elements.profileTotalMutations.textContent = mutations.length;

        // Logins
        const logins = currentUserLogs.filter(log => {
            const t = (log.action || log.route || '').toLowerCase();
            return t.includes('login') || t.includes('session start');
        });
        const loginEl = document.getElementById('profile-total-logins');
        if (loginEl) loginEl.textContent = logins.length;

        // Catalog changes
        const catalogChanges = currentUserLogs.filter(log => {
            const t = (log.action || log.route || '').toLowerCase();
            return (t.includes('motor') || t.includes('category') || t.includes('thrust') || t.includes('import') || t.includes('export')) && !t.includes('schema');
        });
        const catalogEl = document.getElementById('profile-catalog-changes');
        if (catalogEl) catalogEl.textContent = catalogChanges.length;

        // Last active timestamp
        const lastActiveEl = document.getElementById('full-profile-last-active');
        if (lastActiveEl && currentUserLogs.length > 0) {
            const latestLog = currentUserLogs[0]; // already sorted desc
            const latestDate = new Date(latestLog.timestamp);
            lastActiveEl.textContent = latestDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + latestDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        } else if (lastActiveEl) {
            lastActiveEl.textContent = 'No activity recorded';
        }

        // ---- Activity Breakdown Donut Chart ----
        renderProfileBreakdownChart();

        // Render activity logs
        renderProfileLogs();
        lucide.createIcons();
    }

    let profileActivityChartInstance = null;
    function renderProfileBreakdownChart() {
        const canvas = document.getElementById('profileActivityChart');
        const legend = document.getElementById('profile-breakdown-legend');
        if (!canvas) return;

        // Categorize
        const loginCount = currentUserLogs.filter(l => {
            const t = (l.action || l.route || '').toLowerCase();
            return t.includes('login') || t.includes('logout') || t.includes('session');
        }).length;
        const catalogCount = currentUserLogs.filter(l => {
            const t = (l.action || l.route || '').toLowerCase();
            return (t.includes('motor') || t.includes('category') || t.includes('import') || t.includes('export')) && !t.includes('schema') && !t.includes('user') && !t.includes('login');
        }).length;
        const schemaCount = currentUserLogs.filter(l => {
            const t = (l.action || l.route || '').toLowerCase();
            return t.includes('schema') || t.includes('custom parameter');
        }).length;
        const userOpsCount = currentUserLogs.filter(l => {
            const t = (l.action || l.route || '').toLowerCase();
            return t.includes('user') || t.includes('role') || t.includes('registration');
        }).length;
        const otherCount = Math.max(0, currentUserLogs.length - loginCount - catalogCount - schemaCount - userOpsCount);

        const labels = ['Logins/Sessions', 'Catalog Actions', 'Schema Changes', 'User Operations', 'Other'];
        const data = [loginCount, catalogCount, schemaCount, userOpsCount, otherCount];
        const colors = ['#8b5cf6', '#2563eb', '#f59e0b', '#ef4444', '#94a3b8'];
        const bgColors = ['#f5f3ff', '#eff6ff', '#fffbeb', '#fee2e2', '#f8fafc'];

        // Destroy previous instance
        if (profileActivityChartInstance) {
            profileActivityChartInstance.destroy();
            profileActivityChartInstance = null;
        }

        if (currentUserLogs.length === 0) {
            if (legend) legend.innerHTML = '<div style="font-size:0.8rem; color:#94a3b8; text-align:center;">No activity data to chart</div>';
            return;
        }

        profileActivityChartInstance = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.label}: ${ctx.raw} (${currentUserLogs.length > 0 ? Math.round(ctx.raw / currentUserLogs.length * 100) : 0}%)`
                        }
                    }
                }
            }
        });

        // Render legend
        if (legend) {
            legend.innerHTML = labels.map((label, i) => data[i] > 0 ? `
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.79rem;">
                    <span style="display:flex; align-items:center; gap:7px;">
                        <span style="width:10px; height:10px; border-radius:50%; background:${colors[i]}; display:inline-block; flex-shrink:0;"></span>
                        <span style="color:#475569;">${label}</span>
                    </span>
                    <span style="font-weight:700; color:#0f172a;">${data[i]}</span>
                </div>
            ` : '').join('');
        }
    }

    // Render activity list with search and filter
    function renderProfileLogs() {
        const query = elements.profileActivitySearch.value.trim().toLowerCase();
        const filterVal = elements.profileActivityFilter.value;

        const filtered = currentUserLogs.filter(log => {
            // Apply search filter
            if (query) {
                const actionMatch = log.action && log.action.toLowerCase().includes(query);
                const routeMatch = log.route && log.route.toLowerCase().includes(query);
                const detailsMatch = log.details && log.details.toLowerCase().includes(query);
                const ipMatch = log.ip_address && log.ip_address.toLowerCase().includes(query);
                const locationMatch = log.location && log.location.toLowerCase().includes(query);
                if (!actionMatch && !routeMatch && !detailsMatch && !ipMatch && !locationMatch) return false;
            }

            // Apply category filter
            const actionText = (log.action || log.route || '').toLowerCase();
            if (filterVal === 'logins') {
                if (!actionText.includes('login') && !actionText.includes('logout') && !actionText.includes('session')) return false;
            } else if (filterVal === 'catalog') {
                const isCatalog = actionText.includes('motor') || actionText.includes('category') || actionText.includes('thrust') || actionText.includes('xlsx') || actionText.includes('template');
                const isSchema = actionText.includes('schema') || actionText.includes('custom parameter');
                if (!isCatalog || isSchema) return false;
            } else if (filterVal === 'schema') {
                if (!actionText.includes('schema') && !actionText.includes('custom parameter')) return false;
            } else if (filterVal === 'users') {
                if (!actionText.includes('user') && !actionText.includes('role') && !actionText.includes('profile') && !actionText.includes('registration')) return false;
            } else if (filterVal === 'suspicious') {
                if (log.risk_level !== 'suspicious') return false;
            }

            return true;
        });

        // Update count badge
        const countBadge = document.getElementById('profile-log-count-badge');
        if (countBadge) countBadge.textContent = filtered.length + ' events';

        if (filtered.length === 0) {
            elements.fullProfileActivityContainer.style.display = 'none';
            elements.profileActivityEmpty.style.display = 'flex';
            elements.profileActivityEmpty.style.flexDirection = 'column';
            elements.profileActivityEmpty.style.alignItems = 'center';
            return;
        }

        elements.fullProfileActivityContainer.style.display = 'flex';
        elements.profileActivityEmpty.style.display = 'none';

        elements.fullProfileActivityContainer.innerHTML = filtered.map(log => {
            const date = new Date(log.timestamp);
            const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            
            let iconName = 'activity';
            let iconColor = '#64748b'; // slate
            const actionText = (log.action || log.route || '').toLowerCase();

            if (actionText.includes('login')) {
                iconName = 'log-in';
                iconColor = '#10b981'; // green
            } else if (actionText.includes('logout')) {
                iconName = 'log-out';
                iconColor = '#f59e0b'; // amber
            } else if (actionText.includes('create') || actionText.includes('add') || actionText.includes('new')) {
                iconName = 'plus-circle';
                iconColor = '#2563eb'; // blue
            } else if (actionText.includes('update') || actionText.includes('edit')) {
                iconName = 'edit-3';
                iconColor = '#8b5cf6'; // purple
            } else if (actionText.includes('delete') || actionText.includes('remove')) {
                iconName = 'trash-2';
                iconColor = '#ef4444'; // red
            } else if (actionText.includes('import')) {
                iconName = 'file-input';
                iconColor = '#6366f1'; // indigo
            } else if (actionText.includes('export')) {
                iconName = 'download';
                iconColor = '#06b6d4'; // cyan
            }

            const badgeHtml = log.risk_level === 'suspicious' ? 
                `<span class="badge-role" style="background:#ffe4e6; color:#e11d48; font-weight:700; margin-left:6px; font-size:0.65rem; padding:2px 6px;">Suspicious</span>` : '';

            const detailsText = log.details || log.route || 'No details provided.';

            return `
                <div style="display: flex; gap: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; align-items: flex-start;">
                    <div style="background: ${iconColor}15; color: ${iconColor}; border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                        <i data-lucide="${iconName}" style="width: 16px; height: 16px;"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap;">
                            <span style="font-weight: 600; font-size: 0.9rem; color: #0f172a; display: flex; align-items: center; gap: 4px;">
                                ${log.action || log.method || 'User Event'} ${badgeHtml}
                            </span>
                            <span style="font-size: 0.75rem; color: #94a3b8; white-space: nowrap;">${dateStr} @ ${timeStr}</span>
                        </div>
                        <p style="font-size: 0.85rem; color: #475569; margin: 4px 0 0 0; line-height: 1.4; word-break: break-word;">${detailsText}</p>
                        <div style="display: flex; gap: 12px; margin-top: 6px; font-size: 0.75rem; color: #94a3b8;">
                            <span><i data-lucide="hash" style="width:12px; height:12px; vertical-align:middle; margin-right:2px;"></i> IP: ${log.ip_address || 'N/A'}</span>
                            <span><i data-lucide="map-pin" style="width:12px; height:12px; vertical-align:middle; margin-right:2px;"></i> Location: ${log.location || 'N/A'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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
        document.getElementById('form-motor-thrust-unit').value = 'kg';
        document.getElementById('thrust-conversion-preview').textContent = '';
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
        elements.profileViewSection.style.display = 'none';
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

    // Bind motor profile overlay back button
    const backBtn = document.getElementById('btn-motor-profile-back');
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

    // Bind Profile View Search and Filter Controls
    elements.profileActivitySearch.oninput = () => {
        renderProfileLogs();
        lucide.createIcons();
    };

    elements.profileActivityFilter.onchange = () => {
        renderProfileLogs();
        lucide.createIcons();
    };

    // Bind Access Requests Search and Filter Controls
    if (elements.requestsSearch) {
        elements.requestsSearch.oninput = () => {
            renderAccessRequestsList();
        };
    }

    if (elements.requestsFilterStatus) {
        elements.requestsFilterStatus.onchange = () => {
            renderAccessRequestsList();
        };
    }

    elements.btnProfileBack.onclick = () => {
        if (profileBackTarget === 'catalog') {
            elements.btnShowCatalog.click();
        } else if (profileBackTarget === 'requests') {
            elements.btnShowRequests.click();
        } else {
            elements.btnShowUsers.click();
        }
    };

    // Sidebar Profile Click Trigger
    const sidebarProfileCard = document.querySelector('.sidebar-user-profile');
    if (sidebarProfileCard) {
        sidebarProfileCard.style.cursor = 'pointer';
        sidebarProfileCard.title = 'View My Profile';
        sidebarProfileCard.onclick = () => {
            const myUser = state.users.find(x => x.email === session.email) || {
                email: session.email,
                role: session.role,
                id: session.uid || 'My Session UID',
                created_at: new Date(session.timestamp || Date.now()).toISOString()
            };
            showUserProfile(myUser, 'catalog');
        };
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
            await fetchAccessRequests();

            // Auto-switch to view requested by cross-page nav links (e.g., "User Management" from exports page)
            const requestedView = sessionStorage.getItem('adminView');
            if (requestedView) {
                sessionStorage.removeItem('adminView');
                if (requestedView === 'users' && elements.btnShowUsers) {
                    setTimeout(() => elements.btnShowUsers.click(), 300);
                } else if (requestedView === 'schema' && elements.btnShowSchema) {
                    setTimeout(() => elements.btnShowSchema.click(), 300);
                } else if (requestedView === 'requests' && elements.btnShowRequests) {
                    setTimeout(() => elements.btnShowRequests.click(), 300);
                }
            }
        } catch (e) {
            console.error("Initialization failed", e);
            await logoutAndRedirect();
        }
    }

    init();
});
