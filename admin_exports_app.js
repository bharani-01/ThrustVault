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
    document.getElementById('session-email').textContent = email;
    const avatarInitials = document.getElementById('user-avatar-initials');
    if (avatarInitials && email) {
        avatarInitials.textContent = email.charAt(0).toUpperCase();
    }

    lucide.createIcons();

    let state = {
        motors: [],
        categories: [],
        customSchema: [],
        testRuns: []
    };

    let supabase = null;

    // DOM Elements
    const elements = {
        catFilterSelect: document.getElementById('cat-filter-select'),
        catColumnsSelector: document.getElementById('cat-columns-selector'),
        catalogExportForm: document.getElementById('catalog-export-form'),
        catExportFormat: document.getElementById('cat-export-format'),

        telemetryMotorSelect: document.getElementById('telemetry-motor-select'),
        telemetryColumnsSelector: document.getElementById('telemetry-columns-selector'),
        telemetryExportForm: document.getElementById('telemetry-export-form'),
        telemetryExportFormat: document.getElementById('telemetry-export-format'),

        sidebarMotorsCount: document.getElementById('sidebar-motors-count'),
        sidebarTestRunsCount: document.getElementById('sidebar-test-runs-count'),
        btnLogout: document.getElementById('btn-logout')
    };

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
            elements.sidebarMotorsCount.textContent = state.motors.length;

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

            // Test Runs
            const { data: testRuns, error: runError } = await supabase
                .from('motor_test_runs')
                .select('*')
                .order('tested_at', { ascending: false });
            if (runError) throw runError;
            state.testRuns = testRuns || [];
            elements.sidebarTestRunsCount.textContent = state.testRuns.length;

            elements.telemetryMotorSelect.innerHTML = '<option value="all">All Telemetry Datasets (Full Export)</option>' +
                state.testRuns.map(run => {
                    const motor = state.motors.find(m => m.id === run.motor_id);
                    const motorName = motor ? motor.motor_name : 'Unknown Motor';
                    const dateStr = new Date(run.tested_at).toLocaleDateString();
                    return `<option value="${run.id}">${motorName} - Prop: ${run.propeller_model} (${dateStr})</option>`;
                }).join('');

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

        const catFilter = elements.catFilterSelect.value;
        let exportMotors = state.motors;
        if (catFilter !== 'all') {
            exportMotors = exportMotors.filter(m => m.category_id === catFilter);
        }

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

        logUserActivity(session.email, session.role, 'Exporter Operation', `Exported ${exportMotors.length} catalog items as ${format.toUpperCase()}`);
    };

    // Telemetry Exporter
    elements.telemetryExportForm.onsubmit = async (e) => {
        e.preventDefault();
        const runId = elements.telemetryMotorSelect.value;
        const format = elements.telemetryExportFormat.value;

        try {
            let dataPoints = [];
            if (runId === 'all') {
                const { data, error } = await supabase
                    .from('motor_test_data_points')
                    .select('*, motor_test_runs(*)');
                if (error) throw error;
                dataPoints = data || [];
            } else {
                const { data, error } = await supabase
                    .from('motor_test_data_points')
                    .select('*, motor_test_runs(*)')
                    .eq('test_run_id', runId);
                if (error) throw error;
                dataPoints = data || [];
            }

            if (dataPoints.length === 0) {
                alert("No telemetry data points found for the selected run.");
                return;
            }

            // Helper functions
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
                                ? (dp.throttle > 1 ? dp.throttle / 100 : dp.throttle) 
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
                                ? (dp.throttle > 1 ? dp.throttle / 100 : dp.throttle) 
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
                                        ? (dp.throttle > 1 ? dp.throttle / 100 : dp.throttle) 
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
                                ? (dp.throttle > 1 ? dp.throttle / 100 : dp.throttle) 
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
                                ? (dp.throttle > 1 ? dp.throttle / 100 : dp.throttle) 
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
                downloadFile(html, 'text/html;charset=utf-8;', 'html', 'telemetry_data');
            }

            logUserActivity(session.email, session.role, 'Exporter Operation', `Exported telemetry readings as ${format.toUpperCase()}`);
        } catch (err) {
            console.error("Telemetry export failed:", err);
            alert("Export failed: " + err.message);
        }
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
                window.location.href = 'index.html';
                return;
            }

            // Sync user details
            const userEmail = sbSession.user.email;
            document.getElementById('session-email').textContent = userEmail;
            const avatarInit = document.getElementById('user-avatar-initials');
            if (avatarInit && userEmail) {
                avatarInit.textContent = userEmail.charAt(0).toUpperCase();
            }

            await loadMetadata();
        } catch (e) {
            console.error("Initialization failed", e);
            window.location.href = 'index.html';
        }
    }

    init();
});
