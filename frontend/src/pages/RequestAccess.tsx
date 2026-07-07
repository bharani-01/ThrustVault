import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Check, ArrowLeft, ArrowRight, User, Mail, FileText } from 'lucide-react';

const slides = [
  {
    image: '/images/database_catalog.png',
    title: 'Propulsion Database',
    subtitle: 'Unified Specs Catalog',
    desc: 'Centralize and search motor dimensions, KV ratings, weights, and manufacturer specifications in one structured console.'
  },
  {
    image: '/images/telemetry_analytics.png',
    title: 'Telemetry Analysis',
    subtitle: 'Interactive Testing Logs',
    desc: 'Visualize test bench performance curves plotting thrust, RPM, and hover efficiency ratios across different propeller sizes.'
  },
  {
    image: '/images/propulsion_simulator.png',
    title: 'Propulsion Simulator',
    subtitle: 'Powertrain Predictions',
    desc: 'Input target UAV payload requirements and battery voltage constraints to receive validated motor configuration guidelines.'
  },
  {
    image: '/images/platform_mapping.png',
    title: 'Platform Compatibility',
    subtitle: 'UAV Configuration Matrix',
    desc: 'Map standard aerospace configurations (Quadcopter, Hexacopter, Octacopter) to validated propulsion system limits.'
  },
  {
    image: '/images/data_security.png',
    title: 'ITAR & Security Compliance',
    subtitle: 'Aerospace Authorization Controls',
    desc: 'Restrict flight log uploads and enforce corporate credential checks to align with ITAR specifications safety rules.'
  }
];

