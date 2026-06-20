// motor_explorer_app.js
document.addEventListener('DOMContentLoaded', () => {
    let state = {
        motors: [],
        categories: [],
        customSchema: [],
        selectedItems: [],
        activeSelection: null,
        viewMode: 'details',      // 'details' | 'list' | 'tiles' | 'large-icons'
        groupBy: 'none',          // 'none' | 'category' | 'company' | 'voltage'
        sortBy: 'name-asc',       // 'name-asc' | 'name-desc' | 'thrust-desc' | 'kv-desc' | 'weight-asc'
        searchQuery: '',
        paneMode: 'details'       // 'details' | 'preview' | 'none'
    };

    let supabase = null;
    let session = null;

    // DOM Elements
    const elements = {
        get catList() { return document.getElementById('category-list-container'); },
        searchInput: document.getElementById('search-input'),
        searchClear: document.getElementById('search-clear'),
        suggestionsEl: document.getElementById('search-suggestions'),
        selectGroupBy: document.getElementById('select-group-by'),
        selectSortBy: document.getElementById('select-sort-by'),
        btnViewDetails: document.getElementById('btn-view-details'),
        btnViewList: document.getElementById('btn-view-list'),
        btnViewTiles: document.getElementById('btn-view-tiles'),
        btnViewLargeIcons: document.getElementById('btn-view-large-icons'),
        btnPaneDetails: document.getElementById('btn-pane-details'),
        btnPanePreview: document.getElementById('btn-pane-preview'),
        explorerContent: document.getElementById('explorer-content-area'),
        explorerSidePanel: document.getElementById('explorer-side-panel'),
        panelTitle: document.getElementById('panel-title-text'),
        panelBody: document.getElementById('panel-body-content'),
        btnCloseSidePanel: document.getElementById('btn-close-side-panel'),
        
        // Multi-select Selection Bar
        selectionBar: document.getElementById('explorer-selection-bar'),
        selectionCountText: document.getElementById('action-bar-count-text'),
        btnBarCompare: document.getElementById('btn-bar-compare'),
        btnBarExport: document.getElementById('btn-bar-export'),
        btnBarDelete: document.getElementById('btn-bar-delete'),
        btnBarClear: document.getElementById('btn-bar-clear'),
        
        // Modals
        comparisonModal: document.getElementById('comparison-modal'),
        comparisonResultTable: document.getElementById('comparison-result-table'),
        motorModal: document.getElementById('motor-modal'),
        motorForm: document.getElementById('motor-form'),
        confirmModal: document.getElementById('confirm-modal'),
        
        // Context Menu
        contextMenu: document.getElementById('explorer-context-menu'),
        ctxBtnEdit: document.getElementById('ctx-btn-edit'),
        ctxBtnDelete: document.getElementById('ctx-btn-delete')
    };

    // Initialize Page Controls & Authorization
    async function init() {
        const sessionStr = localStorage.getItem('thrustvault_session');
        if (sessionStr) {
            try {
                session = JSON.parse(sessionStr);
            } catch (e) {
                console.error("Session parse failed");
            }
        }
        if (!session || !['admin', 'user', 'guest'].includes(session.role)) {
            window.location.href = '/login';
            return;
        }



        // Restrict actions based on role
        if (session.role === 'admin' || session.role === 'user') {
            elements.ctxBtnEdit.style.display = 'flex';
        }
        if (session.role === 'admin') {
            elements.ctxBtnDelete.style.display = 'flex';
            elements.btnBarDelete.style.display = 'inline-flex';
        }

        // No direct Supabase client initialization needed; all requests are proxied via local Flask backend endpoints.

        // Theme restoration
        const currentTheme = localStorage.getItem('thrustvault_theme') || 'light';
        document.documentElement.setAttribute('data-theme', currentTheme);

        await fetchData();
        if (window.sidebarLoaded) {
            renderSidebarCategories();
        }
        bindEvents();
        updatePaneButtons();
        renderExplorer();
    }

    // Fetch categories, motors, and custom schema from database
    function getApiUrl(path) {
        const isGuest = session && session.role === 'guest';
        if (isGuest && path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
            return path.replace('/api/', '/api/guest/');
        }
        return path;
    }

    async function fetchData() {
        try {
            // Fetch categories
            const catRes = await fetch(getApiUrl('/api/categories'));
            if (!catRes.ok) throw new Error(`Categories fetch failed: HTTP ${catRes.status}`);
            const categories = await catRes.json();
            
            const parseMinWeight = (name) => {
                const match = name.match(/(\d+)/);
                return match ? parseInt(match[1], 10) : 9999;
            };

            state.categories = (categories || []).map(c => ({
                id: c.id,
                name: c.name,
                desc: c.description
            })).sort((a, b) => parseMinWeight(a.name) - parseMinWeight(b.name));

            // Fetch motors
            const motorRes = await fetch(getApiUrl('/api/motors'));
            if (!motorRes.ok) throw new Error(`Motors fetch failed: HTTP ${motorRes.status}`);
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
                uploaded_by: m.uploaded_by
            }));

            // Fetch custom specifications schema
            let schema = [];
            try {
                const schemaRes = await fetch(getApiUrl('/api/custom-specs'));
                if (schemaRes.ok) {
                    schema = await schemaRes.json();
                } else {
                    throw new Error(`HTTP ${schemaRes.status}`);
                }
            } catch(e) {
                console.warn("Schema fetch error, fallback to local storage:", e);
                schema = JSON.parse(localStorage.getItem('thrustvault_custom_specs')) || [];
            }
            state.customSchema = schema;

            // Populate form category select
            const catSelect = document.getElementById('form-motor-category');
            if (catSelect) {
                catSelect.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            }
        } catch (err) {
            console.error("Database fetch failed", err);
        }
    }

    // Helper: Parse numerical thrust
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

    function parseKV(name, params) {
        const match = name.match(/(\d+)\s*KV/i) || name.match(/KV\s*(\d+)/i);
        if (match) return parseFloat(match[1]);
        if (params && (params.kv || params.kv_rating)) return parseFloat(params.kv || params.kv_rating);
        return 0;
    }

    function parseWeight(params) {
        if (params) {
            const val = params.weight || params.weight_g || params.motor_weight;
            if (val) return parseFloat(val);
        }
        return 999999;
    }

    // Log user actions to audit backend
    function logUserActivity(email, role, action, details) {
        try {
            fetch(getApiUrl('/api/log-activity'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role, action, details })
            }).catch(err => console.error("Error posting log:", err));
        } catch (e) {
            console.error("Error writing activity log:", e);
        }
    }

    // Bind DOM events
    function bindEvents() {
        // Toolbar View modes
        elements.btnViewDetails.onclick = () => switchViewMode('details');
        elements.btnViewList.onclick = () => switchViewMode('list');
        elements.btnViewTiles.onclick = () => switchViewMode('tiles');
        elements.btnViewLargeIcons.onclick = () => switchViewMode('large-icons');

        // Toolbar Selects
        elements.selectGroupBy.onchange = (e) => {
            state.groupBy = e.target.value;
            renderExplorer();
        };
        elements.selectSortBy.onchange = (e) => {
            state.sortBy = e.target.value;
            renderExplorer();
        };

        // Toolbar Panels
        elements.btnPaneDetails.onclick = () => switchPaneMode('details');
        elements.btnPanePreview.onclick = () => switchPaneMode('preview');
        elements.btnCloseSidePanel.onclick = () => switchPaneMode('none');

        // Selection actions
        elements.btnBarClear.onclick = () => {
            state.selectedItems = [];
            document.querySelectorAll('.explorer-cb, .select-group-all').forEach(cb => cb.checked = false);
            updateSelectionBar();
            renderExplorer();
        };
        elements.btnBarCompare.onclick = () => triggerCompare(state.selectedItems);
        elements.btnBarExport.onclick = () => triggerExport(state.selectedItems);
        elements.btnBarDelete.onclick = () => triggerDeleteBulk(state.selectedItems);

        // Search Input Events
        elements.searchInput.oninput = (e) => {
            state.searchQuery = e.target.value;
            elements.searchClear.style.display = state.searchQuery ? 'block' : 'none';
            showSearchSuggestions(state.searchQuery);
            renderExplorer();
        };
        elements.searchClear.onclick = () => {
            elements.searchInput.value = '';
            state.searchQuery = '';
            elements.searchClear.style.display = 'none';
            elements.suggestionsEl.style.display = 'none';
            renderExplorer();
        };

        // Close context menu and suggestions on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#explorer-context-menu')) {
                elements.contextMenu.style.display = 'none';
            }
            if (!e.target.closest('.suggestions-wrapper')) {
                elements.suggestionsEl.style.display = 'none';
            }
        });

        // Context menu items action binding
        elements.contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.onclick = () => {
                const action = item.dataset.action;
                const motorId = elements.contextMenu.dataset.motorId;
                if (!motorId) return;

                if (action === 'preview') {
                    openPreviewModal(motorId);
                } else if (action === 'compare') {
                    if (!state.selectedItems.includes(motorId)) {
                        state.selectedItems.push(motorId);
                        updateSelectionBar();
                        renderExplorer();
                    }
                } else if (action === 'edit') {
                    triggerEditMotor(motorId);
                } else if (action === 'delete') {
                    triggerDeleteMotor(motorId);
                }
                elements.contextMenu.style.display = 'none';
            };
        });



        // Modals close triggers
        document.querySelectorAll('.modal-close-trigger').forEach(btn => {
            btn.onclick = () => {
                closeModal(elements.comparisonModal);
                closeModal(elements.motorModal);
            };
        });

        // Motor Edit spec form submit
        elements.motorForm.onsubmit = async (e) => {
            e.preventDefault();
            const motorId = elements.motorForm.dataset.id;
            if (!motorId) return;

            const name = document.getElementById('form-motor-name').value.trim();
            const company = document.getElementById('form-motor-company').value.trim();
            const categoryId = document.getElementById('form-motor-category').value;
            const thrust = document.getElementById('form-motor-thrust').value.trim();
            const prop = document.getElementById('form-motor-prop').value.trim();
            const esc = document.getElementById('form-motor-esc').value.trim();
            const linkMotor = document.getElementById('form-motor-link').value.trim();
            const linkEsc = document.getElementById('form-esc-link').value.trim();
            const linkProp = document.getElementById('form-prop-link').value.trim();

            const customParams = {};
            elements.motorForm.querySelectorAll('.custom-field-input').forEach(input => {
                const key = input.dataset.key;
                const type = input.dataset.type;
                if (type === 'boolean') {
                    customParams[key] = input.checked;
                } else if (type === 'number') {
                    customParams[key] = input.value !== '' ? parseFloat(input.value) : null;
                } else {
                    customParams[key] = input.value.trim();
                }
            });

            try {
                const saveBtn = document.getElementById('btn-save-motor');
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving Changes...';

                const updatePayload = {
                    motor_name: name,
                    company,
                    category_id: categoryId,
                    max_thrust: thrust,
                    recommended_propeller: prop || null,
                    recommended_esc: esc || null,
                    link_motor: linkMotor || null,
                    link_esc: linkEsc || null,
                    link_propeller: linkProp || null,
                    custom_parameters: customParams
                };

                const res = await fetch(`/api/motors?id=eq.${motorId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatePayload)
                });
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }

                logUserActivity(session.email, session.role, 'Motor Specifications Updated', `Updated specifications for motor: ${name}`);
                closeModal(elements.motorModal);
                await fetchData();
                renderExplorer();
                if (state.activeSelection === motorId) {
                    selectMotor(motorId); // Refresh details pane
                }
            } catch (err) {
                console.error("Save specs failed:", err);
                alert("Failed to save changes: " + err.message);
            } finally {
                const saveBtn = document.getElementById('btn-save-motor');
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Specifications';
            }
        };
    }



    // Modal view helpers
    function openModal(modal) { modal.classList.add('show'); }
    function closeModal(modal) { modal.classList.remove('show'); }

    // Custom confirm box wrapper
    function customConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = elements.confirmModal;
            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;
            
            const btnOk = document.getElementById('btn-confirm-ok');
            const btnCancel = document.getElementById('btn-confirm-cancel');
            
            openModal(modal);
            
            btnOk.onclick = () => {
                closeModal(modal);
                resolve(true);
            };
            btnCancel.onclick = () => {
                closeModal(modal);
                resolve(false);
            };
        });
    }

    // Layout view manager
    function switchViewMode(mode) {
        state.viewMode = mode;
        [elements.btnViewDetails, elements.btnViewList, elements.btnViewTiles, elements.btnViewLargeIcons].forEach(btn => btn.classList.remove('active'));
        if (mode === 'details') elements.btnViewDetails.classList.add('active');
        if (mode === 'list') elements.btnViewList.classList.add('active');
        if (mode === 'tiles') elements.btnViewTiles.classList.add('active');
        if (mode === 'large-icons') elements.btnViewLargeIcons.classList.add('active');
        renderExplorer();
    }

    // Panel mode manager (Details/Preview sidebar)
    function switchPaneMode(mode) {
        state.paneMode = mode;
        updatePaneButtons();
        if (mode === 'none') {
            elements.explorerSidePanel.classList.add('collapsed');
        } else {
            elements.explorerSidePanel.classList.remove('collapsed');
            if (state.activeSelection) {
                selectMotor(state.activeSelection);
            } else {
                elements.panelTitle.textContent = mode === 'details' ? 'Details Pane' : 'Preview Pane';
                elements.panelBody.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding: 40px 10px; color:var(--text-secondary);">
                        <i data-lucide="info" style="width:36px; height:36px; margin-bottom:10px; opacity:0.5;"></i>
                        <p style="margin:0; font-size:0.85rem;">Select a motor specifications record to inspect its full properties in this pane.</p>
                    </div>
                `;
                lucide.createIcons();
            }
        }
    }

    function updatePaneButtons() {
        elements.btnPaneDetails.classList.remove('active');
        elements.btnPanePreview.classList.remove('active');
        if (state.paneMode === 'details') elements.btnPaneDetails.classList.add('active');
        if (state.paneMode === 'preview') elements.btnPanePreview.classList.add('active');
    }

    // Render left explorer workspace
    function renderExplorer() {
        const contentArea = elements.explorerContent;
        if (!contentArea) return;
        contentArea.innerHTML = '';

        // Search match filtering
        let filtered = [...state.motors];
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            filtered = filtered.filter(m => 
                m.motor.toLowerCase().includes(q) || 
                m.company.toLowerCase().includes(q) ||
                (m.esc && m.esc.toLowerCase().includes(q)) ||
                (m.prop && m.prop.toLowerCase().includes(q))
            );
        }

        // Apply sorting state
        filtered.sort((a, b) => {
            if (state.sortBy === 'name-asc') return a.motor.localeCompare(b.motor);
            if (state.sortBy === 'name-desc') return b.motor.localeCompare(a.motor);
            if (state.sortBy === 'thrust-desc') return parseThrustToKg(b.thrust) - parseThrustToKg(a.thrust);
            if (state.sortBy === 'kv-desc') return parseKV(b.motor, b.custom_parameters) - parseKV(a.motor, a.custom_parameters);
            if (state.sortBy === 'weight-asc') return parseWeight(a.custom_parameters) - parseWeight(b.custom_parameters);
            return 0;
        });

        // Partition grouped objects
        let grouped = {};
        if (state.groupBy === 'category') {
            filtered.forEach(m => {
                const cat = state.categories.find(c => c.id === m.category_id || c.id === m.categoryId);
                const name = cat ? `${cat.name} Class` : 'Unassigned Class';
                if (!grouped[name]) grouped[name] = [];
                grouped[name].push(m);
            });
        } else if (state.groupBy === 'company') {
            filtered.forEach(m => {
                const name = m.company || 'Unknown Brand';
                if (!grouped[name]) grouped[name] = [];
                grouped[name].push(m);
            });
        } else if (state.groupBy === 'voltage') {
            filtered.forEach(m => {
                const match = m.motor.match(/\b(\d+S)\b/i) || (m.esc && m.esc.match(/\b(\d+S)\b/i));
                const name = match ? match[1].toUpperCase() : 'Unspecified Voltage';
                if (!grouped[name]) grouped[name] = [];
                grouped[name].push(m);
            });
        } else {
            grouped['All Specifications'] = filtered;
        }

        const keys = Object.keys(grouped).sort();
        if (keys.length === 0 || (keys.length === 1 && grouped[keys[0]].length === 0)) {
            contentArea.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding: 60px 10px; color:var(--text-secondary);">
                    <i data-lucide="search" style="width:36px; height:36px; margin-bottom:10px; opacity:0.5;"></i>
                    <p style="margin:0; font-size:0.9rem;">No specifications records match your filter criteria.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        keys.forEach(gKey => {
            const items = grouped[gKey];
            if (items.length === 0) return;

            const groupDiv = document.createElement('div');
            groupDiv.className = 'explorer-group';

            const header = document.createElement('div');
            header.className = 'explorer-group-header';
            header.innerHTML = `
                <i data-lucide="chevron-down" class="group-chevron" style="width:16px; height:16px;"></i>
                <i data-lucide="folder" style="width:16px; height:16px; color:#eab308; fill:#fef08a;"></i>
                <span>${escapeHTML(gKey)} (${items.length})</span>
            `;
            header.onclick = () => {
                groupDiv.classList.toggle('collapsed');
            };
            groupDiv.appendChild(header);

            const itemsContainer = document.createElement('div');
            itemsContainer.className = `explorer-group-items view-${state.viewMode}`;

            if (state.viewMode === 'details') {
                const table = document.createElement('table');
                table.className = 'explorer-table';
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th style="width:40px;"><input type="checkbox" class="select-group-all" title="Select All in Group"></th>
                            <th style="width:40px;"></th>
                            <th>Model Name</th>
                            <th>Brand</th>
                            <th>Max Thrust Output</th>
                            <th>ESC</th>
                            <th>Propeller</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                const tbody = table.querySelector('tbody');
                
                const groupSelectAll = table.querySelector('.select-group-all');
                groupSelectAll.checked = items.every(m => state.selectedItems.includes(m.id));
                groupSelectAll.onchange = (e) => {
                    const checked = e.target.checked;
                    items.forEach(m => {
                        if (checked) {
                            if (!state.selectedItems.includes(m.id)) state.selectedItems.push(m.id);
                        } else {
                            state.selectedItems = state.selectedItems.filter(id => id !== m.id);
                        }
                    });
                    updateSelectionBar();
                    renderExplorer();
                };

                items.forEach(m => {
                    const tr = document.createElement('tr');
                    tr.className = `explorer-row ${state.activeSelection === m.id ? 'selected' : ''}`;
                    tr.dataset.id = m.id;
                    
                    const isChecked = state.selectedItems.includes(m.id);
                    const initials = m.motor.charAt(0).toUpperCase();
                    const hash = m.company.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const hue = hash % 360;
                    const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%); width:24px; height:24px; border-radius:4px; font-weight:700; display:flex; align-items:center; justify-content:center; font-size:0.75rem;`;

                    tr.innerHTML = `
                        <td><input type="checkbox" class="explorer-cb" data-id="${m.id}" ${isChecked ? 'checked' : ''}></td>
                        <td><div style="${thumbStyle}">${initials}</div></td>
                        <td><strong>${escapeHTML(m.motor)}</strong></td>
                        <td>${escapeHTML(m.company)}</td>
                        <td><span class="badge-thrust" style="background: rgba(13, 148, 136, 0.08); border-color: rgba(13, 148, 136, 0.2); color: #0d9488; font-weight:600;">${escapeHTML(m.thrust)}</span></td>
                        <td>${escapeHTML(m.esc || '-')}</td>
                        <td>${escapeHTML(m.prop || '-')}</td>
                    `;

                    tr.onclick = (e) => {
                        if (e.target.closest('input[type="checkbox"]')) return;
                        selectMotor(m.id);
                    };
                    tr.ondblclick = () => openPreviewModal(m.id);
                    tr.oncontextmenu = (e) => showContextMenu(e, m.id);

                    tbody.appendChild(tr);
                });
                itemsContainer.appendChild(table);
            } else if (state.viewMode === 'list') {
                items.forEach(m => {
                    const div = document.createElement('div');
                    div.className = `list-item ${state.activeSelection === m.id ? 'selected' : ''}`;
                    div.dataset.id = m.id;
                    
                    const isChecked = state.selectedItems.includes(m.id);
                    div.innerHTML = `
                        <input type="checkbox" class="explorer-cb" data-id="${m.id}" ${isChecked ? 'checked' : ''}>
                        <i data-lucide="cpu" style="width:16px; height:16px; color:var(--text-secondary); flex-shrink:0;"></i>
                        <span style="font-size:0.85rem; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;"><strong>${escapeHTML(m.motor)}</strong> <span style="color:var(--text-secondary);">(${escapeHTML(m.company)})</span></span>
                    `;

                    div.onclick = (e) => {
                        if (e.target.closest('input[type="checkbox"]')) return;
                        selectMotor(m.id);
                    };
                    div.ondblclick = () => openPreviewModal(m.id);
                    div.oncontextmenu = (e) => showContextMenu(e, m.id);

                    itemsContainer.appendChild(div);
                });
            } else if (state.viewMode === 'tiles') {
                items.forEach(m => {
                    const div = document.createElement('div');
                    div.className = `tile-item ${state.activeSelection === m.id ? 'selected' : ''}`;
                    div.dataset.id = m.id;
                    
                    const isChecked = state.selectedItems.includes(m.id);
                    const initials = m.motor.charAt(0).toUpperCase();
                    const hash = m.company.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const hue = hash % 360;
                    const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%); width:32px; height:32px; border-radius:6px; font-weight:700; display:flex; align-items:center; justify-content:center; font-size:0.9rem; flex-shrink:0;`;

                    div.innerHTML = `
                        <input type="checkbox" class="explorer-cb" data-id="${m.id}" ${isChecked ? 'checked' : ''}>
                        <div style="${thumbStyle}">${initials}</div>
                        <div style="display:flex; flex-direction:column; min-width:0; flex:1; gap:2px;">
                            <span style="font-size:0.85rem; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHTML(m.motor)}</span>
                            <span style="font-size:0.75rem; color:var(--text-secondary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHTML(m.company)} &nbsp;·&nbsp; ${escapeHTML(m.thrust)}</span>
                        </div>
                    `;

                    div.onclick = (e) => {
                        if (e.target.closest('input[type="checkbox"]')) return;
                        selectMotor(m.id);
                    };
                    div.ondblclick = () => openPreviewModal(m.id);
                    div.oncontextmenu = (e) => showContextMenu(e, m.id);

                    itemsContainer.appendChild(div);
                });
            } else if (state.viewMode === 'large-icons') {
                items.forEach(m => {
                    const div = document.createElement('div');
                    div.className = `large-icon-item ${state.activeSelection === m.id ? 'selected' : ''}`;
                    div.dataset.id = m.id;
                    
                    const isChecked = state.selectedItems.includes(m.id);
                    const initials = m.motor.charAt(0).toUpperCase();
                    const hash = m.company.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const hue = hash % 360;
                    const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%);`;

                    div.innerHTML = `
                        <div style="align-self:flex-start; margin-bottom: -15px;">
                            <input type="checkbox" class="explorer-cb" data-id="${m.id}" ${isChecked ? 'checked' : ''}>
                        </div>
                        <div class="large-icon-thumbnail" style="${thumbStyle}">${initials}</div>
                        <div style="display:flex; flex-direction:column; width:100%; min-width:0; gap:2px;">
                            <span style="font-size:0.82rem; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; width:100%;">${escapeHTML(m.motor)}</span>
                            <span style="font-size:0.72rem; color:var(--text-secondary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; width:100%;">${escapeHTML(m.company)}</span>
                        </div>
                    `;

                    div.onclick = (e) => {
                        if (e.target.closest('input[type="checkbox"]')) return;
                        selectMotor(m.id);
                    };
                    div.ondblclick = () => openPreviewModal(m.id);
                    div.oncontextmenu = (e) => showContextMenu(e, m.id);

                    itemsContainer.appendChild(div);
                });
            }

            itemsContainer.querySelectorAll('.explorer-cb').forEach(cb => {
                cb.onchange = (e) => {
                    const id = e.target.dataset.id;
                    if (e.target.checked) {
                        if (!state.selectedItems.includes(id)) state.selectedItems.push(id);
                    } else {
                        state.selectedItems = state.selectedItems.filter(item => item !== id);
                    }
                    updateSelectionAllStates();
                    updateSelectionBar();
                };
            });

            groupDiv.appendChild(itemsContainer);
            contentArea.appendChild(groupDiv);
        });

        lucide.createIcons();
    }

    function updateSelectionAllStates() {
        document.querySelectorAll('.explorer-table').forEach(table => {
            const groupAllCb = table.querySelector('.select-group-all');
            const rowCbs = Array.from(table.querySelectorAll('.explorer-cb'));
            if (groupAllCb && rowCbs.length > 0) {
                groupAllCb.checked = rowCbs.every(cb => cb.checked);
            }
        });
    }

    // Selection toolbar helper
    function updateSelectionBar() {
        const count = state.selectedItems.length;
        if (count > 0) {
            elements.selectionCountText.textContent = `${count} motor${count !== 1 ? 's' : ''} selected`;
            elements.selectionBar.classList.add('show');
        } else {
            elements.selectionBar.classList.remove('show');
        }
    }

    // Right side properties inspector loader
    function selectMotor(id) {
        state.activeSelection = id;
        
        // Highlight active elements
        document.querySelectorAll('.explorer-row, .list-item, .tile-item, .large-icon-item').forEach(el => {
            if (el.dataset.id === id) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });

        const motor = state.motors.find(m => m.id === id);
        if (!motor) return;

        elements.panelTitle.textContent = state.paneMode === 'details' ? 'Details Pane' : 'Preview Pane';

        if (state.paneMode === 'details') {
            const cat = state.categories.find(c => c.id === motor.category_id || c.id === motor.categoryId);
            const catName = cat ? cat.name : 'Unassigned';
            
            // Build custom specifications rows
            let customRows = '';
            if (state.customSchema && state.customSchema.length > 0) {
                state.customSchema.forEach(f => {
                    const val = motor.custom_parameters && motor.custom_parameters[f.field_key] !== undefined ? motor.custom_parameters[f.field_key] : '-';
                    let valStr = val;
                    if (f.field_type === 'boolean') {
                        valStr = (val === true || val === 'true') ? 'Yes' : 'No';
                    } else if (val !== '-' && f.field_unit && val !== '') {
                        valStr = `${val} ${f.field_unit}`;
                    }
                    customRows += `
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">${escapeHTML(f.field_name)}</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(valStr)}</span>
                        </div>
                    `;
                });
            }

            elements.panelBody.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div style="font-size:0.9rem; font-weight:700; margin-bottom:8px;">Standard Fields</div>
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                        <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Model Name</span>
                        <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(motor.motor)}</span>
                    </div>
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                        <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Manufacturer</span>
                        <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(motor.company)}</span>
                    </div>
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                        <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Category Class</span>
                        <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(catName)} Class</span>
                    </div>
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                        <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Max Thrust</span>
                        <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(motor.thrust)}</span>
                    </div>
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                        <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">ESC Tested</span>
                        <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(motor.esc || '-')}</span>
                    </div>
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                        <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Propeller Tested</span>
                        <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(motor.prop || '-')}</span>
                    </div>
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                        <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Uploaded By</span>
                        <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(motor.uploaded_by || 'System Default')}</span>
                    </div>

                    ${customRows ? `<div style="font-size:0.9rem; font-weight:700; margin-top:15px; margin-bottom:8px;">Custom Schema Parameters</div>${customRows}` : ''}
                </div>
            `;
        } else {
            const initials = motor.motor.charAt(0).toUpperCase();
            const hash = motor.company.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const hue = hash % 360;
            const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%); width:64px; height:64px; border-radius:12px; font-weight:700; display:flex; align-items:center; justify-content:center; font-size:1.8rem; margin: 0 auto;`;

            // Action triggers for preview panel card
            const showEdit = (session.role === 'admin' || session.role === 'user');
            const showDelete = (session.role === 'admin');

            elements.panelBody.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:15px;">
                    <div style="${thumbStyle}">${initials}</div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <h3 style="margin:0; font-family:'Outfit',sans-serif; font-size:1.15rem;">${escapeHTML(motor.motor)}</h3>
                        <span style="font-size:0.8rem; color:var(--text-secondary); font-weight:500;">by ${escapeHTML(motor.company)}</span>
                    </div>
                    
                    <div style="width:100%; background:var(--bg-base); border-radius: var(--radius-md); padding: 12px; display:flex; flex-direction:column; gap:12px; box-sizing:border-box;">
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; gap:10px;">
                            <span style="color:var(--text-secondary); white-space:nowrap; flex-shrink:0;">Max Output Force</span>
                            <span style="font-weight:700; color:var(--primary-color); text-align:right; word-break:break-word;">${escapeHTML(motor.thrust)}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; gap:10px;">
                            <span style="color:var(--text-secondary); white-space:nowrap; flex-shrink:0;">Propeller Type</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(motor.prop || '-')}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; gap:10px;">
                            <span style="color:var(--text-secondary); white-space:nowrap; flex-shrink:0;">ESC Controller</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(motor.esc || '-')}</span>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:8px; width:100%;">
                        <div style="display:flex; justify-content:center; gap:10px;">
                            ${motor.linkMotor ? `<a href="${motor.linkMotor}" target="_blank" class="btn-secondary" style="font-size:0.75rem; padding: 6px 10px; text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="cpu" style="width:12px;"></i> Motor Spec</a>` : ''}
                            ${motor.linkEsc ? `<a href="${motor.linkEsc}" target="_blank" class="btn-secondary" style="font-size:0.75rem; padding: 6px 10px; text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="zap" style="width:12px;"></i> ESC Spec</a>` : ''}
                            ${motor.linkProp ? `<a href="${motor.linkProp}" target="_blank" class="btn-secondary" style="font-size:0.75rem; padding: 6px 10px; text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="wind" style="width:12px;"></i> Prop Spec</a>` : ''}
                        </div>

                        <div style="width:100%; border-top:1px solid var(--border-color); margin-top:10px; padding-top:15px; display:flex; flex-direction:column; gap:8px;">
                            <button class="btn-primary" id="btn-preview-compare" style="width:100%; font-size:0.8rem; padding: 8px;"><i data-lucide="git-compare" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Add to Comparison</button>
                            ${showEdit ? `<button class="btn-secondary" id="btn-preview-edit" style="width:100%; font-size:0.8rem; padding: 8px;"><i data-lucide="edit-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Edit Specs</button>` : ''}
                            ${showDelete ? `<button class="btn-danger" id="btn-preview-delete" style="width:100%; font-size:0.8rem; padding: 8px;"><i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Delete Record</button>` : ''}
                        </div>
                    </div>
                </div>
            `;

            // Bind triggers on preview card
            const compareBtn = document.getElementById('btn-preview-compare');
            if (compareBtn) {
                compareBtn.onclick = () => {
                    if (!state.selectedItems.includes(id)) {
                        state.selectedItems.push(id);
                        updateSelectionBar();
                        renderExplorer();
                    }
                };
            }
            const editBtn = document.getElementById('btn-preview-edit');
            if (editBtn) editBtn.onclick = () => triggerEditMotor(id);
            const deleteBtn = document.getElementById('btn-preview-delete');
            if (deleteBtn) deleteBtn.onclick = () => triggerDeleteMotor(id);
        }

        lucide.createIcons();
    }

    // Context menu trigger
    function showContextMenu(e, id) {
        e.preventDefault();
        elements.contextMenu.style.top = `${e.clientY}px`;
        elements.contextMenu.style.left = `${e.clientX}px`;
        elements.contextMenu.style.display = 'flex';
        elements.contextMenu.dataset.motorId = id;
    }

    // Modal popup to double click preview
    function openPreviewModal(id) {
        state.activeSelection = id;
        switchPaneMode('preview');
    }

    // Trigger Side-by-side comparison modal
    function triggerCompare(motorIds) {
        if (motorIds.length === 0) return;
        const selected = motorIds.map(id => state.motors.find(m => m.id === id)).filter(Boolean);
        
        let customRowsHtml = '';
        if (state.customSchema && state.customSchema.length > 0) {
            state.customSchema.forEach(f => {
                customRowsHtml += `
                    <tr>
                        <td><strong>${escapeHTML(f.field_name)}</strong></td>
                        ${selected.map(m => {
                            const val = m.custom_parameters && m.custom_parameters[f.field_key] !== undefined ? m.custom_parameters[f.field_key] : '-';
                            if (f.field_type === 'boolean') {
                                return `<td>${val === true || val === 'true' ? '<span style="color:#059669;font-weight:700;">Yes</span>' : '<span style="color:#e11d48;font-weight:700;">No</span>'}</td>`;
                            }
                            return `<td>${escapeHTML(val)} ${val !== '-' && f.field_unit && val !== '' ? escapeHTML(f.field_unit) : ''}</td>`;
                        }).join('')}
                    </tr>
                `;
            });
        }

        elements.comparisonResultTable.innerHTML = `
            <thead>
                <tr>
                    <th>Specification</th>
                    ${selected.map(m => `<th>${escapeHTML(m.motor)}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Manufacturer</strong></td>
                    ${selected.map(m => `<td>${escapeHTML(m.company)}</td>`).join('')}
                </tr>
                <tr>
                    <td><strong>Max Thrust</strong></td>
                    ${selected.map(m => `<td>${escapeHTML(m.thrust)}</td>`).join('')}
                </tr>
                <tr>
                    <td><strong>Recommended ESC</strong></td>
                    ${selected.map(m => `<td>${escapeHTML(m.esc || '-')}</td>`).join('')}
                </tr>
                <tr>
                    <td><strong>Recommended Propeller</strong></td>
                    ${selected.map(m => `<td>${escapeHTML(m.prop || '-')}</td>`).join('')}
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
    }

    // Trigger SheetJS File exports
    function triggerExport(motorIds) {
        if (motorIds.length === 0) return;
        const selected = motorIds.map(id => state.motors.find(m => m.id === id)).filter(Boolean);

        const customHeaders = (state.customSchema || []).map(f => `${f.field_name} [${f.field_key}]`);
        const headers = ["Motor Model Name", "Manufacturer", "Thrust Output", "ESC Used", "Propeller Used", "Motor Link", "ESC Link", "Propeller Link", ...customHeaders];
        
        const rows = [headers];
        selected.forEach(m => {
            const row = [
                m.motor,
                m.company,
                m.thrust,
                m.esc || '',
                m.prop || '',
                m.linkMotor || '',
                m.linkEsc || '',
                m.linkProp || ''
            ];
            (state.customSchema || []).forEach(f => {
                const val = m.custom_parameters && m.custom_parameters[f.field_key] !== undefined ? m.custom_parameters[f.field_key] : '';
                row.push(val);
            });
            rows.push(row);
        });

        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Selected Motors Specs");
        
        // Export file as CSV
        XLSX.writeFile(workbook, `ThrustVault_Export_Explorer_${Date.now()}.csv`);
        logUserActivity(session.email, session.role, 'Explorer Selection Exported', `Exported ${selected.length} specifications records via explorer.`);
    }

    // Trigger dynamic form inputs rendering for Edit Spec Modal
    function triggerEditMotor(id) {
        const motor = state.motors.find(m => m.id === id);
        if (!motor) return;

        elements.motorForm.dataset.id = id;
        document.getElementById('form-motor-name').value = motor.motor;
        document.getElementById('form-motor-company').value = motor.company;
        document.getElementById('form-motor-category').value = motor.category_id || motor.categoryId || '';
        document.getElementById('form-motor-thrust').value = motor.thrust;
        document.getElementById('form-motor-prop').value = motor.prop || '';
        document.getElementById('form-motor-esc').value = motor.esc || '';
        document.getElementById('form-motor-link').value = motor.linkMotor || '';
        document.getElementById('form-esc-link').value = motor.linkEsc || '';
        document.getElementById('form-prop-link').value = motor.linkProp || '';

        // Render dynamic custom schema fields in modal form
        const container = document.getElementById('dynamic-fields-container');
        if (container) {
            container.innerHTML = '';
            const params = motor.custom_parameters || {};
            state.customSchema.forEach(f => {
                const val = params[f.field_key] !== undefined ? params[f.field_key] : '';
                const div = document.createElement('div');
                div.className = 'form-group';
                
                if (f.field_type === 'boolean') {
                    const isChecked = val === true || val === 'true';
                    div.innerHTML = `
                        <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                            <input type="checkbox" class="custom-field-input" data-key="${f.field_key}" data-type="boolean" ${isChecked ? 'checked' : ''}>
                            <strong>${escapeHTML(f.field_name)}</strong> ${f.field_unit ? `(${escapeHTML(f.field_unit)})` : ''}
                        </label>
                    `;
                } else {
                    div.innerHTML = `
                        <label for="custom-field-${f.field_key}"><strong>${escapeHTML(f.field_name)}</strong> ${f.field_unit ? `(${escapeHTML(f.field_unit)})` : ''}</label>
                        <input type="${f.field_type === 'number' ? 'number' : 'text'}" id="custom-field-${f.field_key}" class="custom-field-input" data-key="${f.field_key}" data-type="${f.field_type}" value="${escapeHTML(String(val))}" placeholder="e.g. ${f.field_type === 'number' ? '100' : 'UAV Specs'}">
                    `;
                }
                container.appendChild(div);
            });
        }

        openModal(elements.motorModal);
    }

    // Trigger single motor delete action
    async function triggerDeleteMotor(id) {
        const motor = state.motors.find(m => m.id === id);
        if (!motor) return;

        const confirm = await customConfirm("Delete Specifications Record?", `Are you sure you want to permanently delete specifications for "${motor.motor}"? This action cannot be undone.`);
        if (confirm) {
            try {
                const res = await fetch(`/api/admin/motors?id=eq.${id}`, {
                    method: 'DELETE'
                });
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }

                logUserActivity(session.email, session.role, 'Motor Record Deleted', `Permanently deleted specifications for motor: ${motor.motor}`);
                
                state.selectedItems = state.selectedItems.filter(item => item !== id);
                updateSelectionBar();
                if (state.activeSelection === id) {
                    state.activeSelection = null;
                    switchPaneMode(state.paneMode); // reset panel display
                }
                await fetchData();
                renderExplorer();
            } catch (err) {
                console.error("Delete failed:", err);
                alert("Failed to delete record: " + err.message);
            }
        }
    }

    // Trigger bulk select delete action
    async function triggerDeleteBulk(ids) {
        if (ids.length === 0) return;

        const confirm = await customConfirm("Bulk Delete Records?", `Are you sure you want to permanently delete specifications for the ${ids.length} selected motors? This action cannot be undone.`);
        if (confirm) {
            try {
                const res = await fetch(`/api/admin/motors?id=in.(${ids.join(',')})`, {
                    method: 'DELETE'
                });
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }

                logUserActivity(session.email, session.role, 'Bulk Motor Records Deleted', `Bulk deleted ${ids.length} motors records from explorer.`);
                
                state.selectedItems = [];
                state.activeSelection = null;
                updateSelectionBar();
                switchPaneMode(state.paneMode);
                await fetchData();
                renderExplorer();
            } catch (err) {
                console.error("Bulk delete failed:", err);
                alert("Failed to delete records: " + err.message);
            }
        }
    }

    // Search bar suggestions logic
    function highlightMatch(text, query) {
        if (!text || !query) return escapeHTML(text || '');
        const escaped = escapeHTML(text);
        const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped.replace(new RegExp(`(${q})`, 'gi'), '<mark>$1</mark>');
    }

    function showSearchSuggestions(query) {
        const q = (query || '').trim();
        if (q.length < 1) {
            elements.suggestionsEl.style.display = 'none';
            return;
        }

        const scored = state.motors
            .map(m => {
                const score = (m.motor.toLowerCase().includes(q.toLowerCase()) ? 3 : 0) + (m.company.toLowerCase().includes(q.toLowerCase()) ? 1 : 0);
                return { motor: m, score };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);

        if (scored.length === 0) {
            elements.suggestionsEl.innerHTML = `<div class="suggestion-no-results">No motors match "<strong>${escapeHTML(q)}</strong>"</div>`;
            elements.suggestionsEl.style.display = 'block';
            return;
        }

        elements.suggestionsEl.innerHTML = scored.map(x => {
            const m = x.motor;
            const initials = m.motor.charAt(0).toUpperCase();
            return `
                <div class="suggestion-item" data-id="${escapeHTML(m.id)}">
                    <div class="suggestion-item-icon">${initials}</div>
                    <div class="suggestion-item-body">
                        <div class="suggestion-motor-name">${highlightMatch(m.motor, q)}</div>
                        <div class="suggestion-motor-meta">${highlightMatch(m.company, q)}</div>
                    </div>
                </div>`;
        }).join('');

        elements.suggestionsEl.querySelectorAll('.suggestion-item').forEach(item => {
            item.onclick = () => {
                const id = item.dataset.id;
                selectMotor(id);
                openPreviewModal(id);
                elements.suggestionsEl.style.display = 'none';
            };
        });

        elements.suggestionsEl.style.display = 'block';
    }

    // HTML escape utility
    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Sidebar integration coordinator
    function setupSidebar() {
        // Render category tabs inside the sidebar dynamically
        renderSidebarCategories();

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

    function renderSidebarCategories() {
        if (!elements.catList) return;
        elements.catList.innerHTML = '';
        
        state.categories.forEach(cat => {
            const count = state.motors.filter(m => m.category_id === cat.id || m.categoryId === cat.id).length;
            const div = document.createElement('div');
            div.className = 'category-tab';
            div.innerHTML = `
                <span>${escapeHTML(cat.name)}</span>
                <div style="display:flex; align-items:center; gap:5px;">
                    <span class="cat-count">${count}</span>
                </div>
            `;
            div.onclick = () => {
                sessionStorage.setItem('activeCategory', cat.id);
                const roleDash = session.role === 'admin' ? '/admin/dashboard' : (session.role === 'user' ? '/dashboard' : '/dashboard');
                window.location.href = roleDash;
            };
            elements.catList.appendChild(div);
        });

        // Add static "All Motors" tab at bottom
        const allTab = document.createElement('div');
        allTab.className = 'category-tab active';
        allTab.innerHTML = `<span>All Motors</span>`;
        allTab.onclick = () => {
            // Already on this explorer page, so reset filters/selections
            elements.searchInput.value = '';
            state.searchQuery = '';
            elements.searchClear.style.display = 'none';
            elements.selectGroupBy.value = 'none';
            state.groupBy = 'none';
            renderExplorer();
        };
        elements.catList.appendChild(allTab);
    }

    // Listen to sidebarLoaded event
    if (window.sidebarLoaded) {
        setupSidebar();
    } else {
        window.addEventListener('sidebarLoaded', setupSidebar);
    }

    init();
});
