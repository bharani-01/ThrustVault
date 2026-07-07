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
  Database, Activity, Zap, Battery, Sliders, Filter, ArrowUpDown, 
  PlusCircle, Trash2, Edit2, ChevronLeft, ChevronRight, ChevronDown, Info, X, Link as LinkIcon, Cpu, Share2, Check
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  desc?: string;
}

interface Motor {
  id: string;
  categoryId: string;
  motor: string;
  company: string;
  thrust: string;
  esc: string;
  prop: string;
  linkMotor: string;
  linkEsc: string;
  linkProp: string;
  custom_parameters?: Record<string, any>;
  uploaded_by?: string;
  mainImage?: string;
  galleryImages?: string[];
  kv_rating?: number;
  operating_voltage?: string;
}

export const Dashboard: React.FC = () => {
  const { session } = useAuth();
  const { toggleCompare, comparedIds, clearCompare, drawerOpen } = useCompare();
  const location = useLocation();
  const navigate = useNavigate();
  
  const isAdmin = session?.role === 'admin';

  // State lists
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [motors, setMotors] = useState<Motor[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [customSchema, setCustomSchema] = useState<any[]>([]);

  // UI State Filters
  const [filterByCategory, setFilterByCategory] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('thrust-desc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);
  const [totalFiltered, setTotalFiltered] = useState<number>(0);

  const [isInitLoading, setIsInitLoading] = useState<boolean>(true);
  const [isTableLoading, setIsTableLoading] = useState<boolean>(false);
  const [isThrustLevelsExpanded, setIsThrustLevelsExpanded] = useState<boolean>(() => 
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  // KPI Metrics values
  const [kpis, setKpis] = useState({
    totalMotors: '—',
    avgThrust: '—',
    maxThrust: '—',
    voltageRange: '—',
  });

  const [baselineKpis, setBaselineKpis] = useState<{
    totalMotors: string;
    avgThrust: string;
    maxThrust: string;
    voltageRange: string;
  } | null>(null);

  // Modal views
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [shareMotorOpen, setShareMotorOpen] = useState(false);
  const [shareItem, setShareItem] = useState<{ type: string; name: string } | null>(null);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState<boolean>(false);
  
  // Add/Edit Motor modal
  const [isMotorModalOpen, setIsMotorModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editMotorId, setEditMotorId] = useState<string | null>(null);
  const [motorForm, setMotorForm] = useState({
    name: '',
    company: '',
    thrustVal: '',
    thrustUnit: 'kg',
    categoryId: '',
    esc: '',
    propeller: '',
    linkMotor: '',
    linkEsc: '',
    linkProp: '',
    sku: '',
    kv: '',
    stator: '',
    poles: '',
    winding: '',
    voltage: '',
    internalResistance: '',
    configuration: '',
    shaftDiameter: '',
    dimensions: '',
    awg: '',
    cableLength: '',
    weightWithCable: '',
    weightNoCable: '',
    idleCurrent: '',
    maxPower: '',
    maxCurrent: '',
  });

  // Add Category Modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');

  // 1. Initial Data Retrieval
  const fetchInitData = async () => {
    setIsInitLoading(true);
    try {
      const res = await fetch('/api/init-data');
      if (!res.ok) throw new Error('Failed to fetch initial data');
      const data = await res.json();

      // Categories setup
      const parseMinWeight = (name: string) => {
        const match = name.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 9999;
      };
      
      const rawCategories = data.categories || [];
      const noThrustCat = rawCategories.find((c: any) => c.name === 'No Thrust');
      const filteredCats = rawCategories
        .filter((c: any) => c.name !== 'No Thrust')
        .map((c: any) => ({ id: c.id, name: c.name, desc: c.description }))
        .sort((a: any, b: any) => parseMinWeight(a.name) - parseMinWeight(b.name));

      const finalCats = [
        { id: 'all', name: 'All Motors', desc: 'All motors across all thrust classes' },
        ...filteredCats
      ];
      setCategories(finalCats);

      // Counts setup
      const counts = data.category_counts || {};
      if (noThrustCat && counts[noThrustCat.id]) {
        delete counts[noThrustCat.id];
      }
      counts['all'] = Object.values(counts).reduce((a: any, b: any) => a + b, 0) as number;
      setCategoryCounts(counts);

      setBrands(data.brands || []);
      setCustomSchema(data.custom_schema || []);
      
      // Default initial motors loading
      const mappedMotors = (data.first_motors || [])
        .filter((m: any) => !noThrustCat || m.category_id !== noThrustCat.id)
        .map(mapRawMotor);
      setMotors(mappedMotors);
      setTotalFiltered(counts['all']);

      // Setup initial KPIs from cached server stats
      if (data.dashboard_stats) {
        const initKpis = {
          totalMotors: String(data.dashboard_stats.total_motors || '0'),
          avgThrust: data.dashboard_stats.thrust_range || '—',
          maxThrust: data.dashboard_stats.max_thrust_str || '—',
          voltageRange: data.dashboard_stats.voltage_range || '—',
        };
        setKpis(initKpis);
        setBaselineKpis(initKpis);
      }
    } catch (err) {
      console.error('Error fetching init data:', err);
    } finally {
      setIsInitLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSearch = params.get('search');
    const urlCat = params.get('category_id');
    if (urlSearch) setSearchQuery(urlSearch);
    if (urlCat) setFilterByCategory(urlCat);
    fetchInitData();
  }, []);

  // Listen for open-motor-details events from AI copilot links
  useEffect(() => {
    const handleOpenMotor = (e: Event) => {
      const customEv = e as CustomEvent;
      if (customEv.detail) {
        setSelectedProfileId(customEv.detail);
      }
    };
    window.addEventListener('open-motor-details', handleOpenMotor);
    
    // Bind to window so global scripts can invoke details drawer directly
    (window as any).openMotorDetails = (id: string) => {
      setSelectedProfileId(id);
    };

    return () => {
      window.removeEventListener('open-motor-details', handleOpenMotor);
      delete (window as any).openMotorDetails;
    };
  }, []);

  // Open details from URL query parameter or open modal from URL hash
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const motorId = searchParams.get('motorId');
    if (motorId) {
      setSelectedProfileId(motorId);
      window.history.replaceState(null, '', location.pathname);
    }

    if (location.hash === '#addmotor' || location.hash === '#add-motor') {
      setModalMode('add');
      setMotorForm({
        name: '',
        company: '',
        thrustVal: '',
        thrustUnit: 'kg',
        categoryId: categories[0]?.id || '',
        esc: '',
        propeller: '',
        linkMotor: '',
        linkEsc: '',
        linkProp: '',
        sku: '',
        kv: '',
        stator: '',
        poles: '',
        winding: '',
        voltage: '',
        internalResistance: '',
        configuration: '',
        shaftDiameter: '',
        dimensions: '',
        awg: '',
        cableLength: '',
        weightWithCable: '',
        weightNoCable: '',
        idleCurrent: '',
        maxPower: '',
        maxCurrent: '',
      });
      setIsMotorModalOpen(true);
      // clean hash without reload
      window.history.replaceState(null, '', location.pathname + location.search);
    }
  }, [location.search, location.hash, location.pathname, categories]);

  // Helper map function
  const formatThrustToKg = (thrustStr: string) => {
    if (!thrustStr || thrustStr.toLowerCase() === 'n/a') return 'N/A';
    const normalized = String(thrustStr).trim().toLowerCase().replace(/\s+/g, '');
    const match = normalized.match(/^([0-9.]+)(kg|g|n|lb)?$/);
    let kgVal = 0;
    if (match) {
      const val = parseFloat(match[1]);
      const unit = match[2] || 'kg';
      if (unit === 'g') kgVal = val / 1000;
      else if (unit === 'n') kgVal = val / 9.80665;
      else if (unit === 'lb') kgVal = val * 0.453592;
      else kgVal = val;
    } else {
      const numbers = normalized.match(/[0-9.]+/);
      if (numbers) {
        const val = parseFloat(numbers[0]);
        if (normalized.includes('g') && !normalized.includes('kg')) {
          kgVal = val / 1000;
        } else if (normalized.includes('n')) {
          kgVal = val / 9.80665;
        } else if (normalized.includes('lb')) {
          kgVal = val * 0.453592;
        } else {
          kgVal = val;
        }
      } else {
        return thrustStr;
      }
    }
    return `${kgVal.toFixed(2)} kg`;
  };

  const mapRawMotor = (m: any): Motor => {
    return {
      id: m.id,
      categoryId: m.category_id,
      motor: m.motor_name,
      company: m.company,
      thrust: formatThrustToKg(m.max_thrust),
      esc: m.recommended_esc,
      prop: m.recommended_propeller,
      linkMotor: m.link_motor,
      linkEsc: m.link_esc,
      linkProp: m.link_propeller,
      custom_parameters: m.custom_parameters || {},
      uploaded_by: m.uploaded_by,
      mainImage: m.main_image,
      galleryImages: m.gallery_images,
      kv_rating: m.kv_rating,
      operating_voltage: m.operating_voltage
    };
  };

  // 2. Dynamic catalog reload triggered by UI adjustments
  const loadMotors = async () => {
    setIsTableLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', String(pageSize));
      params.append('offset', String((currentPage - 1) * pageSize));

      let dbSort = 'max_thrust.desc';
      if (sortBy === 'motor-asc') dbSort = 'motor_name.asc';
      else if (sortBy === 'motor-desc') dbSort = 'motor_name.desc';
      else if (sortBy === 'company-asc') dbSort = 'company.asc';
      else if (sortBy === 'thrust-asc') dbSort = 'max_thrust.asc';
      else if (sortBy === 'thrust-desc') dbSort = 'max_thrust.desc';
      params.append('order', dbSort);

      if (filterByCategory && filterByCategory !== 'all') {
        params.append('category_id', `eq.${filterByCategory}`);
      }
      if (filterCompany && filterCompany !== 'all') {
        params.append('company', `eq.${filterCompany}`);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const res = await fetch(`/api/motors?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load motors');
      const data = await res.json();
      setMotors((data || []).map(mapRawMotor));

      const countHeader = res.headers.get('X-Total-Count');
      if (countHeader) {
        setTotalFiltered(parseInt(countHeader, 10));
      } else {
        setTotalFiltered(data.length);
      }

      // Fetch dynamic filter KPIs
      const isFiltered = searchQuery || filterByCategory !== 'all' || filterCompany !== 'all';
      if (isFiltered) {
        const kpiParams = new URLSearchParams(params);
        kpiParams.delete('limit');
        kpiParams.delete('offset');
        kpiParams.delete('order');
        kpiParams.set('select', 'id,max_thrust,company,recommended_esc,custom_parameters,motor_name,category_id,operating_voltage');
        
        const kpiRes = await fetch(`/api/motors?${kpiParams.toString()}`);
        if (kpiRes.ok) {
          const kpiData = await kpiRes.json();
          calculateKpis(kpiData);
        }
      } else if (baselineKpis) {
        // Restore baseline stats from cache
        setKpis(baselineKpis);
      }
    } catch (e) {
      console.error('Error fetching motors:', e);
    } finally {
      setIsTableLoading(false);
    }
  };

  useEffect(() => {
    if (!isInitLoading) {
      loadMotors();
    }
  }, [filterByCategory, filterCompany, sortBy, currentPage, pageSize, searchQuery]);

  // Open modal if ?add=true query param is present
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('add') === 'true') {
      setModalMode('add');
      setIsMotorModalOpen(true);
    }
  }, [location.search]);

  // Recalculate KPIs based on filtered subset
  const calculateKpis = (filteredMotors: any[]) => {
    if (filteredMotors.length === 0) {
      setKpis({
        totalMotors: '0',
        avgThrust: '0 g',
        maxThrust: '0 g',
        voltageRange: '—',
      });
      return;
    }

    const convertToKg = (val: number, unit: string) => {
      switch (unit?.toLowerCase()) {
        case 'g': return val / 1000;
        case 'n': return val / 9.80665;
        case 'lb': return val * 0.453592;
        default: return val;
      }
    };

    let minT = Infinity, maxT = -Infinity, totalT = 0, validTCounts = 0;
    const cellSet = new Set<number>();

    filteredMotors.forEach(m => {
      // Parse max thrust string (e.g. "2.4kg" or "2400g")
      const rawThrust = m.max_thrust;
      if (rawThrust) {
        const match = String(rawThrust).trim().match(/^([\d\.]+)\s*(kg|g|n|lb)?/i);
        if (match) {
          const val = parseFloat(match[1]);
          const unit = match[2] || 'kg';
          const kgVal = convertToKg(val, unit);
          
          if (!isNaN(kgVal) && kgVal > 0) {
            if (kgVal < minT) minT = kgVal;
            if (kgVal > maxT) maxT = kgVal;
            totalT += kgVal;
            validTCounts++;
          }
        }
      }

      // Parse cells
      const v = m.operating_voltage;
      if (v) {
        const cellMatches = String(v).match(/(\d+)\s*S/gi);
        if (cellMatches) {
          cellMatches.forEach(match => {
            const num = parseInt(match);
            if (!isNaN(num) && num >= 1 && num <= 24) cellSet.add(num);
          });
        }
      }
    });

    const formatThrust = (kgVal: number) => {
      if (kgVal === Infinity || kgVal === -Infinity) return '0 kg';
      return kgVal >= 1 ? `${kgVal.toFixed(1)} kg` : `${(kgVal * 1000).toFixed(0)} g`;
    };

    // Calculate voltage range label
    let voltageStr = '—';
    if (cellSet.size > 0) {
      const sortedCells = Array.from(cellSet).sort((a, b) => a - b);
      voltageStr = sortedCells.length === 1 
        ? `${sortedCells[0]}S LiPo` 
        : `${sortedCells[0]}S–${sortedCells[sortedCells.length - 1]}S`;
    }

    setKpis({
      totalMotors: String(filteredMotors.length),
      avgThrust: validTCounts > 0 ? `${formatThrust(minT)} - ${formatThrust(maxT)}` : '—',
      maxThrust: validTCounts > 0 ? formatThrust(maxT) : '—',
      voltageRange: voltageStr,
    });
  };

  // Add/Edit category submission handler
  const handleAddCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName) return;

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName, description: newCategoryDesc }),
      });

      if (!res.ok) throw new Error('Failed to create category');
      
      setNewCategoryName('');
      setNewCategoryDesc('');
      setIsCategoryModalOpen(false);
      fetchInitData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Delete category handler
  const handleDeleteCategory = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete category "${name}"? This deletes all associated motors.`)) return;

    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete category');
      
      if (filterByCategory === id) setFilterByCategory('all');
      fetchInitData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Motor Modal Handlers
  const handleOpenAddMotor = () => {
    setModalMode('add');
    setEditMotorId(null);
    setMotorForm({
      name: '',
      company: '',
      thrustVal: '',
      thrustUnit: 'kg',
      categoryId: categories[1]?.id || '',
      esc: '',
      propeller: '',
      linkMotor: '',
      linkEsc: '',
      linkProp: '',
      sku: '',
      kv: '',
      stator: '',
      poles: '',
      winding: '',
      voltage: '',
      internalResistance: '',
      configuration: '',
      shaftDiameter: '',
      dimensions: '',
      awg: '',
      cableLength: '',
      weightWithCable: '',
      weightNoCable: '',
      idleCurrent: '',
      maxPower: '',
      maxCurrent: '',
    });
    setIsMotorModalOpen(true);
  };

  const handleOpenEditMotor = (m: Motor) => {
    setModalMode('edit');
    setEditMotorId(m.id);
    
    // Parse thrust value and unit
    const match = String(m.thrust).trim().match(/^([\d\.]+)\s*(kg|g|n|lb|oz)?/i);
    const tVal = match ? match[1] : '';
    const tUnit = match ? (match[2] || 'kg').toLowerCase() : 'kg';

    setMotorForm({
      name: m.motor,
      company: m.company,
      thrustVal: tVal,
      thrustUnit: tUnit,
      categoryId: m.categoryId,
      esc: m.esc,
      propeller: m.prop,
      linkMotor: m.linkMotor,
      linkEsc: m.linkEsc,
      linkProp: m.linkProp,
      sku: m.custom_parameters?.sku || '',
      kv: String(m.kv_rating || ''),
      stator: m.custom_parameters?.stator_size || '',
      poles: String(m.custom_parameters?.poles || ''),
      winding: m.custom_parameters?.winding_type || '',
      voltage: m.operating_voltage || '',
      internalResistance: m.custom_parameters?.internal_resistance || '',
      configuration: m.custom_parameters?.configuration || '',
      shaftDiameter: m.custom_parameters?.shaft_diameter || '',
      dimensions: m.custom_parameters?.dimensions || '',
      awg: m.custom_parameters?.awg || '',
      cableLength: m.custom_parameters?.cable_length || '',
      weightWithCable: m.custom_parameters?.weight_with_cable || '',
      weightNoCable: m.custom_parameters?.weight_no_cable || '',
      idleCurrent: m.custom_parameters?.idle_current || '',
      maxPower: m.custom_parameters?.max_power || '',
      maxCurrent: m.custom_parameters?.max_current || '',
    });
    setIsMotorModalOpen(true);
  };

  const handleMotorFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const numericThrust = parseFloat(motorForm.thrustVal) || 0;
    let convertedThrust = numericThrust;
    if (motorForm.thrustUnit === 'g') convertedThrust = numericThrust / 1000;
    else if (motorForm.thrustUnit === 'N') convertedThrust = numericThrust / 9.80665;
    else if (motorForm.thrustUnit === 'lb') convertedThrust = numericThrust * 0.453592;

    const payload = {
      motor_name: motorForm.name.trim(),
      company: motorForm.company.trim(),
      max_thrust: `${convertedThrust.toFixed(2)}kg`,
      category_id: motorForm.categoryId,
      recommended_esc: motorForm.esc.trim(),
      recommended_propeller: motorForm.propeller.trim(),
      link_motor: motorForm.linkMotor.trim(),
      link_esc: motorForm.linkEsc.trim(),
      link_propeller: motorForm.linkProp.trim(),
      kv_rating: motorForm.kv ? parseInt(motorForm.kv) : null,
      operating_voltage: motorForm.voltage.trim(),
      custom_parameters: {
        sku: motorForm.sku.trim(),
        stator_size: motorForm.stator.trim(),
        poles: motorForm.poles ? parseInt(motorForm.poles) : null,
        winding_type: motorForm.winding.trim(),
        internal_resistance: motorForm.internalResistance.trim(),
        configuration: motorForm.configuration.trim(),
        shaft_diameter: motorForm.shaftDiameter.trim(),
        dimensions: motorForm.dimensions.trim(),
        awg: motorForm.awg.trim(),
        cable_length: motorForm.cableLength.trim(),
        weight_with_cable: motorForm.weightWithCable.trim(),
        weight_no_cable: motorForm.weightNoCable.trim(),
        idle_current: motorForm.idleCurrent.trim(),
        max_power: motorForm.maxPower.trim(),
        max_current: motorForm.maxCurrent.trim(),
      }
    };

    try {
      let res;
      if (modalMode === 'add') {
        res = await fetch('/api/motors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`/api/db/motors/${editMotorId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) throw new Error('Operation failed');
      setIsMotorModalOpen(false);
      loadMotors();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteMotor = async (id: string, name: string) => {
    if (!window.confirm(`Delete motor "${name}"?`)) return;

    try {
      const res = await fetch(`/api/db/motors/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete motor');
      loadMotors();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Compare Selected items
  const comparedFullData = motors.filter(m => comparedIds.includes(m.id));

  // Specs Profile modal target
  const activeProfileMotor = motors.find(m => m.id === selectedProfileId);

  return (
    <Layout onSearchChange={setSearchQuery} onCategoryChange={setFilterByCategory} searchPlaceholder="Search motor model, brand...">
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[1800px] w-full mx-auto relative z-10">
        
        {/* Catalog Dashboard Title Block */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-[#003366]/10 dark:bg-blue-950/40 text-[#003366] dark:text-[#a7c8ff]">
                Specifications Console
              </span>
              <span className="text-xs text-slate-400 font-medium">UAV Powertrains</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              {filterByCategory === 'all' 
                ? 'Motors' 
                : `${categories.find(c => c.id === filterByCategory)?.name || 'Filtered'} Class`}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              {filterByCategory === 'all' 
                ? 'All motors across all thrust classes (excluding custom mock categories)' 
                : categories.find(c => c.id === filterByCategory)?.desc}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={handleOpenAddMotor}
              className="bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" /> Add Motor
            </button>
          </div>
        </header>

        {/* Dashboard KPIs Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard 
            title="Total Motors" 
            value={isInitLoading ? <div className="h-8 w-12 bg-slate-200 rounded animate-pulse"></div> : kpis.totalMotors} 
            sub="In active class" 
            icon={<Database className="w-4 h-4" />} 
          />
          <KPICard 
            title="Thrust Range" 
            value={isInitLoading ? <div className="h-8 w-24 bg-slate-200 rounded animate-pulse"></div> : kpis.avgThrust} 
            sub="Min-Max Range" 
            icon={<Activity className="w-4 h-4" />} 
            iconBgColor="bg-emerald-50 dark:bg-emerald-950/30"
            iconTextColor="text-emerald-600 dark:text-emerald-400"
          />
          <KPICard 
            title="Max Thrust" 
            value={isInitLoading ? <div className="h-8.5 w-20 bg-slate-200 rounded animate-pulse"></div> : kpis.maxThrust} 
            sub="Peak thrust recorded" 
            icon={<Zap className="w-4 h-4" />} 
            iconBgColor="bg-amber-50 dark:bg-amber-950/30"
            iconTextColor="text-amber-500 dark:text-amber-400"
          />
          <KPICard 
            title="Voltage Range" 
            value={isInitLoading ? <div className="h-8 w-24 bg-slate-200 rounded animate-pulse"></div> : kpis.voltageRange} 
            sub="Supported LiPo cells" 
            icon={<Battery className="w-4 h-4" />} 
            iconBgColor="bg-blue-50 dark:bg-blue-950/30"
            iconTextColor="text-blue-500 dark:text-blue-400"
          />
        </div>

        {/* Layout: Sidebar list and Table */}
        <div className="flex flex-col lg:flex-row items-start gap-6 w-full mt-3">
          
          {/* LEFT COLUMN: Thrust Category Tabs */}
          <aside className="w-full lg:w-64 shrink-0 flex flex-col gap-4">
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-5">
              <h3 
                onClick={() => setIsThrustLevelsExpanded(!isThrustLevelsExpanded)}
                className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs mb-4 border-b border-slate-100 dark:border-slate-800 pb-2.5 flex items-center justify-between uppercase tracking-wide cursor-pointer select-none"
              >
                <div className="flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-[#003366] dark:text-blue-400" />
                  Thrust Levels
                </div>
                {isThrustLevelsExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400 hover:text-slate-600 transition-colors" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400 hover:text-slate-600 transition-colors" />
                )}
              </h3>
              
              {isThrustLevelsExpanded && (
                <div className="flex flex-col gap-1.5 transition-all duration-300">
                  {isInitLoading ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <div key={idx} className="h-8 w-full bg-slate-150 rounded animate-pulse"></div>
                    ))
                  ) : (
                    categories.map(cat => (
                      <div 
                        key={cat.id} 
                        className={`flex justify-between items-center px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          filterByCategory === cat.id 
                            ? 'bg-[#003366] text-white' 
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                        onClick={() => {
                          setFilterByCategory(cat.id === filterByCategory ? 'all' : cat.id);
                          setFilterCompany('all');
                          setCurrentPage(1);
                        }}
                      >
                        <span className="truncate pr-2">{cat.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                            filterByCategory === cat.id 
                              ? 'bg-white/20 text-white' 
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}>
                            {categoryCounts[cat.id] || 0}
                          </span>
                          {isAdmin && cat.id !== 'all' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCategory(cat.id, cat.name);
                              }}
                              className={`p-0.5 rounded hover:bg-rose-500/10 hover:text-rose-500 ${
                                filterByCategory === cat.id ? 'text-white' : 'text-slate-400'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {isAdmin && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-4">
                  <button 
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="w-full bg-[#003366] hover:bg-[#002244] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-semibold py-2 px-4 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" /> Add Level
                  </button>
                </div>
              )}
            </div>
          </aside>

          {/* RIGHT COLUMN: Table View */}
          <div className="flex-1 min-w-0 w-full">
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl overflow-hidden p-5">
              
              {/* Table Controls (Sorting & Filtering) */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 border-b border-slate-100 dark:border-slate-800 pb-4">
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-[16px]">
                  Motor Specifications
                </h3>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Brand Filter */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1">
                      <Filter className="w-3.5 h-3.5" /> Brand:
                    </label>
                    <select 
                      value={filterCompany}
                      onChange={(e) => { setFilterCompany(e.target.value); setCurrentPage(1); }}
                      className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-355 px-2.5 py-1.5 outline-none focus:border-[#003366]"
                    >
                      <option value="all">All Brands</option>
                      {brands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>

                  {/* Sort */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1">
                      <ArrowUpDown className="w-3.5 h-3.5" /> Sort:
                    </label>
                    <select 
                      value={sortBy}
                      onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}
                      className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-355 px-2.5 py-1.5 outline-none focus:border-[#003366]"
                    >
                      <option value="thrust-desc">Thrust: High to Low</option>
                      <option value="thrust-asc">Thrust: Low to High</option>
                      <option value="motor-asc">Model: A-Z</option>
                      <option value="motor-desc">Model: Z-A</option>
                      <option value="company-asc">Brand: A-Z</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Specs Table */}
              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[900px] text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-mono uppercase tracking-wider">
                      <th className="py-3 px-2 w-10 text-center">Compare</th>
                      <th className="py-3 px-2 font-semibold text-[#001e40] dark:text-blue-300">Motor Model</th>
                      <th className="py-3 px-2">Brand</th>
                      <th className="py-3 px-2">KV</th>
                      <th className="py-3 px-2">Voltage</th>
                      <th className="py-3 px-2">Thrust</th>
                      <th className="py-3 px-2">Propeller</th>
                      <th className="py-3 px-2">ESC</th>
                      <th className="py-3 px-2 text-center w-24">Links</th>
                      <th className="py-3 px-2 text-right w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {isTableLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="py-4 px-2"><div className="h-4 w-4 bg-slate-200 rounded mx-auto"></div></td>
                          <td className="py-4 px-2"><div className="h-4 w-36 bg-slate-200 rounded"></div></td>
                          <td className="py-4 px-2"><div className="h-4 w-20 bg-slate-200 rounded"></div></td>
                          <td className="py-4 px-2"><div className="h-4 w-12 bg-slate-200 rounded"></div></td>
                          <td className="py-4 px-2"><div className="h-4 w-14 bg-slate-200 rounded"></div></td>
                          <td className="py-4 px-2"><div className="h-4 w-16 bg-slate-200 rounded"></div></td>
                          <td className="py-4 px-2"><div className="h-4 w-20 bg-slate-200 rounded"></div></td>
                          <td className="py-4 px-2"><div className="h-4 w-20 bg-slate-200 rounded"></div></td>
                          <td className="py-4 px-2"><div className="h-4 w-12 bg-slate-200 rounded mx-auto"></div></td>
                          <td className="py-4 px-2"><div className="h-4 w-14 bg-slate-200 rounded ml-auto"></div></td>
                        </tr>
                      ))
                    ) : motors.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <Info className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-2" />
                            <h4 className="text-sm font-bold text-[#001e40] dark:text-slate-200">No Motors Found</h4>
                            <p className="text-xs text-slate-400 mt-1">No motors match the current filters or queries.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      motors.map(m => {
                        const isChecked = comparedIds.includes(m.id);
                        
                        // Hash color code for initials badge
                        const hash = m.company.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                        const thumbHue = hash % 360;
                        const badgeBg = `hsl(${thumbHue}, 80%, 96%)`;
                        const badgeText = `hsl(${thumbHue}, 85%, 35%)`;

                        return (
                          <tr 
                            key={m.id} 
                            className={`hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors ${
                              isChecked ? 'bg-blue-50/30 dark:bg-blue-950/20' : ''
                            }`}
                          >
                            <td className="py-3 px-2 text-center">
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleCompare(m.id, 'motor')}
                                className="rounded border-slate-300 dark:border-slate-700 text-[#003366] dark:text-blue-500 focus:ring-[#003366]/20 cursor-pointer"
                              />
                            </td>
                            <td className="py-3 px-2 font-semibold text-[#001e40] dark:text-slate-100">
                              <button 
                                onClick={() => setSelectedProfileId(m.id)}
                                className="hover:text-blue-600 dark:hover:text-blue-400 text-left cursor-pointer focus:outline-none"
                              >
                                {m.motor}
                              </button>
                            </td>
                            <td className="py-3 px-2 text-xs font-semibold">
                              <span 
                                className="px-2 py-0.5 rounded-full border text-[11px] font-bold"
                                style={{ backgroundColor: badgeBg, color: badgeText, borderColor: `hsl(${thumbHue}, 80%, 90%)` }}
                              >
                                {m.company}
                              </span>
                            </td>
                            <td className="py-3 px-2 font-mono text-xs">{m.kv_rating ? `${m.kv_rating} KV` : '—'}</td>
                            <td className="py-3 px-2 text-xs font-bold text-slate-500 dark:text-slate-400">{m.operating_voltage || '—'}</td>
                            <td className="py-3 px-2 font-bold"><span className="badge-thrust">{m.thrust}</span></td>
                            <td className="py-3 px-2 text-xs text-slate-500 dark:text-slate-400 font-semibold italic">{m.prop || '—'}</td>
                            <td className="py-3 px-2 text-xs text-slate-500 dark:text-slate-400 font-semibold">{m.esc || '—'}</td>
                            
                            {/* Link cells */}
                            <td className="py-3 px-2 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {m.linkMotor && (
                                  <a href={m.linkMotor} target="_blank" rel="noreferrer" title="Motor Spec PDF" className="p-1 text-slate-400 hover:text-blue-600">
                                    <LinkIcon className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button 
                                  onClick={() => setShareItem({ type: 'motor', name: m.motor })}
                                  className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                                  title="Share motor specs"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </button>
                                {isAdmin && (
                                  <>
                                    <button 
                                      onClick={() => handleOpenEditMotor(m)}
                                      className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                                      title="Edit motor Specs"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteMotor(m.id, m.motor)}
                                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                      title="Delete motor entry"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
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

              {/* Pagination block */}
              {totalFiltered > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span>Show:</span>
                      <select 
                        value={pageSize}
                        onChange={(e) => { setPageSize(parseInt(e.target.value)); setCurrentPage(1); }}
                        className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded pl-2 pr-7 py-0.5 outline-none focus:border-[#003366] cursor-pointer"
                      >
                        <option value="10">10</option>
                        <option value="15">15</option>
                        <option value="25">25</option>
                      </select>
                    </div>
                    <span>Showing {Math.min(totalFiltered, (currentPage - 1) * pageSize + 1)}-{Math.min(totalFiltered, currentPage * pageSize)} of {totalFiltered} motors</span>
                  </div>

                  <div className="flex gap-2.5">
                    <button 
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 rounded border border-slate-200/80 dark:border-slate-800 disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Prev
                    </button>
                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalFiltered / pageSize), prev + 1))}
                      disabled={currentPage >= Math.ceil(totalFiltered / pageSize)}
                      className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 rounded border border-slate-200/80 dark:border-slate-800 disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Render bottom dynamic Compare Drawer */}
        <CompareDrawer 
          selectedItems={comparedFullData.map(m => ({ id: m.id, name: m.motor, brand: m.company }))} 
          onOpenCompareModal={() => setIsCompareModalOpen(true)}
        />

        {/* Render detailed comparison modal */}
        <CompareModal 
          isOpen={isCompareModalOpen}
          onClose={() => setIsCompareModalOpen(false)}
          items={comparedFullData}
          type="motor"
        />

        {/* Modal: View Single Motor Profile Overlay */}
        {activeProfileMotor && (
          <div className="modal-backdrop show" style={{ zIndex: 1050 }}>
            <div className="modal-container bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden mx-4 animate-scale-in">
              <div className="modal-header flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3.5 mb-3">
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-[17px] flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-blue-500" />
                  Motor Technical Specifications
                </h3>
                <button 
                  onClick={() => setSelectedProfileId(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="modal-body flex-1 overflow-y-auto pr-1 space-y-4">
                {/* Profile Header Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-50 to-blue-50/30 dark:from-slate-950 dark:to-slate-900/60 p-4 rounded-xl border border-slate-200/70 dark:border-slate-800/80">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-blue-600 text-white font-extrabold text-lg flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
                      {activeProfileMotor.motor.substring(0, 1).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <h2 className="text-lg font-extrabold text-[#001e40] dark:text-slate-100 leading-tight">{activeProfileMotor.motor}</h2>
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-0.5">Manufacturer: {activeProfileMotor.company}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {activeProfileMotor.kv_rating && (
                      <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold">
                        {activeProfileMotor.kv_rating} KV
                      </span>
                    )}
                    {activeProfileMotor.thrust && (
                      <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-bold">
                        Max: {activeProfileMotor.thrust}
                      </span>
                    )}
                  </div>
                </div>

                {/* Section 1: Electrical Performance */}
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-slate-950/40">
                  <h4 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 font-mono uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" /> Electrical Performance
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">KV Rating:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.kv_rating ? `${activeProfileMotor.kv_rating} KV` : '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Voltage Range:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.operating_voltage || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Max Thrust:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.thrust || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Internal Resistance:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.internal_resistance || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Idle Current @10V:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.idle_current || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Max Power (180s):</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.max_power || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Max Current (180s):</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.max_current || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Section 2: Mechanical & Physical Specs */}
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-slate-950/40">
                  <h4 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 font-mono uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-blue-500" /> Mechanical & Physical Specs
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Configuration:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.configuration || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Stator Size:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.stator_size || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Shaft Diameter:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.shaft_diameter || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Dimensions:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.dimensions || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Wire AWG:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.awg || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Cable Length:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.cable_length || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Weight (Inc. Cable):</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.weight_with_cable || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Weight (Exc. Cable):</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.weight_no_cable || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Section 3: Powertrain & Recommendations */}
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-slate-950/40">
                  <h4 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 font-mono uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-500" /> Powertrain Matchup & Specs
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Recommended ESC:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.esc || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Recommended Propeller:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.prop || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Winding Type:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.winding_type || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/40">
                      <span className="text-slate-500 font-medium">Motor Poles:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{activeProfileMotor.custom_parameters?.poles || '—'}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800/60 pt-4 mt-2">
                  <h4 className="text-xs font-bold text-slate-400 font-mono uppercase mb-2">Reference Spec Links</h4>
                  <div className="flex flex-wrap gap-3">
                    {activeProfileMotor.linkMotor && (
                      <a href={activeProfileMotor.linkMotor} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs rounded-lg text-slate-600 dark:text-slate-300">
                        <LinkIcon className="w-3.5 h-3.5" /> Motor Specsheet
                      </a>
                    )}
                    {activeProfileMotor.linkEsc && (
                      <a href={activeProfileMotor.linkEsc} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs rounded-lg text-slate-600 dark:text-slate-300">
                        <LinkIcon className="w-3.5 h-3.5" /> ESC Specs
                      </a>
                    )}
                    {activeProfileMotor.linkProp && (
                      <a href={activeProfileMotor.linkProp} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs rounded-lg text-slate-600 dark:text-slate-300">
                        <LinkIcon className="w-3.5 h-3.5" /> Propeller Specs
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShareMotorOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share Specs
                  </button>
                  <button
                    onClick={() => navigate(`/motor/profile/${encodeURIComponent(activeProfileMotor.motor)}`)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    Open Page ↗
                  </button>
                </div>
                <button 
                  onClick={() => setSelectedProfileId(null)}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-button text-[13px] px-5 py-2.5 rounded-xl font-semibold transition-colors cursor-pointer"
                >
                  Close Profile
                </button>
              </div>
            </div>
          </div>
        )}
        {activeProfileMotor && (
          <ShareModal
            isOpen={shareMotorOpen}
            onClose={() => setShareMotorOpen(false)}
            type="motor"
            name={activeProfileMotor.motor}
          />
        )}
        {shareItem && (
          <ShareModal
            isOpen={!!shareItem}
            onClose={() => setShareItem(null)}
            type="motor"
            name={shareItem.name}
          />
        )}

        {/* Modal: Add Category */}
        {isCategoryModalOpen && (
          <div className="modal-backdrop show" style={{ zIndex: 1050 }}>
            <div className="modal-container bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6 max-w-md w-full mx-4 animate-scale-in">
              <div className="modal-header flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-[16px]">
                  Add Thrust Level Class
                </h3>
                <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAddCategorySubmit} className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase mb-2">Class Name *</label>
                  <input 
                    type="text" 
                    required 
                    value={newCategoryName} 
                    onChange={e => setNewCategoryName(e.target.value)} 
                    placeholder="e.g. 5kg Thrust"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-sm outline-none focus:border-[#003366]"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase mb-2">Description</label>
                  <textarea 
                    value={newCategoryDesc} 
                    onChange={e => setNewCategoryDesc(e.target.value)} 
                    placeholder="Class range, typical prop diameters, voltage cells"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-sm outline-none focus:border-[#003366]"
                    rows={3}
                  />
                </div>
                <button type="submit" className="bg-[#003366] hover:bg-[#002244] text-white text-xs font-semibold py-2.5 px-4 rounded-xl cursor-pointer">
                  Save Category
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add/Edit Motor Entry */}
        {isMotorModalOpen && (
          <div className="modal-backdrop show" style={{ zIndex: 1050 }}>
            <div className="modal-container bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden mx-4 animate-scale-in">
              <div className="modal-header flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3.5 mb-4">
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-[17px] flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-[#003366] dark:text-[#a7c8ff]" />
                  {modalMode === 'add' ? 'Add New Motor Entry' : 'Edit Motor Specifications'}
                </h3>
                <button onClick={() => setIsMotorModalOpen(false)} className="text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleMotorFormSubmit} className="flex flex-col flex-1 overflow-hidden">
                <div className="modal-body flex-1 overflow-y-auto pr-1 py-1 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-slate-550 dark:text-slate-400 font-mono uppercase mb-2">Motor Model Name *</label>
                      <input 
                        type="text" 
                        required 
                        value={motorForm.name} 
                        onChange={e => setMotorForm({...motorForm, name: e.target.value})}
                        placeholder="e.g. U12 II KV120" 
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm outline-none focus:border-[#003366]"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-slate-550 dark:text-slate-400 font-mono uppercase mb-2">Manufacturer / Company *</label>
                      <input 
                        type="text" 
                        required 
                        value={motorForm.company} 
                        onChange={e => setMotorForm({...motorForm, company: e.target.value})}
                        placeholder="e.g. T-Motor" 
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm outline-none focus:border-[#003366]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-slate-550 dark:text-slate-400 font-mono uppercase mb-2">Max Thrust Value *</label>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          required 
                          step="any"
                          value={motorForm.thrustVal} 
                          onChange={e => setMotorForm({...motorForm, thrustVal: e.target.value})}
                          placeholder="e.g. 2.4" 
                          className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm outline-none focus:border-[#003366]"
                        />
                        <select 
                          value={motorForm.thrustUnit} 
                          onChange={e => setMotorForm({...motorForm, thrustUnit: e.target.value})}
                          className="w-20 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 text-xs font-bold focus:border-[#003366]"
                        >
                          <option value="kg">kg</option>
                          <option value="g">g</option>
                          <option value="N">N</option>
                          <option value="lb">lb</option>
                        </select>
                      </div>
                      {motorForm.thrustUnit !== 'kg' && motorForm.thrustVal && !isNaN(parseFloat(motorForm.thrustVal)) && (
                        <div className="text-xs text-[#003366] dark:text-blue-400 mt-1.5 font-semibold font-mono">
                          Live Conversion: {((val, unit) => {
                            const numeric = parseFloat(val);
                            if (unit === 'g') return (numeric / 1000).toFixed(3);
                            if (unit === 'N') return (numeric / 9.80665).toFixed(3);
                            if (unit === 'lb') return (numeric * 0.453592).toFixed(3);
                            return numeric.toFixed(3);
                          })(motorForm.thrustVal, motorForm.thrustUnit)} kg
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-slate-550 dark:text-slate-400 font-mono uppercase mb-2">Thrust Level Category *</label>
                      <select 
                        value={motorForm.categoryId} 
                        onChange={e => setMotorForm({...motorForm, categoryId: e.target.value})}
                        required
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm outline-none focus:border-[#003366]"
                      >
                        {categories.filter(c => c.id !== 'all').map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-slate-550 dark:text-slate-400 font-mono uppercase mb-2">Recommended ESC</label>
                      <input 
                        type="text" 
                        value={motorForm.esc} 
                        onChange={e => setMotorForm({...motorForm, esc: e.target.value})}
                        placeholder="e.g. FLAME 100A" 
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm outline-none focus:border-[#003366]"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs font-semibold text-slate-550 dark:text-slate-400 font-mono uppercase mb-2">Recommended Propeller</label>
                      <input 
                        type="text" 
                        value={motorForm.propeller} 
                        onChange={e => setMotorForm({...motorForm, propeller: e.target.value})}
                        placeholder="e.g. 22x7.2" 
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm outline-none focus:border-[#003366]"
                      />
                    </div>
                  </div>

                  {/* Ref links */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                    <h4 className="text-xs font-bold text-slate-400 font-mono uppercase mb-2">Reference Web Links</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input 
                        type="url" 
                        value={motorForm.linkMotor} 
                        onChange={e => setMotorForm({...motorForm, linkMotor: e.target.value})}
                        placeholder="Motor Spec Link" 
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-xs outline-none"
                      />
                      <input 
                        type="url" 
                        value={motorForm.linkEsc} 
                        onChange={e => setMotorForm({...motorForm, linkEsc: e.target.value})}
                        placeholder="ESC Spec Link" 
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-xs outline-none"
                      />
                      <input 
                        type="url" 
                        value={motorForm.linkProp} 
                        onChange={e => setMotorForm({...motorForm, linkProp: e.target.value})}
                        placeholder="Propeller Spec Link" 
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-xs outline-none"
                      />
                    </div>
                  </div>

                  {/* Electrical & Performance Details */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                    <h4 className="text-xs font-bold text-slate-400 font-mono uppercase mb-2.5">Electrical & Power Specifications</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">KV Rating</label>
                        <input 
                          type="number" 
                          value={motorForm.kv} 
                          onChange={e => setMotorForm({...motorForm, kv: e.target.value})}
                          placeholder="e.g. 120" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Operating Voltage</label>
                        <input 
                          type="text" 
                          value={motorForm.voltage} 
                          onChange={e => setMotorForm({...motorForm, voltage: e.target.value})}
                          placeholder="e.g. 3-4S or 6-12S" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Internal Resistance</label>
                        <input 
                          type="text" 
                          value={motorForm.internalResistance} 
                          onChange={e => setMotorForm({...motorForm, internalResistance: e.target.value})}
                          placeholder="e.g. 50mΩ" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Idle Current</label>
                        <input 
                          type="text" 
                          value={motorForm.idleCurrent} 
                          onChange={e => setMotorForm({...motorForm, idleCurrent: e.target.value})}
                          placeholder="e.g. 0.5A@10V" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Max Power (180S)</label>
                        <input 
                          type="text" 
                          value={motorForm.maxPower} 
                          onChange={e => setMotorForm({...motorForm, maxPower: e.target.value})}
                          placeholder="e.g. 500W" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Max Current (180S)</label>
                        <input 
                          type="text" 
                          value={motorForm.maxCurrent} 
                          onChange={e => setMotorForm({...motorForm, maxCurrent: e.target.value})}
                          placeholder="e.g. 25A" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">SKU / Model ID</label>
                        <input 
                          type="text" 
                          value={motorForm.sku} 
                          onChange={e => setMotorForm({...motorForm, sku: e.target.value})}
                          placeholder="e.g. U12-KV120" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Winding Type</label>
                        <input 
                          type="text" 
                          value={motorForm.winding} 
                          onChange={e => setMotorForm({...motorForm, winding: e.target.value})}
                          placeholder="e.g. Single Strand" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mechanical & Physical Details */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                    <h4 className="text-xs font-bold text-slate-400 font-mono uppercase mb-2.5">Mechanical & Physical Specifications</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Configuration</label>
                        <input 
                          type="text" 
                          value={motorForm.configuration} 
                          onChange={e => setMotorForm({...motorForm, configuration: e.target.value})}
                          placeholder="e.g. 12N14P" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Stator Size</label>
                        <input 
                          type="text" 
                          value={motorForm.stator} 
                          onChange={e => setMotorForm({...motorForm, stator: e.target.value})}
                          placeholder="e.g. 4120" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Shaft Diameter</label>
                        <input 
                          type="text" 
                          value={motorForm.shaftDiameter} 
                          onChange={e => setMotorForm({...motorForm, shaftDiameter: e.target.value})}
                          placeholder="e.g. 4mm" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Motor Dimensions</label>
                        <input 
                          type="text" 
                          value={motorForm.dimensions} 
                          onChange={e => setMotorForm({...motorForm, dimensions: e.target.value})}
                          placeholder="e.g. Φ41.8×30.75mm" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Wire AWG</label>
                        <input 
                          type="text" 
                          value={motorForm.awg} 
                          onChange={e => setMotorForm({...motorForm, awg: e.target.value})}
                          placeholder="e.g. 18#" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Cable Length</label>
                        <input 
                          type="text" 
                          value={motorForm.cableLength} 
                          onChange={e => setMotorForm({...motorForm, cableLength: e.target.value})}
                          placeholder="e.g. 600mm" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Weight (Inc. Cable)</label>
                        <input 
                          type="text" 
                          value={motorForm.weightWithCable} 
                          onChange={e => setMotorForm({...motorForm, weightWithCable: e.target.value})}
                          placeholder="e.g. 128g" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block mb-1">Weight (Exc. Cable)</label>
                        <input 
                          type="text" 
                          value={motorForm.weightNoCable} 
                          onChange={e => setMotorForm({...motorForm, weightNoCable: e.target.value})}
                          placeholder="e.g. 97g" 
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-2.5 text-xs outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer border-t border-slate-100 dark:border-slate-800 pt-4 mt-4 flex justify-end gap-2.5">
                  <button 
                    type="button" 
                    onClick={() => setIsMotorModalOpen(false)}
                    className="bg-slate-50 border border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="bg-[#003366] hover:bg-[#002244] dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
                  >
                    Save Specifications
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </Layout>
  );
};
