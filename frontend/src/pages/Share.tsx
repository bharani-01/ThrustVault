import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Shield, Info, Activity, Sun, Moon, Link as LinkIcon, Cpu } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface SharedItem {
  name: string;
  brand: string;
  type: string;
  url?: string;
  sku?: string;
  custom_parameters?: Record<string, any>;
  continuous_current?: number;
  peak_current?: number;
  input_voltage?: string;
  kv_rating?: number;
  max_thrust?: string;
  operating_voltage?: string;
  diameter?: number;
  pitch?: number;
  material?: string;
  motor_name?: string;
  company?: string;
}

export const Share: React.FC = () => {
  const { type, name } = useParams<{ type: string; name: string }>();
  const { theme, toggleTheme } = useTheme();
  
  const [item, setItem] = useState<SharedItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSharedItem = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/guest/share/${type}/${encodeURIComponent(name || '')}`);
      if (!res.ok) throw new Error('Shared item not found or request failed');
      const data = await res.json();
      setItem(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load shared item');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (type && name) {
      fetchSharedItem();
    }
  }, [type, name]);

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col relative transition-colors duration-300">
      {/* Blueprint grid */}
      <div className="fixed inset-0 w-full h-full pointer-events-none blueprint-grid z-0 opacity-20"></div>

      {/* Mini top navbar */}
      <header className="relative z-50 shrink-0 w-full h-[60px] bg-white dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-800/80 shadow-sm flex items-center justify-between px-6 md:px-12">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-500" />
          <span className="font-extrabold text-base tracking-tight">Thrust<span className="text-blue-500">Vault</span> &bull; Shared Specs</span>
        </div>
        
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-blue-500" />}
        </button>
      </header>

      {/* Main card view */}
      <main className="flex-1 flex flex-col justify-center items-center px-4 py-8 relative z-10">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-xl p-6 md:p-8 flex flex-col gap-6">
          
          {isLoading ? (
            <div className="py-12 text-center text-slate-400 animate-pulse">
              <Activity className="w-8 h-8 animate-spin mx-auto mb-2" />
              <span>Fetching specifications sheet...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-slate-400">
              <Info className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <h3 className="font-bold text-rose-500 text-sm">Specification Error</h3>
              <p className="text-xs mt-1">{error}</p>
              <Link to="/login" className="mt-4 inline-block px-4 py-2 bg-[#003366] text-white text-xs font-semibold rounded-lg">
                Go to Database
              </Link>
            </div>
          ) : item ? (
            <>
              {/* Profile Card Header */}
              <div className="flex gap-4 p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-850">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-500 font-extrabold text-lg flex items-center justify-center shrink-0">
                  {type?.substring(0, 1).toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider">{type} Spec Sheet</span>
                  <h2 className="text-lg font-extrabold text-[#001e40] dark:text-slate-100 leading-tight truncate">{item.name || item.motor_name || name}</h2>
                  <span className="text-xs text-slate-400 mt-0.5 font-bold">Brand: {item.brand || item.company || '—'}</span>
                </div>
              </div>

              {/* Specs Table */}
              <div className="overflow-hidden border border-slate-100 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs font-semibold text-slate-500">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                    
                    {/* MOTOR SPECIFICS */}
                    {type === 'motor' && (
                      <>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">KV Rating</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.kv_rating ? `${item.kv_rating} KV` : '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Voltage Range</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.operating_voltage || '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Max Thrust</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.max_thrust || '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Stator Size</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.stator_size || '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Poles</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.poles || '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Winding Type</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.winding_type || '—'}</td></tr>
                      </>
                    )}

                    {/* ESC SPECIFICS */}
                    {type === 'esc' && (
                      <>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Continuous Amps</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.continuous_current_a ? `${item.custom_parameters.continuous_current_a} A` : '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Peak Amps</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.peak_current_a ? `${item.custom_parameters.peak_current_a} A` : '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Voltage Range</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.voltage_range || '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">BEC Output</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.bec_output || '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Weight</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.weight ? `${item.custom_parameters.weight} g` : '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Firmware</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.firmware || '—'}</td></tr>
                      </>
                    )}

                    {/* PROPELLER SPECIFICS */}
                    {type === 'propeller' && (
                      <>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Diameter</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.diameter ? `${item.custom_parameters.diameter} in` : '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Pitch</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.pitch ? `${item.custom_parameters.pitch} in` : '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Material</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.material || '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Blade Count</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.blades || '2'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Weight</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.weight ? `${item.custom_parameters.weight} g` : '—'}</td></tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-850/20"><td className="py-2.5 px-3">Hub Thickness</td><td className="py-2.5 px-3 text-right font-bold text-slate-800 dark:text-slate-200">{item.custom_parameters?.hub_thickness ? `${item.custom_parameters.hub_thickness} mm` : '—'}</td></tr>
                      </>
                    )}

                  </tbody>
                </table>
              </div>

              {/* Reference PDF */}
              {item.url && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold py-2.5 rounded-xl text-slate-700 dark:text-slate-300">
                    <LinkIcon className="w-3.5 h-3.5" /> Open Reference Document
                  </a>
                </div>
              )}

              <div className="text-center pt-2">
                <Link to="/login" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline">
                  Log in to console to view full telemetry graphs
                </Link>
              </div>
            </>
          ) : null}
          
        </div>
      </main>
    </div>
  );
};
