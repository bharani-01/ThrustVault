// admin_schema_app.js
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
    const emailEl = document.getElementById('session-email');
    if (emailEl) emailEl.textContent = email;

    let supabase = null;
    let state = {
        categories: [],
        motors: [],
        accessRequests: [],
        customSchema: []
    };

    // DOM Elements
    const elements = {
        get catList() { return document.getElementById('category-list-container'); },
        get totalMotors() { return document.getElementById('total-motors-count'); },
        get totalCats() { return document.getElementById('total-categories-count'); },
        get btnLogout() { return document.getElementById('btn-logout'); },
        get btnAddCat() { return document.getElementById('btn-add-category'); },
        get requestsPendingBadge() { return document.getElementById('requests-pending-badge'); },
        
        // Schema Specific Elements
        schemaFieldsList: document.getElementById('schema-fields-list-rows'),
        schemaEmptyState: document.getElementById('schema-empty-state'),
        schemaFieldForm: document.getElementById('schema-field-form'),
        schemaFieldModal: document.getElementById('schema-field-modal'),
        btnAddSchemaField: document.getElementById('btn-add-schema-field'),
        confirmModal: document.getElementById('confirm-modal')
    };

    // Helper functions for modal operations
    function openModal(modal) { modal.classList.add('show'); }
    function closeModal(modal) { modal.classList.remove('show'); }

    // Close handlers for modals
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
        window.location.href = 'index.html';
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
            window.location.href = 'motor_explorer';
        };
        elements.catList.appendChild(allTab);
        if (window.lucide) window.lucide.createIcons();
    }

    // =========================================================================
    // DATABASE SCHEMA CUSTOMIZER LOGIC
    // =========================================================================
    async function fetchCustomSchema() {
        try {
            const res = await fetch('/api/guest/custom-specs');
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || `HTTP ${res.status}`);
            }
            const schema = await res.json();
            state.customSchema = schema || [];
            localStorage.setItem('thrustvault_custom_specs', JSON.stringify(state.customSchema));
            
            renderSchemaBuilder();
        } catch (err) {
            console.warn("Failed to fetch schema from Supabase, loading from localStorage:", err);
            state.customSchema = JSON.parse(localStorage.getItem('thrustvault_custom_specs')) || [];
            renderSchemaBuilder();
        }
    }

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
                            const res = await fetch(`/api/admin/schema/${f.field_key}`, {
                                method: 'DELETE'
                            });
                            if (!res.ok) {
                                const errData = await res.json();
                                throw new Error(errData.error || `HTTP ${res.status}`);
                            }
                        } catch (err) {
                            console.warn("Supabase delete failed, using localStorage fallback:", err);
                        }
                        state.customSchema = state.customSchema.filter(x => x.field_key !== f.field_key);
                        localStorage.setItem('thrustvault_custom_specs', JSON.stringify(state.customSchema));
                        logUserActivity(session.email, session.role, 'Schema Field Deleted', `Deleted custom parameter field: ${f.field_name}`);
                        renderSchemaBuilder();
                    }
                };
                elements.schemaFieldsList.appendChild(tr);
            });
            if (window.lucide) window.lucide.createIcons();
        }
    }

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
            const res = await fetch('/api/admin/schema', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newField)
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || `HTTP ${res.status}`);
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
    };

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
            await fetchCustomSchema();
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
                window.location.href = 'admin_dashboard';
            };
        }

        const sidebarProfileCard = document.querySelector('.sidebar-user-profile');
        if (sidebarProfileCard) {
            sidebarProfileCard.style.cursor = 'pointer';
            sidebarProfileCard.title = 'View My Profile';
            sidebarProfileCard.onclick = () => {
                sessionStorage.setItem('showMyProfile', 'true');
                window.location.href = 'admin_users';
            };
        }
    }

    if (window.sidebarLoaded) {
        setupSidebar();
    } else {
        window.addEventListener('sidebarLoaded', setupSidebar);
    }
});
