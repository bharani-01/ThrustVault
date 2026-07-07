import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useCompare } from '../context/CompareContext';
import { useNavigate } from 'react-router-dom';
import { CompareDrawer } from '../components/CompareDrawer';
import { CompareModal } from '../components/CompareModal';
import { 
  ChevronRight, Info, Check, RotateCcw, Cpu, Sliders, Zap, 
  ArrowRight, RefreshCw, Compass, ShieldAlert, Award, AlertTriangle, ExternalLink, Loader2
} from 'lucide-react';

interface Motor {
  id: string;
  name: string;
  brand: string;
  kv: number;
  voltage: string;
  thrust: number; // in kg
  thrustRaw: string;
  propeller: string;
  esc: string;
  // Advanced spec properties
  weight: number;      // in grams
  maxCurrent: number;  // in Amps
  maxPower: number;    // in Watts
  statorClass: 'micro' | 'mini' | 'standard' | 'heavy';
}

export const MotorFinder: React.FC = () => {
  const { toggleCompare, comparedIds } = useCompare();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [isInitLoading, setIsInitLoading] = useState(true);

  // Wizard Steps
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uavType, setUavType] = useState<'cinewhoop' | 'freestyle' | 'heavy' | 'agri' | 'endurance' | 'micro' | 'fixedwing' | 'custom'>('freestyle');

  // Sliders Filter States
  const [kvRange, setKvRange] = useState<[number, number]>([100, 2000]);
  const [thrustRange, setThrustRange] = useState<[number, number]>([0.5, 15]);
  const [weightRange, setWeightRange] = useState<[number, number]>([0, 1500]);

  const [selectedCells, setSelectedCells] = useState<number[]>([4, 6]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [statorClass, setStatorClass] = useState<'all' | 'micro' | 'mini' | 'standard' | 'heavy'>('all');
  
  // Customization Options
  const [thrustMargin, setThrustMargin] = useState<number>(2.0); // TWR Margin
  
  // Estimator Widget Inputs
  const [totalWeight, setTotalWeight] = useState<number>(750); // Drone AUW in grams
  const [motorCount, setMotorCount] = useState<number>(4); // Quadcopter by default

  // All unique brands in database
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);

  // Matches list
  const [matchedMotors, setMatchedMotors] = useState<Motor[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState<boolean>(false);

  // Fetch unique brands on mount
  const fetchAvailableBrands = async () => {
    setIsInitLoading(true);
    try {
      const res = await fetch('/api/motors?select=company&limit=600');
      if (res.ok) {
        const data = await res.json();
        const brands = Array.from(new Set(data.map((m: any) => m.company || m.brand).filter(Boolean))) as string[];
        setAvailableBrands(brands.sort());
      }
    } catch (err) {
      console.error('Error loading brands:', err);
    } finally {
      setIsInitLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableBrands();
  }, []);

  // Fetch matching motors from backend
  const fetchMatchedMotors = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('min_kv', String(kvRange[0]));
      params.append('max_kv', String(kvRange[1]));
      params.append('min_thrust', String(thrustRange[0]));
      params.append('max_thrust', String(thrustRange[1]));
      params.append('min_weight', String(weightRange[0]));
      params.append('max_weight', String(weightRange[1]));
      
      if (selectedCells.length > 0) {
        params.append('cells', selectedCells.join(','));
      }
      if (selectedBrands.length > 0) {
        params.append('brands', selectedBrands.join(','));
      }
      if (statorClass !== 'all') {
        params.append('stator_class', statorClass);
      }

      const res = await fetch(`/api/motors/finder?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMatchedMotors(data || []);
      }
    } catch (err) {
      console.error('Error fetching matched motors:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Run backend query whenever Step 3 is active or filters are updated
  useEffect(() => {
    if (step === 3) {
      fetchMatchedMotors();
    }
  }, [step, kvRange, thrustRange, weightRange, selectedCells, selectedBrands, statorClass]);

  // Update slider bounds based on UAV application preset
  const handleUavTypeSelect = (type: typeof uavType) => {
    setUavType(type);
    if (type === 'cinewhoop') {
      setKvRange([1200, 2800]);
      setThrustRange([0.2, 1.2]);
      setWeightRange([15, 60]);
      setSelectedCells([3, 4]);
      setTotalWeight(450);
      setMotorCount(4);
      setThrustMargin(1.8);
      setStatorClass('mini');
    } else if (type === 'freestyle') {
      setKvRange([1600, 2500]);
      setThrustRange([0.8, 2.3]);
      setWeightRange([25, 45]);
      setSelectedCells([4, 6]);
      setTotalWeight(700);
      setMotorCount(4);
      setThrustMargin(2.2);
      setStatorClass('standard');
    } else if (type === 'heavy') {
      setKvRange([150, 600]);
      setThrustRange([3.5, 12]);
      setWeightRange([80, 400]);
      setSelectedCells([6, 12]);
      setTotalWeight(8500);
      setMotorCount(8);
      setThrustMargin(2.0);
      setStatorClass('heavy');
    } else if (type === 'agri') {
      setKvRange([80, 200]);
      setThrustRange([9, 28]);
      setWeightRange([250, 1100]);
      setSelectedCells([12, 14]);
      setTotalWeight(22000);
      setMotorCount(6);
      setThrustMargin(2.0);
      setStatorClass('heavy');
    } else if (type === 'endurance') {
      setKvRange([300, 900]);
      setThrustRange([1.2, 4.0]);
      setWeightRange([40, 130]);
      setSelectedCells([4, 6, 8]);
      setTotalWeight(2400);
      setMotorCount(4);
      setThrustMargin(1.8);
      setStatorClass('heavy');
    } else if (type === 'micro') {
      setKvRange([8000, 22000]);
      setThrustRange([0.02, 0.18]);
      setWeightRange([1.5, 9]);
      setSelectedCells([1, 2]);
      setTotalWeight(45);
      setMotorCount(4);
      setThrustMargin(1.5);
      setStatorClass('micro');
    } else if (type === 'fixedwing') {
      setKvRange([900, 1600]);
      setThrustRange([0.6, 2.5]);
      setWeightRange([20, 95]);
      setSelectedCells([3, 4]);
      setTotalWeight(1200);
      setMotorCount(1);
      setThrustMargin(1.5);
      setStatorClass('all');
    }
  };

  const handleCellToggle = (cell: number) => {
    setSelectedCells(prev => 
      prev.includes(cell) ? prev.filter(c => c !== cell) : [...prev, cell]
    );
  };

  const handleBrandToggle = (brand: string) => {
    setSelectedBrands(prev =>
      prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]
    );
  };

  // Reset filters
  const resetFilters = () => {
    setKvRange([100, 2000]);
    setThrustRange([0.5, 15]);
    setWeightRange([0, 1500]);
    setSelectedCells([4, 6]);
    setSelectedBrands([]);
    setStatorClass('all');
    setTotalWeight(750);
    setMotorCount(4);
    setThrustMargin(2.0);
    setUavType('custom');
    setStep(1);
  };

  const renderDroneSvg = (type: string) => {
    const strokeColor = "currentColor";
    switch (type) {
      case 'cinewhoop':
        return (
          <svg viewBox="0 0 100 100" className="w-12 h-12 text-[#003366] dark:text-blue-400 opacity-80 group-hover:scale-105 transition-transform duration-300">
            <circle cx="32" cy="32" r="15" fill="none" stroke={strokeColor} strokeWidth="1.5" strokeDasharray="3 2" />
            <circle cx="68" cy="32" r="15" fill="none" stroke={strokeColor} strokeWidth="1.5" strokeDasharray="3 2" />
            <circle cx="32" cy="68" r="15" fill="none" stroke={strokeColor} strokeWidth="1.5" strokeDasharray="3 2" />
            <circle cx="68" cy="68" r="15" fill="none" stroke={strokeColor} strokeWidth="1.5" strokeDasharray="3 2" />
            <path d="M50,32 L50,68 M32,50 L68,50" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
            <rect x="43" y="43" width="14" height="14" rx="2" fill="currentColor" opacity="0.25" stroke={strokeColor} strokeWidth="1" />
          </svg>
        );
      case 'freestyle':
        return (
          <svg viewBox="0 0 100 100" className="w-12 h-12 text-[#003366] dark:text-blue-400 opacity-80 group-hover:scale-105 transition-transform duration-300">
            <path d="M22,22 L78,78 M22,78 L78,22" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" />
            <rect x="42" y="32" width="16" height="36" rx="3" fill="currentColor" opacity="0.25" stroke={strokeColor} strokeWidth="1" />
            <circle cx="22" cy="22" r="4.5" fill="currentColor" />
            <circle cx="78" cy="22" r="4.5" fill="currentColor" />
            <circle cx="22" cy="78" r="4.5" fill="currentColor" />
            <circle cx="78" cy="78" r="4.5" fill="currentColor" />
          </svg>
        );
      case 'heavy':
        return (
          <svg viewBox="0 0 100 100" className="w-12 h-12 text-[#003366] dark:text-blue-400 opacity-80 group-hover:scale-105 transition-transform duration-300">
            <path d="M50,15 L50,85 M15,50 L85,50 M25,25 L75,75 M25,75 L75,25" stroke={strokeColor} strokeWidth="2" />
            <circle cx="50" cy="15" r="4" fill="currentColor" />
            <circle cx="50" cy="85" r="4" fill="currentColor" />
            <circle cx="15" cy="50" r="4" fill="currentColor" />
            <circle cx="85" cy="50" r="4" fill="currentColor" />
            <circle cx="50" cy="50" r="14" fill="currentColor" opacity="0.25" stroke={strokeColor} strokeWidth="1.5" />
          </svg>
        );
      case 'agri':
        return (
          <svg viewBox="0 0 100 100" className="w-12 h-12 text-[#003366] dark:text-blue-400 opacity-80 group-hover:scale-105 transition-transform duration-300">
            <path d="M50,12 L50,88 M17,31 L83,69 M17,69 L83,31" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M12,42 L12,58 M88,42 L88,58" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" />
            <rect x="40" y="40" width="20" height="20" rx="10" fill="currentColor" opacity="0.3" stroke={strokeColor} strokeWidth="1.5" />
          </svg>
        );
      case 'endurance':
        return (
          <svg viewBox="0 0 100 100" className="w-12 h-12 text-[#003366] dark:text-blue-400 opacity-80 group-hover:scale-105 transition-transform duration-300">
            <path d="M25,25 L75,75 M25,76 L75,25" stroke={strokeColor} strokeWidth="1.2" strokeLinecap="round" />
            <ellipse cx="25" cy="25" rx="12" ry="3" transform="rotate(-30 25 25)" fill="none" stroke={strokeColor} strokeWidth="1" opacity="0.5" />
            <ellipse cx="75" cy="25" rx="12" ry="3" transform="rotate(30 75 25)" fill="none" stroke={strokeColor} strokeWidth="1" opacity="0.5" />
            <ellipse cx="25" cy="75" rx="12" ry="3" transform="rotate(30 25 75)" fill="none" stroke={strokeColor} strokeWidth="1" opacity="0.5" />
            <ellipse cx="75" cy="75" rx="12" ry="3" transform="rotate(-30 75 75)" fill="none" stroke={strokeColor} strokeWidth="1" opacity="0.5" />
            <polygon points="50,42 58,50 50,58 42,50" fill="currentColor" opacity="0.25" stroke={strokeColor} strokeWidth="1.2" />
          </svg>
        );
      case 'micro':
        return (
          <svg viewBox="0 0 100 100" className="w-12 h-12 text-[#003366] dark:text-blue-400 opacity-80 group-hover:scale-105 transition-transform duration-300">
            <circle cx="38" cy="38" r="9" fill="none" stroke={strokeColor} strokeWidth="1" />
            <circle cx="62" cy="38" r="9" fill="none" stroke={strokeColor} strokeWidth="1" />
            <circle cx="38" cy="64" r="9" fill="none" stroke={strokeColor} strokeWidth="1" />
            <circle cx="62" cy="64" r="9" fill="none" stroke={strokeColor} strokeWidth="1" />
            <path d="M50,38 L50,62 M38,50 L62,50" stroke={strokeColor} strokeWidth="1" />
          </svg>
        );
      case 'fixedwing':
        return (
          <svg viewBox="0 0 100 100" className="w-12 h-12 text-[#003366] dark:text-blue-400 opacity-80 group-hover:scale-105 transition-transform duration-300">
            <path d="M12,44 L88,44 L78,50 L22,50 Z" fill="currentColor" opacity="0.25" stroke={strokeColor} strokeWidth="1.2" />
            <path d="M50,18 L52,78 L48,78 Z" fill="currentColor" stroke={strokeColor} strokeWidth="1.2" />
            <ellipse cx="50" cy="18" rx="10" ry="2" fill="none" stroke={strokeColor} strokeWidth="1" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 100 100" className="w-12 h-12 text-[#003366] dark:text-blue-400 opacity-80 group-hover:scale-105 transition-transform duration-300">
            <circle cx="50" cy="50" r="25" fill="none" stroke={strokeColor} strokeWidth="1.5" strokeDasharray="3 3" />
            <Compass className="w-6 h-6 absolute inset-0 m-auto text-[#003366] dark:text-blue-400" />
          </svg>
        );
    }
  };

  return (
    <Layout>
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[1200px] w-full mx-auto relative z-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-[#003366]/10 dark:bg-blue-950/40 text-[#003366] dark:text-[#a7c8ff]">
                Powertrain Designer
              </span>
              <span className="text-xs text-slate-400 font-medium">UAV Matcher</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              Motor Finder Wizard
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Configure flight weight, voltage config, and safety factors to find optimal motors.
            </p>
          </div>
          {step > 1 && (
            <button 
              onClick={resetFilters}
              className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500 hover:text-rose-500 flex items-center gap-1.5 py-2 px-3 border border-slate-200 dark:border-slate-800 rounded-xl transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Wizard
            </button>
          )}
        </header>

        {/* Multi-step progress bar */}
        <div className="flex items-center justify-between mb-8 max-w-lg mx-auto w-full px-4 text-xs font-bold text-slate-400 dark:text-slate-500 font-mono uppercase tracking-wider">
          <button onClick={() => setStep(1)} className={`pb-1 border-b-2 transition-colors cursor-pointer ${step === 1 ? 'border-[#003366] text-[#003366] dark:text-blue-400' : 'border-transparent'}`}>
            1. UAV Target Preset
          </button>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <button onClick={() => setStep(2)} className={`pb-1 border-b-2 transition-colors cursor-pointer ${step === 2 ? 'border-[#003366] text-[#003366] dark:text-blue-400' : 'border-transparent'}`}>
            2. Design Parameters
          </button>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <button onClick={() => setStep(3)} className={`pb-1 border-b-2 transition-colors cursor-pointer ${step === 3 ? 'border-[#003366] text-[#003366] dark:text-blue-400' : 'border-transparent'}`}>
            3. Matches ({matchedMotors.length})
          </button>
        </div>

        {/* STEP 1: UAV TYPE SELECTION (Expanded presets with SVG graphics) */}
        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            
            <div 
              onClick={() => { handleUavTypeSelect('cinewhoop'); setStep(2); }}
              className="group p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#003366] dark:hover:border-blue-500 hover:shadow-md rounded-2xl cursor-pointer transition-all flex flex-col justify-between h-48"
            >
              <div>
                {renderDroneSvg('cinewhoop')}
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs uppercase tracking-wide mt-3 mb-1">Cinewhoop / Cinematic</h3>
                <p className="text-[11px] text-slate-400 leading-normal">Indoor filming, 3" props. High KV, 4S LiPo, sub-1kg thrust levels.</p>
              </div>
            </div>

            <div 
              onClick={() => { handleUavTypeSelect('freestyle'); setStep(2); }}
              className="group p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#003366] dark:hover:border-blue-500 hover:shadow-md rounded-2xl cursor-pointer transition-all flex flex-col justify-between h-48"
            >
              <div>
                {renderDroneSvg('freestyle')}
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs uppercase tracking-wide mt-3 mb-1">Freestyle / Racing</h3>
                <p className="text-[11px] text-slate-400 leading-normal">Outdoor agility, 5" props. 1600–2500 KV specs, 4S/6S Lipo, 1kg–2kg peak thrust.</p>
              </div>
            </div>

            <div 
              onClick={() => { handleUavTypeSelect('endurance'); setStep(2); }}
              className="group p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#003366] dark:hover:border-blue-500 hover:shadow-md rounded-2xl cursor-pointer transition-all flex flex-col justify-between h-48"
            >
              <div>
                {renderDroneSvg('endurance')}
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs uppercase tracking-wide mt-3 mb-1">Long Range / Endurance</h3>
                <p className="text-[11px] text-slate-400 leading-normal">High-efficiency cruising, 7"–10" props, lower KV, 4S/6S, optimized weight.</p>
              </div>
            </div>

            <div 
              onClick={() => { handleUavTypeSelect('heavy'); setStep(2); }}
              className="group p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#003366] dark:hover:border-blue-500 hover:shadow-md rounded-2xl cursor-pointer transition-all flex flex-col justify-between h-48"
            >
              <div>
                {renderDroneSvg('heavy')}
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs uppercase tracking-wide mt-3 mb-1">Heavy Lift / Enterprise</h3>
                <p className="text-[11px] text-slate-400 leading-normal">Industrial carry, 15"+ props. Lower KV, 6S–12S High Volts, 4kg–12kg thrust.</p>
              </div>
            </div>

            <div 
              onClick={() => { handleUavTypeSelect('agri'); setStep(2); }}
              className="group p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#003366] dark:hover:border-blue-500 hover:shadow-md rounded-2xl cursor-pointer transition-all flex flex-col justify-between h-48"
            >
              <div>
                {renderDroneSvg('agri')}
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs uppercase tracking-wide mt-3 mb-1">Agricultural UAVs</h3>
                <p className="text-[11px] text-slate-400 leading-normal">Spray drone loads, 30"+ folding props. Ultralow KV, 12S/14S, 10kg–30kg thrust.</p>
              </div>
            </div>

            <div 
              onClick={() => { handleUavTypeSelect('micro'); setStep(2); }}
              className="group p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#003366] dark:hover:border-blue-500 hover:shadow-md rounded-2xl cursor-pointer transition-all flex flex-col justify-between h-48"
            >
              <div>
                {renderDroneSvg('micro')}
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs uppercase tracking-wide mt-3 mb-1">Micro Whoop / Tiny Whoop</h3>
                <p className="text-[11px] text-slate-400 leading-normal">Indoor sub-100g micro, 1"–2" props, 10,000–25,000 KV, 1S/2S battery.</p>
              </div>
            </div>

            <div 
              onClick={() => { handleUavTypeSelect('fixedwing'); setStep(2); }}
              className="group p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#003366] dark:hover:border-blue-500 hover:shadow-md rounded-2xl cursor-pointer transition-all flex flex-col justify-between h-48"
            >
              <div>
                {renderDroneSvg('fixedwing')}
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs uppercase tracking-wide mt-3 mb-1">Fixed Wing / Plane</h3>
                <p className="text-[11px] text-slate-400 leading-normal">Wing RC planes, continuous cruising, 900–1600 KV, single puller motor.</p>
              </div>
            </div>

            <div 
              onClick={() => { setUavType('custom'); setStep(2); }}
              className="group p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-[#003366] dark:hover:border-blue-500 hover:shadow-md rounded-2xl cursor-pointer transition-all flex flex-col justify-between h-48"
            >
              <div>
                {renderDroneSvg('custom')}
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs uppercase tracking-wide mt-3 mb-1">Custom UAV Spec</h3>
                <p className="text-[11px] text-slate-400 leading-normal">Fully manual design. Define your own specifications, KV ranges, and layouts.</p>
              </div>
            </div>

          </div>
        )}

        {/* STEP 2: ADVANCED DESIGN PARAMETERS & TWR CALCULATOR */}
        {step === 2 && (
          <div className="flex flex-col lg:flex-row items-stretch gap-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
            
            {/* Left Panel: Sliders & Brand selection */}
            <div className="flex-1 bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-6 flex flex-col gap-5">
              <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs uppercase tracking-wider font-mono border-b pb-2 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-blue-500" /> Powertrain Specifications
              </h3>

              {/* KV Slider */}
              <div className="flex flex-col">
                <div className="flex justify-between items-center mb-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  <span>KV Rating Range</span>
                  <span className="text-[#003366] dark:text-blue-400">{kvRange[0]} KV - {kvRange[1]} KV</span>
                </div>
                <div className="flex gap-4">
                  <input 
                    type="range" 
                    min="50" 
                    max="3000" 
                    value={kvRange[0] > 3000 ? 3000 : kvRange[0]} 
                    onChange={e => setKvRange([parseInt(e.target.value), kvRange[1]])}
                    className="flex-1 accent-[#003366] h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" 
                  />
                  <input 
                    type="range" 
                    min="50" 
                    max="25000" 
                    value={kvRange[1]} 
                    onChange={e => setKvRange([kvRange[0], parseInt(e.target.value)])}
                    className="flex-1 accent-[#003366] h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" 
                  />
                </div>
              </div>

              {/* Thrust Slider */}
              <div className="flex flex-col">
                <div className="flex justify-between items-center mb-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  <span>Max Thrust Range (kg)</span>
                  <span className="text-[#003366] dark:text-blue-400">{thrustRange[0]} kg - {thrustRange[1]} kg</span>
                </div>
                <div className="flex gap-4">
                  <input 
                    type="range" 
                    min="0.05" 
                    max="10" 
                    step="0.05"
                    value={thrustRange[0] > 10 ? 10 : thrustRange[0]} 
                    onChange={e => setThrustRange([parseFloat(e.target.value), thrustRange[1]])}
                    className="flex-1 accent-[#003366] h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" 
                  />
                  <input 
                    type="range" 
                    min="0.05" 
                    max="45" 
                    step="0.1"
                    value={thrustRange[1]} 
                    onChange={e => setThrustRange([thrustRange[0], parseFloat(e.target.value)])}
                    className="flex-1 accent-[#003366] h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" 
                  />
                </div>
              </div>

              {/* Motor Weight Slider */}
              <div className="flex flex-col">
                <div className="flex justify-between items-center mb-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  <span>Max Weight Limit (g)</span>
                  <span className="text-[#003366] dark:text-blue-400">{weightRange[0]}g - {weightRange[1]}g</span>
                </div>
                <div className="flex gap-4">
                  <input 
                    type="range" 
                    min="0" 
                    max="200" 
                    value={weightRange[0] > 200 ? 200 : weightRange[0]} 
                    onChange={e => setWeightRange([parseInt(e.target.value), weightRange[1]])}
                    className="flex-1 accent-[#003366] h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" 
                  />
                  <input 
                    type="range" 
                    min="0" 
                    max="1500" 
                    value={weightRange[1]} 
                    onChange={e => setWeightRange([weightRange[0], parseInt(e.target.value)])}
                    className="flex-1 accent-[#003366] h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" 
                  />
                </div>
              </div>

              {/* Stator size selection */}
              <div className="flex flex-col">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 font-mono">Stator Size Class</label>
                <div className="grid grid-cols-5 gap-2">
                  {(['all', 'micro', 'mini', 'standard', 'heavy'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatorClass(s)}
                      className={`py-2 border rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                        statorClass === s 
                          ? 'bg-[#003366] border-[#003366] text-white' 
                          : 'bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lipo Cells Selectors */}
              <div className="flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider font-mono">Voltage Cells Supported</label>
                  {selectedCells.length > 0 && (
                    <button 
                      onClick={() => setSelectedCells([])}
                      className="text-[10px] text-rose-500 hover:text-rose-600 font-bold font-mono uppercase tracking-wider cursor-pointer border-none bg-transparent"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 6, 8, 12, 14].map(cell => {
                    const active = selectedCells.includes(cell);
                    return (
                      <button 
                        key={cell}
                        onClick={() => handleCellToggle(cell)}
                        className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          active 
                            ? 'bg-[#003366] border-[#003366] text-white shadow-sm' 
                            : 'bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                        }`}
                      >
                        {cell}S
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Manufacturer / Brands list */}
              <div className="flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-405 uppercase tracking-wider font-mono">Brand Selection Filter</label>
                  {selectedBrands.length > 0 && (
                    <button 
                      onClick={() => setSelectedBrands([])}
                      className="text-[10px] text-rose-500 hover:text-rose-600 font-bold font-mono uppercase tracking-wider cursor-pointer border-none bg-transparent"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800 rounded-xl">
                  {isInitLoading ? (
                    <span className="text-[10px] text-slate-400 px-2 py-1">Loading brands list...</span>
                  ) : availableBrands.length === 0 ? (
                    <span className="text-[10px] text-slate-400 px-2 py-1">No brands detected.</span>
                  ) : (
                    availableBrands.map(b => {
                      const active = selectedBrands.includes(b);
                      return (
                        <button
                          key={b}
                          type="button"
                          onClick={() => handleBrandToggle(b)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                            active 
                              ? 'bg-[#003366] border-[#003366] text-white' 
                              : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-slate-500'
                          }`}
                        >
                          {b}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

            {/* Right Panel: TWR Estimator Widget */}
            <div className="w-full lg:w-[42%] shrink-0 bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-6 flex flex-col justify-between">
              
              <div className="space-y-5">
                <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-xs uppercase tracking-wider font-mono border-b pb-2 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-500" /> TWR Calculator Widget
                </h3>

                {/* Estimate weight */}
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 font-mono">UAV All Up Weight (AUW)</label>
                  <div className="relative">
                    <input 
                      type="number"
                      value={totalWeight}
                      onChange={e => setTotalWeight(Math.max(1, parseInt(e.target.value) || 0))}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-3.5 text-sm outline-none focus:border-[#003366] font-semibold"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">grams</span>
                  </div>
                </div>

                {/* Motor count */}
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 font-mono">Motor Layout configuration</label>
                  <div className="grid grid-cols-4 gap-2">
                    {([3, 4, 6, 8] as const).map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setMotorCount(n)}
                        className={`py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          motorCount === n 
                            ? 'bg-[#003366] border-[#003366] text-white' 
                            : 'bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                        }`}
                      >
                        {n === 3 && '3 (Tri)'}
                        {n === 4 && '4 (Quad)'}
                        {n === 6 && '6 (Hexa)'}
                        {n === 8 && '8 (Octo)'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Safety margins */}
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 font-mono">Thrust Safety Margin</label>
                  <select
                    value={thrustMargin}
                    onChange={e => setThrustMargin(parseFloat(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-3 text-xs outline-none focus:border-[#003366] font-bold text-slate-600 dark:text-slate-300"
                  >
                    <option value={1.5}>1.5x TWR (Endurance / Cruise)</option>
                    <option value={2.0}>2.0x TWR (Standard Hover / Safe)</option>
                    <option value={3.0}>3.0x TWR (High Performance / Cinematic)</option>
                    <option value={4.5}>4.5x TWR (Extreme Agility / Acro)</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button 
                  onClick={() => setStep(3)}
                  className="w-full bg-[#003366] hover:bg-[#002244] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  Generate Recommendation matches
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>

          </div>
        )}

        {/* STEP 3: MATCHED MOTORS DISPLAY (With live calculated TWR badges & actions) */}
        {step === 3 && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50 dark:bg-slate-950/60 p-4 border border-slate-200/60 dark:border-slate-850 rounded-2xl">
              <div>
                <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                  UAV Match Results
                </span>
                <h4 className="text-sm font-extrabold text-[#001e40] dark:text-slate-100 mt-0.5">
                  Found {matchedMotors.length} compatible propulsion motors
                </h4>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {comparedIds.length > 0 && (
                  <>
                    <button 
                      onClick={() => setIsCompareModalOpen(true)}
                      className="text-xs font-bold py-2 px-4 bg-[#003366] hover:bg-[#002244] dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      Compare Tray ({comparedIds.length})
                    </button>
                    <button 
                      onClick={() => {
                        comparedIds.forEach(id => toggleCompare(id, 'motor'));
                      }}
                      className="text-xs font-bold py-2 px-3 border border-slate-200 dark:border-slate-800 text-slate-550 hover:text-rose-500 rounded-xl transition-all cursor-pointer font-mono"
                    >
                      Clear Selection
                    </button>
                  </>
                )}
                <button 
                  onClick={() => setStep(2)}
                  className="text-xs font-bold py-2 px-4 border border-[#003366] text-[#003366] dark:border-blue-500 dark:text-blue-400 hover:bg-[#003366]/5 dark:hover:bg-blue-950/20 rounded-xl transition-all cursor-pointer"
                >
                  Modify Specs
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Running database matching...</span>
              </div>
            ) : matchedMotors.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                <Info className="w-10 h-10 mb-3 text-slate-300" />
                <h4 className="font-extrabold text-slate-700 dark:text-slate-300">No matching motors found</h4>
                <p className="text-xs mt-1 max-w-sm">Try widening your KV range, adding more voltage S options, or increasing the max weight threshold limits.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {matchedMotors.map(m => {
                  const totalThrustKg = m.thrust * motorCount;
                  const weightKg = totalWeight / 1000;
                  const calculatedTwr = weightKg > 0 ? (totalThrustKg / weightKg) : 0;
                  
                  let twrLabel = "Cruise";
                  let twrColor = "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200/50";
                  let twrIcon = <Info className="w-3.5 h-3.5" />;

                  if (calculatedTwr < thrustMargin) {
                    twrLabel = "Underpowered";
                    twrColor = "bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-200/50";
                    twrIcon = <ShieldAlert className="w-3.5 h-3.5" />;
                  } else if (calculatedTwr >= 4.5) {
                    twrLabel = "Extreme Power";
                    twrColor = "bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border-indigo-200/50";
                    twrIcon = <Zap className="w-3.5 h-3.5" />;
                  } else if (calculatedTwr >= 2.5) {
                    twrLabel = "Acro / Freestyle";
                    twrColor = "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200/50";
                    twrIcon = <Award className="w-3.5 h-3.5" />;
                  }

                  const isCompared = comparedIds.includes(m.id);

                  return (
                    <div key={m.id} className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200">
                      <div>
                        {/* Brand & compare actions */}
                        <div className="flex justify-between items-center gap-2 mb-2.5">
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-450 tracking-wider">
                            {m.brand}
                          </span>
                          
                          <button
                            type="button"
                            onClick={() => toggleCompare(m.id, 'motor')}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                              isCompared 
                                ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-400' 
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 dark:bg-slate-950 dark:border-slate-850 dark:hover:bg-slate-800 text-slate-500'
                            }`}
                          >
                            {isCompared ? '✓ Added' : '+ Compare'}
                          </button>
                        </div>

                        {/* Title profile page link */}
                        <button
                          type="button"
                          onClick={() => navigate(`/motor/${encodeURIComponent(m.name)}`)}
                          className="font-extrabold text-[#001e40] dark:text-slate-100 text-sm hover:text-blue-600 dark:hover:text-blue-400 text-left truncate w-full mb-1 block cursor-pointer"
                        >
                          {m.name}
                        </button>
                        <span className="text-[10px] font-bold font-mono text-slate-400 tracking-wide uppercase">
                          {m.kv} KV &bull; {m.voltage || 'DC Volts'}
                        </span>

                        {/* Live calculated TWR statistics */}
                        <div className={`mt-3.5 p-3 rounded-xl border flex items-center justify-between gap-3 ${twrColor}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            {twrIcon}
                            <span className="text-[10px] font-extrabold uppercase tracking-wider font-mono truncate">{twrLabel}</span>
                          </div>
                          <span className="font-extrabold font-mono text-xs whitespace-nowrap">
                            {calculatedTwr.toFixed(2)} TWR
                          </span>
                        </div>

                        {/* Specs grid */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs border-t border-slate-100 dark:border-slate-850 pt-3.5 mt-3.5">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-slate-400 uppercase font-mono tracking-wider font-bold">Peak Thrust</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{m.thrustRaw || `${(m.thrust * 1000).toFixed(0)}g`}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-slate-400 uppercase font-mono tracking-wider font-bold">Stator Size</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 capitalize">{m.statorClass} Class</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-slate-400 uppercase font-mono tracking-wider font-bold">Motor Weight</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{m.weight ? `${m.weight}g` : '—'}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-slate-400 uppercase font-mono tracking-wider font-bold">Propeller</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">{m.propeller}</span>
                          </div>
                        </div>
                      </div>

                      {/* Detail navigation */}
                      <button
                        onClick={() => navigate(`/motor/${encodeURIComponent(m.name)}`)}
                        className="w-full mt-4 bg-slate-50 hover:bg-slate-100 dark:bg-slate-850/50 dark:hover:bg-slate-800 border border-slate-200/50 dark:border-slate-800/80 text-[10px] font-bold uppercase tracking-wider py-2 px-3 rounded-xl text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        Inspect Full Telemetry <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Render bottom dynamic Compare Drawer */}
      <CompareDrawer 
        selectedItems={matchedMotors.filter(m => comparedIds.includes(m.id)).map(m => ({ id: m.id, name: m.name, brand: m.brand }))} 
        onOpenCompareModal={() => setIsCompareModalOpen(true)}
      />

      {/* Render detailed comparison modal */}
      <CompareModal 
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        items={matchedMotors.filter(m => comparedIds.includes(m.id)).map(m => ({
          id: m.id,
          motor_name: m.name,
          company: m.brand,
          max_thrust: m.thrustRaw,
          recommended_esc: m.esc,
          recommended_propeller: m.propeller,
          // mapping keys expected by CompareModal
          motor: m.name,
          thrust: m.thrustRaw,
          esc: m.esc,
          prop: m.propeller,
          kv_rating: m.kv,
          operating_voltage: m.voltage,
          custom_parameters: {
            weight_g: m.weight,
            max_power_w: m.maxPower,
            max_current: m.maxCurrent
          }
        }))}
        type="motor"
      />
    </Layout>
  );
};
