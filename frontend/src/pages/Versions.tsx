import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { Calendar, CheckCircle2, ArrowLeft, Sun, Moon } from 'lucide-react';

interface VersionRelease {
  tag: string;
  isCurrent: boolean;
  date: string;
  desc: string;
  features: string[];
}

export const Versions: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  const releases: VersionRelease[] = [
    {
      tag: 'v2.0.0 (Beta) / v1.8.9',
      isCurrent: true,
      date: 'June 21, 2026',
      desc: 'Full-scale portal modernization featuring standalone administrative capabilities, security session sync with SQLite fallbacks, smooth page loader transition streams, and a completely redesigned highlights landing portal.',
      features: [
        'Standalone Admin Portal suite (v8001)',
        'SQLite database syncer fallbacks',
        'Unified page loaders & progress bars',
        'Glassmorphic landing & highlights design',
        'Cognito auth integration and user bans',
        'Audit logs & hardware metrics monitor'
      ]
    },
    {
      tag: 'v1.5.0',
      isCurrent: false,
      date: 'June 11, 2026',
      desc: 'Enhanced telemetry charting overlays, SheetJS dataset log mappers, smart search autocomplete suggestions, and external powertrain scraper integrations.',
      features: [
        'Interactive motor profile overlays',
        'SheetJS Excel file log ingestion',
        'Live search suggestions dropdown',
        'Custom extra_data JSONB mapping',
        'Dual-source motor scraper utilities',
        'XSS sanitization & constraint checks'
      ]
    },
    {
      tag: 'v1.0.0',
      isCurrent: false,
      date: 'June 8, 2026',
      desc: 'Initial MVP release of the ThrustVault UAV powertrains database, establishing core relational schemas, Excel template formats, and basic performance analytics curves.',
      features: [
        'Relational PostgreSQL catalog tables',
        'Cascading motor deletion constraints',
        'Performance analytics curve module',
        'CSV templates & dataset points downloads',
        'Read-only anonymous guest search',
        'Initial Render.com Flask deployment'
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 relative transition-colors duration-300 flex flex-col">
      {/* Blueprint grid background shader */}
      <div className="fixed inset-0 w-full h-full pointer-events-none blueprint-grid z-0 opacity-20 dark:opacity-30"></div>

      {/* Floating Theme Toggle */}
      <header className="relative z-10 w-full max-w-[800px] mx-auto px-4 md:px-0 pt-6 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2">
          <img 
            src={theme === 'dark' ? '/logo_dark.webp' : '/logo_light.webp'} 
            alt="ThrustVault Logo" 
            className="h-8 w-auto block object-contain"
          />
        </Link>

        <div className="flex items-center gap-4">
          <button 
            onClick={toggleTheme}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-505 hover:text-blue-500 shadow-sm transition-all hover:scale-105 cursor-pointer"
            title="Toggle theme mode"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-blue-500" />}
          </button>
          <Link 
            to="/login"
            className="bg-[#003366] hover:bg-[#002244] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-semibold py-2 px-4 rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 max-w-[800px] w-full mx-auto px-4 md:px-0 py-10 flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
            Website <span className="text-[#003366] dark:text-blue-500">Version Catalog</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-xl">
            Chronological registry of design iterations, analytical tools, database releases, and performance logs for the ThrustVault UAV propulsion console.
          </p>
        </div>

        {/* Timeline wrapper */}
        <div className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800 ml-3 flex flex-col gap-10">
          {releases.map((rel, index) => (
            <div key={index} className="relative group">
              {/* Bullet circle */}
              <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 transition-colors ${
                rel.isCurrent 
                  ? 'bg-blue-500 border-blue-500 ring-4 ring-blue-500/20' 
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-350 dark:border-slate-800'
              }`} />

              {/* Version card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 p-6 flex flex-col gap-4 transition-all">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-lg text-slate-800 dark:text-slate-100 tracking-tight">{rel.tag}</span>
                    {rel.isCurrent && (
                      <span className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 border border-emerald-250/20 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full">
                        Current Release
                      </span>
                    )}
                    {!rel.isCurrent && (
                      <span className="bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border border-slate-200/10 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full">
                        Legacy
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-450 font-medium flex items-center gap-1.5 font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    {rel.date}
                  </span>
                </div>

                <p className="text-xs text-slate-650 dark:text-slate-350 font-medium leading-relaxed">
                  {rel.desc}
                </p>

                <div className="border-t border-slate-100 dark:border-slate-800/60 pt-4">
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                    {rel.features.map((feat, fIdx) => (
                      <li key={fIdx} className="text-xs text-slate-550 dark:text-slate-400 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Back navigation button */}
        <div className="pt-6 border-t border-slate-200/50 dark:border-slate-800/60 flex justify-center">
          <Link 
            to="/" 
            className="flex items-center gap-2 text-xs font-bold text-slate-550 hover:text-[#003366] dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Main Page
          </Link>
        </div>
      </main>
    </div>
  );
};
