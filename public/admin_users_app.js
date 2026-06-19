// admin_users_app.js
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

    // Bind password visibility toggles
    document.querySelectorAll('.btn-password-toggle').forEach(btn => {
        btn.onclick = () => {
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            if (targetInput) {
                const isPass = targetInput.type === 'password';
                targetInput.type = isPass ? 'text' : 'password';
                btn.innerHTML = `<i data-lucide="${isPass ? 'eye-off' : 'eye'}" style="position:static; color:inherit; pointer-events:none; width:16px; height:16px;"></i>`;
                if (window.lucide) window.lucide.createIcons();
            }
        };
    });

    // Caps Lock Warning Handler for User Creation Form
    const userPassInput = document.getElementById('form-user-password');
    const userCapsWarning = document.getElementById('caps-warning-user-password');
    if (userPassInput && userCapsWarning) {
        const checkUserCaps = (e) => {
            if (e.getModifierState && e.getModifierState('CapsLock')) {
                userCapsWarning.style.display = 'flex';
            } else {
                userCapsWarning.style.display = 'none';
            }
        };
        userPassInput.addEventListener('keyup', checkUserCaps);
        userPassInput.addEventListener('keydown', checkUserCaps);
        userPassInput.addEventListener('focus', checkUserCaps);
        userPassInput.addEventListener('blur', () => {
            userCapsWarning.style.display = 'none';
        });
    }

    // Password Strength Meter Handler for User Creation Form
    const evaluateStrength = (password) => {
        let score = 0;
        if (!password) return { score, text: 'Weak', color: '#ef4444', width: '0%' };
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;

        switch(score) {
            case 0:
            case 1:
                return { score, text: 'Weak', color: '#ef4444', width: '25%' };
            case 2:
                return { score, text: 'Fair', color: '#f97316', width: '50%' };
            case 3:
                return { score, text: 'Good', color: '#3b82f6', width: '75%' };
            case 4:
            default:
                return { score, text: 'Strong', color: '#10b981', width: '100%' };
        }
    };

    const userStrengthMeter = document.getElementById('strength-user-password');
    if (userPassInput && userStrengthMeter) {
        const fill = userStrengthMeter.querySelector('.strength-bar-fill');
        const text = userStrengthMeter.querySelector('.strength-label-text');

        userPassInput.addEventListener('input', () => {
            const val = userPassInput.value;
            if (!val) {
                userStrengthMeter.style.display = 'none';
                return;
            }
            userStrengthMeter.style.display = 'flex';
            const res = evaluateStrength(val);
            fill.style.width = res.width;
            fill.style.backgroundColor = res.color;
            text.textContent = res.text;
            text.style.color = res.color;
        });
    }

    let supabase = null;
    let state = {
        users: [],
        categories: [],
        motors: [],
        accessRequests: [],
        currentUserLogs: [],
        profileUserEmail: null
    };

    // DOM Elements
    const elements = {
        get catList() { return document.getElementById('category-list-container'); },
        get totalMotors() { return document.getElementById('total-motors-count'); },
        get totalCats() { return document.getElementById('total-categories-count'); },
        get btnLogout() { return document.getElementById('btn-logout'); },
        get btnAddCat() { return document.getElementById('btn-add-category'); },
        get requestsPendingBadge() { return document.getElementById('requests-pending-badge'); },
        
        // Users Specific Elements
        userForm: document.getElementById('admin-user-form'),
        usersTableBody: document.getElementById('user-accounts-list-rows'),
        confirmModal: document.getElementById('confirm-modal'),

        // Profile Specific Elements
        profileViewSection: document.getElementById('profile-view-section'),
        usersViewSection: document.getElementById('users-view-section'),
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
        profileLogCountBadge: document.getElementById('profile-log-count-badge')
    };

    // View profile back target helper
    let profileActivityChartInstance = null;

    // Helper functions for modal operations
    function openModal(modal) { modal.classList.add('show'); }
    function closeModal(modal) { modal.classList.remove('show'); }

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

    // Logout and redirect helper
    function logoutAndRedirect(action = 'Logout', details = 'Logged out successfully.') {
        if (session) {
            logUserActivity(session.email, session.role, action, details);
        }
        fetch('/api/auth/logout', { method: 'POST' }).catch(e => console.error("Logout error:", e));
        localStorage.removeItem('thrustvault_session');
        const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `thrustvault_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict${secureFlag}`;
        window.location.href = '/';
    }

    

    // Throttled timer logic
    let inactivityTimeout;
    let lastSyncTime = Date.now();

    function resetInactivityTimer() {
        clearTimeout(inactivityTimeout);
        // inactivityTimeout = setTimeout(autoLogout, 600000); // 10 minutes (disabled)

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

    // Sidebar navigation trigger is setup dynamically in setupSidebar()

    // =========================================================================
    // CORE SERVICES: CATEGORIES & SIDEBAR COUNTERS
    // =========================================================================
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
                        const res = await fetch(`/api/intern/categories/${cat.id}`, {
                            method: 'DELETE'
                        });
                        if (!res.ok) {
                            const errData = await res.json();
                            throw new Error(errData.error || `HTTP ${res.status}`);
                        }
                        logUserActivity(session.email, session.role, 'Category Deleted', `Deleted category: ${cat.name}`);
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
            window.location.href = '/admin/explorer';
        };
        elements.catList.appendChild(allTab);
        if (window.lucide) window.lucide.createIcons();
    }

    // =========================================================================
    // USER ACCOUNT MANAGEMENT & PROFILE CONTRIB
    // =========================================================================
    function renderUserAccountsSkeleton() {
        if (!elements.usersTableBody) return;
        let skeletonHtml = '';
        for (let i = 0; i < 4; i++) {
            const width = [150, 180, 130, 160][i % 4];
            skeletonHtml += `
                <tr>
                    <td>
                        <div class="user-email-cell" style="display:flex; align-items:center; gap:12px;">
                            <div class="shimmer skeleton-circle-shimmer" style="width: 34px; height: 34px; border-radius:50%; flex-shrink: 0;"></div>
                            <div style="display:flex; flex-direction:column; gap:6px;">
                                <div class="shimmer skeleton-text" style="width: ${width}px; height: 12px; margin:0;"></div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="shimmer skeleton-badge-shimmer" style="width: 100px; height: 24px; border-radius: 6px;"></div>
                    </td>
                    <td>
                        <div class="shimmer skeleton-text" style="width: 80px; height: 12px; margin:0;"></div>
                    </td>
                    <td style="text-align: right; vertical-align: middle; white-space: nowrap;">
                        <div class="row-actions" style="display: inline-flex; gap: 8px; justify-content: flex-end; align-items: center; vertical-align: middle;">
                            <div class="shimmer" style="width: 68px; height: 24px; border-radius: var(--radius-md);"></div>
                            <div class="shimmer" style="width: 28px; height: 24px; border-radius: var(--radius-md);"></div>
                        </div>
                    </td>
                </tr>
            `;
        }
        elements.usersTableBody.innerHTML = skeletonHtml;
    }

    async function fetchUserAccounts() {
        try {
            renderUserAccountsSkeleton();
            const res = await fetch('/api/admin/users?order=email.asc');
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || `HTTP ${res.status}`);
            }
            const users = await res.json();
            state.users = users || [];
            renderUserAccountsList();

            const showMyProfileFlag = sessionStorage.getItem('showMyProfile');
            if (showMyProfileFlag === 'true') {
                sessionStorage.removeItem('showMyProfile');
                const myUser = state.users.find(x => x.email === session.email) || {
                    email: session.email,
                    role: session.role,
                    id: session.uid || 'My Session UID',
                    created_at: new Date(session.timestamp || Date.now()).toISOString()
                };
                showUserProfile(myUser);
            }
        } catch (err) {
            console.error("Error fetching users:", err);
        }
    }

    function generateAvatarColor(email) {
        const colors = [
            'linear-gradient(135deg, #3b82f6, #1d4ed8)', // Blue
            'linear-gradient(135deg, #10b981, #047857)', // Emerald
            'linear-gradient(135deg, #8b5cf6, #6d28d9)', // Violet
            'linear-gradient(135deg, #f59e0b, #b45309)', // Amber
            'linear-gradient(135deg, #ec4899, #be185d)', // Pink
            'linear-gradient(135deg, #14b8a6, #0f766e)', // Teal
            'linear-gradient(135deg, #f43f5e, #be123c)', // Rose
            'linear-gradient(135deg, #6366f1, #4338ca)'  // Indigo
        ];
        let hash = 0;
        for (let i = 0; i < email.length; i++) {
            hash = email.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    }

    function renderUserAccountsList() {
        if (!elements.usersTableBody) return;
        elements.usersTableBody.innerHTML = '';

        const searchQuery = document.getElementById('search-users-input')?.value.trim().toLowerCase() || '';
        const roleFilter = document.getElementById('filter-users-role')?.value || 'all';

        const filtered = state.users.filter(u => {
            if (searchQuery && !u.email.toLowerCase().includes(searchQuery)) return false;
            if (roleFilter !== 'all' && u.role !== roleFilter) return false;
            return true;
        });

        if (filtered.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted); font-style:italic;">
                    No accounts found matching the filters.
                </td>
            `;
            elements.usersTableBody.appendChild(tr);
            return;
        }

        filtered.forEach(u => {
            const tr = document.createElement('tr');
            const createdDate = new Date(u.created_at).toLocaleDateString();
            const isSelf = u.email === session.email;
            const avatarColor = generateAvatarColor(u.email);
            const initial = u.email.charAt(0).toUpperCase();
            
            tr.innerHTML = `
                <td>
                    <div class="user-email-cell" style="display:flex; align-items:center; gap:12px;">
                        <div class="user-avatar-circle" style="background:${avatarColor}; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; flex-shrink:0; font-family:'Outfit'; font-size:0.95rem;">${initial}</div>
                        <div style="display:flex; flex-direction:column;">
                            <strong style="color:var(--text-main); font-size:0.9rem;">${u.email}</strong>
                            ${isSelf ? '<span style="font-size:0.7rem; color:var(--primary-color); font-weight:600; margin-top:2px;">(You)</span>' : ''}
                        </div>
                    </div>
                </td>
                <td>
                    <select class="user-role-select form-group" style="padding:4px 8px; font-size:0.85rem;" data-id="${u.id}" ${isSelf ? 'disabled' : ''}>
                        <option value="guest" ${u.role === 'guest' ? 'selected' : ''}>Guest (Read-only)</option>
                        <option value="intern" ${u.role === 'intern' ? 'selected' : ''}>Intern (Read/Write Catalog)</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin (Full Control)</option>
                    </select>
                </td>
                <td>${createdDate}</td>
                <td style="text-align: right; vertical-align: middle; white-space: nowrap;">
                    <div class="row-actions" style="display: inline-flex; gap: 8px; justify-content: flex-end; align-items: center; vertical-align: middle;">
                        <button class="btn-outline-sm btn-view-profile" data-id="${u.id}" title="View Profile" style="padding: 4px 8px; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 4px;">
                            <i data-lucide="user" style="width:12px; height:12px;"></i> Profile
                        </button>
                        <button class="btn-delete btn-delete-user" data-id="${u.id}" title="Delete User" ${isSelf ? 'disabled style="opacity:0.4;"' : ''}>
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
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
                showUserProfile(targetUser);
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
                    const res = await fetch(`/api/admin/users/${userId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role: newRole })
                    });
                    if (!res.ok) {
                        const errData = await res.json();
                        throw new Error(errData.error || `HTTP ${res.status}`);
                    }
                    logUserActivity(session.email, session.role, 'User Role Changed', `Changed role of ${targetUser ? targetUser.email : userId} from ${oldRole.toUpperCase()} to ${newRole.toUpperCase()}`);
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
                        const res = await fetch('/api/admin/rpc/delete_vault_user', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id: userId })
                        });
                        if (!res.ok) {
                            const errData = await res.json();
                            throw new Error(errData.error || `HTTP ${res.status}`);
                        }
                        logUserActivity(session.email, session.role, 'User Account Deleted', `Permanently deleted user account: ${targetUser.email}`);
                        await fetchUserAccounts();
                    } catch (err) {
                        alert("RPC delete failed: " + err.message);
                    }
                }
            };
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // Submit Action for Creating Users
    elements.userForm.onsubmit = async (e) => {
        e.preventDefault();
        const emailVal = document.getElementById('form-user-email').value.trim();
        const passVal = document.getElementById('form-user-password').value;
        const roleVal = document.getElementById('form-user-role').value;

        if (!emailVal || !passVal || !roleVal) return;

        try {
            const res = await fetch('/api/admin/rpc/create_vault_user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email_val: emailVal,
                    password_val: passVal,
                    role_val: roleVal
                })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            logUserActivity(session.email, session.role, 'User Account Created', `Created ${roleVal.toUpperCase()} account for: ${emailVal}`);
            elements.userForm.reset();

            // Trigger email notification
            try {
                await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'created',
                        to: emailVal,
                        requested_role: roleVal,
                        temp_password: passVal
                    })
                });
            } catch (emailErr) {
                console.error("Failed to trigger welcome email notification:", emailErr);
            }

            // Close the creation modal
            const createUserModal = document.getElementById('create-user-modal');
            if (createUserModal) closeModal(createUserModal);

            // Render custom success feedback modal
            createTemporarySuccessModal(emailVal, passVal, roleVal);
            await fetchUserAccounts();
        } catch (err) {
            alert("RPC account creation failed: " + err.message);
        }
    };

    function createTemporarySuccessModal(email, pass, role) {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop show';
        backdrop.innerHTML = `
            <div class="modal-container modal-sm" style="width: 420px; background: var(--bg-panel-solid); border: 1px solid var(--border-color);">
                <div class="modal-header" style="border-bottom: 1px solid var(--border-color); padding-bottom:12px;">
                    <h3 style="color: var(--success-color); font-family:'Outfit'; display:flex; align-items:center; gap:8px;"><i data-lucide="check-circle"></i> Account Created</h3>
                    <button class="btn-icon-close" id="btn-close-success-modal"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body" style="padding: 20px 0;">
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:14px;">The credentials have been saved, and a welcome email notification has been triggered.</p>
                    <div style="background:var(--bg-base); border:1px solid var(--border-color); border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem;">
                            <span style="color:var(--text-secondary);">Role:</span>
                            <span class="badge-role role-${role}" style="font-weight:700;">${role.toUpperCase()}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem;">
                            <span style="color:var(--text-secondary);">Email:</span>
                            <strong style="color:var(--text-primary);">${email}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; border-top:1px dashed var(--border-color); padding-top:6px;">
                            <span style="color:var(--text-secondary);">Password:</span>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <strong style="color:var(--text-primary); font-family:monospace; font-size:0.85rem;">${pass}</strong>
                                <button id="btn-success-copy-pass" style="background:none; border:none; cursor:pointer; padding:2px; display:inline-flex; align-items:center; color:var(--text-secondary);" title="Copy Password"><i data-lucide="copy" style="width: 14px; height: 14px;"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="border-top:1px solid var(--border-color); padding-top:12px; display:flex; justify-content:space-between; gap:12px;">
                    <button class="btn-outline" id="btn-success-copy-invite" style="font-size:0.8rem; padding: 6px 12px; display:inline-flex; align-items:center; gap:6px;">
                        <i data-lucide="share-2" style="width:14px; height:14px;"></i> Copy Invite Message
                    </button>
                    <button class="btn-primary" id="btn-close-success-modal-footer" style="padding: 6px 16px;">Done</button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        if (window.lucide) window.lucide.createIcons();

        const copyPassBtn = backdrop.querySelector('#btn-success-copy-pass');
        copyPassBtn.onclick = () => {
            navigator.clipboard.writeText(pass).then(() => {
                copyPassBtn.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px; color: #10b981;"></i>';
                if (window.lucide) window.lucide.createIcons();
                setTimeout(() => {
                    copyPassBtn.innerHTML = '<i data-lucide="copy" style="width: 14px; height: 14px;"></i>';
                    if (window.lucide) window.lucide.createIcons();
                }, 2000);
            });
        };

        const copyInviteBtn = backdrop.querySelector('#btn-success-copy-invite');
        copyInviteBtn.onclick = () => {
            const loginUrl = window.location.origin + '/login';
            const inviteMsg = `Welcome to ThrustVault!\n\nAn account has been created for you. You can access the UAV motor database console using the credentials below:\n\nLogin Link: ${loginUrl}\nRole: ${role.toUpperCase()}\nEmail: ${email}\nPassword: ${pass}\n\nPlease sign in and change your password upon your first login.`;
            
            navigator.clipboard.writeText(inviteMsg).then(() => {
                copyInviteBtn.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px; color: #10b981;"></i> Message Copied!';
                if (window.lucide) window.lucide.createIcons();
                setTimeout(() => {
                    copyInviteBtn.innerHTML = '<i data-lucide="share-2" style="width: 14px; height: 14px;"></i> Copy Invite Message';
                    if (window.lucide) window.lucide.createIcons();
                }, 2000);
            });
        };

        const closeModal = () => backdrop.remove();
        backdrop.querySelector('#btn-close-success-modal').onclick = closeModal;
        backdrop.querySelector('#btn-close-success-modal-footer').onclick = closeModal;
    }

    function renderProfileLogsSkeleton() {
        if (!elements.fullProfileActivityContainer) return;
        let skeletonHtml = '';
        for (let i = 0; i < 3; i++) {
            const width1 = [120, 150, 100][i % 3];
            const width2 = [90, 75, 85][i % 3];
            skeletonHtml += `
                <div style="display:flex; gap:12px; padding:12px; background:var(--bg-base); border:1px solid var(--border-color); border-radius:10px; align-items:start;">
                    <div class="shimmer skeleton-circle-shimmer" style="width:32px; height:32px; flex-shrink:0;"></div>
                    <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                            <div class="shimmer skeleton-text" style="width:${width1}px; height:12px; margin:0;"></div>
                            <div class="shimmer skeleton-text" style="width:60px; height:10px; margin:0;"></div>
                        </div>
                        <div class="shimmer skeleton-text" style="width:${width2}%; height:12px; margin:0;"></div>
                    </div>
                </div>
            `;
        }
        elements.fullProfileActivityContainer.innerHTML = skeletonHtml;
    }

    function renderProfileContributionCalendarSkeleton() {
        const gridContainer = document.getElementById('contribution-calendar-grid');
        if (!gridContainer) return;
        gridContainer.innerHTML = '';
        let html = '';
        for (let i = 0; i < 371; i++) {
            html += `<div class="contrib-cell shimmer" style="cursor:default; transform:none; box-shadow:none; background-color:#e2e8f0; opacity:0.6;"></div>`;
        }
        gridContainer.innerHTML = html;
    }

    // User profile detail sub-pages
    async function showUserProfile(targetUser) {
        state.profileUserEmail = targetUser.email;

        // Reset inputs
        elements.profileActivitySearch.value = '';
        elements.profileActivityFilter.value = 'all';

        // Swap sections
        elements.usersViewSection.style.display = 'none';
        elements.profileViewSection.style.display = 'flex';

        elements.fullProfileEmail.textContent = targetUser.email;
        elements.fullProfileUid.textContent = targetUser.id;
        
        const registeredDate = new Date(targetUser.created_at || Date.now());
        elements.fullProfileCreatedAt.textContent = registeredDate.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const initial = targetUser.email.charAt(0).toUpperCase();
        elements.fullProfileAvatar.textContent = initial;

        elements.fullProfileRoleBadge.className = `badge-role role-${targetUser.role}`;
        elements.fullProfileRoleBadge.textContent = targetUser.role.charAt(0).toUpperCase() + targetUser.role.slice(1);

        elements.btnCopyFullProfileUid.onclick = () => {
            navigator.clipboard.writeText(targetUser.id).then(() => {
                const originalHtml = elements.btnCopyFullProfileUid.innerHTML;
                elements.btnCopyFullProfileUid.innerHTML = '<i data-lucide="check" style="width: 14px; height: 14px; color: #059669;"></i>';
                if (window.lucide) window.lucide.createIcons();
                setTimeout(() => {
                    elements.btnCopyFullProfileUid.innerHTML = originalHtml;
                    if (window.lucide) window.lucide.createIcons();
                }, 2000);
            });
        };

        const checkIcon = `<span style="color: var(--success-color); font-weight: 700; margin-right: 8px;">+</span>`;
        const crossIcon = `<span style="color: var(--danger-color); font-weight: 700; margin-right: 8px;">-</span>`;
        
        let permsHtml = '';
        if (targetUser.role === 'admin') {
            permsHtml = `
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-secondary);">${checkIcon} Access motor catalog</div>
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-secondary);">${checkIcon} Add, edit, or delete motors</div>
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-secondary);">${checkIcon} Add, edit, or delete categories</div>
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-secondary);">${checkIcon} Administer user roles & registrations</div>
            `;
        } else if (targetUser.role === 'intern') {
            permsHtml = `
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-secondary);">${checkIcon} Access motor catalog</div>
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-secondary);">${checkIcon} Add, edit, or delete motors</div>
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-secondary);">${checkIcon} Add, edit, or delete categories</div>
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-muted); text-decoration: line-through;">${crossIcon} Administer user roles & registrations</div>
            `;
        } else {
            permsHtml = `
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-secondary);">${checkIcon} Access motor catalog</div>
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-muted); text-decoration: line-through;">${crossIcon} Add, edit, or delete motors</div>
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-muted); text-decoration: line-through;">${crossIcon} Add, edit, or delete categories</div>
                <div style="display: flex; align-items: center; font-size: 0.85rem; color: var(--text-muted); text-decoration: line-through;">${crossIcon} Administer user roles & registrations</div>
            `;
        }
        elements.fullProfilePermissionsList.innerHTML = permsHtml;

        state.currentUserLogs = [];
        
        // Show shimmer loader placeholders
        renderProfileLogsSkeleton();
        renderProfileContributionCalendarSkeleton();
        elements.profileTotalOps.innerHTML = '<div class="shimmer skeleton-text" style="width:30px; height:16px; margin:0;"></div>';
        elements.profileTotalMutations.innerHTML = '<div class="shimmer skeleton-text" style="width:30px; height:16px; margin:0;"></div>';
        
        let skLoginsEl = document.getElementById('profile-total-logins');
        if (skLoginsEl) skLoginsEl.innerHTML = '<div class="shimmer skeleton-text" style="width:30px; height:16px; margin:0;"></div>';
        let skCatChangesEl = document.getElementById('profile-catalog-changes');
        if (skCatChangesEl) skCatChangesEl.innerHTML = '<div class="shimmer skeleton-text" style="width:30px; height:16px; margin:0;"></div>';
        let skLastActiveEl = document.getElementById('full-profile-last-active');
        if (skLastActiveEl) skLastActiveEl.innerHTML = '<div class="shimmer skeleton-text" style="width:70px; height:14px; margin:0;"></div>';

        let skCanvas = document.getElementById('profileActivityChart');
        if (skCanvas) {
            skCanvas.style.display = 'none';
            let chartSkeleton = document.getElementById('profile-chart-skeleton');
            if (!chartSkeleton) {
                chartSkeleton = document.createElement('div');
                chartSkeleton.id = 'profile-chart-skeleton';
                chartSkeleton.className = 'shimmer skeleton-circle-shimmer';
                chartSkeleton.style.cssText = 'width:120px; height:120px; position:absolute; border-radius:50%;';
                skCanvas.parentNode.appendChild(chartSkeleton);
            } else {
                chartSkeleton.style.display = 'block';
            }
        }
        let skLegend = document.getElementById('profile-breakdown-legend');
        if (skLegend) {
            skLegend.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="shimmer skeleton-text" style="width:80px; height:12px; margin:0;"></div>
                    <div class="shimmer skeleton-text" style="width:20px; height:12px; margin:0;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                    <div class="shimmer skeleton-text" style="width:100px; height:12px; margin:0;"></div>
                    <div class="shimmer skeleton-text" style="width:20px; height:12px; margin:0;"></div>
                </div>
            `;
        }

        try {
            const response = await fetch('/api/audit-logs');
            if (response.ok) {
                const logs = await response.json();
                state.currentUserLogs = logs.filter(log => log.email && log.email.toLowerCase() === targetUser.email.toLowerCase());
            }
        } catch (e) {
            console.warn("Failed to retrieve audit logs, using fallback:", e);
        }

        if (state.currentUserLogs.length === 0) {
            const localLogs = JSON.parse(localStorage.getItem('thrustvault_global_activity_logs')) || [];
            state.currentUserLogs = localLogs.filter(log => log.email && log.email.toLowerCase() === targetUser.email.toLowerCase())
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

        // Populate profile stats
        elements.profileTotalOps.textContent = state.currentUserLogs.length;
        const writes = state.currentUserLogs.filter(l => {
            const act = (l.action || l.route || l.details || '').toLowerCase();
            return act.includes('create') || act.includes('add') || act.includes('update') || act.includes('delete') || act.includes('edit') || act.includes('import');
        }).length;
        elements.profileTotalMutations.textContent = writes;

        // Logins count
        const logins = state.currentUserLogs.filter(l => (l.action || l.route || l.details || '').toLowerCase().includes('login')).length;
        const loginsEl = document.getElementById('profile-total-logins');
        if (loginsEl) loginsEl.textContent = logins;

        // Catalog changes count
        const catChanges = state.currentUserLogs.filter(l => {
            const act = (l.action || l.route || l.details || '').toLowerCase();
            return (act.includes('motor') || act.includes('category')) && !act.includes('schema') && !act.includes('role');
        }).length;
        const catChangesEl = document.getElementById('profile-catalog-changes');
        if (catChangesEl) catChangesEl.textContent = catChanges;

        // Last active
        const lastActiveEl = document.getElementById('full-profile-last-active');
        if (lastActiveEl) {
            if (state.currentUserLogs.length > 0) {
                lastActiveEl.textContent = new Date(state.currentUserLogs[0].timestamp).toLocaleDateString();
            } else {
                lastActiveEl.textContent = 'Never';
            }
        }

        renderProfileBreakdownChart();
        renderProfileLogs();
        renderProfileContributionCalendar();
    }

    elements.btnProfileBack.onclick = () => {
        elements.profileViewSection.style.display = 'none';
        elements.usersViewSection.style.display = 'flex';
    };

    function renderProfileBreakdownChart() {
        const canvas = document.getElementById('profileActivityChart');
        const legend = document.getElementById('profile-breakdown-legend');
        if (!canvas) return;

        const chartSkeleton = document.getElementById('profile-chart-skeleton');
        if (chartSkeleton) chartSkeleton.style.display = 'none';
        canvas.style.display = 'block';

        const loginCount = state.currentUserLogs.filter(l => {
            const t = (l.action || l.route || l.details || '').toLowerCase();
            return t.includes('login') || t.includes('logout') || t.includes('session');
        }).length;
        const catalogCount = state.currentUserLogs.filter(l => {
            const t = (l.action || l.route || l.details || '').toLowerCase();
            return (t.includes('motor') || t.includes('category') || t.includes('import') || t.includes('export')) && !t.includes('schema') && !t.includes('user') && !t.includes('login');
        }).length;
        const schemaCount = state.currentUserLogs.filter(l => {
            const t = (l.action || l.route || l.details || '').toLowerCase();
            return t.includes('schema') || t.includes('custom parameter');
        }).length;
        const userOpsCount = state.currentUserLogs.filter(l => {
            const t = (l.action || l.route || l.details || '').toLowerCase();
            return t.includes('user') || t.includes('role') || t.includes('registration');
        }).length;
        const otherCount = Math.max(0, state.currentUserLogs.length - loginCount - catalogCount - schemaCount - userOpsCount);

        const labels = ['Logins/Sessions', 'Catalog Actions', 'Schema Changes', 'User Operations', 'Other'];
        const data = [loginCount, catalogCount, schemaCount, userOpsCount, otherCount];
        const colors = ['#8b5cf6', '#2563eb', '#f59e0b', '#ef4444', '#94a3b8'];

        if (profileActivityChartInstance) {
            profileActivityChartInstance.destroy();
            profileActivityChartInstance = null;
        }

        if (state.currentUserLogs.length === 0) {
            if (legend) legend.innerHTML = '<div style="font-size:0.8rem; color:#94a3b8; text-align:center;">No activity data to chart</div>';
            return;
        }

        const panelColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel-solid').trim() || '#ffffff';
        profileActivityChartInstance = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: panelColor, hoverOffset: 6 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: { display: false }
                }
            }
        });

        if (legend) {
            legend.innerHTML = labels.map((label, i) => data[i] > 0 ? `
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.79rem;">
                    <span style="display:flex; align-items:center; gap:7px;">
                        <span style="width:10px; height:10px; border-radius:50%; background:${colors[i]}; display:inline-block; flex-shrink:0;"></span>
                        <span style="color:var(--text-secondary);">${label}</span>
                    </span>
                    <span style="font-weight:700; color:var(--text-primary);">${data[i]}</span>
                </div>
            ` : '').join('');
        }
    }

    function renderProfileLogs() {
        if (!elements.fullProfileActivityContainer) return;
        elements.fullProfileActivityContainer.innerHTML = '';

        const searchQuery = elements.profileActivitySearch.value.trim().toLowerCase();
        const filterType = elements.profileActivityFilter.value;

        const filtered = state.currentUserLogs.filter(log => {
            // Search filter
            if (searchQuery) {
                const actMatches = log.action && log.action.toLowerCase().includes(searchQuery);
                const detailsMatches = log.details && log.details.toLowerCase().includes(searchQuery);
                const routeMatches = log.route && log.route.toLowerCase().includes(searchQuery);
                if (!actMatches && !detailsMatches && !routeMatches) return false;
            }

            // Type filter
            if (filterType !== 'all') {
                const act = (log.action || '').toLowerCase();
                const route = (log.route || '').toLowerCase();
                const targetText = act + ' ' + route;

                if (filterType === 'logins') {
                    if (!targetText.includes('login') && !targetText.includes('logout') && !targetText.includes('session')) return false;
                } else if (filterType === 'catalog') {
                    if ((!targetText.includes('motor') && !targetText.includes('category') && !targetText.includes('import') && !targetText.includes('export')) || targetText.includes('schema') || targetText.includes('user')) return false;
                } else if (filterType === 'schema') {
                    if (!targetText.includes('schema') && !targetText.includes('custom parameter')) return false;
                } else if (filterType === 'users') {
                    if (!targetText.includes('user') && !targetText.includes('role') && !targetText.includes('registration')) return false;
                }
            }
            return true;
        });

        elements.profileLogCountBadge.textContent = `${filtered.length} event${filtered.length === 1 ? '' : 's'}`;

        if (filtered.length === 0) {
            elements.profileActivityEmpty.style.display = 'block';
            return;
        }
        elements.profileActivityEmpty.style.display = 'none';

        filtered.forEach(log => {
            const timeStr = new Date(log.timestamp).toLocaleString();
            let icon = 'activity';
            let color = '#2563eb';

            const actLower = (log.action || log.route || log.details || '').toLowerCase();
            if (actLower.includes('login') || actLower.includes('logout')) {
                icon = 'key';
                color = '#8b5cf6';
            } else if (actLower.includes('create') || actLower.includes('add')) {
                icon = 'plus-circle';
                color = '#10b981';
            } else if (actLower.includes('delete') || actLower.includes('remove')) {
                icon = 'trash';
                color = '#ef4444';
            } else if (actLower.includes('update') || actLower.includes('edit')) {
                icon = 'edit-3';
                color = '#f59e0b';
            }

            const item = document.createElement('div');
            item.style.cssText = 'display:flex; gap:12px; padding:12px; background:var(--bg-base); border:1px solid var(--border-color); border-radius:10px; align-items:start;';
            item.innerHTML = `
                <div style="width:32px; height:32px; border-radius:50%; background:${color}15; display:flex; align-items:center; justify-content:center; color:${color}; flex-shrink:0;">
                    <i data-lucide="${icon}" style="width:16px; height:16px;"></i>
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
                        <strong style="font-size:0.85rem; color:var(--text-primary);">${log.action || 'Activity'}</strong>
                        <span style="font-size:0.7rem; color:var(--text-muted); white-space:nowrap;">${timeStr}</span>
                    </div>
                    <p style="font-size:0.8rem; color:var(--text-secondary); margin:0; line-height:1.4;">${log.details || log.route || ''}</p>
                </div>
            `;
            elements.fullProfileActivityContainer.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    function renderProfileContributionCalendar() {
        const gridContainer = document.getElementById('contribution-calendar-grid');
        const monthsContainer = document.getElementById('calendar-months-grid');
        const totalInfoSpan = document.getElementById('profile-calendar-total-info');
        if (!gridContainer || !monthsContainer) return;

        gridContainer.innerHTML = '';
        monthsContainer.innerHTML = '';

        // 1. Calculate contributions per date (YYYY-MM-DD local timezone)
        const dateCounts = {};
        let totalContributions = 0;
        
        state.currentUserLogs.forEach(log => {
            if (!log.timestamp) return;
            
            // Only count catalog/performance additions & mutations:
            const actLower = (log.action || '').toLowerCase();
            const routeLower = (log.route || '').toLowerCase();
            const detailsLower = (log.details || '').toLowerCase();
            
            const isContribution = 
                actLower.includes('motor entry') || 
                actLower.includes('category created') || 
                actLower.includes('category deleted') || 
                actLower.includes('performance dataset') || 
                actLower.includes('draft dataset') || 
                actLower.includes('imported data') ||
                routeLower.includes('motor entry') || 
                routeLower.includes('category created') || 
                routeLower.includes('category deleted') || 
                routeLower.includes('performance dataset') || 
                routeLower.includes('draft dataset') || 
                routeLower.includes('imported data') ||
                detailsLower.startsWith('added motor:') ||
                detailsLower.startsWith('updated motor:') ||
                detailsLower.startsWith('deleted motor:') ||
                detailsLower.startsWith('created category:') ||
                detailsLower.startsWith('deleted category:') ||
                detailsLower.startsWith('added performance dataset') ||
                detailsLower.startsWith('updated dataset') ||
                detailsLower.startsWith('deleted test run') ||
                detailsLower.startsWith('imported') ||
                detailsLower.includes('finalized draft');
            
            if (!isContribution) return;

            const d = new Date(log.timestamp);
            if (isNaN(d.getTime())) return;
            
            // Format to YYYY-MM-DD local format
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            
            dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
            totalContributions++;
        });

        if (totalInfoSpan) {
            totalInfoSpan.textContent = `${totalContributions} contribution${totalContributions === 1 ? '' : 's'} in the last year`;
        }

        // 2. Generate date range ending today
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        
        const startDate = new Date();
        startDate.setDate(today.getDate() - 364); // 365 days
        startDate.setHours(0, 0, 0, 0);
        
        // Align to Sunday
        const startDay = startDate.getDay();
        startDate.setDate(startDate.getDate() - startDay);

        const endDate = new Date(today);
        const endDay = endDate.getDay();
        endDate.setDate(endDate.getDate() + (6 - endDay)); // Align to Saturday of this week

        // 3. Create grid cells and month labels
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // We will keep track of weeks to place month labels
        let weekCount = 0;
        let lastMonth = -1;
        
        const curDate = new Date(startDate);
        
        // Single shared tooltip element
        let tooltip = document.getElementById('calendar-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'calendar-tooltip';
            tooltip.className = 'calendar-tooltip';
            document.body.appendChild(tooltip);
        }

        while (curDate <= endDate) {
            const yyyy = curDate.getFullYear();
            const mm = String(curDate.getMonth() + 1).padStart(2, '0');
            const dd = String(curDate.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const count = dateCounts[dateStr] || 0;

            // Determine intensity level
            let lvl = 0;
            if (count > 0 && count <= 2) lvl = 1;
            else if (count > 2 && count <= 5) lvl = 2;
            else if (count > 5 && count <= 9) lvl = 3;
            else if (count > 9) lvl = 4;

            // Create cell
            const cell = document.createElement('div');
            cell.className = `contrib-cell contrib-lvl-${lvl}`;
            
            // Format nice display date for tooltip
            const displayDateStr = curDate.toLocaleDateString(undefined, {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            // Bind tooltips
            cell.onmouseenter = (e) => {
                const rect = cell.getBoundingClientRect();
                tooltip.textContent = `${count} contribution${count === 1 ? '' : 's'} on ${displayDateStr}`;
                tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
                tooltip.style.top = `${rect.top + window.scrollY}px`;
                tooltip.style.opacity = '1';
            };
            cell.onmouseleave = () => {
                tooltip.style.opacity = '0';
            };

            gridContainer.appendChild(cell);

            // Month Label Placement: Check on Sunday (first day of the column)
            if (curDate.getDay() === 0) {
                const curMonth = curDate.getMonth();
                if (curMonth !== lastMonth) {
                    // Place month label
                    const label = document.createElement('div');
                    label.textContent = months[curMonth];
                    label.style.gridColumnStart = `${weekCount + 1}`;
                    monthsContainer.appendChild(label);
                    lastMonth = curMonth;
                }
                weekCount++;
            }

            // Move to next day
            curDate.setDate(curDate.getDate() + 1);
        }
    }

    elements.profileActivitySearch.oninput = () => renderProfileLogs();
    elements.profileActivityFilter.onchange = () => renderProfileLogs();

    // Bind search and filter events for user administration table
    const searchUsersInput = document.getElementById('search-users-input');
    const filterUsersRole = document.getElementById('filter-users-role');
    if (searchUsersInput) searchUsersInput.oninput = () => renderUserAccountsList();
    if (filterUsersRole) filterUsersRole.onchange = () => renderUserAccountsList();

    // Bind create user modal trigger
    const btnCreateTrigger = document.getElementById('btn-create-user-trigger');
    const createUserModal = document.getElementById('create-user-modal');
    if (btnCreateTrigger && createUserModal) {
        btnCreateTrigger.onclick = () => {
            elements.userForm.reset();
            const meter = document.getElementById('strength-user-password');
            if (meter) meter.style.display = 'none';
            const caps = document.getElementById('caps-warning-user-password');
            if (caps) caps.style.display = 'none';
            openModal(createUserModal);
        };
    }

    // MutationObserver to update chart border color on theme change dynamically
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme') {
                if (elements.profileViewSection && elements.profileViewSection.style.display !== 'none') {
                    renderProfileBreakdownChart();
                }
            }
        });
    });
    themeObserver.observe(document.documentElement, { attributes: true });

    // Sidebar Profile Click Trigger is setup dynamically in setupSidebar()

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    async function init() {
        try {
            const userEmail = session.email;
            const avatarInit = document.getElementById('user-avatar-initials');
            if (avatarInit && userEmail) {
                avatarInit.textContent = userEmail.charAt(0).toUpperCase();
            }

            await fetchSidebarCounts();
            await fetchUserAccounts();
        } catch (e) {
            console.error("Initialization failed", e);
            await logoutAndRedirect();
        }
    }

    init();
    
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
                const myUser = state.users.find(x => x.email === session.email) || {
                    email: session.email,
                    role: session.role,
                    id: session.uid || 'My Session UID',
                    created_at: new Date(session.timestamp || Date.now()).toISOString()
                };
                showUserProfile(myUser);
            };
        }
    }

    if (window.sidebarLoaded) {
        setupSidebar();
    } else {
        window.addEventListener('sidebarLoaded', setupSidebar);
    }
});
