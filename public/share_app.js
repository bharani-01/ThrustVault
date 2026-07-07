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

    function getValueCaseInsensitive(obj, keys) {
        if (!obj) return undefined;
        const normalizedObj = {};
        for (const [k, v] of Object.entries(obj)) {
            normalizedObj[k.toLowerCase().replace(/[\s_-]+/g, '')] = v;
        }
        for (const key of keys) {
            const cleanKey = key.toLowerCase().replace(/[\s_-]+/g, '');
            if (normalizedObj[cleanKey] !== undefined) {
                return normalizedObj[cleanKey];
            }
        }
        return undefined;
    }

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
            if (val >= 3 && val <= 65) return val;
        }
        return 0;
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

            const customDataObj = item.custom_parameters || {};

            // Populate Specs Table
            specsTableBody.innerHTML = '';
            
            const techCard = document.getElementById('technical-specifications-card');
            const techTableBody = document.getElementById('tech-specs-table-body');
            const techTitleText = document.getElementById('tech-specs-title-text');
            const techTitleIcon = document.querySelector('#tech-specs-title i');
            
            let techSpecConfigs = [];
            let standardKeys = new Set();

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

                const getVal = (keys) => getValueCaseInsensitive(customDataObj, keys);
                techSpecConfigs = [
                    { label: 'SKU', val: getVal(['sku']), unit: '' },
                    { label: 'KV Rating', val: getVal(['kv_rating', 'kv']), unit: '' },
                    { label: 'Stator Size', val: getVal(['stator_size']), unit: '' },
                    { label: 'No. of Poles', val: getVal(['num_poles', 'no_of_poles', 'poles']), unit: '' },
                    { label: 'Winding Type', val: getVal(['winding_type']), unit: '' },
                    { label: 'Operating Voltage', val: getVal(['operating_voltage', 'voltage']), unit: '' },
                    { label: 'Motor Type', val: getVal(['motor_type']), unit: '' },
                    { label: 'Intended Use', val: getVal(['intended_use']), unit: '' },
                    { label: 'Bearing Type', val: getVal(['bearing_type']), unit: '' },
                    { label: 'Weight', val: getVal(['weight_g', 'weight', 'motor_weight']), unit: ' g' },
                    { label: 'Motor OD', val: getVal(['motor_diameter_od', 'motor_od_mm', 'motor_od']), unit: ' mm' },
                    { label: 'Motor Height', val: getVal(['motor_height_mm', 'motor_height']), unit: ' mm' },
                    { label: 'Shaft Diameter', val: getVal(['shaft_diameter_mm', 'shaft_diameter']), unit: ' mm' },
                    { label: 'Mount Pattern', val: getVal(['motor_holes_mount_diameter', 'mount_pattern_mm', 'mount_pattern']), unit: '' },
                    { label: 'Screw Type', val: getVal(['screw_type']), unit: '' },
                    { label: 'Wire Gauge', val: getVal(['wire_gauge', 'wire_gauge_awg', 'wire', 'awg']), unit: '' },
                    { label: 'IP Rating', val: getVal(['ip_rating']), unit: '' },
                    { label: 'Max Power', val: getVal(['max_power_w', 'max_power']), unit: ' W' },
                    { label: 'Max Continuous Current', val: getVal(['max_continuous_current_a', 'max_continuous_current']), unit: ' A' },
                    { label: 'Max Burst Current', val: getVal(['max_burst_current_a', 'max_burst_current']), unit: ' A' },
                    { label: 'No-Load Current', val: getVal(['no_load_current_a', 'no_load_current']), unit: ' A' },
                    { label: 'Internal Resistance', val: getVal(['internal_resistance_mohm', 'internal_resistance']), unit: ' mΩ' },
                    { label: 'Compat. ESC Current', val: getVal(['compatible_esc_current', 'compat_esc_current_a', 'compat_esc_current']), unit: '' },
                    { label: 'Compat. Prop Size Range', val: getVal(['compatible_prop_size', 'compat_prop_size_range']), unit: '' },
                    { label: 'Price', val: getVal(['price']), unit: '' }
                ];
                standardKeys = new Set(['sku', 'kv_rating', 'kv', 'stator_size', 'num_poles', 'no_of_poles', 'poles', 'winding_type', 'operating_voltage', 'voltage', 'motor_type', 'intended_use', 'bearing_type', 'weight_g', 'weight', 'motor_weight', 'motor_diameter_od', 'motor_od_mm', 'motor_od', 'motor_height_mm', 'motor_height', 'shaft_diameter_mm', 'shaft_diameter', 'motor_holes_mount_diameter', 'mount_pattern_mm', 'mount_pattern', 'screw_type', 'wire_gauge', 'wire_gauge_awg', 'wire', 'awg', 'ip_rating', 'max_power_w', 'max_power', 'max_continuous_current_a', 'max_continuous_current', 'max_burst_current_a', 'max_burst_current', 'no_load_current_a', 'no_load_current', 'internal_resistance_mohm', 'internal_resistance', 'compatible_esc_current', 'compat_esc_current_a', 'compat_esc_current', 'compatible_prop_size', 'compat_prop_size_range', 'price']);

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

                const getVal = (keys) => getValueCaseInsensitive(customDataObj, keys);
                if (type === 'esc') {
                    techSpecConfigs = [
                        { label: 'Continuous Current', val: parseCurrent(item) ? parseCurrent(item) : getVal(['continuous_current_a', 'continuous_current']), unit: ' A' },
                        { label: 'Burst Current', val: getVal(['burst_current_a', 'burst_current', 'max_current_burst']), unit: ' A' },
                        { label: 'Voltage Range', val: parseVoltage(item) ? parseVoltage(item) + ' S' : getVal(['voltage_range', 'input_voltage', 'voltage']), unit: '' },
                        { label: 'BEC Output', val: getVal(['bec', 'bec_output']), unit: '' },
                        { label: 'Resistance', val: getVal(['resistance', 'resistance_mohm']), unit: ' mΩ' },
                        { label: 'Firmware', val: getVal(['firmware']), unit: '' },
                        { label: 'Protocol', val: getVal(['protocol']), unit: '' },
                        { label: 'Telemetry', val: (() => { const v = getVal(['telemetry']); return v === true || v === 'true' ? 'Yes' : v === false || v === 'false' ? 'No' : v; })(), unit: '' },
                        { label: 'Bidirectional DSHOT', val: (() => { const v = getVal(['bidir', 'bidirectional_dshot']); return v === true || v === 'true' ? 'Yes' : v === false || v === 'false' ? 'No' : v; })(), unit: '' },
                        { label: 'Cooling', val: getVal(['cooling']), unit: '' },
                        { label: 'Connector', val: getVal(['connector', 'connector_type']), unit: '' },
                        { label: 'Wire Gauge', val: getVal(['wire_gauge', 'wire', 'awg']), unit: '' },
                        { label: 'Recommended Use', val: getVal(['recommended_for', 'use', 'application']), unit: '' },
                        { label: 'Weight', val: getVal(['weight', 'weight_g']), unit: ' g' },
                        { label: 'PCB Size', val: getVal(['pcb_size', 'size']), unit: '' }
                    ];
                    standardKeys = new Set(['continuous_current_a', 'continuous_current', 'current_a', 'current', 'max_current', 'max_current_a', 'amperage', 'burst_current_a', 'burst_current', 'max_current_burst', 'voltage_range', 'input_voltage', 'voltage', 'bec', 'bec_output', 'resistance', 'resistance_mohm', 'firmware', 'protocol', 'telemetry', 'bidir', 'bidirectional_dshot', 'cooling', 'connector', 'connector_type', 'wire_gauge', 'wire', 'awg', 'recommended_for', 'use', 'application', 'weight', 'weight_g', 'pcb_size', 'size']);
                } else {
                    techSpecConfigs = [
                        { label: 'Diameter', val: parseDiameter(item) ? parseDiameter(item) : getVal(['diameter', 'diameter_in', 'diameter_inch', 'propeller_diameter']), unit: ' in' },
                        { label: 'Pitch', val: getVal(['pitch', 'pitch_in', 'pitch_inch']), unit: ' in' },
                        { label: 'Blade Count', val: getVal(['blades', 'blade_count']), unit: '' },
                        { label: 'Shaft Bore', val: getVal(['shaft_bore', 'shaft_bore_mm']), unit: ' mm' },
                        { label: 'Chord Width', val: getVal(['chord', 'chord_width', 'blade_chord']), unit: ' mm' },
                        { label: 'Hub Diameter', val: getVal(['hub', 'hub_diameter']), unit: ' mm' },
                        { label: 'Folding Prop', val: (() => { const v = getVal(['folding', 'folding_prop']); return v === true || v === 'true' ? 'Yes' : v === false || v === 'false' ? 'No' : v; })(), unit: '' },
                        { label: 'Material', val: getVal(['material']), unit: '' },
                        { label: 'Stiffness', val: getVal(['stiffness', 'stiffness_rating']), unit: '' },
                        { label: 'Finish', val: getVal(['finish']), unit: '' },
                        { label: 'Color Options', val: getVal(['colors', 'color_options']), unit: '' },
                        { label: 'Max RPM', val: getVal(['max_rpm', 'rpm']), unit: '' },
                        { label: 'Max Thrust', val: getVal(['max_thrust_g', 'thrust']), unit: ' g' },
                        { label: 'Hover Efficiency', val: getVal(['efficiency', 'hover_efficiency']), unit: ' g/W' },
                        { label: 'Noise Level', val: getVal(['noise', 'noise_level']), unit: ' dB' },
                        { label: 'Weight per Blade', val: getVal(['weight_blade', 'weight_per_blade']), unit: ' g' },
                        { label: 'Total Weight', val: getVal(['weight_total', 'total_weight']), unit: ' g' },
                        { label: 'Balance Quality', val: getVal(['balance', 'balance_quality']), unit: '' },
                        { label: 'Recommended KV', val: getVal(['kv', 'recommended_kv']), unit: '' },
                        { label: 'Motor Size Range', val: getVal(['motor_size', 'recommended_motor_size']), unit: '' },
                        { label: 'Recommended Use', val: getVal(['recommended_for', 'use']), unit: '' },
                        { label: 'Adapter Included', val: (() => { const v = getVal(['prop_adapter', 'adapter_included']); return v === true || v === 'true' ? 'Yes' : v === false || v === 'false' ? 'No' : v; })(), unit: '' }
                    ];
                    standardKeys = new Set(['diameter', 'diameter_in', 'diameter_inch', 'propeller_diameter', 'size', 'diameter_mm', 'pitch', 'pitch_in', 'pitch_inch', 'blades', 'blade_count', 'shaft_bore', 'shaft_bore_mm', 'chord', 'chord_width', 'blade_chord', 'hub', 'hub_diameter', 'folding', 'folding_prop', 'material', 'stiffness', 'stiffness_rating', 'finish', 'colors', 'color_options', 'max_rpm', 'rpm', 'max_thrust_g', 'thrust', 'efficiency', 'hover_efficiency', 'noise', 'noise_level', 'weight_blade', 'weight_per_blade', 'weight_total', 'total_weight', 'balance', 'balance_quality', 'kv', 'recommended_kv', 'motor_size', 'recommended_motor_size', 'recommended_for', 'use', 'prop_adapter', 'adapter_included']);
                }
            }

            // Render Technical Specifications
            if (techCard && techTableBody) {
                techTableBody.innerHTML = '';
                let hasTechSpecs = false;
                techSpecConfigs.forEach(cfg => {
                    if (cfg.val !== null && cfg.val !== undefined && cfg.val !== '') {
                        hasTechSpecs = true;
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td class="py-2.5 text-slate-400 font-label-mono uppercase tracking-wider">${escapeHTML(cfg.label)}</td>
                            <td class="py-2.5 text-right font-bold text-[#001e40] dark:text-slate-200">${escapeHTML(String(cfg.val))}${cfg.unit}</td>
                        `;
                        techTableBody.appendChild(tr);
                    }
                });
                techCard.style.display = hasTechSpecs ? 'block' : 'none';
                
                if (techTitleText && techTitleIcon) {
                    if (type === 'motor') {
                        techTitleText.textContent = 'Motor Specifications';
                        techTitleIcon.className = '';
                        techTitleIcon.setAttribute('data-lucide', 'cpu');
                    } else if (type === 'esc') {
                        techTitleText.textContent = 'ESC Specifications';
                        techTitleIcon.className = '';
                        techTitleIcon.setAttribute('data-lucide', 'zap');
                    } else {
                        techTitleText.textContent = 'Propeller Specifications';
                        techTitleIcon.className = '';
                        techTitleIcon.setAttribute('data-lucide', 'wind');
                    }
                }
            }

            // Custom specifications rows
            customSpecsTableBody.innerHTML = '';
            let hasCustomData = false;
            
            if (customSchema && customSchema.length > 0) {
                customSchema.forEach(field => {
                    if (standardKeys.has(field.key)) return; // Skip standard keys to avoid duplicates
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
                const cleanKey = key.toLowerCase().replace(/[\s_-]+/g, '');
                if (!schemaKeys.includes(key) && !excludedKeys.includes(key) && !standardKeys.has(key) && !standardKeys.has(cleanKey)) {
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
