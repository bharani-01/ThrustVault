// performance_app.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Validate session exists
    const session = JSON.parse(localStorage.getItem('thrustvault_session'));
    if (!session) {
        localStorage.removeItem('thrustvault_session');
        window.location.href = 'index.html';
        return;
    }

    // Set user profile in sidebar footer
    const email = session.email || '';
    document.getElementById('session-email').textContent = email;
    const avatarInitials = document.getElementById('user-avatar-initials');
    if (avatarInitials && email) {
        avatarInitials.textContent = email.charAt(0).toUpperCase();
    }
    const roleBadge = document.getElementById('session-role');
    roleBadge.textContent = session.role.charAt(0).toUpperCase() + session.role.slice(1);
    roleBadge.className = `badge-role role-${session.role}`;

    // Enable/Disable creator views based on role
    const isWriter = session.role === 'admin' || session.role === 'intern';
    const tabBtnCreator = document.getElementById('tab-btn-creator');
    if (isWriter && tabBtnCreator) {
        tabBtnCreator.style.display = 'block';
    }

    // Setup catalog link based on role
    const navLinkCatalog = document.getElementById('nav-link-catalog');
    if (session.role === 'admin') {
        navLinkCatalog.href = 'admin_dashboard.html';
    } else if (session.role === 'intern') {
        navLinkCatalog.href = 'intern_dashboard.html';
    } else if (session.role === 'guest') {
        navLinkCatalog.href = 'guest_dashboard.html';
    }

    lucide.createIcons();

    let state = {
        categories: [],      // [{id, name, description}]
        allMotors: [],       // full motors list from DB
        motorsByCat: {},     // { categoryId: [motor, ...] }
        testRuns: [],
        activeMotorId: null,
        activeMetric: 'thrust',
        activeRunId: null,
        chartInstance: null
    };

    let supabase = null;

    // DOM Elements
    const elements = {
        // Visualizer
        plotCategorySelect: document.getElementById('plot-category-select'),
        plotMotorSelect: document.getElementById('plot-motor-select'),
        plotMetricSelect: document.getElementById('plot-metric-select'),
        testRunsList: document.getElementById('test-runs-list'),
        activeRunLabel: document.getElementById('active-run-label'),
        dataPointsGridRows: document.getElementById('data-points-grid-rows'),
        totalTestRunsCount: document.getElementById('total-test-runs-count'),
        totalDataPointsCount: document.getElementById('total-data-points-count'),
        confirmModal: document.getElementById('confirm-modal'),
        
        // Tabs
        tabBtnVisualizer: document.getElementById('tab-btn-visualizer'),
        tabBtnCreator: document.getElementById('tab-btn-creator'),
        sectionVisualizer: document.getElementById('section-visualizer'),
        sectionCreator: document.getElementById('section-creator'),

        // Creator Form
        creatorForm: document.getElementById('dataset-creator-form'),
        formCategorySelect: document.getElementById('form-category-select'),
        formCatInfoBadge: document.getElementById('form-cat-info-badge'),
        formCatInfoText: document.getElementById('form-cat-info-text'),
        formTestMotor: document.getElementById('form-test-motor'),
        formTestPropeller: document.getElementById('form-test-propeller'),
        formTestEsc: document.getElementById('form-test-esc'),
        formTestBattery: document.getElementById('form-test-battery'),
        formTestTester: document.getElementById('form-test-tester'),
        btnAddStepRow: document.getElementById('btn-add-step-row'),
        creatorTableRows: document.getElementById('creator-table-rows'),
        btnResetCreator: document.getElementById('btn-reset-creator'),
        btnLogout: document.getElementById('btn-logout')
    };

    // Logging helper
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

    // Modal helpers
    function openModal(modal) { modal.classList.add('show'); }
    function closeModal(modal) { modal.classList.remove('show'); }
    document.querySelectorAll('.modal-close-trigger').forEach(btn => {
        btn.onclick = (e) => closeModal(e.target.closest('.modal-backdrop'));
    });

    // Custom Async Confirmation Dialog Modal
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

    // Tab Switching
    elements.tabBtnVisualizer.onclick = () => {
        elements.tabBtnVisualizer.classList.add('active');
        elements.tabBtnCreator.classList.remove('active');
        elements.sectionVisualizer.style.display = 'block';
        elements.sectionCreator.style.display = 'none';
        refreshVisualizerData();
    };

    elements.tabBtnCreator.onclick = () => {
        elements.tabBtnCreator.classList.add('active');
        elements.tabBtnVisualizer.classList.remove('active');
        elements.sectionCreator.style.display = 'block';
        elements.sectionVisualizer.style.display = 'none';
    };

    // Logout
    elements.btnLogout.onclick = () => {
        if (session) {
            logUserActivity(session.email, session.role, 'Logout', 'Logged out successfully.');
        }
        if (supabase) {
            supabase.auth.signOut().catch(e => console.error("SignOut error:", e));
        }
        localStorage.removeItem('thrustvault_session');
        window.location.href = 'index.html';
    };

    // Dynamic row addition for dataset creator
    function addCreatorRow(throttleVal = '') {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="number" step="1" min="0" max="100" class="inp-throttle" required placeholder="e.g. 50" value="${throttleVal}"></td>
            <td><input type="number" step="0.1" min="0" class="inp-voltage" required placeholder="14.8"></td>
            <td><input type="number" step="0.1" min="0" class="inp-current" required placeholder="1.3"></td>
            <td><input type="number" class="inp-power" readonly placeholder="0.00"></td>
            <td><input type="number" step="1" min="0" class="inp-thrust" required placeholder="350"></td>
            <td><input type="number" step="1" min="0" class="inp-rpm" placeholder="2700"></td>
            <td><input type="number" class="inp-efficiency" readonly placeholder="0.00"></td>
            <td><input type="number" step="1" class="inp-temp" placeholder="43"></td>
            <td style="text-align:center;">
                <button type="button" class="btn-delete btn-row-delete" style="padding:6px; background:none; border:none; color:var(--danger-color); cursor:pointer;"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
            </td>
        `;

        // Bind auto-calculations on input changes
        const voltageInp = tr.querySelector('.inp-voltage');
        const currentInp = tr.querySelector('.inp-current');
        const thrustInp = tr.querySelector('.inp-thrust');
        const powerInp = tr.querySelector('.inp-power');
        const efficiencyInp = tr.querySelector('.inp-efficiency');

        function calculateFields() {
            const v = parseFloat(voltageInp.value) || 0;
            const a = parseFloat(currentInp.value) || 0;
            const t = parseFloat(thrustInp.value) || 0;
            
            const power = v * a;
            powerInp.value = power > 0 ? power.toFixed(2) : '';

            if (power > 0 && t > 0) {
                const eff = t / power;
                efficiencyInp.value = eff.toFixed(2);
            } else {
                efficiencyInp.value = '';
            }
        }

        voltageInp.addEventListener('input', calculateFields);
        currentInp.addEventListener('input', calculateFields);
        thrustInp.addEventListener('input', calculateFields);

        // Bind delete row
        tr.querySelector('.btn-row-delete').onclick = () => {
            tr.remove();
        };

        elements.creatorTableRows.appendChild(tr);
        lucide.createIcons();
    }

    elements.btnAddStepRow.onclick = () => {
        addCreatorRow();
    };

    // Initialize Creator Form defaults (50%, 65%, 75%, 85%, 100%)
    function initializeCreatorTable() {
        elements.creatorTableRows.innerHTML = '';
        const defaultSteps = [50, 65, 75, 85, 100];
        defaultSteps.forEach(step => addCreatorRow(step));
    }

    elements.btnResetCreator.onclick = async () => {
        const confirmReset = await customConfirm("Clear Dataset?", "Are you sure you want to clear all metadata inputs and data rows?");
        if (confirmReset) {
            elements.creatorForm.reset();
            initializeCreatorTable();
            // Re-lock motor select and hide category badge
            if (elements.formCatInfoBadge) elements.formCatInfoBadge.classList.remove('visible');
            if (elements.formTestMotor) {
                elements.formTestMotor.innerHTML = '<option value="">-- Select Thrust Level First --</option>';
                elements.formTestMotor.disabled = true;
            }
        }
    };


    // Creator Form Submission
    elements.creatorForm.onsubmit = async (e) => {
        e.preventDefault();

        const motorId = elements.formTestMotor.value;
        if (!motorId) {
            alert("Please select a Thrust Level and then a Motor Model.");
            return;
        }

        const propeller = elements.formTestPropeller.value.trim();
        const esc = elements.formTestEsc.value.trim() || null;
        const battery = elements.formTestBattery.value.trim() || null;
        const tester = elements.formTestTester.value.trim() || null;

        const motorModel = elements.formTestMotor.options[elements.formTestMotor.selectedIndex].text;

        const rowEls = Array.from(elements.creatorTableRows.querySelectorAll('tr'));
        if (rowEls.length === 0) {
            alert("Please add at least one throttle step row.");
            return;
        }


        // Validate values
        const stepsData = [];
        for (const row of rowEls) {
            const throttle = parseFloat(row.querySelector('.inp-throttle').value);
            const voltage = parseFloat(row.querySelector('.inp-voltage').value) || null;
            const current = parseFloat(row.querySelector('.inp-current').value) || null;
            const power = parseFloat(row.querySelector('.inp-power').value) || null;
            const thrust = parseFloat(row.querySelector('.inp-thrust').value);
            const rpm = parseFloat(row.querySelector('.inp-rpm').value) || null;
            const efficiency = parseFloat(row.querySelector('.inp-efficiency').value) || null;
            const temp = parseFloat(row.querySelector('.inp-temp').value) || null;

            if (isNaN(throttle) || isNaN(thrust)) {
                alert("Throttle (%) and Thrust (g) are required and must be numeric values.");
                return;
            }

            stepsData.push({
                throttle: throttle / 100, // convert percentage (e.g. 50% -> 0.5)
                voltage,
                current,
                power,
                thrust_g: thrust,
                rpm,
                efficiency,
                temperature: temp
            });
        }

        try {
            // 1. Insert into motor_test_runs
            const { data: runData, error: runError } = await supabase
                .from('motor_test_runs')
                .insert([{
                    motor_id: motorId,
                    propeller_model: propeller,
                    esc_model: esc,
                    battery_info: battery,
                    test_conducted_by: tester
                }])
                .select()
                .single();

            if (runError) throw runError;
            const runId = runData.id;

            // 2. Insert all data points
            const pointsPayload = stepsData.map(pt => ({
                test_run_id: runId,
                ...pt
            }));

            const { error: pointsError } = await supabase
                .from('motor_test_data_points')
                .insert(pointsPayload);

            if (pointsError) throw pointsError;

            // Log activity
            logUserActivity(session.email, session.role, 'Performance Dataset Created', `Added performance dataset for ${motorModel} (Prop: ${propeller}, ESC: ${esc || 'None'})`);

            alert("Successfully saved performance dataset!");
            elements.creatorForm.reset();
            initializeCreatorTable();
            
            // Fetch latest count and refresh
            await fetchStats();
            elements.tabBtnVisualizer.click();
        } catch (err) {
            console.error("Error saving dataset:", err);
            alert("Failed to save performance dataset: " + err.message);
        }
    };

    // Fetch quick counts
    async function fetchStats() {
        try {
            const { count: runsCount, error: runsError } = await supabase
                .from('motor_test_runs')
                .select('*', { count: 'exact', head: true });
            if (runsError) throw runsError;

            const { count: ptsCount, error: ptsError } = await supabase
                .from('motor_test_data_points')
                .select('*', { count: 'exact', head: true });
            if (ptsError) throw ptsError;

            elements.totalTestRunsCount.textContent = runsCount || 0;
            elements.totalDataPointsCount.textContent = ptsCount || 0;
        } catch (err) {
            console.error("Error fetching stats counts:", err);
        }
    }

    // Helper: build motor options HTML for a given category ID
    function buildMotorOptions(categoryId, placeholder) {
        const list = state.motorsByCat[categoryId] || [];
        if (list.length === 0) {
            return `<option value="">${placeholder || 'No motors in this class'}</option>`;
        }
        let html = `<option value="">-- Select Motor --</option>`;
        list.forEach(m => {
            html += `<option value="${m.id}">${m.company} - ${m.motor_name}</option>`;
        });
        return html;
    }

    // Populate both category selects after fetching data
    function populateCategorySelects() {
        const catHtml = '<option value="">-- Select Thrust Level --</option>' +
            state.categories.map(c => {
                const label = c.name.toLowerCase().includes('class') ? c.name : `${c.name} Class`;
                return `<option value="${c.id}">${label}</option>`;
            }).join('');

        if (elements.plotCategorySelect) {
            elements.plotCategorySelect.innerHTML = catHtml;
        }
        if (elements.formCategorySelect) {
            elements.formCategorySelect.innerHTML = catHtml;
        }
    }

    // ── Visualizer: category change → populate motor dropdown ─────────────────
    function onPlotCategoryChange() {
        const catId = elements.plotCategorySelect.value;
        state.activeMotorId = null;
        state.activeRunId = null;
        elements.activeRunLabel.textContent = 'Select a test run to inspect readings';
        elements.dataPointsGridRows.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#64748b; font-size:0.85rem; padding:30px 0;">No configuration selected. Choose a motor and click a test run.</td></tr>`;
        elements.testRunsList.innerHTML = `<div style="color:#64748b; font-size:0.85rem; text-align:center; padding:20px 0;">Select a motor to view test runs.</div>`;
        if (state.chartInstance) { state.chartInstance.destroy(); state.chartInstance = null; }

        if (!catId) {
            elements.plotMotorSelect.innerHTML = '<option value="">-- Select Thrust Level First --</option>';
            elements.plotMotorSelect.disabled = true;
            return;
        }

        elements.plotMotorSelect.innerHTML = buildMotorOptions(catId);
        elements.plotMotorSelect.disabled = false;
        elements.plotMotorSelect.value = '';
    }

    if (elements.plotCategorySelect) {
        elements.plotCategorySelect.onchange = onPlotCategoryChange;
    }

    // ── Creator Form: category change → populate motor dropdown + info badge ──
    function onFormCategoryChange() {
        const catId = elements.formCategorySelect.value;
        elements.formTestMotor.value = '';

        if (!catId) {
            elements.formTestMotor.innerHTML = '<option value="">-- Select Thrust Level First --</option>';
            elements.formTestMotor.disabled = true;
            if (elements.formCatInfoBadge) {
                elements.formCatInfoBadge.classList.remove('visible');
            }
            return;
        }

        // Show category description badge
        const cat = state.categories.find(c => c.id === catId);
        if (cat && elements.formCatInfoBadge && elements.formCatInfoText) {
            elements.formCatInfoText.textContent = cat.description || '';
            elements.formCatInfoBadge.classList.toggle('visible', !!cat.description);
            lucide.createIcons();
        }

        elements.formTestMotor.innerHTML = buildMotorOptions(catId);
        elements.formTestMotor.disabled = false;
        elements.formTestMotor.value = '';
    }

    if (elements.formCategorySelect) {
        elements.formCategorySelect.onchange = onFormCategoryChange;
    }

    // Refresh visualizer selects and charts
    async function refreshVisualizerData() {
        try {
            // Fetch categories (with description)
            const { data: categories, error: categoryError } = await supabase
                .from('categories')
                .select('id, name, description')
                .order('name');
            if (categoryError) throw categoryError;

            // Fetch all motors
            const { data: motors, error: motorError } = await supabase
                .from('motors')
                .select('id, motor_name, company, category_id')
                .order('company')
                .order('motor_name');
            if (motorError) throw motorError;

            state.categories = categories || [];
            state.allMotors  = motors || [];

            // Build lookup map: categoryId → [motors]
            state.motorsByCat = {};
            state.categories.forEach(c => { state.motorsByCat[c.id] = []; });
            const uncatKey = '__uncat__';
            state.motorsByCat[uncatKey] = [];
            state.allMotors.forEach(m => {
                if (m.category_id && state.motorsByCat[m.category_id] !== undefined) {
                    state.motorsByCat[m.category_id].push(m);
                } else {
                    state.motorsByCat[uncatKey].push(m);
                }
            });

            // Populate category dropdowns
            populateCategorySelects();

            // Reset motor selects to locked state
            elements.plotMotorSelect.innerHTML  = '<option value="">-- Select Thrust Level First --</option>';
            elements.plotMotorSelect.disabled   = true;
            elements.formTestMotor.innerHTML    = '<option value="">-- Select Thrust Level First --</option>';
            elements.formTestMotor.disabled     = true;

            // Restore active motor if there was a previous selection
            if (state.activeMotorId) {
                const motor = state.allMotors.find(m => m.id === state.activeMotorId);
                if (motor && motor.category_id) {
                    elements.plotCategorySelect.value = motor.category_id;
                    onPlotCategoryChange();
                    elements.plotMotorSelect.value = state.activeMotorId;
                    await loadMotorRuns(state.activeMotorId);
                }
            }
        } catch (err) {
            console.error("Error refreshing visualizer:", err);
        }
    }

    // Load runs on motor select change
    elements.plotMotorSelect.onchange = async () => {
        const motorId = elements.plotMotorSelect.value;
        state.activeMotorId = motorId;
        state.activeRunId = null;
        elements.activeRunLabel.textContent = 'Select a test run to inspect readings';
        elements.dataPointsGridRows.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; color:#64748b; font-size:0.85rem; padding: 30px 0;">
                    No configuration selected. Choose a motor and click a test run.
                </td>
            </tr>
        `;
        
        if (motorId) {
            await loadMotorRuns(motorId);
        } else {
            elements.testRunsList.innerHTML = `
                <div style="color: #64748b; font-size: 0.85rem; text-align: center; padding: 20px 0;">
                    Select a motor to view test runs.
                </div>
            `;
            if (state.chartInstance) {
                state.chartInstance.destroy();
                state.chartInstance = null;
            }
        }
    };

    elements.plotMetricSelect.onchange = () => {
        state.activeMetric = elements.plotMetricSelect.value;
        if (state.activeMotorId) {
            drawPerformanceCurve();
        }
    };

    // Load available runs for a specific motor
    async function loadMotorRuns(motorId) {
        try {
            const { data: runs, error } = await supabase
                .from('motor_test_runs')
                .select('*')
                .eq('motor_id', motorId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            state.testRuns = runs || [];

            if (state.testRuns.length === 0) {
                elements.testRunsList.innerHTML = `
                    <div style="color: #64748b; font-size: 0.85rem; text-align: center; padding: 20px 0;">
                        No calibration datasets found for this motor.
                    </div>
                `;
                if (state.chartInstance) {
                    state.chartInstance.destroy();
                    state.chartInstance = null;
                }
                return;
            }

            elements.testRunsList.innerHTML = state.testRuns.map(run => {
                const date = new Date(run.tested_at).toLocaleDateString();
                const isSelected = state.activeRunId === run.id;
                
                return `
                    <div class="glass-panel btn-sidebar-link ${isSelected ? 'active' : ''}" data-id="${run.id}" style="cursor:pointer; display:flex; flex-direction:column; gap:8px; align-items:start; padding:12px; margin-bottom:8px; width:100%; border:1px solid ${isSelected ? 'var(--primary-color)' : '#cbd5e1'};">
                        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                            <span style="font-weight:700; font-family:'Outfit'; font-size:0.9rem; color:#0f172a; word-break:break-all;">${run.propeller_model}</span>
                            <span style="font-size:0.75rem; color:#94a3b8;">${date}</span>
                        </div>
                        <div style="font-size:0.8rem; color:#64748b; display:flex; flex-direction:column; gap:2px; text-align:left;">
                            <span><strong>ESC:</strong> ${run.esc_model || '-'}</span>
                            <span><strong>Battery:</strong> ${run.battery_info || '-'}</span>
                            <span><strong>Tester:</strong> ${run.test_conducted_by || '-'}</span>
                        </div>
                    </div>
                `;
            }).join('');

            // Bind click to runs cards
            elements.testRunsList.querySelectorAll('[data-id]').forEach(card => {
                card.onclick = () => {
                    const runId = card.dataset.id;
                    state.activeRunId = runId;
                    
                    // Mark card as active visually
                    elements.testRunsList.querySelectorAll('[data-id]').forEach(c => {
                        c.style.borderColor = '#cbd5e1';
                        c.style.background = 'none';
                    });
                    card.style.borderColor = 'var(--primary-color)';
                    card.style.background = '#eff6ff';

                    const run = state.testRuns.find(x => x.id === runId);
                    elements.activeRunLabel.textContent = `Inspecting Configuration: Prop ${run.propeller_model} + ESC ${run.esc_model || 'None'}`;
                    loadGridPoints(runId);
                };
            });

            // Draw multi-line line chart
            drawPerformanceCurve();
        } catch (err) {
            console.error("Error loading motor runs:", err);
        }
    }

    // Load data points table for selected run
    async function loadGridPoints(runId) {
        try {
            const { data: pts, error } = await supabase
                .from('motor_test_data_points')
                .select('*')
                .eq('test_run_id', runId)
                .order('throttle', { ascending: true });
            
            if (error) throw error;
            
            if (!pts || pts.length === 0) {
                elements.dataPointsGridRows.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align:center; color:#64748b; font-size:0.85rem; padding: 20px 0;">
                            No steps data recorded for this run.
                        </td>
                    </tr>
                `;
                return;
            }

            elements.dataPointsGridRows.innerHTML = pts.map(p => {
                const throttlePercent = Math.round(p.throttle * 100);
                const power = p.power ? p.power.toFixed(2) : '-';
                const efficiency = p.efficiency ? p.efficiency.toFixed(2) : '-';
                return `
                    <tr>
                        <td><strong>${throttlePercent}%</strong></td>
                        <td>${p.voltage || '-'} V</td>
                        <td>${p.current || '-'} A</td>
                        <td>${power} W</td>
                        <td><span class="badge-thrust">${p.thrust_g} g</span></td>
                        <td>${p.rpm || '-'}</td>
                        <td><strong style="color:var(--success-color);">${efficiency}</strong> g/W</td>
                        <td>${p.temperature || '-'} ℃</td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error("Error loading grid points:", err);
        }
    }

    // Draw Comparative Chart
    async function drawPerformanceCurve() {
        if (!state.activeMotorId || state.testRuns.length === 0) {
            if (state.chartInstance) {
                state.chartInstance.destroy();
                state.chartInstance = null;
            }
            return;
        }

        try {
            // Fetch all data points for all runs of this motor
            const runIds = state.testRuns.map(r => r.id);
            
            const { data: pts, error } = await supabase
                .from('motor_test_data_points')
                .select('*')
                .in('test_run_id', runIds)
                .order('throttle', { ascending: true });

            if (error) throw error;

            const datasets = [];
            const borderColors = ['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

            // Group data points by test run
            state.testRuns.forEach((run, index) => {
                const runPts = pts.filter(p => p.test_run_id === run.id);
                if (runPts.length === 0) return;

                let labelText = `Prop: ${run.propeller_model}`;
                if (run.esc_model) labelText += ` (ESC: ${run.esc_model})`;

                let chartData = [];

                if (state.activeMetric === 'thrust') {
                    // Y: Thrust (g), X: Throttle (%)
                    chartData = runPts.map(p => ({
                        x: Math.round(p.throttle * 100),
                        y: p.thrust_g
                    }));
                } else if (state.activeMetric === 'efficiency') {
                    // Y: Efficiency (g/W), X: Thrust (g)
                    chartData = runPts.map(p => ({
                        x: p.thrust_g,
                        y: p.efficiency
                    })).sort((a,b) => a.x - b.x);
                } else if (state.activeMetric === 'current') {
                    // Y: Current (A), X: Throttle (%)
                    chartData = runPts.map(p => ({
                        x: Math.round(p.throttle * 100),
                        y: p.current
                    }));
                } else if (state.activeMetric === 'rpm') {
                    // Y: RPM, X: Throttle (%)
                    chartData = runPts.map(p => ({
                        x: Math.round(p.throttle * 100),
                        y: p.rpm
                    }));
                }

                datasets.push({
                    label: labelText,
                    data: chartData,
                    borderColor: borderColors[index % borderColors.length],
                    backgroundColor: borderColors[index % borderColors.length] + '15',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            });

            // Chart Configuration
            const ctx = document.getElementById('performanceCurveChart').getContext('2d');
            if (state.chartInstance) {
                state.chartInstance.destroy();
            }

            let xAxisTitle = 'Throttle (%)';
            let yAxisTitle = 'Max Thrust (g)';

            if (state.activeMetric === 'thrust') {
                xAxisTitle = 'Throttle (%)';
                yAxisTitle = 'Max Thrust (g)';
            } else if (state.activeMetric === 'efficiency') {
                xAxisTitle = 'Thrust Stand Output (g)';
                yAxisTitle = 'Efficiency (g/W)';
            } else if (state.activeMetric === 'current') {
                xAxisTitle = 'Throttle (%)';
                yAxisTitle = 'Current Consumption (A)';
            } else if (state.activeMetric === 'rpm') {
                xAxisTitle = 'Throttle (%)';
                yAxisTitle = 'RPM Speed';
            }

            state.chartInstance = new Chart(ctx, {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear',
                            title: {
                                display: true,
                                text: xAxisTitle,
                                font: { family: 'Outfit', weight: '600', size: 12 },
                                color: '#1e293b'
                            },
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                color: '#475569',
                                font: { family: 'Inter', size: 10 }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: yAxisTitle,
                                font: { family: 'Outfit', weight: '600', size: 12 },
                                color: '#1e293b'
                            },
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                color: '#475569',
                                font: { family: 'Inter', size: 10 }
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { family: 'Inter', size: 11 },
                                boxWidth: 12,
                                padding: 15
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const yVal = context.parsed.y;
                                    const xVal = context.parsed.x;
                                    if (state.activeMetric === 'efficiency') {
                                        return `${context.dataset.label}: ${yVal.toFixed(2)} g/W at ${xVal}g thrust`;
                                    } else if (state.activeMetric === 'thrust') {
                                        return `${context.dataset.label}: ${yVal}g thrust at ${xVal}% throttle`;
                                    } else if (state.activeMetric === 'current') {
                                        return `${context.dataset.label}: ${yVal}A current at ${xVal}% throttle`;
                                    } else if (state.activeMetric === 'rpm') {
                                        return `${context.dataset.label}: ${yVal} RPM at ${xVal}% throttle`;
                                    }
                                }
                            }
                        }
                    }
                }
            });

        } catch (err) {
            console.error("Error drawing performance curve:", err);
        }
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
                logoutAndRedirect();
                return;
            }

            // Verify role matches local storage
            const { data: profile, error: profileError } = await supabase
                .from('user_profiles')
                .select('role')
                .eq('id', sbSession.user.id)
                .single();

            if (profileError || !profile || profile.role !== session.role) {
                console.error("Session verification failed: invalid profile or role mismatch.");
                logoutAndRedirect();
                return;
            }

            // Load visualizer options and data creator rows
            await refreshVisualizerData();
            await fetchStats();
            initializeCreatorTable();
            // Ensure creator selects start locked
            if (elements.formCategorySelect) elements.formCategorySelect.value = '';
            if (elements.formTestMotor) { elements.formTestMotor.innerHTML = '<option value="">-- Select Thrust Level First --</option>'; elements.formTestMotor.disabled = true; }
        } catch (e) {
            console.error("Initialization failed", e);
            logoutAndRedirect();
        }
    }

    function logoutAndRedirect() {
        localStorage.removeItem('thrustvault_session');
        window.location.href = 'index.html';
    }

    init();
});
