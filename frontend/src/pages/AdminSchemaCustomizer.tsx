import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Database, PlusCircle, Trash2, Info } from 'lucide-react';

interface CustomSpecField {
  id: string;
  field_name: string;
  field_type: 'string' | 'number' | 'boolean';
  display_label: string;
}

export const AdminSchemaCustomizer: React.FC = () => {
  const [fields, setFields] = useState<CustomSpecField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<'string' | 'number' | 'boolean'>('string');

  const fetchFields = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/custom-specs');
      if (!res.ok) throw new Error('Failed to load custom specs schema');
      const data = await res.json();
      setFields(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFields();
  }, []);

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel) return;

    // Generate snake_case column key name
    const columnName = newLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').trim();
    
    try {
      const res = await fetch('/api/custom-specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          field_name: columnName, 
          display_label: newLabel, 
          field_type: newType 
        })
      });

      if (!res.ok) throw new Error('Failed to create field parameter');
      
      setNewLabel('');
      fetchFields();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteField = async (id: string, label: string) => {
    if (!window.confirm(`Delete custom column parameter "${label}"? This will delete this column value across all records.`)) return;

    try {
      const res = await fetch(`/api/custom-specs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete field');
      fetchFields();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Layout>
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[1000px] w-full mx-auto relative z-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300">
                Admin Console
              </span>
              <span className="text-xs text-slate-400 font-medium">Schema Customizer</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              Dynamic Spec Schema
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Add or remove custom specifications attributes on motor, ESC, or propeller models.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          
          {/* Column creator form */}
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-5">
            <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs mb-4 uppercase tracking-wide border-b pb-2 flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4 text-[#003366] dark:text-blue-400" /> Create Column
            </h3>
            
            <form onSubmit={handleAddField} className="flex flex-col gap-4">
              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Display Label</label>
                <input 
                  type="text" 
                  required
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="e.g. Prop Center Hub" 
                  className="w-full bg-slate-50 border rounded-lg py-2 px-3 text-xs outline-none focus:border-[#003366]"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Data Value Type</label>
                <select 
                  value={newType}
                  onChange={e => setNewType(e.target.value as any)}
                  className="w-full bg-slate-50 border rounded-lg py-2 px-3 text-xs outline-none focus:border-[#003366]"
                >
                  <option value="string">Text String</option>
                  <option value="number">Numeric Float</option>
                  <option value="boolean">Boolean Checkbox</option>
                </select>
              </div>

              <button type="submit" className="w-full bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-1 cursor-pointer">
                Create Column
              </button>
            </form>
          </div>

          {/* Columns list */}
          <div className="md:col-span-2 bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-5">
            <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs mb-4 uppercase tracking-wide border-b pb-2 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-[#003366] dark:text-blue-400" /> Active Schema Fields
            </h3>
            
            <div className="overflow-x-auto w-full">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-mono">
                    <th className="py-2.5 px-2">Display Name</th>
                    <th className="py-2.5 px-2">DB Column key</th>
                    <th className="py-2.5 px-2">Data Type</th>
                    <th className="py-2.5 px-2 text-right">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-3 px-2"><div className="h-4 w-28 bg-slate-200 rounded"></div></td>
                        <td className="py-3 px-2"><div className="h-4 w-24 bg-slate-200 rounded"></div></td>
                        <td className="py-3 px-2"><div className="h-4 w-12 bg-slate-200 rounded"></div></td>
                        <td className="py-3 px-2 text-right"><div className="h-4 w-4 bg-slate-200 rounded ml-auto"></div></td>
                      </tr>
                    ))
                  ) : fields.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        <Info className="w-6 h-6 mx-auto mb-2" />
                        No custom specification columns defined yet.
                      </td>
                    </tr>
                  ) : (
                    fields.map(f => (
                      <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10">
                        <td className="py-3 px-2 font-semibold text-[#001e40] dark:text-slate-100">{f.display_label}</td>
                        <td className="py-3 px-2 font-mono text-slate-400">{f.field_name}</td>
                        <td className="py-3 px-2 font-mono"><span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{f.field_type}</span></td>
                        <td className="py-3 px-2 text-right">
                          <button 
                            onClick={() => handleDeleteField(f.id, f.display_label)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </Layout>
  );
};
