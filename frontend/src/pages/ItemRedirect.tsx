import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const RESERVED_WORDS = new Set([
  'dashboard',
  'login',
  'escs',
  'propellers',
  'analytics',
  'finder',
  'docs',
  'versions',
  'share',
  'request_access'
]);

export const ItemRedirect: React.FC = () => {
  const { itemName } = useParams<{ itemName: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!itemName) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const name = decodeURIComponent(itemName).trim();

    // Skip reserved words
    if (RESERVED_WORDS.has(name.toLowerCase())) {
      return;
    }

    const lookup = async () => {
      try {
        const res = await fetch(`/api/public/find-item/${encodeURIComponent(name)}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError(`Item "${name}" not found in ThrustVault database.`);
          } else {
            setError('Failed to resolve URL path.');
          }
          setTimeout(() => navigate('/dashboard', { replace: true }), 2500);
          return;
        }

        const data = await res.json();
        if (data.type === 'motor') {
          navigate(`/motor/profile/${encodeURIComponent(data.name)}`, { replace: true });
        } else if (data.type === 'esc') {
          navigate(`/esc/profile/${encodeURIComponent(data.name)}`, { replace: true });
        } else if (data.type === 'propeller') {
          navigate(`/propeller/profile/${encodeURIComponent(data.name)}`, { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      } catch (err) {
        console.error(err);
        navigate('/dashboard', { replace: true });
      }
    };

    lookup();
  }, [itemName, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* Blueprint grid background */}
      <div className="fixed inset-0 w-full h-full pointer-events-none blueprint-grid z-0 opacity-20 dark:opacity-30"></div>

      <div className="relative z-10 text-center flex flex-col items-center gap-3">
        {error ? (
          <>
            <div className="text-rose-500 font-bold text-sm tracking-wide font-mono uppercase">
              Lookup Failed
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {error} Redirecting to dashboard...
            </p>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-full border-2 border-t-blue-600 border-slate-200 dark:border-slate-800 animate-spin"></div>
            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">
              Resolving "{itemName}"
            </div>
          </>
        )}
      </div>
    </div>
  );
};
