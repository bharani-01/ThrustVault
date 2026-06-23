// esc_explorer_app.js
document.addEventListener('DOMContentLoaded', () => {
    let state = {
        escs: [],
        selectedItems: [],
        activeSelection: null,
        viewMode: 'details',      // 'details' | 'list' | 'tiles' | 'large-icons'
        groupBy: 'none',          // 'none' | 'brand' | 'voltage' | 'current'
        sortBy: 'name-asc',       // 'name-asc' | 'name-desc' | 'price-asc' | 'current-desc' | 'voltage-desc'
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
        escModal: document.getElementById('esc-modal'),
        escForm: document.getElementById('esc-form'),
        confirmModal: document.getElementById('confirm-modal'),
        btnAddEsc: document.getElementById('btn-add-esc-spec'),
        
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
            if (elements.btnAddEsc) elements.btnAddEsc.style.display = 'flex';
        } else {
            if (elements.btnAddEsc) elements.btnAddEsc.style.display = 'none';
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
            if (['escs', 'esc'].includes(prev.toLowerCase())) {
                modelName = decodeURIComponent(last);
            }
        }
        if (modelName) {
            const matchedEsc = state.escs.find(e => e.name.toLowerCase() === modelName.toLowerCase() || e.name === modelName);
            if (matchedEsc) {
                state.activeSelection = matchedEsc.id;
                selectEsc(matchedEsc.id);
                showEscProfile(matchedEsc.id);
            }
        }
    }

    async function fetchData() {
        try {
            const res = await fetch('/api/escs');
            if (!res.ok) throw new Error(`ESCs fetch failed: HTTP ${res.status}`);
            const data = await res.json();
            state.escs = (data || []).map(e => ({
                id: e.id,
                name: e.name,
                brand: e.brand,
                price: e.price,
                currency: e.currency || 'USD',
                url: e.url,
                sku: e.sku,
                main_image: e.main_image,
                gallery_images: e.gallery_images || [],
                custom_parameters: e.custom_parameters || {}
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

    // Helper parsers for Current and Voltage from dynamic / nested custom_parameters
    function parseCurrent(esc) {
        const params = esc.custom_parameters || {};
        const keys = ['continuous_current_a', 'continuous_current', 'current_a', 'current', 'max_current', 'max_current_a', 'amperage'];
        const valRaw = getValueCaseInsensitive(params, keys);
        if (valRaw !== undefined) {
            const val = parseFloat(valRaw);
            if (!isNaN(val)) return val;
        }
        // Fallback to parsing from name
        const match = esc.name.match(/(\d+)\s*A/i);
        if (match) return parseFloat(match[1]);
        return 0;
    }

    function parseVoltage(esc) {
        const params = esc.custom_parameters || {};
        const keys = ['voltage', 'voltage_range', 'voltage_range_s', 'cells', 'lipo_cells', 'input_voltage'];
        const valRaw = getValueCaseInsensitive(params, keys);
        if (valRaw !== undefined) {
            const val = String(valRaw);
            const match = val.match(/(\d+)\s*S/i) || val.match(/(\d+)-(\d+)\s*S/i);
            if (match) return parseFloat(match[1]);
        }
        // Fallback to name
        const match = esc.name.match(/\b(\d+S)\b/i) || esc.name.match(/\b(\d+-\d+S)\b/i);
        if (match) {
            const digitMatch = match[0].match(/\d+/);
            if (digitMatch) return parseFloat(digitMatch[0]);
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
                    const escId = elements.contextMenu.dataset.escId;
                    if (!escId) return;

                    if (action === 'preview') {
                        openPreviewModal(escId);
                    } else if (action === 'compare') {
                        if (!state.selectedItems.includes(escId)) {
                            state.selectedItems.push(escId);
                            updateSelectionBar();
                            renderExplorer();
                        }
                    } else if (action === 'edit') {
                        triggerEditEsc(escId);
                    } else if (action === 'delete') {
                        triggerDeleteEsc(escId);
                    }
                    elements.contextMenu.style.display = 'none';
                };
            });
        }

        // Add ESC button trigger
        if (elements.btnAddEsc) {
            elements.btnAddEsc.onclick = () => {
                triggerAddEsc();
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
                const escId = elements.escForm.dataset.id;
                
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
                    if (escId) {
                        // UPDATE (PATCH)
                        res = await fetch(`/api/db/escs?id=eq.${escId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                    } else {
                        // INSERT (POST)
                        res = await fetch('/api/escs', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                    }

                    if (!res.ok) {
                        const errData = await res.json();
                        throw new Error(errData.error || `HTTP ${res.status}`);
                    }

                    logUserActivity(session.email, session.role, escId ? 'ESC Specifications Updated' : 'New ESC Specifications Created', `ESC Name: ${name}`);
                    closeModal(elements.escModal);
                    await fetchData();
                    renderExplorer();
                    if (escId && state.activeSelection === escId) {
                        selectEsc(escId);
                    }
                } catch (err) {
                    console.error("Save ESC failed:", err);
                    alert("Failed to save ESC record: " + err.message);
                } finally {
                    const saveBtn = document.getElementById('btn-save-esc');
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save ESC';
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
                selectEsc(state.activeSelection);
            } else {
                if (elements.panelTitle) elements.panelTitle.textContent = mode === 'details' ? 'Details Pane' : 'Preview Pane';
                if (elements.panelBody) {
                    elements.panelBody.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding: 40px 10px; color:var(--text-secondary);">
                            <i data-lucide="info" style="width:36px; height:36px; margin-bottom:10px; opacity:0.5;"></i>
                            <p style="margin:0; font-size:0.85rem;">Select an ESC specifications record to inspect its properties.</p>
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
        let filtered = [...state.escs];
        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            filtered = filtered.filter(e => 
                e.name.toLowerCase().includes(q) || 
                e.brand.toLowerCase().includes(q) ||
                (e.sku && e.sku.toLowerCase().includes(q))
            );
        }

        // Sorting
        filtered.sort((a, b) => {
            if (state.sortBy === 'name-asc') return a.name.localeCompare(b.name);
            if (state.sortBy === 'name-desc') return b.name.localeCompare(a.name);
            if (state.sortBy === 'price-asc') return parsePrice(a.price) - parsePrice(b.price);
            if (state.sortBy === 'current-desc') return parseCurrent(b) - parseCurrent(a);
            if (state.sortBy === 'voltage-desc') return parseVoltage(b) - parseVoltage(a);
            return 0;
        });

        // Grouping
        let grouped = {};
        if (state.groupBy === 'brand') {
            filtered.forEach(e => {
                const brandName = e.brand || 'Unknown Brand';
                if (!grouped[brandName]) grouped[brandName] = [];
                grouped[brandName].push(e);
            });
        } else if (state.groupBy === 'voltage') {
            filtered.forEach(e => {
                const volt = parseVoltage(e);
                const name = volt ? `${volt}S Input` : 'Unspecified Input Voltage';
                if (!grouped[name]) grouped[name] = [];
                grouped[name].push(e);
            });
        } else if (state.groupBy === 'current') {
            filtered.forEach(e => {
                const current = parseCurrent(e);
                const name = current ? `${current}A Rating` : 'Unspecified Amperage';
                if (!grouped[name]) grouped[name] = [];
                grouped[name].push(e);
            });
        } else {
            grouped['All ESC Specifications'] = filtered;
        }

        const keys = Object.keys(grouped).sort();
        if (keys.length === 0 || (keys.length === 1 && grouped[keys[0]].length === 0)) {
            contentArea.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding: 60px 10px; color:var(--text-secondary);">
                    <i data-lucide="search" style="width:36px; height:36px; margin-bottom:10px; opacity:0.5;"></i>
                    <p style="margin:0; font-size:0.9rem;">No ESC records match your search criteria.</p>
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
                            <th>ESC Name</th>
                            <th>Brand</th>
                            <th>SKU</th>
                            <th>Current (A)</th>
                            <th>Voltage (S)</th>
                            <th>Price</th>
                            <th style="width:60px; text-align:right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                const tbody = table.querySelector('tbody');
                const groupSelectAll = table.querySelector('.select-group-all');
                groupSelectAll.checked = items.every(e => state.selectedItems.includes(e.id));
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

                items.forEach(e => {
                    const tr = document.createElement('tr');
                    tr.className = `explorer-row ${state.activeSelection === e.id ? 'selected' : ''}`;
                    tr.dataset.id = e.id;

                    const isChecked = state.selectedItems.includes(e.id);
                    const initials = e.name.charAt(0).toUpperCase();
                    const hash = e.brand.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const hue = hash % 360;
                    const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%); width:24px; height:24px; border-radius:4px; font-weight:700; display:flex; align-items:center; justify-content:center; font-size:0.75rem;`;
                    
                    const amp = parseCurrent(e);
                    const volt = parseVoltage(e);
                    const priceDisp = e.price ? `$${e.price} ${e.currency}` : '-';

                    tr.innerHTML = `
                        <td><input type="checkbox" class="explorer-cb" data-id="${e.id}" ${isChecked ? 'checked' : ''}></td>
                        <td><div style="${thumbStyle}">${initials}</div></td>
                        <td><strong><a href="javascript:void(0)" class="item-name-link" style="color:var(--primary-color); font-weight:600; text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHTML(e.name)}</a></strong></td>
                        <td>${escapeHTML(e.brand)}</td>
                        <td>${escapeHTML(e.sku || '-')}</td>
                        <td>${amp ? `<span class="badge-thrust" style="background: rgba(37, 99, 235, 0.08); border-color: rgba(37, 99, 235, 0.2); color: #2563eb; font-weight:600;">${amp} A</span>` : '-'}</td>
                        <td>${volt ? `<span class="badge-thrust" style="background: rgba(13, 148, 136, 0.08); border-color: rgba(13, 148, 136, 0.2); color: #0d9488; font-weight:600;">${volt} S</span>` : '-'}</td>
                        <td>${escapeHTML(priceDisp)}</td>
                        <td style="text-align:right; white-space:nowrap;">
                            <button class="btn-share text-slate-400 hover:text-[#003366] dark:hover:text-[#a7c8ff] transition-colors" data-type="esc" data-name="${escapeHTML(e.name)}" title="Share ESC Spec Link" style="background:none; border:none; cursor:pointer;"><i data-lucide="share-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                        </td>
                    `;

                    tr.onclick = (event) => {
                        if (event.target.closest('input[type="checkbox"]')) return;
                        selectEsc(e.id);
                    };
                    const nameLink = tr.querySelector('.item-name-link');
                    if (nameLink) {
                        nameLink.onclick = (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            showEscProfile(e.id);
                        };
                    }
                    tr.ondblclick = () => openPreviewModal(e.id);
                    tr.oncontextmenu = (event) => showContextMenu(event, e.id);

                    tbody.appendChild(tr);
                });
                itemsContainer.appendChild(table);
            } else if (state.viewMode === 'list') {
                items.forEach(e => {
                    const div = document.createElement('div');
                    div.className = `list-item ${state.activeSelection === e.id ? 'selected' : ''}`;
                    div.dataset.id = e.id;

                    const isChecked = state.selectedItems.includes(e.id);
                    div.innerHTML = `
                        <input type="checkbox" class="explorer-cb" data-id="${e.id}" ${isChecked ? 'checked' : ''}>
                        <i data-lucide="zap" style="width:16px; height:16px; color:var(--text-secondary); flex-shrink:0;"></i>
                        <span style="font-size:0.85rem; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; flex:1;"><strong><a href="javascript:void(0)" class="item-name-link" style="color:var(--primary-color); font-weight:600; text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHTML(e.name)}</a></strong> <span style="color:var(--text-secondary);">(${escapeHTML(e.brand)})</span></span>
                        <button class="btn-share text-slate-400 hover:text-[#003366] dark:hover:text-[#a7c8ff] transition-colors" data-type="esc" data-name="${escapeHTML(e.name)}" title="Share ESC Spec Link" style="background:none; border:none; cursor:pointer; margin-left:auto;"><i data-lucide="share-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                    `;

                    div.onclick = (event) => {
                        if (event.target.closest('input[type="checkbox"]')) return;
                        selectEsc(e.id);
                    };
                    const nameLink = div.querySelector('.item-name-link');
                    if (nameLink) {
                        nameLink.onclick = (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            showEscProfile(e.id);
                        };
                    }
                    div.ondblclick = () => openPreviewModal(e.id);
                    div.oncontextmenu = (event) => showContextMenu(event, e.id);

                    itemsContainer.appendChild(div);
                });
            } else if (state.viewMode === 'tiles') {
                items.forEach(e => {
                    const div = document.createElement('div');
                    div.className = `tile-item ${state.activeSelection === e.id ? 'selected' : ''}`;
                    div.dataset.id = e.id;

                    const isChecked = state.selectedItems.includes(e.id);
                    const initials = e.name.charAt(0).toUpperCase();
                    const hash = e.brand.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const hue = hash % 360;
                    const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%); width:32px; height:32px; border-radius:6px; font-weight:700; display:flex; align-items:center; justify-content:center; font-size:0.9rem; flex-shrink:0;`;

                    const amp = parseCurrent(e);
                    const volt = parseVoltage(e);
                    const specDisp = (amp || volt) ? `${amp ? amp+'A' : ''}${amp && volt ? ' · ' : ''}${volt ? volt+'S' : ''}` : 'No rating info';

                    div.innerHTML = `
                        <input type="checkbox" class="explorer-cb" data-id="${e.id}" ${isChecked ? 'checked' : ''}>
                        <div style="${thumbStyle}">${initials}</div>
                        <div style="display:flex; flex-direction:column; min-width:0; flex:1; gap:2px;">
                            <span style="font-size:0.85rem; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;"><a href="javascript:void(0)" class="item-name-link" style="color:var(--primary-color); text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHTML(e.name)}</a></span>
                            <span style="font-size:0.75rem; color:var(--text-secondary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHTML(e.brand)} &nbsp;·&nbsp; ${escapeHTML(specDisp)}</span>
                        </div>
                        <button class="btn-share text-slate-400 hover:text-[#003366] dark:hover:text-[#a7c8ff] transition-colors" data-type="esc" data-name="${escapeHTML(e.name)}" title="Share ESC Spec Link" style="background:none; border:none; cursor:pointer;"><i data-lucide="share-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                    `;

                    div.onclick = (event) => {
                        if (event.target.closest('input[type="checkbox"]')) return;
                        selectEsc(e.id);
                    };
                    const nameLink = div.querySelector('.item-name-link');
                    if (nameLink) {
                        nameLink.onclick = (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            showEscProfile(e.id);
                        };
                    }
                    div.ondblclick = () => openPreviewModal(e.id);
                    div.oncontextmenu = (event) => showContextMenu(event, e.id);

                    itemsContainer.appendChild(div);
                });
            } else if (state.viewMode === 'large-icons') {
                items.forEach(e => {
                    const div = document.createElement('div');
                    div.className = `large-icon-item ${state.activeSelection === e.id ? 'selected' : ''}`;
                    div.dataset.id = e.id;

                    const isChecked = state.selectedItems.includes(e.id);
                    const initials = e.name.charAt(0).toUpperCase();
                    const hash = e.brand.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    const hue = hash % 360;
                    const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%);`;

                    div.innerHTML = `
                        <div style="align-self:stretch; display:flex; justify-content:space-between; align-items:center; margin-bottom: -15px;">
                            <input type="checkbox" class="explorer-cb" data-id="${e.id}" ${isChecked ? 'checked' : ''}>
                            <button class="btn-share text-slate-400 hover:text-[#003366] dark:hover:text-[#a7c8ff] transition-colors" data-type="esc" data-name="${escapeHTML(e.name)}" title="Share ESC Spec Link" style="background:none; border:none; cursor:pointer; padding:0;"><i data-lucide="share-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i></button>
                        </div>
                        <div class="large-icon-thumbnail" style="${thumbStyle}">${initials}</div>
                        <div style="display:flex; flex-direction:column; width:100%; min-width:0; gap:2px;">
                            <span style="font-size:0.82rem; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; width:100%;"><a href="javascript:void(0)" class="item-name-link" style="color:var(--primary-color); text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHTML(e.name)}</a></span>
                            <span style="font-size:0.72rem; color:var(--text-secondary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; width:100%;">${escapeHTML(e.brand)}</span>
                        </div>
                    `;

                    div.onclick = (event) => {
                        if (event.target.closest('input[type="checkbox"]')) return;
                        selectEsc(e.id);
                    };
                    const nameLink = div.querySelector('.item-name-link');
                    if (nameLink) {
                        nameLink.onclick = (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            showEscProfile(e.id);
                        };
                    }
                    div.ondblclick = () => openPreviewModal(e.id);
                    div.oncontextmenu = (event) => showContextMenu(event, e.id);

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
            if (elements.selectionCountText) elements.selectionCountText.textContent = `${count} ESC${count !== 1 ? 's' : ''} selected`;
            if (elements.selectionBar) elements.selectionBar.classList.add('show');
        } else {
            if (elements.selectionBar) elements.selectionBar.classList.remove('show');
        }
    }

    function showEscProfile(id) {
        const esc = state.escs.find(e => e.id === id);
        if (!esc) return;

        const overlay = document.getElementById('profile-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';

        // Update URL
        const prefix = window.location.pathname.startsWith('/admin') ? '/admin/esc/' : '/esc/';
        history.pushState({ escId: id }, '', prefix + encodeURIComponent(esc.name));

        // Set title and brand
        document.getElementById('profile-title').textContent = esc.name;
        document.getElementById('profile-brand-badge').textContent = esc.brand;

        // Core specs
        const coreSpecsContainer = document.getElementById('profile-core-specs');
        const amp = parseCurrent(esc);
        const volt = parseVoltage(esc);
        const priceDisp = esc.price ? `$${esc.price} ${esc.currency}` : '-';
        const prodType = getValueCaseInsensitive(esc.custom_parameters, ['product_type', 'producttype', 'category']) || 'ESC';

        coreSpecsContainer.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-secondary); font-weight:500;">Manufacturer</span>
                <span style="font-weight:600; text-align:right;">${escapeHTML(esc.brand)}</span>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-secondary); font-weight:500;">SKU</span>
                <span style="font-weight:600; text-align:right;">${escapeHTML(esc.sku || '-')}</span>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-secondary); font-weight:500;">Price</span>
                <span style="font-weight:600; text-align:right;">${escapeHTML(priceDisp)}</span>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-secondary); font-weight:500;">Current Rating</span>
                <span style="font-weight:600; text-align:right;">${amp ? amp + ' A' : '-'}</span>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-secondary); font-weight:500;">Input Voltage</span>
                <span style="font-weight:600; text-align:right;">${volt ? volt + ' S' : '-'}</span>
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.85rem; padding: 6px 0; border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-secondary); font-weight:500;">Product Type</span>
                <span style="font-weight:600; text-align:right;">${escapeHTML(prodType)}</span>
            </div>
        `;

        // Links
        const linksCard = document.getElementById('profile-links-card');
        const linksContainer = document.getElementById('profile-links-container');
        if (esc.url) {
            linksCard.style.display = 'block';
            linksContainer.innerHTML = `
                <a href="${esc.url}" target="_blank" class="profile-link-btn" style="display:flex; justify-content:space-between; align-items:center; text-decoration:none; padding:10px; background:var(--bg-base); border-radius:6px; border:1px solid var(--border-color); font-size:0.85rem; color:var(--text-primary);">
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
        const description = getValueCaseInsensitive(esc.custom_parameters, ['description_text', 'description']);
        if (description) {
            descCard.style.display = 'block';
            descText.textContent = description;
        } else {
            descCard.style.display = 'none';
        }

        // Collect images for gallery
        const imagesSet = new Set();
        if (esc.main_image && esc.main_image.startsWith('http')) {
            imagesSet.add(esc.main_image);
        }

        // Parse other potential image fields
        const imageKeys = [
            'gallery_images', 'description_images', 'specification_images', 
            'technical_drawings', 'local_technical_drawings', 'local_specification_images'
        ];
        imageKeys.forEach(k => {
            const val = getValueCaseInsensitive(esc.custom_parameters, [k]);
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
        const params = esc.custom_parameters || {};
        
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
                const prefix = window.location.pathname.startsWith('/admin') ? '/admin/escs' : '/escs';
                history.pushState(null, '', prefix);
            };
        }

        lucide.createIcons();
    }

    function selectEsc(id) {
        state.activeSelection = id;
        document.querySelectorAll('.explorer-row, .list-item, .tile-item, .large-icon-item').forEach(el => {
            if (el.dataset.id === id) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });

        const esc = state.escs.find(e => e.id === id);
        if (!esc) return;

        if (elements.panelTitle) elements.panelTitle.textContent = state.paneMode === 'details' ? 'Details Pane' : 'Preview Pane';

        // Render for either mode
        if (elements.panelBody) {
            // Find all potential images
            const imagesSet = new Set();
            if (esc.main_image && esc.main_image.startsWith('http')) {
                imagesSet.add(esc.main_image);
            }
            const imageKeys = [
                'gallery_images', 'description_images', 'specification_images', 
                'technical_drawings', 'local_technical_drawings', 'local_specification_images'
            ];
            imageKeys.forEach(k => {
                const val = getValueCaseInsensitive(esc.custom_parameters, [k]);
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
            const description = getValueCaseInsensitive(esc.custom_parameters, ['description_text', 'description']);
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

            // View Profile Button
            const viewProfileBtnHtml = `
                <button class="btn-primary" id="btn-view-full-profile" style="width: 100%; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; padding: 8px; font-size:0.8rem;">
                    <i data-lucide="expand" style="width: 14px; height: 14px;"></i> View Full Specs Profile
                </button>
            `;

            if (state.paneMode === 'details') {
                // Dynamic custom parameter rows (hiding visually rendered elements)
                let customRows = '';
                const params = esc.custom_parameters || {};
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

                const priceDisp = esc.price ? `$${esc.price} ${esc.currency}` : '-';

                elements.panelBody.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:10px;">
                        ${viewProfileBtnHtml}
                        ${imageHtml}
                        
                        <div style="font-size:0.85rem; font-weight:700; margin-bottom:4px;">Standard Fields</div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">ESC Name</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(esc.name)}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Manufacturer</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(esc.brand)}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">SKU</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(esc.sku || '-')}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Price</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${escapeHTML(priceDisp)}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; justify-content:space-between; font-size:0.8rem; padding: 4px 0; border-bottom:1px solid var(--border-color); gap:10px;">
                            <span style="color:var(--text-secondary); font-weight:500; white-space:nowrap; flex-shrink:0;">Parsed Rating</span>
                            <span style="font-weight:600; text-align:right; word-break:break-word;">${parseCurrent(esc) ? parseCurrent(esc) + 'A' : '-'} / ${parseVoltage(esc) ? parseVoltage(esc) + 'S' : '-'}</span>
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

                const initials = esc.name.charAt(0).toUpperCase();
                const hash = esc.brand.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const hue = hash % 360;
                const thumbStyle = `background: hsl(${hue}, 80%, 95%); color: hsl(${hue}, 80%, 40%); border: 1px solid hsl(${hue}, 80%, 85%); width:64px; height:64px; border-radius:12px; font-weight:700; display:flex; align-items:center; justify-content:center; font-size:1.8rem; margin: 0 auto;`;

                const fallbackImageHtml = mainImgUrl ? 
                    `<img src="${mainImgUrl}" alt="${escapeHTML(esc.name)}" style="width:120px; height:120px; object-fit:contain; border-radius:8px; border:1px solid var(--border-color); background:#fff; padding:4px; margin: 0 auto; display:block;">` :
                    `<div style="${thumbStyle}">${initials}</div>`;

                elements.panelBody.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:12px;">
                        ${viewProfileBtnHtml}
                        ${fallbackImageHtml}
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <h3 style="margin:0; font-family:'Outfit',sans-serif; font-size:1.1rem;">${escapeHTML(esc.name)}</h3>
                            <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:500;">by ${escapeHTML(esc.brand)}</span>
                        </div>
                        
                        <div style="width:100%; background:var(--bg-base); border-radius: var(--radius-md); padding: 10px; display:flex; flex-direction:column; gap:10px; box-sizing:border-box;">
                            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.8rem;">
                                <span style="color:var(--text-secondary); white-space:nowrap;">Current Rating</span>
                                <span style="font-weight:700; color:var(--primary-color);">${parseCurrent(esc) ? parseCurrent(esc) + ' A' : '-'}</span>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.8rem;">
                                <span style="color:var(--text-secondary); white-space:nowrap;">Input Voltage</span>
                                <span style="font-weight:600;">${parseVoltage(esc) ? parseVoltage(esc) + ' S' : '-'}</span>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:space-between; font-size:0.8rem;">
                                <span style="color:var(--text-secondary); white-space:nowrap;">Price</span>
                                <span style="font-weight:600;">${esc.price ? `$${esc.price} ${esc.currency}` : '-'}</span>
                            </div>
                        </div>

                        ${thumbnailsHtml}
                        ${descHtml}

                        <div style="display:flex; flex-direction:column; gap:8px; width:100%;">
                            <div style="display:flex; justify-content:center; gap:10px;">
                                ${esc.url ? `<a href="${esc.url}" target="_blank" class="btn-secondary" style="font-size:0.75rem; padding: 6px 12px; text-decoration:none; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="external-link" style="width:12px;"></i> Product Page</a>` : ''}
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
                if (editBtn) editBtn.onclick = () => triggerEditEsc(id);
                const deleteBtn = document.getElementById('btn-preview-delete');
                if (deleteBtn) deleteBtn.onclick = () => triggerDeleteEsc(id);
            }

            // Bind the full profile button
            const viewProfileBtn = document.getElementById('btn-view-full-profile');
            if (viewProfileBtn) {
                viewProfileBtn.onclick = () => {
                    showEscProfile(id);
                };
            }
        }

        lucide.createIcons();
    }

    function openPreviewModal(id) {
        showEscProfile(id);
    }

    function showContextMenu(e, id) {
        e.preventDefault();
        if (elements.contextMenu) {
            elements.contextMenu.style.top = `${e.clientY}px`;
            elements.contextMenu.style.left = `${e.clientX}px`;
            elements.contextMenu.style.display = 'flex';
            elements.contextMenu.dataset.escId = id;
        }
    }



    function triggerCompare(escIds) {
        if (escIds.length === 0) return;
        const selected = escIds.map(id => state.escs.find(e => e.id === id)).filter(Boolean);

        // Collect all distinct custom parameter keys
        const customKeysSet = new Set();
        selected.forEach(esc => {
            Object.keys(esc.custom_parameters || {}).forEach(k => customKeysSet.add(k));
        });
        const customKeys = Array.from(customKeysSet).sort();

        let customRowsHtml = '';
        customKeys.forEach(k => {
            const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            customRowsHtml += `
                <tr>
                    <td><strong>${escapeHTML(label)}</strong></td>
                    ${selected.map(esc => {
                        const val = esc.custom_parameters && esc.custom_parameters[k] !== undefined ? esc.custom_parameters[k] : '-';
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
                        ${selected.map(esc => `<th>${escapeHTML(esc.name)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Manufacturer</strong></td>
                        ${selected.map(esc => `<td>${escapeHTML(esc.brand)}</td>`).join('')}
                    </tr>
                    <tr>
                        <td><strong>SKU</strong></td>
                        ${selected.map(esc => `<td>${escapeHTML(esc.sku || '-')}</td>`).join('')}
                    </tr>
                    <tr>
                        <td><strong>Price</strong></td>
                        ${selected.map(esc => `<td>${esc.price ? `$${esc.price} ${esc.currency}` : '-'}</td>`).join('')}
                    </tr>
                    <tr>
                        <td><strong>Parsed Amps</strong></td>
                        ${selected.map(esc => `<td>${parseCurrent(esc) ? parseCurrent(esc) + ' A' : '-'}</td>`).join('')}
                    </tr>
                    <tr>
                        <td><strong>Parsed Voltage</strong></td>
                        ${selected.map(esc => `<td>${parseVoltage(esc) ? parseVoltage(esc) + ' S' : '-'}</td>`).join('')}
                    </tr>
                    ${customRowsHtml}
                    <tr>
                        <td><strong>Reference Link</strong></td>
                        ${selected.map(esc => `
                            <td>
                                ${esc.url ? `<a href="${esc.url}" target="_blank" style="display:inline-flex; align-items:center; gap:5px;"><i data-lucide="external-link" style="width:14px;"></i> Product Page</a>` : '-'}
                            </td>
                        `).join('')}
                    </tr>
                </tbody>
            `;
        }

        openModal(elements.comparisonModal);
        lucide.createIcons();
    }

    function triggerExport(escIds) {
        if (escIds.length === 0) return;
        const selected = escIds.map(id => state.escs.find(e => e.id === id)).filter(Boolean);

        // Collect all distinct custom parameter keys
        const customKeysSet = new Set();
        selected.forEach(esc => {
            Object.keys(esc.custom_parameters || {}).forEach(k => customKeysSet.add(k));
        });
        const customKeys = Array.from(customKeysSet).sort();

        const headers = ["ESC Name", "Brand", "SKU", "Price", "Currency", "Current (A)", "Voltage (S)", "URL", ...customKeys];
        const rows = [headers];

        selected.forEach(e => {
            const row = [
                e.name,
                e.brand,
                e.sku || '',
                e.price || '',
                e.currency || 'USD',
                parseCurrent(e) || '',
                parseVoltage(e) || '',
                e.url || ''
            ];
            customKeys.forEach(k => {
                const val = e.custom_parameters && e.custom_parameters[k] !== undefined ? e.custom_parameters[k] : '';
                row.push(val);
            });
            rows.push(row);
        });

        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Selected ESC Specs");
        
        XLSX.writeFile(workbook, `ThrustVault_ESCs_Export_${Date.now()}.csv`);
        logUserActivity(session.email, session.role, 'Explorer ESC Selection Exported', `Exported ${selected.length} ESC records.`);
    }

    function triggerAddEsc() {
        if (!elements.escForm) return;
        elements.escForm.reset();
        elements.escForm.dataset.id = '';
        document.getElementById('modal-title').textContent = 'Add ESC Specifications';
        openModal(elements.escModal);
    }

    function triggerEditEsc(id) {
        const esc = state.escs.find(e => e.id === id);
        if (!esc) return;

        elements.escForm.dataset.id = id;
        document.getElementById('modal-title').textContent = 'Edit ESC Specifications';
        document.getElementById('form-esc-name').value = esc.name;
        document.getElementById('form-esc-brand').value = esc.brand;
        document.getElementById('form-esc-price').value = esc.price || '';
        document.getElementById('form-esc-currency').value = esc.currency || 'USD';
        document.getElementById('form-esc-sku').value = esc.sku || '';
        document.getElementById('form-esc-url').value = esc.url || '';
        document.getElementById('form-esc-image').value = esc.main_image || '';

        openModal(elements.escModal);
    }

    async function triggerDeleteEsc(id) {
        const esc = state.escs.find(e => e.id === id);
        if (!esc) return;

        const confirmDel = await customConfirm("Delete ESC Record?", `Are you sure you want to permanently delete specifications for "${esc.name}"?`);
        if (confirmDel) {
            try {
                // Delete using internal Proxy table DELETE
                const res = await fetch(`/api/db/escs?id=eq.${id}`, {
                    method: 'DELETE'
                });
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }

                logUserActivity(session.email, session.role, 'ESC Record Deleted', `Permanently deleted ESC: ${esc.name}`);
                
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

        const confirmDel = await customConfirm("Bulk Delete Records?", `Are you sure you want to permanently delete ${ids.length} selected ESC records?`);
        if (confirmDel) {
            try {
                // Delete via query table proxy bulk syntax
                const res = await fetch(`/api/db/escs?id=in.(${ids.join(',')})`, {
                    method: 'DELETE'
                });
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }

                logUserActivity(session.email, session.role, 'Bulk ESC Records Deleted', `Bulk deleted ${ids.length} ESC records.`);
                
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
