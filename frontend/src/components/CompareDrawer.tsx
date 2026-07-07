import React from 'react';
import { useCompare } from '../context/CompareContext';
import { X, Play, RefreshCw } from 'lucide-react';

export interface CompareItemData {
  id: string;
  name: string;
  brand: string;
  [key: string]: any;
}

interface CompareDrawerProps {
  selectedItems: CompareItemData[];
  onOpenCompareModal: () => void;
}

export const CompareDrawer: React.FC<CompareDrawerProps> = ({
  selectedItems,
  onOpenCompareModal
}) => {
  const { drawerOpen, setDrawerOpen, removeCompare, clearCompare, compareType } = useCompare();

  if (!drawerOpen || selectedItems.length === 0) return null;

  return (
    <div 
      className={`fixed top-[70px] right-0 bottom-0 w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-l border-slate-200 dark:border-slate-800 shadow-2xl z-40 flex flex-col transition-transform duration-350 ease-out`}
      style={{ transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)' }}
    >
      {/* Drawer Header */}
      <div className="p-4 border-b border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between">
        <div>
          <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-sm uppercase tracking-wide">
            Comparison Board
          </h3>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider font-mono">
            {selectedItems.length} of 3 {compareType}s selected
          </span>
        </div>
        <button 
          onClick={() => setDrawerOpen(false)}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Items Container */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {selectedItems.map((item, index) => (
          <div key={item.id} className="compare-item relative group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#003366]/5 dark:bg-blue-950/40 border border-slate-200/40 dark:border-slate-800/40 font-bold text-xs text-[#003366] dark:text-blue-400 flex items-center justify-center">
                #{index + 1}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="compare-item-info truncate">{item.name}</span>
                <span className="compare-item-brand">{item.brand}</span>
              </div>
            </div>
            <button 
              onClick={() => removeCompare(item.id)}
              className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {/* Empty slots placeholders */}
        {Array.from({ length: 3 - selectedItems.length }).map((_, i) => (
          <div key={i} className="flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800/80 rounded-xl p-6 text-center text-xs text-slate-400 dark:text-slate-600">
            <div className="flex flex-col items-center gap-1 font-semibold">
              <div className="compare-thumb-box">
                +
              </div>
              <span>Add {compareType} to compare</span>
            </div>
          </div>
        ))}
      </div>

      {/* Drawer Footer Actions */}
      <div className="p-4 border-t border-slate-200/60 dark:border-slate-800/80 flex flex-col gap-2 bg-slate-50/50 dark:bg-slate-950/20">
        <button
          onClick={onOpenCompareModal}
          disabled={selectedItems.length < 2}
          className="w-full bg-[#003366] hover:bg-[#002244] disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <RefreshCw className="w-4 h-4" />
          Compare Specifications
        </button>
        <button
          onClick={clearCompare}
          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          Clear Selection
        </button>
      </div>
    </div>
  );
};
