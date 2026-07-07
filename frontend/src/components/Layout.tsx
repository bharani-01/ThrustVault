import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { 
  Search, ChevronDown, LogOut, Sun, Moon, Menu, X, 
  Settings, Users, FileText, Upload, Download, UserCheck, Shield, User
} from 'lucide-react';
import { AICopilotWidget } from './AICopilotWidget';

interface LayoutProps {
  children: React.ReactNode;
  onSearchChange?: (query: string) => void;
  onCategoryChange?: (categoryId: string) => void;
  searchPlaceholder?: string;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  onSearchChange,
  onCategoryChange,
  searchPlaceholder = "Search motors, brands, ESC..."
}) => {
  const { session, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Suggestions states
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  const profileRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);
  const dataMenuRef = useRef<HTMLDivElement>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  const isAdmin = session?.role === 'admin';
  const displayName = session?.name || session?.email?.split('@')[0] || 'User';
  const userInitials = session?.name 
    ? session.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() 
    : (session?.email ? session.email.substring(0, 2).toUpperCase() : 'U');

  // Close dropdowns and suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
      if (adminMenuRef.current && !adminMenuRef.current.contains(target)) {
        setAdminMenuOpen(false);
      }
      if (dataMenuRef.current && !dataMenuRef.current.contains(target)) {
        setDataMenuOpen(false);
      }
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch categories on mount
  useEffect(() => {
    fetch('/api/categories')
      .then(res => res.json())
      .then(data => setCategories(data || []))
      .catch(err => console.error(err));
  }, []);

  // Debounce suggest search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/motors?limit=8&search=${encodeURIComponent(q)}`)
        .then(res => res.json())
        .then(data => {
          setSuggestions(data || []);
        })
        .catch(err => console.error(err));
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearchChange) {
      onSearchChange(searchQuery);
    }
    setShowSuggestions(false);
  };

  const handleSearchChangeLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (onSearchChange) {
      onSearchChange(val);
    }
    setShowSuggestions(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
        const m = suggestions[activeSuggestionIndex];
        setSearchQuery(m.motor_name);
        if (onSearchChange) onSearchChange(m.motor_name);
        if (onCategoryChange) onCategoryChange(m.category_id);
        setShowSuggestions(false);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
      isActive 
        ? 'bg-[#003366]/10 dark:bg-blue-950/40 text-[#003366] dark:text-[#a7c8ff]' 
        : 'text-slate-600 dark:text-slate-300 hover:text-[#003366] dark:hover:text-[#a7c8ff] hover:bg-slate-50 dark:hover:bg-slate-800/40'
    }`;

  const dropdownItemClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
      isActive
        ? 'bg-[#003366]/10 dark:bg-blue-950/40 text-[#003366] dark:text-[#a7c8ff]'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
    }`;

  return (
    <div className="min-h-screen bg-[#f8f9fa] dark:bg-slate-950 text-slate-800 dark:text-slate-100 relative transition-colors duration-300 flex flex-col">
      {/* Blueprint Grid Shader */}
      <div className="fixed inset-0 w-full h-full pointer-events-none blueprint-grid z-0"></div>

      {/* Floating AI Copilot Chat assistant */}
      <AICopilotWidget />

      {/* Header / Sidebar Horizontal Navbar */}
      <aside className="relative z-50 shrink-0 w-full h-[70px] bg-white dark:bg-slate-900 border-b border-slate-200/60 dark:border-slate-800/80 shadow-sm flex items-center justify-between px-4 md:px-8">
        
        {/* Logo (Left) */}
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img 
              src={theme === 'dark' ? '/logo_dark.webp' : '/logo_light.webp'} 
              alt="ThrustVault Logo" 
              className="h-8 w-auto block object-contain"
            />
          </Link>
        </div>

        {/* Desktop Navigation Links (Center) */}
        <nav className="hidden lg:flex items-center gap-1.5 mx-auto">
          <NavLink to="/dashboard" className={navLinkClass}>
            Motors
          </NavLink>
          <NavLink to="/escs" className={navLinkClass}>
            ESCs
          </NavLink>
          <NavLink to="/propellers" className={navLinkClass}>
            Propellers
          </NavLink>
          <NavLink to="/analytics" className={navLinkClass}>
            Test Runs
          </NavLink>
          <NavLink to="/finder" className={navLinkClass}>
            Motor Finder
          </NavLink>
          <a 
            href="https://rotrix.reude.tech/RotriDASH/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer text-slate-600 dark:text-slate-300 hover:text-[#003366] dark:hover:text-[#a7c8ff] hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            RotriDash
          </a>
        </nav>

        {/* Search Bar (Navbar Center/Right Area) */}
        {onSearchChange && (
          <div className="relative flex-1 max-w-xs md:max-w-md mx-4 md:mx-6" ref={searchWrapperRef}>
            <form onSubmit={handleSearchSubmit}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChangeLocal}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (searchQuery.trim().length >= 1) setShowSuggestions(true);
                }}
                placeholder={searchPlaceholder}
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-850 rounded-xl pl-9 pr-8 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10 transition-all duration-200"
              />
              {searchQuery && (
                <button 
                  type="button" 
                  onClick={() => { setSearchQuery(''); onSearchChange(''); setSuggestions([]); setShowSuggestions(false); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            {/* Suggestions Dropdown */}
            {showSuggestions && searchQuery.trim().length >= 1 && (
              <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl shadow-xl z-50 max-h-[320px] overflow-y-auto p-1.5 flex flex-col gap-1 text-left">
                {suggestions.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-slate-400 dark:text-slate-500">
                    No motors match "<strong>{searchQuery}</strong>"
                  </div>
                ) : (
                  <>
                    <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80 uppercase tracking-wider mb-1 select-none">
                      Suggestions &middot; {suggestions.length} match{suggestions.length !== 1 ? 'es' : ''} across all categories
                    </div>
                    {suggestions.map((m, idx) => {
                      const cat = categories.find(c => c.id === m.category_id);
                      const catName = cat ? cat.name : 'Uncategorized';
                      const initials = (m.motor_name || '?').charAt(0).toUpperCase();

                      return (
                        <div
                          key={m.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setSearchQuery(m.motor_name);
                            if (onSearchChange) onSearchChange(m.motor_name);
                            if (onCategoryChange) onCategoryChange(m.category_id);
                            setShowSuggestions(false);
                          }}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors text-left ${
                            activeSuggestionIndex === idx
                              ? 'bg-blue-50/50 dark:bg-blue-950/20 text-[#003366] dark:text-blue-400'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                          }`}
                        >
                          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-150 dark:bg-slate-800 text-slate-600 dark:text-slate-350 font-bold text-xs">
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {m.motor_name}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {m.company} {m.recommended_esc ? ` · ESC: ${m.recommended_esc}` : ''}
                            </div>
                          </div>
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono">
                            {catName}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Right Side Actions */}
        <div className="flex items-center gap-4">
          {/* User Profile avatar trigger */}
          <div className="relative" ref={profileRef}>
            <button 
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 group cursor-pointer focus:outline-none"
            >
              <div className="w-8 h-8 rounded-full bg-[#003366] dark:bg-blue-600 text-white font-bold text-xs flex items-center justify-center border border-slate-200/20 shadow-sm transition-transform group-hover:scale-105">
                {userInitials}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
            </button>
            {/* Profile Dropdown Card */}
            {profileOpen && (
              <div className="absolute right-0 mt-2.5 w-64 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-xl p-3 flex flex-col gap-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-3 px-2 py-2 border-b border-slate-100 dark:border-slate-850 pb-3 mb-1">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#003366] to-[#0055a5] dark:from-blue-600 dark:to-blue-400 text-white font-extrabold text-sm flex items-center justify-center shadow-sm shrink-0">
                    {userInitials}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate capitalize">
                        {displayName}
                      </span>
                      {isAdmin && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-450 border border-rose-100 dark:border-rose-900 tracking-wider shrink-0">
                          Admin
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                      {session?.email || 'guest@thrustvault.com'}
                    </span>
                  </div>
                </div>

                {/* Profile settings option */}
                <Link 
                  to="/profile"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 w-full text-left px-2.5 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl cursor-pointer transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  Account Settings
                </Link>
                
                {/* Theme Toggle option */}
                <button 
                  onClick={toggleTheme}
                  className="flex items-center justify-between w-full text-left px-2.5 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2">
                    {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-blue-500" />}
                    Theme: {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </span>
                </button>
 
                {/* Log out option */}
                <button 
                  onClick={logout}
                  className="flex items-center gap-2 w-full text-left px-2.5 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl cursor-pointer transition-colors mt-0.5"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>

          {/* Mobile menu trigger */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden text-slate-500 dark:text-slate-400 cursor-pointer focus:outline-none hover:text-[#003366] dark:hover:text-[#a7c8ff]"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </aside>

      {/* Mobile Menu Panel */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed top-[70px] left-0 w-full h-[calc(100vh-70px)] bg-white dark:bg-slate-900 border-t border-slate-200/60 dark:border-slate-800/80 z-40 p-4 flex flex-col gap-4 overflow-y-auto animate-in slide-in-from-top-5 duration-200">
          <nav className="flex flex-col gap-2">
            <NavLink to="/dashboard" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>
              Motors
            </NavLink>
            <NavLink to="/escs" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>
              ESCs
            </NavLink>
            <NavLink to="/propellers" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>
              Propellers
            </NavLink>
            <NavLink to="/analytics" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>
              Test Runs
            </NavLink>
            <NavLink to="/finder" onClick={() => setMobileMenuOpen(false)} className={navLinkClass}>
              Motor Finder
            </NavLink>
            <a 
              href="https://rotrix.reude.tech/RotriDASH/" 
              target="_blank" 
              rel="noopener noreferrer" 
              onClick={() => setMobileMenuOpen(false)} 
              className="px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer text-slate-600 dark:text-slate-300 hover:text-[#003366] dark:hover:text-[#a7c8ff] hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              RotriDash
            </a>
          </nav>
        </div>
      )}

      {/* Main View Area */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  );
};
