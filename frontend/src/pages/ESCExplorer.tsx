import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCompare } from '../context/CompareContext';
import { Layout } from '../components/Layout';
import { KPICard } from '../components/KPICard';
import { CompareDrawer } from '../components/CompareDrawer';
import { CompareModal } from '../components/CompareModal';
import { ShareModal } from '../components/ShareModal';
import { 
  Database, Activity, Zap, Cpu, Sliders, Filter, ArrowUpDown, 
  PlusCircle, Trash2, Edit2, ChevronLeft, ChevronRight, Info, X, Link as LinkIcon, Share2
} from 'lucide-react';

interface ESC {
  id: string;
  name: string;
  brand: string;
  price?: number;
  currency?: string;
  url?: string;
  sku?: string;
  main_image?: string;
  gallery_images?: string[];
  custom_parameters?: Record<string, any>;
  continuous_current?: number;
  peak_current?: number;
  input_voltage?: string;
}

export const ESCExplorer: React.FC = () => {
  const { session } = useAuth();
  const { toggleCompare, comparedIds, clearCompare, drawerOpen } = useCompare();
  const navigate = useNavigate();
  const isAdmin = session?.role === 'admin';

  const [escs, setEscs] = useState<ESC[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('current-desc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);
  const [totalFiltered, setTotalFiltered] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // KPI Metrics
  const [kpis, setKpis] = useState({
    totalEscs: '0',
    currentRange: '—',
    voltageRange: '—',
    topBrand: '—',
  });

  // Modal views
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [extraLoadedProfile, setExtraLoadedProfile] = useState<ESC | null>(null);
  const [shareEscOpen, setShareEscOpen] = useState(false);
  const [shareItem, setShareItem] = useState<{ type: string; name: string } | null>(null);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    brand: '',
    continuousCurrent: '',
    peakCurrent: '',
    voltage: '',
    bec: '',
    weight: '',
    mcu: '',
    firmware: '',
    protocol: '',
    resistance: '',
    telemetry: '',
    url: '',
  });

  const fetchEscs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', String(pageSize));
      params.append('offset', String((currentPage - 1) * pageSize));

      let dbSort = 'continuous_current.desc';
      if (sortBy === 'name-asc') dbSort = 'name.asc';
      else if (sortBy === 'name-desc') dbSort = 'name.desc';
      else if (sortBy === 'current-asc') dbSort = 'continuous_current.asc';
      else if (sortBy === 'current-desc') dbSort = 'continuous_current.desc';
      params.append('order', dbSort);

      if (filterBrand && filterBrand !== 'all') {
        params.append('brand', `eq.${filterBrand}`);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const res = await fetch(`/api/escs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load ESCs');
      
      const countHeader = res.headers.get('X-Total-Count');
      const data = (await res.json()) || [];
      setTotalFiltered(countHeader ? parseInt(countHeader, 10) : data.length);

      const mapped = data.map((e: any) => {
        // Parse current and voltage for metrics if not direct properties
        const params = e.custom_parameters || {};
        const getVal = (keys: string[]) => {
          for (const key of Object.keys(params)) {
            if (keys.includes(key.toLowerCase().replace(/[\s_-]+/g, ''))) return params[key];
          }
          return undefined;
        };

        const currentRaw = getVal(['continuouscurrenta', 'continuouscurrent', 'currenta', 'current', 'maxcurrenta', 'amperage']);
        const continuous = currentRaw ? parseFloat(currentRaw) : (parseFloat(e.name.match(/(\d+)\s*A/i)?.[1] || '0'));

        const voltRaw = getVal(['voltage', 'voltagerange', 'voltageranges', 'cells', 'lipocells', 'inputvoltage']);
        const voltage = voltRaw ? String(voltRaw) : (e.name.match(/\b(\d+S)\b/i)?.[0] || '');

        return {
          id: e.id,
          name: e.name,
          brand: e.brand,
          price: e.price,
          url: e.url,
          sku: e.sku,
          main_image: e.main_image,
          custom_parameters: params,
          continuous_current: continuous,
          peak_current: parseFloat(params.peak_current_a || params.peak_current || '0'),
          input_voltage: voltage
        };
      });

      setEscs(mapped);
      
      // Fetch lightweight data for KPIs and Brands list
      const kpiParams = new URLSearchParams();
      if (filterBrand && filterBrand !== 'all') kpiParams.append('brand', `eq.${filterBrand}`);
      if (searchQuery) kpiParams.append('search', searchQuery);
      kpiParams.append('select', 'name,brand,continuous_current,input_voltage,custom_parameters');

      const kpiRes = await fetch(`/api/escs?${kpiParams.toString()}`);
      if (kpiRes.ok) {
        const kpiData = await kpiRes.json();
        const mappedKpis = kpiData.map((e: any) => {
          const params = e.custom_parameters || {};
          const getVal = (keys: string[]) => {
            for (const key of Object.keys(params)) {
              if (keys.includes(key.toLowerCase().replace(/[\s_-]+/g, ''))) return params[key];
            }
            return undefined;
          };
          const currentRaw = getVal(['continuouscurrenta', 'continuouscurrent', 'currenta', 'current', 'maxcurrenta', 'amperage']);
          const continuous = currentRaw ? parseFloat(currentRaw) : (parseFloat(e.name.match(/(\d+)\s*A/i)?.[1] || '0'));
          const voltRaw = getVal(['voltage', 'voltagerange', 'voltageranges', 'cells', 'lipocells', 'inputvoltage']);
          const voltage = voltRaw ? String(voltRaw) : (e.name.match(/\b(\d+S)\b/i)?.[0] || '');

          return { brand: e.brand, continuous_current: continuous, input_voltage: voltage, custom_parameters: params };
        });
        calculateKpis(mappedKpis);

        if (!searchQuery && filterBrand === 'all') {
          const uniqueBrands = Array.from(new Set(kpiData.map((e: any) => e.brand).filter(Boolean))) as string[];
          setBrands(uniqueBrands.sort());
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const location = useLocation();

  useEffect(() => {
    fetchEscs();
  }, [currentPage, pageSize, sortBy, filterBrand, searchQuery]);

  // Open details from URL query parameter or open modal from URL hash
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const escId = searchParams.get('escId');
    if (escId) {
      setSelectedProfileId(escId);
      window.history.replaceState(null, '', location.pathname);
    }

    if (location.hash === '#addesc' || location.hash === '#add-esc' || searchParams.get('add') === 'true') {
      setModalMode('add');
      setForm({
        name: '',
        brand: '',
        continuousCurrent: '',
        peakCurrent: '',
        voltage: '',
        bec: '',
        weight: '',
        mcu: '',
        firmware: '',
        protocol: '',
        resistance: '',
        telemetry: '',
        url: '',
      });
      setIsAddModalOpen(true);
      window.history.replaceState(null, '', location.pathname + location.search);
    }
  }, [location.search, location.hash, location.pathname]);

  // Fetch single ESC details if not in current page list
  useEffect(() => {
    if (!selectedProfileId) {
      setExtraLoadedProfile(null);
      return;
    }
    const found = escs.find(e => e.id === selectedProfileId);
    if (!found) {
      fetch(`/api/escs?id=eq.${selectedProfileId}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.length > 0) {
            const e = data[0];
            const params = e.custom_parameters || {};
            const getVal = (keys: string[]) => {
              for (const key of Object.keys(params)) {
                if (keys.includes(key.toLowerCase().replace(/[\s_-]+/g, ''))) return params[key];
              }
              return undefined;
            };
            const currentRaw = getVal(['continuouscurrenta', 'continuouscurrent', 'currenta', 'current', 'maxcurrenta', 'amperage']);
            const continuous = currentRaw ? parseFloat(currentRaw) : (parseFloat(e.name.match(/(\d+)\s*A/i)?.[1] || '0'));
            const voltRaw = getVal(['voltage', 'voltagerange', 'voltageranges', 'cells', 'lipocells', 'inputvoltage']);
            const voltage = voltRaw ? String(voltRaw) : (e.name.match(/\b(\d+S)\b/i)?.[0] || '');

            setExtraLoadedProfile({
              id: e.id,
              name: e.name,
              brand: e.brand,
              price: e.price,
              url: e.url,
              sku: e.sku,
              main_image: e.main_image,
              custom_parameters: params,
              continuous_current: continuous,
              peak_current: parseFloat(params.peak_current_a || params.peak_current || '0'),
              input_voltage: voltage
            });
          }
        })
        .catch(err => console.error(err));
    }
  }, [selectedProfileId, escs]);

  const calculateKpis = (list: ESC[]) => {
    if (list.length === 0) return;

    let minA = Infinity, maxA = -Infinity;
    const cellSet = new Set<number>();
    const brandCounts: Record<string, number> = {};

    list.forEach(e => {
      const a = e.continuous_current || 0;
      if (a > 0) {
        if (a < minA) minA = a;
        if (a > maxA) maxA = a;
      }

      // Brand count
      if (e.brand) {
        brandCounts[e.brand] = (brandCounts[e.brand] || 0) + 1;
      }

      // Cells
      const v = e.input_voltage || e.custom_parameters?.voltage_range || '';
      const cellMatches = String(v).match(/(\d+)\s*S/gi);
      if (cellMatches) {
        cellMatches.forEach(match => {
          const num = parseInt(match);
          if (!isNaN(num)) cellSet.add(num);
        });
      }
    });

    let topBrand = '—';
    let maxBrandCount = 0;
    Object.entries(brandCounts).forEach(([b, count]) => {
      if (count > maxBrandCount) {
        maxBrandCount = count;
        topBrand = b;
      }
    });

    let voltageStr = '—';
    if (cellSet.size > 0) {
      const sortedCells = Array.from(cellSet).sort((a, b) => a - b);
      voltageStr = sortedCells.length === 1 
        ? `${sortedCells[0]}S` 
        : `${sortedCells[0]}S–${sortedCells[sortedCells.length - 1]}S`;
    }

    setKpis({
      totalEscs: String(list.length),
      currentRange: minA !== Infinity ? `${minA}A - ${maxA}A` : '—',
      voltageRange: voltageStr,
      topBrand,
    });
  };

  // Filter & Sort definitions removed since backend handles them

  const handleOpenAdd = () => {
    setModalMode('add');
    setEditId(null);
    setForm({
      name: '',
      brand: '',
      continuousCurrent: '',
      peakCurrent: '',
      voltage: '',
      bec: '',
      weight: '',
      mcu: '',
      firmware: '',
      protocol: '',
      resistance: '',
      telemetry: '',
      url: '',
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (e: ESC) => {
    setModalMode('edit');
    setEditId(e.id);
    setForm({
      name: e.name,
      brand: e.brand,
      continuousCurrent: String(e.continuous_current || ''),
      peakCurrent: String(e.peak_current || ''),
      voltage: e.input_voltage || e.custom_parameters?.voltage_range || '',
      bec: e.custom_parameters?.bec_output || '',
      weight: String(e.custom_parameters?.weight || ''),
      mcu: e.custom_parameters?.mcu || '',
      firmware: e.custom_parameters?.firmware || '',
      protocol: e.custom_parameters?.protocol || '',
      resistance: String(e.custom_parameters?.resistance_mohm || ''),
      telemetry: e.custom_parameters?.telemetry || '',
      url: e.url || '',
    });
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim(),
      url: form.url.trim(),
      custom_parameters: {
        continuous_current_a: form.continuousCurrent ? parseFloat(form.continuousCurrent) : null,
        peak_current_a: form.peakCurrent ? parseFloat(form.peakCurrent) : null,
        voltage_range: form.voltage.trim(),
        bec_output: form.bec.trim(),
        weight: form.weight ? parseFloat(form.weight) : null,
        mcu: form.mcu.trim(),
        firmware: form.firmware.trim(),
        protocol: form.protocol.trim(),
        resistance_mohm: form.resistance ? parseFloat(form.resistance) : null,
        telemetry: form.telemetry || null,
      }
    };

    try {
      let res;
      if (modalMode === 'add') {
        res = await fetch('/api/escs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`/api/db/escs/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) throw new Error('Failed to save ESC spec');
      setIsAddModalOpen(false);
      fetchEscs();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete ESC "${name}"?`)) return;
    try {
      const res = await fetch(`/api/db/escs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      fetchEscs();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const activeProfile = escs.find(e => e.id === selectedProfileId) || extraLoadedProfile;

  // Compare Selected items
  const comparedFullData = escs.filter(e => comparedIds.includes(e.id));

  return (
    <Layout onSearchChange={setSearchQuery} searchPlaceholder="Search ESC model, firmware...">
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[1800px] w-full mx-auto relative z-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-[#003366]/10 dark:bg-blue-950/40 text-[#003366] dark:text-[#a7c8ff]">
                Powertrain Components
              </span>
              <span className="text-xs text-slate-400 font-medium">ESC Specs</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              Electronic Speed Controllers
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Explore continuous currents, supported voltages, processor types, and firmware options.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={handleOpenAdd}
              className="bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" /> Add ESC Spec
            </button>
          </div>
        </header>

        {/* KPIs Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard title="Total ESC Specs" value={isLoading ? '...' : kpis.totalEscs} sub="Registered controllers" icon={<Database className="w-4 h-4" />} />
          <KPICard title="Current Capacity" value={isLoading ? '...' : kpis.currentRange} sub="Continuous Amp ranges" icon={<Activity className="w-4 h-4" />} iconBgColor="bg-emerald-50 dark:bg-emerald-950/30" iconTextColor="text-emerald-600 dark:text-emerald-400" />
          <KPICard title="Cell Configurations" value={isLoading ? '...' : kpis.voltageRange} sub="Supported LiPo ranges" icon={<Zap className="w-4 h-4" />} iconBgColor="bg-amber-50 dark:bg-amber-950/30" iconTextColor="text-amber-500 dark:text-amber-400" />
          <KPICard title="Top Manufacturer" value={isLoading ? '...' : kpis.topBrand} sub="By database volume" icon={<Cpu className="w-4 h-4" />} iconBgColor="bg-blue-50 dark:bg-blue-950/30" iconTextColor="text-blue-500 dark:text-blue-400" />
        </div>

        {/* Table View */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl overflow-hidden p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 border-b border-slate-100 dark:border-slate-800 pb-4">
            <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-[16px]">ESC Specifications Grids</h3>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> Brand:</label>
                <select value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setCurrentPage(1); }} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold px-2.5 py-1.5 focus:border-[#003366]">
                  <option value="all">All Brands</option>
                  {brands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1"><ArrowUpDown className="w-3.5 h-3.5" /> Sort:</label>
                <select value={sortBy} onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold px-2.5 py-1.5 focus:border-[#003366]">
                  <option value="current-desc">Current: High to Low</option>
                  <option value="current-asc">Current: Low to High</option>
                  <option value="name-asc">Name: A-Z</option>
                  <option value="name-desc">Name: Z-A</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[900px] text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-mono uppercase tracking-wider">
                  <th className="py-3 px-2 w-10 text-center">Compare</th>
                  <th className="py-3 px-2 font-semibold text-[#001e40] dark:text-blue-300">ESC Model</th>
                  <th className="py-3 px-2">Brand</th>
                  <th className="py-3 px-2">Continuous Amps</th>
                  <th className="py-3 px-2">Voltage Input</th>
                  <th className="py-3 px-2 text-center w-24">PDF Reference</th>
                  <th className="py-3 px-2 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-4"><div className="h-4 w-4 bg-slate-200 rounded mx-auto"></div></td>
                      <td className="py-4"><div className="h-4 w-32 bg-slate-200 rounded"></div></td>
                      <td className="py-4"><div className="h-4 w-20 bg-slate-200 rounded"></div></td>
                      <td className="py-4"><div className="h-4 w-12 bg-slate-200 rounded"></div></td>
                      <td className="py-4"><div className="h-4 w-16 bg-slate-200 rounded"></div></td>
                      <td className="py-4"><div className="h-4 w-8 bg-slate-200 rounded mx-auto"></div></td>
                      <td className="py-4"><div className="h-4 w-12 bg-slate-200 rounded ml-auto"></div></td>
                    </tr>
                  ))
                ) : escs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No ESCs match your filters.
                    </td>
                  </tr>
                ) : (
                  escs.map(e => {
                    const isChecked = comparedIds.includes(e.id);
                    return (
                      <tr key={e.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors ${isChecked ? 'bg-blue-50/30 dark:bg-blue-950/20' : ''}`}>
                        <td className="py-3 px-2 text-center">
                          <input type="checkbox" checked={isChecked} onChange={() => toggleCompare(e.id, 'esc')} className="rounded border-slate-300 dark:border-slate-700 text-[#003366] dark:text-blue-500 focus:ring-[#003366]/20 cursor-pointer" />
                        </td>
                        <td className="py-3 px-2 font-semibold text-[#001e40] dark:text-slate-100">
                          <button onClick={() => setSelectedProfileId(e.id)} className="hover:text-blue-600 dark:hover:text-blue-400 text-left focus:outline-none cursor-pointer">{e.name}</button>
                        </td>
                        <td className="py-3 px-2 text-xs font-bold text-slate-600 dark:text-slate-355">{e.brand}</td>
                        <td className="py-3 px-2 font-mono text-xs font-semibold">{e.continuous_current ? `${e.continuous_current} A` : '—'}</td>
                        <td className="py-3 px-2 text-xs font-bold">{e.input_voltage || e.custom_parameters?.voltage_range || '—'}</td>
                        <td className="py-3 px-2 text-center">
                          {e.url && (
                            <a href={e.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-600 inline-block p-1">
                              <LinkIcon className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              onClick={() => setShareItem({ type: 'esc', name: e.name })}
                              className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                              title="Share ESC specs"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && (
                              <>
                                <button onClick={() => handleOpenEdit(e)} className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer" title="Edit ESC"><Edit2 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDelete(e.id, e.name)} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer" title="Delete ESC"><Trash2 className="w-3.5 h-3.5" /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalFiltered > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono">
              <span>Showing {Math.min(totalFiltered, (currentPage - 1) * pageSize + 1)}-{Math.min(totalFiltered, currentPage * pageSize)} of {totalFiltered} ESCs</span>
              <div className="flex gap-2">
                <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="px-2.5 py-1 bg-slate-50 border hover:bg-slate-100 disabled:opacity-40 rounded cursor-pointer disabled:cursor-not-allowed">Prev</button>
                <button onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalFiltered / pageSize), prev + 1))} disabled={currentPage >= Math.ceil(totalFiltered / pageSize)} className="px-2.5 py-1 bg-slate-50 border hover:bg-slate-100 disabled:opacity-40 rounded cursor-pointer disabled:cursor-not-allowed">Next</button>
              </div>
            </div>
          )}
        </div>

        {/* Compare board */}
        <CompareDrawer selectedItems={comparedFullData.map(e => ({ id: e.id, name: e.name, brand: e.brand }))} onOpenCompareModal={() => setIsCompareModalOpen(true)} />
        <CompareModal isOpen={isCompareModalOpen} onClose={() => setIsCompareModalOpen(false)} items={comparedFullData} type="esc" />

        {/* Single profile details modal */}
        {activeProfile && (
          <div className="modal-backdrop show" style={{ zIndex: 1050 }}>
            <div className="modal-container bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6 max-w-lg w-full mx-4">
              <div className="modal-header flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-base">ESC Specifications Details</h3>
                <button onClick={() => setSelectedProfileId(null)} className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="modal-body space-y-3.5">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-lg flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 font-extrabold text-base flex items-center justify-center">E</div>
                  <div>
                    <h4 className="font-extrabold text-[#001e40] dark:text-slate-100">{activeProfile.name}</h4>
                    <span className="text-xs text-slate-400">{activeProfile.brand}</span>
                  </div>
                </div>
                <table className="w-full text-xs font-semibold text-slate-500">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                    <tr><td className="py-2">Continuous Current</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.continuous_current ? `${activeProfile.continuous_current} A` : '—'}</td></tr>
                    <tr><td className="py-2">Peak Current</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.peak_current ? `${activeProfile.peak_current} A` : '—'}</td></tr>
                    <tr><td className="py-2">Voltage Input</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.input_voltage || '—'}</td></tr>
                    <tr><td className="py-2">BEC Output</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.custom_parameters?.bec_output || '—'}</td></tr>
                    <tr><td className="py-2">Weight</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.custom_parameters?.weight ? `${activeProfile.custom_parameters.weight} g` : '—'}</td></tr>
                    <tr><td className="py-2">Processor/MCU</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.custom_parameters?.mcu || '—'}</td></tr>
                    <tr><td className="py-2">Firmware</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.custom_parameters?.firmware || '—'}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShareEscOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share Specs
                  </button>
                  <button
                    onClick={() => navigate(`/esc/profile/${encodeURIComponent(activeProfile.name)}`)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    Open Page ↗
                  </button>
                </div>
                <button onClick={() => setSelectedProfileId(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer">Close</button>
              </div>
            </div>
          </div>
        )}
        {activeProfile && (
          <ShareModal
            isOpen={shareEscOpen}
            onClose={() => setShareEscOpen(false)}
            type="esc"
            name={activeProfile.name}
          />
        )}
        {shareItem && (
          <ShareModal
            isOpen={!!shareItem}
            onClose={() => setShareItem(null)}
            type="esc"
            name={shareItem.name}
          />
        )}

        {/* Add/Edit Modal */}
        {isAddModalOpen && (
          <div className="modal-backdrop show" style={{ zIndex: 1050 }}>
            <div className="modal-container bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6 max-w-xl w-full mx-4">
              <div className="modal-header flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-base">{modalMode === 'add' ? 'Add ESC Specifications' : 'Edit ESC Specifications'}</h3>
                <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-500 mb-1.5">Model Name *</label>
                    <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Flame 80A v2" className="bg-slate-50 border rounded-lg py-2 px-3 text-sm focus:border-[#003366] outline-none" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-500 mb-1.5">Brand / Company *</label>
                    <input type="text" required value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} placeholder="e.g. T-Motor" className="bg-slate-50 border rounded-lg py-2 px-3 text-sm focus:border-[#003366] outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-500 mb-1.5">Continuous Amps *</label>
                    <input type="number" step="any" required value={form.continuousCurrent} onChange={e => setForm({...form, continuousCurrent: e.target.value})} placeholder="e.g. 80" className="bg-slate-50 border rounded-lg py-2 px-3 text-sm focus:border-[#003366] outline-none" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-500 mb-1.5">Peak Amps</label>
                    <input type="number" step="any" value={form.peakCurrent} onChange={e => setForm({...form, peakCurrent: e.target.value})} placeholder="e.g. 120" className="bg-slate-50 border rounded-lg py-2 px-3 text-sm focus:border-[#003366] outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-550 mb-1">Voltage Cells</label>
                    <input type="text" value={form.voltage} onChange={e => setForm({...form, voltage: e.target.value})} placeholder="e.g. 6S-12S" className="bg-slate-50 border rounded-lg py-2 px-2.5 text-xs outline-none" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-550 mb-1">BEC Output</label>
                    <input type="text" value={form.bec} onChange={e => setForm({...form, bec: e.target.value})} placeholder="e.g. 5V @ 5A" className="bg-slate-50 border rounded-lg py-2 px-2.5 text-xs outline-none" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-555 mb-1">Weight (g)</label>
                    <input type="number" step="any" value={form.weight} onChange={e => setForm({...form, weight: e.target.value})} placeholder="e.g. 96" className="bg-slate-50 border rounded-lg py-2 px-2.5 text-xs outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input type="text" value={form.mcu} onChange={e => setForm({...form, mcu: e.target.value})} placeholder="Processor / MCU (e.g. ARM 32-bit)" className="bg-slate-50 border rounded-lg py-2 px-3 text-xs outline-none" />
                  <input type="text" value={form.firmware} onChange={e => setForm({...form, firmware: e.target.value})} placeholder="Firmware (e.g. BLHeli_32)" className="bg-slate-50 border rounded-lg py-2 px-3 text-xs outline-none" />
                </div>
                <input type="url" value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="Reference Datasheet PDF Link" className="w-full bg-slate-50 border rounded-lg py-2 px-3 text-xs outline-none" />
                <div className="flex justify-end gap-2 border-t pt-4">
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border rounded-lg text-xs font-semibold hover:bg-slate-50">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-[#003366] text-white rounded-lg text-xs font-semibold hover:bg-[#002244]">Save Specifications</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </Layout>
  );
};
