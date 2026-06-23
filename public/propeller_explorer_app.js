// propeller_explorer_app.js
document.addEventListener('DOMContentLoaded', () => {
    let state = {
        propellers: [],
        selectedItems: [],
        activeSelection: null,
        viewMode: 'details',      // 'details' | 'list' | 'tiles' | 'large-icons'
        groupBy: 'none',          // 'none' | 'brand' | 'diameter'
        sortBy: 'name-asc',       // 'name-asc' | 'name-desc' | 'price-asc' | 'diameter-desc'
        searchQuery: '',
        paneMode: 'details'       // 'details' | 'preview' | 'none'
    };

    let session = null;

    // DOM Elements
    const elements = {
        searchInput: document.getElementById('search-input'),
        searchClear: document.getElementById('search-clear'),
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
        escModal: document.getElementById('esc-modal'), // uses same esc-modal container/structure
        escForm: document.getElementById('esc-form'),
        confirmModal: document.getElementById('confirm-modal'),
        btnAddProp: document.getElementById('btn-add-prop-spec'),
        
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
        if (!session || !['admin', 'user'].includes(session.role)) {
            window.location.href = '/login';
            return;
        }

        // Restrict actions based on role
        if (session.role === 'admin' || session.role === 'user') {
            if (elements.ctxBtnEdit) elements.ctxBtnEdit.style.display = 'flex';
            if (elements.btnAddProp) elements.btnAddProp.style.display = 'flex';
        } else {
            if (elements.btnAddProp) elements.btnAddProp.style.display = 'none';
        }

        if (session.role === 'admin') {
            if (elements.ctxBtnDelete) elements.ctxBtnDelete.style.display = 'flex';
            if (elements.btnBarDelete) elements.btnBarDelete.style.display = 'inline-flex';
        }

        // Theme restoration
        const currentTheme = localStorage.getItem('thrustvault_theme') || 'light';
        document.documentElement.setAttribute('data-theme', currentTheme);

        await fetchData();
        bindEvents();
        updatePaneButtons();
        renderExplorer();

        // Deep link loading
        const pathSegments = window.location.pathname.split('/');
        let modelName = '';
        if (pathSegments.length > 1) {
            const last = pathSegments[pathSegments.length - 1];
            const prev = pathSegments[pathSegments.length - 2];
            if (['propellers', 'propeller'].includes(prev.toLowerCase())) {
                modelName = decodeURIComponent(last);
            }
        }
        if (modelName) {
            const matchedProp = state.propellers.find(p => p.name.toLowerCase() === modelName.toLowerCase() || p.name === modelName);
            if (matchedProp) {
                state.activeSelection = matchedProp.id;
                selectProp(matchedProp.id);
                showPropProfile(matchedProp.id);
            }
        }
    }

    async function fetchData() {
        try {
            const res = await fetch('/api/propellers');
            if (!res.ok) throw new Error(`Propellers fetch failed: HTTP ${res.status}`);
            const data = await res.json();
            state.propellers = (data || []).map(p => ({
                id: p.id,
                name: p.name,
                brand: p.brand,
                price: p.price,
                currency: p.currency || 'USD',
                url: p.url,
                sku: p.sku,
                main_image: p.main_image,
                gallery_images: p.gallery_images || [],
                custom_parameters: p.custom_parameters || {}
            }));
        } catch (err) {
            console.error("Fetch failed", err);
        }
    }

    function getValueCaseInsensitive(params, possibleKeys) {
        if (!params) return undefined;
        const normalizedPossibles = possibleKeys.map(k => k.toLowerCase().replace(/[\s_-]+/g, ''));
        for (const key of Object.keys(params)) {
            const normKey = key.toLowerCase().replace(/[\s_-]+/g, '');
            if (normalizedPossibles.includes(normKey)) {
                return params[key];
            }
        }
        return undefined;
    }

    // Helper parser for Propeller Diameter
    function parseDiameter(prop) {
        const params = prop.custom_parameters || {};
        const keys = ['diameter', 'diameter_in', 'diameter_inch', 'propeller_diameter', 'size', 'diameter_mm'];
        
        for (const key of keys) {
            const valRaw = getValueCaseInsensitive(params, [key]);
            if (valRaw !== undefined) {
                let val = parseFloat(valRaw);
                if (key === 'diameter_mm' && !isNaN(val)) {
                    val = val / 25.4; // Convert mm to inches
                }
                if (!isNaN(val)) return val;
            }
        }
        // Fallback to name (e.g. "G30x10.5", "KDE-CF245-DP 24.5", "MF2211")
        const nameClean = prop.name.replace(/[a-zA-Z]/g, ' ').trim();
        const matches = nameClean.match(/(\d+(\.\d+)?)/g);
        if (matches && matches.length > 0) {
            const val = parseFloat(matches[0]);
            // If the first digit parsed seems like a valid diameter in inches (typically between 3" and 60" for drone propellers)
            if (val >= 3 && val <= 65) return val;
            // E.g., if it is "MF2211" -> first digit is 2211 which is invalid, look for others or return 0
        }
        return 0;
    }

    function parsePrice(priceStr) {
        if (!priceStr) return 0;
        const val = parseFloat(String(priceStr).replace(/[^0-9.]/g, ''));
        return isNaN(val) ? 0 : val;
    }

    // Log user actions to audit backend
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

    // Bind DOM events
    function bindEvents() {
        // Toolbar View modes
        if (elements.btnViewDetails) elements.btnViewDetails.onclick = () => switchViewMode('details');
        if (elements.btnViewList) elements.btnViewList.onclick = () => switchViewMode('list');
        if (elements.btnViewTiles) elements.btnViewTiles.onclick = () => switchViewMode('tiles');
        if (elements.btnViewLargeIcons) elements.btnViewLargeIcons.onclick = () => switchViewMode('large-icons');

        // Toolbar Selects
        if (elements.selectGroupBy) {
            elements.selectGroupBy.onchange = (e) => {
                state.groupBy = e.target.value;
                renderExplorer();
            };
        }
        if (elements.selectSortBy) {
            elements.selectSortBy.onchange = (e) => {
                state.sortBy = e.target.value;
                renderExplorer();
            };
        }

        // Toolbar Panels
        if (elements.btnPaneDetails) elements.btnPaneDetails.onclick = () => switchPaneMode('details');
        if (elements.btnPanePreview) elements.btnPanePreview.onclick = () => switchPaneMode('preview');
        if (elements.btnCloseSidePanel) elements.btnCloseSidePanel.onclick = () => switchPaneMode('none');

        // Selection actions
        if (elements.btnBarClear) {
            elements.btnBarClear.onclick = () => {
                state.selectedItems = [];
                document.querySelectorAll('.explorer-cb, .select-group-all').forEach(cb => cb.checked = false);
                updateSelectionBar();
                renderExplorer();
            };
        }
        if (elements.btnBarCompare) elements.btnBarCompare.onclick = () => triggerCompare(state.selectedItems);
        if (elements.btnBarExport) elements.btnBarExport.onclick = () => triggerExport(state.selectedItems);
        if (elements.btnBarDelete) elements.btnBarDelete.onclick = () => triggerDeleteBulk(state.selectedItems);

        // Search Input Events
        if (elements.searchInput) {
            elements.searchInput.oninput = (e) => {
                state.searchQuery = e.target.value;
                if (elements.searchClear) elements.searchClear.style.display = state.searchQuery ? 'block' : 'none';
                renderExplorer();
            };
        }
        if (elements.searchClear) {
            elements.searchClear.onclick = () => {
                elements.searchInput.value = '';
                state.searchQuery = '';
                elements.searchClear.style.display = 'none';
                renderExplorer();
            };
        }

        // Close context menu on outside click
        document.addEventListener('click', (e) => {
            if (elements.contextMenu && !e.target.closest('#explorer-context-menu')) {
                elements.contextMenu.style.display = 'none';
            }
        });

        // Context menu items action binding
        if (elements.contextMenu) {
            elements.contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
                item.onclick = () => {
                    const action = item.dataset.action;
                    const propId = elements.contextMenu.dataset.propId;
                    if (!propId) return;

                    if (action === 'preview') {
                        openPreviewModal(propId);
                    } else if (action === 'compare') {
                        if (!state.selectedItems.includes(propId)) {
                            state.selectedItems.push(propId);
                            updateSelectionBar();
                            renderExplorer();
                        }
                    } else if (action === 'edit') {
                        triggerEditProp(propId);
                    } else if (action === 'delete') {
                        triggerDeleteProp(propId);
                    }
                    elements.contextMenu.style.display = 'none';
                };
            });
        }

        // Add Propeller button trigger
        if (elements.btnAddProp) {
            elements.btnAddProp.onclick = () => {
                triggerAddProp();
            };
        }

        // Modals close triggers
        document.querySelectorAll('.modal-close-trigger').forEach(btn => {
            btn.onclick = () => {
                closeModal(elements.comparisonModal);
                closeModal(elements.escModal);
            };
        });

        // Form Submit
        if (elements.escForm) {
            elements.escForm.onsubmit = async (e) => {
                e.preventDefault();
                const propId = elements.escForm.dataset.id;
                
                const name = document.getElementById('form-esc-name').value.trim();
                const brand = document.getElementById('form-esc-brand').value.trim();
                const price = document.getElementById('form-esc-price').value.trim();
                const currency = document.getElementById('form-esc-currency').value.trim() || 'USD';
                const sku = document.getElementById('form-esc-sku').value.trim();
                const url = document.getElementById('form-esc-url').value.trim();
                const mainImage = document.getElementById('form-esc-image').value.trim();

                const payload = {
                    name,
                    brand,
                    price: price || null,
                    currency,
                    sku: sku || null,
                    url: url || null,
                    main_image: mainImage || null
                };

                try {
                    const saveBtn = document.getElementById('btn-save-esc');
                    saveBtn.disabled = true;
                    saveBtn.textContent = 'Saving...';

                    let res;
                    if (propId) {
                        // UPDATE (PATCH)
                        res = await fetch(`/api/db/propellers?id=eq.${propId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                    } else {
                        // INSERT (POST)
                        res = await fetch('/api/propellers', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                    }

                    if (!res.ok) {
                        const errData = await res.json();
                        throw new Error(errData.error || `HTTP ${res.status}`);
                    }

                    logUserActivity(session.email, session.role, propId ? 'Propeller Specifications Updated' : 'New Propeller Specifications Created', `Propeller Name: ${name}`);
                    closeModal(elements.escModal);
                    await fetchData();
                    renderExplorer();
                    if (propId && state.activeSelection === propId) {
                        selectProp(propId);
                    }
                } catch (err) {
                    console.error("Save propeller failed:", err);
                    alert("Failed to save propeller record: " + err.message);
                } finally {
                    const saveBtn = document.getElementById('btn-save-esc');
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save Propeller';
                }
            };
        }
    }

    function openModal(modal) { if (modal) modal.classList.add('show'); }
    function closeModal(modal) { if (modal) modal.classList.remove('show'); }

    function customConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = elements.confirmModal;
            if (!modal) {
                resolve(confirm(message));
                return;
            }
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

    function switchViewMode(mode) {
        state.viewMode = mode;
        [elements.btnViewDetails, elements.btnViewList, elements.btnViewTiles, elements.btnViewLargeIcons].forEach(btn => {
            if (btn) btn.classList.remove('active');
        });
        if (mode === 'details' && elements.btnViewDetails) elements.btnViewDetails.classList.add('active');
        if (mode === 'list' && elements.btnViewList) elements.btnViewList.classList.add('active');
        if (mode === 'tiles' && elements.btnViewTiles) elements.btnViewTiles.classList.add('active');
        if (mode === 'large-icons' && elements.btnViewLargeIcons) elements.btnViewLargeIcons.classList.add('active');
        renderExplorer();
    }

    function switchPaneMode(mode) {
        state.paneMode = mode;
        updatePaneButtons();
        if (mode === 'none') {
            if (elements.explorerSidePanel) elements.explorerSidePanel.classList.add('collapsed');
        } else {
            if (elements.explorerSidePanel) elements.explorerSidePanel.classList.remove('collapsed');
            if (state.activeSelection) {
                selectProp(state.activeSelection);
            } else {
                if (elements.panelTitle) elements.panelTitle.textContent = mode === 'details' ? 'Details Pane' : 'Preview Pane';
                if (elements.panelBody) {
                    elements.panelBody.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding: 40px 10px; color:var(--text-secondary);">
                            <i data-lucide="info" style="width:36px; height:36px; margin-bottom:10px; opacity:0.5;"></i>
                            <p style="margin:0; font-size:0.85rem;">Select a propeller specifications record to inspect its properties.</p>
                        </div>
                    `;
                    lucide.createIcons();
                }
            }
        }
    }

    function updatePaneButtons() {
        if (elements.btnPaneDetails) elements.btnPaneDetails.classList.remove('active');
        if (elements.btnPanePreview) elements.btnPanePreview.classList.remove('active');
        if (state.paneMode === 'details' && elements.btnPaneDetails) elements.btnPaneDetails.classList.add('active');
        if (state.paneMode === 'preview' && elements.btnPanePreview) elements.btnPanePreview.classList.add('active');
    }

    function renderExplorer() {
        const contentArea = elements.explorerContent;
        if (!contentArea) return;
        contentArea.innerHTML = '';

        // Search match filtering
        let filtered = [...state.propellers];
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            filtered = filtered.filter(p => 
                p.name.toLowerCase().includes(q) || 
                p.brand.toLowerCase().includes(q) ||
                (p.sku && p.sku.toLowerCase().includes(q))
            );
        }

        // Sorting
        filtered.sort((a, b) => {
            if (state.sortBy === 'name-asc') return a.name.localeCompare(b.name);
            if (state.sortBy === 'name-desc') return b.name.localeCompare(a.name);
            if (state.sortBy === 'price-asc') return parsePrice(a.price) - parsePrice(b.price);
            if (state.sortBy === 'diameter-desc') return parseDiameter(b) - parseDiameter(a);
            return 0;
        });

        // Grouping
        let grouped = {};
        if (state.groupBy === 'brand') {
            filtered.forEach(p => {
                const brandName = p.brand || 'Unknown Brand';
                if (!grouped[brandName]) grouped[brandName] = [];
                grouped[brandName].push(p);
            });
        } else if (state.groupBy === 'diameter') {
            filtered.forEach(p => {
                const dia = parseDiameter(p);
                const name = dia ? `${dia.toFixed(1)}" Diameter` : 'Unspecified Diameter';
                if (!grouped[name]) grouped[name] = [];
                grouped[name].push(p);
            });
        } else {
            grouped['All Propeller Specifications'] = filtered;
        }

        const keys = Object.keys(grouped).sort((a, b) => {
            // Sort grouped diameter numerically if applicable
            if (state.groupBy === 'diameter') {
                const numA = parseFloat(a);
                const numB = parseFloat(b);
                if (!isNaN(numA) && !isNaN(numB)) return numB - numA;
            }
            return a.localeCompare(b);
        });

        if (keys.length === 0 || (keys.length === 1 && grouped[keys[0]].length === 0)) {
            contentArea.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding: 60px 10px; color:var(--text-secondary);">
                    <i data-lucide="search" style="width:36px; height:36px; margin-bottom:10px; opacity:0.5;"></i>
                    <p style="margin:0; font-size:0.9rem;">No propeller records match your search criteria.</p>
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
                            <th style="width:40px;"><input type="checkbox" class="select-group-all" title="Select All"></th>
                            <th style="width:40px;"></th>
                            <th>Propeller Name</th>
                            <th>Brand</th>
                            <th>SKU</th>
                            <th>Diameter (inch)</th>
                            <th>Price</th>
                            <th style="width:60px; text-align:right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                const tbody = table.querySelector('tbody');
                const groupSelectAll = table.querySelector('.select-group-all');
                groupSelectAll.checked = items.every(p => state.selectedItems.includes(p.id));
                groupSelectAll.onchange = (e) => {
                    const checked = e.target.checked;
                    items.forEach(item => {
                        if (checked) {
                            if (!state.selectedItems.includes(item.id)) state.selectedItems.push(item.id);
                        } else {
                            state.selectedItems = state.selectedItems.filter(id => id !== item.id);
                        }
                    });
                    updateSelectionBar();
                    renderExplorer();
                };

                items.forEach(p => {
                    const tr = document.createElement('tr');
                    tr.className = `explorer-row ${state.activeSelection === p.id ? 'selected' : ''}`;
                    tr.dataset.id = p.id;

                    const isChecked = state.selectedItems.includes(p.id);
                    const initials = p.name.charAt(0).toUpperCase();
                    const hash = p.brand.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const hue = hash % 360;
                    const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%); width:24px; height:24px; border-radius:4px; font-weight:700; display:flex; align-items:center; justify-content:center; font-size:0.75rem;`;
                    
                    const dia = parseDiameter(p);
                    const priceDisp = p.price ? `$${p.price} ${p.currency}` : '-';

                    tr.innerHTML = `
                        <td><input type="checkbox" class="explorer-cb" data-id="${p.id}" ${isChecked ? 'checked' : ''}></td>
                        <td><div style="${thumbStyle}">${initials}</div></td>
                        <td><strong><a href="javascript:void(0)" class="item-name-link" style="color:var(--primary-color); font-weight:600; text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHTML(p.name)}</a></strong></td>
                        <td>${escapeHTML(p.brand)}</td>
                        <td>${escapeHTML(p.sku || '-')}</td>
                        <td>${dia ? `<span class="badge-thrust" style="background: rgba(13, 148, 136, 0.08); border-color: rgba(13, 148, 136, 0.2); color: #0d9488; font-weight:600;">${dia.toFixed(1)}"</span>` : '-'}</td>
                        <td>${escapeHTML(priceDisp)}</td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button class="btn-share text-slate-400 hover:text-[#003366] dark:hover:text-[#a7c8ff] transition-colors" data-type="propeller" data-name="${escapeHTML(p.name)}" title="Share Propeller Spec Link" style="background:none; border:none; cursor:pointer;"><i data-lucide="share-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                        </td>
                    `;

                    tr.onclick = (event) => {
                        if (event.target.closest('input[type="checkbox"]')) return;
                        selectProp(p.id);
                    };
                    const nameLink = tr.querySelector('.item-name-link');
                    if (nameLink) {
                        nameLink.onclick = (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            showPropProfile(p.id);
                        };
                    }
                    tr.ondblclick = () => openPreviewModal(p.id);
                    tr.oncontextmenu = (event) => showContextMenu(event, p.id);

                    tbody.appendChild(tr);
                });
                itemsContainer.appendChild(table);
            } else if (state.viewMode === 'list') {
                items.forEach(p => {
                    const div = document.createElement('div');
                    div.className = `list-item ${state.activeSelection === p.id ? 'selected' : ''}`;
                    div.dataset.id = p.id;

                    const isChecked = state.selectedItems.includes(p.id);
                    div.innerHTML = `
                        <input type="checkbox" class="explorer-cb" data-id="${p.id}" ${isChecked ? 'checked' : ''}>
                        <i data-lucide="wind" style="width:16px; height:16px; color:var(--text-secondary); flex-shrink:0;"></i>
                        <span style="font-size:0.85rem; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; flex:1;"><strong><a href="javascript:void(0)" class="item-name-link" style="color:var(--primary-color); font-weight:600; text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHTML(p.name)}</a></strong> <span style="color:var(--text-secondary);">(${escapeHTML(p.brand)})</span></span>
                        <button class="btn-share text-slate-400 hover:text-[#003366] dark:hover:text-[#a7c8ff] transition-colors" data-type="propeller" data-name="${escapeHTML(p.name)}" title="Share Propeller Spec Link" style="background:none; border:none; cursor:pointer; margin-left:auto;"><i data-lucide="share-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                    `;

                    div.onclick = (event) => {
                        if (event.target.closest('input[type="checkbox"]')) return;
                        selectProp(p.id);
                    };
                    const nameLink = div.querySelector('.item-name-link');
                    if (nameLink) {
                        nameLink.onclick = (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            showPropProfile(p.id);
                        };
                    }
                    div.ondblclick = () => openPreviewModal(p.id);
                    div.oncontextmenu = (event) => showContextMenu(event, p.id);

                    itemsContainer.appendChild(div);
                });
            } else if (state.viewMode === 'tiles') {
                items.forEach(p => {
                    const div = document.createElement('div');
                    div.className = `tile-item ${state.activeSelection === p.id ? 'selected' : ''}`;
                    div.dataset.id = p.id;

                    const isChecked = state.selectedItems.includes(p.id);
                    const initials = p.name.charAt(0).toUpperCase();
                    const hash = p.brand.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const hue = hash % 360;
                    const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%); width:32px; height:32px; border-radius:6px; font-weight:700; display:flex; align-items:center; justify-content:center; font-size:0.9rem; flex-shrink:0;`;

                    const dia = parseDiameter(p);
                    const specDisp = dia ? `${dia.toFixed(1)}"` : 'No size info';

                    div.innerHTML = `
                        <input type="checkbox" class="explorer-cb" data-id="${p.id}" ${isChecked ? 'checked' : ''}>
                        <div style="${thumbStyle}">${initials}</div>
                        <div style="display:flex; flex-direction:column; min-width:0; flex:1; gap:2px;">
                            <span style="font-size:0.85rem; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;"><a href="javascript:void(0)" class="item-name-link" style="color:var(--primary-color); text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHTML(p.name)}</a></span>
                            <span style="font-size:0.75rem; color:var(--text-secondary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHTML(p.brand)} &nbsp;·&nbsp; ${escapeHTML(specDisp)}</span>
                        </div>
                        <button class="btn-share text-slate-400 hover:text-[#003366] dark:hover:text-[#a7c8ff] transition-colors" data-type="propeller" data-name="${escapeHTML(p.name)}" title="Share Propeller Spec Link" style="background:none; border:none; cursor:pointer;"><i data-lucide="share-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                    `;

                    div.onclick = (event) => {
                        if (event.target.closest('input[type="checkbox"]')) return;
                        selectProp(p.id);
                    };
                    const nameLink = div.querySelector('.item-name-link');
                    if (nameLink) {
                        nameLink.onclick = (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            showPropProfile(p.id);
                        };
                    }
                    div.ondblclick = () => openPreviewModal(p.id);
                    div.oncontextmenu = (event) => showContextMenu(event, p.id);

                    itemsContainer.appendChild(div);
                });
            } else if (state.viewMode === 'large-icons') {
                items.forEach(p => {
                    const div = document.createElement('div');
                    div.className = `large-icon-item ${state.activeSelection === p.id ? 'selected' : ''}`;
                    div.dataset.id = p.id;

                    const isChecked = state.selectedItems.includes(p.id);
                    const initials = p.name.charAt(0).toUpperCase();
                    const hash = p.brand.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const hue = hash % 360;
                    const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%);`;

                    div.innerHTML = `
                        <div style="align-self:stretch; display:flex; justify-content:space-between; align-items:center; margin-bottom: -15px;">
                            <input type="checkbox" class="explorer-cb" data-id="${p.id}" ${isChecked ? 'checked' : ''}>
                            <button class="btn-share text-slate-400 hover:text-[#003366] dark:hover:text-[#a7c8ff] transition-colors" data-type="propeller" data-name="${escapeHTML(p.name)}" title="Share Propeller Spec Link" style="background:none; border:none; cursor:pointer; padding:0;"><i data-lucide="share-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                        </div>
                        <div class="large-icon-thumbnail" style="${thumbStyle}">${initials}</div>
                        <div style="display:flex; flex-direction:column; width:100%; min-width:0; gap:2px;">
                            <span style="font-size:0.82rem; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; width:100%;"><a href="javascript:void(0)" class="item-name-link" style="color:var(--primary-color); text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHTML(p.name)}</a></span>
                            <span style="font-size:0.72rem; color:var(--text-secondary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; width:100%;">${escapeHTML(p.brand)}</span>
                        </div>
                    `;

                    div.onclick = (event) => {
                        if (event.target.closest('input[type="checkbox"]')) return;
                        selectProp(p.id);
                    };
                    const nameLink = div.querySelector('.item-name-link');
                    if (nameLink) {
                        nameLink.onclick = (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            showPropProfile(p.id);
                        };
                    }
                    div.ondblclick = () => openPreviewModal(p.id);
                    div.oncontextmenu = (event) => showContextMenu(event, p.id);

                    itemsContainer.appendChild(div);
                });
            }

            itemsContainer.querySelectorAll('.explorer-cb').forEach(cb => {
                cb.onchange = (event) => {
                    const id = event.target.dataset.id;
                    if (event.target.checked) {
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

        // Wire up share button click handlers
        contentArea.querySelectorAll('.btn-share').forEach(btn => {
            btn.onclick = (event) => {
                event.stopPropagation();
                const name = btn.dataset.name;
                const type = btn.dataset.type;
                const shareUrl = `${window.location.origin}/share/${type}/${encodeURIComponent(name)}`;
                if (window.showShareModal) {
                    window.showShareModal(type, name, shareUrl);
                } else {
                    navigator.clipboard.writeText(shareUrl).then(() => alert('Link copied to clipboard!'));
                }
            };
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

    function updateSelectionBar() {
        const count = state.selectedItems.length;
        if (count > 0) {
            if (elements.selectionCountText) elements.selectionCountText.textContent = `${count} propeller${count !== 1 ? 's' : ''} selected`;
            if (elements.selectionBar) elements.selectionBar.classList.add('show');
        } else {
            if (elements.selectionBar) elements.selectionBar.classList.remove('show');
        }
    }

    function showPropProfile(id) {
        const prop = state.propellers.find(p => p.id === id);
        if (!prop) return;

        const overlay = document.getElementById('profile-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';

        // Update URL
        const prefix = window.location.pathname.startsWith('/admin') ? '/admin/propeller/' : '/propeller/';
        history.pushState({ propId: id }, '', prefix + encodeURIComponent(prop.name));

        // Set title and brand
        document.getElementById('profile-title').textContent = prop.name;
        document.getElementById('profile-brand-badge').textContent = prop.brand;

        // Core specs
        const coreSpecsContainer = document.getElementById('profile-core-specs');
        const diameter = parseDiameter(prop);
        const priceDisp = prop.price ? `$${prop.price} ${prop.currency}` : '-';
        const prodType = getValueCaseInsensitive(prop.custom_parameters, ['product_type', 'producttype', 'category']) || 'Propeller';

        coreSpecsContainer.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-secondary); font-weight:500;">Manufacturer</span>
                <span style="font-weight:600; text-align:right;">${escapeHTML(prop.brand)}</span>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-secondary); font-weight:500;">SKU</span>
                <span style="font-weight:600; text-align:right;">${escapeHTML(prop.sku || '-')}</span>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-secondary); font-weight:500;">Price</span>
                <span style="font-weight:600; text-align:right;">${escapeHTML(priceDisp)}</span>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-secondary); font-weight:500;">Diameter</span>
                <span style="font-weight:600; text-align:right;">${diameter ? diameter.toFixed(1) + ' in' : '-'}</span>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-secondary); font-weight:500;">Product Type</span>
                <span style="font-weight:600; text-align:right;">${escapeHTML(prodType)}</span>
            </div>
        `;

        // Links
        const linksCard = document.getElementById('profile-links-card');
        const linksContainer = document.getElementById('profile-links-container');
        if (prop.url) {
            linksCard.style.display = 'block';
            linksContainer.innerHTML = `
                <a href="${prop.url}" target="_blank" class="profile-link-btn" style="display:flex; justify-content:space-between; align-items:center; text-decoration:none; padding:10px; background:var(--bg-base); border-radius:6px; border:1px solid var(--border-color); font-size:0.85rem; color:var(--text-primary);">
                    <span style="display:flex; align-items:center; gap:8px;"><i data-lucide="external-link" style="width:16px; height:16px; color:var(--primary-color);"></i> Official Product Page</span>
                    <i data-lucide="arrow-up-right" style="width:14px; height:14px; color:var(--text-secondary);"></i>
                </a>
            `;
        } else {
            linksCard.style.display = 'none';
        }

        // Description
        const descCard = document.getElementById('profile-desc-card');
        const descText = document.getElementById('profile-desc-text');
        const description = getValueCaseInsensitive(prop.custom_parameters, ['description_text', 'description']);
        if (description) {
            descCard.style.display = 'block';
            descText.textContent = description;
        } else {
            descCard.style.display = 'none';
        }

        // Collect images for gallery
        const imagesSet = new Set();
        if (prop.main_image && prop.main_image.startsWith('http')) {
            imagesSet.add(prop.main_image);
        }

        // Parse other potential image fields
        const imageKeys = [
            'gallery_images', 'description_images', 'specification_images', 
            'technical_drawings', 'local_technical_drawings', 'local_specification_images'
        ];
        imageKeys.forEach(k => {
            const val = getValueCaseInsensitive(prop.custom_parameters, [k]);
            if (val) {
                if (Array.isArray(val)) {
                    val.forEach(img => {
                        if (typeof img === 'string' && img.startsWith('http')) imagesSet.add(img);
                    });
                } else if (typeof val === 'string') {
                    val.split(',').map(s => s.trim()).forEach(img => {
                        if (img.startsWith('http')) imagesSet.add(img);
                    });
                }
            }
        });

        const galleryCard = document.getElementById('profile-gallery-card');
        const galleryContainer = document.getElementById('profile-gallery-container');
        if (imagesSet.size > 0) {
            galleryCard.style.display = 'block';
            galleryContainer.innerHTML = Array.from(imagesSet).map(imgUrl => `
                <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 6px; background:#fff; display:flex; justify-content:center; align-items:center; aspect-ratio:1; cursor:pointer;" onclick="window.open('${imgUrl}', '_blank')">
                    <img src="${imgUrl}" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:4px; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                </div>
            `).join('');
        } else {
            galleryCard.style.display = 'none';
        }

        // Custom specifications (filter out visual/text fields already rendered)
        const customCard = document.getElementById('profile-custom-card');
        const customSpecsContainer = document.getElementById('profile-custom-specs');
        const keysToHide = [
            'name', 'brand', 'price', 'currency', 'url', 'sku', 
            'main_image', 'gallery_images', 'product_type', 'max_thrust_g',
            'breadcrumbs', 'category', 'specifications_tables', 'technical_drawings',
            'specification_images', 'description_images', 'local_technical_drawings',
            'local_specification_images', 'test_data', 'description_text', 'description', 'options'
        ];
        const normalizedKeysToHide = keysToHide.map(k => k.toLowerCase().replace(/[\s_-]+/g, ''));

        let customHtml = '';
        const params = prop.custom_parameters || {};
        
        // Render options separately at the top of custom params if they exist
        const optionsVal = getValueCaseInsensitive(params, ['options']);
        if (optionsVal) {
            let optionsStr = '';
            if (typeof optionsVal === 'object' && optionsVal !== null) {
                if (Array.isArray(optionsVal)) {
                    optionsStr = optionsVal.map(o => typeof o === 'object' ? JSON.stringify(o) : String(o)).join(', ');
                } else {
                    optionsStr = Object.entries(optionsVal).map(([ok, ov]) => `${ok}: ${ov}`).join(', ');
                }
            } else {
                optionsStr = String(optionsVal);
            }
            if (optionsStr && optionsStr !== '[object Object]') {
                customHtml += `
                    <div style="display:flex; flex-direction:column; padding: 6px 0; border-bottom:1px solid var(--border-color); gap:4px;">
                        <span style="color:var(--text-secondary); font-size:0.8rem; font-weight:500;">Product Options</span>
                        <div style="display:flex; flex-wrap:wrap; gap:5px;">
                            ${optionsStr.split(',').map(opt => `<span style="background:var(--border-color); color:var(--text-primary); font-size:0.75rem; padding:2px 8px; border-radius:4px; font-weight:500;">${escapeHTML(opt.trim())}</span>`).join('')}
                        </div>
                    </div>
                `;
            }
        }

        const sortedKeys = Object.keys(params).filter(k => !normalizedKeysToHide.includes(k.toLowerCase().replace(/[\s_-]+/g, ''))).sort();
        sortedKeys.forEach(k => {
            const val = params[k];
            let valStr = '';
            if (typeof val === 'object' && val !== null) {
                if (Array.isArray(val)) {
                    valStr = val.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(', ');
                } else {
                    valStr = Object.entries(val).map(([subK, subV]) => `${subK}: ${subV}`).join(', ');
                }
            } else if (typeof val === 'boolean') {
                valStr = val ? 'Yes' : 'No';
            } else {
                valStr = String(val);
            }

            const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            customHtml += `
                <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color); gap:12px;">
                    <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">${escapeHTML(label)}</span>
                    <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(valStr)}</span>
                </div>
            `;
        });

        if (customHtml) {
            customCard.style.display = 'block';
            customSpecsContainer.innerHTML = customHtml;
        } else {
            customCard.style.display = 'none';
        }

        // Back button event wiring
        const backBtn = document.getElementById('btn-profile-back');
        if (backBtn) {
            backBtn.onclick = () => {
                overlay.style.display = 'none';
                const prefix = window.location.pathname.startsWith('/admin') ? '/admin/propellers' : '/propellers';
                history.pushState(null, '', prefix);
            };
        }

        // Share button event wiring
        const shareBtn = document.getElementById('btn-profile-share');
        if (shareBtn) {
            shareBtn.onclick = () => {
                const shareUrl = `${window.location.origin}/share/propeller/${encodeURIComponent(prop.name)}`;
                navigator.clipboard.writeText(shareUrl)
                    .then(() => {
                        const originalHTML = shareBtn.innerHTML;
                        shareBtn.innerHTML = `<i data-lucide="check" style="width:14px; height:14px; color:#22c55e;"></i> Copied!`;
                        if (window.lucide) window.lucide.createIcons();
                        setTimeout(() => {
                            shareBtn.innerHTML = originalHTML;
                            if (window.lucide) window.lucide.createIcons();
                        }, 2000);
                    })
                    .catch(err => {
                        console.error('Failed to copy share link:', err);
                    });
            };
        }

        lucide.createIcons();
    }

    function selectProp(id) {
        state.activeSelection = id;
        document.querySelectorAll('.explorer-row, .list-item, .tile-item, .large-icon-item').forEach(el => {
            if (el.dataset.id === id) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });

        const prop = state.propellers.find(p => p.id === id);
        if (!prop) return;

        if (elements.panelTitle) elements.panelTitle.textContent = state.paneMode === 'details' ? 'Details Pane' : 'Preview Pane';

        // Render for either mode
        if (elements.panelBody) {
            // Find all potential images
            const imagesSet = new Set();
            if (prop.main_image && prop.main_image.startsWith('http')) {
                imagesSet.add(prop.main_image);
            }
            const imageKeys = [
                'gallery_images', 'description_images', 'specification_images', 
                'technical_drawings', 'local_technical_drawings', 'local_specification_images'
            ];
            imageKeys.forEach(k => {
                const val = getValueCaseInsensitive(prop.custom_parameters, [k]);
                if (val) {
                    if (Array.isArray(val)) {
                        val.forEach(img => {
                            if (typeof img === 'string' && img.startsWith('http')) imagesSet.add(img);
                        });
                    } else if (typeof val === 'string') {
                        val.split(',').map(s => s.trim()).forEach(img => {
                            if (img.startsWith('http')) imagesSet.add(img);
                        });
                    }
                }
            });
            const allImages = Array.from(imagesSet);
            const mainImgUrl = allImages[0] || '';

            // Image Preview HTML
            let imageHtml = '';
            if (mainImgUrl) {
                imageHtml = `
                    <div class="side-panel-image-preview" style="text-align: center; margin-bottom: 12px; border-radius: 8px; border: 1px solid var(--border-color); padding: 8px; background: #fff; display: flex; justify-content: center; align-items: center; height:120px;">
                        <img src="${mainImgUrl}" style="max-height: 100%; max-width: 100%; object-fit: contain;">
                    </div>
                `;
            }

            // Thumbnail grid HTML for other images
            let thumbnailsHtml = '';
            if (allImages.length > 1) {
                thumbnailsHtml = `
                    <div style="margin-top: 10px; margin-bottom: 10px;">
                        <div style="font-size: 0.75rem; font-weight: 700; color:var(--text-secondary); margin-bottom: 4px;">More Images</div>
                        <div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px;">
                            ${allImages.slice(1).map(imgUrl => `
                                <div style="width: 40px; height: 40px; border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden; background: #fff; flex-shrink: 0; cursor: pointer;" onclick="window.open('${imgUrl}', '_blank')">
                                    <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: contain;">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // Description HTML
            const description = getValueCaseInsensitive(prop.custom_parameters, ['description_text', 'description']);
            let descHtml = '';
            if (description) {
                descHtml = `
                    <div style="margin-top: 10px; margin-bottom: 10px;">
                        <div style="font-size: 0.75rem; font-weight: 700; color:var(--text-secondary); margin-bottom: 4px;">Description</div>
                        <div style="font-size: 0.75rem; line-height: 1.4; color: var(--text-primary); max-height: 80px; overflow-y: auto; padding: 6px 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-base); white-space: pre-line;">
                            ${escapeHTML(description)}
                        </div>
                    </div>
                `;
            }

            // View Profile & Share Button
            const viewProfileBtnHtml = `
                <div style="display:flex; flex-direction:column; gap:8px; margin-bottom: 15px; width:100%;">
                    <button class="btn-primary" id="btn-view-full-profile" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; padding: 8px; font-size:0.8rem; cursor:pointer;">
                        <i data-lucide="expand" style="width: 14px; height: 14px;"></i> View Full Specs Profile
                    </button>
                    <button class="btn-secondary" id="btn-share-spec" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; padding: 8px; font-size:0.8rem; cursor:pointer; color: var(--primary-color); border-color: var(--primary-color);">
                        <i data-lucide="share-2" style="width: 14px; height: 14px;"></i> Share Spec Link
                    </button>
                </div>
            `;

            if (state.paneMode === 'details') {
                // Dynamic custom parameter rows (hiding visually rendered elements)
                let customRows = '';
                const params = prop.custom_parameters || {};
                const keysToHide = [
                    'name', 'brand', 'price', 'currency', 'url', 'sku', 
                    'main_image', 'gallery_images', 'product_type', 'max_thrust_g',
                    'breadcrumbs', 'category', 'specifications_tables', 'technical_drawings',
                    'specification_images', 'description_images', 'local_technical_drawings',
                    'local_specification_images', 'test_data', 'description_text', 'description', 'options'
                ];
                const normalizedKeysToHide = keysToHide.map(k => k.toLowerCase().replace(/[\s_-]+/g, ''));

                // Options badges
                const optionsVal = getValueCaseInsensitive(params, ['options']);
                if (optionsVal) {
                    let optionsStr = '';
                    if (typeof optionsVal === 'object' && optionsVal !== null) {
                        if (Array.isArray(optionsVal)) {
                            optionsStr = optionsVal.map(o => typeof o === 'object' ? JSON.stringify(o) : String(o)).join(', ');
                        } else {
                            optionsStr = Object.entries(optionsVal).map(([ok, ov]) => `${ok}: ${ov}`).join(', ');
                        }
                    } else {
                        optionsStr = String(optionsVal);
                    }
                    if (optionsStr && optionsStr !== '[object Object]') {
                        customRows += `
                            <div style="display:flex; flex-direction:column; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:4px;">
                                <span style="color:var(--text-secondary); font-size:0.75rem; font-weight:500;">Options</span>
                                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                                    ${optionsStr.split(',').map(opt => `<span style="background:var(--border-color); color:var(--text-primary); font-size:0.7rem; padding:1px 6px; border-radius:3px; font-weight:500;">${escapeHTML(opt.trim())}</span>`).join('')}
                                </div>
                            </div>
                        `;
                    }
                }

                const sortedKeys = Object.keys(params).filter(k => !normalizedKeysToHide.includes(k.toLowerCase().replace(/[\s_-]+/g, ''))).sort();
                sortedKeys.forEach(k => {
                    const val = params[k];
                    let valStr = '';
                    if (typeof val === 'object' && val !== null) {
                        if (Array.isArray(val)) {
                            valStr = val.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(', ');
                        } else {
                            valStr = Object.entries(val).map(([subK, subV]) => `${subK}: ${subV}`).join(', ');
                        }
                    } else if (typeof val === 'boolean') {
                        valStr = val ? 'Yes' : 'No';
                    } else {
                        valStr = String(val);
                    }
                    
                    const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    customRows += `
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">${escapeHTML(label)}</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(valStr)}</span>
                        </div>
                    `;
                });

                const priceDisp = prop.price ? `$${prop.price} ${prop.currency}` : '-';

                elements.panelBody.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        ${viewProfileBtnHtml}
                        ${imageHtml}
                        
                        <div style="font-size:0.85rem; font-weight:700; margin-bottom:4px;">Standard Fields</div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Propeller Name</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(prop.name)}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Manufacturer</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(prop.brand)}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">SKU</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(prop.sku || '-')}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Price</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(priceDisp)}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Parsed Diameter</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${parseDiameter(prop) ? parseDiameter(prop).toFixed(1) + ' inches' : '-'}</span>
                        </div>

                        ${thumbnailsHtml}
                        ${descHtml}

                        ${customRows ? `<div style="font-size:0.85rem; font-weight:700; margin-top:10px; margin-bottom:4px;">Custom Parameters</div>${customRows}` : ''}
                    </div>
                `;
            } else {
                // Preview Pane mode
                const showEdit = (session.role === 'admin' || session.role === 'user');
                const showDelete = (session.role === 'admin');

                const initials = prop.name.charAt(0).toUpperCase();
                const hash = prop.brand.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const hue = hash % 360;
                const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%); width:64px; height:64px; border-radius:12px; font-weight:700; display:flex; align-items:center; justify-content:center; font-size:1.8rem; margin: 0 auto;`;

                const fallbackImageHtml = mainImgUrl ? 
                    `<img src="${mainImgUrl}" alt="${escapeHTML(prop.name)}" style="width:120px; height:120px; object-fit:contain; border-radius:8px; border:1px solid var(--border-color); background:#fff; padding:4px; margin: 0 auto; display:block;">` :
                    `<div style="${thumbStyle}">${initials}</div>`;

                elements.panelBody.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:12px;">
                        ${viewProfileBtnHtml}
                        ${fallbackImageHtml}
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <h3 style="margin:0; font-family:'Outfit',sans-serif; font-size:1.1rem;">${escapeHTML(prop.name)}</h3>
                            <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:500;">by ${escapeHTML(prop.brand)}</span>
                        </div>
                        
                        <div style="width:100%; background:var(--bg-base); border-radius: var(--radius-md); padding: 10px; display:flex; flex-direction:column; gap:10px; box-sizing:border-box;">
                            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.8rem;">
                                <span style="color:var(--text-secondary); white-space:nowrap;">Propeller Size</span>
                                <span style="font-weight:700; color:var(--primary-color);">${parseDiameter(prop) ? parseDiameter(prop).toFixed(1) + ' inches' : '-'}</span>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.8rem;">
                                <span style="color:var(--text-secondary); white-space:nowrap;">Price</span>
                                <span style="font-weight:600;">${prop.price ? `$${prop.price} ${prop.currency}` : '-'}</span>
                            </div>
                        </div>

                        ${thumbnailsHtml}
                        ${descHtml}

                        <div style="display:flex; flex-direction:column; gap:8px; width:100%;">
                            <div style="display:flex; justify-content:center; gap:10px;">
                                ${prop.url ? `<a href="${prop.url}" target="_blank" class="btn-secondary" style="font-size:0.75rem; padding: 6px 12px; text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="external-link" style="width:12px;"></i> Product Page</a>` : ''}
                            </div>

                            <div style="width:100%; border-top:1px solid var(--border-color); margin-top:5px; padding-top:10px; display:flex; flex-direction:column; gap:6px;">
                                <button class="btn-primary" id="btn-preview-compare" style="width:100%; font-size:0.75rem; padding: 6px;"><i data-lucide="git-compare" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Add to Comparison</button>
                                ${showEdit ? `<button class="btn-secondary" id="btn-preview-edit" style="width:100%; font-size:0.75rem; padding: 6px;"><i data-lucide="edit-2" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Edit Specs</button>` : ''}
                                ${showDelete ? `<button class="btn-danger" id="btn-preview-delete" style="width:100%; font-size:0.75rem; padding: 6px;"><i data-lucide="trash-2" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Delete Record</button>` : ''}
                            </div>
                        </div>
                    </div>
                `;

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
                if (editBtn) editBtn.onclick = () => triggerEditProp(id);
                const deleteBtn = document.getElementById('btn-preview-delete');
                if (deleteBtn) deleteBtn.onclick = () => triggerDeleteProp(id);
            }

            // Bind the full profile button
            const viewProfileBtn = document.getElementById('btn-view-full-profile');
            if (viewProfileBtn) {
                viewProfileBtn.onclick = () => {
                    showPropProfile(id);
                };
            }

            // Bind the share button
            const shareSpecBtn = document.getElementById('btn-share-spec');
            if (shareSpecBtn) {
                shareSpecBtn.onclick = () => {
                    const shareUrl = `${window.location.origin}/share/propeller/${encodeURIComponent(prop.name)}`;
                    if (window.showShareModal) {
                        window.showShareModal('propeller', prop.name, shareUrl);
                    } else {
                        navigator.clipboard.writeText(shareUrl).then(() => alert('Link copied to clipboard!'));
                    }
                };
            }
        }

        lucide.createIcons();
    }

    function openPreviewModal(id) {
        showPropProfile(id);
    }

    function triggerCompare(propIds) {
        if (propIds.length === 0) return;
        const selected = propIds.map(id => state.propellers.find(p => p.id === id)).filter(Boolean);

        // Collect all distinct custom parameter keys
        const customKeysSet = new Set();
        selected.forEach(prop => {
            Object.keys(prop.custom_parameters || {}).forEach(k => customKeysSet.add(k));
        });
        const customKeys = Array.from(customKeysSet).sort();

        let customRowsHtml = '';
        customKeys.forEach(k => {
            const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            customRowsHtml += `
                <tr>
                    <td><strong>${escapeHTML(label)}</strong></td>
                    ${selected.map(prop => {
                        const val = prop.custom_parameters && prop.custom_parameters[k] !== undefined ? prop.custom_parameters[k] : '-';
                        let valStr = String(val);
                        if (typeof val === 'boolean') {
                            valStr = val ? '<span style="color:#059669;font-weight:700;">Yes</span>' : '<span style="color:#e11d48;font-weight:700;">No</span>';
                        }
                        return `<td>${valStr}</td>`;
                    }).join('')}
                </tr>
            `;
        });

        if (elements.comparisonResultTable) {
            elements.comparisonResultTable.innerHTML = `
                <thead>
                    <tr>
                        <th>Specification</th>
                        ${selected.map(prop => `<th>${escapeHTML(prop.name)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Manufacturer</strong></td>
                        ${selected.map(prop => `<td>${escapeHTML(prop.brand)}</td>`).join('')}
                    </tr>
                    <tr>
                        <td><strong>SKU</strong></td>
                        ${selected.map(prop => `<td>${escapeHTML(prop.sku || '-')}</td>`).join('')}
                    </tr>
                    <tr>
                        <td><strong>Price</strong></td>
                        ${selected.map(prop => `<td>${prop.price ? `$${prop.price} ${prop.currency}` : '-'}</td>`).join('')}
                    </tr>
                    <tr>
                        <td><strong>Parsed Diameter</strong></td>
                        ${selected.map(prop => `<td>${parseDiameter(prop) ? parseDiameter(prop).toFixed(1) + ' inches' : '-'}</td>`).join('')}
                    </tr>
                    ${customRowsHtml}
                    <tr>
                        <td><strong>Reference Link</strong></td>
                        ${selected.map(prop => `
                            <td>
                                ${prop.url ? `<a href="${prop.url}" target="_blank" style="display:inline-flex; align-items:center; gap:5px;"><i data-lucide="external-link" style="width:14px;"></i> Product Page</a>` : '-'}
                            </td>
                        `).join('')}
                    </tr>
                </tbody>
            `;
        }

        openModal(elements.comparisonModal);
        lucide.createIcons();
    }

    function triggerExport(propIds) {
        if (propIds.length === 0) return;
        const selected = propIds.map(id => state.propellers.find(p => p.id === id)).filter(Boolean);

        // Collect all distinct custom parameter keys
        const customKeysSet = new Set();
        selected.forEach(prop => {
            Object.keys(prop.custom_parameters || {}).forEach(k => customKeysSet.add(k));
        });
        const customKeys = Array.from(customKeysSet).sort();

        const headers = ["Propeller Name", "Brand", "SKU", "Price", "Currency", "Diameter (inch)", "URL", ...customKeys];
        const rows = [headers];

        selected.forEach(p => {
            const row = [
                p.name,
                p.brand,
                p.sku || '',
                p.price || '',
                p.currency || 'USD',
                parseDiameter(p) || '',
                p.url || ''
            ];
            customKeys.forEach(k => {
                const val = p.custom_parameters && p.custom_parameters[k] !== undefined ? p.custom_parameters[k] : '';
                row.push(val);
            });
            rows.push(row);
        });

        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Selected Propeller Specs");
        
        XLSX.writeFile(workbook, `ThrustVault_Propellers_Export_${Date.now()}.csv`);
        logUserActivity(session.email, session.role, 'Explorer Propeller Selection Exported', `Exported ${selected.length} propeller records.`);
    }

    function triggerAddProp() {
        if (!elements.escForm) return;
        elements.escForm.reset();
        elements.escForm.dataset.id = '';
        document.getElementById('modal-title').textContent = 'Add Propeller Specifications';
        openModal(elements.escModal);
    }

    function triggerEditProp(id) {
        const prop = state.propellers.find(p => p.id === id);
        if (!prop) return;

        elements.escForm.dataset.id = id;
        document.getElementById('modal-title').textContent = 'Edit Propeller Specifications';
        document.getElementById('form-esc-name').value = prop.name;
        document.getElementById('form-esc-brand').value = prop.brand;
        document.getElementById('form-esc-price').value = prop.price || '';
        document.getElementById('form-esc-currency').value = prop.currency || 'USD';
        document.getElementById('form-esc-sku').value = prop.sku || '';
        document.getElementById('form-esc-url').value = prop.url || '';
        document.getElementById('form-esc-image').value = prop.main_image || '';

        openModal(elements.escModal);
    }

    async function triggerDeleteProp(id) {
        const prop = state.propellers.find(p => p.id === id);
        if (!prop) return;

        const confirmDel = await customConfirm("Delete Propeller Record?", `Are you sure you want to permanently delete specifications for "${prop.name}"?`);
        if (confirmDel) {
            try {
                // Delete using internal Proxy table DELETE
                const res = await fetch(`/api/db/propellers?id=eq.${id}`, {
                    method: 'DELETE'
                });
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }

                logUserActivity(session.email, session.role, 'Propeller Record Deleted', `Permanently deleted propeller: ${prop.name}`);
                
                state.selectedItems = state.selectedItems.filter(item => item !== id);
                updateSelectionBar();
                if (state.activeSelection === id) {
                    state.activeSelection = null;
                    switchPaneMode(state.paneMode);
                }
                await fetchData();
                renderExplorer();
            } catch (err) {
                console.error("Delete failed:", err);
                alert("Failed to delete record: " + err.message);
            }
        }
    }

    async function triggerDeleteBulk(ids) {
        if (ids.length === 0) return;

        const confirmDel = await customConfirm("Bulk Delete Records?", `Are you sure you want to permanently delete ${ids.length} selected propeller records?`);
        if (confirmDel) {
            try {
                // Delete via query table proxy bulk syntax
                const res = await fetch(`/api/db/propellers?id=in.(${ids.join(',')})`, {
                    method: 'DELETE'
                });
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }

                logUserActivity(session.email, session.role, 'Bulk Propeller Records Deleted', `Bulk deleted ${ids.length} propeller records.`);
                
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

    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    init();
});
