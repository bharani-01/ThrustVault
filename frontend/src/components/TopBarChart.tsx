import React from 'react';

export interface BarChartRowData {
  label: string;
  value: number;
  formattedValue: string;
  percentage: number; // 0 to 100
}

interface TopBarChartProps {
  data: BarChartRowData[];
  onRowClick?: (label: string) => void;
}

export const TopBarChart: React.FC<TopBarChartProps> = ({ data, onRowClick }) => {
  return (
    <div className="top-bar-chart w-full">
      {data.length === 0 ? (
        <div className="w-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-600 font-semibold py-8">
          No chart data available
        </div>
      ) : (
        data.map((item, index) => {
          const rankStr = String(index + 1).padStart(2, '0');
          return (
            <div 
              key={item.label}
              onClick={() => onRowClick && onRowClick(item.label)}
              className={`bar-row ${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/20 p-1.5 rounded-lg transition-colors' : ''}`}
            >
              {/* Rank Number */}
              <span className="bar-num">{rankStr}</span>
              
              {/* Item Label */}
              <span className="bar-label" title={item.label}>
                {item.label}
              </span>
              
              {/* Track and Fill */}
              <div className="bar-track">
                <div 
                  className="bar-fill" 
                  style={{ width: `${item.percentage}%` }}
                ></div>
              </div>
              
              {/* Value Label */}
              <span className="bar-value">{item.formattedValue}</span>
            </div>
          );
        })
      )}
    </div>
  );
};
