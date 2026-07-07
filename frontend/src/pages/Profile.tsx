import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { Shield, Key, Mail, CheckCircle, Info, Calendar } from 'lucide-react';

interface AuditLog {
  id: string;
  timestamp: string;
  details: string;
}

export const Profile: React.FC = () => {
  const { session } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Contribution graph states
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [activityMap, setActivityMap] = useState<Record<string, number>>({});
  const [totalActivities, setTotalActivities] = useState(0);

  const fetchUserLogs = async () => {
    try {
      const res = await fetch('/api/db/audit_logs?order=timestamp.desc&limit=1000');
      if (res.ok) {
        const data = await res.json();
        setLogs(data || []);
        
        // Group by YYYY-MM-DD
        const map: Record<string, number> = {};
        let total = 0;
        (data || []).forEach((log: any) => {
          if (log.timestamp) {
            const dateStr = log.timestamp.split('T')[0];
            map[dateStr] = (map[dateStr] || 0) + 1;
            total++;
          }
        });
        setActivityMap(map);
        setTotalActivities(total);
      }
    } catch (err) {
      console.error('Failed to load user logs', err);
    }
  };

  useEffect(() => {
    fetchUserLogs();
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password.');

      setSuccessMsg('Your account credentials have been updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate 53 weeks grid (Sunday to Saturday)
  const getContributionGrid = () => {
    const grid: Date[][] = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364); // last 365 days
    // Align to the start of that week's Sunday
    const startDay = startDate.getDay();
    startDate.setDate(startDate.getDate() - startDay);

    const currentDate = new Date(startDate);
    for (let w = 0; w < 53; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      grid.push(week);
    }
    return grid;
  };

  const grid = getContributionGrid();

  return (
    <Layout>
      <main className="flex-1 flex flex-col px-4 md:px-12 py-6 max-w-[900px] w-full mx-auto relative z-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200/50 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono uppercase tracking-wider bg-[#003366]/10 dark:bg-blue-950/40 text-[#003366] dark:text-blue-300">
                User Dashboard
              </span>
              <span className="text-xs text-slate-400 font-medium">My Profile</span>
            </div>
            <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
              My Profile
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
              Manage your credentials and view your console contribution statistics.
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* User Info Details */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 md:col-span-1 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[#001e40] dark:text-slate-150 uppercase tracking-wide font-mono pb-2 border-b border-slate-100 dark:border-slate-800">
                Active Account
              </h3>
              
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-450 uppercase font-mono tracking-wider font-bold">Email Address</span>
                <span className="text-xs font-semibold text-slate-750 dark:text-slate-100 flex items-center gap-1.5 truncate">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {session?.email || 'Unknown'}
                </span>
              </div>

              <div className="flex flex-col gap-1 mt-2">
                <span className="text-[10px] text-slate-450 uppercase font-mono tracking-wider font-bold">Console Role</span>
                <span className="self-start px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  {session?.role || 'User'}
                </span>
              </div>
            </div>

            {/* Password edit form */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 md:col-span-2">
              <h3 className="text-sm font-bold text-[#001e40] dark:text-slate-150 uppercase tracking-wide font-mono pb-2 border-b border-slate-100 dark:border-slate-800 mb-5 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-[#003366] dark:text-blue-500" /> Update Password
              </h3>

              {successMsg && (
                <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-355 border border-emerald-250/20 text-xs rounded-xl flex items-center gap-2 font-semibold">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {successMsg}
                </div>
              )}

              {errorMsg && (
                <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-355 border border-rose-250/20 text-xs rounded-xl flex items-center gap-2 font-semibold">
                  <Info className="w-4 h-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider font-mono mb-2">Current Password</label>
                  <input 
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl py-2.5 px-3.5 text-xs font-semibold focus:outline-none focus:border-[#003366] dark:text-slate-100"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider font-mono mb-2">New Password</label>
                  <input 
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 6 characters)"
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl py-2.5 px-3.5 text-xs font-semibold focus:outline-none focus:border-[#003366] dark:text-slate-100"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider font-mono mb-2">Confirm New Password</label>
                  <input 
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl py-2.5 px-3.5 text-xs font-semibold focus:outline-none focus:border-[#003366] dark:text-slate-100"
                  />
                </div>

                <div className="flex justify-end mt-4">
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-[#003366] hover:bg-[#002244] dark:bg-blue-600 dark:hover:bg-blue-700 text-white px-5 py-2.5 text-xs font-bold rounded-xl disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {isSubmitting ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* GitHub Activity Contribution Graph */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-5">
              <h3 className="text-sm font-bold text-[#001e40] dark:text-slate-150 uppercase tracking-wide font-mono flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#003366] dark:text-blue-500" /> Activity History
              </h3>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {totalActivities} contributions in the last year
              </span>
            </div>

            <div className="flex items-start justify-center overflow-x-auto w-full py-4 bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-slate-100/50 dark:border-slate-850/60 p-4">
              <div className="flex items-center min-w-max">
                {/* Day Labels */}
                <div className="flex flex-col justify-between text-[9px] text-slate-400 dark:text-slate-500 font-bold h-[88px] pr-2 pb-[4px]">
                  <span>Sun</span>
                  <span>Tue</span>
                  <span>Thu</span>
                  <span>Sat</span>
                </div>

                {/* Grid */}
                <div className="flex gap-[3px] select-none">
                  {grid.map((week, wIdx) => (
                    <div key={wIdx} className="flex flex-col gap-[3px]">
                      {week.map((day, dIdx) => {
                        const dateStr = day.toISOString().split('T')[0];
                        const count = activityMap[dateStr] || 0;
                        let colorClass = 'bg-slate-200/70 dark:bg-slate-800';
                        if (count > 0 && count <= 2) colorClass = 'bg-emerald-100 dark:bg-emerald-950/80';
                        else if (count > 2 && count <= 4) colorClass = 'bg-emerald-300 dark:bg-emerald-800/80';
                        else if (count > 4 && count <= 6) colorClass = 'bg-emerald-500 dark:bg-emerald-600/90';
                        else if (count > 6) colorClass = 'bg-emerald-700 dark:bg-emerald-400';

                        const formattedDate = day.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                        const tooltipText = `${count} ${count === 1 ? 'activity' : 'activities'} on ${formattedDate}`;

                        return (
                          <div 
                            key={dIdx}
                            className={`w-[10px] h-[10px] rounded-[2px] transition-colors relative group cursor-pointer ${colorClass}`}
                          >
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-50 pointer-events-none">
                              <div className="bg-slate-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap shadow-md font-semibold font-sans">
                                {tooltipText}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-4 px-2">
              <span>Learn how we track powertrain updates</span>
              <div className="flex items-center gap-1">
                <span>Less</span>
                <div className="w-[10px] h-[10px] rounded-[2px] bg-slate-200/70 dark:bg-slate-800"></div>
                <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-100 dark:bg-emerald-950/80"></div>
                <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-300 dark:bg-emerald-800/80"></div>
                <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-500 dark:bg-emerald-600/90"></div>
                <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-700 dark:bg-emerald-400"></div>
                <span>More</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
};
