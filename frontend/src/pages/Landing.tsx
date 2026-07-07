import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  Search, ArrowRight, ChevronDown, ArrowDown,
  Zap, Cpu, Layers, Activity, BarChart3, Database,
  Shield, GitBranch, FlaskConical, Gauge
} from 'lucide-react';

/* ───────────────────────────── data ────────────────────────────── */

interface MotorRecommendation {
  name: string;
  company: string;
  thrust: string;
  prop: string;
  esc: string;
  kv: string;
  efficiency: string;
  class: string;
}

const motorRecommendations: Record<string, MotorRecommendation> = {
  '1000_6S':  { name: 'BH2806.5 KV1300', company: 'by BrotherHobby', thrust: '2,100 g', prop: '7x4.5 inch tri-blade',  esc: '45A Brushless',   kv: '1300 KV', efficiency: '8.2 g/W', class: 'Racing & Freestyle'    },
  '1000_12S': { name: 'MN5008 KV170',    company: 'by T-Motor',      thrust: '2,200 g', prop: 'CF18x6 folding',        esc: '40A Opto',        kv: '170 KV',  efficiency: '9.4 g/W', class: 'Cinematic & Long Range' },
  '3000_6S':  { name: 'KDE4215 KV465',   company: 'by KDE Direct',   thrust: '6,100 g', prop: 'CF15x5.2 folding',      esc: '60A Heavy Duty',  kv: '465 KV',  efficiency: '7.8 g/W', class: 'Commercial Surveying'  },
  '3000_12S': { name: 'U8 Lite KV150',   company: 'by T-Motor',      thrust: '6,300 g', prop: 'CF22x7.2 folding',      esc: '80A Flame',       kv: '150 KV',  efficiency: '9.1 g/W', class: 'Heavy Duty Curation'   },
  '6000_6S':  { name: 'MN8012 KV120',    company: 'by T-Motor',      thrust: '12,200 g', prop: 'CF28x9.2 folding',     esc: '100A Opto Pro',   kv: '120 KV',  efficiency: '7.2 g/W', class: 'Enterprise Logistics'  },
  '6000_12S': { name: 'KDE8205 KV110',   company: 'by KDE Direct',   thrust: '12,500 g', prop: 'CF30x10.5 folding',    esc: '120A Heavy Lift', kv: '110 KV',  efficiency: '8.6 g/W', class: 'Industrial Transport'  },
  '10000_6S': { name: 'U15 II KV100',    company: 'by T-Motor',      thrust: '20,100 g', prop: 'CF36x12.5 folding',    esc: '150A Flame Pro',  kv: '100 KV',  efficiency: '6.4 g/W', class: 'Tactical Load Carriage'},
  '10000_12S':{ name: 'U15 II KV80',     company: 'by T-Motor',      thrust: '20,400 g', prop: 'CF40x13.5 folding',    esc: '180A Industrial', kv: '80 KV',   efficiency: '7.9 g/W', class: 'Heavy Cargo Transit'   }
};

interface FAQItem { question: string; answer: string; }
const faqs: FAQItem[] = [
  { question: 'How do I obtain full access to ThrustVault?', answer: 'Access request forms can be submitted via the Request Access page. Access profiles undergo admin review, verifying email corporate credentials and requested role permissions. All active registrations are handled securely on our centralized database.' },
  { question: 'What database synchronization protocol is active?', answer: 'The platform operates on a primary PostgreSQL RDS configuration. To ensure fast, read-only demo execution without constant server overhead, an automated background synchronization process clones motor specifications to a local cache SQLite database every 30 seconds.' },
  { question: 'Does this console store flight logs and ITAR classified specifications?', answer: 'Under strict ITAR guidelines, flight logs containing restricted drone payload capabilities or flight paths must reside on classified local servers. ThrustVault serves as an unclassified specs repository for standard motor dimensions and thrust data; do not upload restricted flight logs.' },
  { question: 'What data formats are supported for powertrain ingestion?', answer: 'The platform supports CSV and Excel spreadsheets (such as Rotrix test telemetry logs). Standardized headers are mapped directly to corresponding PostgreSQL columns, and any auxiliary columns are safely stored under our structured extra_data JSONB field for future retrieval.' }
];

const platformCards = [
  { layout: '01', title: 'UAV Quadcopter',   desc: 'Standard 4-rotor systems optimized for high agility, structure inspections, and general mapping flights.',              stator: '5008 - 6012', kv: '150 - 340 KV', prop: 'CF 18" - 22"' },
  { layout: '02', title: 'UAV Hexacopter',   desc: '6-rotor configurations offering redundancy, payload stability, and mid-range courier operations.',                       stator: '8012 - 8205', kv: '100 - 150 KV', prop: 'CF 26" - 28"' },
  { layout: '03', title: 'UAV Octacopter',   desc: 'Heavy-lift 8-rotor platforms built to carry sensor pods, lidars, and tactical logistic cargo.',                           stator: 'U15 - KDE10218', kv: '80 - 100 KV',  prop: 'CF 30" - 40"' },
  { layout: '04', title: 'Coaxial Co-Quad',  desc: '8-motor stacked setup optimized for heavy agricultural sprayers, and extreme wind-resistance operations.',                stator: '6012 - 8012', kv: '120 - 180 KV', prop: 'CF 22" - 26"' },
];

