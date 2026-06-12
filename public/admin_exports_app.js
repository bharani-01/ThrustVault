// admin_exports_app.js
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
    const avatarInitials = document.getElementById('user-avatar-initials');
    if (avatarInitials && email) {
        avatarInitials.textContent = email.charAt(0).toUpperCase();
    }

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


    lucide.createIcons();

    let state = {
        motors: [],
        categories: [],
        customSchema: [],
        testRuns: [],
        selectedMotorIds: new Set(),
        selectedTestRunIds: new Set(),
        selectedMotorIdsInitialized: false,
        selectedTestRunIdsInitialized: false
    };

    let supabase = null;

    // DOM Elements
    const elements = {
        catFilterSelect: document.getElementById('cat-filter-select'),
        catColumnsSelector: document.getElementById('cat-columns-selector'),
        catalogExportForm: document.getElementById('catalog-export-form'),
        catExportFormat: document.getElementById('cat-export-format'),

        // Advanced Catalog Filters
        catSearchInput: document.getElementById('cat-search-input'),
        catBrandSelect: document.getElementById('cat-brand-select'),
        catThrustMin: document.getElementById('cat-thrust-min'),
        catThrustMax: document.getElementById('cat-thrust-max'),
        catMotorsListSelector: document.getElementById('cat-motors-list-selector'),
        btnCatSelectAll: document.getElementById('btn-cat-select-all'),
        btnCatClearAll: document.getElementById('btn-cat-clear-all'),

        // Advanced Telemetry Filters
        telemetrySearchInput: document.getElementById('telemetry-search-input'),
        telemetryRunsListSelector: document.getElementById('telemetry-runs-list-selector'),
        btnTelemetrySelectAll: document.getElementById('btn-telemetry-select-all'),
        btnTelemetryClearAll: document.getElementById('btn-telemetry-clear-all'),
        telemetryColumnsSelector: document.getElementById('telemetry-columns-selector'),
        telemetryExportForm: document.getElementById('telemetry-export-form'),
        telemetryExportFormat: document.getElementById('telemetry-export-format'),

        get totalMotors() { return document.getElementById('total-motors-count'); },
        get totalCats() { return document.getElementById('total-categories-count'); },
        get catList() { return document.getElementById('category-list-container'); },
        get btnAddCat() { return document.getElementById('btn-add-category'); },
        get requestsPendingBadge() { return document.getElementById('requests-pending-badge'); },
        confirmModal: document.getElementById('confirm-modal'),
        detailsPreviewModal: document.getElementById('details-preview-modal'),
        detailsModalTitle: document.getElementById('details-modal-title'),
        detailsModalBody: document.getElementById('details-modal-body'),
        btnCloseDetailsModal: document.getElementById('btn-close-details-modal'),
        btnCloseDetailsModalFooter: document.getElementById('btn-close-details-modal-footer'),
        get btnLogout() { return document.getElementById('btn-logout'); },

        // Live Preview Panel
        previewRecordCount: document.getElementById('preview-record-count'),
        previewContentBox: document.getElementById('preview-content-box'),
        tabPreviewCatalog: document.getElementById('tab-preview-catalog'),
        tabPreviewTelemetry: document.getElementById('tab-preview-telemetry'),
        previewGridBox: document.getElementById('preview-grid-box'),
        btnPreviewModeGrid: document.getElementById('btn-preview-mode-grid'),
        btnPreviewModeCode: document.getElementById('btn-preview-mode-code')
    };

    // Beautiful Progress Modal Helper
    const progressModal = {
        overlay: document.getElementById('download-progress-modal'),
        title: document.getElementById('download-modal-title'),
        status: document.getElementById('download-modal-status'),
        bar: document.getElementById('download-progress-bar'),
        percent: document.getElementById('download-progress-percent'),
        
        show(titleText = "Preparing Export") {
            this.title.textContent = titleText;
            this.status.textContent = "Initializing...";
            this.bar.style.width = "0%";
            this.percent.textContent = "0%";
            this.overlay.style.display = "flex";
            // Force reflow
            this.overlay.offsetHeight;
            this.overlay.classList.add('show');
            if (window.lucide) {
                window.lucide.createIcons();
            }
        },
        
        update(percentVal, statusText) {
            this.bar.style.width = `${percentVal}%`;
            this.percent.textContent = `${percentVal}%`;
            if (statusText) {
                this.status.textContent = statusText;
            }
        },
        
        hide() {
            this.overlay.classList.remove('show');
            setTimeout(() => {
                this.overlay.style.display = "none";
            }, 300);
        }
    };

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

    // Live Preview State
    let activePreviewTab = 'catalog';
    let lastFetchedRunId = null;
    let previewDataPoints = [];
    let previewDisplayMode = 'grid'; // 'grid' or 'code'

    // Helper functions
    function parseThrust(thrustStr) {
        if (!thrustStr) return 0;
        const match = thrustStr.match(/([0-9\.]+)\s*(kg|g)/i);
        if (!match) return parseFloat(thrustStr) || 0;
        let val = parseFloat(match[1]);
        let unit = match[2].toLowerCase();
        if (unit === 'g') {
            val = val / 1000;
        }
        return val;
    }

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    const formatDate = (dateString) => {
        const d = dateString ? new Date(dateString) : new Date();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}-${month}-${year}`;
    };

    const getExcelSheetName = (motorName) => {
        if (!motorName || motorName === 'Draft Runs') return 'Draft Runs';
        let name = motorName.replace(/KV/gi, '').replace(/\s+/g, ' ').trim();
        name = name.replace(/[\\\/\?\*\[\]]/g, '');
        return name.substring(0, 31) || 'Sheet1';
    };

    function getMotorDetailsHTML(m) {
        let lines = [];
        if (m.company) lines.push(`<strong>Brand:</strong> ${escapeHTML(m.company)}`);
        if (m.max_thrust) lines.push(`<strong>Thrust:</strong> ${escapeHTML(m.max_thrust)}`);
        if (m.recommended_esc) lines.push(`<strong>ESC:</strong> ${escapeHTML(m.recommended_esc)}`);
        if (m.recommended_propeller) lines.push(`<strong>Propeller:</strong> ${escapeHTML(m.recommended_propeller)}`);
        
        // Add custom parameters if they exist
        if (m.custom_parameters && typeof m.custom_parameters === 'object') {
            Object.entries(m.custom_parameters).forEach(([key, val]) => {
                if (val !== null && val !== undefined && val !== '') {
                    const schemaField = state.customSchema.find(f => f.field_key === key);
                    const label = schemaField ? schemaField.field_name : key;
                    lines.push(`<strong>${escapeHTML(label)}:</strong> ${escapeHTML(val)}`);
                }
            });
        }
        
        if (m.link_motor) {
            lines.push(`<a href="${sanitizeUrl(m.link_motor)}" target="_blank" style="color: var(--primary-color); text-decoration: underline; margin-top: 4px; display: inline-block;">Motor Webpage</a>`);
        }

        if (lines.length === 0) return '<div>No details.</div>';
        return lines.map(line => `<div style="line-height: 1.35; margin-bottom: 2px;">${line}</div>`).join('');
    }

    function getTestRunDetailsHTML(run) {
        const motor = state.motors.find(m => m.id === run.motor_id);
        const motorName = motor ? motor.motor_name : 'Unknown Motor';
        const fullDate = new Date(run.tested_at).toLocaleString();
        let lines = [];
        lines.push(`<strong>Motor:</strong> ${escapeHTML(motorName)}`);
        if (run.propeller_model) lines.push(`<strong>Propeller:</strong> ${escapeHTML(run.propeller_model)}`);
        if (run.esc_model) lines.push(`<strong>ESC Model:</strong> ${escapeHTML(run.esc_model)}`);
        if (run.battery_info) lines.push(`<strong>Battery Info:</strong> ${escapeHTML(run.battery_info)}`);
        if (run.battery_voltage_capacity) lines.push(`<strong>Battery Config:</strong> ${escapeHTML(run.battery_voltage_capacity)}`);
        if (run.test_conducted_by) lines.push(`<strong>Tester:</strong> ${escapeHTML(run.test_conducted_by)}`);
        if (run.powertrain_name) lines.push(`<strong>Powertrain:</strong> ${escapeHTML(run.powertrain_name)}`);
        if (run.device_name) lines.push(`<strong>Device Name:</strong> ${escapeHTML(run.device_name)}`);
        lines.push(`<strong>Tested At:</strong> ${escapeHTML(fullDate)}`);
        
        return lines.map(line => `<div style="line-height: 1.35; margin-bottom: 2px;">${line}</div>`).join('');
    }

    // Render dynamic selectors
    function renderMotorsSelector() {
        const catFilter = elements.catFilterSelect.value;
        const query = (elements.catSearchInput.value || '').trim().toLowerCase();
        const brand = elements.catBrandSelect.value;
        const minThrust = parseFloat(elements.catThrustMin.value) || 0;
        const maxThrust = parseFloat(elements.catThrustMax.value) || Infinity;

        const filteredMotors = state.motors.filter(m => {
            if (catFilter !== 'all' && m.category_id !== catFilter) return false;
            if (query) {
                const nameMatch = m.motor_name && m.motor_name.toLowerCase().includes(query);
                const companyMatch = m.company && m.company.toLowerCase().includes(query);
                if (!nameMatch && !companyMatch) return false;
            }
            if (brand !== 'all' && m.company !== brand) return false;
            const thrust = parseThrust(m.max_thrust);
            if (thrust < minThrust || thrust > maxThrust) return false;
            return true;
        });

        elements.catMotorsListSelector.innerHTML = filteredMotors.map(m => {
            const isSelected = state.selectedMotorIds.has(m.id);
            return `
                <div class="selector-card ${isSelected ? 'selected' : ''}" data-id="${m.id}">
                    <input type="checkbox" name="cat-selected-motors" value="${m.id}" ${isSelected ? 'checked' : ''} style="display: none;">
                    <div class="selector-card-header">
                        <span class="selector-card-title" title="${escapeHTML(m.motor_name)}">${escapeHTML(m.motor_name)}</span>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <button type="button" class="selector-card-info-btn" title="View Spec Details">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                            <div class="selector-card-indicator"></div>
                        </div>
                    </div>
                    <div class="selector-card-meta">
                        <span class="selector-badge primary" title="${escapeHTML(m.company)}">${escapeHTML(m.company || 'N/A')}</span>
                        <span>Thrust: <strong>${escapeHTML(m.max_thrust || 'N/A')}</strong></span>
                    </div>
                </div>
            `;
        }).join('');

        if (filteredMotors.length === 0) {
            elements.catMotorsListSelector.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:10px; width:100%; grid-column: 1 / -1;">No matching motors found</span>';
        }

        elements.catMotorsListSelector.querySelectorAll('.selector-card').forEach(card => {
            card.onclick = (e) => {
                if (e.target.closest('a') || e.target.closest('.selector-card-info-btn')) return;
                const motorId = card.dataset.id;
                const cb = card.querySelector('input[type="checkbox"]');
                if (state.selectedMotorIds.has(motorId)) {
                    state.selectedMotorIds.delete(motorId);
                    card.classList.remove('selected');
                    if (cb) cb.checked = false;
                } else {
                    state.selectedMotorIds.add(motorId);
                    card.classList.add('selected');
                    if (cb) cb.checked = true;
                }
                updateLivePreview();
            };

            const infoBtn = card.querySelector('.selector-card-info-btn');
            if (infoBtn) {
                infoBtn.onclick = (e) => {
                    e.stopPropagation();
                    const motor = state.motors.find(m => m.id === card.dataset.id);
                    if (motor && elements.detailsPreviewModal && elements.detailsModalTitle && elements.detailsModalBody) {
                        const modalContainer = elements.detailsPreviewModal.querySelector('.modal-container');
                        if (modalContainer) modalContainer.style.maxWidth = '480px';

                        elements.detailsModalTitle.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye" style="color: var(--primary-color); vertical-align: middle; margin-right: 6px;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                            ${escapeHTML(motor.motor_name)} Specs
                        `;
                        elements.detailsModalBody.innerHTML = getMotorDetailsHTML(motor);
                        elements.detailsPreviewModal.classList.add('show');
                    }
                };
            }
        });

        updateLivePreview();
    }

    function renderTestRunsSelector() {
        const query = (elements.telemetrySearchInput.value || '').trim().toLowerCase();

        const filteredRuns = state.testRuns.filter(run => {
            const motor = state.motors.find(m => m.id === run.motor_id);
            const motorName = motor ? motor.motor_name : '';
            if (query) {
                const motorMatch = motorName.toLowerCase().includes(query);
                const propMatch = run.propeller_model && run.propeller_model.toLowerCase().includes(query);
                const escMatch = run.esc_model && run.esc_model.toLowerCase().includes(query);
                const testerMatch = run.test_conducted_by && run.test_conducted_by.toLowerCase().includes(query);
                if (!motorMatch && !propMatch && !escMatch && !testerMatch) return false;
            }
            return true;
        });

        elements.telemetryRunsListSelector.innerHTML = filteredRuns.map(run => {
            const motor = state.motors.find(m => m.id === run.motor_id);
            const motorName = motor ? motor.motor_name : 'Unknown Motor';
            const dateStr = new Date(run.tested_at).toLocaleDateString();
            const isSelected = state.selectedTestRunIds.has(run.id);
            return `
                <div class="selector-card ${isSelected ? 'selected' : ''}" data-id="${run.id}">
                    <input type="checkbox" name="telemetry-selected-runs" value="${run.id}" ${isSelected ? 'checked' : ''} style="display: none;">
                    <div class="selector-card-header">
                        <span class="selector-card-title" title="${escapeHTML(motorName)}">${escapeHTML(motorName)}</span>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <button type="button" class="selector-card-info-btn" title="View Run Details">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                            <div class="selector-card-indicator"></div>
                        </div>
                    </div>
                    <div class="selector-card-meta">
                        <span class="selector-badge" title="Prop: ${escapeHTML(run.propeller_model || 'N/A')}">Prop: ${escapeHTML(run.propeller_model || 'N/A')}</span>
                        <span>ESC: <strong>${escapeHTML(run.esc_model || 'N/A')}</strong></span>
                        <span style="font-size:0.68rem; color:var(--text-muted); margin-top:2px;">${dateStr} (${escapeHTML(run.test_conducted_by || 'Unknown')})</span>
                    </div>
                </div>
            `;
        }).join('');

        if (filteredRuns.length === 0) {
            elements.telemetryRunsListSelector.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:10px; width:100%; grid-column: 1 / -1;">No matching test runs found</span>';
        }

        elements.telemetryRunsListSelector.querySelectorAll('.selector-card').forEach(card => {
            card.onclick = (e) => {
                if (e.target.closest('a') || e.target.closest('.selector-card-info-btn')) return;
                const runId = card.dataset.id;
                const cb = card.querySelector('input[type="checkbox"]');
                if (state.selectedTestRunIds.has(runId)) {
                    state.selectedTestRunIds.delete(runId);
                    card.classList.remove('selected');
                    if (cb) cb.checked = false;
                } else {
                    state.selectedTestRunIds.add(runId);
                    card.classList.add('selected');
                    if (cb) cb.checked = true;
                }
                updateLivePreview();
            };

            const infoBtn = card.querySelector('.selector-card-info-btn');
            if (infoBtn) {
                infoBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const run = state.testRuns.find(r => r.id === card.dataset.id);
                    if (run && elements.detailsPreviewModal && elements.detailsModalTitle && elements.detailsModalBody) {
                        const motor = state.motors.find(m => m.id === run.motor_id);
                        const motorName = motor ? motor.motor_name : 'Unknown Motor';

                        const modalContainer = elements.detailsPreviewModal.querySelector('.modal-container');
                        if (modalContainer) modalContainer.style.maxWidth = '720px';

                        elements.detailsModalTitle.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye" style="color: var(--primary-color); vertical-align: middle; margin-right: 6px;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                            Run Details: ${escapeHTML(motorName)}
                        `;
                        elements.detailsModalBody.innerHTML = `
                            ${getTestRunDetailsHTML(run)}
                            <div id="modal-readings-section" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 15px;">
                                <h4 style="font-family:'Outfit'; font-weight:600; margin-bottom: 8px;">Run Readings</h4>
                                <div style="color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin-animation" style="color: var(--primary-color);"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                    Loading complete readings from database...
                                </div>
                            </div>
                        `;
                        elements.detailsPreviewModal.classList.add('show');

                        try {
                            const { data, error } = await supabase
                                .from('motor_test_data_points')
                                .select('*')
                                .eq('test_run_id', run.id)
                                .order('throttle', { ascending: true });
                            
                            if (error) throw error;
                            
                            const readingsContainer = document.getElementById('modal-readings-section');
                            if (!readingsContainer) return;

                            if (!data || data.length === 0) {
                                readingsContainer.innerHTML = `
                                    <h4 style="font-family:'Outfit'; font-weight:600; margin-bottom: 8px;">Run Readings</h4>
                                    <div style="color: var(--text-secondary); font-style: italic;">No readings found for this test run.</div>
                                `;
                                return;
                            }

                            let tableRows = data.map(dp => {
                                let power = (dp.voltage !== null && dp.current !== null) ? Number((dp.voltage * dp.current).toFixed(2)) : (dp.power || 0);
                                let efficiency = (dp.thrust_g !== null && power > 0) ? Number((dp.thrust_g / power).toFixed(2)) : (dp.efficiency || 0);
                                let throttle = dp.throttle !== null && dp.throttle !== undefined ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) : 0;
                                return `
                                    <tr style="border-bottom: 1px solid #e2e8f0;">
                                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">${throttle}%</td>
                                        <td style="padding: 6px; border: 1px solid #e2e8f0;">${dp.voltage !== null ? dp.voltage.toFixed(2) : '-'}</td>
                                        <td style="padding: 6px; border: 1px solid #e2e8f0;">${dp.current !== null ? dp.current.toFixed(2) : '-'}</td>
                                        <td style="padding: 6px; border: 1px solid #e2e8f0;">${power.toFixed(2)}</td>
                                        <td style="padding: 6px; border: 1px solid #e2e8f0;">${dp.thrust_g !== null ? dp.thrust_g.toFixed(1) : '-'}</td>
                                        <td style="padding: 6px; border: 1px solid #e2e8f0;">${dp.rpm !== null ? Math.round(dp.rpm) : '-'}</td>
                                        <td style="padding: 6px; border: 1px solid #e2e8f0;">${efficiency.toFixed(2)}</td>
                                        <td style="padding: 6px; border: 1px solid #e2e8f0;">${dp.temperature !== null ? dp.temperature.toFixed(1) : '-'}</td>
                                    </tr>
                                `;
                            }).join('');

                            readingsContainer.innerHTML = `
                                <h4 style="font-family:'Outfit'; font-weight:600; margin-bottom: 8px;">Run Readings (${data.length} steps)</h4>
                                <div style="overflow-x: auto; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                                    <table style="width:100%; border-collapse:collapse; font-size:0.75rem; text-align:left; background:#ffffff;">
                                        <thead>
                                            <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1; font-family:'Outfit'; font-weight:600; color:#334155;">
                                                <th style="padding:6px; border:1px solid #e2e8f0; text-align:center;">Throttle</th>
                                                <th style="padding:6px; border:1px solid #e2e8f0;">Voltage (V)</th>
                                                <th style="padding:6px; border:1px solid #e2e8f0;">Current (A)</th>
                                                <th style="padding:6px; border:1px solid #e2e8f0;">Power (W)</th>
                                                <th style="padding:6px; border:1px solid #e2e8f0;">Thrust (g)</th>
                                                <th style="padding:6px; border:1px solid #e2e8f0;">RPM</th>
                                                <th style="padding:6px; border:1px solid #e2e8f0;">Eff (g/W)</th>
                                                <th style="padding:6px; border:1px solid #e2e8f0;">Temp (°C)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${tableRows}
                                        </tbody>
                                    </table>
                                </div>
                            `;
                        } catch (err) {
                            console.error("Error loading readings:", err);
                            const readingsContainer = document.getElementById('modal-readings-section');
                            if (readingsContainer) {
                                readingsContainer.innerHTML = `
                                    <h4 style="font-family:'Outfit'; font-weight:600; margin-bottom: 8px;">Run Readings</h4>
                                    <div style="color: var(--danger-color); font-size: 0.8rem;">Failed to load readings: ${escapeHTML(err.message)}</div>
                                `;
                            }
                        }
                    }
                };
            }
        });

        updateLivePreview();
    }

    function drawVisualGrid(headers, rows) {
        let html = `
            <table style="width:100%; border-collapse:collapse; font-size:0.82rem; text-align:left; background:#ffffff; border:1px solid var(--border-color);">
                <thead>
                    <tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1; font-family:'Outfit'; font-weight:600; color:#334155; position:sticky; top:0; z-index:1;">
        `;
        headers.forEach(h => {
            html += `       <th style="padding:10px 12px; border:1px solid #e2e8f0;">${escapeHTML(h)}</th>\n`;
        });
        html += `
                    </tr>
                </thead>
                <tbody>
        `;
        if (rows.length === 0) {
            html += `
                <tr>
                    <td colspan="${headers.length}" style="padding:20px; text-align:center; color:var(--text-muted); font-style:italic;">No records selected. Add filters or select items above.</td>
                </tr>
            `;
        } else {
            rows.forEach((row, rIdx) => {
                html += `       <tr style="border-bottom:1px solid #e2e8f0; background: ${rIdx % 2 === 0 ? '#ffffff' : '#f8fafc'};">\n`;
                row.forEach(val => {
                    html += `           <td style="padding:10px 12px; border:1px solid #e2e8f0; color:#334155;">${escapeHTML(val)}</td>\n`;
                });
                html += `       </tr>\n`;
            });
        }
        html += `
                </tbody>
            </table>
        `;
        return html;
    }

    function togglePreviewDisplay() {
        if (!elements.previewGridBox || !elements.previewContentBox) return;
        if (previewDisplayMode === 'grid') {
            elements.previewGridBox.style.display = 'block';
            elements.previewContentBox.style.display = 'none';
            if (elements.btnPreviewModeGrid) elements.btnPreviewModeGrid.classList.add('active');
            if (elements.btnPreviewModeCode) elements.btnPreviewModeCode.classList.remove('active');
        } else {
            elements.previewGridBox.style.display = 'none';
            elements.previewContentBox.style.display = 'block';
            if (elements.btnPreviewModeGrid) elements.btnPreviewModeGrid.classList.remove('active');
            if (elements.btnPreviewModeCode) elements.btnPreviewModeCode.classList.add('active');
        }
    }

    // Live Preview Engine
    async function updateLivePreview() {
        togglePreviewDisplay();

        if (activePreviewTab === 'catalog') {
            const checkedMotors = state.motors.filter(m => state.selectedMotorIds.has(m.id));
            if (elements.previewRecordCount) {
                elements.previewRecordCount.textContent = `${checkedMotors.length} Motors Selected`;
            }

            if (checkedMotors.length === 0) {
                const emptyMsg = '<span style="color:var(--text-secondary); font-size:0.85rem;">Select some motors above to see the download preview...</span>';
                if (elements.previewGridBox) elements.previewGridBox.innerHTML = emptyMsg;
                elements.previewContentBox.innerHTML = '<span style="color:#64748b;">Select some motors above to see the download preview...</span>';
                return;
            }

            const format = elements.catExportFormat.value;
            const selectedColumns = Array.from(elements.catColumnsSelector.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
            
            if (selectedColumns.length === 0) {
                const emptyCols = '<span style="color:#ef4444; font-size:0.85rem;">Please select at least one column to include in the preview.</span>';
                if (elements.previewGridBox) elements.previewGridBox.innerHTML = emptyCols;
                elements.previewContentBox.innerHTML = '<span style="color:#ef4444;">Please select at least one column to include in the preview.</span>';
                return;
            }

            const previewMotors = checkedMotors.slice(0, 3);

            // Compile columns headers
            const headers = [];
            selectedColumns.forEach(col => {
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

            // Map preview data rows
            const rows = previewMotors.map(m => {
                return selectedColumns.map(col => {
                    if (col.startsWith('custom_')) {
                        const key = col.replace('custom_', '');
                        return m.custom_parameters && m.custom_parameters[key] !== undefined ? m.custom_parameters[key] : '';
                    } else if (col === 'category') {
                        const c = state.categories.find(x => x.id === m.category_id);
                        return c ? c.name : '';
                    } else if (col === 'links') {
                        return [m.link_motor, m.link_esc, m.link_propeller].filter(Boolean).join(', ');
                    } else {
                        const mapKey = col === 'motor' ? 'motor_name' : (col === 'company' ? 'company' : (col === 'thrust' ? 'max_thrust' : (col === 'esc' ? 'recommended_esc' : (col === 'prop' ? 'recommended_propeller' : col))));
                        return m[mapKey] || '';
                    }
                });
            });

            // Set visual grid innerHTML
            if (elements.previewGridBox) {
                elements.previewGridBox.innerHTML = drawVisualGrid(headers, rows);
            }

            if (format === 'json') {
                const jsonObj = previewMotors.map(m => {
                    const obj = {};
                    selectedColumns.forEach((col, idx) => {
                        obj[headers[idx]] = rows[previewMotors.indexOf(m)][idx];
                    });
                    return obj;
                });
                elements.previewContentBox.innerHTML = escapeHTML(JSON.stringify(jsonObj, null, 2));
            }
            else if (format === 'csv') {
                const csvLines = [
                    headers.map(h => `"${h}"`).join(','),
                    ...rows.map(r => r.map(v => `"${v.toString().replace(/"/g, '""')}"`).join(','))
                ];
                if (checkedMotors.length > 3) csvLines.push('... (additional rows truncated in preview)');
                elements.previewContentBox.innerHTML = escapeHTML(csvLines.join('\n'));
            }
            else if (format === 'xml') {
                let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<catalog>\n';
                previewMotors.forEach((m, mIdx) => {
                    xml += '  <motor>\n';
                    selectedColumns.forEach((col, idx) => {
                        const tag = headers[idx].replace(/[^a-zA-Z0-9_]/g, '_');
                        xml += `    <${tag}>${escapeXML(rows[mIdx][idx])}</${tag}>\n`;
                    });
                    xml += '  </motor>\n';
                });
                if (checkedMotors.length > 3) xml += '  <!-- ... (additional items truncated) -->\n';
                xml += '</catalog>';
                elements.previewContentBox.innerHTML = escapeHTML(xml);
            }
            else if (format === 'html') {
                let html = '<table>\n  <thead>\n    <tr>\n';
                headers.forEach(h => html += `      <th>${h}</th>\n`);
                html += '    </tr>\n  </thead>\n  <tbody>\n';
                rows.forEach(r => {
                    html += '    <tr>\n';
                    r.forEach(v => html += `      <td>${v}</td>\n`);
                    html += '    </tr>\n';
                });
                html += '  </tbody>\n</table>';
                elements.previewContentBox.innerHTML = escapeHTML(html);
            }
            else if (format === 'xlsx') {
                let xlsxHtml = '<table style="border-collapse:collapse; background:white; color:#334155; font-family:sans-serif; width:100%; border:1px solid #cbd5e1; font-size:11px;">\n';
                xlsxHtml += '  <tr style="background:#f1f5f9; font-weight:600; text-align:center;">\n    <td style="border:1px solid #cbd5e1; width:30px;"></td>\n';
                headers.forEach((h, idx) => {
                    xlsxHtml += `    <td style="border:1px solid #cbd5e1; padding:4px; min-width:80px;">${String.fromCharCode(65 + idx)}</td>\n`;
                });
                xlsxHtml += '  </tr>\n';
                xlsxHtml += '  <tr style="background:#f8fafc; font-weight:600; text-align:left;">\n    <td style="border:1px solid #cbd5e1; background:#f1f5f9; text-align:center;">1</td>\n';
                headers.forEach(h => {
                    xlsxHtml += `    <td style="border:1px solid #cbd5e1; padding:4px;">${h}</td>\n`;
                });
                xlsxHtml += '  </tr>\n';
                rows.forEach((r, rowIdx) => {
                    xlsxHtml += `  <tr>\n    <td style="border:1px solid #cbd5e1; background:#f1f5f9; text-align:center; font-weight:600;">${rowIdx + 2}</td>\n`;
                    r.forEach(v => {
                        xlsxHtml += `    <td style="border:1px solid #cbd5e1; padding:4px;">${v}</td>\n`;
                    });
                    xlsxHtml += '  </tr>\n';
                });
                xlsxHtml += '</table>';
                elements.previewContentBox.innerHTML = `<div style="background:white; padding:10px; border-radius:4px; overflow:auto; max-height:220px;">${xlsxHtml}</div>`;
            }
        } 
        else if (activePreviewTab === 'telemetry') {
            const checkedRuns = state.testRuns.filter(run => state.selectedTestRunIds.has(run.id)).map(run => run.id);
            if (elements.previewRecordCount) {
                elements.previewRecordCount.textContent = `${checkedRuns.length} Runs Selected`;
            }

            if (checkedRuns.length === 0) {
                const emptyMsg = '<span style="color:var(--text-secondary); font-size:0.85rem;">Select some test runs above to see the download preview...</span>';
                if (elements.previewGridBox) elements.previewGridBox.innerHTML = emptyMsg;
                elements.previewContentBox.innerHTML = '<span style="color:#64748b;">Select some test runs above to see the download preview...</span>';
                return;
            }

            const format = elements.telemetryExportFormat.value;
            const targetRunId = checkedRuns[0];

            // Async load preview run data if needed
            if (targetRunId !== lastFetchedRunId) {
                const loadingMsg = '<span style="color:var(--text-secondary); font-size:0.85rem;">Loading preview data points...</span>';
                if (elements.previewGridBox) elements.previewGridBox.innerHTML = loadingMsg;
                elements.previewContentBox.innerHTML = '<span style="color:#64748b;">Loading preview data points...</span>';
                try {
                    const { data, error } = await supabase
                        .from('motor_test_data_points')
                        .select('*, motor_test_runs(*)')
                        .eq('test_run_id', targetRunId);
                    if (!error && data) {
                        previewDataPoints = data;
                        lastFetchedRunId = targetRunId;
                        previewDataPoints.sort((a, b) => (a.throttle || 0) - (b.throttle || 0));
                    } else {
                        throw error || new Error("Failed to load run points");
                    }
                } catch (e) {
                    const errorMsg = `<span style="color:#ef4444; font-size:0.85rem;">Failed to load preview: ${e.message}</span>`;
                    if (elements.previewGridBox) elements.previewGridBox.innerHTML = errorMsg;
                    elements.previewContentBox.innerHTML = `<span style="color:#ef4444;">Failed to load preview: ${e.message}</span>`;
                    return;
                }
            }

            if (previewDataPoints.length === 0) {
                const noPoints = '<span style="color:var(--text-secondary); font-size:0.85rem;">No data points found for the first selected test run.</span>';
                if (elements.previewGridBox) elements.previewGridBox.innerHTML = noPoints;
                elements.previewContentBox.innerHTML = '<span style="color:#64748b;">No data points found for the first selected test run.</span>';
                return;
            }

            const runObj = previewDataPoints[0]?.motor_test_runs || {};
            const motor = state.motors.find(m => m.id === runObj.motor_id);
            const motorName = motor ? motor.motor_name : 'Draft Runs';

            // Set visual grid innerHTML
            const telemetryHeaders = ['Throttle (%)', 'Voltage (V)', 'Current (A)', 'Power (W)', 'Thrust (g)', 'RPM', 'Efficiency (g/W)', 'Temperature (℃)'];
            const telemetryRows = previewDataPoints.slice(0, 3).map(dp => {
                let power = (dp.voltage !== null && dp.current !== null && dp.voltage !== undefined && dp.current !== undefined) ? Number((dp.voltage * dp.current).toFixed(2)) : (dp.power || 0);
                let efficiency = (dp.thrust_g !== null && dp.thrust_g !== undefined && power > 0) ? Number((dp.thrust_g / power).toFixed(2)) : (dp.efficiency || 0);
                let throttle = dp.throttle !== null && dp.throttle !== undefined ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) : 0;
                return [
                    `${throttle}%`,
                    dp.voltage !== null && dp.voltage !== undefined ? `${dp.voltage} V` : '',
                    dp.current !== null && dp.current !== undefined ? `${dp.current} A` : '',
                    `${power} W`,
                    dp.thrust_g !== null && dp.thrust_g !== undefined ? `${dp.thrust_g} g` : '',
                    dp.rpm !== null && dp.rpm !== undefined ? dp.rpm : '',
                    `${efficiency} g/W`,
                    dp.temperature !== null && dp.temperature !== undefined ? `${dp.temperature} ℃` : ''
                ];
            });

            if (elements.previewGridBox) {
                elements.previewGridBox.innerHTML = drawVisualGrid(telemetryHeaders, telemetryRows);
            }

            if (format === 'xlsx') {
                let xlsxHtml = '<table style="border-collapse:collapse; background:white; color:#334155; font-family:sans-serif; width:100%; border:1px solid #cbd5e1; font-size:11px; text-align:left;">\n';
                const rowData = [
                    ['# Software name: created by ROTRIX', `Device Name: ${runObj.device_name || runObj.extra_data?.device_name || 'test device'}`, `Motor Model: ${motorName}`, `Propeller Model:${runObj.propeller_model || ''}`],
                    [`# Test conducted by: ${runObj.test_conducted_by || 'Unknown'}`, `Powertrain Name: ${runObj.powertrain_name || runObj.extra_data?.powertrain_name || 'test prowertrain'}`, `ESC Model: ${runObj.esc_model || ''}`, `Battery Voltage and Capacity: ${runObj.battery_voltage_capacity || runObj.extra_data?.battery_voltage_capacity || 'None'}`, `Battery : ${runObj.battery_info || ''}`],
                    [`# Generated On: ${formatDate(runObj.tested_at)}`],
                    [],
                    ['Throttle', 'Voltage\n(V)', 'Current\n(A)', 'Power\n(W)', 'Thrust\n(G)', 'RPM', 'Efficiency\n(G/W)', 'Temperature\n(℃)']
                ];
                previewDataPoints.slice(0, 3).forEach(dp => {
                    let power = (dp.voltage !== null && dp.current !== null && dp.voltage !== undefined && dp.current !== undefined) ? Number((dp.voltage * dp.current).toFixed(2)) : (dp.power || 0);
                    let efficiency = (dp.thrust_g !== null && dp.thrust_g !== undefined && power > 0) ? Number((dp.thrust_g / power).toFixed(2)) : (dp.efficiency || 0);
                    let throttle = dp.throttle !== null && dp.throttle !== undefined ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) : 0;
                    rowData.push([throttle, dp.voltage || '', dp.current || '', power, dp.thrust_g || '', dp.rpm || '', efficiency, dp.temperature || '']);
                });

                xlsxHtml += '  <tr style="background:#f1f5f9; font-weight:600; text-align:center;">\n    <td style="border:1px solid #cbd5e1; width:30px;"></td>\n';
                for (let i = 0; i < 8; i++) {
                    xlsxHtml += `    <td style="border:1px solid #cbd5e1; padding:3px; min-width:80px;">${String.fromCharCode(65 + i)}</td>\n`;
                }
                xlsxHtml += '  </tr>\n';

                rowData.forEach((row, rIdx) => {
                    xlsxHtml += `  <tr>\n    <td style="border:1px solid #cbd5e1; background:#f1f5f9; text-align:center; font-weight:600; width:30px;">${rIdx + 1}</td>\n`;
                    for (let cIdx = 0; cIdx < 8; cIdx++) {
                        const val = row[cIdx] !== undefined ? row[cIdx] : '';
                        const isHeader = rIdx === 4;
                        const isComment = rIdx < 3 && cIdx === 0;
                        const style = isHeader 
                            ? 'background:#e2e8f0; font-weight:600; border:1px solid #cbd5e1; padding:4px;' 
                            : (isComment ? 'font-style:italic; color:#475569; border:1px solid #cbd5e1; padding:4px;' : 'border:1px solid #cbd5e1; padding:4px;');
                        xlsxHtml += `    <td style="${style}">${val}</td>\n`;
                    }
                    xlsxHtml += '  </tr>\n';
                });
                xlsxHtml += '</table>';
                elements.previewContentBox.innerHTML = `<div style="background:white; padding:10px; border-radius:4px; overflow:auto; max-height:220px;">${xlsxHtml}</div>`;
            }
            else if (format === 'json') {
                const previewJson = {
                    motors: [{
                        motor_model: motorName,
                        test_runs: [{
                            metadata: {
                                software_name: "created by ROTRIX",
                                device_name: runObj.device_name || runObj.extra_data?.device_name || 'test device',
                                motor_model: motorName,
                                propeller_model: runObj.propeller_model || '',
                                test_conducted_by: runObj.test_conducted_by || 'Unknown',
                                powertrain_name: runObj.powertrain_name || runObj.extra_data?.powertrain_name || 'test prowertrain',
                                esc_model: runObj.esc_model || '',
                                battery_voltage_capacity: runObj.battery_voltage_capacity || runObj.extra_data?.battery_voltage_capacity || 'None',
                                battery_info: runObj.battery_info || '',
                                generated_on: formatDate(runObj.tested_at)
                            },
                            data_points: previewDataPoints.slice(0, 3).map(dp => {
                                let power = (dp.voltage !== null && dp.current !== null) ? Number((dp.voltage * dp.current).toFixed(2)) : (dp.power || 0);
                                let efficiency = (dp.thrust_g !== null && power > 0) ? Number((dp.thrust_g / power).toFixed(2)) : (dp.efficiency || 0);
                                return {
                                    throttle: dp.throttle !== null && dp.throttle !== undefined ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) : 0,
                                    voltage: dp.voltage,
                                    current: dp.current,
                                    power: power,
                                    thrust_g: dp.thrust_g,
                                    rpm: dp.rpm,
                                    efficiency: efficiency,
                                    temperature: dp.temperature
                                };
                            })
                        }]
                    }]
                };
                elements.previewContentBox.innerHTML = escapeHTML(JSON.stringify(previewJson, null, 2));
            }
            else if (format === 'csv') {
                const csvLines = [
                    `"# Software name: created by ROTRIX","Device Name: ${runObj.device_name || 'test device'}","Motor Model: ${motorName}","Propeller Model:${runObj.propeller_model || ''}"`,
                    `"# Test conducted by: ${runObj.test_conducted_by || 'Unknown'}","Powertrain Name: ${runObj.powertrain_name || 'test prowertrain'}","ESC Model: ${runObj.esc_model || ''}","Battery Voltage and Capacity: ${runObj.battery_voltage_capacity || 'None'}","Battery : ${runObj.battery_info || ''}"`,
                    `"# Generated On: ${formatDate(runObj.tested_at)}"`,
                    '',
                    '"Throttle","Voltage\\n(V)","Current\\n(A)","Power\\n(W)","Thrust\\n(G)","RPM","Efficiency\\n(G/W)","Temperature\\n(℃)"'
                ];
                previewDataPoints.slice(0, 3).forEach(dp => {
                    let power = (dp.voltage !== null && dp.current !== null) ? Number((dp.voltage * dp.current).toFixed(2)) : (dp.power || 0);
                    let efficiency = (dp.thrust_g !== null && power > 0) ? Number((dp.thrust_g / power).toFixed(2)) : (dp.efficiency || 0);
                    let throttle = dp.throttle !== null && dp.throttle !== undefined ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) : 0;
                    csvLines.push(`${throttle},${dp.voltage || ''},${dp.current || ''},${power},${dp.thrust_g || ''},${dp.rpm || ''},${efficiency},${dp.temperature || ''}`);
                });
                csvLines.push('... (additional telemetry data points truncated)');
                elements.previewContentBox.innerHTML = escapeHTML(csvLines.join('\n'));
            }
            else if (format === 'xml') {
                let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<telemetry>\n';
                xml += `  <motor name="${escapeXML(motorName)}">\n`;
                xml += '    <test_run>\n';
                xml += '      <metadata>\n';
                xml += '        <software_name>created by ROTRIX</software_name>\n';
                xml += `        <device_name>${escapeXML(runObj.device_name || 'test device')}</device_name>\n`;
                xml += `        <motor_model>${escapeXML(motorName)}</motor_model>\n`;
                xml += `        <propeller_model>${escapeXML(runObj.propeller_model || '')}</propeller_model>\n`;
                xml += `        <test_conducted_by>${escapeXML(runObj.test_conducted_by || 'Unknown')}</test_conducted_by>\n`;
                xml += `        <powertrain_name>${escapeXML(runObj.powertrain_name || 'test prowertrain')}</powertrain_name>\n`;
                xml += `        <esc_model>${escapeXML(runObj.esc_model || '')}</esc_model>\n`;
                xml += `        <battery_voltage_capacity>${escapeXML(runObj.battery_voltage_capacity || 'None')}</battery_voltage_capacity>\n`;
                xml += `        <battery_info>${escapeXML(runObj.battery_info || '')}</battery_info>\n`;
                xml += `        <generated_on>${formatDate(runObj.tested_at)}</generated_on>\n`;
                xml += '      </metadata>\n';
                xml += '      <data_points>\n';
                previewDataPoints.slice(0, 3).forEach(dp => {
                    let power = (dp.voltage !== null && dp.current !== null) ? Number((dp.voltage * dp.current).toFixed(2)) : (dp.power || 0);
                    let efficiency = (dp.thrust_g !== null && power > 0) ? Number((dp.thrust_g / power).toFixed(2)) : (dp.efficiency || 0);
                    let throttle = dp.throttle !== null && dp.throttle !== undefined ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) : 0;
                    xml += '        <data_point>\n';
                    xml += `          <throttle>${throttle}</throttle>\n`;
                    xml += `          <voltage>${dp.voltage || ''}</voltage>\n`;
                    xml += `          <current>${dp.current || ''}</current>\n`;
                    xml += `          <power>${power}</power>\n`;
                    xml += `          <thrust_g>${dp.thrust_g || ''}</thrust_g>\n`;
                    xml += `          <rpm>${dp.rpm || ''}</rpm>\n`;
                    xml += `          <efficiency>${efficiency}</efficiency>\n`;
                    xml += `          <temperature>${dp.temperature || ''}</temperature>\n`;
                    xml += '        </data_point>\n';
                });
                xml += '      </data_points>\n';
                xml += '    </test_run>\n';
                xml += '  </motor>\n';
                xml += '</telemetry>';
                elements.previewContentBox.innerHTML = escapeHTML(xml);
            }
            else if (format === 'html') {
                let html = '<table>\n  <thead>\n    <tr>\n';
                html += '      <th>Throttle</th><th>Voltage</th><th>Current</th><th>Power</th><th>Thrust</th>\n';
                html += '    </tr>\n  </thead>\n  <tbody>\n';
                previewDataPoints.slice(0, 3).forEach(dp => {
                    let power = (dp.voltage !== null && dp.current !== null) ? Number((dp.voltage * dp.current).toFixed(2)) : (dp.power || 0);
                    let throttle = dp.throttle !== null && dp.throttle !== undefined ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) : 0;
                    html += `    <tr><td>${throttle}</td><td>${dp.voltage || ''}</td><td>${dp.current || ''}</td><td>${power}</td><td>${dp.thrust_g || ''}</td></tr>\n`;
                });
                html += '  </tbody>\n</table>';
                elements.previewContentBox.innerHTML = escapeHTML(html);
            }
        }
    }

    // Fetch and populate form elements
    async function loadMetadata() {
        try {
            // Categories
            const { data: categories, error: catError } = await supabase
                .from('categories')
                .select('*')
                .order('name');
            if (catError) throw catError;
            state.categories = categories || [];

            elements.catFilterSelect.innerHTML = '<option value="all">All Categories</option>' +
                state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

            // Motors
            const { data: motors, error: motorError } = await supabase
                .from('motors')
                .select('*')
                .order('motor_name');
            if (motorError) throw motorError;
            state.motors = motors || [];
            if (elements.totalMotors) elements.totalMotors.textContent = state.motors.length;
            if (!state.selectedMotorIdsInitialized) {
                state.motors.forEach(m => state.selectedMotorIds.add(m.id));
                state.selectedMotorIdsInitialized = true;
            }

            // Brands
            const brands = [...new Set(state.motors.map(m => m.company).filter(Boolean))].sort();
            elements.catBrandSelect.innerHTML = '<option value="all">All Brands</option>' +
                brands.map(b => `<option value="${b}">${b}</option>`).join('');

            // Custom Parameters Schema
            let customSchema = [];
            try {
                const { data, error } = await supabase
                    .from('custom_specs_schema')
                    .select('*')
                    .order('created_at');
                if (!error && data) {
                    customSchema = data;
                } else {
                    throw error || new Error("Failed to load schema");
                }
            } catch (err) {
                console.warn("Using localStorage fallback for schema:", err);
                customSchema = JSON.parse(localStorage.getItem('thrustvault_custom_specs')) || [];
            }
            state.customSchema = customSchema;

            // Inject custom columns to catalog columns selector
            state.customSchema.forEach(f => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" value="custom_${f.field_key}" checked> ${f.field_name}`;
                elements.catColumnsSelector.appendChild(label);
            });

            // Bind events for custom parameters selectors
            elements.catColumnsSelector.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.onchange = () => updateLivePreview();
            });

            // Test Runs
            const { data: testRuns, error: runError } = await supabase
                .from('motor_test_runs')
                .select('*')
                .order('tested_at', { ascending: false });
            if (runError) throw runError;
            state.testRuns = testRuns || [];
            if (!state.selectedTestRunIdsInitialized) {
                state.testRuns.forEach(run => state.selectedTestRunIds.add(run.id));
                state.selectedTestRunIdsInitialized = true;
            }
            if (elements.totalCats) elements.totalCats.textContent = state.categories.length;

            // Render Selectors initial state
            renderMotorsSelector();
            renderTestRunsSelector();

            // Bind Events
            elements.catFilterSelect.addEventListener('change', renderMotorsSelector);
            elements.catSearchInput.addEventListener('input', renderMotorsSelector);
            elements.catBrandSelect.addEventListener('change', renderMotorsSelector);
            elements.catThrustMin.addEventListener('input', renderMotorsSelector);
            elements.catThrustMax.addEventListener('input', renderMotorsSelector);
            elements.catExportFormat.addEventListener('change', updateLivePreview);

            elements.btnCatSelectAll.onclick = () => {
                elements.catMotorsListSelector.querySelectorAll('.selector-card').forEach(card => {
                    card.classList.add('selected');
                    const cb = card.querySelector('input[type="checkbox"]');
                    if (cb) {
                        cb.checked = true;
                        state.selectedMotorIds.add(cb.value);
                    }
                });
                updateLivePreview();
            };
            elements.btnCatClearAll.onclick = () => {
                elements.catMotorsListSelector.querySelectorAll('.selector-card').forEach(card => {
                    card.classList.remove('selected');
                    const cb = card.querySelector('input[type="checkbox"]');
                    if (cb) {
                        cb.checked = false;
                        state.selectedMotorIds.delete(cb.value);
                    }
                });
                updateLivePreview();
            };

            elements.telemetrySearchInput.addEventListener('input', renderTestRunsSelector);
            elements.telemetryExportFormat.addEventListener('change', updateLivePreview);

            elements.btnTelemetrySelectAll.onclick = () => {
                elements.telemetryRunsListSelector.querySelectorAll('.selector-card').forEach(card => {
                    card.classList.add('selected');
                    const cb = card.querySelector('input[type="checkbox"]');
                    if (cb) {
                        cb.checked = true;
                        state.selectedTestRunIds.add(cb.value);
                    }
                });
                updateLivePreview();
            };
            elements.btnTelemetryClearAll.onclick = () => {
                elements.telemetryRunsListSelector.querySelectorAll('.selector-card').forEach(card => {
                    card.classList.remove('selected');
                    const cb = card.querySelector('input[type="checkbox"]');
                    if (cb) {
                        cb.checked = false;
                        state.selectedTestRunIds.delete(cb.value);
                    }
                });
                updateLivePreview();
            };

            // Preview tab toggling
            elements.tabPreviewCatalog.onclick = () => {
                activePreviewTab = 'catalog';
                elements.tabPreviewCatalog.classList.add('active');
                elements.tabPreviewCatalog.style.background = '';
                elements.tabPreviewTelemetry.classList.remove('active');
                elements.tabPreviewTelemetry.style.background = 'none';
                updateLivePreview();
            };

            elements.tabPreviewTelemetry.onclick = () => {
                activePreviewTab = 'telemetry';
                elements.tabPreviewTelemetry.classList.add('active');
                elements.tabPreviewTelemetry.style.background = '';
                elements.tabPreviewCatalog.classList.remove('active');
                elements.tabPreviewCatalog.style.background = 'none';
                updateLivePreview();
            };

            const closeDetailsModal = () => {
                if (elements.detailsPreviewModal) {
                    elements.detailsPreviewModal.classList.remove('show');
                }
            };
            if (elements.btnCloseDetailsModal) {
                elements.btnCloseDetailsModal.onclick = closeDetailsModal;
            }
            if (elements.btnCloseDetailsModalFooter) {
                elements.btnCloseDetailsModalFooter.onclick = closeDetailsModal;
            }

            lucide.createIcons();
        } catch (err) {
            console.error("Error loading metadata:", err);
        }
    }

    // Catalog Exporter
    elements.catalogExportForm.onsubmit = (e) => {
        e.preventDefault();
        const format = elements.catExportFormat.value;
        const selectedColumns = Array.from(elements.catColumnsSelector.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

        if (selectedColumns.length === 0) {
            alert("Please select at least one column to include in the export.");
            return;
        }

        const checkedMotors = Array.from(state.selectedMotorIds);
        if (checkedMotors.length === 0) {
            alert("Please select at least one motor model from the listings to export.");
            return;
        }

        const exportMotors = state.motors.filter(m => state.selectedMotorIds.has(m.id));

        // Show Progress Loader
        progressModal.show("Exporting Motor Catalog");
        progressModal.update(20, "Analyzing catalog schema...");

        setTimeout(() => {
            progressModal.update(50, "Formatting motor spec columns...");

            // Build headers
            const headers = [];
            selectedColumns.forEach(col => {
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

            setTimeout(() => {
                progressModal.update(80, "Generating download bundle...");

                // Generate data rows
                let dataToExport = [];
                if (format === 'json') {
                    dataToExport = exportMotors.map(m => {
                        const row = {};
                        selectedColumns.forEach(col => {
                            if (col.startsWith('custom_')) {
                                const key = col.replace('custom_', '');
                                row[key] = m.custom_parameters && m.custom_parameters[key] !== undefined ? m.custom_parameters[key] : null;
                            } else if (col === 'category') {
                                const c = state.categories.find(x => x.id === m.category_id);
                                row.category = c ? c.name : '';
                            } else if (col === 'links') {
                                row.motor_link = m.link_motor || '';
                                row.esc_link = m.link_esc || '';
                                row.prop_link = m.link_propeller || '';
                            } else {
                                const mapKey = col === 'motor' ? 'motor_name' : (col === 'company' ? 'company' : (col === 'thrust' ? 'max_thrust' : (col === 'esc' ? 'recommended_esc' : (col === 'prop' ? 'recommended_propeller' : col))));
                                row[col] = m[mapKey] || '';
                            }
                        });
                        return row;
                    });
                    downloadFile(JSON.stringify(dataToExport, null, 2), 'application/json', 'json', 'motors_catalog');
                }
                else if (format === 'csv') {
                    const rows = exportMotors.map(m => {
                        return selectedColumns.map(col => {
                            let val = '';
                            if (col.startsWith('custom_')) {
                                const key = col.replace('custom_', '');
                                val = m.custom_parameters && m.custom_parameters[key] !== undefined ? m.custom_parameters[key] : '';
                            } else if (col === 'category') {
                                const c = state.categories.find(x => x.id === m.category_id);
                                val = c ? c.name : '';
                            } else if (col === 'links') {
                                val = [m.link_motor, m.link_esc, m.link_propeller].filter(Boolean).join(' | ');
                            } else {
                                const mapKey = col === 'motor' ? 'motor_name' : (col === 'company' ? 'company' : (col === 'thrust' ? 'max_thrust' : (col === 'esc' ? 'recommended_esc' : (col === 'prop' ? 'recommended_propeller' : col))));
                                val = m[mapKey] || '';
                            }
                            return `"${val.toString().replace(/"/g, '""')}"`;
                        });
                    });
                    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                    downloadFile(csv, 'text/csv;charset=utf-8;', 'csv', 'motors_catalog');
                }
                else if (format === 'xlsx') {
                    const rows = exportMotors.map(m => {
                        return selectedColumns.map(col => {
                            if (col.startsWith('custom_')) {
                                const key = col.replace('custom_', '');
                                return m.custom_parameters && m.custom_parameters[key] !== undefined ? m.custom_parameters[key] : '';
                            } else if (col === 'category') {
                                const c = state.categories.find(x => x.id === m.category_id);
                                return c ? c.name : '';
                            } else if (col === 'links') {
                                return [m.link_motor, m.link_esc, m.link_propeller].filter(Boolean).join(', ');
                            } else {
                                const mapKey = col === 'motor' ? 'motor_name' : (col === 'company' ? 'company' : (col === 'thrust' ? 'max_thrust' : (col === 'esc' ? 'recommended_esc' : (col === 'prop' ? 'recommended_propeller' : col))));
                                return m[mapKey] || '';
                            }
                        });
                    });
                    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Catalog');
                    XLSX.writeFile(wb, `thrustvault_catalog_${new Date().toISOString().slice(0, 10)}.xlsx`);
                }
                else if (format === 'xml') {
                    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<catalog>\n';
                    exportMotors.forEach(m => {
                        xml += '  <motor>\n';
                        selectedColumns.forEach(col => {
                            let key = col;
                            let val = '';
                            if (col.startsWith('custom_')) {
                                key = col.replace('custom_', '');
                                val = m.custom_parameters && m.custom_parameters[key] !== undefined ? m.custom_parameters[key] : '';
                            } else if (col === 'category') {
                                const c = state.categories.find(x => x.id === m.category_id);
                                val = c ? c.name : '';
                            } else if (col === 'links') {
                                val = [m.link_motor, m.link_esc, m.link_propeller].filter(Boolean).join(', ');
                            } else {
                                const mapKey = col === 'motor' ? 'motor_name' : (col === 'company' ? 'company' : (col === 'thrust' ? 'max_thrust' : (col === 'esc' ? 'recommended_esc' : (col === 'prop' ? 'recommended_propeller' : col))));
                                val = m[mapKey] || '';
                            }
                            const xmlTag = key.replace(/[^a-zA-Z0-9_]/g, '_');
                            xml += `    <${xmlTag}>${escapeXML(val)}</${xmlTag}>\n`;
                        });
                        xml += '  </motor>\n';
                    });
                    xml += '</catalog>';
                    downloadFile(xml, 'application/xml', 'xml', 'motors_catalog');
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
                    html += `<h2>ThrustVault Export — Motor Spec Catalog</h2>\n<table>\n  <thead>\n    <tr>\n`;

                    headers.forEach(h => {
                        html += `      <th>${h}</th>\n`;
                    });
                    html += '    </tr>\n  </thead>\n  <tbody>\n';

                    exportMotors.forEach(m => {
                        html += '    <tr>\n';
                        selectedColumns.forEach(col => {
                            let val = '';
                            if (col.startsWith('custom_')) {
                                const key = col.replace('custom_', '');
                                val = m.custom_parameters && m.custom_parameters[key] !== undefined ? m.custom_parameters[key] : '';
                            } else if (col === 'category') {
                                const c = state.categories.find(x => x.id === m.category_id);
                                val = c ? c.name : '';
                            } else if (col === 'links') {
                                val = [
                                    m.link_motor ? `<a href="${m.link_motor}" target="_blank">Motor</a>` : '',
                                    m.link_esc ? `<a href="${m.link_esc}" target="_blank">ESC</a>` : '',
                                    m.link_propeller ? `<a href="${m.link_propeller}" target="_blank">Prop</a>` : ''
                                ].filter(Boolean).join(' | ');
                            } else {
                                const mapKey = col === 'motor' ? 'motor_name' : (col === 'company' ? 'company' : (col === 'thrust' ? 'max_thrust' : (col === 'esc' ? 'recommended_esc' : (col === 'prop' ? 'recommended_propeller' : col))));
                                val = m[mapKey] || '';
                            }
                            html += `      <td>${val}</td>\n`;
                        });
                        html += '    </tr>\n';
                    });
                    html += '  </tbody>\n</table>\n</body>\n</html>';
                    downloadFile(html, 'text/html;charset=utf-8;', 'html', 'motors_catalog');
                }

                progressModal.update(100, "Done!");
                logUserActivity(session.email, session.role, 'Exporter Operation', `Exported ${exportMotors.length} catalog items as ${format.toUpperCase()}`);
                
                setTimeout(() => progressModal.hide(), 400);
            }, 300);
        }, 300);
    };

    // Telemetry Exporter
    elements.telemetryExportForm.onsubmit = async (e) => {
        e.preventDefault();
        const format = elements.telemetryExportFormat.value;
        const selectedColumns = Array.from(elements.telemetryColumnsSelector.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

        if (selectedColumns.length === 0) {
            alert("Please select at least one column to include in the export.");
            return;
        }

        const checkedRuns = Array.from(state.selectedTestRunIds);
        if (checkedRuns.length === 0) {
            alert("Please select at least one test run to export.");
            return;
        }

        // Show Progress Loader
        progressModal.show("Exporting Telemetry Data");
        progressModal.update(10, "Connecting to ThrustVault database...");

        // Wrap execution in setTimeout to allow loader UI to paint
        setTimeout(async () => {
            try {
                let dataPoints = [];
                const { data, error } = await supabase
                    .from('motor_test_data_points')
                    .select('*, motor_test_runs(*)')
                    .in('test_run_id', checkedRuns);
                if (error) throw error;
                dataPoints = data || [];

                if (dataPoints.length === 0) {
                    progressModal.hide();
                    alert("No telemetry data points found for the selected test runs.");
                    return;
                }

                progressModal.update(40, `Fetched ${dataPoints.length} points. Processing...`);

                // Group data points by run
                const runsMap = {};
                dataPoints.forEach(dp => {
                    const run = dp.motor_test_runs;
                    if (!run) return;
                    const rId = run.id;
                    if (!runsMap[rId]) {
                        runsMap[rId] = {
                            metadata: run,
                            dataPoints: []
                        };
                    }
                    runsMap[rId].dataPoints.push(dp);
                });

                progressModal.update(55, "Sorting and grouping by Motor Model...");

                // Sort data points by throttle ascending
                for (const rId in runsMap) {
                    runsMap[rId].dataPoints.sort((a, b) => (a.throttle || 0) - (b.throttle || 0));
                }

                // Group runs by Motor Model name
                const motorsMap = {};
                for (const rId in runsMap) {
                    const runObj = runsMap[rId];
                    const motor = state.motors.find(m => m.id === runObj.metadata.motor_id);
                    const motorName = motor ? motor.motor_name : 'Draft Runs';
                    if (!motorsMap[motorName]) {
                        motorsMap[motorName] = [];
                    }
                    motorsMap[motorName].push(runObj);
                }

                // Sort runs in each motor group by tested_at ascending
                for (const motorName in motorsMap) {
                    motorsMap[motorName].sort((a, b) => new Date(a.metadata.tested_at) - new Date(b.metadata.tested_at));
                }

                progressModal.update(75, `Compiling file layout (${format.toUpperCase()})...`);

                // Let the browser paint before generating file (very useful for XLSX format)
                setTimeout(() => {
                    if (format === 'xlsx') {
                        const wb = XLSX.utils.book_new();
                        for (const motorName in motorsMap) {
                            const sheetData = [];
                            motorsMap[motorName].forEach((runObj, runIdx) => {
                                if (runIdx > 0) {
                                    sheetData.push([]);
                                    sheetData.push([]);
                                }

                                // Row 1: metadata
                                sheetData.push([
                                    '# Software name: created by ROTRIX',
                                    `Device Name: ${runObj.metadata.device_name || runObj.metadata.extra_data?.device_name || 'test device'}`,
                                    `Motor Model: ${motorName}`,
                                    `Propeller Model:${runObj.metadata.propeller_model || ''}`
                                ]);

                                // Row 2: metadata
                                sheetData.push([
                                    `# Test conducted by: ${runObj.metadata.test_conducted_by || 'Unknown'}`,
                                    `Powertrain Name: ${runObj.metadata.powertrain_name || runObj.metadata.extra_data?.powertrain_name || 'test prowertrain'}`,
                                    `ESC Model: ${runObj.metadata.esc_model || ''}`,
                                    `Battery Voltage and Capacity: ${runObj.metadata.battery_voltage_capacity || runObj.metadata.extra_data?.battery_voltage_capacity || 'None'}`,
                                    `Battery : ${runObj.metadata.battery_info || ''}`
                                ]);

                                // Row 3: metadata
                                sheetData.push([
                                    `# Generated On: ${formatDate(runObj.metadata.tested_at)}`
                                ]);

                                // Row 4: empty
                                sheetData.push([]);

                                // Row 5: Column headers
                                sheetData.push([
                                    'Throttle',
                                    'Voltage\n(V)',
                                    'Current\n(A)',
                                    'Power\n(W)',
                                    'Thrust\n(G)',
                                    'RPM',
                                    'Efficiency\n(G/W)',
                                    'Temperature\n(℃)'
                                ]);

                                // Row 6..: Data rows
                                runObj.dataPoints.forEach(dp => {
                                    let power = (dp.voltage !== null && dp.current !== null && dp.voltage !== undefined && dp.current !== undefined) 
                                        ? Number((dp.voltage * dp.current).toFixed(2)) 
                                        : (dp.power || 0);
                                    let efficiency = (dp.thrust_g !== null && dp.thrust_g !== undefined && power > 0) 
                                        ? Number((dp.thrust_g / power).toFixed(2)) 
                                        : (dp.efficiency || 0);
                                    let throttle = dp.throttle !== null && dp.throttle !== undefined 
                                        ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) 
                                        : 0;

                                    sheetData.push([
                                        throttle,
                                        dp.voltage !== null && dp.voltage !== undefined ? dp.voltage : '',
                                        dp.current !== null && dp.current !== undefined ? dp.current : '',
                                        power,
                                        dp.thrust_g !== null && dp.thrust_g !== undefined ? dp.thrust_g : '',
                                        dp.rpm !== null && dp.rpm !== undefined ? dp.rpm : '',
                                        efficiency,
                                        dp.temperature !== null && dp.temperature !== undefined ? dp.temperature : ''
                                    ]);
                                });
                            });

                            const ws = XLSX.utils.aoa_to_sheet(sheetData);
                            const sheetName = getExcelSheetName(motorName);
                            XLSX.utils.book_append_sheet(wb, ws, sheetName);
                        }
                        progressModal.update(95, "Downloading Excel file...");
                        XLSX.writeFile(wb, `thrustvault_telemetry_${new Date().toISOString().slice(0, 10)}.xlsx`);
                    }
                    else if (format === 'csv') {
                        const csvLines = [];
                        let isFirstRun = true;
                        for (const motorName in motorsMap) {
                            motorsMap[motorName].forEach(runObj => {
                                if (!isFirstRun) {
                                    csvLines.push('');
                                    csvLines.push('');
                                }
                                isFirstRun = false;

                                // Row 1: metadata
                                csvLines.push([
                                    `"# Software name: created by ROTRIX"`,
                                    `"Device Name: ${runObj.metadata.device_name || runObj.metadata.extra_data?.device_name || 'test device'}"`,
                                    `"Motor Model: ${motorName}"`,
                                    `"Propeller Model:${runObj.metadata.propeller_model || ''}"`
                                ].join(','));

                                // Row 2: metadata
                                csvLines.push([
                                    `"# Test conducted by: ${runObj.metadata.test_conducted_by || 'Unknown'}"`,
                                    `"Powertrain Name: ${runObj.metadata.powertrain_name || runObj.metadata.extra_data?.powertrain_name || 'test prowertrain'}"`,
                                    `"ESC Model: ${runObj.metadata.esc_model || ''}"`,
                                    `"Battery Voltage and Capacity: ${runObj.metadata.battery_voltage_capacity || runObj.metadata.extra_data?.battery_voltage_capacity || 'None'}"`,
                                    `"Battery : ${runObj.metadata.battery_info || ''}"`
                                ].join(','));

                                // Row 3: metadata
                                csvLines.push(`"# Generated On: ${formatDate(runObj.metadata.tested_at)}"`);

                                // Row 4: empty
                                csvLines.push('');

                                // Row 5: Column headers
                                csvLines.push([
                                    '"Throttle"',
                                    '"Voltage\\n(V)"',
                                    '"Current\\n(A)"',
                                    '"Power\\n(W)"',
                                    '"Thrust\\n(G)"',
                                    '"RPM"',
                                    '"Efficiency\\n(G/W)"',
                                    '"Temperature\\n(℃)"'
                                ].join(','));

                                // Row 6..: Data rows
                                runObj.dataPoints.forEach(dp => {
                                    let power = (dp.voltage !== null && dp.current !== null && dp.voltage !== undefined && dp.current !== undefined) 
                                        ? Number((dp.voltage * dp.current).toFixed(2)) 
                                        : (dp.power || 0);
                                    let efficiency = (dp.thrust_g !== null && dp.thrust_g !== undefined && power > 0) 
                                        ? Number((dp.thrust_g / power).toFixed(2)) 
                                        : (dp.efficiency || 0);
                                    let throttle = dp.throttle !== null && dp.throttle !== undefined 
                                        ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) 
                                        : 0;

                                    csvLines.push([
                                        throttle,
                                        dp.voltage !== null && dp.voltage !== undefined ? dp.voltage : '',
                                        dp.current !== null && dp.current !== undefined ? dp.current : '',
                                        power,
                                        dp.thrust_g !== null && dp.thrust_g !== undefined ? dp.thrust_g : '',
                                        dp.rpm !== null && dp.rpm !== undefined ? dp.rpm : '',
                                        efficiency,
                                        dp.temperature !== null && dp.temperature !== undefined ? dp.temperature : ''
                                    ].join(','));
                                });
                            });
                        }
                        progressModal.update(95, "Downloading CSV file...");
                        downloadFile(csvLines.join('\n'), 'text/csv;charset=utf-8;', 'csv', 'telemetry_data');
                    }
                    else if (format === 'json') {
                        const jsonOutput = { motors: [] };
                        for (const motorName in motorsMap) {
                            const motorObj = {
                                motor_model: motorName,
                                test_runs: motorsMap[motorName].map(runObj => {
                                    return {
                                        metadata: {
                                            software_name: "created by ROTRIX",
                                            device_name: runObj.metadata.device_name || runObj.metadata.extra_data?.device_name || 'test device',
                                            motor_model: motorName,
                                            propeller_model: runObj.metadata.propeller_model || '',
                                            test_conducted_by: runObj.metadata.test_conducted_by || 'Unknown',
                                            powertrain_name: runObj.metadata.powertrain_name || runObj.metadata.extra_data?.powertrain_name || 'test prowertrain',
                                            esc_model: runObj.metadata.esc_model || '',
                                            battery_voltage_capacity: runObj.metadata.battery_voltage_capacity || runObj.metadata.extra_data?.battery_voltage_capacity || 'None',
                                            battery_info: runObj.metadata.battery_info || '',
                                            generated_on: formatDate(runObj.metadata.tested_at)
                                        },
                                        data_points: runObj.dataPoints.map(dp => {
                                            let power = (dp.voltage !== null && dp.current !== null && dp.voltage !== undefined && dp.current !== undefined) 
                                                ? Number((dp.voltage * dp.current).toFixed(2)) 
                                                : (dp.power || 0);
                                            let efficiency = (dp.thrust_g !== null && dp.thrust_g !== undefined && power > 0) 
                                                ? Number((dp.thrust_g / power).toFixed(2)) 
                                                : (dp.efficiency || 0);
                                            let throttle = dp.throttle !== null && dp.throttle !== undefined 
                                                ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) 
                                                : 0;
                                            return {
                                                throttle: throttle,
                                                voltage: dp.voltage !== null && dp.voltage !== undefined ? dp.voltage : null,
                                                current: dp.current !== null && dp.current !== undefined ? dp.current : null,
                                                power: power,
                                                thrust_g: dp.thrust_g !== null && dp.thrust_g !== undefined ? dp.thrust_g : null,
                                                rpm: dp.rpm !== null && dp.rpm !== undefined ? dp.rpm : null,
                                                efficiency: efficiency,
                                                temperature: dp.temperature !== null && dp.temperature !== undefined ? dp.temperature : null
                                            };
                                        })
                                    };
                                })
                            };
                            jsonOutput.motors.push(motorObj);
                        }
                        progressModal.update(95, "Downloading JSON file...");
                        downloadFile(JSON.stringify(jsonOutput, null, 2), 'application/json', 'json', 'telemetry_data');
                    }
                    else if (format === 'xml') {
                        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<telemetry>\n';
                        for (const motorName in motorsMap) {
                            xml += `  <motor name="${escapeXML(motorName)}">\n`;
                            motorsMap[motorName].forEach(runObj => {
                                xml += '    <test_run>\n';
                                xml += '      <metadata>\n';
                                xml += '        <software_name>created by ROTRIX</software_name>\n';
                                xml += `        <device_name>${escapeXML(runObj.metadata.device_name || runObj.metadata.extra_data?.device_name || 'test device')}</device_name>\n`;
                                xml += `        <motor_model>${escapeXML(motorName)}</motor_model>\n`;
                                xml += `        <propeller_model>${escapeXML(runObj.metadata.propeller_model || '')}</propeller_model>\n`;
                                xml += `        <test_conducted_by>${escapeXML(runObj.metadata.test_conducted_by || 'Unknown')}</test_conducted_by>\n`;
                                xml += `        <powertrain_name>${escapeXML(runObj.metadata.powertrain_name || runObj.metadata.extra_data?.powertrain_name || 'test prowertrain')}</powertrain_name>\n`;
                                xml += `        <esc_model>${escapeXML(runObj.metadata.esc_model || '')}</esc_model>\n`;
                                xml += `        <battery_voltage_capacity>${escapeXML(runObj.metadata.battery_voltage_capacity || runObj.metadata.extra_data?.battery_voltage_capacity || 'None')}</battery_voltage_capacity>\n`;
                                xml += `        <battery_info>${escapeXML(runObj.metadata.battery_info || '')}</battery_info>\n`;
                                xml += `        <generated_on>${formatDate(runObj.metadata.tested_at)}</generated_on>\n`;
                                xml += '      </metadata>\n';
                                xml += '      <data_points>\n';
                                
                                runObj.dataPoints.forEach(dp => {
                                    let power = (dp.voltage !== null && dp.current !== null && dp.voltage !== undefined && dp.current !== undefined) 
                                        ? Number((dp.voltage * dp.current).toFixed(2)) 
                                        : (dp.power || 0);
                                    let efficiency = (dp.thrust_g !== null && dp.thrust_g !== undefined && power > 0) 
                                        ? Number((dp.thrust_g / power).toFixed(2)) 
                                        : (dp.efficiency || 0);
                                    let throttle = dp.throttle !== null && dp.throttle !== undefined 
                                        ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) 
                                        : 0;
                                    
                                    xml += '        <data_point>\n';
                                    xml += `          <throttle>${throttle}</throttle>\n`;
                                    xml += `          <voltage>${dp.voltage !== null && dp.voltage !== undefined ? dp.voltage : ''}</voltage>\n`;
                                    xml += `          <current>${dp.current !== null && dp.current !== undefined ? dp.current : ''}</current>\n`;
                                    xml += `          <power>${power}</power>\n`;
                                    xml += `          <thrust_g>${dp.thrust_g !== null && dp.thrust_g !== undefined ? dp.thrust_g : ''}</thrust_g>\n`;
                                    xml += `          <rpm>${dp.rpm !== null && dp.rpm !== undefined ? dp.rpm : ''}</rpm>\n`;
                                    xml += `          <efficiency>${efficiency}</efficiency>\n`;
                                    xml += `          <temperature>${dp.temperature !== null && dp.temperature !== undefined ? dp.temperature : ''}</temperature>\n`;
                                    xml += '        </data_point>\n';
                                });
                                
                                xml += '      </data_points>\n';
                                xml += '    </test_run>\n';
                            });
                            xml += '  </motor>\n';
                        }
                        xml += '</telemetry>';
                        progressModal.update(95, "Downloading XML file...");
                        downloadFile(xml, 'application/xml', 'xml', 'telemetry_data');
                    }
                    else if (format === 'html') {
                        let html = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>ThrustVault Telemetry Export</title>\n<style>\n';
                        html += 'body { font-family: "Inter", system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 40px; margin: 0; line-height: 1.5; }\n';
                        html += '.container { max-width: 1200px; margin: 0 auto; }\n';
                        html += '.header-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }\n';
                        html += '.header-brand h1 { font-family: "Outfit", sans-serif; font-size: 2.2rem; font-weight: 800; margin: 0; color: #1e3a8a; }\n';
                        html += '.header-brand span { color: #2563eb; }\n';
                        html += '.motor-section { background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); padding: 30px; margin-bottom: 40px; border: 1px solid #e2e8f0; }\n';
                        html += '.motor-title { font-family: "Outfit", sans-serif; font-size: 1.8rem; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 25px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }\n';
                        html += '.run-card { background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 20px; margin-bottom: 30px; }\n';
                        html += '.run-card:last-child { margin-bottom: 0; }\n';
                        html += '.metadata-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-bottom: 20px; background: white; padding: 15px; border-radius: 6px; border: 1px solid #cbd5e1; }\n';
                        html += '.metadata-item { font-size: 0.85rem; color: #475569; }\n';
                        html += '.metadata-item strong { color: #0f172a; display: block; margin-bottom: 2px; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }\n';
                        html += 'table { border-collapse: collapse; width: 100%; border-radius: 6px; overflow: hidden; background: white; border: 1px solid #cbd5e1; margin-top: 15px; }\n';
                        html += 'th, td { border: 1px solid #cbd5e1; text-align: center; padding: 10px 12px; font-size: 0.9rem; }\n';
                        html += 'th { background-color: #1e293b; color: white; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }\n';
                        html += 'tr:nth-child(even) { background-color: #f1f5f9; }\n';
                        html += 'tr:hover { background-color: #e2e8f0; }\n';
                        html += '</style>\n</head>\n<body>\n<div class="container">\n';
                        html += '  <div class="header-brand">\n    <h1>Thrust<span>Vault</span> Telemetry Report</h1>\n  </div>\n';

                        for (const motorName in motorsMap) {
                            html += `  <div class="motor-section">\n`;
                            html += `    <div class="motor-title">Motor: ${escapeXML(motorName)}</div>\n`;
                            
                            motorsMap[motorName].forEach((runObj, runIndex) => {
                                html += `    <div class="run-card">\n`;
                                html += `      <div class="metadata-grid">\n`;
                                html += `        <div class="metadata-item"><strong>Software</strong>created by ROTRIX</div>\n`;
                                html += `        <div class="metadata-item"><strong>Device Name</strong>${escapeXML(runObj.metadata.device_name || runObj.metadata.extra_data?.device_name || 'test device')}</div>\n`;
                                html += `        <div class="metadata-item"><strong>Propeller Model</strong>${escapeXML(runObj.metadata.propeller_model || 'N/A')}</div>\n`;
                                html += `        <div class="metadata-item"><strong>Tester</strong>${escapeXML(runObj.metadata.test_conducted_by || 'Unknown')}</div>\n`;
                                html += `        <div class="metadata-item"><strong>Powertrain</strong>${escapeXML(runObj.metadata.powertrain_name || runObj.metadata.extra_data?.powertrain_name || 'test prowertrain')}</div>\n`;
                                html += `        <div class="metadata-item"><strong>ESC Model</strong>${escapeXML(runObj.metadata.esc_model || 'N/A')}</div>\n`;
                                html += `        <div class="metadata-item"><strong>Battery Spec</strong>${escapeXML(runObj.metadata.battery_info || 'N/A')}</div>\n`;
                                html += `        <div class="metadata-item"><strong>Battery Volt/Cap</strong>${escapeXML(runObj.metadata.battery_voltage_capacity || runObj.metadata.extra_data?.battery_voltage_capacity || 'None')}</div>\n`;
                                html += `        <div class="metadata-item"><strong>Generated On</strong>${formatDate(runObj.metadata.tested_at)}</div>\n`;
                                html += `      </div>\n`;
                                
                                html += `      <table>\n`;
                                html += `        <thead>\n          <tr>\n`;
                                html += `            <th>Throttle</th>\n`;
                                html += `            <th>Voltage (V)</th>\n`;
                                html += `            <th>Current (A)</th>\n`;
                                html += `            <th>Power (W)</th>\n`;
                                html += `            <th>Thrust (G)</th>\n`;
                                html += `            <th>RPM</th>\n`;
                                html += `            <th>Efficiency (G/W)</th>\n`;
                                html += `            <th>Temperature (℃)</th>\n`;
                                html += `          </tr>\n        </thead>\n        <tbody>\n`;
                                
                                runObj.dataPoints.forEach(dp => {
                                    let power = (dp.voltage !== null && dp.current !== null && dp.voltage !== undefined && dp.current !== undefined) 
                                        ? Number((dp.voltage * dp.current).toFixed(2)) 
                                        : (dp.power || 0);
                                    let efficiency = (dp.thrust_g !== null && dp.thrust_g !== undefined && power > 0) 
                                        ? Number((dp.thrust_g / power).toFixed(2)) 
                                        : (dp.efficiency || 0);
                                    let throttle = dp.throttle !== null && dp.throttle !== undefined 
                                        ? (dp.throttle <= 1 ? Math.round(dp.throttle * 100) : dp.throttle) 
                                        : 0;
                                    
                                    html += `          <tr>\n`;
                                    html += `            <td>${throttle}</td>\n`;
                                    html += `            <td>${dp.voltage !== null && dp.voltage !== undefined ? dp.voltage : ''}</td>\n`;
                                    html += `            <td>${dp.current !== null && dp.current !== undefined ? dp.current : ''}</td>\n`;
                                    html += `            <td>${power}</td>\n`;
                                    html += `            <td>${dp.thrust_g !== null && dp.thrust_g !== undefined ? dp.thrust_g : ''}</td>\n`;
                                    html += `            <td>${dp.rpm !== null && dp.rpm !== undefined ? dp.rpm : ''}</td>\n`;
                                    html += `            <td>${efficiency}</td>\n`;
                                    html += `            <td>${dp.temperature !== null && dp.temperature !== undefined ? dp.temperature : ''}</td>\n`;
                                    html += `          </tr>\n`;
                                });
                                
                                html += `        </tbody>\n      </table>\n`;
                                html += `    </div>\n`; // End run-card
                            });
                            
                            html += `  </div>\n`; // End motor-section
                        }

                        html += '</div>\n</body>\n</html>';
                        progressModal.update(95, "Downloading HTML file...");
                        downloadFile(html, 'text/html;charset=utf-8;', 'html', 'telemetry_data');
                    }

                    progressModal.update(100, "Done!");
                    logUserActivity(session.email, session.role, 'Exporter Operation', `Exported telemetry readings as ${format.toUpperCase()}`);
                    
                    // Hide loader after a tiny delay
                    setTimeout(() => {
                        progressModal.hide();
                    }, 500);
                }, 100);

            } catch (err) {
                console.error("Telemetry export failed:", err);
                progressModal.hide();
                alert("Export failed: " + err.message);
            }
        }, 100);
    };

    function downloadFile(content, mimeType, extension, filenamePrefix) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `thrustvault_${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.${extension}`;
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
    function logoutAndRedirect(action = 'Logout', details = 'Logged out successfully.') {
        if (session) {
            logUserActivity(session.email, session.role, action, details);
        }
        if (supabase) {
            supabase.auth.signOut().catch(e => console.error("SignOut error:", e));
        }
        localStorage.removeItem('thrustvault_session');
        // Clear cookie
        const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `thrustvault_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict${secureFlag}`;
        window.location.href = 'index.html';
    }

    // Logout
    

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
            if (!modal) {
                resolve(confirm(message));
                return;
            }
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

    function openModal(modal) { modal.classList.add('show'); }
    function closeModal(modal) { modal.classList.remove('show'); }

    // Sidebar navigation trigger is setup dynamically in setupSidebar()

    async function fetchSidebarCounts() {
        try {
            if (!supabase) {
                const res = await fetch('/api/config');
                const config = await res.json();
                supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
            }
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
                        const { error } = await supabase
                            .from('categories')
                            .delete()
                            .eq('id', cat.id);
                        if (error) throw error;
                        logUserActivity(session.email, session.role, 'Category Deleted', `Deleted category: ${cat.name}`);
                        await fetchSidebarCounts();
                        // Also refresh the filter dropdown if on exports page
                        if (typeof loadMetadata === 'function') {
                            await loadMetadata();
                        }
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

    // Init App
    async function init() {
        try {
            const res = await fetch('/api/config');
            const config = await res.json();
            supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

            // Check session
            const { data: { session: sbSession }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sbSession) {
                console.warn("No Supabase session.");
                logoutAndRedirect();
                return;
            }

            // Sync user details
            const userEmail = sbSession.user.email;
            const emailEl = document.getElementById('session-email');
            if (emailEl) emailEl.textContent = userEmail;
            const avatarInit = document.getElementById('user-avatar-initials');
            if (avatarInit && userEmail) {
                avatarInit.textContent = userEmail.charAt(0).toUpperCase();
            }

            await fetchSidebarCounts();
            await loadMetadata();
        } catch (e) {
            console.error("Initialization failed", e);
            logoutAndRedirect();
        }
    }

    // Sidebar Profile Click Trigger is setup dynamically in setupSidebar()

    // Inactivity Session Expiry (10 minutes)
    let inactivityTimeout;
    let lastSyncTime = Date.now();

    function resetInactivityTimer() {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(autoLogout, 600000); // 10 minutes

        // Throttled cookie timestamp sync (at most once every 30 seconds)
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

    // Start initial timer
    resetInactivityTimer();

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
