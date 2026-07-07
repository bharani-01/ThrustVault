import React from 'react';

export interface TreemapBlockData {
  label: string;
  value: number;
  percentage: number;
  sublabel?: string;
  color?: string;
}

interface TreemapProps {
  data: TreemapBlockData[];
  onBlockClick?: (label: string) => void;
}

const DEFAULT_COLORS = [
  'bg-gradient-to-br from-blue-700 to-indigo-900',
  'bg-gradient-to-br from-emerald-600 to-teal-800',
  'bg-gradient-to-br from-violet-600 to-purple-800',
  'bg-gradient-to-br from-amber-500 to-orange-700',
  'bg-gradient-to-br from-sky-500 to-blue-700',
  'bg-gradient-to-br from-rose-500 to-red-700',
];

export const Treemap: React.FC<TreemapProps> = ({ data, onBlockClick }) => {
  // Sort data descending by percentage
  const sortedData = [...data].sort((a, b) => b.percentage - a.percentage);

  return (
    <div className="treemap-container">
      {sortedData.length === 0 ? (
        <div className="w-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-600 font-semibold py-8">
          No distribution data available
        </div>
      ) : (
        sortedData.map((item, index) => {
          // Compute a flex-grow value based on percentage
          const flexGrow = Math.max(1, Math.round(item.percentage));
          const colorClass = item.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];

          return (
            <div
              key={item.label}
              onClick={() => onBlockClick && onBlockClick(item.label)}
              className={`treemap-block ${colorClass}`}
              style={{ 
                flexGrow: flexGrow,
                flexBasis: `${Math.max(15, item.percentage)}%`,
              }}
            >
              <div className="flex flex-col">
                <span className="treemap-block-label" title={item.label}>
                  {item.label}
                </span>
                {item.sublabel && (
                  <span className="treemap-block-sub">
                    {item.sublabel}
                  </span>
                )}
              </div>
              <div className="text-right mt-2">
                <span className="treemap-block-pct">
                  {item.percentage.toFixed(0)}%
                </span>
                <span className="text-[10px] opacity-75 ml-1 font-mono">
                  ({item.value})
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
