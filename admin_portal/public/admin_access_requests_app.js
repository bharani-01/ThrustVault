// admin_access_requests_app.js
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

    let supabase = null;
    let state = {
        categories: [],
        motors: [],
        accessRequests: []
    };

    // DOM Elements
    const elements = {
        get catList() { return document.getElementById('category-list-container'); },
        get totalMotors() { return document.getElementById('total-motors-count'); },
        get totalCats() { return document.getElementById('total-categories-count'); },
        get btnLogout() { return document.getElementById('btn-logout'); },
        get btnAddCat() { return document.getElementById('btn-add-category'); },
        get requestsPendingBadge() { return document.getElementById('requests-pending-badge'); },
        
        // Requests Specific Elements
        requestsTableBody: document.getElementById('access-requests-list-rows'),
        requestsEmptyState: document.getElementById('requests-empty-state'),
        requestsSearch: document.getElementById('requests-search-input'),
        requestsFilterStatus: document.getElementById('requests-filter-status'),
        confirmModal: document.getElementById('confirm-modal')
    };

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
            const [motorsData, catsData] = await Promise.all([
                fetch('/api/guest/motors').then(r => r.json()),
                fetch('/api/guest/categories').then(r => r.json())
            ]);

            state.motors = motorsData || [];
            state.categories = catsData || [];

            if (elements.totalMotors) elements.totalMotors.textContent = state.motors.length;
            if (elements.totalCats) elements.totalCats.textContent = state.categories.length;

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
                        const res = await fetch(`/api/intern/categories?id=eq.${cat.id}`, {
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
    // ACCESS REQUESTS LOGIC
    // =========================================================================
    async function fetchAccessRequests() {
        try {
            const res = await fetch('/api/admin/access-requests?order=created_at.desc');
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || `HTTP ${res.status}`);
            }
            const requests = await res.json();
            state.accessRequests = requests || [];
            
            renderAccessRequestsList();
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
            return;
        }
        elements.requestsEmptyState.style.display = 'none';

        filtered.forEach(r => {
            const tr = document.createElement('tr');
            const createdDate = new Date(r.created_at).toLocaleDateString();
            
            // Format status badge
            let statusBadge = `<span class="badge-role role-guest">Pending</span>`;
            if (r.status === 'approved') {
                statusBadge = `<span class="badge-role role-intern" style="background:#ecfdf5; color:#059669; border-color:#a7f3d0;">Approved</span>`;
            } else if (r.status === 'rejected') {
                statusBadge = `<span class="badge-role role-admin" style="background:#fff1f2; color:#e11d48; border-color:#fecdd3;">Rejected</span>`;
            }

            // Actions display
            let actionButtons = '';
            if (r.status === 'pending') {
                actionButtons = `
                    <button class="btn-outline-sm btn-approve-req" data-id="${r.id}" style="padding: 4px 8px; font-size: 0.75rem; border-color:#10b981; color:#10b981; display:flex; align-items:center; gap:3px;"><i data-lucide="check" style="width:12px;"></i> Approve</button>
                    <button class="btn-delete btn-reject-req" data-id="${r.id}" style="padding: 4px; display:flex; align-items:center; justify-content:center;"><i data-lucide="x" style="width:14px; height:14px;"></i></button>
                `;
            } else {
                actionButtons = `<span style="font-size:0.75rem; color:#94a3b8; font-style:italic;">No Actions Available</span>`;
            }

            tr.innerHTML = `
                <td><strong>${r.full_name || 'Applicant'}</strong></td>
                <td><a href="mailto:${r.email}" style="color:#2563eb; text-decoration:none;">${r.email}</a></td>
                <td><span class="badge-role role-${r.requested_role}">${r.requested_role.toUpperCase()}</span></td>
                <td><div style="max-width:250px; font-size:0.8rem; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${r.justification || ''}">${r.justification || '—'}</div></td>
                <td>${createdDate}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right; vertical-align: middle; white-space: nowrap;">
                    <div class="row-actions" style="display: inline-flex; gap: 8px; justify-content: flex-end; align-items: center; vertical-align: middle;">
                        ${actionButtons}
                    </div>
                </td>
            `;
            elements.requestsTableBody.appendChild(tr);
        });

        // Bind request approve/reject clicks
        elements.requestsTableBody.querySelectorAll('.btn-approve-req').forEach(btn => {
            btn.onclick = () => handleAccessRequestAction(btn.dataset.id, 'approve');
        });
        elements.requestsTableBody.querySelectorAll('.btn-reject-req').forEach(btn => {
            btn.onclick = () => handleAccessRequestAction(btn.dataset.id, 'reject');
        });

        if (window.lucide) window.lucide.createIcons();
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
                const res = await fetch(`/api/admin/access-requests?id=eq.${requestId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'rejected' })
                });
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }

                logUserActivity(session.email, session.role, 'Access Request Rejected', `Rejected access request from ${req.email}`);

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
                    console.error("Failed to send rejection email:", emailErr);
                }

                alert("Access request successfully rejected.");
                await fetchAccessRequests();
            } catch (err) {
                alert("Failed to reject request: " + err.message);
            }
            return;
        }

        // Approval Prompt
        const promptVal = prompt(
            `Enter a password for "${req.email}" (min 6 characters), or leave empty to auto-generate:`, 
            "VaultWelcome2026!"
        );
        if (promptVal === null) return;
        
        let password = '';
        const trimmedPass = promptVal.trim();
        if (trimmedPass === '') {
            password = Math.random().toString(36).slice(-8) + 'V@' + Math.floor(Math.random() * 1000);
        } else {
            if (trimmedPass.length < 6) {
                alert("Password must be at least 6 characters long.");
                return;
            }
            password = trimmedPass;
        }

        try {
            // Check if user account already exists
            const profileRes = await fetch(`/api/admin/users?email=eq.${req.email}`);
            if (!profileRes.ok) {
                const errData = await profileRes.json();
                throw new Error(errData.error || `HTTP ${profileRes.status}`);
            }
            const profiles = await profileRes.json();
            const existingUser = profiles && profiles.length > 0 ? profiles[0] : null;

            if (existingUser) {
                alert(`An active user profile already exists for "${req.email}". Request marked as approved.`);
                await fetch(`/api/admin/access-requests?id=eq.${requestId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'approved' })
                });
                await fetchAccessRequests();
                return;
            }

            const rpcRes = await fetch('/api/admin/rpc/create_vault_user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email_val: req.email,
                    password_val: password,
                    role_val: req.requested_role
                })
            });
            if (!rpcRes.ok) {
                const errData = await rpcRes.json();
                throw new Error(errData.error || `HTTP ${rpcRes.status}`);
            }
            const newUid = await rpcRes.json();

            let resetLink = '';
            try {
                const linkRes = await fetch('/api/admin/auth/generate-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'recovery',
                        email: req.email,
                        options: { redirectTo: window.location.origin + '/login' }
                    })
                });
                if (linkRes.ok) {
                    const linkData = await linkRes.json();
                    if (linkData && linkData.properties) {
                        resetLink = linkData.properties.action_link;
                    }
                }
            } catch (err) {
                console.warn("Failed to generate password recovery link:", err);
            }

            const updateRes = await fetch(`/api/admin/access-requests?id=eq.${requestId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'approved' })
            });
            if (!updateRes.ok) {
                const errData = await updateRes.json();
                throw new Error(errData.error || `HTTP ${updateRes.status}`);
            }

            logUserActivity(session.email, session.role, 'Access Request Approved', `Approved request for ${req.email} with role ${req.requested_role.toUpperCase()}`);

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

            showApprovalSuccessModal(req.email, password, resetLink);
            await fetchAccessRequests();
        } catch (err) {
            alert("Failed to approve access request: " + err.message);
            await fetchAccessRequests();
        }
    }

    function showApprovalSuccessModal(email, password, resetLink) {
        const modalId = 'dynamic-approval-success-modal';
        let existing = document.getElementById(modalId);
        if (existing) existing.remove();

        const backdrop = document.createElement('div');
        backdrop.id = modalId;
        backdrop.className = 'modal-backdrop';
        backdrop.style.cssText = 'display:flex; justify-content:center; align-items:center; z-index:99999;';

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

        const copyPassBtn = backdrop.querySelector('#btn-success-copy-pass');
        copyPassBtn.onclick = () => {
            const passVal = backdrop.querySelector('#success-copy-password');
            passVal.select();
            document.execCommand('copy');
            copyPassBtn.innerHTML = '<i data-lucide="check" style="width: 15px; color: #10b981;"></i>';
            if (window.lucide) window.lucide.createIcons();
            setTimeout(() => {
                copyPassBtn.innerHTML = '<i data-lucide="copy" style="width: 15px;"></i>';
                if (window.lucide) window.lucide.createIcons();
            }, 2000);
        };

        const copyLinkBtn = backdrop.querySelector('#btn-success-copy-link');
        if (copyLinkBtn) {
            copyLinkBtn.onclick = () => {
                const linkVal = backdrop.querySelector('#success-copy-link');
                linkVal.select();
                document.execCommand('copy');
                copyLinkBtn.innerHTML = '<i data-lucide="check" style="width: 15px; color: #10b981;"></i>';
                if (window.lucide) window.lucide.createIcons();
                setTimeout(() => {
                    copyLinkBtn.innerHTML = '<i data-lucide="copy" style="width: 15px;"></i>';
                    if (window.lucide) window.lucide.createIcons();
                }, 2000);
            };
        }

        const closeModal = () => backdrop.remove();
        backdrop.querySelector('#btn-close-success-modal').onclick = closeModal;
        backdrop.querySelector('#btn-close-success-modal-footer').onclick = closeModal;
        backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };
    }

    elements.requestsSearch.oninput = () => renderAccessRequestsList();
    elements.requestsFilterStatus.onchange = () => renderAccessRequestsList();

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
            await fetchAccessRequests();
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
