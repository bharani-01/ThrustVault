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

interface Propeller {
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
  diameter?: number;
  pitch?: number;
  material?: string;
}

export const PropellerExplorer: React.FC = () => {
  const { session } = useAuth();
  const { toggleCompare, comparedIds, clearCompare, drawerOpen } = useCompare();
  const navigate = useNavigate();
  const isAdmin = session?.role === 'admin';

  const [propellers, setPropellers] = useState<Propeller[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('diameter-desc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);
  const [totalFiltered, setTotalFiltered] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // KPI Metrics
  const [kpis, setKpis] = useState({
    totalProps: '0',
    diameterRange: '—',
    pitchRange: '—',
    topMaterial: '—',
  });

  // Modals
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [extraLoadedProfile, setExtraLoadedProfile] = useState<Propeller | null>(null);
  const [sharePropOpen, setSharePropOpen] = useState(false);
  const [shareItem, setShareItem] = useState<{ type: string; name: string } | null>(null);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    brand: '',
    diameter: '',
    pitch: '',
    material: '',
    blades: '2',
    weight: '',
    hubThickness: '',
    shaftDiameter: '',
    folding: '',
    shaftBore: '',
    chordWidth: '',
    hubDiameter: '',
    stiffness: '',
    url: '',
  });

  const fetchPropellers = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', String(pageSize));
      params.append('offset', String((currentPage - 1) * pageSize));

      let dbSort = 'diameter.desc';
      if (sortBy === 'name-asc') dbSort = 'name.asc';
      else if (sortBy === 'name-desc') dbSort = 'name.desc';
      else if (sortBy === 'diameter-asc') dbSort = 'diameter.asc';
      else if (sortBy === 'diameter-desc') dbSort = 'diameter.desc';
      params.append('order', dbSort);

      if (filterBrand && filterBrand !== 'all') {
        params.append('brand', `eq.${filterBrand}`);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const res = await fetch(`/api/propellers?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load Propellers');
      
      const countHeader = res.headers.get('X-Total-Count');
      const data = (await res.json()) || [];
      setTotalFiltered(countHeader ? parseInt(countHeader, 10) : data.length);

      const mapped = data.map((p: any) => {
        const params = p.custom_parameters || {};
        const getVal = (keys: string[]) => {
          for (const key of Object.keys(params)) {
            if (keys.includes(key.toLowerCase().replace(/[\s_-]+/g, ''))) return params[key];
          }
          return undefined;
        };

        const diameter = getVal(['diameter', 'diam', 'length']);
        const pitch = getVal(['pitch', 'prop_pitch']);
        const material = getVal(['material', 'prop_material', 'composition']);

        return {
          id: p.id,
          name: p.name,
          brand: p.brand,
          price: p.price,
          url: p.url,
          sku: p.sku,
          main_image: p.main_image,
          custom_parameters: params,
          diameter: diameter ? parseFloat(diameter) : 0,
          pitch: pitch ? parseFloat(pitch) : 0,
          material: material ? String(material) : ''
        };
      });

      setPropellers(mapped);
      
      // Fetch lightweight data for KPIs and Brands list
      const kpiParams = new URLSearchParams();
      if (filterBrand && filterBrand !== 'all') kpiParams.append('brand', `eq.${filterBrand}`);
      if (searchQuery) kpiParams.append('search', searchQuery);
      kpiParams.append('select', 'name,brand,custom_parameters');

      const kpiRes = await fetch(`/api/propellers?${kpiParams.toString()}`);
      if (kpiRes.ok) {
        const kpiData = await kpiRes.json();
        const mappedKpis = kpiData.map((p: any) => {
          const params = p.custom_parameters || {};
          const getVal = (keys: string[]) => {
            for (const key of Object.keys(params)) {
              if (keys.includes(key.toLowerCase().replace(/[\s_-]+/g, ''))) return params[key];
            }
            return undefined;
          };
          const diameter = getVal(['diameter', 'diam', 'length']);
          const pitch = getVal(['pitch', 'prop_pitch']);
          const material = getVal(['material', 'prop_material', 'composition']);

          return {
            brand: p.brand,
            diameter: diameter ? parseFloat(diameter) : 0,
            pitch: pitch ? parseFloat(pitch) : 0,
            material: material ? String(material) : ''
          };
        });
        calculateKpis(mappedKpis);

        if (!searchQuery && filterBrand === 'all') {
          const uniqueBrands = Array.from(new Set(kpiData.map((p: any) => p.brand).filter(Boolean))) as string[];
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
    fetchPropellers();
  }, [currentPage, pageSize, sortBy, filterBrand, searchQuery]);

  // Open details from URL query parameter or open modal from URL hash
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const propId = searchParams.get('propId');
    if (propId) {
      setSelectedProfileId(propId);
      window.history.replaceState(null, '', location.pathname);
    }

    if (location.hash === '#addprop' || location.hash === '#add-prop' || location.hash === '#add-propeller' || searchParams.get('add') === 'true') {
      setModalMode('add');
      setForm({
        name: '',
        brand: '',
        diameter: '',
        pitch: '',
        material: '',
        blades: '2',
        weight: '',
        hubThickness: '',
        shaftDiameter: '',
        folding: '',
        shaftBore: '',
        chordWidth: '',
        hubDiameter: '',
        stiffness: '',
        url: '',
      });
      setIsAddModalOpen(true);
      window.history.replaceState(null, '', location.pathname + location.search);
    }
  }, [location.search, location.hash, location.pathname]);

  // Fetch single propeller details if not in current page list
  useEffect(() => {
    if (!selectedProfileId) {
      setExtraLoadedProfile(null);
      return;
    }
    const found = propellers.find(p => p.id === selectedProfileId);
    if (!found) {
      fetch(`/api/propellers?id=eq.${selectedProfileId}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.length > 0) {
            const p = data[0];
            const params = p.custom_parameters || {};
            const getVal = (keys: string[]) => {
              for (const key of Object.keys(params)) {
                if (keys.includes(key.toLowerCase().replace(/[\s_-]+/g, ''))) return params[key];
              }
              return undefined;
            };

            const diamRaw = getVal(['diameter', 'propellerdiameter', 'propdiameter', 'length', 'size']);
            const diameter = diamRaw ? parseFloat(diamRaw) : (parseFloat(p.name.match(/^([\d\.]+)/)?.[1] || '0'));
            
            const pitchRaw = getVal(['pitch', 'proppitch', 'propellerpitch', 'slope']);
            const pitch = pitchRaw ? parseFloat(pitchRaw) : (parseFloat(p.name.match(/x\s*([\d\.]+)/i)?.[1] || '0'));

            setExtraLoadedProfile({
              id: p.id,
              name: p.name,
              brand: p.brand,
              price: p.price,
              url: p.url,
              sku: p.sku,
              main_image: p.main_image,
              custom_parameters: params,
              diameter,
              pitch,
              material: params.material || ''
            });
          }
        })
        .catch(err => console.error(err));
    }
  }, [selectedProfileId, propellers]);

  const calculateKpis = (list: Propeller[]) => {
    if (list.length === 0) return;

    let minD = Infinity, maxD = -Infinity;
    let minP = Infinity, maxP = -Infinity;
    const materialCounts: Record<string, number> = {};

    list.forEach(p => {
      const d = p.diameter || 0;
      if (d > 0) {
        if (d < minD) minD = d;
        if (d > maxD) maxD = d;
      }

      const pi = p.pitch || 0;
      if (pi > 0) {
        if (pi < minP) minP = pi;
        if (pi > maxP) maxP = pi;
      }

      if (p.material) {
        const mat = p.material.trim();
        materialCounts[mat] = (materialCounts[mat] || 0) + 1;
      }
    });

    let topMaterial = '—';
    let maxMatCount = 0;
    Object.entries(materialCounts).forEach(([m, count]) => {
      if (count > maxMatCount) {
        maxMatCount = count;
        topMaterial = m;
      }
    });

    setKpis({
      totalProps: String(list.length),
      diameterRange: minD !== Infinity ? `${minD}" - ${maxD}"` : '—',
      pitchRange: minP !== Infinity ? `${minP}" - ${maxP}"` : '—',
      topMaterial,
    });
  };

  // Filter & Sort definitions removed since backend handles them

  const handleOpenAdd = () => {
    setModalMode('add');
    setEditId(null);
    setForm({
      name: '',
      brand: '',
      diameter: '',
      pitch: '',
      material: '',
      blades: '2',
      weight: '',
      hubThickness: '',
      shaftDiameter: '',
      folding: '',
      shaftBore: '',
      chordWidth: '',
      hubDiameter: '',
      stiffness: '',
      url: '',
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (p: Propeller) => {
    setModalMode('edit');
    setEditId(p.id);
    setForm({
      name: p.name,
      brand: p.brand,
      diameter: String(p.diameter || ''),
      pitch: String(p.pitch || ''),
      material: p.material || '',
      blades: String(p.custom_parameters?.blades || '2'),
      weight: String(p.custom_parameters?.weight || ''),
      hubThickness: String(p.custom_parameters?.hub_thickness || ''),
      shaftDiameter: String(p.custom_parameters?.shaft_diameter || ''),
      folding: p.custom_parameters?.folding ? 'true' : (p.custom_parameters?.folding === false ? 'false' : ''),
      shaftBore: String(p.custom_parameters?.shaft_bore || ''),
      chordWidth: String(p.custom_parameters?.chord_width || ''),
      hubDiameter: String(p.custom_parameters?.hub_diameter || ''),
      stiffness: p.custom_parameters?.stiffness || '',
      url: p.url || '',
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
        diameter: form.diameter ? parseFloat(form.diameter) : null,
        pitch: form.pitch ? parseFloat(form.pitch) : null,
        material: form.material.trim(),
        blades: form.blades ? parseInt(form.blades) : 2,
        weight: form.weight ? parseFloat(form.weight) : null,
        hub_thickness: form.hubThickness ? parseFloat(form.hubThickness) : null,
        shaft_diameter: form.shaftDiameter ? parseFloat(form.shaftDiameter) : null,
        folding: form.folding === 'true' ? true : (form.folding === 'false' ? false : null),
        shaft_bore: form.shaftBore ? parseFloat(form.shaftBore) : null,
        chord_width: form.chordWidth ? parseFloat(form.chordWidth) : null,
        hub_diameter: form.hubDiameter ? parseFloat(form.hubDiameter) : null,
        stiffness: form.stiffness.trim(),
      }
    };

    try {
      let res;
      if (modalMode === 'add') {
        res = await fetch('/api/propellers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`/api/db/propellers/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) throw new Error('Failed to save Propeller spec');
      setIsAddModalOpen(false);
      fetchPropellers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete Propeller "${name}"?`)) return;
    try {
      const res = await fetch(`/api/db/propellers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      fetchPropellers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const activeProfile = propellers.find(p => p.id === selectedProfileId) || extraLoadedProfile;

  const comparedFullData = propellers.filter(p => comparedIds.includes(p.id));

  return (
    <Layout onSearchChange={setSearchQuery} searchPlaceholder="Search Propeller model, material...">
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[1800px] w-full mx-auto relative z-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-[#003366]/10 dark:bg-blue-950/40 text-[#003366] dark:text-[#a7c8ff]">
                Powertrain Components
              </span>
              <span className="text-xs text-slate-400 font-medium">Propeller Specs</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              Propellers Specifications
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Explore propeller diameters, pitches, blades layouts, materials, and hub options.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={handleOpenAdd}
              className="bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" /> Add Propeller
            </button>
          </div>
        </header>

        {/* KPIs Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard title="Total Props Specs" value={isLoading ? '...' : kpis.totalProps} sub="Registered propellers" icon={<Database className="w-4 h-4" />} />
          <KPICard title="Diameter Range" value={isLoading ? '...' : kpis.diameterRange} sub="Typical propeller lengths" icon={<Activity className="w-4 h-4" />} iconBgColor="bg-emerald-50 dark:bg-emerald-950/30" iconTextColor="text-emerald-600 dark:text-emerald-400" />
          <KPICard title="Pitch Range" value={isLoading ? '...' : kpis.pitchRange} sub="Dynamic screw pitch" icon={<Zap className="w-4 h-4" />} iconBgColor="bg-amber-50 dark:bg-amber-950/30" iconTextColor="text-amber-500 dark:text-amber-400" />
          <KPICard title="Core Material" value={isLoading ? '...' : kpis.topMaterial} sub="By database volume" icon={<Cpu className="w-4 h-4" />} iconBgColor="bg-blue-50 dark:bg-blue-950/30" iconTextColor="text-blue-500 dark:text-blue-400" />
        </div>

        {/* Table View */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl overflow-hidden p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 border-b border-slate-100 dark:border-slate-800 pb-4">
            <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-[16px]">Propeller Catalog</h3>
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
                  <option value="diameter-desc">Diameter: High to Low</option>
                  <option value="diameter-asc">Diameter: Low to High</option>
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
                  <th className="py-3 px-2 font-semibold text-[#001e40] dark:text-blue-300">Propeller Model</th>
                  <th className="py-3 px-2">Brand</th>
                  <th className="py-3 px-2">Diameter (in)</th>
                  <th className="py-3 px-2">Pitch (in)</th>
                  <th className="py-3 px-2">Material</th>
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
                      <td className="py-4"><div className="h-4 w-12 bg-slate-200 rounded"></div></td>
                      <td className="py-4"><div className="h-4 w-16 bg-slate-200 rounded"></div></td>
                      <td className="py-4"><div className="h-4 w-8 bg-slate-200 rounded mx-auto"></div></td>
                      <td className="py-4"><div className="h-4 w-12 bg-slate-200 rounded ml-auto"></div></td>
                    </tr>
                  ))
                ) : propellers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No Propellers match your filters.
                    </td>
                  </tr>
                ) : (
                  propellers.map(p => {
                    const isChecked = comparedIds.includes(p.id);
                    return (
                      <tr key={p.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors ${isChecked ? 'bg-blue-50/30 dark:bg-blue-950/20' : ''}`}>
                        <td className="py-3 px-2 text-center">
                          <input type="checkbox" checked={isChecked} onChange={() => toggleCompare(p.id, 'propeller')} className="rounded border-slate-300 dark:border-slate-700 text-[#003366] dark:text-blue-500 focus:ring-[#003366]/20 cursor-pointer" />
                        </td>
                        <td className="py-3 px-2 font-semibold text-[#001e40] dark:text-slate-100">
                          <button onClick={() => setSelectedProfileId(p.id)} className="hover:text-blue-600 dark:hover:text-blue-400 text-left focus:outline-none cursor-pointer">{p.name}</button>
                        </td>
                        <td className="py-3 px-2 text-xs font-bold text-slate-600 dark:text-slate-355">{p.brand}</td>
                        <td className="py-3 px-2 font-mono text-xs font-semibold">{p.diameter ? `${p.diameter}"` : '—'}</td>
                        <td className="py-3 px-2 font-mono text-xs text-slate-500">{p.pitch ? `${p.pitch}"` : '—'}</td>
                        <td className="py-3 px-2 text-xs font-semibold">{p.material || '—'}</td>
                        <td className="py-3 px-2 text-center">
                          {p.url && (
                            <a href={p.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-600 inline-block p-1">
                              <LinkIcon className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              onClick={() => setShareItem({ type: 'propeller', name: p.name })}
                              className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                              title="Share Propeller specs"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && (
                              <>
                                <button onClick={() => handleOpenEdit(p)} className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer" title="Edit Propeller"><Edit2 className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDelete(p.id, p.name)} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer" title="Delete Propeller"><Trash2 className="w-3.5 h-3.5" /></button>
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
              <span>Showing {Math.min(totalFiltered, (currentPage - 1) * pageSize + 1)}-{Math.min(totalFiltered, currentPage * pageSize)} of {totalFiltered} propellers</span>
              <div className="flex gap-2">
                <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="px-2.5 py-1 bg-slate-50 border hover:bg-slate-100 disabled:opacity-40 rounded cursor-pointer disabled:cursor-not-allowed">Prev</button>
                <button onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalFiltered / pageSize), prev + 1))} disabled={currentPage >= Math.ceil(totalFiltered / pageSize)} className="px-2.5 py-1 bg-slate-50 border hover:bg-slate-100 disabled:opacity-40 rounded cursor-pointer disabled:cursor-not-allowed">Next</button>
              </div>
            </div>
          )}
        </div>

        {/* Compare board */}
        <CompareDrawer selectedItems={comparedFullData.map(p => ({ id: p.id, name: p.name, brand: p.brand }))} onOpenCompareModal={() => setIsCompareModalOpen(true)} />
        <CompareModal isOpen={isCompareModalOpen} onClose={() => setIsCompareModalOpen(false)} items={comparedFullData} type="propeller" />

        {/* Single profile details modal */}
        {activeProfile && (
          <div className="modal-backdrop show" style={{ zIndex: 1050 }}>
            <div className="modal-container bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6 max-w-lg w-full mx-4">
              <div className="modal-header flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-base">Propeller Specifications</h3>
                <button onClick={() => setSelectedProfileId(null)} className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="modal-body space-y-3.5">
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-lg flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 font-extrabold text-base flex items-center justify-center">P</div>
                  <div>
                    <h4 className="font-extrabold text-[#001e40] dark:text-slate-100">{activeProfile.name}</h4>
                    <span className="text-xs text-slate-400">{activeProfile.brand}</span>
                  </div>
                </div>
                <table className="w-full text-xs font-semibold text-slate-500">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                    <tr><td className="py-2">Diameter</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.diameter ? `${activeProfile.diameter} in` : '—'}</td></tr>
                    <tr><td className="py-2">Pitch</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.pitch ? `${activeProfile.pitch} in` : '—'}</td></tr>
                    <tr><td className="py-2">Material</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.material || '—'}</td></tr>
                    <tr><td className="py-2">Blades</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.custom_parameters?.blades || '2'}</td></tr>
                    <tr><td className="py-2">Weight</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.custom_parameters?.weight ? `${activeProfile.custom_parameters.weight} g` : '—'}</td></tr>
                    <tr><td className="py-2">Hub Thickness</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.custom_parameters?.hub_thickness ? `${activeProfile.custom_parameters.hub_thickness} mm` : '—'}</td></tr>
                    <tr><td className="py-2">Center Shaft Diameter</td><td className="py-2 text-right font-bold text-slate-800 dark:text-slate-200">{activeProfile.custom_parameters?.shaft_diameter ? `${activeProfile.custom_parameters.shaft_diameter} mm` : '—'}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSharePropOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share Specs
                  </button>
                  <button
                    onClick={() => navigate(`/propeller/profile/${encodeURIComponent(activeProfile.name)}`)}
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
            isOpen={sharePropOpen}
            onClose={() => setSharePropOpen(false)}
            type="propeller"
            name={activeProfile.name}
          />
        )}
        {shareItem && (
          <ShareModal
            isOpen={!!shareItem}
            onClose={() => setShareItem(null)}
            type="propeller"
            name={shareItem.name}
          />
        )}

        {/* Add/Edit Modal */}
        {isAddModalOpen && (
          <div className="modal-backdrop show" style={{ zIndex: 1050 }}>
            <div className="modal-container bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6 max-w-xl w-full mx-4">
              <div className="modal-header flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-base">{modalMode === 'add' ? 'Add Propeller Specifications' : 'Edit Propeller Specifications'}</h3>
                <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                {/* Core Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Model Name *</label>
                    <input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. G30x10.5 Folding" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none" />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Brand / Company *</label>
                    <input type="text" required value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} placeholder="e.g. T-Motor" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none" />
                  </div>
                </div>

                {/* Geometry */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Geometry & Dimensions</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1.5">Diameter (inch) *</label>
                      <input type="number" step="any" required value={form.diameter} onChange={e => setForm({...form, diameter: e.target.value})} placeholder="e.g. 30" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1.5">Pitch (inch) *</label>
                      <input type="number" step="any" required value={form.pitch} onChange={e => setForm({...form, pitch: e.target.value})} placeholder="e.g. 10.5" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1.5">Blade Count</label>
                      <input type="number" value={form.blades} onChange={e => setForm({...form, blades: e.target.value})} placeholder="e.g. 2" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1.5">Shaft Bore (mm)</label>
                      <input type="number" step="any" value={form.shaftBore} onChange={e => setForm({...form, shaftBore: e.target.value})} placeholder="e.g. 6.0" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1.5">Blade Chord Width (mm)</label>
                      <input type="number" step="any" value={form.chordWidth} onChange={e => setForm({...form, chordWidth: e.target.value})} placeholder="e.g. 32.5" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1.5">Hub Diameter (mm)</label>
                      <input type="number" step="any" value={form.hubDiameter} onChange={e => setForm({...form, hubDiameter: e.target.value})} placeholder="e.g. 42.0" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1.5">Hub Thickness (mm)</label>
                      <input type="number" step="any" value={form.hubThickness} onChange={e => setForm({...form, hubThickness: e.target.value})} placeholder="e.g. 10.0" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1.5">Folding Propeller</label>
                      <select value={form.folding} onChange={e => setForm({...form, folding: e.target.value})} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none">
                        <option value="">— Select —</option>
                        <option value="true">Yes (Folding)</option>
                        <option value="false">No (Solid / Fixed)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Build & Materials */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Build & Physical Props</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1.5">Material</label>
                      <input type="text" value={form.material} onChange={e => setForm({...form, material: e.target.value})} placeholder="e.g. Carbon Fiber" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-xs outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1.5">Stiffness Rating</label>
                      <input type="text" value={form.stiffness} onChange={e => setForm({...form, stiffness: e.target.value})} placeholder="e.g. Ultra Carbon / High Stiffness" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-xs outline-none" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1.5">Weight (g)</label>
                      <input type="number" step="any" value={form.weight} onChange={e => setForm({...form, weight: e.target.value})} placeholder="e.g. 120" className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-xs outline-none" />
                    </div>
                  </div>
                </div>

                {/* Reference Datasheet */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Product / Datasheet URL</label>
                  <input type="url" value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="https://..." className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:border-[#003366] outline-none" />
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-[#003366] text-white rounded-lg text-xs font-semibold hover:bg-[#002244] cursor-pointer">Save Specifications</button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </Layout>
  );
};
