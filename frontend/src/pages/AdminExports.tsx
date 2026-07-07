import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Download, Sliders, Filter, FileText, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Category {
  id: string;
  name: string;
}

export const AdminExports: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
  
  const [isExporting, setIsExporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchFilters = async () => {
    try {
      const res = await fetch('/api/init-data');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        setBrands(data.brands || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchFilters();
  }, []);

  const triggerExport = async () => {
    setIsExporting(true);
    setSuccessMsg('');
    try {
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'all') {
        params.append('category_id', `eq.${selectedCategory}`);
      }
      if (selectedBrand && selectedBrand !== 'all') {
        params.append('company', `eq.${selectedBrand}`);
      }
      
      const res = await fetch(`/api/motors?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch data to export');
      const motorsData = await res.json();

      if (motorsData.length === 0) {
        alert('No motor entries matched the selected export filters.');
        setIsExporting(false);
        return;
      }

      // Flatten nested custom parameters for clean sheet columns
      const flattendData = motorsData.map((m: any) => {
        const custom = m.custom_parameters || {};
        return {
          id: m.id,
          motor_name: m.motor_name,
          company: m.company,
          max_thrust: m.max_thrust,
          recommended_esc: m.recommended_esc,
          recommended_propeller: m.recommended_propeller,
          kv_rating: m.kv_rating,
          operating_voltage: m.operating_voltage,
          sku: custom.sku || '',
          stator_size: custom.stator_size || '',
          poles: custom.poles || '',
          winding_type: custom.winding_type || '',
          link_motor: m.link_motor || '',
          link_esc: m.link_esc || '',
          link_propeller: m.link_propeller || '',
          created_at: m.created_at
        };
      });

      const ws = XLSX.utils.json_to_sheet(flattendData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Motors Catalog");
      
      const filename = `ThrustVault_Motors_Export_${new Date().toISOString().slice(0, 10)}`;
      if (exportFormat === 'xlsx') {
        XLSX.writeFile(wb, `${filename}.xlsx`);
      } else {
        XLSX.writeFile(wb, `${filename}.csv`, { bookType: 'csv' });
      }

      setSuccessMsg(`Successfully exported ${motorsData.length} records to ${exportFormat.toUpperCase()}!`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Layout>
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[800px] w-full mx-auto relative z-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300">
                Admin Console
              </span>
              <span className="text-xs text-slate-400 font-medium">Data Export</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              Export Motor Data
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Select categories, brands, and export motor specifications catalog tables.
            </p>
          </div>
        </header>

        <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-6 flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Category Filter */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 font-mono flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5" /> Thrust Class Category
              </label>
              <select 
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="bg-slate-50 border rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none"
              >
                <option value="all">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Brand Filter */}
            <div className="flex flex-col">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 font-mono flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Manufacturer Brand
              </label>
              <select 
                value={selectedBrand}
                onChange={e => setSelectedBrand(e.target.value)}
                className="bg-slate-50 border rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none"
              >
                <option value="all">All Brands</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

          </div>

          {/* Export format */}
          <div className="flex flex-col">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 font-mono flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> Export File Format
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input 
                  type="radio" 
                  name="format" 
                  checked={exportFormat === 'xlsx'} 
                  onChange={() => setExportFormat('xlsx')}
                  className="text-[#003366] focus:ring-[#003366]/10" 
                />
                Microsoft Excel (.xlsx)
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input 
                  type="radio" 
                  name="format" 
                  checked={exportFormat === 'csv'} 
                  onChange={() => setExportFormat('csv')}
                  className="text-[#003366] focus:ring-[#003366]/10" 
                />
                Comma Separated Values (.csv)
              </label>
            </div>
          </div>

          <button 
            onClick={triggerExport}
            disabled={isExporting}
            className="bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Exporting...' : 'Export Dataset Now'}
          </button>

          {successMsg && (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-355 text-xs font-semibold p-3.5 rounded-xl">
              <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>
      </main>
    </Layout>
  );
};
