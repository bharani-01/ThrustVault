import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Upload, Database, Check, AlertCircle, Info, ChevronRight, Activity } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Category {
  id: string;
  name: string;
}

export const AdminImports: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  
  // Uploader wizard states
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[][]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({
    motor_name: '',
    company: '',
    max_thrust: '',
    operating_voltage: '',
    recommended_esc: '',
    recommended_propeller: '',
  });

  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState({ success: 0, failed: 0 });

  useEffect(() => {
    // Load categories for selector
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/categories');
        if (res.ok) {
          const data = await res.json();
          const filtered = data.filter((c: any) => c.name !== 'No Thrust');
          setCategories(filtered);
          if (filtered.length > 0) setSelectedCategoryId(filtered[0].id);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchCategories();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Read raw data rows including headers
        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
        if (rows.length === 0) {
          alert('Empty spreadsheet file');
          return;
        }

        // Identify header row (typically row 0 containing strings)
        const fileHeaders = rows[0].map(h => String(h || '').trim());
        setHeaders(fileHeaders);
        setRawData(rows.slice(1));
        
        // Auto-match headers based on matching keywords
        const autoMatch: Record<string, string> = {
          motor_name: '',
          company: '',
          max_thrust: '',
          operating_voltage: '',
          recommended_esc: '',
          recommended_propeller: '',
        };

        fileHeaders.forEach(h => {
          const lh = h.toLowerCase();
          if (lh.includes('model') || lh === 'motor' || lh.includes('name')) autoMatch.motor_name = h;
          if (lh.includes('brand') || lh.includes('company') || lh.includes('manufacturer')) autoMatch.company = h;
          if (lh.includes('thrust') || lh === 'force') autoMatch.max_thrust = h;
          if (lh.includes('volt') || lh === 'cells') autoMatch.operating_voltage = h;
          if (lh.includes('esc') || lh.includes('speed control')) autoMatch.recommended_esc = h;
          if (lh.includes('propeller') || lh === 'prop') autoMatch.recommended_propeller = h;
        });

        setMappings(autoMatch);
        setStep(2);
      } catch (err: any) {
        alert('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleMappingChange = (field: string, header: string) => {
    setMappings(prev => ({ ...prev, [field]: header }));
  };

  // Preview mapped rows
  useEffect(() => {
    if (step === 2 && rawData.length > 0) {
      const rows = rawData.slice(0, 5).map(row => {
        const mappedRow: Record<string, any> = {};
        Object.entries(mappings).forEach(([field, header]) => {
          if (header) {
            const idx = headers.indexOf(header);
            mappedRow[field] = row[idx] || '';
          } else {
            mappedRow[field] = '';
          }
        });
        return mappedRow;
      });
      setPreviewRows(rows);
    }
  }, [step, mappings, rawData, headers]);

  const triggerImport = async () => {
    if (!mappings.motor_name || !mappings.company || !mappings.max_thrust) {
      alert('Model Name, Brand, and Max Thrust columns must be mapped.');
      return;
    }

    setIsImporting(true);
    setImportStatus({ success: 0, failed: 0 });
    setStep(3);

    let successCount = 0;
    let failedCount = 0;

    for (const row of rawData) {
      const payload: Record<string, any> = {
        category_id: selectedCategoryId,
        custom_parameters: {}
      };

      let hasRequiredData = true;

      Object.entries(mappings).forEach(([field, header]) => {
        if (header) {
          const idx = headers.indexOf(header);
          const cellVal = row[idx];
          if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
            payload[field] = String(cellVal).trim();
          } else if (['motor_name', 'company', 'max_thrust'].includes(field)) {
            hasRequiredData = false;
          }
        } else if (['motor_name', 'company', 'max_thrust'].includes(field)) {
          hasRequiredData = false;
        }
      });

      if (!hasRequiredData) continue;

      try {
        const res = await fetch('/api/motors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (res.ok) successCount++;
        else failedCount++;
      } catch (e) {
        failedCount++;
      }

      setImportStatus({ success: successCount, failed: failedCount });
    }

    setIsImporting(false);
  };

  return (
    <Layout>
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[900px] w-full mx-auto relative z-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300">
                Admin Console
              </span>
              <span className="text-xs text-slate-400 font-medium">Data Import</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              Bulk CSV Imports
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Load motor specifications sheets, match columns, and upload in batches.
            </p>
          </div>
        </header>

        {/* Import Wizard Navigation */}
        <div className="flex items-center justify-between mb-8 max-w-md mx-auto w-full text-xs font-bold text-slate-400 dark:text-slate-500 font-mono uppercase tracking-wider">
          <span className={step === 1 ? 'text-[#003366] dark:text-blue-400 border-b-2 border-[#003366]' : ''}>1. File Select</span>
          <ChevronRight className="w-4 h-4" />
          <span className={step === 2 ? 'text-[#003366] dark:text-blue-400 border-b-2 border-[#003366]' : ''}>2. Column Mapping</span>
          <ChevronRight className="w-4 h-4" />
          <span className={step === 3 ? 'text-[#003366] dark:text-blue-400 border-b-2 border-[#003366]' : ''}>3. Synchronization</span>
        </div>

        {/* STEP 1: FILE SELECT */}
        {step === 1 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-4">
            <Upload className="w-12 h-12 text-slate-355" />
            <div className="flex flex-col gap-1">
              <h3 className="font-extrabold text-sm text-[#001e40] dark:text-slate-100 uppercase tracking-wide">Select Spreadsheet File</h3>
              <p className="text-xs text-slate-400 max-w-xs">Supports Comma Separated Values (.csv) or Microsoft Excel (.xlsx) file extensions.</p>
            </div>
            <label className="bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold py-2.5 px-5 rounded-xl cursor-pointer shadow-sm transition-colors">
              Browse Files
              <input type="file" onChange={handleFileChange} accept=".csv, .xlsx" className="hidden" />
            </label>
          </div>
        )}

        {/* STEP 2: COLUMN MAPPING */}
        {step === 2 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Mapping configuration */}
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <h3 className="font-extrabold text-xs uppercase font-mono tracking-wider border-b pb-2 flex items-center gap-1"><Database className="w-4 h-4 text-[#003366]" /> Columns Match</h3>
              
              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Target Class Level</label>
                <select value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)} className="bg-slate-50 border rounded-lg py-2 px-2 text-xs outline-none">
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {Object.keys(mappings).map(field => (
                <div key={field} className="flex flex-col">
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">{field.replace(/_/g, ' ')} *</label>
                  <select 
                    value={mappings[field]} 
                    onChange={e => handleMappingChange(field, e.target.value)}
                    className="bg-slate-50 border rounded-lg py-2 px-2 text-xs outline-none"
                  >
                    <option value="">-- Ignore Field --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}

              <button onClick={triggerImport} className="w-full bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold py-2.5 px-4 rounded-xl cursor-pointer transition-colors mt-2">
                Start Bulk Upload
              </button>
            </div>

            {/* Preview mapping grid */}
            <div className="md:col-span-2 bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="font-extrabold text-xs uppercase font-mono tracking-wider border-b pb-2 flex items-center gap-1"><Info className="w-4 h-4 text-[#003366]" /> Import Preview (First 5 Rows)</h3>
                
                <div className="overflow-x-auto w-full mt-4">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-mono">
                        <th className="py-2 px-2">Model</th>
                        <th className="py-2 px-2">Brand</th>
                        <th className="py-2 px-2">Thrust</th>
                        <th className="py-2 px-2">Voltage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                      {previewRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-2 font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[100px]">{row.motor_name || '—'}</td>
                          <td className="py-2 px-2 font-bold text-slate-500">{row.company || '—'}</td>
                          <td className="py-2 px-2 font-bold">{row.max_thrust || '—'}</td>
                          <td className="py-2 px-2 font-mono text-slate-400">{row.operating_voltage || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: SYNCHRONIZATION */}
        {step === 3 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-4">
            {isImporting ? (
              <>
                <Activity className="w-10 h-10 text-blue-500 animate-spin" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-700 dark:text-slate-355 animate-pulse">Syncing specifications data with database...</h3>
                <div className="text-xs text-slate-400 font-mono">
                  Synced: {importStatus.success} successfully | Errors: {importStatus.failed}
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center mx-auto shadow-sm">
                  <Check className="w-8 h-8 text-emerald-500" />
                </div>
                <h2 className="text-lg font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight uppercase">Import Completed</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed max-w-sm">
                  The uploader successfully committed {importStatus.success} specifications entries. ({importStatus.failed} rows ignored or failed due to conflicts).
                </p>
                <button onClick={() => setStep(1)} className="mt-2 bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold py-2.5 px-5 rounded-xl cursor-pointer">
                  Import Another File
                </button>
              </>
            )}
          </div>
        )}

      </main>
    </Layout>
  );
};
