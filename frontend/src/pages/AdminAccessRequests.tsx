import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Shield, UserCheck, X, Check, Info } from 'lucide-react';

interface AccessRequest {
  id: string;
  fullName: string;
  email: string;
  justification: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export const AdminAccessRequests: React.FC = () => {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/db/access_requests?order=created_at.desc');
      if (!res.ok) throw new Error('Failed to load access requests');
      const data = await res.json();
      setRequests(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAction = async (id: string, email: string, status: 'approved' | 'rejected') => {
    if (!window.confirm(`Mark access request from "${email}" as ${status}?`)) return;

    try {
      const res = await fetch(`/api/db/access_requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to update request');
      
      // If approved, trigger user profile registration
      if (status === 'approved') {
        await fetch('/api/auth/register-approved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        }).catch(err => console.error("Auto profile creation failed", err));
      }

      fetchRequests();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Layout>
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[1200px] w-full mx-auto relative z-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300">
                Admin Console
              </span>
              <span className="text-xs text-slate-400 font-medium">Access Requests</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              Access Request Applications
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Approve or deny UAV console account registration requests.
            </p>
          </div>
        </header>

        <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-5">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-mono uppercase tracking-wider">
                  <th className="py-3 px-3">Applicant Name</th>
                  <th className="py-3 px-3">Email Address</th>
                  <th className="py-3 px-3">Justifications / Purpose</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-4 px-3"><div className="h-4 w-28 bg-slate-200 rounded"></div></td>
                      <td className="py-4 px-3"><div className="h-4 w-32 bg-slate-200 rounded"></div></td>
                      <td className="py-4 px-3"><div className="h-4 w-48 bg-slate-200 rounded"></div></td>
                      <td className="py-4 px-3"><div className="h-4 w-12 bg-slate-200 rounded"></div></td>
                      <td className="py-4 px-3"><div className="h-4 w-20 bg-slate-200 rounded ml-auto"></div></td>
                    </tr>
                  ))
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      <Info className="w-6 h-6 mx-auto mb-2" />
                      No access request records.
                    </td>
                  </tr>
                ) : (
                  requests.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10">
                      <td className="py-3.5 px-3 font-semibold text-[#001e40] dark:text-slate-100">{r.fullName}</td>
                      <td className="py-3.5 px-3 font-semibold">{r.email}</td>
                      <td className="py-3.5 px-3 text-slate-500 dark:text-slate-400 text-xs max-w-xs truncate" title={r.justification}>
                        {r.justification}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          r.status === 'approved' ? 'bg-emerald-150 text-emerald-800' :
                          r.status === 'rejected' ? 'bg-rose-150 text-rose-800' :
                          'bg-amber-150 text-amber-800'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        {r.status === 'pending' && (
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleAction(r.id, r.email, 'approved')}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded cursor-pointer"
                              title="Approve"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleAction(r.id, r.email, 'rejected')}
                              className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded cursor-pointer"
                              title="Reject"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
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