export const RequestAccess: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [justification, setJustification] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  // Slideshow Autoplay Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, 5500);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !justification) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/public/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email: email.trim(), justification })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setIsSuccess(true);
    } catch (err: any) {
      alert("Failed to submit request: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full select-none relative z-10 overflow-hidden">
      
      {/* LEFT SPLIT PANEL: Product Slideshow */}
      <div className="hidden lg:flex relative w-[50%] flex-col justify-between p-12 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 overflow-hidden border-r border-slate-200 dark:border-slate-800/80 animate-slide-left">
        {/* Blueprint background shader grid overlay */}
        <div className="absolute inset-0 w-full h-full pointer-events-none blueprint-grid z-0 opacity-[0.08] dark:opacity-[0.03]"></div>
        
        {/* Brand */}
        <Link to="/" className="relative z-10 flex items-center gap-2">
          <img src="/logo_light.webp" alt="ThrustVault Logo" className="h-8 w-auto dark:hidden" />
          <img src="/logo_dark.webp" alt="ThrustVault Logo" className="h-8 w-auto hidden dark:block" />
        </Link>

        {/* Slideshow Core */}
        <div className="relative z-10 my-auto flex flex-col items-center max-w-xl mx-auto w-full gap-10">
          {/* Image slide frame */}
          <div className="w-full bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-xl p-3 overflow-hidden aspect-video relative flex items-center justify-center">
            {slides.map((slide, idx) => (
              <img
                key={idx}
                src={slide.image}
                alt={slide.title}
                className={`absolute inset-3 w-[calc(100%-24px)] h-[calc(100%-24px)] object-cover rounded-xl transition-all duration-700 ease-in-out ${
                  activeSlide === idx ? 'opacity-100 scale-100 translate-x-0' : 'opacity-0 scale-95 pointer-events-none translate-x-4'
                }`}
              />
            ))}
          </div>

          {/* Texts */}
          <div className="text-center space-y-4 min-h-[140px] flex flex-col items-center">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider bg-[#003366]/10 dark:bg-blue-900/30 text-[#003366] dark:text-blue-400 border border-[#003366]/15 dark:border-blue-900/50 inline-block transition-all duration-300">
              {slides[activeSlide].subtitle}
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#001e40] dark:text-slate-100 transition-all duration-300">
              {slides[activeSlide].title}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-lg transition-all duration-300">
              {slides[activeSlide].desc}
            </p>
          </div>

          {/* Navigation Dots */}
          <div className="flex gap-2 justify-center">
            {slides.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveSlide(idx)}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  activeSlide === idx 
                    ? 'w-6 bg-[#003366] dark:bg-blue-500' 
                    : 'w-2.5 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between text-xs font-semibold text-slate-400 dark:text-slate-500 border-t border-slate-200 dark:border-slate-800 pt-6">
          <span>&copy; {new Date().getFullYear()} ThrustVault Inc.</span>
          <Link to="/docs" className="hover:text-[#003366] dark:hover:text-blue-400 transition-colors">Documentation</Link>
        </div>
      </div>

      {/* RIGHT SPLIT PANEL: Forms */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 md:px-12 py-10 bg-slate-50 dark:bg-slate-950 relative animate-slide-right">
        <div className="lg:hidden absolute inset-0 w-full h-full pointer-events-none blueprint-grid z-0 opacity-15"></div>

        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-xl p-8 relative z-10 flex flex-col gap-6">
          
          {!isSuccess ? (
            <>
              {/* Form Header */}
              <div className="flex flex-col gap-1.5">
                <h2 className="text-2xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight">
                  Request <span className="text-[#003366] dark:text-blue-500">Access</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
                  Submit your details to request a database user account.
                </p>
              </div>

              {/* Request Form */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <label htmlFor="fullName" className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider mb-2">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={isLoading}
                      required
                      placeholder="e.g. John Doe"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-9 pr-3.5 text-sm outline-none transition-all focus:border-[#003366] focus:dark:border-blue-500 focus:bg-white focus:dark:bg-slate-900 focus:ring-4 focus:ring-[#003366]/10 placeholder-slate-400 font-medium"
                    />
                  </div>
                </div>

                <div className="flex flex-col">
                  <label htmlFor="email" className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider mb-2">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="email" 
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      required
                      placeholder="e.g. john@company.com"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-9 pr-3.5 text-sm outline-none transition-all focus:border-[#003366] focus:dark:border-blue-500 focus:bg-white focus:dark:bg-slate-900 focus:ring-4 focus:ring-[#003366]/10 placeholder-slate-400 font-medium"
                    />
                  </div>
                </div>

                <div className="flex flex-col">
                  <label htmlFor="justification" className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wider mb-2">Justification / Reason</label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                    <textarea 
                      id="justification"
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      disabled={isLoading}
                      required
                      placeholder="Why do you require access to ThrustVault? Specify team, university, or project name."
                      rows={4}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-9 pr-3.5 text-sm outline-none transition-all focus:border-[#003366] focus:dark:border-blue-500 focus:bg-white focus:dark:bg-slate-900 focus:ring-4 focus:ring-[#003366]/10 placeholder-slate-400 font-medium"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[#003366] hover:bg-[#002244] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? 'Submitting...' : 'Submit Request'}
                </button>
              </form>

              <div className="text-center pt-2">
                <Link 
                  to="/login" 
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Sign In
                </Link>
              </div>
            </>
          ) : (
            /* Success View */
            <div className="text-center flex flex-col gap-4 py-4 animate-in fade-in zoom-in duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center mx-auto shadow-sm">
                <Check className="w-8 h-8 text-emerald-500" />
              </div>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-xl font-extrabold text-[#001e40] dark:text-slate-100 tracking-tight uppercase">Request Submitted</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
                  Your access request has been recorded. Our administrators will review your application shortly.
                </p>
              </div>
              <Link 
                to="/login"
                className="w-full bg-[#003366] hover:bg-[#002244] dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors"
              >
                Return to Sign In
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

        </div>
      </div>

      {/* ═══════════════════ GLOBAL STYLES ══════════════════════ */}
      <style>{`
        .animate-slide-left {
          animation: slideLeft 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-slide-right {
          animation: slideRight 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes slideLeft {
          from {
            opacity: 0;
            transform: translateX(-40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideRight {
          from {
            opacity: 0;
            transform: translateX(40px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
};
