import React from 'react';

interface KPICardProps {
  title: string;
  value: React.ReactNode;
  sub: string;
  icon: React.ReactNode;
  iconBgColor?: string;
  iconTextColor?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  sub,
  icon,
  iconBgColor = "bg-[#003366]/5 dark:bg-blue-950/40",
  iconTextColor = "text-[#003366] dark:text-[#a7c8ff]"
}) => {
  return (
    <div className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/80 shadow-sm rounded-xl p-4 md:p-5 flex flex-col justify-between hover:shadow-md transition-all duration-300">
      <div className="flex justify-between items-start">
        <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] font-semibold uppercase tracking-wider">
          {title}
        </span>
        <div className={`${iconTextColor} ${iconBgColor} rounded-lg p-1.5`}>
          {icon}
        </div>
      </div>
      <div className="mt-4">
        <div className="text-2xl md:text-3xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
          {value}
        </div>
        <span className="text-xs text-slate-400 font-medium mt-1 block">
          {sub}
        </span>
      </div>
    </div>
  );
};