const audienceTags = ['Drone Manufacturers', 'Research Laboratories', 'Defense Programs', 'University Research Teams', 'Flight Test Engineers', 'Propulsion Specialists'];

const knowledgeGraphNodes = ['Motor', 'ESC', 'Propeller', 'Battery', 'Test Run', 'Performance Outcome'];

/* ───────────────────────────── component ───────────────────────── */

export const Landing: React.FC = () => {
  const { session } = useAuth();
  const navigate = useNavigate();

  /* ── system theme sync ─────────────────────────────────── */
  useEffect(() => {
    const root = document.documentElement;
    if (!localStorage.getItem('thrustvault_theme')) {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', dark);
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
    }
  }, []);

  /* ── scroll‑reveal observer ────────────────────────────── */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
      }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.fade-in-up').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  /* ── navbar scroll shadow ──────────────────────────────── */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── WebGL shader canvas ───────────────────────────────── */
  const shaderRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = shaderRef.current;
    if (!canvas) return;

    const syncSize = () => {
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    syncSize();

    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (!gl) return;

    const vs = `attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }`;

    const isDark = () => document.documentElement.classList.contains('dark');

    const fs = `precision highp float;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform float u_dark;
      varying vec2 v_texCoord;
      void main() {
        vec2 uv = v_texCoord;
        vec2 grid = fract(uv * 40.0);
        float line = smoothstep(0.0, 0.02, grid.x) * smoothstep(1.0, 0.98, grid.x) +
                     smoothstep(0.0, 0.02, grid.y) * smoothstep(1.0, 0.98, grid.y);
        float bluePrint = step(0.998, fract(uv.x * 5.0)) + step(0.998, fract(uv.y * 5.0));
        float pulse = sin(uv.x * 10.0 + u_time * 0.5) * cos(uv.y * 10.0 + u_time * 0.3);
        vec3 lightBg = vec3(1.0);
        lightBg = mix(lightBg, vec3(0.95), line * 0.3);
        lightBg = mix(lightBg, vec3(0.9), bluePrint * 0.5);
        lightBg = mix(lightBg, vec3(0.97), clamp(pulse, 0.0, 1.0) * 0.2);
        vec3 darkBg = vec3(0.04, 0.04, 0.06);
        darkBg = mix(darkBg, vec3(0.08, 0.08, 0.12), line * 0.3);
        darkBg = mix(darkBg, vec3(0.06, 0.06, 0.09), bluePrint * 0.5);
        darkBg = mix(darkBg, vec3(0.05, 0.05, 0.08), clamp(pulse, 0.0, 1.0) * 0.2);
        vec3 color = mix(lightBg, darkBg, u_dark);
        gl_FragColor = vec4(color, 1.0);
      }`;

    const cs = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, cs(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, cs(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes  = gl.getUniformLocation(prog, 'u_resolution');
    const uDark = gl.getUniformLocation(prog, 'u_dark');

    let frameId = 0;
    const render = (t: number) => {
      syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes)  gl.uniform2f(uRes, canvas.width, canvas.height);
      if (uDark) gl.uniform1f(uDark, isDark() ? 1.0 : 0.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frameId = requestAnimationFrame(render);
    };
    render(0);

    return () => { cancelAnimationFrame(frameId); ro.disconnect(); };
  }, []);

  /* ── 2D constellation overlay (interactive nodes) ──────── */
  const overlayRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = (canvas.width = canvas.offsetWidth);
    let h = (canvas.height = canvas.offsetHeight);
    const ro = new ResizeObserver(() => { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; });
    ro.observe(canvas);

    const N = 20;
    type Node = { x: number; y: number; vx: number; vy: number; r: number; speed: number; };
    const nodes: Node[] = Array.from({ length: N }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 2 + 1, speed: 0.002 + Math.random() * 0.005,
    }));

    let mouse = { x: -9999, y: -9999 };
    const onMove = (e: MouseEvent) => { const r = canvas.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onLeave = () => { mouse = { x: -9999, y: -9999 }; };
    window.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    const dark = () => document.documentElement.classList.contains('dark');
    let fId = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const dk = dark();
      const nodeCol  = dk ? 'rgba(167,200,255,0.10)' : 'rgba(0,51,102,0.06)';
      const lineCol  = dk ? 'rgba(167,200,255,0.04)' : 'rgba(0,51,102,0.035)';
      const hoverCol = dk ? 'rgba(96,165,250,0.12)' : 'rgba(0,51,102,0.08)';

      nodes.forEach((n) => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = nodeCol; ctx.fill();
      });

      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < 150) {
          ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = lineCol; ctx.lineWidth = 0.6; ctx.stroke();
        }
      }

      if (mouse.x > 0 && mouse.y > 0) {
        nodes.forEach((n) => {
          const d = Math.sqrt((n.x - mouse.x) ** 2 + (n.y - mouse.y) ** 2);
          if (d < 200) {
            ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = hoverCol; ctx.lineWidth = 0.8; ctx.stroke();
          }
        });
      }

      fId = requestAnimationFrame(draw);
    };
    draw();

    return () => { cancelAnimationFrame(fId); window.removeEventListener('mousemove', onMove); canvas.removeEventListener('mouseleave', onLeave); ro.disconnect(); };
  }, []);

  /* ── search suggestions ────────────────────────────────── */
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSuggestions([]); setShowDropdown(false); return; }
    const t = setTimeout(() => {
      fetch(`/api/guest/motors/search?q=${encodeURIComponent(q)}&limit=6`)
        .then(r => r.json())
        .then(d => { setSuggestions(d || []); setShowDropdown(true); })
        .catch(() => {});
    }, 280);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const navigateMotor = useCallback((name: string) => {
    navigate(`/login?redirect=${encodeURIComponent('/motor/' + name)}`);
  }, [navigate]);

  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); activeIdx >= 0 && suggestions[activeIdx] ? navigateMotor(suggestions[activeIdx].motor_name || suggestions[activeIdx].name) : searchQuery.trim() && navigateMotor(searchQuery.trim()); }
    else if (e.key === 'Escape') setShowDropdown(false);
  };

  /* ── propulsion simulator state ────────────────────────── */
  const [payload, setPayload] = useState(1000);
  const [battery, setBattery] = useState<'6S' | '12S'>('6S');
  const [simAnim, setSimAnim] = useState(false);

  const currentRec = motorRecommendations[`${payload}_${battery}`];

  const changePayload = (v: number) => { setPayload(v); setSimAnim(true); setTimeout(() => setSimAnim(false), 200); };
  const changeBattery = (v: '6S' | '12S') => { setBattery(v); setSimAnim(true); setTimeout(() => setSimAnim(false), 200); };

  /* ── FAQ state ─────────────────────────────────────────── */
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  /* ── animated stat counters ────────────────────────────── */
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!statsRef.current) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStatsVisible(true); obs.disconnect(); } }, { threshold: 0.3 });
    obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  const AnimatedNumber: React.FC<{ end: number; suffix: string; visible: boolean }> = ({ end, suffix, visible }) => {
    const [val, setVal] = useState(0);
    useEffect(() => {
      if (!visible) return;
      let start = 0;
      const dur = 1600;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(eased * end));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, [visible, end]);
    return <>{val.toLocaleString()}{suffix}</>;
  };

  /* ────────────────────────────── JSX ──────────────────────────── */
  return (
    <div className="relative bg-white dark:bg-slate-950 text-on-surface dark:text-slate-200 overflow-x-hidden selection:bg-primary-container selection:text-white" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ═══════════════════ FIXED NAVBAR ═══════════════════════ */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 py-4 pointer-events-none">
        <nav className={`w-full max-w-7xl pointer-events-auto flex justify-between items-center px-6 md:px-8 py-3 rounded-full backdrop-blur-md border transition-all duration-300
          ${scrolled
            ? 'bg-white/90 dark:bg-slate-900/90 border-slate-300/80 dark:border-slate-700/80 shadow-md'
            : 'bg-white/75 dark:bg-slate-900/60 border-slate-200/50 dark:border-slate-700/40 shadow-sm'
          }`}>
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo_light.webp" alt="ThrustVault" className="h-8 w-auto dark:hidden" />
            <img src="/logo_dark.webp" alt="ThrustVault" className="h-8 w-auto hidden dark:block" />
          </Link>
          {/* Center Links */}
          <div className="hidden md:flex gap-10" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px' }}>
            <a className="text-secondary dark:text-slate-400 hover:text-primary-container dark:hover:text-blue-400 transition-colors font-medium" href="#features">Features</a>
            <Link className="text-secondary dark:text-slate-400 hover:text-primary-container dark:hover:text-blue-400 transition-colors font-medium" to="/versions">Version Catalog</Link>
            <Link className="text-secondary dark:text-slate-400 hover:text-primary-container dark:hover:text-blue-400 transition-colors font-medium" to="/request_access">Request Access</Link>
            <Link className="text-secondary dark:text-slate-400 hover:text-primary-container dark:hover:text-blue-400 transition-colors font-medium" to="/docs">Documentation</Link>
          </div>
          {/* CTA */}
          <div className="flex items-center gap-4">
            <Link to="/login" className="bg-primary-container hover:bg-primary text-white font-semibold text-[13px] px-5 py-2 rounded-full transition-colors" style={{ textDecoration: 'none' }}>Sign In</Link>
          </div>
        </nav>
      </div>

      {/* ═══════════════════ HERO SECTION ═══════════════════════ */}
      <section className="relative w-full min-h-screen flex items-center justify-center overflow-hidden">
        {/* WebGL Shader Background */}
        <div className="absolute inset-0 w-full h-full opacity-25 dark:opacity-40">
          <canvas ref={shaderRef} className="block w-full h-full" />
        </div>

        {/* Grid Lines Overlay */}
        <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.06] dark:opacity-[0.04]">
          <div className="w-full h-full" style={{ backgroundImage: 'linear-gradient(#003366 1px, transparent 1px), linear-gradient(90deg, #003366 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        </div>

        {/* Interactive node constellation overlay */}
        <div className="absolute inset-0 w-full h-full z-10 pointer-events-none mix-blend-multiply dark:mix-blend-screen opacity-55">
          <canvas ref={overlayRef} className="block w-full h-full pointer-events-auto" />
        </div>

        {/* Hero Content - Glass Panel, left-aligned */}
        <div className="relative z-20 max-w-5xl mx-auto px-6 md:px-12 w-full flex flex-col items-start pt-24 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm p-8 rounded-2xl border border-white/50 dark:border-slate-700/30 shadow-sm mt-16">
          {/* Mono label */}
          <div className="flex items-center gap-4 mb-4 fade-in-up" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            <span className="w-12 h-px bg-primary-container dark:bg-blue-400" />
            <span className="text-primary-container dark:text-blue-400">The centralized intelligence platform for drone propulsion systems.</span>
          </div>

          {/* Title */}
          <h1 className="text-[32px] md:text-[48px] font-bold tracking-tighter leading-tight mb-8 uppercase fade-in-up" style={{ transitionDelay: '0.1s' }}>
            <span className="bg-gradient-to-r from-primary to-primary-container dark:from-blue-300 dark:to-blue-500 bg-clip-text" style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              ENGINEERING KNOWLEDGE.<br />CAPTURED. VALIDATED. REUSABLE.
            </span>
          </h1>

          {/* Description */}
          <p className="text-base text-secondary dark:text-slate-400 max-w-2xl mb-8 font-medium fade-in-up leading-relaxed" style={{ transitionDelay: '0.2s' }}>
            Transform scattered motor specifications, ESC selections, propeller experiments, and test bench results into a structured engineering knowledge base that scales across teams, projects, and generations of aircraft.
          </p>

          {/* Action Buttons */}
          <div className="flex gap-4 mb-8 fade-in-up" style={{ transitionDelay: '0.3s' }}>
            <Link to="/login" className="bg-primary-container text-white font-semibold text-sm px-8 py-4 rounded hover:bg-primary transition-colors flex items-center gap-2 shadow-md" style={{ textDecoration: 'none' }}>
              Explore Platform <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/docs" className="border border-outline-variant dark:border-slate-600 bg-white/80 dark:bg-slate-800/80 text-primary dark:text-slate-200 font-semibold text-sm px-8 py-4 rounded hover:bg-white dark:hover:bg-slate-700 transition-colors shadow-sm" style={{ textDecoration: 'none' }}>
              View Documentation
            </Link>
          </div>

          {/* Hero Search Bar */}
          <div className="w-full fade-in-up" style={{ transitionDelay: '0.42s', maxWidth: '560px' }} ref={wrapperRef}>
            <label className="block mb-2 uppercase tracking-widest text-secondary dark:text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>Search Motors</label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if (searchQuery.trim().length >= 2) setShowDropdown(true); }}
                onKeyDown={handleSearchKey}
                placeholder="e.g. T-Motor F90, 2306, 2450KV…"
                autoComplete="off"
                spellCheck={false}
                className="w-full py-3.5 pl-5 pr-12 rounded-xl border-[1.5px] border-slate-300 dark:border-slate-600 bg-white/92 dark:bg-slate-800/90 backdrop-blur-xl text-sm text-on-surface dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all focus:border-primary-container dark:focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,51,102,0.12)]"
                style={{ fontFamily: "'Inter', sans-serif", boxShadow: '0 2px 12px rgba(0,30,64,0.08)' }}
              />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-outline dark:text-slate-500 pointer-events-none" />

              {/* Dropdown */}
              {showDropdown && (
                <div className="absolute top-full mt-2 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-[999] max-h-80 overflow-y-auto">
                  {suggestions.length === 0 ? (
                    <div className="py-6 text-center text-sm text-slate-400">No motors found for "<strong>{searchQuery}</strong>"</div>
                  ) : (
                    <>
                      {suggestions.map((m: any, i: number) => {
                        const motorName = m.motor_name || m.model_name || m.name || 'Unknown Motor';
                        const company = m.company || m.company_name || m.brand || '';
                        const kv = m.kv_rating || (m.custom_parameters?.kv_rating) || '';
                        const category = m.category_name || m.category || '';
                        const thrust = m.max_thrust || '';
                        return (
                          <button
                            key={i}
                            onClick={() => navigateMotor(motorName)}
                            className={`flex items-center gap-3 w-full px-4 py-2.5 text-left border-b border-slate-100 dark:border-slate-700/50 transition-colors hover:bg-blue-50/50 dark:hover:bg-slate-700/50 ${activeIdx === i ? 'bg-blue-50/50 dark:bg-slate-700/50' : ''}`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <Zap className="w-4 h-4 text-primary-container dark:text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-semibold text-on-surface dark:text-slate-200 truncate">{motorName}</div>
                              <div className="text-[11px] text-outline dark:text-slate-500">{[company, category, kv ? `${kv} KV` : ''].filter(Boolean).join(' · ')}</div>
                            </div>
                            {thrust && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", background: 'rgba(0,51,102,0.08)', color: '#003366' }}>
                                {thrust}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      <div className="px-4 py-2.5 flex justify-between items-center text-xs text-outline dark:text-slate-500" style={{ background: '#f8f9fa' }}>
                        <span>{suggestions.length} result{suggestions.length !== 1 ? 's' : ''} shown</span>
                        <button onClick={() => navigateMotor(searchQuery)} className="text-primary-container dark:text-blue-400 font-semibold hover:underline">See all results →</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-12 left-12 z-20 flex items-center gap-4 animate-pulse bg-white/50 dark:bg-slate-800/50 px-4 py-2 rounded-full backdrop-blur-md" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', letterSpacing: '0.05em' }}>
          <span className="w-px h-6 bg-outline dark:bg-slate-600 block" />
          <span className="text-outline dark:text-slate-500">SCROLL TO INITIALIZE</span>
        </div>
      </section>

      {/* ═══════════════════ TRUSTED BY ═════════════════════════ */}
      <section className="py-24 border-b border-outline-variant/20 dark:border-slate-800 bg-white dark:bg-slate-950 relative z-10">
        <div className="max-w-7xl mx-auto px-12 text-center fade-in-up" ref={statsRef}>
          <h2 className="uppercase tracking-widest mb-4 text-secondary dark:text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>Trusted by Engineering Teams</h2>
          <p className="text-base text-secondary dark:text-slate-400 max-w-2xl mx-auto mb-12">Thousands of propulsion records. Thousands of validation runs. One source of engineering truth.</p>

          {/* Animated Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {[
              { end: 2400, suffix: '+', label: 'Motor Records' },
              { end: 850, suffix: '+', label: 'Test Runs Logged' },
              { end: 140, suffix: '+', label: 'ESC Configurations' },
              { end: 99, suffix: '.9%', label: 'Platform Uptime' },
            ].map((s, i) => (
              <div key={i} className="text-center fade-in-up" style={{ transitionDelay: `${i * 0.1}s` }}>
                <div className="text-3xl md:text-4xl font-bold text-primary dark:text-slate-100 mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <AnimatedNumber end={s.end} suffix={s.suffix} visible={statsVisible} />
                </div>
                <div className="text-xs text-outline dark:text-slate-500 uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ PROBLEM / SOLUTION ═════════════════ */}
      <section className="py-32 px-12 max-w-7xl mx-auto relative bg-white dark:bg-slate-950 z-10">
        <div className="mb-16 text-center fade-in-up">
          <h2 className="text-2xl font-semibold text-primary dark:text-slate-100 mb-4" style={{ letterSpacing: '-0.01em' }}>Stop Repeating the Same Tests</h2>
          <p className="text-base text-secondary dark:text-slate-400 max-w-3xl mx-auto">Engineering teams spend countless hours searching spreadsheets, documents, and old reports to answer the same questions:</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {[
            '"Which motor performed best?"',
            '"Which ESC configuration was validated?"',
            '"Which propeller delivered the highest efficiency?"',
            '"Where are the previous test results?"',
          ].map((q, i) => (
            <div key={i} className="border border-slate-200 dark:border-slate-700/50 rounded-lg p-6 bg-surface-bright dark:bg-slate-900/50 fade-in-up" style={{ transitionDelay: `${(i + 1) * 0.1}s` }}>
              <p className="text-sm font-semibold text-primary dark:text-slate-200">{q}</p>
            </div>
          ))}
        </div>
        <div className="text-center fade-in-up" style={{ transitionDelay: '0.5s' }}>
          <p className="text-base text-primary-container dark:text-blue-400 font-semibold">ThrustVault turns disconnected engineering data into a searchable propulsion intelligence system.</p>
        </div>
      </section>

      {/* ═══════════════════ KNOWLEDGE GRAPH ════════════════════ */}
      <section className="py-32 bg-surface-bright dark:bg-slate-900/50 relative border-y border-outline-variant/20 dark:border-slate-800 overflow-hidden z-10">
        {/* Faint vertical lines */}
        <div className="absolute inset-0 opacity-50 dark:opacity-20" style={{ backgroundImage: 'linear-gradient(to right, #E2E8F0 1px, transparent 1px)', backgroundSize: '100px 100px' }} />
        <div className="max-w-7xl mx-auto px-12 relative z-10 text-center">
          <div className="mb-16 fade-in-up">
            <h2 className="text-2xl font-semibold text-primary dark:text-slate-100 mb-4" style={{ letterSpacing: '-0.01em' }}>Build a Propulsion Knowledge Graph</h2>
            <p className="uppercase tracking-widest text-secondary dark:text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>Every motor becomes connected.</p>
          </div>

          {/* Flow diagram */}
          <div className="flex flex-wrap justify-center items-center gap-4 mb-16 fade-in-up" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
            {knowledgeGraphNodes.map((label, i) => (
              <React.Fragment key={label}>
                {i > 0 && <ArrowRight className="w-4 h-4 text-outline dark:text-slate-600 hidden md:block" />}
                <div className={`border border-slate-200 dark:border-slate-700 px-6 py-3 rounded-full
                  ${i === knowledgeGraphNodes.length - 1
                    ? 'bg-primary-container text-white border-primary-container'
                    : 'bg-white dark:bg-slate-800 text-primary dark:text-slate-200'}`}
                >
                  {label}
                </div>
              </React.Fragment>
            ))}
          </div>

          <p className="text-base text-secondary dark:text-slate-400 max-w-3xl mx-auto fade-in-up">
            Instantly understand what was tested, what worked, and what should be used next. No more isolated spreadsheets. No more lost validation data.
          </p>

          {/* Visual: Data Flow Architecture Diagram */}
          <div className="mt-16 max-w-4xl mx-auto fade-in-up">
            <div className="border border-slate-200 dark:border-slate-700/50 rounded-xl bg-white dark:bg-slate-800/60 p-8 backdrop-blur-sm">
              <h4 className="uppercase tracking-widest text-secondary dark:text-slate-500 mb-8 text-center" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>Data Flow Architecture</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Ingestion */}
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-blue-50 dark:bg-slate-700 flex items-center justify-center">
                    <Database className="w-5 h-5 text-primary-container dark:text-blue-400" />
                  </div>
                  <div className="text-xs font-semibold text-primary dark:text-slate-200 mb-1">Ingestion Layer</div>
                  <div className="text-[11px] text-outline dark:text-slate-500 leading-relaxed">CSV uploads, Excel telemetry, manufacturer datasheets, custom JSONB fields</div>
                </div>
                {/* Processing */}
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-blue-50 dark:bg-slate-700 flex items-center justify-center">
                    <GitBranch className="w-5 h-5 text-primary-container dark:text-blue-400" />
                  </div>
                  <div className="text-xs font-semibold text-primary dark:text-slate-200 mb-1">Relational Mapping</div>
                  <div className="text-[11px] text-outline dark:text-slate-500 leading-relaxed">Motor-ESC-Propeller-Battery graph links, validated compatibility flags</div>
                </div>
                {/* Output */}
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-blue-50 dark:bg-slate-700 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-primary-container dark:text-blue-400" />
                  </div>
                  <div className="text-xs font-semibold text-primary dark:text-slate-200 mb-1">Analytics Output</div>
                  <div className="text-[11px] text-outline dark:text-slate-500 leading-relaxed">Thrust curves, efficiency maps, trend visualization, comparison reports</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ FEATURES GRID ══════════════════════ */}
      <section className="py-32 px-12 max-w-7xl mx-auto relative bg-white dark:bg-slate-950 z-10" id="features">
        <div className="mb-24 fade-in-up">
          <h2 className="text-2xl font-semibold text-primary dark:text-slate-100 max-w-2xl" style={{ letterSpacing: '-0.01em' }}>Engineering Intelligence at Scale</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { icon: Cpu, title: 'Motor Intelligence', desc: 'Maintain a living catalog of propulsion systems. Track specifications, dimensions, KV ratings, weight, thrust output, efficiency, power consumption, and manufacturer data.' },
            { icon: FlaskConical, title: 'Validation History', desc: 'Every test run becomes institutional knowledge. Store telemetry, environmental conditions, custom configurations, observations, and engineering notes.' },
            { icon: Layers, title: 'Compatibility Mapping', desc: 'Understand relationships between motors, ESCs, propellers, batteries, and aircraft platforms. Identify validated combinations with confidence.' },
            { icon: Gauge, title: 'Performance Analytics', desc: 'Visualize thrust curves, efficiency maps, RPM behavior, power consumption, thermal performance, and system trends.' },
          ].map((f, i) => (
            <div key={i} className="border border-slate-200 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-900/40 p-6 fade-in-up group hover:border-primary-container/30 dark:hover:border-blue-500/30 transition-colors" style={{ transitionDelay: `${i * 0.1}s` }}>
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-slate-700/60 flex items-center justify-center mb-4 group-hover:bg-primary-container/10 dark:group-hover:bg-blue-500/10 transition-colors">
                <f.icon className="w-5 h-5 text-primary-container dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-primary dark:text-slate-200 mb-2">{f.title}</h3>
              <p className="text-[13px] text-secondary dark:text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ PROPULSION SIMULATOR ═══════════════ */}
      <section className="py-32 px-12 max-w-7xl mx-auto relative bg-white dark:bg-slate-950 z-10" id="simulator">
        <div className="mb-16 text-center fade-in-up">
          <div className="uppercase tracking-widest text-secondary dark:text-slate-500 mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>Module 03</div>
          <h2 className="text-2xl font-semibold text-primary dark:text-slate-100 mb-4" style={{ letterSpacing: '-0.01em' }}>Propulsion Architecture Simulator</h2>
          <p className="text-base text-secondary dark:text-slate-400 max-w-3xl mx-auto">Select target UAV payload parameters and battery cell counts to dynamically simulate and recommend standard motor configurations.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Selector */}
          <div className="lg:col-span-7 border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/40 p-8 rounded-xl flex flex-col justify-between fade-in-up">
            <div>
              <h4 className="uppercase tracking-widest text-secondary dark:text-slate-500 mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>1. Select Target UAV Payload (per rotor)</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                {[
                  { val: 1000, label: '1.0 kg', sub: 'Racing & FPV' },
                  { val: 3000, label: '3.0 kg', sub: 'Surveying UAV' },
                  { val: 6000, label: '6.0 kg', sub: 'Logistics Hexa' },
                  { val: 10000, label: '10.0 kg', sub: 'Heavy Cargo' },
                ].map((p) => (
                  <button key={p.val} onClick={() => changePayload(p.val)}
                    className={`border px-4 py-3 rounded text-center text-xs font-semibold transition-all ${
                      payload === p.val
                        ? 'border-primary-container dark:border-blue-500 bg-slate-50/80 dark:bg-slate-700/50'
                        : 'border-slate-200 dark:border-slate-700 hover:border-primary-container dark:hover:border-blue-500'
                    }`}>
                    {p.label}
                    <span className="block text-[10px] text-outline dark:text-slate-500 font-normal mt-1">{p.sub}</span>
                  </button>
                ))}
              </div>

              <h4 className="uppercase tracking-widest text-secondary dark:text-slate-500 mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>2. Select Battery Voltage Class</h4>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { val: '6S' as const, label: '6S LiPo (22.2 V)', sub: 'Standard platforms' },
                  { val: '12S' as const, label: '12S LiPo (44.4 V)', sub: 'High-voltage heavy rigs' },
                ].map((b) => (
                  <button key={b.val} onClick={() => changeBattery(b.val)}
                    className={`border px-6 py-4 rounded text-center text-xs font-semibold transition-all ${
                      battery === b.val
                        ? 'border-primary-container dark:border-blue-500 bg-slate-50/80 dark:bg-slate-700/50'
                        : 'border-slate-200 dark:border-slate-700 hover:border-primary-container dark:hover:border-blue-500'
                    }`}>
                    {b.label}
                    <span className="block text-[10px] text-outline dark:text-slate-500 font-normal mt-1">{b.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#737780' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Dynamic prediction engine active. Recommendations mapped to physical test records.
            </div>
          </div>

          {/* Result Panel */}
          <div className={`lg:col-span-5 border-2 border-primary-container dark:border-blue-600 bg-slate-50/50 dark:bg-slate-800/60 p-8 rounded-xl flex flex-col justify-between fade-in-up transition-all duration-150 ${simAnim ? 'scale-[0.98] opacity-70' : 'scale-100 opacity-100'}`} style={{ transitionDelay: '0.1s' }}>
            <div>
              <div className="flex justify-between items-center mb-6">
                <span className="text-[10px] uppercase bg-primary-container text-white px-3 py-1 rounded" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{currentRec.class}</span>
                <span className="text-[10px] text-outline dark:text-slate-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>RECOMMENDED SYSTEM</span>
              </div>

              <h3 className="text-[32px] font-bold text-primary dark:text-slate-100 tracking-tight mb-1">{currentRec.name}</h3>
              <p className="text-xs text-secondary dark:text-slate-400 mb-8" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{currentRec.company}</p>

              <div className="space-y-4">
                {[
                  { label: 'Motor KV Class', value: currentRec.kv, accent: false },
                  { label: 'Peak Thrust Output', value: currentRec.thrust, accent: false },
                  { label: 'Recommended Propeller', value: currentRec.prop, accent: false },
                  { label: 'Recommended ESC', value: currentRec.esc, accent: false },
                  { label: 'Hover Efficiency Ratio', value: currentRec.efficiency, accent: true },
                ].map((row, i) => (
                  <div key={i} className={`flex justify-between items-center py-2 ${i < 4 ? 'border-b border-slate-200/50 dark:border-slate-700/40' : ''}`}>
                    <span className="text-xs text-secondary dark:text-slate-400">{row.label}</span>
                    <span className={`text-xs font-bold ${row.accent ? 'text-primary-container dark:text-blue-400' : 'text-primary dark:text-slate-200'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <Link to={`/login?redirect=${encodeURIComponent('/motor/' + currentRec.name)}`}
              className="bg-primary-container text-white font-semibold text-center py-3.5 rounded mt-8 hover:bg-primary transition-colors text-xs block" style={{ textDecoration: 'none' }}>
              Explore telemetry logs & curves
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════ UAV PLATFORMS ══════════════════════ */}
      <section className="py-32 px-12 max-w-7xl mx-auto relative bg-surface-bright dark:bg-slate-900/50 border-y border-outline-variant/20 dark:border-slate-800 z-10" id="platforms">
        <div className="mb-24 text-center fade-in-up">
          <div className="uppercase tracking-widest text-secondary dark:text-slate-500 mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>Module 05</div>
          <h2 className="text-2xl font-semibold text-primary dark:text-slate-100 max-w-2xl mx-auto" style={{ letterSpacing: '-0.01em' }}>Validated UAV Platform Configurations</h2>
          <p className="text-base text-secondary dark:text-slate-400 max-w-2xl mx-auto mt-4">A grid mapping standard aerospace layouts to verified powertrain configuration specifications.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {platformCards.map((card, i) => (
            <div key={i} className="border border-slate-200 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-800/60 p-6 flex flex-col justify-between fade-in-up group hover:border-primary-container/30 dark:hover:border-blue-500/30 transition-colors" style={{ transitionDelay: `${i * 0.1}s` }}>
              <div>
                <div className="text-[10px] text-secondary dark:text-slate-500 uppercase mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Layout {card.layout}</div>
                <h3 className="text-sm font-semibold text-primary dark:text-slate-200 mb-2">{card.title}</h3>
                <p className="text-[13px] text-secondary dark:text-slate-400 mb-6 leading-relaxed">{card.desc}</p>
              </div>
              <div className="space-y-2 pt-4 border-t border-slate-100 dark:border-slate-800" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>
                <div className="text-primary dark:text-slate-200"><span className="text-outline dark:text-slate-500">Stator Class:</span> {card.stator}</div>
                <div className="text-primary dark:text-slate-200"><span className="text-outline dark:text-slate-500">KV Class:</span> {card.kv}</div>
                <div className="text-primary dark:text-slate-200"><span className="text-outline dark:text-slate-500">Prop Range:</span> {card.prop}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ DARK BLUE BANNER ══════════════════ */}
      <section className="py-32 bg-primary-container text-white text-center relative z-10">
        <div className="max-w-7xl mx-auto px-12 fade-in-up">
          <p className="text-2xl font-semibold mb-8 max-w-4xl mx-auto leading-relaxed" style={{ letterSpacing: '-0.01em' }}>
            A propulsion test is valuable. A thousand propulsion tests become intelligence. ThrustVault transforms raw engineering data into actionable decisions.
          </p>
          <div className="flex flex-wrap justify-center gap-6 uppercase tracking-widest mt-12 text-blue-200/70" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
            <span>Reduce duplicated testing.</span>
            <span className="hidden md:inline">•</span>
            <span>Accelerate aircraft development.</span>
            <span className="hidden md:inline">•</span>
            <span>Improve propulsion efficiency.</span>
            <span className="hidden md:inline">•</span>
            <span>Preserve engineering knowledge.</span>
          </div>
        </div>
      </section>

      {/* ═══════════════════ TARGET AUDIENCE ════════════════════ */}
      <section className="py-24 bg-surface-bright dark:bg-slate-900/50 border-b border-outline-variant/20 dark:border-slate-800 relative z-10">
        <div className="max-w-7xl mx-auto px-12 text-center fade-in-up">
          <h2 className="uppercase tracking-widest text-secondary dark:text-slate-500 mb-8" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>Designed for Modern Aerospace Teams</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {audienceTags.map((tag, i) => (
              <span key={i} className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 rounded text-sm text-primary dark:text-slate-200">{tag}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ FAQ ACCORDION ══════════════════════ */}
      <section className="py-32 px-12 max-w-7xl mx-auto relative bg-white dark:bg-slate-950 z-10" id="faq">
        <div className="mb-24 text-center fade-in-up">
          <div className="uppercase tracking-widest text-secondary dark:text-slate-500 mb-4" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>Module 04</div>
          <h2 className="text-2xl font-semibold text-primary dark:text-slate-100 mb-4" style={{ letterSpacing: '-0.01em' }}>Aerospace Platform FAQs</h2>
          <p className="text-base text-secondary dark:text-slate-400 max-w-2xl mx-auto">Common questions regarding security authorization, synchronizations, data compliance, and file formats.</p>
        </div>

        <div className="max-w-3xl mx-auto space-y-4 fade-in-up">
          {faqs.map((faq, i) => (
            <div key={i} className="border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-900/40 rounded-lg overflow-hidden transition-all duration-300">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left px-6 py-5 flex justify-between items-center hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <span className="text-[15px] text-primary dark:text-slate-200 font-semibold">{faq.question}</span>
                <ChevronDown className={`w-5 h-5 text-outline dark:text-slate-500 transition-transform duration-300 flex-shrink-0 ml-4 ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="px-6 pb-6 text-sm text-secondary dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-4">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ PRE-FOOTER VALUE PROP ══════════════ */}
      <section className="py-32 px-12 max-w-7xl mx-auto text-center fade-in-up relative z-10 bg-white dark:bg-slate-950">
        <h2 className="text-2xl font-semibold text-primary dark:text-slate-100 mb-4" style={{ letterSpacing: '-0.01em' }}>Engineering Data Deserves Better Than Spreadsheets</h2>
        <p className="text-base text-secondary dark:text-slate-400 max-w-3xl mx-auto">
          Your propulsion systems generate knowledge every day. Capture it. Organize it. Validate it. Reuse it. Build a permanent engineering memory for every propulsion system your organization develops.
        </p>
      </section>

      {/* ═══════════════════ FINAL CTA ══════════════════════════ */}
      <section className="py-24 px-12 bg-surface-container-low dark:bg-slate-900/30 border-t border-outline-variant/20 dark:border-slate-800 text-center relative z-10">
        <div className="max-w-7xl mx-auto fade-in-up">
          <h2 className="text-[32px] md:text-[48px] font-bold text-primary dark:text-slate-100 tracking-tighter mb-4">The Operating System for Drone Propulsion Intelligence.</h2>
          <p className="text-base text-secondary dark:text-slate-400 mb-8">Start building your propulsion knowledge base today.</p>
          <Link to="/login" className="bg-primary-container text-white font-semibold text-sm px-10 py-5 rounded hover:bg-primary transition-colors inline-flex items-center gap-2 shadow-md" style={{ textDecoration: 'none' }}>
            Get Started
            <Zap className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ═══════════════════ FOOTER ═════════════════════════════ */}
      <footer className="w-full py-8 px-12 flex flex-col md:flex-row justify-between items-center bg-white dark:bg-slate-950 border-t border-outline-variant/10 dark:border-slate-800 relative z-10 gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="font-bold text-secondary dark:text-slate-300" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>ThrustVault</span>
          <span className="text-[10px] uppercase tracking-widest text-outline dark:text-slate-600" style={{ fontFamily: "'JetBrains Mono', monospace" }}>© 2026 ThrustVault Propulsion Intelligence. Proprietary Aerospace Data.</span>
        </div>
        <div className="flex gap-4 flex-wrap justify-end text-[10px] uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <Link className="text-outline dark:text-slate-500 hover:text-primary dark:hover:text-slate-300 transition-colors" to="/login">Sign In</Link>
          <Link className="text-outline dark:text-slate-500 hover:text-primary dark:hover:text-slate-300 transition-colors" to="/request_access">Request Access</Link>
          <Link className="text-outline dark:text-slate-500 hover:text-primary dark:hover:text-slate-300 transition-colors" to="/versions">Website Version</Link>
          <Link className="text-outline dark:text-slate-500 hover:text-primary dark:hover:text-slate-300 transition-colors" to="/docs">Documentation</Link>
          <Link className="text-outline dark:text-slate-500 hover:text-primary dark:hover:text-slate-300 transition-colors" to="/docs#security">ITAR Compliance</Link>
          <span className="text-outline dark:text-slate-600">Version 2.0.0</span>
        </div>
      </footer>

      {/* ═══════════════════ GLOBAL STYLES ══════════════════════ */}
      <style>{`
        .fade-in-up {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.8s ease-out, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .fade-in-up.visible {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
};
