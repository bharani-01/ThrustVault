import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, Info } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'motor' | 'esc' | 'propeller';
  name: string;
}

// Only WhatsApp + Email as requested
const SOCIALS = [
  {
    label: 'WhatsApp',
    color: '#25D366',
    href: (url: string, text: string) =>
      `https://api.whatsapp.com/send?text=${encodeURIComponent(text + ': ' + url)}`,
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
        <path d="M12.012 2c-5.506 0-9.969 4.471-9.969 9.986 0 1.762.459 3.479 1.33 4.99L1.696 23l6.135-1.613c1.46.797 3.109 1.217 4.793 1.217 5.505 0 9.968-4.471 9.968-9.986 0-2.67-1.036-5.18-2.918-7.067C17.747 3.66 14.995 2.62 12.012 2zm5.727 14.161c-.25.353-1.46 1.412-2.002 1.453-.54.041-1.026.195-3.398-.748-2.862-1.139-4.707-4.062-4.85-4.252-.143-.19-1.144-1.524-1.144-2.907 0-1.383.722-2.062 1.002-2.344.28-.282.608-.353.81-.353.203 0 .406.002.583.01.183.008.43-.072.675.52.25.603.856 2.084.93 2.227.075.143.125.31.026.509-.1.2-.15.322-.3.5-.15.176-.314.392-.45.526-.149.149-.304.31-.13.61.174.3.774 1.277 1.66 2.067.953.85 1.75 1.112 2.002 1.238.252.126.398.106.548-.067.15-.173.647-.754.82-1.01.173-.256.347-.215.584-.127.237.088 1.503.708 1.761.838.258.13.43.195.493.303.063.108.063.626-.188.979z" />
      </svg>
    ),
  },
  {
    label: 'Email',
    color: '#6366f1',
    href: (url: string, text: string) =>
      `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(
        `Hi,\n\nI found this spec sheet on ThrustVault and thought you might find it useful:\n\n${url}\n\nPowered by ThrustVault — Motor Intelligence Platform`
      )}`,
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M2 7l10 7 10-7" />
      </svg>
    ),
  },
];

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, type, name }) => {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const shareUrl = `${window.location.origin}/share/${type}/${encodeURIComponent(name)}`;
  const shareText = `Check out this ${type}: ${name} on ThrustVault`;

  // Drive mount/unmount animation
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
    } else {
      const t = setTimeout(() => setVisible(false), 280);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      inputRef.current?.select();
      setTimeout(() => setCopied(false), 2200);
    });
  };

  if (!visible && !isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
      style={{
        backgroundColor: isOpen ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
        backdropFilter: isOpen ? 'blur(10px)' : 'none',
        WebkitBackdropFilter: isOpen ? 'blur(10px)' : 'none',
        transition: 'background-color 0.28s cubic-bezier(0.16,1,0.3,1)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white dark:bg-[#1c1c1e] rounded-3xl shadow-2xl w-full max-w-[460px] p-6 flex flex-col gap-5"
        style={{
          transform: isOpen ? 'scale(1)' : 'scale(0.93)',
          opacity: isOpen ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.28s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-[19px] font-bold text-slate-900 dark:text-slate-50 tracking-tight">
            Shareable public link
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* URL pill + Copy button */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#2c2c2e] border border-slate-200/60 dark:border-white/5 rounded-full px-4 py-1.5 pr-1.5">
          <input
            ref={inputRef}
            type="text"
            readOnly
            value={shareUrl}
            className="flex-1 bg-transparent text-[13px] font-medium text-slate-700 dark:text-slate-200 outline-none truncate cursor-pointer"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold cursor-pointer transition-all duration-150 active:scale-95 shrink-0"
            style={{
              backgroundColor: copied ? '#d1fae5' : '#d0e1fb',
              color: copied ? '#065f46' : '#0f172a',
            }}
          >
            {copied ? (
              <><Check className="w-3.5 h-3.5" /> Link copied</>
            ) : (
              <><Copy className="w-3.5 h-3.5" /> Copy link</>
            )}
          </button>
        </div>

        {/* Info note */}
        <div className="flex items-start gap-2.5 text-slate-400 dark:text-slate-500">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p className="text-[11.5px] leading-relaxed">
            Public links can be reshared. Share responsibly. If sharing with third parties, their policies apply.
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 dark:border-white/5" />

        {/* Share via: WhatsApp + Email */}
        <div className="flex gap-6">
          {SOCIALS.map((s) => (
            <a
              key={s.label}
              href={s.href(shareUrl, shareText)}
              target={s.label === 'Email' ? '_self' : '_blank'}
              rel="noreferrer"
              title={`Share via ${s.label}`}
              className="flex flex-col items-center gap-2 group no-underline"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-lg"
                style={{ backgroundColor: s.color }}
              >
                {s.icon}
              </div>
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 text-center">
                {s.label}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
