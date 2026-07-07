import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { 
  Upload, Database, Check, AlertCircle, Info, ChevronRight, Activity, 
  Search, ArrowDown, FileSpreadsheet, Loader2, ArrowRight, ExternalLink 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface MotorSuggestion {
  id: string;
  motor_name: string;
  company: string;
  kv_rating?: number;
}

interface EscSuggestion {
  id: string;
  name: string;
  brand: string;
}

interface PropSuggestion {
  id: string;
  name: string;
  brand: string;
}

interface ParsedTelemetryRow {
  throttle: number;
  voltage: number;
  current: number;
  power: number;
  thrust_g: number;
  rpm?: number;
  efficiency?: number;
  temperature?: number;
}

export const PerformanceAnalytics: React.FC = () => {
  // 1. Motor Search & Suggestions
  const [motorQuery, setMotorQuery] = useState('');
  const [selectedMotor, setSelectedMotor] = useState<MotorSuggestion | null>(null);
  const [motorSuggestions, setMotorSuggestions] = useState<MotorSuggestion[]>([]);
  const [showMotorDropdown, setShowMotorDropdown] = useState(false);
  const motorSearchRef = useRef<HTMLDivElement>(null);

  // 2. ESC Search & Suggestions
  const [escQuery, setEscQuery] = useState('');
  const [selectedEsc, setSelectedEsc] = useState<EscSuggestion | null>(null);
  const [escSuggestions, setEscSuggestions] = useState<EscSuggestion[]>([]);
  const [showEscDropdown, setShowEscDropdown] = useState(false);
  const escSearchRef = useRef<HTMLDivElement>(null);

  // 3. Propeller Search & Suggestions
  const [propQuery, setPropQuery] = useState('');
  const [selectedProp, setSelectedProp] = useState<PropSuggestion | null>(null);
  const [propSuggestions, setPropSuggestions] = useState<PropSuggestion[]>([]);
  const [showPropDropdown, setShowPropDropdown] = useState(false);
  const propSearchRef = useRef<HTMLDivElement>(null);
  
  // Other form fields
  const [batteryInfo, setBatteryInfo] = useState('6S');
  const [ambientTemp, setAmbientTemp] = useState('25');
  const [runName, setRunName] = useState('');

  // File parsing states
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedTelemetryRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Motor suggestion fetcher
  useEffect(() => {
    const q = motorQuery.trim();
    if (!q || (selectedMotor && selectedMotor.motor_name === q)) {
      setMotorSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/guest/motors/search?q=${encodeURIComponent(q)}&limit=6`);
        if (res.ok) {
          const data = await res.json();
          const mapped = (data.motors || data.data || data || []).map((m: any) => ({
            id: m.id,
            motor_name: m.motor_name || m.name || 'Unknown Motor',
            company: m.company || m.brand || '',
            kv_rating: m.kv_rating || m.custom_parameters?.kv_rating || undefined
          }));
          setMotorSuggestions(mapped);
          setShowMotorDropdown(true);
        }
      } catch (err) {
        console.error('Error fetching motors:', err);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [motorQuery, selectedMotor]);

  // ESC suggestion fetcher
  useEffect(() => {
    const q = escQuery.trim();
    if (!q || (selectedEsc && selectedEsc.name === q)) {
      setEscSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/escs?search=${encodeURIComponent(q)}&limit=6`);
        if (res.ok) {
          const data = await res.json();
          setEscSuggestions(data || []);
          setShowEscDropdown(true);
        }
      } catch (err) {
        console.error('Error fetching ESCs:', err);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [escQuery, selectedEsc]);

  // Propeller suggestion fetcher
  useEffect(() => {
    const q = propQuery.trim();
    if (!q || (selectedProp && selectedProp.name === q)) {
      setPropSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/propellers?search=${encodeURIComponent(q)}&limit=6`);
        if (res.ok) {
          const data = await res.json();
          setPropSuggestions(data || []);
          setShowPropDropdown(true);
        }
      } catch (err) {
        console.error('Error fetching Propellers:', err);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [propQuery, selectedProp]);

  // Click outside listener for all dropdowns
  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (motorSearchRef.current && !motorSearchRef.current.contains(target)) {
        setShowMotorDropdown(false);
      }
      if (escSearchRef.current && !escSearchRef.current.contains(target)) {
        setShowEscDropdown(false);
      }
      if (propSearchRef.current && !propSearchRef.current.contains(target)) {
        setShowPropDropdown(false);
      }
    };
    document.addEventListener('click', clickOutside);
    return () => document.removeEventListener('click', clickOutside);
  }, []);

  // Drag over global window listeners
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        processFile(e.dataTransfer.files[0]);
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Main file processing logic (XLSX, XLS, CSV)
  const processFile = (file: File) => {
    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith('.csv') && !nameLower.endsWith('.xlsx') && !nameLower.endsWith('.xls')) {
      setErrorMessage('Security Error: Only spreadsheet files (.csv, .xlsx, .xls) are allowed.');
      return;
    }

    setFileName(file.name);
    setErrorMessage('');
    setSuccessMessage('');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
        if (rows.length === 0) {
          setErrorMessage('Error: spreadsheet is empty.');
          return;
        }

        // Process comments (#) and find header row
        let headerRowIndex = -1;
        let fileHeaders: string[] = [];
        const metadata: Record<string, string> = {};

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;

          const firstCell = String(row[0] || '').trim();
          if (firstCell.startsWith('#')) {
            const clean = firstCell.replace(/^#\s*/, '');
            if (clean.includes(':')) {
              const idx = clean.indexOf(':');
              const key = clean.substring(0, idx).trim().toLowerCase();
              const val = clean.substring(idx + 1).trim();
              metadata[key] = val;
            }
            continue;
          }

          let matchCount = 0;
          row.forEach(cell => {
            if (cell !== undefined && cell !== null) {
              const str = String(cell).toLowerCase().trim();
              if (str.includes('throttle') || str === '%') matchCount++;
              if (str.includes('volt') || str === 'v') matchCount++;
              if (str.includes('curr') || str.includes('amp') || str === 'a') matchCount++;
              if (str.includes('thrust') || str === 'g') matchCount++;
            }
          });

          if (matchCount >= 3) {
            headerRowIndex = r;
            fileHeaders = row.map(h => String(h || '').trim());
            break;
          }
        }

        if (headerRowIndex === -1) {
          fileHeaders = rows[0].map(h => String(h || '').trim());
          headerRowIndex = 0;
        }

        // Pre-fill metadata form optional fields if comments are present
        if (metadata['motor'] || metadata['motor model'] || metadata['model']) {
          setMotorQuery(metadata['motor'] || metadata['motor model'] || metadata['model']);
        }
        if (metadata['esc']) setEscQuery(metadata['esc']);
        if (metadata['propeller'] || metadata['prop']) setPropQuery(metadata['propeller'] || metadata['prop']);
        if (metadata['voltage'] || metadata['battery']) {
          const voltStr = metadata['voltage'] || metadata['battery'];
          if (voltStr.toLowerCase().includes('12s')) setBatteryInfo('12S');
          else if (voltStr.toLowerCase().includes('6s')) setBatteryInfo('6S');
          else setBatteryInfo(voltStr);
        }
        if (metadata['temp'] || metadata['temperature']) {
          setAmbientTemp(metadata['temp'] || metadata['temperature']);
        }

        // Match columns indexes
        let throttleCol = -1;
        let voltageCol = -1;
        let currentCol = -1;
        let thrustCol = -1;
        let rpmCol = -1;
        let tempCol = -1;
        let efficiencyCol = -1;

        fileHeaders.forEach((h, idx) => {
          const lh = h.toLowerCase();
          if (lh.includes('throttle') || lh === '%') throttleCol = idx;
          else if (lh.includes('volt') || lh === 'v') voltageCol = idx;
          else if (lh.includes('curr') || lh.includes('amp') || lh === 'a') currentCol = idx;
          else if (lh.includes('thrust') || lh === 'g') thrustCol = idx;
          else if (lh.includes('rpm') || lh === 'rpms') rpmCol = idx;
          else if (lh.includes('temp') || lh.includes('ambient')) tempCol = idx;
          else if (lh.includes('eff') || lh.includes('g/w')) efficiencyCol = idx;
        });

        if (throttleCol === -1 || thrustCol === -1) {
          setErrorMessage('Parse Error: Missing required columns. Ensure the file contains at least "throttle" and "thrust_g" columns.');
          return;
        }

        const parsedDataPoints: ParsedTelemetryRow[] = [];
        const startIdx = headerRowIndex + 1;

        for (let r = startIdx; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;
          if (String(row[0] || '').trim().startsWith('#')) continue;

          const rawThrottle = parseFloat(row[throttleCol]);
          const rawThrust = parseFloat(row[thrustCol]);

          if (isNaN(rawThrottle) || isNaN(rawThrust)) continue;

          const v = voltageCol !== -1 ? parseFloat(row[voltageCol]) || 0 : 0;
          const c = currentCol !== -1 ? parseFloat(row[currentCol]) || 0 : 0;
          
          parsedDataPoints.push({
            throttle: rawThrottle <= 1 ? rawThrottle * 100 : rawThrottle,
            voltage: v,
            current: c,
            power: v * c,
            thrust_g: rawThrust,
            rpm: rpmCol !== -1 ? parseFloat(row[rpmCol]) || undefined : undefined,
            efficiency: efficiencyCol !== -1 ? parseFloat(row[efficiencyCol]) || undefined : undefined,
            temperature: tempCol !== -1 ? parseFloat(row[tempCol]) || undefined : undefined,
          });
        }

        if (parsedDataPoints.length === 0) {
          setErrorMessage('Parse Error: No valid data rows found under header.');
          return;
        }

        parsedDataPoints.sort((a, b) => a.throttle - b.throttle);
        setParsedRows(parsedDataPoints);

        const dateStr = new Date().toLocaleDateString();
        setRunName(`Test Run - ${file.name.replace(/\.[^/.]+$/, "")} (${dateStr})`);

      } catch (err: any) {
        setErrorMessage('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleManualFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMotor) {
      alert('Error: Please select a UAV Motor from the suggestions search list.');
      return;
    }
    if (parsedRows.length === 0) {
      alert('Error: Please drag and drop or select a telemetry spreadsheet file first.');
      return;
    }
    if (!runName.trim() || !propQuery.trim()) {
      alert('Error: Run name and propeller model fields are required.');
      return;
    }

    setIsImporting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const runPayload = {
        motor_id: selectedMotor.id,
        test_run_name: runName.trim(),
        propeller_model: propQuery.trim(),
        esc_model: escQuery.trim() || null,
        battery_info: batteryInfo.trim() || null,
        ambient_temperature_c: parseFloat(ambientTemp) || null,
      };

      const runRes = await fetch('/api/motor-test-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runPayload)
      });

      if (!runRes.ok) {
        const errorData = await runRes.json();
        throw new Error(errorData.error || 'Failed to create test run record.');
      }

      const runResponseData = await runRes.json();
      const createdRun = Array.isArray(runResponseData) ? runResponseData[0] : runResponseData;
      const runId = createdRun?.id;

      if (!runId) {
        throw new Error('Could not retrieve created test run database ID.');
      }

      const pointsPayload = parsedRows.map(row => ({
        test_run_id: runId,
        throttle: row.throttle,
        voltage: row.voltage || null,
        current: row.current || null,
        power: row.power || null,
        thrust_g: row.thrust_g,
        rpm: runName.toLowerCase().includes('dynamometer') || row.rpm ? row.rpm || null : null,
        efficiency: row.efficiency || (row.power > 0 ? row.thrust_g / row.power : null),
        temperature: row.temperature || null,
        extra_data: {}
      }));

      const pointsRes = await fetch('/api/motor-test-data-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pointsPayload)
      });

      if (!pointsRes.ok) {
        const errorData = await pointsRes.json();
        throw new Error(errorData.error || 'Failed to import telemetry points.');
      }

      // Log success activity
      await fetch('/api/log-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'Telemetry Upload',
          details: `Uploaded run "${runName}" containing ${parsedRows.length} coordinates for Motor ${selectedMotor.motor_name}`
        })
      }).catch(err => console.error("Error posting log:", err));

      setSuccessMessage(`Success: Imported run with ${parsedRows.length} coordinates.`);
      
      // Reset form fields
      setFileName('');
      setParsedRows([]);
      setRunName('');
      setMotorQuery('');
      setSelectedMotor(null);
      setEscQuery('');
      setSelectedEsc(null);
      setPropQuery('');
      setSelectedProp(null);
      setBatteryInfo('6S');
      setAmbientTemp('25');

    } catch (err: any) {
      setErrorMessage(err.message || 'Verification & Ingestion failed.');
    } finally {
      setIsImporting(false);
    }
  };

  // Preview charts setup
  const chartLabels = parsedRows.map(r => `${Math.round(r.throttle)}%`);
  const thrustChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Thrust (g)',
        data: parsedRows.map(r => r.thrust_g),
        borderColor: 'rgb(37, 99, 235)',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        tension: 0.3,
        fill: true,
        yAxisID: 'yThrust',
      },
      {
        label: 'Current (A)',
        data: parsedRows.map(r => r.current),
        borderColor: 'rgb(245, 158, 11)',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        tension: 0.3,
        fill: false,
        yAxisID: 'yCurrent',
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    scales: {
      yThrust: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Thrust (g)',
          font: { weight: 'bold' as const }
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
        }
      },
      yCurrent: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Current (A)',
          font: { weight: 'bold' as const }
        },
        grid: {
          drawOnChartArea: false,
        }
      }
    }
  };

  return (
    <Layout>
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[1800px] w-full mx-auto relative z-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-[#003366]/10 dark:bg-blue-950/40 text-[#003366] dark:text-[#a7c8ff]">
                Powertrain Telemetry
              </span>
              <span className="text-xs text-slate-400 font-medium">Add Logs & Data</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              Upload Test Run
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Ingest raw dyno experiment spreadsheet data, map telemetry records, and link specifications.
            </p>
          </div>
        </header>

        {/* Global window Drag & Drop overlay */}
        {isDragging && (
          <div className="fixed inset-0 bg-[#001228]/70 backdrop-blur-md z-[9999] flex flex-col items-center justify-center text-white transition-all duration-300">
            <div className="border-4 border-dashed border-blue-500 rounded-3xl p-16 text-center max-w-xl mx-auto flex flex-col items-center gap-6 animate-pulse">
              <Upload className="w-20 h-20 text-blue-500" />
              <h3 className="text-3xl font-extrabold tracking-tight">Drop Telemetry File</h3>
              <p className="text-slate-300 text-sm">
                Drop your CSV, XLSX, or XLS test run file anywhere to parse coordinates.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row items-stretch gap-6">
          
          {/* LEFT PANEL: Ingestion Metadata Form */}
          <div className="flex-1 bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-6">
            <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-sm mb-6 border-b pb-2.5 flex items-center gap-2 uppercase font-mono tracking-wider">
              <Database className="w-4 h-4 text-blue-500" /> Run Specifications
            </h3>

            {successMessage && (
              <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center gap-3 text-emerald-800 dark:text-emerald-400 text-xs font-semibold">
                <Check className="w-5 h-5 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/60 rounded-xl flex items-center gap-3 text-rose-800 dark:text-rose-400 text-xs font-semibold">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-5">
              
              {/* Question 1: Motor search bar */}
              <div className="flex flex-col relative" ref={motorSearchRef}>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider mb-2">1. Select UAV Motor</label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={motorQuery}
                    onChange={(e) => {
                      setMotorQuery(e.target.value);
                      if (selectedMotor) setSelectedMotor(null);
                    }}
                    placeholder="Search motor model e.g. BrotherHobby 2806, F90..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-3.5 text-sm outline-none transition-all focus:border-[#003366] focus:dark:border-blue-500"
                  />
                  {selectedMotor && (
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200 font-bold uppercase tracking-wider">
                      Selected
                    </span>
                  )}
                </div>

                {/* Motor Suggestions drop list */}
                {showMotorDropdown && motorSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                    {motorSuggestions.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedMotor(m);
                          setMotorQuery(m.motor_name);
                          setShowMotorDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-850/50 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0 flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{m.motor_name}</div>
                          <div className="text-[10px] text-slate-400">{m.company}</div>
                        </div>
                        {m.kv_rating && (
                          <span className="text-[10px] font-mono font-bold bg-[#003366]/10 text-[#003366] dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded ml-2 shrink-0">
                            {m.kv_rating} KV
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Missing Motor Suggestion Banner */}
                {motorQuery.trim().length > 2 && !selectedMotor && motorSuggestions.length === 0 && (
                  <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/15 border border-amber-200/60 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-400 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Info className="w-4 h-4 shrink-0" /> Motor "{motorQuery}" not found in database.
                    </span>
                    <a 
                      href="/dashboard?add=true" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="font-bold underline hover:text-amber-900 flex items-center gap-0.5 shrink-0"
                    >
                      Add Motor <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              {/* Grid 2-cols: ESC and Propeller Searchbars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* ESC Search bar */}
                <div className="flex flex-col relative" ref={escSearchRef}>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider mb-2">2. ESC Model</label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={escQuery}
                      onChange={(e) => {
                        setEscQuery(e.target.value);
                        if (selectedEsc) setSelectedEsc(null);
                      }}
                      placeholder="Search ESC e.g. APD, Hobbywing..."
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-[#003366]"
                    />
                    {selectedEsc && (
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[9px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200 font-bold uppercase tracking-wider">
                        Selected
                      </span>
                    )}
                  </div>

                  {/* ESC suggestions dropdown */}
                  {showEscDropdown && escSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                      {escSuggestions.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => {
                            setSelectedEsc(e);
                            setEscQuery(e.name);
                            setShowEscDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-850/50 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0"
                        >
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{e.name}</div>
                          <div className="text-[10px] text-slate-400">{e.brand}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Missing ESC Banner */}
                  {escQuery.trim().length > 2 && !selectedEsc && escSuggestions.length === 0 && (
                    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/15 border border-amber-200/60 dark:border-amber-800/60 rounded-xl text-[11px] text-amber-800 dark:text-amber-400 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
                      <span className="font-semibold truncate">ESC not found.</span>
                      <a 
                        href="/escs?add=true" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="font-bold underline hover:text-amber-900 flex items-center gap-0.5 shrink-0"
                      >
                        Add ESC <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Propeller Search bar */}
                <div className="flex flex-col relative" ref={propSearchRef}>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider mb-2">3. Propeller Model</label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={propQuery}
                      onChange={(e) => {
                        setPropQuery(e.target.value);
                        if (selectedProp) setSelectedProp(null);
                      }}
                      placeholder="Search Prop e.g. APC, HQProp..."
                      required
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-[#003366]"
                    />
                    {selectedProp && (
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[9px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200 font-bold uppercase tracking-wider">
                        Selected
                      </span>
                    )}
                  </div>

                  {/* Propeller suggestions dropdown */}
                  {showPropDropdown && propSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                      {propSuggestions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProp(p);
                            setPropQuery(p.name);
                            setShowPropDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-850/50 border-b border-slate-100 dark:border-slate-800/40 last:border-b-0"
                        >
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</div>
                          <div className="text-[10px] text-slate-400">{p.brand}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Missing Propeller Banner */}
                  {propQuery.trim().length > 2 && !selectedProp && propSuggestions.length === 0 && (
                    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/15 border border-amber-200/60 dark:border-amber-800/60 rounded-xl text-[11px] text-amber-800 dark:text-amber-400 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
                      <span className="font-semibold truncate">Propeller not found.</span>
                      <a 
                        href="/propellers?add=true" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="font-bold underline hover:text-amber-900 flex items-center gap-0.5 shrink-0"
                      >
                        Add Propeller <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>

              </div>

              {/* Grid 2-cols: Voltage class and Temp */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider mb-2">4. Voltage Rating (LiPo S)</label>
                  <input
                    type="text"
                    value={batteryInfo}
                    onChange={(e) => setBatteryInfo(e.target.value)}
                    placeholder="e.g. 6S, 12S, 22.2V..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-3.5 text-sm outline-none focus:border-[#003366]"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider mb-2">5. Temperature (&deg;C)</label>
                  <input
                    type="number"
                    value={ambientTemp}
                    onChange={(e) => setAmbientTemp(e.target.value)}
                    placeholder="e.g. 25"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-3.5 text-sm outline-none focus:border-[#003366]"
                  />
                </div>
              </div>

              {/* Drop area display */}
              <div className="flex flex-col">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider mb-2">6. Ingest Telemetry File (.csv, .xlsx)</label>
                <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50/50 dark:bg-slate-950/20 text-center flex flex-col items-center gap-3 relative overflow-hidden">
                  <Upload className="w-8 h-8 text-slate-400" />
                  {fileName ? (
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-bold text-[#003366] dark:text-blue-400 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4" /> {fileName}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1">{parsedRows.length} coordinates detected.</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-355">
                        Drag & Drop or{' '}
                        <label className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                          Browse File
                          <input
                            type="file"
                            onChange={handleManualFileSelect}
                            accept=".csv,.xlsx,.xls"
                            className="hidden"
                          />
                        </label>
                      </div>
                      <span className="text-[10px] text-slate-400">File comments (# key: val) can optionally pre-fill form fields.</span>
                    </>
                  )}
                  <a
                    href="/thrustvault_runs_template.csv"
                    download
                    className="text-[11px] font-bold text-[#003366] dark:text-blue-400 hover:underline mt-2 flex items-center gap-1"
                  >
                    <ArrowDown className="w-3.5 h-3.5" /> Download Ingestion Template CSV
                  </a>
                </div>
              </div>

              {/* Test Run Name */}
              {parsedRows.length > 0 && (
                <div className="flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider mb-2">Test Run Name</label>
                  <input
                    type="text"
                    value={runName}
                    onChange={(e) => setRunName(e.target.value)}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-3.5 text-sm outline-none focus:border-[#003366]"
                  />
                </div>
              )}

              {/* Action submit button */}
              <button
                type="submit"
                disabled={isImporting || parsedRows.length === 0}
                className="w-full bg-[#003366] hover:bg-[#002244] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Ingesting Datasets...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Save Telemetry Record
                  </>
                )}
              </button>

            </form>
          </div>

          {/* RIGHT PANEL: Dynamic Graphs Preview OR Step-by-Step Instructions */}
          <div className="w-full lg:w-[48%] shrink-0 flex flex-col gap-6">
            
            {parsedRows.length > 0 ? (
              /* Visual Telemetry Chart Preview */
              <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-5 flex flex-col justify-between animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs uppercase font-mono tracking-wider flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-500" /> Parsed Telemetry Preview
                  </h3>
                  <span className="text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded">
                    Thrust vs Throttle Curve
                  </span>
                </div>
                <div className="h-[280px] relative w-full">
                  <Line data={thrustChartData} options={chartOptions} />
                </div>
              </div>
            ) : (
              /* Telemetry Upload Guide Instructions */
              <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-6 flex flex-col flex-1">
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs mb-6 border-b pb-2.5 flex items-center gap-2 uppercase font-mono tracking-wider">
                  <Info className="w-4 h-4 text-blue-500" /> Telemetry Ingestion Guide
                </h3>

                <div className="space-y-6 flex-1 flex flex-col justify-center">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">1</div>
                    <div className="flex flex-col">
                      <strong className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider font-mono">Select UAV Hardware Specs</strong>
                      <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Use the search dropdowns to locate the specific Motor, ESC, and Propeller.
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">2</div>
                    <div className="flex flex-col">
                      <strong className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider font-mono">Drag & Drop Telemetry Sheet</strong>
                      <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Drag your `.csv`, `.xlsx`, or `.xls` telemetry files anywhere over the screen.
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">3</div>
                    <div className="flex flex-col">
                      <strong className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider font-mono">Automatic Metadata Pre-fill</strong>
                      <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        If files contain optional comments matching `# key: value` format, fields are pre-filled automatically.
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">4</div>
                    <div className="flex flex-col">
                      <strong className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider font-mono">Visual Review & Save</strong>
                      <span className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Inspect the mapped throttle curves, click "Save Telemetry Record", and query data in Dynamometer profiles.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>

      </main>
    </Layout>
  );
};
