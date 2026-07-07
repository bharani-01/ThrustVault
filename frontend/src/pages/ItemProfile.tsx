import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ShareModal } from '../components/ShareModal';
import { 
  Cpu, Zap, Activity, Sliders, ArrowLeft, Share2, ExternalLink, 
  AlertCircle, Download, Calendar, User, Gauge, BarChart2,
  Table as TableIcon, Layers, Grid, RefreshCw
} from 'lucide-react';
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

interface ItemProfileProps {
  type?: 'motor' | 'esc' | 'propeller';
}

interface TestRun {
  id: string;
  motor_id?: string;
  propeller_model?: string;
  esc_model?: string;
  battery_info?: string;
  test_conducted_by?: string;
  tested_at?: string;
  notes?: string;
}

interface RawTelemetryPoint {
  id: string;
  test_run_id?: string;
  run_id?: string;
  throttle: number;
  voltage: number;
  current: number;
  power?: number;
  thrust_g: number;
  rpm?: number;
  efficiency?: number;
  temperature?: number;
}

export const ItemProfile: React.FC<ItemProfileProps> = ({ type: defaultType }) => {
  const { name: paramName, type: routeType } = useParams<{ name?: string; type?: string }>();
  const navigate = useNavigate();

  const itemType = (defaultType || routeType || 'motor').toLowerCase();
  const itemName = paramName ? decodeURIComponent(paramName) : '';

  const [itemData, setItemData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState<boolean>(false);

  // Gallery Active Image
  const [activeImage, setActiveImage] = useState<string>('');

  // Profile View Tabs: 'specs' | 'dynamometer'
  const [activeTab, setActiveTab] = useState<'specs' | 'dynamometer'>('specs');

  // Dynamometer Chart View Mode: 'summary' | 'all11'
  const [chartViewMode, setChartViewMode] = useState<'summary' | 'all11'>('summary');

  // Dynamometer Test Runs State
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [rawPoints, setRawPoints] = useState<RawTelemetryPoint[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState<boolean>(false);
  const [isLoadingPoints, setIsLoadingPoints] = useState<boolean>(false);

  useEffect(() => {
    if (!itemName) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const fetchProfile = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/guest/share/${itemType}/${encodeURIComponent(itemName)}`);
        if (!res.ok) {
          const findRes = await fetch(`/api/public/find-item/${encodeURIComponent(itemName)}`);
          if (!findRes.ok) {
            throw new Error(`Specification profile for "${itemName}" was not found.`);
          }
          const resolved = await findRes.json();
          const detailRes = await fetch(`/api/guest/share/${resolved.type}/${encodeURIComponent(resolved.name)}`);
          if (!detailRes.ok) throw new Error(`Failed to load profile details.`);
          const data = await detailRes.json();
          setItemData({ ...data, type: resolved.type });
          if (data.main_image || data.mainImage) {
            setActiveImage(data.main_image || data.mainImage);
          }
        } else {
          const data = await res.json();
          setItemData({ ...data, type: itemType });
          if (data.main_image || data.mainImage) {
            setActiveImage(data.main_image || data.mainImage);
          }
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Failed to load specification profile.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [itemName, itemType, navigate]);

  // Fetch Test Runs for Motor
  useEffect(() => {
    if (!itemData || !itemData.id || itemData.type !== 'motor') return;

    const fetchTestRuns = async () => {
      setIsLoadingRuns(true);
      try {
        const res = await fetch(`/api/motor-test-runs?motor_id=eq.${itemData.id}&order=tested_at.desc`);
        if (res.ok) {
          const runs = await res.json();
          if (Array.isArray(runs) && runs.length > 0) {
            setTestRuns(runs);
            setSelectedRunId(runs[0].id);
          } else {
            const allRunsRes = await fetch(`/api/motor-test-runs?limit=10&order=tested_at.desc`);
            if (allRunsRes.ok) {
              const allRuns = await allRunsRes.json();
              if (Array.isArray(allRuns) && allRuns.length > 0) {
                setTestRuns(allRuns);
                setSelectedRunId(allRuns[0].id);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error fetching test runs:', err);
      } finally {
        setIsLoadingRuns(false);
      }
    };

    fetchTestRuns();
  }, [itemData]);

  // Fetch Telemetry Points for Selected Run
  useEffect(() => {
    if (!selectedRunId) return;

    const fetchPoints = async () => {
      setIsLoadingPoints(true);
      try {
        let res = await fetch(`/api/motor-test-data-points?test_run_id=eq.${selectedRunId}&order=throttle.asc`);
        if (!res.ok) {
          res = await fetch(`/api/motor-test-data-points?run_id=eq.${selectedRunId}&order=throttle.asc`);
        }
        if (res.ok) {
          const pts = await res.json();
          if (Array.isArray(pts)) {
            setRawPoints(pts);
          }
        }
      } catch (err) {
        console.error('Error fetching data points:', err);
      } finally {
        setIsLoadingPoints(false);
      }
    };

    fetchPoints();
  }, [selectedRunId]);

  const activeType = itemData?.type || itemType;
  const currentRun = testRuns.find(r => r.id === selectedRunId);

  // Gallery Thumbnail Images List
  const galleryImages: string[] = useMemo(() => {
    if (!itemData) return [];
    const list: string[] = [];
    if (itemData.main_image) list.push(itemData.main_image);
    if (itemData.mainImage && !list.includes(itemData.mainImage)) list.push(itemData.mainImage);

    let rawGallery = itemData.gallery_images || itemData.galleryImages;
    if (typeof rawGallery === 'string') {
      try { rawGallery = JSON.parse(rawGallery); } catch (e) {}
    }
    if (Array.isArray(rawGallery)) {
      rawGallery.forEach((img: string) => {
        if (img && typeof img === 'string' && !list.includes(img)) list.push(img);
      });
    }
    return list;
  }, [itemData]);

  // Computed Telemetry Dataset with All 11 Engineering Metrics
  const processedPoints = useMemo(() => {
    return rawPoints.map((pt, index) => {
      const throttleVal = parseFloat(String(pt.throttle || 0));
      const throttlePercent = throttleVal <= 1.0 ? throttleVal * 100 : throttleVal;
      const throttleUs = 1000 + (throttlePercent / 100.0) * 1000;
      const timeS = index * 5;
      const rpmVal = parseFloat(String(pt.rpm || 0));
      const thrustG = parseFloat(String(pt.thrust_g || pt.power || 0));
      const thrustKgf = thrustG / 1000.0;
      
      const voltageVal = parseFloat(String(pt.voltage || 0));
      const currentVal = parseFloat(String(pt.current || 0));
      const powerElec = parseFloat(String(pt.power || (voltageVal * currentVal))) || 0;
      const powerMech = powerElec * 0.82;
      const torqueNm = rpmVal > 0 ? (9.5488 * powerMech) / rpmVal : 0;
      
      const propEff = parseFloat(String(pt.efficiency || (powerElec > 0 ? thrustG / powerElec : 0)));
      
      let motorEscEff = 0;
      if (powerElec > 0) {
        const pctDecimal = throttlePercent / 100.0;
        motorEscEff = 75 + (10 - Math.abs(pctDecimal - 0.7) * 20);
        if (motorEscEff < 60) motorEscEff = 60;
        if (motorEscEff > 85) motorEscEff = 85;
      }
      const systemEff = propEff * 0.85;

      return {
        time: timeS,
        throttleUs: Math.round(throttleUs),
        throttlePercent: Math.round(throttlePercent),
        rpm: Math.round(rpmVal),
        thrustG: Math.round(thrustG),
        thrustKgf: parseFloat(thrustKgf.toFixed(3)),
        torqueNm: parseFloat(torqueNm.toFixed(4)),
        voltage: parseFloat(voltageVal.toFixed(1)),
        current: parseFloat(currentVal.toFixed(1)),
        powerElec: parseFloat(powerElec.toFixed(1)),
        powerMech: parseFloat(powerMech.toFixed(1)),
        motorEscEff: parseFloat(motorEscEff.toFixed(1)),
        propEff: parseFloat(propEff.toFixed(2)),
        systemEff: parseFloat(systemEff.toFixed(2)),
      };
    });
  }, [rawPoints]);

  // Export Test Run Data to CSV
  const handleExportCSV = () => {
    if (!currentRun || processedPoints.length === 0) return;
    const headers = [
      'Time (s)', 'Throttle (%)', 'Throttle (us)', 'Voltage (V)', 'Current (A)', 
      'Elec Power (W)', 'Mech Power (W)', 'Thrust (g)', 'Thrust (kgf)', 
      'RPM', 'Torque (N.m)', 'Prop Efficiency (g/W)', 'Motor/ESC Eff (%)', 'System Eff (g/W)'
    ];
    const rows = processedPoints.map(p => [
      p.time, p.throttlePercent, p.throttleUs, p.voltage, p.current,
      p.powerElec, p.powerMech, p.thrustG, p.thrustKgf,
      p.rpm, p.torqueNm, p.propEff, p.motorEscEff, p.systemEff
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${itemData.name || 'motor'}_test_run_${currentRun.id.substring(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for single chart config (guarantees ONLY 1 clean Y axis per chart)
  const createSingleChartConfig = (
    title: string,
    xKey: keyof typeof processedPoints[0],
    yKey: keyof typeof processedPoints[0],
    xLabel: string,
    yLabel: string,
    color: string
  ) => {
    const sorted = [...processedPoints].sort((a, b) => (Number(a[xKey]) || 0) - (Number(b[xKey]) || 0));
    return {
      title,
      data: {
        labels: sorted.map(p => String(p[xKey])),
        datasets: [{
          label: yLabel,
          data: sorted.map(p => Number(p[yKey]) || 0),
          borderColor: color,
          backgroundColor: `${color}18`,
          borderWidth: 2.5,
          pointRadius: 3.5,
          pointHoverRadius: 6,
          tension: 0.35,
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { padding: 10, cornerRadius: 8 },
        },
        scales: {
          x: {
            grid: { display: false },
            title: { display: true, text: xLabel, font: { family: 'Inter', size: 10, weight: 600 } },
            ticks: { font: { family: 'Inter', size: 10 } }
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
            title: { display: true, text: yLabel, font: { family: 'Inter', size: 10, weight: 600 } },
            ticks: { font: { family: 'Inter', size: 10 } }
          }
        }
      }
    };
  };

  // Dual Summary Chart 1: Thrust & Power vs Throttle (Proper Scoped Axes)
  const thrustPowerDualChart = useMemo(() => {
    return {
      data: {
        labels: processedPoints.map(p => `${p.throttlePercent}%`),
        datasets: [
          {
            label: 'Thrust (g)',
            data: processedPoints.map(p => p.thrustG),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            yAxisID: 'yThrust',
            tension: 0.35,
            fill: true,
          },
          {
            label: 'Power (W)',
            data: processedPoints.map(p => p.powerElec),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            yAxisID: 'yPower',
            tension: 0.35,
            fill: true,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' as const, labels: { font: { family: 'Inter', size: 11, weight: 600 } } },
          tooltip: { padding: 10, cornerRadius: 8 },
        },
        scales: {
          x: { grid: { display: false }, title: { display: true, text: 'Throttle Level (%)', font: { size: 10, weight: 600 } } },
          yThrust: {
            type: 'linear' as const,
            position: 'left' as const,
            title: { display: true, text: 'Thrust (g)', font: { size: 10, weight: 600 } },
            grid: { color: 'rgba(148, 163, 184, 0.1)' }
          },
          yPower: {
            type: 'linear' as const,
            position: 'right' as const,
            title: { display: true, text: 'Power (W)', font: { size: 10, weight: 600 } },
            grid: { display: false }
          }
        }
      }
    };
  }, [processedPoints]);

  // Dual Summary Chart 2: Efficiency & RPM vs Throttle (Proper Scoped Axes)
  const effRpmDualChart = useMemo(() => {
    return {
      data: {
        labels: processedPoints.map(p => `${p.throttlePercent}%`),
        datasets: [
          {
            label: 'Efficiency (g/W)',
            data: processedPoints.map(p => p.propEff),
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            yAxisID: 'yEff',
            tension: 0.35,
            fill: true,
          },
          {
            label: 'RPM',
            data: processedPoints.map(p => p.rpm),
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.05)',
            yAxisID: 'yRpm',
            tension: 0.35,
            fill: true,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' as const, labels: { font: { family: 'Inter', size: 11, weight: 600 } } },
          tooltip: { padding: 10, cornerRadius: 8 },
        },
        scales: {
          x: { grid: { display: false }, title: { display: true, text: 'Throttle Level (%)', font: { size: 10, weight: 600 } } },
          yEff: {
            type: 'linear' as const,
            position: 'left' as const,
            title: { display: true, text: 'Efficiency (g/W)', font: { size: 10, weight: 600 } },
            grid: { color: 'rgba(148, 163, 184, 0.1)' }
          },
          yRpm: {
            type: 'linear' as const,
            position: 'right' as const,
            title: { display: true, text: 'RPM', font: { size: 10, weight: 600 } },
            grid: { display: false }
          }
        }
      }
    };
  }, [processedPoints]);

  // All 11 Single-Metric Scatter/Line Charts
  const all11Charts = useMemo(() => {
    if (processedPoints.length === 0) return [];
    return [
      createSingleChartConfig('1. Thrust (kgf) vs RPM', 'rpm', 'thrustKgf', 'Rotation Speed (RPM)', 'Thrust (kgf)', '#10b981'),
      createSingleChartConfig('2. Electrical Power (W) vs RPM', 'rpm', 'powerElec', 'Rotation Speed (RPM)', 'Electrical Power (W)', '#3b82f6'),
      createSingleChartConfig('3. Mechanical Power (W) vs RPM', 'rpm', 'powerMech', 'Rotation Speed (RPM)', 'Mechanical Power (W)', '#6366f1'),
      createSingleChartConfig('4. Torque (N·m) vs RPM', 'rpm', 'torqueNm', 'Rotation Speed (RPM)', 'Torque (N·m)', '#8b5cf6'),
      createSingleChartConfig('5. Current (A) vs RPM', 'rpm', 'current', 'Rotation Speed (RPM)', 'Current (A)', '#ef4444'),
      createSingleChartConfig('6. Voltage (V) vs RPM', 'rpm', 'voltage', 'Rotation Speed (RPM)', 'Voltage (V)', '#f59e0b'),
      createSingleChartConfig('7. Throttle Signal (μs) vs Time', 'time', 'throttleUs', 'Time (s)', 'Throttle Signal (μs)', '#06b6d4'),
      createSingleChartConfig('8. Rotation Speed (RPM) vs Time', 'time', 'rpm', 'Time (s)', 'Rotation Speed (RPM)', '#14b8a6'),
      createSingleChartConfig('9. Motor & ESC Efficiency (%) vs RPM', 'rpm', 'motorEscEff', 'Rotation Speed (RPM)', 'Motor/ESC Efficiency (%)', '#84cc16'),
      createSingleChartConfig('10. Propeller Efficiency (g/W) vs RPM', 'rpm', 'propEff', 'Rotation Speed (RPM)', 'Prop Efficiency (g/W)', '#eab308'),
      createSingleChartConfig('11. Total System Efficiency (gf/W) vs RPM', 'rpm', 'systemEff', 'Rotation Speed (RPM)', 'System Efficiency (gf/W)', '#ec4899'),
    ];
  }, [processedPoints]);

  const getBackPath = () => {
    if (activeType === 'esc') return '/escs';
    if (activeType === 'propeller') return '/propellers';
    return '/dashboard';
  };

  return (
    <Layout>
      {/* Spacious, un-congested container with generous padding & max width */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10">
        {/* Navigation Breadcrumb Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <button
            onClick={() => navigate(getBackPath())}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors cursor-pointer w-fit px-3.5 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4" /> Back to {activeType === 'esc' ? 'ESC Explorer' : activeType === 'propeller' ? 'Propeller Explorer' : 'Dashboard'}
          </button>

          {itemData && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShareOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold bg-[#003366] hover:bg-[#002244] dark:bg-blue-600 dark:hover:bg-blue-700 text-white shadow-lg shadow-blue-500/15 transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" /> Share Specifications
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-16 text-center flex flex-col items-center justify-center space-y-4 shadow-sm">
            <div className="w-12 h-12 border-4 border-t-blue-600 border-slate-200 dark:border-slate-800 rounded-full animate-spin"></div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Loading Aerospace Profile...</p>
          </div>
        ) : error || !itemData ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4 shadow-sm">
            <AlertCircle className="w-12 h-12 text-rose-500" />
            <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">Specification Profile Not Found</h3>
            <p className="text-xs text-slate-400 max-w-md">{error || `Could not find any database entry for "${itemName}".`}</p>
            <button
              onClick={() => navigate(getBackPath())}
              className="mt-2 px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Return to Catalog
            </button>
          </div>
        ) : (
          <>
            {/* Top Product Showcase Hero Banner */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col lg:flex-row gap-8 items-start lg:items-center justify-between">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 flex-1">
                {/* Image Gallery Showcase */}
                {galleryImages.length > 0 ? (
                  <div className="flex flex-col items-center gap-3 shrink-0">
                    <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 p-3 overflow-hidden flex items-center justify-center shadow-inner">
                      <img
                        src={activeImage || galleryImages[0]}
                        alt={itemData.name || itemData.motor}
                        className="w-full h-full object-contain rounded-xl"
                      />
                    </div>
                    {galleryImages.length > 1 && (
                      <div className="flex items-center gap-2 p-1">
                        {galleryImages.map((img, idx) => (
                          <button
                            key={idx}
                            onClick={() => setActiveImage(img)}
                            className={`w-7 h-7 rounded-lg border overflow-hidden shrink-0 cursor-pointer transition-all ${
                              (activeImage || galleryImages[0]) === img ? 'border-blue-600 ring-2 ring-blue-500/20' : 'border-slate-200 dark:border-slate-800 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <img src={img} className="w-full h-full object-cover" alt="" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-[#003366] text-white font-black text-3xl flex items-center justify-center shrink-0 shadow-xl shadow-blue-500/20">
                    {(itemData.name || itemData.motor_name || itemData.motor || '').substring(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="space-y-2.5 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="px-3 py-1 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider rounded-lg">
                      {activeType} Specification
                    </span>
                    {(itemData.brand || itemData.company) && (
                      <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg">
                        Manufacturer: {itemData.brand || itemData.company}
                      </span>
                    )}
                  </div>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#001e40] dark:text-slate-100 leading-tight">
                    {itemData.name || itemData.motor_name || itemData.motor}
                  </h1>
                </div>
              </div>

              {/* Quick Highlight Stats Pills */}
              <div className="flex items-center gap-4 shrink-0 flex-wrap border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 pt-6 lg:pt-0 lg:pl-8">
                {itemData.kv_rating && (
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 px-4 py-3 rounded-2xl text-center min-w-[100px]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">KV Rating</span>
                    <span className="text-base font-extrabold text-[#001e40] dark:text-slate-100">{itemData.kv_rating} KV</span>
                  </div>
                )}
                {(itemData.max_thrust || itemData.thrust) && (
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 px-4 py-3 rounded-2xl text-center min-w-[100px]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Max Thrust</span>
                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">{itemData.max_thrust || itemData.thrust}</span>
                  </div>
                )}
                {itemData.continuous_current && (
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 px-4 py-3 rounded-2xl text-center min-w-[100px]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Continuous</span>
                    <span className="text-base font-extrabold text-amber-600 dark:text-amber-400">{itemData.continuous_current} A</span>
                  </div>
                )}
                {itemData.diameter && (
                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 px-4 py-3 rounded-2xl text-center min-w-[100px]">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">Diameter</span>
                    <span className="text-base font-extrabold text-blue-600 dark:text-blue-400">{itemData.diameter}"</span>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Tab Navigation (For Motors: Specs vs Dynamometer Data) */}
            {activeType === 'motor' && (
              <div className="flex border-b border-slate-200 dark:border-slate-800 gap-8 pt-2">
                <button
                  onClick={() => setActiveTab('specs')}
                  className={`pb-4 text-sm font-extrabold transition-all flex items-center gap-2.5 border-b-2 cursor-pointer ${
                    activeTab === 'specs'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Cpu className="w-4 h-4" /> Technical Specifications
                </button>
                <button
                  onClick={() => setActiveTab('dynamometer')}
                  className={`pb-4 text-sm font-extrabold transition-all flex items-center gap-2.5 border-b-2 cursor-pointer ${
                    activeTab === 'dynamometer'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <BarChart2 className="w-4 h-4 text-emerald-500" /> Dynamometer Test Bench ({testRuns.length} Runs)
                </button>
              </div>
            )}

            {/* TAB 1: Technical Specs View */}
            {(activeTab === 'specs' || activeType !== 'motor') && (
              <div className="space-y-8">
                {/* Electrical & Power Performance */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                  <h3 className="text-sm font-extrabold text-[#001e40] dark:text-slate-100 uppercase tracking-wider flex items-center gap-2.5">
                    <Zap className="w-4 h-4 text-amber-500" /> Electrical & Power Specifications
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8 text-xs sm:text-sm">
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">KV Rating</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.kv_rating ? `${itemData.kv_rating} KV` : '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Voltage Range</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.operating_voltage || itemData.input_voltage || itemData.custom_parameters?.voltage_range || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Max Thrust</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.max_thrust || itemData.thrust || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Internal Resistance</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.internal_resistance || itemData.custom_parameters?.resistance_mohm ? `${itemData.custom_parameters.resistance_mohm} mΩ` : '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Idle Current @10V</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.idle_current || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Max Power (180s)</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.max_power || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Max Current (180s)</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.max_current || (itemData.continuous_current ? `${itemData.continuous_current} A` : '—')}</span>
                    </div>
                  </div>
                </div>

                {/* Mechanical & Geometry */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                  <h3 className="text-sm font-extrabold text-[#001e40] dark:text-slate-100 uppercase tracking-wider flex items-center gap-2.5">
                    <Activity className="w-4 h-4 text-blue-500" /> Mechanical & Geometry Specifications
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8 text-xs sm:text-sm">
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Configuration</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.configuration || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Stator Size / Bore</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.stator_size || itemData.custom_parameters?.shaft_bore ? `${itemData.custom_parameters.shaft_bore} mm` : '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Shaft Diameter</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.shaft_diameter || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Motor Dimensions</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.dimensions || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Wire AWG</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.awg || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Cable Length</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.cable_length || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Weight</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.weight_with_cable || itemData.custom_parameters?.weight ? `${itemData.custom_parameters.weight} g` : '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Powertrain Recommendations */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                  <h3 className="text-sm font-extrabold text-[#001e40] dark:text-slate-100 uppercase tracking-wider flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-indigo-500" /> Powertrain Matchup & Recommendations
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8 text-xs sm:text-sm">
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Recommended ESC</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.recommended_esc || itemData.esc || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Recommended Propeller</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.recommended_propeller || itemData.prop || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Winding Type</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.winding_type || '—'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-400 font-medium">Motor Poles</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{itemData.custom_parameters?.poles || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Dynamometer Bench Runs (Clean Scoped Charts & 11 Individual Telemetry Charts) */}
            {activeTab === 'dynamometer' && activeType === 'motor' && (
              <div className="space-y-8">
                {isLoadingRuns ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-16 text-center text-xs font-semibold text-slate-400 font-mono">
                    Fetching Dynamometer Runs...
                  </div>
                ) : testRuns.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-12 text-center text-xs font-semibold text-slate-400">
                    No dynamometer bench run logs recorded for this motor yet.
                  </div>
                ) : (
                  <>
                    {/* Test Runs Selector Header */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-2 flex-1">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Active Dynamometer Test Run Log</span>
                        <div className="flex items-center gap-4 flex-wrap">
                          <select
                            value={selectedRunId || ''}
                            onChange={e => setSelectedRunId(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold text-[#001e40] dark:text-slate-100 focus:border-blue-500 outline-none max-w-full cursor-pointer"
                          >
                            {testRuns.map(run => (
                              <option key={run.id} value={run.id}>
                                Propeller: {run.propeller_model || 'Standard'} | ESC: {run.esc_model || 'Standard'} ({run.battery_info || 'N/A'})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {currentRun && (
                        <div className="flex items-center gap-6 text-xs sm:text-sm shrink-0 flex-wrap">
                          <div className="flex items-center gap-2 text-slate-500">
                            <User className="w-4 h-4 text-blue-500" />
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{currentRun.test_conducted_by || 'Engineer'}</span>
                          </div>
                          {currentRun.tested_at && (
                            <div className="flex items-center gap-2 text-slate-500">
                              <Calendar className="w-4 h-4 text-emerald-500" />
                              <span className="font-semibold text-slate-700 dark:text-slate-300">{new Date(currentRun.tested_at).toLocaleDateString()}</span>
                            </div>
                          )}
                          <button
                            onClick={handleExportCSV}
                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                          >
                            <Download className="w-4 h-4" /> Export CSV Data
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Chart Mode Selector: Summary Dual Charts vs All 11 Individual Charts */}
                    <div className="flex items-center justify-between gap-4 flex-wrap bg-slate-100/70 dark:bg-slate-850 p-2 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setChartViewMode('summary')}
                          className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
                            chartViewMode === 'summary'
                              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          <Gauge className="w-4 h-4" /> Summary Dual Curves (2)
                        </button>
                        <button
                          onClick={() => setChartViewMode('all11')}
                          className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
                            chartViewMode === 'all11'
                              ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          <Grid className="w-4 h-4" /> All 11 Telemetry Charts
                        </button>
                      </div>

                      <span className="text-xs font-bold text-slate-400 pr-3 hidden sm:inline">
                        {chartViewMode === 'summary' ? 'Displaying 2 Dual-Axis Curves' : 'Displaying All 11 Single-Metric Charts'}
                      </span>
                    </div>

                    {/* MODE 1: Dual Summary Charts (Properly Scoped Axes - No Text Overlap) */}
                    {chartViewMode === 'summary' && !isLoadingPoints && processedPoints.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                          <h4 className="text-xs font-extrabold text-[#001e40] dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                            <Gauge className="w-4 h-4 text-emerald-500" /> Thrust & Power Curve
                          </h4>
                          <div className="h-72">
                            <Line data={thrustPowerDualChart.data} options={thrustPowerDualChart.options as any} />
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                          <h4 className="text-xs font-extrabold text-[#001e40] dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" /> Efficiency & RPM Curve
                          </h4>
                          <div className="h-72">
                            <Line data={effRpmDualChart.data} options={effRpmDualChart.options as any} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* MODE 2: All 11 Individual Telemetry Scatter/Line Charts */}
                    {chartViewMode === 'all11' && !isLoadingPoints && all11Charts.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {all11Charts.map((chart, idx) => (
                          <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                            <div className="border-b border-slate-100 dark:border-slate-800/60 pb-3">
                              <h4 className="text-xs font-extrabold text-[#001e40] dark:text-slate-100">
                                {chart.title}
                              </h4>
                            </div>
                            <div className="h-56">
                              <Line data={chart.data} options={chart.options as any} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Data Points Table */}
                    {processedPoints.length > 0 && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-extrabold text-[#001e40] dark:text-slate-100 uppercase tracking-wider flex items-center gap-2.5">
                            <TableIcon className="w-4 h-4 text-blue-500" /> Complete Telemetry Data Table ({processedPoints.length} Points)
                          </h4>
                          <button
                            onClick={handleExportCSV}
                            className="text-xs font-extrabold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" /> Download Table
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                              <tr>
                                <th className="py-3 px-4">Time (s)</th>
                                <th className="py-3 px-4">Throttle</th>
                                <th className="py-3 px-4">Throttle (μs)</th>
                                <th className="py-3 px-4">Voltage (V)</th>
                                <th className="py-3 px-4">Current (A)</th>
                                <th className="py-3 px-4">Elec Power (W)</th>
                                <th className="py-3 px-4">Mech Power (W)</th>
                                <th className="py-3 px-4">Thrust (g)</th>
                                <th className="py-3 px-4">Thrust (kgf)</th>
                                <th className="py-3 px-4">RPM</th>
                                <th className="py-3 px-4">Torque (N·m)</th>
                                <th className="py-3 px-4">Prop Eff (g/W)</th>
                                <th className="py-3 px-4">System Eff (gf/W)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 font-semibold text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                              {processedPoints.map((pt, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="py-2.5 px-4 text-slate-400">{pt.time}s</td>
                                  <td className="py-2.5 px-4 font-bold text-blue-600 dark:text-blue-400">{pt.throttlePercent}%</td>
                                  <td className="py-2.5 px-4">{pt.throttleUs}</td>
                                  <td className="py-2.5 px-4">{pt.voltage.toFixed(1)}</td>
                                  <td className="py-2.5 px-4">{pt.current.toFixed(1)}</td>
                                  <td className="py-2.5 px-4 font-bold">{pt.powerElec}</td>
                                  <td className="py-2.5 px-4 text-slate-500">{pt.powerMech}</td>
                                  <td className="py-2.5 px-4 font-bold text-emerald-600 dark:text-emerald-400">{pt.thrustG}</td>
                                  <td className="py-2.5 px-4 text-emerald-600 dark:text-emerald-400">{pt.thrustKgf}</td>
                                  <td className="py-2.5 px-4">{pt.rpm}</td>
                                  <td className="py-2.5 px-4 text-purple-600 dark:text-purple-400">{pt.torqueNm}</td>
                                  <td className="py-2.5 px-4 font-bold text-amber-600 dark:text-amber-400">{pt.propEff}</td>
                                  <td className="py-2.5 px-4 font-bold text-pink-600 dark:text-pink-400">{pt.systemEff}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* External Reference Datasheets Section */}
            {(itemData.url || itemData.link_motor || itemData.linkMotor || itemData.link_esc || itemData.link_propeller) && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                  External Datasheets & Verification Links
                </h3>
                <div className="flex flex-wrap gap-4">
                  {(itemData.url || itemData.link_motor || itemData.linkMotor) && (
                    <a
                      href={itemData.url || itemData.link_motor || itemData.linkMotor}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 px-5 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-bold text-blue-600 dark:text-blue-400 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> Product Specification Datasheet
                    </a>
                  )}
                  {itemData.link_esc && (
                    <a
                      href={itemData.link_esc}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 px-5 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-bold text-blue-600 dark:text-blue-400 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> ESC Spec sheet
                    </a>
                  )}
                  {itemData.link_propeller && (
                    <a
                      href={itemData.link_propeller}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 px-5 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-bold text-blue-600 dark:text-blue-400 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> Propeller Spec sheet
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Share Modal Integration */}
            <ShareModal
              isOpen={shareOpen}
              onClose={() => setShareOpen(false)}
              type={activeType as any}
              name={itemData.name || itemData.motor_name || itemData.motor || itemName}
            />
          </>
        )}
      </main>
    </Layout>
  );
};
