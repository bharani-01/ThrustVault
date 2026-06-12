// admin_users_app.js
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
        catList: document.getElementById('category-list-container'),
        totalMotors: document.getElementById('total-motors-count'),
        totalCats: document.getElementById('total-categories-count'),
        btnLogout: document.getElementById('btn-logout'),
        btnAddCat: document.getElementById('btn-add-category'),
        requestsPendingBadge: document.getElementById('requests-pending-badge'),
        
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
        if (supabase) {
            supabase.auth.signOut().catch(e => console.error("SignOut error:", e));
        }
        localStorage.removeItem('thrustvault_session');
        const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `thrustvault_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict${secureFlag}`;
        window.location.href = 'index.html';
    }

    elements.btnLogout.onclick = () => {
        logoutAndRedirect();
    };

    // Throttled timer logic
    let inactivityTimeout;
    let lastSyncTime = Date.now();

    function resetInactivityTimer() {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(autoLogout, 600000); // 10 minutes

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

    // Sidebar navigation trigger for custom category creations
    if (elements.btnAddCat) {
        elements.btnAddCat.onclick = () => {
            sessionStorage.setItem('triggerAddCategory', 'true');
            window.location.href = 'admin_dashboard';
        };
    }

    // =========================================================================
    // CORE SERVICES: CATEGORIES & SIDEBAR COUNTERS
    // =========================================================================
    async function fetchSidebarCounts() {
        try {
            const [motorsRes, catsRes, requestsRes] = await Promise.all([
                supabase.from('motors').select('id, category_id'),
                supabase.from('categories').select('*').order('name'),
                supabase.from('access_requests').select('*').order('created_at', { ascending: false })
            ]);

            if (motorsRes.error) throw motorsRes.error;
            if (catsRes.error) throw catsRes.error;
            if (requestsRes.error) throw requestsRes.error;

            state.motors = motorsRes.data || [];
            state.categories = catsRes.data || [];
            state.accessRequests = requestsRes.data || [];

            elements.totalMotors.textContent = state.motors.length;
            elements.totalCats.textContent = state.categories.length;

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
                window.location.href = 'admin_dashboard';
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
                        await fetchSidebarCounts();
                    } catch (err) {
                        alert("Failed to delete category: " + err.message);
                    }
                }
            };
            elements.catList.appendChild(div);
        });
        if (window.lucide) window.lucide.createIcons();
    }

    // =========================================================================
    // USER ACCOUNT MANAGEMENT & PROFILE CONTRIB
    // =========================================================================
    async function fetchUserAccounts() {
        try {
            const { data: users, error } = await supabase
                .from('user_profiles')
                .select('*')
                .order('email');
            
            if (error) throw error;
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
                        const { error } = await supabase.rpc('delete_vault_user', {
                            user_id: userId
                        });
                        if (error) throw error;
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
            const { data, error } = await supabase.rpc('create_vault_user', {
                email_val: emailVal,
                password_val: passVal,
                role_val: roleVal
            });

            if (error) throw error;

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
            <div class="modal-container modal-sm" style="width: 420px;">
                <div class="modal-header" style="border-bottom: 1px solid #f1f5f9; padding-bottom:12px;">
                    <h3 style="color: #10b981; font-family:'Outfit'; display:flex; align-items:center; gap:8px;"><i data-lucide="check-circle"></i> Account Created</h3>
                    <button class="btn-icon-close" id="btn-close-success-modal"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body" style="padding: 20px 0;">
                    <p style="font-size:0.85rem; color:#64748b; margin-bottom:14px;">The credentials have been saved, and a welcome email notification has been triggered.</p>
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem;">
                            <span style="color:#64748b;">Role:</span>
                            <span class="badge-role role-${role}" style="font-weight:700;">${role.toUpperCase()}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem;">
                            <span style="color:#64748b;">Email:</span>
                            <strong style="color:#0f172a;">${email}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; border-top:1px dashed #cbd5e1; padding-top:6px;">
                            <span style="color:#64748b;">Password:</span>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <strong style="color:#0f172a; font-family:monospace; font-size:0.85rem;">${pass}</strong>
                                <button id="btn-success-copy-pass" style="background:none; border:none; cursor:pointer; padding:2px; display:inline-flex; align-items:center;" title="Copy Password"><i data-lucide="copy" style="width: 14px; height: 14px;"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="border-top:1px solid #f1f5f9; padding-top:12px; display:flex; justify-content:space-between; gap:12px;">
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

    // User profile detail sub-pages
    async function showUserProfile(targetUser) {
        state.profileUserEmail = targetUser.email;

        // Reset inputs
        elements.profileActivitySearch.value = '';
        elements.profileActivityFilter.value = 'all';

        // Swap sections
        elements.usersViewSection.style.display = 'none';
        elements.profileViewSection.style.display = 'block';

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

        const checkIcon = `<span style="color: #059669; font-weight: 700; margin-right: 8px;">+</span>`;
        const crossIcon = `<span style="color: #e11d48; font-weight: 700; margin-right: 8px;">-</span>`;
        
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

        state.currentUserLogs = [];
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
            const act = (l.action || '').toLowerCase();
            return act.includes('create') || act.includes('add') || act.includes('update') || act.includes('delete') || act.includes('edit') || act.includes('import');
        }).length;
        elements.profileTotalMutations.textContent = writes;

        // Logins count
        const logins = state.currentUserLogs.filter(l => (l.action || '').toLowerCase().includes('login')).length;
        const loginsEl = document.getElementById('profile-total-logins');
        if (loginsEl) loginsEl.textContent = logins;

        // Catalog changes count
        const catChanges = state.currentUserLogs.filter(l => {
            const act = (l.action || '').toLowerCase();
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
    }

    elements.btnProfileBack.onclick = () => {
        elements.profileViewSection.style.display = 'none';
        elements.usersViewSection.style.display = 'block';
    };

    function renderProfileBreakdownChart() {
        const canvas = document.getElementById('profileActivityChart');
        const legend = document.getElementById('profile-breakdown-legend');
        if (!canvas) return;

        const loginCount = state.currentUserLogs.filter(l => {
            const t = (l.action || l.route || '').toLowerCase();
            return t.includes('login') || t.includes('logout') || t.includes('session');
        }).length;
        const catalogCount = state.currentUserLogs.filter(l => {
            const t = (l.action || l.route || '').toLowerCase();
            return (t.includes('motor') || t.includes('category') || t.includes('import') || t.includes('export')) && !t.includes('schema') && !t.includes('user') && !t.includes('login');
        }).length;
        const schemaCount = state.currentUserLogs.filter(l => {
            const t = (l.action || l.route || '').toLowerCase();
            return t.includes('schema') || t.includes('custom parameter');
        }).length;
        const userOpsCount = state.currentUserLogs.filter(l => {
            const t = (l.action || l.route || '').toLowerCase();
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
                    legend: { display: false }
                }
            }
        });

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

            const actLower = (log.action || '').toLowerCase();
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
                        <strong style="font-size:0.85rem; color:#0f172a;">${log.action || 'Activity'}</strong>
                        <span style="font-size:0.7rem; color:#94a3b8; white-space:nowrap;">${timeStr}</span>
                    </div>
                    <p style="font-size:0.8rem; color:#64748b; margin:0; line-height:1.4;">${log.details || log.route || ''}</p>
                </div>
            `;
            elements.fullProfileActivityContainer.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    elements.profileActivitySearch.oninput = () => renderProfileLogs();
    elements.profileActivityFilter.onchange = () => renderProfileLogs();

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
            showUserProfile(myUser);
        };
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
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

            // Sync user avatar initials
            const userEmail = sbSession.user.email;
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
    // Sidebar Toggle Event Listener
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('btn-toggle-sidebar');
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            localStorage.setItem('thrustvault_sidebar_collapsed', isCollapsed);
        });
    }
});
