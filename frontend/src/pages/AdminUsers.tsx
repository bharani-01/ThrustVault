import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Database, Shield, User, Info } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  created_at: string;
}

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/user-profiles');
      if (!res.ok) throw new Error('Failed to fetch user profiles');
      const data = await res.json();
      setUsers(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
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
              <span className="text-xs text-slate-400 font-medium">User Management</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              Console Access Accounts
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Manage accounts, verify emails, and modify role policies for powertrain databases.
            </p>
          </div>
        </header>

        <div className="bg-white dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 shadow-sm rounded-xl p-5">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-mono uppercase tracking-wider">
                  <th className="py-3 px-3">Profile Account</th>
                  <th className="py-3 px-3">Assigned Role</th>
                  <th className="py-3 px-3">Created On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-4 px-3"><div className="h-4 w-44 bg-slate-200 rounded"></div></td>
                      <td className="py-4 px-3"><div className="h-4 w-16 bg-slate-200 rounded"></div></td>
                      <td className="py-4 px-3"><div className="h-4 w-28 bg-slate-200 rounded"></div></td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-400">
                      <Info className="w-6 h-6 mx-auto mb-2" />
                      No registered user accounts found.
                    </td>
                  </tr>
                ) : (
                  users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/10">
                      <td className="py-3.5 px-3 font-semibold flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        {u.email}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          u.role === 'admin' 
                            ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300' 
                            : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-400 font-mono">
                        {new Date(u.created_at).toLocaleDateString()}
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
