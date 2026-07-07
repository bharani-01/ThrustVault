import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { Shield, BookOpen, Terminal, FileText, Layers } from 'lucide-react';

export const Docs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'intro' | 'api' | 'telemetry'>('intro');

  return (
    <Layout>
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[1200px] w-full mx-auto relative z-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-[#003366]/10 dark:bg-blue-950/40 text-[#003366] dark:text-[#a7c8ff]">
                Developer Guide
              </span>
              <span className="text-xs text-slate-400 font-medium">Console Documentation</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              ThrustVault Documentation
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Complete reference for database schemas, telemetry upload structures, and developer API keys.
            </p>
          </div>
        </header>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-250/50 dark:border-slate-800 mb-6 font-semibold text-xs text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider">
          <button 
            onClick={() => setActiveTab('intro')}
            className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'intro' ? 'border-[#003366] text-[#003366] dark:text-blue-400' : 'border-transparent hover:text-slate-700'
            }`}
          >
            <BookOpen className="w-4 h-4" /> Overview
          </button>
          <button 
            onClick={() => setActiveTab('api')}
            className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'api' ? 'border-[#003366] text-[#003366] dark:text-blue-400' : 'border-transparent hover:text-slate-700'
            }`}
          >
            <Terminal className="w-4 h-4" /> REST APIs
          </button>
          <button 
            onClick={() => setActiveTab('telemetry')}
            className={`py-3 px-4 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'telemetry' ? 'border-[#003366] text-[#003366] dark:text-blue-400' : 'border-transparent hover:text-slate-700'
            }`}
          >
            <FileText className="w-4 h-4" /> CSV Uploads
          </button>
        </div>

        {/* Tab Contents */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-6 md:p-8 text-sm leading-relaxed space-y-6">
          
          {activeTab === 'intro' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h3 className="text-base font-extrabold text-[#001e40] dark:text-slate-100 uppercase tracking-wide">Platform Overview</h3>
              <p>
                ThrustVault provides UAV design teams, engineers, and researchers with a unified database of propulsion assets. The console tracks performance, sizing, and load metrics for:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Motors:</strong> KV ratings, stator sizes, poles configurations, and operating cell bounds.</li>
                <li><strong>ESCs:</strong> Amperage limits, supported voltages, MCU processors, and firmware.</li>
                <li><strong>Propellers:</strong> Sizing (diameter/pitch), materials, blades, and hub dimensions.</li>
                <li><strong>Telemetry Data:</strong> Real-time test stand run results mapping throttle to load values.</li>
              </ul>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h3 className="text-base font-extrabold text-[#001e40] dark:text-slate-100 uppercase tracking-wide">REST API Integrations</h3>
              <p>
                Developers can query the database directly from custom UAV load planners or flight control software.
              </p>
              
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border font-mono text-xs space-y-2">
                <div>
                  <span className="text-blue-600 font-bold">GET</span> /api/motors
                  <p className="text-slate-400 mt-1 font-sans text-xs">Query motor listings. Parameters: limit, offset, search, company.</p>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-800/80 my-2 pt-2">
                  <span className="text-blue-600 font-bold">GET</span> /api/escs
                  <p className="text-slate-400 mt-1 font-sans text-xs">Query speed controller listings.</p>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-800/80 my-2 pt-2">
                  <span className="text-blue-600 font-bold">GET</span> /api/propellers
                  <p className="text-slate-400 mt-1 font-sans text-xs">Query propeller specs.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'telemetry' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <h3 className="text-base font-extrabold text-[#001e40] dark:text-slate-100 uppercase tracking-wide">Spreadsheet & CSV Import Formats</h3>
              <p>
                Upload datasets from test stands (e.g. RC Benchmark, Tyto Robotics) in CSV or XLSX formats.
              </p>
              <p>
                The uploader looks for the following columns to index data coordinates:
              </p>
              <div className="overflow-hidden border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-850 font-bold text-slate-500 uppercase tracking-wider font-mono">
                      <th className="py-2.5 px-3">Column Name</th>
                      <th className="py-2.5 px-3">Data Type</th>
                      <th className="py-2.5 px-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                    <tr><td className="py-2.5 px-3 font-mono">Throttle</td><td className="py-2.5 px-3">Percentage / Decimal</td><td className="py-2.5 px-3 text-slate-400">PWM throttle load (0.0 to 1.0 or 0% to 100%)</td></tr>
                    <tr><td className="py-2.5 px-3 font-mono">Thrust</td><td className="py-2.5 px-3">Number</td><td className="py-2.5 px-3 text-slate-400">Max output force in grams (g)</td></tr>
                    <tr><td className="py-2.5 px-3 font-mono">Current</td><td className="py-2.5 px-3">Number</td><td className="py-2.5 px-3 text-slate-400">Amperage load (A)</td></tr>
                    <tr><td className="py-2.5 px-3 font-mono">Voltage</td><td className="py-2.5 px-3">Number</td><td className="py-2.5 px-3 text-slate-400">Input battery voltage cells (V)</td></tr>
                    <tr><td className="py-2.5 px-3 font-mono">RPM</td><td className="py-2.5 px-3">Number</td><td className="py-2.5 px-3 text-slate-400">Rotational speed (Revolutions Per Minute)</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </main>
    </Layout>
  );
};
