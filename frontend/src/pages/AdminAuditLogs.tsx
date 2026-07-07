import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Shield, FileText, Info } from 'lucide-react';

interface AuditLog {
  id: string;
  email: string;
  role: string;
  route: string;
  method: string;
  status: number;
  ip_address: string;
  user_agent: string;
  risk_level: string;
  details: string;
  timestamp: string;
}

export const AdminAuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/db/audit_logs?order=timestamp.desc');
      if (!res.ok) throw new Error('Failed to load audit logs');
      const data = await res.json();
      setLogs(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <Layout>
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[1200px] w-full mx-auto relative z-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300">
                Admin Console
              </span>
              <span className="text-xs text-slate-400 font-medium">Audit Logs</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              Console Activity Trail
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Monitor security transactions, database edits, user sessions, and API client requests.
            </p>
          </div>
        </header>

        <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-5">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-mono">
                  <th className="py-2.5 px-2">Timestamp</th>
                  <th className="py-2.5 px-2">User Email</th>
                  <th className="py-2.5 px-2">Role</th>
                  <th className="py-2.5 px-2">Route</th>
                  <th className="py-2.5 px-2">Method</th>
                  <th className="py-2.5 px-2">Status</th>
                  <th className="py-2.5 px-2">Action Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-3 px-2"><div className="h-4 w-28 bg-slate-200 rounded"></div></td>
                      <td className="py-3 px-2"><div className="h-4 w-32 bg-slate-200 rounded"></div></td>
                      <td className="py-3 px-2"><div className="h-4 w-12 bg-slate-200 rounded"></div></td>
                      <td className="py-3 px-2"><div className="h-4 w-20 bg-slate-200 rounded"></div></td>
                      <td className="py-3 px-2"><div className="h-4 w-8 bg-slate-200 rounded"></div></td>
                      <td className="py-3 px-2"><div className="h-4 w-8 bg-slate-200 rounded"></div></td>
                      <td className="py-3 px-2"><div className="h-4 w-48 bg-slate-200 rounded"></div></td>
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      <Info className="w-6 h-6 mx-auto mb-2" />
                      No activity logs found in database.
                    </td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10">
                      <td className="py-3 px-2 font-mono text-slate-400">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-2 font-semibold text-slate-700 dark:text-slate-355">{log.email}</td>
                      <td className="py-3 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          log.role === 'admin' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {log.role}
                        </span>
                      </td>
                      <td className="py-3 px-2 font-mono">{log.route}</td>
                      <td className="py-3 px-2 font-mono font-bold text-slate-400">{log.method}</td>
                      <td className="py-3 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          log.status >= 400 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-500 dark:text-slate-400 font-semibold">{log.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </Layout>
  );
};
