'use strict';

document.addEventListener('DOMContentLoaded', () => {
    // ---------------------------------------------------------
    // THEME TOGGLE LOGIC
    // ---------------------------------------------------------
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    if (btnThemeToggle) {
        btnThemeToggle.onclick = () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            if (newTheme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };
    }

    // ---------------------------------------------------------
    // URL PARSING
    // ---------------------------------------------------------
    const parts = window.location.pathname.split('/');
    // Format: /share/{type}/{name}
    // Parts: ["", "share", "motor", "name_here"]
    const type = parts[2] ? parts[2].toLowerCase() : null;
    const name = parts[3] ? decodeURIComponent(parts[3]) : null;

    if (!type || !name) {
        showError('Invalid share link format.');
        return;
    }

    // Elements
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const errorMessage = document.getElementById('error-message');
    const sharedContent = document.getElementById('shared-content');

    const itemTypeBadge = document.getElementById('item-type-badge');
    const itemName = document.getElementById('item-name');
    const itemBrand = document.getElementById('item-brand');
    const specsTableBody = document.getElementById('specs-table-body');
    const customParametersCard = document.getElementById('custom-parameters-card');
    const customSpecsTableBody = document.getElementById('custom-specs-table-body');
    const documentationCard = document.getElementById('documentation-card');
    const linksContainer = document.getElementById('links-container');
    const rightColumnContainer = document.getElementById('right-column-container');

    const motorTelemetrySection = document.getElementById('motor-telemetry-section');
    const generalInfoSection = document.getElementById('general-info-section');
    const infoDescCard = document.getElementById('info-desc-card');
    const infoDescText = document.getElementById('info-desc-text');
    const infoGalleryCard = document.getElementById('info-gallery-card');
    const infoGalleryContainer = document.getElementById('info-gallery-container');

    let profileCharts = {
        throttleTime: null,
        thrustRpm: null,
        currentRpm: null,
        systemEffRpm: null
    };

    function showError(msg) {
        loadingState.style.display = 'none';
        sharedContent.style.display = 'none';
        errorMessage.textContent = msg;
        errorState.style.display = 'flex';
        errorState.classList.remove('hidden');
    }

    function escapeHTML(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function destroyCharts() {
        Object.keys(profileCharts).forEach(key => {
            if (profileCharts[key]) {
                profileCharts[key].destroy();
                profileCharts[key] = null;
            }
        });
    }

    // ---------------------------------------------------------
    // FETCH DATA
    // ---------------------------------------------------------
    async function loadItem() {
        try {
            // 1. Fetch custom parameters schema for resolving custom spec labels
            let customSchema = [];
            try {
                const schemaRes = await fetch('/api/guest/custom-specs');
                if (schemaRes.ok) {
                    customSchema = await schemaRes.json() || [];
                }
            } catch (e) {
                console.warn('Could not fetch custom specs schema', e);
            }

            // 2. Fetch the shared item specifications
            const res = await fetch(`/api/guest/share/${type}/${encodeURIComponent(name)}`);
            if (res.status === 404) {
                showError(`Shared ${type} specifications for "${name}" could not be found.`);
                return;
            }
            if (!res.ok) {
                showError(`Failed to fetch shared details. Server returned status: ${res.status}`);
                return;
            }
            
            const item = await res.json();
            
            // Populate basic header
            itemTypeBadge.textContent = type.toUpperCase();
            if (type === 'motor') {
                itemName.textContent = item.motor_name;
                itemBrand.textContent = item.company;
            } else {
                itemName.textContent = item.name;
                itemBrand.textContent = item.brand;
            }

            // Populate Specs Table
            specsTableBody.innerHTML = '';
            if (type === 'motor') {
                const rows = [
                    { label: 'Manufacturer', val: item.company },
                    { label: 'Thrust Level Class', val: item.category_name || 'N/A' },
                    { label: 'Max Thrust', val: item.max_thrust },
                    { label: 'Recommended ESC', val: item.recommended_esc || '-' },
                    { label: 'Recommended Propeller', val: item.recommended_propeller || '-' },
                    { label: 'Uploaded By', val: item.uploaded_by || 'System Default' }
                ];
                rows.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="py-2.5 text-slate-400 font-label-mono uppercase tracking-wider">${r.label}</td>
                        <td class="py-2.5 text-right font-bold text-[#001e40] dark:text-slate-200">${escapeHTML(r.val)}</td>
                    `;
                    specsTableBody.appendChild(tr);
                });

                // Motor references links
                linksContainer.innerHTML = '';
                let hasLinks = false;
                const linkConfigs = [
                    { url: item.link_motor, title: 'Official Motor Specs', icon: 'cpu' },
                    { url: item.link_esc, title: 'Recommended ESC Specs', icon: 'zap' },
                    { url: item.link_propeller, title: 'Recommended Prop Specs', icon: 'wind' }
                ];
                linkConfigs.forEach(cfg => {
                    if (cfg.url) {
                        hasLinks = true;
                        const a = document.createElement('a');
                        a.href = cfg.url;
                        a.target = '_blank';
                        a.className = 'profile-link-btn flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors text-slate-600 dark:text-slate-300 font-semibold no-underline';
                        a.innerHTML = `
                            <span class="flex items-center gap-2"><i data-lucide="${cfg.icon}"></i> ${cfg.title}</span>
                            <i data-lucide="arrow-up-right" class="w-4 h-4"></i>
                        `;
                        linksContainer.appendChild(a);
                    }
                });
                documentationCard.style.display = hasLinks ? 'block' : 'none';

                // Display Motor Telemetry
                generalInfoSection.style.display = 'none';
                motorTelemetrySection.style.display = 'flex';
                await loadMotorTelemetry(item.id);

            } else {
                // ESC or Propeller
                const rows = [
                    { label: 'Brand', val: item.brand },
                    { label: 'Price', val: item.price ? `${item.price} ${item.currency || 'USD'}` : '-' },
                    { label: 'SKU', val: item.sku || '-' }
                ];
                rows.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="py-2.5 text-slate-400 font-label-mono uppercase tracking-wider">${r.label}</td>
                        <td class="py-2.5 text-right font-bold text-[#001e40] dark:text-slate-200">${escapeHTML(r.val)}</td>
                    `;
                    specsTableBody.appendChild(tr);
                });

                // Product URL
                linksContainer.innerHTML = '';
                if (item.url) {
                    const a = document.createElement('a');
                    a.href = item.url;
                    a.target = '_blank';
                    a.className = 'profile-link-btn flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors text-slate-600 dark:text-slate-300 font-semibold no-underline';
                    a.innerHTML = `
                        <span class="flex items-center gap-2"><i data-lucide="external-link"></i> Purchase URL</span>
                        <i data-lucide="arrow-up-right" class="w-4 h-4"></i>
                    `;
                    linksContainer.appendChild(a);
                    documentationCard.style.display = 'block';
                } else {
                    documentationCard.style.display = 'none';
                }

                // Show descriptions & gallery
                motorTelemetrySection.style.display = 'none';
                generalInfoSection.style.display = 'flex';

                // Description Card
                const customParams = item.custom_parameters || {};
                const descriptionText = customParams.description || '';
                if (descriptionText) {
                    infoDescText.textContent = descriptionText;
                    infoDescCard.style.display = 'block';
                } else {
                    infoDescCard.style.display = 'none';
                }

                // Product Gallery Card
                const gallery = item.gallery_images || [];
                infoGalleryContainer.innerHTML = '';
                if (item.main_image || gallery.length > 0) {
                    const allImages = [];
                    if (item.main_image) allImages.push(item.main_image);
                    gallery.forEach(img => {
                        if (img && img !== item.main_image) allImages.push(img);
                    });

                    allImages.forEach(img => {
                        const div = document.createElement('div');
                        div.className = 'border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden aspect-square flex items-center justify-center bg-white dark:bg-slate-900 p-2';
                        div.innerHTML = `<img src="${escapeHTML(img)}" alt="Product Image" class="max-h-full max-w-full object-contain hover:scale-105 transition-transform duration-300">`;
                        infoGalleryContainer.appendChild(div);
                    });
                    infoGalleryCard.style.display = 'block';
                } else {
                    infoGalleryCard.style.display = 'none';
                }
            }

            // Custom specifications rows
            customSpecsTableBody.innerHTML = '';
            let hasCustomData = false;
            const customDataObj = item.custom_parameters || {};
            
            if (customSchema && customSchema.length > 0) {
                customSchema.forEach(field => {
                    const val = customDataObj[field.key];
                    if (val !== undefined && val !== null && val !== '') {
                        hasCustomData = true;
                        const tr = document.createElement('tr');
                        const unit = field.unit ? ` ${field.unit}` : '';
                        tr.innerHTML = `
                            <td class="py-2.5 text-slate-400 font-label-mono uppercase tracking-wider">${escapeHTML(field.label)}</td>
                            <td class="py-2.5 text-right font-bold text-[#001e40] dark:text-slate-200">${escapeHTML(val)}${unit}</td>
                        `;
                        customSpecsTableBody.appendChild(tr);
                    }
                });
            }

            // Fallback for general custom key-values not present in customSchema (excluding description/breadcrumbs/category)
            const schemaKeys = (customSchema || []).map(f => f.key);
            const excludedKeys = ['description', 'breadcrumbs', 'category', 'custom_parameters', 'gallery_images', 'main_image'];
            Object.keys(customDataObj).forEach(key => {
                if (!schemaKeys.includes(key) && !excludedKeys.includes(key)) {
                    const val = customDataObj[key];
                    if (val !== undefined && val !== null && val !== '') {
                        hasCustomData = true;
                        const tr = document.createElement('tr');
                        // Make label pretty
                        const prettyLabel = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        tr.innerHTML = `
                            <td class="py-2.5 text-slate-400 font-label-mono uppercase tracking-wider">${escapeHTML(prettyLabel)}</td>
                            <td class="py-2.5 text-right font-bold text-[#001e40] dark:text-slate-200">${escapeHTML(val)}</td>
                        `;
                        customSpecsTableBody.appendChild(tr);
                    }
                }
            });

            customParametersCard.style.display = hasCustomData ? 'block' : 'none';

            // Show UI Content
            loadingState.style.display = 'none';
            sharedContent.style.display = 'flex';
            sharedContent.classList.remove('hidden');

            lucide.createIcons();

        } catch (e) {
            console.error('Error fetching item details:', e);
            showError('An error occurred while loading specifications: ' + e.message);
        }
    }

    // ---------------------------------------------------------
    // TELEMETRY LOADER (MOTOR ONLY)
    // ---------------------------------------------------------
    async function loadMotorTelemetry(motorId) {
        const runsList = document.getElementById('telemetry-runs-list');
        runsList.innerHTML = '<div class="text-slate-400 text-sm italic p-3">Loading telemetry...</div>';

        const telemetryCard = document.getElementById('telemetry-details-card');
        const telemetryEmpty = document.getElementById('telemetry-empty-state');
        telemetryCard.style.display = 'none';
        telemetryEmpty.style.display = 'block';

        document.getElementById('telemetry-runs-count').textContent = '0';
        document.getElementById('telemetry-max-thrust').textContent = '-';
        document.getElementById('telemetry-max-eff').textContent = '-';

        destroyCharts();

        try {
            const runsRes = await fetch(`/api/guest/motor-test-runs?motor_id=eq.${motorId}&order=tested_at.desc`);
            if (!runsRes.ok) throw new Error(`Runs request failed: HTTP ${runsRes.status}`);
            const runs = await runsRes.json() || [];

            if (runs.length === 0) {
                runsList.innerHTML = '<div class="text-slate-400 text-xs italic p-3">No telemetry runs found for this motor model.</div>';
                return;
            }

            const runIds = runs.map(r => r.id);
            const pointsRes = await fetch(`/api/guest/motor-test-data-points?test_run_id=in.(${runIds.join(',')})&order=throttle.asc`);
            if (!pointsRes.ok) throw new Error(`Data points request failed: HTTP ${pointsRes.status}`);
            const dataPoints = await pointsRes.json() || [];

            const pointsByRun = {};
            dataPoints.forEach(pt => {
                if (!pointsByRun[pt.test_run_id]) {
                    pointsByRun[pt.test_run_id] = [];
                }
                pointsByRun[pt.test_run_id].push(pt);
            });

            document.getElementById('telemetry-runs-count').textContent = runs.length;
            
            let maxThrustG = 0;
            let peakEff = 0;

            dataPoints.forEach(pt => {
                const thrust = parseFloat(pt.thrust_g) || 0;
                if (thrust > maxThrustG) maxThrustG = thrust;

                const eff = parseFloat(pt.efficiency) || 0;
                if (eff > peakEff) peakEff = eff;
            });

            document.getElementById('telemetry-max-thrust').textContent = maxThrustG > 0 ? `${(maxThrustG / 1000).toFixed(2)} kgf` : '-';
            document.getElementById('telemetry-max-eff').textContent = peakEff > 0 ? `${peakEff.toFixed(2)} g/W` : '-';

            runsList.innerHTML = '';
            runs.forEach((run, index) => {
                const runPts = pointsByRun[run.id] || [];
                const dateStr = new Date(run.tested_at).toLocaleDateString();
                
                const itemDiv = document.createElement('div');
                itemDiv.className = `flex justify-between items-center p-3 border border-slate-150 dark:border-slate-800 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors ${index === 0 ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-950/10' : ''}`;
                itemDiv.dataset.id = run.id;
                
                itemDiv.innerHTML = `
                    <div>
                        <div class="font-semibold text-slate-700 dark:text-slate-350 text-xs">${escapeHTML(run.propeller_model)} prop / ${escapeHTML(run.esc_model || 'No ESC')}</div>
                        <div class="flex gap-3 text-[10px] text-slate-400 mt-0.5">
                            <span><i data-lucide="zap" class="inline w-3 h-3"></i> ${escapeHTML(run.battery_info || 'N/A')}</span>
                            <span><i data-lucide="calendar" class="inline w-3 h-3"></i> ${dateStr}</span>
                        </div>
                    </div>
                    <div class="text-right text-[10px] text-slate-500 font-medium">
                        Tester: ${escapeHTML(run.test_conducted_by || 'Unknown')}
                    </div>
                `;

                itemDiv.onclick = () => {
                    runsList.children.forEach(c => c.className = c.className.replace('border-blue-500 bg-blue-50/20 dark:bg-blue-950/10', ''));
                    itemDiv.className += ' border-blue-500 bg-blue-50/20 dark:bg-blue-950/10';
                    renderActiveTelemetry(run, runPts);
                };

                runsList.appendChild(itemDiv);
            });

            if (runs.length > 0) {
                renderActiveTelemetry(runs[0], pointsByRun[runs[0].id] || []);
            }

        } catch (e) {
            console.error('Error fetching telemetry:', e);
            runsList.innerHTML = '<div class="text-rose-500 text-xs italic p-3">Failed to load telemetry data.</div>';
        }
    }

    function renderActiveTelemetry(run, dataPoints) {
        document.getElementById('telemetry-details-card').style.display = 'block';
        document.getElementById('telemetry-empty-state').style.display = 'none';

        const dateStr = new Date(run.tested_at).toLocaleString();
        document.getElementById('telemetry-active-title').textContent = `Run Telemetry: ${run.propeller_model} Propeller / ${run.esc_model || 'No ESC'}`;
        document.getElementById('telemetry-active-meta').textContent = `Tested by ${run.test_conducted_by || 'Unknown'} on ${dateStr}. Power source: ${run.battery_info || 'Unknown'}.`;

        const rowsContainer = document.getElementById('telemetry-rows');
        rowsContainer.innerHTML = '';

        dataPoints.forEach(pt => {
            let throttlePercent = parseFloat(pt.throttle);
            if (throttlePercent <= 1.0) {
                throttlePercent = Math.round(throttlePercent * 100);
            } else {
                throttlePercent = Math.round(throttlePercent);
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="py-2 px-3 font-semibold">${throttlePercent}%</td>
                <td class="py-2 px-3">${parseFloat(pt.voltage || 0).toFixed(1)} V</td>
                <td class="py-2 px-3">${parseFloat(pt.current || 0).toFixed(1)} A</td>
                <td class="py-2 px-3">${parseFloat(pt.power || 0).toFixed(0)} W</td>
                <td class="py-2 px-3 font-semibold">${parseFloat(pt.thrust_g || 0).toFixed(0)} g</td>
                <td class="py-2 px-3">${parseFloat(pt.rpm || 0).toFixed(0)}</td>
                <td class="py-2 px-3">${parseFloat(pt.efficiency || 0).toFixed(2)}</td>
            `;
            rowsContainer.appendChild(tr);
        });

        renderChartsData(dataPoints);
    }

    function createScatterChart(canvasId, xLabel, yLabel, pts, xKey, yKey, yMin) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const chartData = pts.map(p => ({
            x: p[xKey],
            y: p[yKey]
        }));

        return new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    data: chartData,
                    backgroundColor: '#3b82f6',
                    borderColor: '#2563eb',
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    showLine: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return `X: ${ctx.parsed.x.toFixed(1)}, Y: ${ctx.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: xLabel,
                            font: { family: 'Inter', size: 9, weight: '500' },
                            color: '#64748b'
                        },
                        grid: { color: document.documentElement.classList.contains('dark') ? '#1e293b' : '#f1f5f9' },
                        ticks: { font: { family: 'Inter', size: 8 }, color: '#64748b' }
                    },
                    y: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: yLabel,
                            font: { family: 'Inter', size: 9, weight: '500' },
                            color: '#64748b'
                        },
                        grid: { color: document.documentElement.classList.contains('dark') ? '#1e293b' : '#f1f5f9' },
                        ticks: { font: { family: 'Inter', size: 8 }, color: '#64748b' },
                        min: yMin
                    }
                }
            }
        });
    }

    function renderChartsData(dataPoints) {
        destroyCharts();

        if (!dataPoints || dataPoints.length === 0) return;

        const processedPoints = dataPoints.map((pt, index) => {
            const throttleVal = parseFloat(pt.throttle) || 0;
            const throttleUs = throttleVal <= 1.0 ? 1000 + throttleVal * 1000 : 1000 + (throttleVal / 100.0) * 1000;
            const timeS = index * 5;
            const rpmVal = parseFloat(pt.rpm) || 0;
            const thrustG = parseFloat(pt.thrust_g) || 0;
            const thrustKgf = thrustG / 1000.0;
            const currentVal = parseFloat(pt.current) || 0;
            const powerElec = parseFloat(pt.power) || (parseFloat(pt.voltage) * currentVal) || 0;
            const propEff = parseFloat(pt.efficiency) || (powerElec > 0 ? thrustG / powerElec : 0);
            const systemEff = propEff * 0.85;

            return {
                time: timeS,
                throttleUs: throttleUs,
                rpm: rpmVal,
                thrustKgf: thrustKgf,
                current: currentVal,
                systemEff: systemEff
            };
        });

        // 1. Throttle vs Time
        profileCharts.throttleTime = createScatterChart(
            'chartThrottleTime', 'Time (s)', 'Throttle (μs)', 
            processedPoints, 'time', 'throttleUs', 900
        );

        // 2. Thrust vs RPM
        profileCharts.thrustRpm = createScatterChart(
            'chartThrustRpm', 'RPM', 'Thrust (kgf)', 
            processedPoints, 'rpm', 'thrustKgf', 0
        );

        // 3. Current vs RPM
        profileCharts.currentRpm = createScatterChart(
            'chartCurrentRpm', 'RPM', 'Current (A)', 
            processedPoints, 'rpm', 'current', 0
        );

        // 4. System Efficiency vs RPM
        profileCharts.systemEffRpm = createScatterChart(
            'chartSystemEffRpm', 'RPM', 'Efficiency (gf/W)', 
            processedPoints, 'rpm', 'systemEff', 0
        );
    }

    // ---------------------------------------------------------
    // BOOTSTRAP
    // ---------------------------------------------------------
    loadItem();
});
