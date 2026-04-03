/**
 * SearchLens v2.3 — Single File App (App.tsx)
 * Features: Auth/Login · Hybrid Search · Resume Analyzer · Anomaly Detection (Real PC) · IoT Fleet (Real PC)
 */

import React, { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { useNavigate, BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// =============================================
// TYPES
// =============================================
interface User { id: string; email: string; name: string; }
interface AuthCtx { user: User | null; token: string | null; login: (email: string, pw: string) => Promise<void>; register: (email: string, name: string, pw: string) => Promise<void>; logout: () => void; }
interface SearchResult { id: number; text: string; lexicalScore: number; semanticScore: number; hybridScore: number; entityScore: number; entities: Record<string, string[]>; winner: 'lexical' | 'semantic' | 'tie'; }
interface ServerStatus { status: string; geminiEnabled: boolean; features: Record<string, boolean>; }
interface SectionScore { lexical: number; semantic: number; hybrid: number; wordCount: number; text: string; }
interface ATSData { atsScore: number; lexicalScore: number; semanticScore: number; hybridScore: number; keywordScore: number; matchedKeywords: string[]; missingKeywords: string[]; totalJDKeywords: number; totalMatched: number; }
interface AnomalyPoint { index: number; value: number; zScore: number; isAnomaly: boolean; severity: 'normal' | 'warning' | 'critical'; mean: number; stdDev: number; deviation: number; }
interface MetricResult { values: number[]; anomalies: AnomalyPoint[]; stats: { mean: number; max: number; min: number; anomalyCount: number; criticalCount: number; anomalyRate: number; }; }
interface DeviceTelemetry { cpu: number; memory: number; temperature: number; network: number; latency: number; status: 'online' | 'degraded' | 'offline'; timestamp: string; alerts: string[]; isRealData?: boolean; processes?: number; loadAvg?: string; uptime?: number; }
interface Device { id: string; name: string; type: string; location: string; telemetry: DeviceTelemetry; isRealDevice?: boolean; }
interface PCMetrics { cpu: { usage: number; user: number; system: number; cores: { core: number; load: number }[] }; memory: { total: number; used: number; free: number; usagePercent: number; swapTotal: number; swapUsed: number; swapPercent: number }; disk: { fs: string; type: string; mount: string; size: number; used: number; available: number; usePercent: number }[]; network: { iface: string; rxBytes: number; txBytes: number; rxSec: number; txSec: number }[]; temperature: { main: number | null; cores: number[]; max: number | null }; processes: { all: number; running: number; blocked: number; sleeping: number }; system: { hostname: string; platform: string; arch: string; uptime: number; loadAvg: number[]; nodeVersion: string }; timestamp: string; }

// =============================================
// AUTH CONTEXT
// =============================================
const AuthContext = createContext<AuthCtx>({ user: null, token: null, login: async () => {}, register: async () => {}, logout: () => {} });
function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try { const u = localStorage.getItem('sl_user'); return u ? JSON.parse(u) : null; } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sl_token'));

  const saveAuth = (t: string, u: User) => {
    setToken(t); setUser(u);
    localStorage.setItem('sl_token', t);
    localStorage.setItem('sl_user', JSON.stringify(u));
  };

  const login = async (email: string, password: string) => {
    const res = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    saveAuth(data.token, data.user);
  };

  const register = async (email: string, name: string, password: string) => {
    const res = await fetch(`${BASE}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name, password }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    saveAuth(data.token, data.user);
  };

  const logout = () => {
    setUser(null); setToken(null);
    localStorage.removeItem('sl_token'); localStorage.removeItem('sl_user');
  };

  return <AuthContext.Provider value={{ user, token, login, register, logout }}>{children}</AuthContext.Provider>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

// =============================================
// GLOBAL STYLES
// =============================================
const GLOBAL_STYLES = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #06080d; --bg2: #0a0e16; --bg3: #0f1520;
  --border: #1a2535; --border2: #243450;
  --fg: #c8d8e8; --fg2: #7a9ab8; --fg3: #4a6a88;
  --cyan: #00f5d4; --cyan2: #00c4aa;
  --amber: #ffb347; --amber2: #e89420;
  --magenta: #ff6ec7; --green: #39ff6b; --red: #ff4560;
  --blue: #4d9fff; --purple: #b06dff;
  --gold: #ffd700; --silver: #a8b8c8; --bronze: #cd7f32;
  --font-display: 'Outfit', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --radius: 6px;
}
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--fg); font-family: var(--font-mono); font-size: 13px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: var(--bg2); } ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }
::selection { background: rgba(0,245,212,0.2); color: var(--cyan); }
input, textarea, select { font-family: var(--font-mono); font-size: 12px; background: var(--bg2); border: 1px solid var(--border); color: var(--fg); border-radius: var(--radius); outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
input:focus, textarea:focus, select:focus { border-color: var(--cyan2); box-shadow: 0 0 0 3px rgba(0,245,212,0.07); }
button { font-family: var(--font-mono); cursor: pointer; border: none; outline: none; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
a { color: var(--cyan); text-decoration: none; }
.card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); }
.tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 3px; font-size: 10px; font-weight: 700; font-family: var(--font-mono); letter-spacing: 0.06em; text-transform: uppercase; }
.tag-cyan { background: rgba(0,245,212,0.1); color: var(--cyan); border: 1px solid rgba(0,245,212,0.2); }
.tag-amber { background: rgba(255,179,71,0.1); color: var(--amber); border: 1px solid rgba(255,179,71,0.2); }
.tag-magenta { background: rgba(255,110,199,0.1); color: var(--magenta); border: 1px solid rgba(255,110,199,0.2); }
.tag-green { background: rgba(57,255,107,0.1); color: var(--green); border: 1px solid rgba(57,255,107,0.2); }
.tag-red { background: rgba(255,69,96,0.1); color: var(--red); border: 1px solid rgba(255,69,96,0.2); }
.tag-gray { background: rgba(120,150,180,0.08); color: var(--fg2); border: 1px solid rgba(120,150,180,0.15); }
.tag-blue { background: rgba(77,159,255,0.1); color: var(--blue); border: 1px solid rgba(77,159,255,0.2); }
.tag-purple { background: rgba(176,109,255,0.1); color: var(--purple); border: 1px solid rgba(176,109,255,0.2); }
.grid-bg { background-image: linear-gradient(rgba(26,37,53,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(26,37,53,0.5) 1px, transparent 1px); background-size: 44px 44px; }
@keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes fillBar { from { width:0; } to { width:var(--w); } }
@keyframes spin { to { transform:rotate(360deg); } }
@keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
@keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
@keyframes slideIn { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
@keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
.animate-fade-up { animation: fadeInUp 0.5s cubic-bezier(0.25,0.46,0.45,0.94) forwards; opacity:0; }
.animate-float { animation: float 3s ease-in-out infinite; }
`;

// =============================================
// API CLIENT
// =============================================
const BASE = 'http://3.111.94.205:3001/api';

function getToken() { return localStorage.getItem('sl_token'); }

async function post(path: string, body: Record<string, unknown>) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Network error' })); throw new Error((err as any).error || `HTTP ${res.status}`); }
  return res.json();
}
async function postForm(path: string, formData: FormData) {
  const token = getToken();
  const res = await fetch(BASE + path, { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: formData });
  if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Network error' })); throw new Error((err as any).error || `HTTP ${res.status}`); }
  return res.json();
}
async function get(path: string) {
  const token = getToken();
  const res = await fetch(BASE + path, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const api = {
  health: () => fetch(`${BASE}/health`).then(r => r.json()),
  login: (email: string, password: string) => post('/auth/login', { email, password }),
  register: (email: string, name: string, password: string) => post('/auth/register', { email, name, password }),
  pcMetrics: () => get('/pc/metrics'),
  pcHistory: () => get('/anomaly/pc-history'),
  analyze: (query: string, documents: string[], alpha: number) => post('/analyze', { query, documents, alpha }),
  entities: (text: string) => post('/entities', { text }),
  expand: (query: string) => post('/expand', { query }),
  resumeExtract: (file: File) => { const fd = new FormData(); fd.append('resume', file); return postForm('/resume/extract', fd); },
  resumeAnalyze: (file: File | null, resumeText: string, sections: Record<string, string>, jobDescription: string) => {
    const fd = new FormData();
    if (file) fd.append('resume', file);
    fd.append('resumeText', resumeText); fd.append('sections', JSON.stringify(sections)); fd.append('jobDescription', jobDescription);
    return postForm('/resume/analyze', fd);
  },
  resumeAISuggestions: (sectionName: string, sectionText: string, jobDescription: string, sectionScores: Record<string, SectionScore>) => post('/resume/ai-suggestions', { sectionName, sectionText, jobDescription, sectionScores }),
  resumeGenerateImproved: (sectionName: string, sectionText: string, jobDescription: string, keywordGaps: string[]) => post('/resume/generate-improved', { sectionName, sectionText, jobDescription, keywordGaps }),
  resumeATSReport: (resumeText: string, jobDescription: string, atsData: ATSData) => post('/resume/ats-report', { resumeText, jobDescription, atsData }),
  aiSuggestCorrections: (text: string, corpusDocuments: string[], lexicalScore: number, semanticScore: number) => post('/ai/suggest-corrections', { text, corpusDocuments, lexicalScore, semanticScore }),
  aiAnalyzeQuery: (query: string, corpusDocuments: string[]) => post('/ai/analyze-query', { query, corpusDocuments }),
  anomalyAnalyze: (metricsData: Record<string, number[]>, threshold?: number, useRealPC?: boolean) => post('/anomaly/analyze', { metricsData, threshold, useRealPC }),
  anomalyAIReport: (analysisResults: Record<string, MetricResult>, metricName: string) => post('/anomaly/ai-report', { analysisResults, metricName }),
  iotDevices: () => get('/iot/devices'),
  iotTelemetry: () => get('/iot/telemetry'),
  iotCommand: (deviceId: string, command: string) => post('/iot/command', { deviceId, command }),
};

const SAMPLE_CORPUS = [
  "Deep learning models are transforming natural language processing tasks across industries.",
  "The hospital implemented a new machine learning system for early disease detection in patients.",
  "Semantic search improves retrieval by understanding meaning and context behind user queries.",
  "BM25 is a popular lexical ranking function widely used in information retrieval systems.",
  "Hybrid search combines keyword-based and vector-based retrieval for superior search results.",
  "Cloud computing enables scalable infrastructure with IoT device management at the edge.",
  "Anomaly detection algorithms identify outliers in time-series data for infrastructure monitoring.",
  "Large language models demonstrate emergent reasoning capabilities on complex multi-step problems.",
  "Query expansion techniques improve recall by automatically adding synonyms and related terms.",
  "Named entity recognition extracts structured information like persons, organizations from text.",
];

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(secs: number) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// =============================================
// SHARED UI COMPONENTS
// =============================================
function Spinner({ size = 14, color = 'var(--cyan)' }: { size?: number; color?: string }) {
  return <span style={{ width: size, height: size, border: `2px solid rgba(0,0,0,0.2)`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />;
}

function ScoreRow({ label, score, color, bold = false, delay = 0 }: { label: string; score: number; color: string; bold?: boolean; delay?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, color: bold ? 'var(--fg)' : 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 52, fontWeight: bold ? 700 : 400 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: color, animation: `fillBar 0.9s cubic-bezier(0.25,0.46,0.45,0.94) ${delay}ms forwards`, width: 0, '--w': `${Math.max(2, score * 100)}%` } as React.CSSProperties} />
      </div>
      <span style={{ fontSize: 11, minWidth: 32, textAlign: 'right', color, fontWeight: bold ? 700 : 400 }}>{(score * 100).toFixed(0)}%</span>
    </div>
  );
}

function StatusBar({ status }: { status: ServerStatus | null }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  if (!status) return <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fg3)' }} /><span style={{ color: 'var(--fg3)' }}>Connecting…</span></div>;
  const online = status.status === 'ok';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: online ? 'var(--green)' : 'var(--red)', boxShadow: online ? '0 0 6px rgba(57,255,107,0.5)' : undefined }} />
        <span style={{ color: 'var(--fg2)' }}>{online ? 'Online' : 'Offline'}</span>
        {online && <><span style={{ color: 'var(--border2)' }}>·</span><span style={{ color: status.geminiEnabled ? 'var(--amber)' : 'var(--fg3)' }}>{status.geminiEnabled ? '🤖 AI' : 'No AI'}</span></>}
        {online && status.features?.realPCMetrics && <><span style={{ color: 'var(--border2)' }}>·</span><span style={{ color: 'var(--cyan)' }}>💻 Real PC</span></>}
      </div>
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--border2)' }}>|</span>
          <span style={{ color: 'var(--fg2)' }}>👤 {user.name}</span>
          <button onClick={() => { logout(); nav('/login'); }} style={{ padding: '3px 8px', background: 'rgba(255,69,96,0.08)', border: '1px solid rgba(255,69,96,0.2)', color: 'var(--red)', fontSize: 10, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>Logout</button>
        </div>
      )}
    </div>
  );
}

function Sparkline({ data, anomalies, color = '#00f5d4', height = 40, width = 200 }: { data: number[]; anomalies?: AnomalyPoint[]; color?: string; height?: number; width?: number }) {
  if (!data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {anomalies?.filter(a => a.isAnomaly).map(a => {
        const x = (a.index / Math.max(data.length - 1, 1)) * width;
        const y = height - ((a.value - min) / range) * (height - 4) - 2;
        return <circle key={a.index} cx={x} cy={y} r={4} fill={a.severity === 'critical' ? 'var(--red)' : 'var(--amber)'} stroke="var(--bg2)" strokeWidth={1.5} />;
      })}
    </svg>
  );
}

function Gauge({ value, label, color, size = 80 }: { value: number; label: string; color: string; size?: number }) {
  const r = size * 0.4, c = 2 * Math.PI * r, offset = c - (Math.min(value, 100) / 100) * c;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg3)" strokeWidth={size*0.075} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.075} strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: 'stroke-dashoffset 1s ease' }} />
        <text x={size/2} y={size/2+4} textAnchor="middle" fill={color} fontSize={size*0.18} fontWeight="700" fontFamily="var(--font-mono)">{Math.round(value)}</text>
      </svg>
      <span style={{ fontSize: 9, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
    </div>
  );
}

// =============================================
// LOGIN / REGISTER PAGE
// =============================================
function LoginPage() {
  const { login, register, user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => { if (user) nav('/'); }, [user, nav]);

  const handleSubmit = async () => {
    setError(null);
    if (!email || !password) { setError('Email and password required'); return; }
    if (mode === 'register') {
      if (!name.trim()) { setError('Name required'); return; }
      if (password !== confirmPw) { setError('Passwords do not match'); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    }
    setLoading(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, name, password);
      nav('/');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const fillDemo = () => { setEmail('demo@searchlens.ai'); setPassword('demo123'); setError(null); };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {/* Animated background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <div className="grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.4 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 20%, rgba(0,245,212,0.06) 0%, transparent 50%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 70% 80%, rgba(77,159,255,0.06) 0%, transparent 50%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(176,109,255,0.04) 0%, transparent 60%)' }} />
        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ position: 'absolute', width: 2, height: 2, borderRadius: '50%', background: i % 3 === 0 ? 'var(--cyan)' : i % 3 === 1 ? 'var(--blue)' : 'var(--purple)', left: `${15 + i * 14}%`, top: `${20 + (i % 3) * 20}%`, opacity: 0.4, animation: `float ${3 + i * 0.5}s ease-in-out ${i * 0.3}s infinite` }} />
        ))}
      </div>

      {/* Logo + tagline top */}
      <div style={{ position: 'absolute', top: 24, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="12" cy="12" r="8" stroke="#00f5d4" strokeWidth="2"/>
            <circle cx="12" cy="12" r="3" fill="rgba(0,245,212,0.25)"/>
            <line x1="18" y1="18" x2="25" y2="25" stroke="#00f5d4" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>SearchLens</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span className="tag tag-cyan" style={{ fontSize: 9 }}>Hybrid Search</span>
          <span className="tag tag-magenta" style={{ fontSize: 9 }}>Resume ATS</span>
          <span className="tag tag-blue" style={{ fontSize: 9 }}>ML Anomaly</span>
          <span className="tag tag-green" style={{ fontSize: 9 }}>IoT Fleet</span>
        </div>
      </div>

      {/* Auth Card */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 420, margin: '0 16px', animation: 'fadeInUp 0.5s ease' }}>
        <div className="card" style={{ padding: 36, borderColor: 'rgba(0,245,212,0.15)' }}>
          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 28, background: 'var(--bg3)', borderRadius: 8, padding: 3 }}>
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(null); }}
                style={{ flex: 1, padding: '8px', background: mode === m ? 'var(--bg2)' : 'transparent', color: mode === m ? 'var(--fg)' : 'var(--fg3)', fontFamily: 'var(--font-mono)', fontWeight: mode === m ? 700 : 400, fontSize: 12, borderRadius: 6, border: mode === m ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'all 0.2s', textTransform: 'capitalize' }}>
                {m === 'login' ? '→ Sign In' : '✦ Register'}
              </button>
            ))}
          </div>

          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, marginBottom: 6, letterSpacing: '-0.02em' }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--fg3)', marginBottom: 24, lineHeight: 1.6 }}>
            {mode === 'login' ? 'Sign in to access AI-powered search, resume analysis, anomaly detection and real-time IoT fleet monitoring.' : 'Join SearchLens to start analyzing documents, monitoring systems, and simulating IoT fleets.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'register' && (
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 6 }}>Full Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 'var(--radius)' }} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 6 }}>Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 'var(--radius)' }} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'register' ? 'Min 6 characters' : 'Your password'} style={{ width: '100%', padding: '10px 40px 10px 12px', fontSize: 13, borderRadius: 'var(--radius)' }} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                <button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--fg3)', fontSize: 13, cursor: 'pointer', padding: '2px 4px' }}>{showPw ? '🙈' : '👁'}</button>
              </div>
            </div>
            {mode === 'register' && (
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 6 }}>Confirm Password</label>
                <input type={showPw ? 'text' : 'password'} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat password" style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 'var(--radius)' }} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
              </div>
            )}

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,69,96,0.08)', border: '1px solid rgba(255,69,96,0.2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
                ⚠ {error}
              </div>
            )}

            <button onClick={handleSubmit} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px', background: 'var(--cyan)', color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 14, borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', marginTop: 4, letterSpacing: '0.02em' }}>
              {loading ? <><Spinner color="#000" size={16} /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</> : <>{mode === 'login' ? '→ Sign In' : '✦ Create Account'}</>}
            </button>
          </div>

          {mode === 'login' && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(77,159,255,0.06)', border: '1px solid rgba(77,159,255,0.15)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 11, color: 'var(--fg3)', marginBottom: 8 }}>🔑 Demo credentials pre-loaded:</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  <span style={{ color: 'var(--blue)' }}>demo@searchlens.ai</span> / <span style={{ color: 'var(--fg2)' }}>demo123</span>
                </div>
                <button onClick={fillDemo} style={{ padding: '4px 10px', background: 'var(--blue)', color: '#000', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, borderRadius: 4, border: 'none', cursor: 'pointer' }}>Fill</button>
              </div>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--fg3)', marginTop: 16 }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }} style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--font-mono)' }}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}

// =============================================
// PC METRICS MINI WIDGET (shown in anomaly / IoT)
// =============================================
function PCMetricsMini({ metrics }: { metrics: PCMetrics | null }) {
  if (!metrics) return <div style={{ fontSize: 11, color: 'var(--fg3)' }}>Loading PC metrics…</div>;
  const m = metrics;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {[
        { label: 'CPU', value: m.cpu.usage, unit: '%', color: m.cpu.usage > 80 ? 'var(--red)' : m.cpu.usage > 60 ? 'var(--amber)' : 'var(--cyan)' },
        { label: 'Memory', value: m.memory.usagePercent, unit: '%', color: m.memory.usagePercent > 85 ? 'var(--red)' : m.memory.usagePercent > 70 ? 'var(--amber)' : 'var(--green)' },
        { label: 'Cores', value: m.cpu.cores.length, unit: '', color: 'var(--blue)' },
        { label: 'Load', value: parseFloat(m.system.loadAvg[0].toFixed(2)), unit: '', color: 'var(--purple)' },
      ].map(s => (
        <div key={s.label} style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: 'var(--font-display)' }}>{s.value}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--fg3)' }}>{s.unit}</span></div>
          <div style={{ fontSize: 9, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// =============================================
// ANOMALY DETECTION PAGE — real PC metrics
// =============================================
const DEFAULT_METRICS: Record<string, string> = {
  CPU: '45, 47, 44, 92, 46, 48, 43, 88, 45, 47, 44, 46, 49, 42, 95, 45, 48, 44, 46, 43',
  Memory: '62, 64, 63, 65, 61, 63, 62, 94, 64, 63, 62, 65, 63, 61, 64, 62, 97, 63, 64, 62',
  Latency: '12, 13, 11, 85, 12, 14, 11, 13, 12, 70, 11, 13, 12, 14, 11, 12, 13, 90, 12, 11',
  ErrorRate: '0.5, 0.4, 0.6, 8.2, 0.5, 0.4, 0.6, 0.5, 7.8, 0.4, 0.5, 0.6, 0.4, 0.5, 9.1, 0.5, 0.4, 0.6, 0.5, 0.4',
};

function AnomalyPage({ serverStatus }: { serverStatus: ServerStatus | null }) {
  const nav = useNavigate();
  const [metricInputs, setMetricInputs] = useState(DEFAULT_METRICS);
  const [threshold, setThreshold] = useState(2.5);
  const [results, setResults] = useState<Record<string, MetricResult> | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState<string>('CPU');
  const [aiReport, setAiReport] = useState<Record<string, any>>({});
  const [loadingAI, setLoadingAI] = useState<Set<string>>(new Set());
  const [useRealPC, setUseRealPC] = useState(true);
  const [pcMetrics, setPcMetrics] = useState<PCMetrics | null>(null);
  const [pcHistory, setPcHistory] = useState<Record<string, number[]>>({});
  const [pcSamples, setPcSamples] = useState(0);
  const [loadingPC, setLoadingPC] = useState(false);

  useEffect(() => {
    const fetchPC = async () => {
      try {
        const m = await api.pcMetrics();
        setPcMetrics(m);
        const h = await api.pcHistory();
        setPcHistory(h.history);
        setPcSamples(h.samples);
      } catch {}
    };
    fetchPC();
    const interval = setInterval(fetchPC, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAnalyze = async () => {
    setLoading(true); setError(null);
    try {
      const metricsData: Record<string, number[]> = {};
      if (!useRealPC) {
        for (const [key, val] of Object.entries(metricInputs)) {
          const nums = val.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
          if (nums.length > 0) metricsData[key] = nums;
        }
      }
      const data = await api.anomalyAnalyze(metricsData, threshold, useRealPC);
      setResults(data.results); setSummary(data.summary);
      setActiveMetric(Object.keys(data.results)[0]);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleAIReport = async (metric: string) => {
    if (!serverStatus?.geminiEnabled || !results) return;
    setLoadingAI(prev => new Set([...prev, metric]));
    try {
      const report = await api.anomalyAIReport(results, metric);
      setAiReport(prev => ({ ...prev, [metric]: report }));
    } catch (e: any) { setAiReport(prev => ({ ...prev, [metric]: { error: e.message } })); }
    finally { setLoadingAI(prev => { const n = new Set(prev); n.delete(metric); return n; }); }
  };

  const activeResult = results && activeMetric ? results[activeMetric] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px', height: 52, borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 }}>
        <button onClick={() => nav('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, padding: 0 }}>
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none"><circle cx="12" cy="12" r="8" stroke="#00f5d4" strokeWidth="2"/><line x1="18" y1="18" x2="25" y2="25" stroke="#00f5d4" strokeWidth="2.5" strokeLinecap="round"/></svg>
          SearchLens
        </button>
        <span className="tag tag-blue">ML · Anomaly Detection</span>
        {useRealPC && pcSamples > 0 && <span className="tag tag-cyan">💻 {pcSamples} Real PC Samples</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => nav('/iot')} style={{ padding: '5px 12px', background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.2)', color: 'var(--cyan)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>📡 IoT Fleet</button>
        <button onClick={() => nav('/app')} style={{ padding: '5px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg2)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>← Search</button>
        <StatusBar status={serverStatus} />
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg2)', overflowY: 'auto', padding: 20 }}>
          {/* Real PC Toggle */}
          <div style={{ marginBottom: 16, padding: 14, background: useRealPC ? 'rgba(0,245,212,0.06)' : 'var(--bg3)', border: `1px solid ${useRealPC ? 'rgba(0,245,212,0.2)' : 'var(--border)'}`, borderRadius: 'var(--radius)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: useRealPC ? 'var(--cyan)' : 'var(--fg2)' }}>💻 Real PC Metrics</span>
              <button onClick={() => setUseRealPC(!useRealPC)}
                style={{ width: 40, height: 22, borderRadius: 11, background: useRealPC ? 'var(--cyan)' : 'var(--border2)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: useRealPC ? 21 : 3, transition: 'left 0.2s' }} />
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--fg3)', lineHeight: 1.5 }}>{useRealPC ? `Analyzing ${pcSamples} real samples from your machine (CPU, Memory, Network). Updated every 3s.` : 'Using manual input data. Toggle to use live PC metrics.'}</p>
            {useRealPC && pcMetrics && (
              <div style={{ marginTop: 10 }}>
                <PCMetricsMini metrics={pcMetrics} />
              </div>
            )}
          </div>

          {!useRealPC && (
            <>
              <div style={{ marginBottom: 10, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg3)' }}>Manual Metric Input</div>
              {Object.entries(metricInputs).map(([key, val]) => (
                <div key={key} style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: key === 'CPU' ? 'var(--cyan)' : key === 'Memory' ? 'var(--amber)' : key === 'Latency' ? 'var(--magenta)' : 'var(--red)', marginBottom: 5 }}>
                    {key === 'CPU' ? '⚡' : key === 'Memory' ? '💾' : key === 'Latency' ? '⏱' : '⚠'} {key}
                  </label>
                  <textarea value={val} onChange={e => setMetricInputs(prev => ({ ...prev, [key]: e.target.value }))}
                    style={{ width: '100%', resize: 'vertical', minHeight: 70, padding: '8px 10px', fontSize: 11, lineHeight: 1.5, borderRadius: 'var(--radius)' }} />
                </div>
              ))}
            </>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)' }}>Sensitivity (Z-Threshold)</span>
              <span style={{ fontSize: 11, color: 'var(--fg)', fontWeight: 700 }}>{threshold}</span>
            </div>
            <input type="range" min="1" max="4" step="0.1" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))} style={{ width: '100%', WebkitAppearance: 'none', appearance: 'none', height: 4, borderRadius: 2, border: 'none', background: `linear-gradient(90deg, var(--cyan) ${((threshold - 1) / 3) * 100}%, var(--bg3) ${((threshold - 1) / 3) * 100}%)`, cursor: 'pointer' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--fg3)' }}><span>Sensitive</span><span>Strict</span></div>
          </div>

          <button onClick={handleAnalyze} disabled={loading || (useRealPC && pcSamples < 3)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: 12, background: 'var(--blue)', color: '#fff', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer' }}>
            {loading ? <><Spinner color="#fff" /> Detecting Anomalies…</> : useRealPC && pcSamples < 3 ? <>Collecting PC data ({pcSamples}/3)…</> : <>◈ Run Anomaly Detection</>}
          </button>

          {error && <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,69,96,0.08)', border: '1px solid rgba(255,69,96,0.2)', borderRadius: 'var(--radius)', fontSize: 11, color: 'var(--red)' }}>⚠ {error}</div>}

          {summary && (
            <div style={{ marginTop: 16, padding: 14, background: `rgba(${summary.overallHealth === 'healthy' ? '57,255,107' : summary.overallHealth === 'warning' ? '255,179,71' : '255,69,96'},0.06)`, border: `1px solid rgba(${summary.overallHealth === 'healthy' ? '57,255,107' : summary.overallHealth === 'warning' ? '255,179,71' : '255,69,96'},0.2)`, borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: summary.overallHealth === 'healthy' ? 'var(--green)' : summary.overallHealth === 'warning' ? 'var(--amber)' : 'var(--red)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {summary.overallHealth === 'healthy' ? '✓ System Healthy' : summary.overallHealth === 'warning' ? '⚠ Warning' : '🚨 Critical'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg2)' }}>{summary.totalAnomalies} anomalies across {summary.metricsAnalyzed} metrics</div>
            </div>
          )}

          {/* Live PC sparklines */}
          {useRealPC && Object.keys(pcHistory).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg3)', marginBottom: 10 }}>Live PC History</div>
              {Object.entries(pcHistory).map(([key, vals]) => vals.length > 1 && (
                <div key={key} style={{ marginBottom: 10, padding: '8px 10px', background: 'var(--bg3)', borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--fg3)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{key}</div>
                  <Sparkline data={vals} color={key === 'CPU' ? 'var(--cyan)' : key === 'Memory' ? 'var(--amber)' : key === 'Network' ? 'var(--blue)' : 'var(--magenta)'} height={30} width={240} />
                  <div style={{ fontSize: 11, color: 'var(--fg)', fontWeight: 700, marginTop: 4 }}>{vals[vals.length - 1]?.toFixed(1)}{key.includes('Network') ? ' KB/s' : '%'}</div>
                </div>
              ))}
            </div>
          )}
        </aside>

        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!results ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, textAlign: 'center', padding: 40 }}>
              <div className="animate-float" style={{ fontSize: 64 }}>📊</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>Cloud Metrics Anomaly Detection</h3>
              <p style={{ fontSize: 13, maxWidth: 480, lineHeight: 1.7, color: 'var(--fg2)' }}>
                {useRealPC ? `Your PC is streaming live data! Collecting ${pcSamples} samples. Z-score algorithm will detect statistical outliers in your real CPU, Memory, and Network metrics.` : 'Input your cloud infrastructure metrics. The Z-score ML algorithm detects statistical outliers and flags them as warnings or critical anomalies.'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                {['Z-Score Algorithm', 'Real-time PC Data', 'Severity Scoring', 'AI Root Cause'].map(f => <span key={f} className="tag tag-blue">{f}</span>)}
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 }}>
                {Object.keys(results).map(metric => {
                  const r = results[metric];
                  const hasAnomaly = r.stats.anomalyCount > 0;
                  const isReal = metric.includes('(Real)');
                  return (
                    <button key={metric} onClick={() => setActiveMetric(metric)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: activeMetric === metric ? 'var(--bg3)' : 'transparent', color: activeMetric === metric ? 'var(--fg)' : 'var(--fg2)', fontSize: 12, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius)', border: `1px solid ${activeMetric === metric ? 'var(--border2)' : 'transparent'}`, cursor: 'pointer' }}>
                      {isReal && <span style={{ fontSize: 10 }}>💻</span>}
                      {metric.replace(' (Real)', '')}
                      {hasAnomaly && <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.stats.criticalCount > 0 ? 'var(--red)' : 'var(--amber)', flexShrink: 0 }} />}
                    </button>
                  );
                })}
                <div style={{ marginLeft: 'auto' }}>
                  {summary && <span className={`tag tag-${summary.overallHealth === 'healthy' ? 'green' : summary.overallHealth === 'warning' ? 'amber' : 'red'}`}>{summary.totalAnomalies} anomalies</span>}
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                {activeResult && (
                  <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                      {[
                        { label: 'Mean', value: activeResult.stats.mean.toFixed(1), color: 'var(--cyan)' },
                        { label: 'Max', value: activeResult.stats.max.toFixed(1), color: 'var(--amber)' },
                        { label: 'Anomalies', value: activeResult.stats.anomalyCount, color: activeResult.stats.anomalyCount > 0 ? 'var(--red)' : 'var(--green)' },
                        { label: 'Anomaly Rate', value: activeResult.stats.anomalyRate + '%', color: activeResult.stats.anomalyRate > 10 ? 'var(--red)' : 'var(--green)' },
                      ].map((s, i) => (
                        <div key={i} className="card" style={{ padding: 16, textAlign: 'center' }}>
                          <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>{s.value}</div>
                          <div style={{ fontSize: 10, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{activeMetric} Time Series {activeMetric.includes('(Real)') && <span className="tag tag-cyan" style={{ marginLeft: 6 }}>Live PC Data</span>}</div>
                          <div style={{ fontSize: 11, color: 'var(--fg3)', marginTop: 2 }}>{activeResult.values.length} data points · Z-threshold: {threshold}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--fg3)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block' }} /> Warning</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} /> Critical</span>
                        </div>
                      </div>
                      <Sparkline data={activeResult.values} anomalies={activeResult.anomalies} color="var(--blue)" height={100} width={800} />
                    </div>

                    <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--fg3)', textTransform: 'uppercase' }}>Data Points</div>
                      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              {['#', 'Value', 'Z-Score', 'Deviation', 'Status'].map(h => (
                                <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, color: 'var(--fg3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activeResult.anomalies.map((pt, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid rgba(26,37,53,0.5)', background: pt.isAnomaly ? (pt.severity === 'critical' ? 'rgba(255,69,96,0.04)' : 'rgba(255,179,71,0.04)') : 'transparent' }}>
                                <td style={{ padding: '7px 14px', fontSize: 11, color: 'var(--fg3)' }}>{i + 1}</td>
                                <td style={{ padding: '7px 14px', fontSize: 12, fontWeight: pt.isAnomaly ? 700 : 400, color: pt.isAnomaly ? (pt.severity === 'critical' ? 'var(--red)' : 'var(--amber)') : 'var(--fg)' }}>{pt.value}</td>
                                <td style={{ padding: '7px 14px', fontSize: 11, color: pt.zScore > threshold ? 'var(--red)' : 'var(--fg2)' }}>{pt.zScore}</td>
                                <td style={{ padding: '7px 14px', fontSize: 11, color: pt.deviation > 0 ? 'var(--red)' : 'var(--green)' }}>{pt.deviation > 0 ? '+' : ''}{pt.deviation}</td>
                                <td style={{ padding: '7px 14px' }}><span className={`tag tag-${pt.severity === 'normal' ? 'gray' : pt.severity === 'warning' ? 'amber' : 'red'}`}>{pt.severity}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {serverStatus?.geminiEnabled && !aiReport[activeMetric] && (
                      <button onClick={() => handleAIReport(activeMetric)} disabled={loadingAI.has(activeMetric)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: 12, background: 'rgba(255,179,71,0.1)', color: 'var(--amber)', border: '1px solid rgba(255,179,71,0.2)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, borderRadius: 'var(--radius)', cursor: 'pointer', marginBottom: 16 }}>
                        {loadingAI.has(activeMetric) ? <><Spinner color="var(--amber)" /> AI Analyzing Root Cause…</> : <>🤖 Get AI Root Cause Analysis</>}
                      </button>
                    )}
                    {aiReport[activeMetric] && (
                      <div className="card" style={{ padding: 20, borderColor: 'rgba(255,179,71,0.15)', animation: 'fadeIn 0.4s ease' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                          <span style={{ fontSize: 16 }}>🤖</span>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700 }}>AI Root Cause — {activeMetric}</span>
                          <span className={`tag tag-${aiReport[activeMetric].urgency === 'critical' ? 'red' : aiReport[activeMetric].urgency === 'high' ? 'amber' : 'cyan'}`}>{aiReport[activeMetric].urgency} urgency</span>
                        </div>
                        {aiReport[activeMetric].alertMessage && <div style={{ padding: '10px 14px', background: 'rgba(255,179,71,0.07)', border: '1px solid rgba(255,179,71,0.15)', borderRadius: 'var(--radius)', marginBottom: 14, fontSize: 13, color: 'var(--amber)', fontWeight: 600 }}>{aiReport[activeMetric].alertMessage}</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                          {[{ k: 'rootCause', icon: '🔍', label: 'Root Cause' }, { k: 'impact', icon: '💥', label: 'Impact' }, { k: 'predictedTrend', icon: '📈', label: 'Trend' }].map(item => aiReport[activeMetric][item.k] && (
                            <div key={item.k} style={{ padding: 12, background: 'var(--bg3)', borderRadius: 'var(--radius)' }}>
                              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg3)', marginBottom: 6 }}>{item.icon} {item.label}</div>
                              <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.6 }}>{aiReport[activeMetric][item.k]}</div>
                            </div>
                          ))}
                        </div>
                        {Array.isArray(aiReport[activeMetric].recommendations) && (
                          <div>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg3)', marginBottom: 8, fontWeight: 700 }}>✅ Recommendations</div>
                            {aiReport[activeMetric].recommendations.map((r: string, i: number) => (
                              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--fg2)', alignItems: 'flex-start', marginBottom: 4 }}><span style={{ color: 'var(--green)', flexShrink: 0 }}>›</span>{r}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// =============================================
// IOT FLEET PAGE — host-pc uses REAL data
// =============================================
const DEVICE_ICONS: Record<string, string> = { server: '🖥️', 'edge-sensor': '📡', gateway: '🔀', database: '🗄️', loadbalancer: '⚖️', monitor: '👁️' };
const METRIC_UNITS: Record<string, string> = { cpu: '%', memory: '%', temperature: '°C', network: '%', latency: 'ms' };

function IoTPage({ serverStatus }: { serverStatus: ServerStatus | null }) {
  const nav = useNavigate();
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [summary, setSummary] = useState<any>(null);
  const [alerts, setAlerts] = useState<{ device: string; message: string; time: string; isReal?: boolean }[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, any[]>>({});
  const [commandLoading, setCommandLoading] = useState<Set<string>>(new Set());
  const [commandLogs, setCommandLogs] = useState<{ device: string; command: string; result: string; time: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [hasRealMetrics, setHasRealMetrics] = useState(false);
  const intervalRef = useRef<any>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchTelemetry = useCallback(async () => {
    try {
      const data = await api.iotTelemetry();
      setDevices(data.devices);
      setSummary(data.summary);
      setHasRealMetrics(data.hasRealMetrics ?? false);
      if (data.alerts.length > 0) setAlerts(prev => [...data.alerts, ...prev].slice(0, 50));
      setHistory(prev => {
        const next = { ...prev };
        for (const [id, d] of Object.entries(data.devices as Record<string, Device>)) {
          const entry = { ...d.telemetry, t: new Date().toLocaleTimeString() };
          next[id] = [...(next[id] || []), entry].slice(-20);
        }
        return next;
      });
    } catch (e) { console.error('Telemetry fetch failed', e); }
  }, []);

  const startSimulation = () => {
    setRunning(true);
    fetchTelemetry();
    intervalRef.current = setInterval(fetchTelemetry, 2000);
  };
  const stopSimulation = () => { setRunning(false); clearInterval(intervalRef.current); };
  useEffect(() => () => clearInterval(intervalRef.current), []);

  const handleCommand = async (deviceId: string, command: string, deviceName: string) => {
    const key = `${deviceId}-${command}`;
    setCommandLoading(prev => new Set([...prev, key]));
    try {
      const result = await api.iotCommand(deviceId, command);
      const log = { device: deviceName, command, result: result.message, time: new Date().toLocaleTimeString() };
      setCommandLogs(prev => [log, ...prev].slice(0, 20));
      if (result.newStatus) {
        setDevices(prev => {
          const next = { ...prev };
          if (next[deviceId]) next[deviceId] = { ...next[deviceId], telemetry: { ...next[deviceId].telemetry, status: result.newStatus } };
          return next;
        });
      }
    } catch (e: any) {
      setCommandLogs(prev => [{ device: deviceName, command, result: 'Failed: ' + e.message, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 20));
    } finally { setCommandLoading(prev => { const n = new Set(prev); n.delete(key); return n; }); }
  };

  const statusColor = (s: string) => s === 'online' ? 'var(--green)' : s === 'degraded' ? 'var(--amber)' : 'var(--red)';
  const metricColor = (key: string, val: number) => {
    if (key === 'temperature') return val > 75 ? 'var(--red)' : val > 60 ? 'var(--amber)' : 'var(--green)';
    if (key === 'latency') return val > 50 ? 'var(--red)' : val > 25 ? 'var(--amber)' : 'var(--green)';
    return val > 90 ? 'var(--red)' : val > 75 ? 'var(--amber)' : 'var(--cyan)';
  };

  const selectedDeviceData = selectedDevice ? devices[selectedDevice] : null;
  const selectedHistory = selectedDevice ? (history[selectedDevice] || []) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px', height: 52, borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 }}>
        <button onClick={() => nav('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, padding: 0 }}>
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none"><circle cx="12" cy="12" r="8" stroke="#00f5d4" strokeWidth="2"/><line x1="18" y1="18" x2="25" y2="25" stroke="#00f5d4" strokeWidth="2.5" strokeLinecap="round"/></svg>
          SearchLens
        </button>
        <span className="tag tag-cyan">IoT · Cloud Device Fleet</span>
        {hasRealMetrics && <span className="tag tag-green">💻 Real PC Data Active</span>}
        {summary && (
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="tag tag-green">{summary.online} Online</span>
            {summary.degraded > 0 && <span className="tag tag-amber">{summary.degraded} Degraded</span>}
            {summary.offline > 0 && <span className="tag tag-red">{summary.offline} Offline</span>}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={running ? stopSimulation : startSimulation}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: running ? 'rgba(255,69,96,0.1)' : 'var(--cyan)', color: running ? 'var(--red)' : '#000', border: running ? '1px solid rgba(255,69,96,0.3)' : 'none', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, borderRadius: 'var(--radius)', cursor: 'pointer' }}>
          {running ? <><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', animation: 'pulse 1s infinite' }} /> Stop Feed</> : <>▶ Start Live Feed</>}
        </button>
        <button onClick={() => nav('/anomaly')} style={{ padding: '5px 12px', background: 'rgba(77,159,255,0.08)', border: '1px solid rgba(77,159,255,0.2)', color: 'var(--blue)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>📊 Anomaly</button>
        <button onClick={() => nav('/app')} style={{ padding: '5px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg2)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>← Search</button>
        <StatusBar status={serverStatus} />
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {!running && Object.keys(devices).length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16, textAlign: 'center' }}>
              <div className="animate-float" style={{ fontSize: 64 }}>📡</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--fg)' }}>IoT Cloud Device Fleet</h3>
              <p style={{ fontSize: 13, maxWidth: 540, lineHeight: 1.7, color: 'var(--fg2)' }}>
                Your <strong style={{ color: 'var(--cyan)' }}>actual PC hardware</strong> is the first device in the fleet! Real CPU, memory, temperature, and network data stream from your machine. 5 simulated cloud devices complete the fleet.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                {['💻 Real PC Metrics', 'Device Telemetry', 'Health Monitoring', 'Remote Commands'].map(f => <span key={f} className="tag tag-cyan">{f}</span>)}
              </div>
              <button onClick={startSimulation} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', background: 'var(--cyan)', color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer' }}>▶ Start Live Simulation</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {Object.values(devices).map(device => {
              const t = device.telemetry;
              const isSelected = selectedDevice === device.id;
              const isReal = device.isRealDevice;
              return (
                <div key={device.id} onClick={() => setSelectedDevice(isSelected ? null : device.id)} className="card"
                  style={{ padding: 16, cursor: 'pointer', borderColor: isReal ? 'rgba(0,245,212,0.3)' : isSelected ? 'var(--cyan)' : t.status === 'offline' ? 'rgba(255,69,96,0.3)' : t.status === 'degraded' ? 'rgba(255,179,71,0.3)' : undefined, transition: 'all 0.2s', animation: 'fadeIn 0.3s ease', opacity: t.status === 'offline' ? 0.7 : 1, position: 'relative' }}>
                  {isReal && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, background: 'rgba(0,245,212,0.15)', border: '1px solid rgba(0,245,212,0.3)', color: 'var(--cyan)', padding: '2px 6px', borderRadius: 3, fontWeight: 700, letterSpacing: '0.06em' }}>REAL DATA</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 22 }}>{isReal ? '💻' : DEVICE_ICONS[device.type] || '📟'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: isReal ? 'var(--cyan)' : 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{device.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--fg3)', marginTop: 1 }}>{device.id} · {device.location}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(t.status), boxShadow: t.status === 'online' ? '0 0 6px rgba(57,255,107,0.5)' : undefined, animation: t.status === 'online' ? 'pulse 2s infinite' : undefined }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(t.status), textTransform: 'uppercase' }}>{t.status}</span>
                    </div>
                  </div>

                  {t.status !== 'offline' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {Object.entries({ cpu: t.cpu, memory: t.memory, temperature: t.temperature, latency: t.latency }).map(([key, val]) => (
                        <div key={key} style={{ padding: '8px 10px', background: 'var(--bg3)', borderRadius: 4 }}>
                          <div style={{ fontSize: 9, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{key}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: metricColor(key, val), fontFamily: 'var(--font-display)' }}>{val.toFixed(1)}<span style={{ fontSize: 9, fontWeight: 400, color: 'var(--fg3)' }}>{METRIC_UNITS[key]}</span></div>
                          <div style={{ marginTop: 4, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 2, background: metricColor(key, val), width: `${key === 'latency' ? Math.min(val / 2, 100) : val}%`, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Extra real PC info */}
                  {isReal && t.processes !== undefined && (
                    <div style={{ marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {t.processes !== undefined && <span className="tag tag-gray">{t.processes} procs</span>}
                      {t.loadAvg && <span className="tag tag-gray">load: {t.loadAvg}</span>}
                      {t.uptime && <span className="tag tag-gray">up: {formatUptime(t.uptime)}</span>}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 5 }}>
                    {[
                      { cmd: 'ping', label: 'Ping', icon: '◉' },
                      { cmd: 'restart', label: isReal ? 'Info' : 'Restart', icon: isReal ? 'ℹ' : '↺' },
                      { cmd: t.status === 'offline' ? 'restart' : 'shutdown', label: t.status === 'offline' ? 'Boot' : isReal ? 'Lock' : 'Stop', icon: t.status === 'offline' ? '▶' : '■' },
                    ].map(({ cmd, label, icon }) => {
                      const key = `${device.id}-${cmd}`;
                      return (
                        <button key={cmd} onClick={(e) => { e.stopPropagation(); handleCommand(device.id, cmd, device.name); }} disabled={commandLoading.has(key)}
                          style={{ flex: 1, padding: '5px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg2)', fontSize: 10, fontFamily: 'var(--font-mono)', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          {commandLoading.has(key) ? <Spinner size={10} /> : <>{icon} {label}</>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedDeviceData && selectedHistory.length > 0 && (
            <div className="card" style={{ marginTop: 20, padding: 20, borderColor: selectedDeviceData.isRealDevice ? 'rgba(0,245,212,0.3)' : 'rgba(0,245,212,0.2)', animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 24 }}>{selectedDeviceData.isRealDevice ? '💻' : DEVICE_ICONS[selectedDeviceData.type]}</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>
                    {selectedDeviceData.name} — Telemetry History
                    {selectedDeviceData.isRealDevice && <span className="tag tag-cyan" style={{ marginLeft: 8 }}>Real PC</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg3)', marginTop: 2 }}>Last {selectedHistory.length} readings · updates every 2s</div>
                </div>
                <button onClick={() => setSelectedDevice(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--fg3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                {['cpu', 'memory', 'temperature', 'latency'].map(key => {
                  const vals = selectedHistory.map((h: any) => h[key] || 0);
                  return (
                    <div key={key} style={{ padding: 12, background: 'var(--bg3)', borderRadius: 'var(--radius)' }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg3)', marginBottom: 8 }}>{key}</div>
                      <Sparkline data={vals} color={key === 'cpu' ? 'var(--cyan)' : key === 'memory' ? 'var(--amber)' : key === 'temperature' ? 'var(--red)' : 'var(--magenta)'} height={40} width={160} />
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', marginTop: 6, fontFamily: 'var(--font-display)' }}>{vals[vals.length - 1]?.toFixed(1)}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--fg3)' }}>{METRIC_UNITS[key]}</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <aside style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg2)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg3)', display: 'flex', alignItems: 'center', gap: 8 }}>
            🚨 Live Alert Stream
            {running && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', animation: 'pulse 1s infinite', display: 'inline-block' }} />}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            {alerts.length === 0 && <div style={{ padding: 12, fontSize: 11, color: 'var(--fg3)', textAlign: 'center' }}>{running ? 'Monitoring… no alerts' : 'Start simulation to see alerts'}</div>}
            {alerts.map((a, i) => (
              <div key={i} style={{ padding: '8px 10px', marginBottom: 5, background: a.isReal ? 'rgba(0,245,212,0.05)' : 'rgba(255,179,71,0.06)', border: `1px solid ${a.isReal ? 'rgba(0,245,212,0.2)' : 'rgba(255,179,71,0.15)'}`, borderRadius: 4, animation: i === 0 ? 'slideIn 0.3s ease' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: a.isReal ? 'var(--cyan)' : 'var(--amber)', fontWeight: 700 }}>{a.device}</span>
                  {a.isReal && <span className="tag tag-cyan" style={{ fontSize: 8 }}>REAL</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg2)' }}>{a.message}</div>
                <div style={{ fontSize: 9, color: 'var(--fg3)', marginTop: 2 }}>{a.time}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg3)' }}>📋 Command Log</div>
          <div style={{ overflowY: 'auto', padding: '0 10px 10px', maxHeight: 200 }}>
            {commandLogs.length === 0 && <div style={{ padding: 10, fontSize: 11, color: 'var(--fg3)', textAlign: 'center' }}>No commands sent</div>}
            {commandLogs.map((log, i) => (
              <div key={i} style={{ padding: '7px 10px', marginBottom: 5, background: 'rgba(57,255,107,0.04)', border: '1px solid rgba(57,255,107,0.1)', borderRadius: 4, animation: i === 0 ? 'slideIn 0.3s ease' : undefined }}>
                <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700, marginBottom: 2 }}>{log.device} · {log.command}</div>
                <div style={{ fontSize: 11, color: 'var(--fg2)' }}>{log.result}</div>
                <div style={{ fontSize: 9, color: 'var(--fg3)', marginTop: 2 }}>{log.time}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

// =============================================
// SEARCH APP
// =============================================
function CorpusPanel({ corpus, onCorpusChange }: { corpus: string; onCorpusChange: (v: string) => void }) {
  const lines = corpus.trim() ? corpus.trim().split('\n').filter(l => l.trim()) : [];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)' }}>Document Corpus</span>
        <button onClick={() => onCorpusChange(SAMPLE_CORPUS.join('\n'))} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--fg3)', fontSize: 10, fontFamily: 'var(--font-mono)', padding: '3px 8px', borderRadius: 'var(--radius)', cursor: 'pointer' }}>Load Sample</button>
      </div>
      <textarea value={corpus} onChange={e => onCorpusChange(e.target.value)} placeholder="Paste one document per line…" style={{ width: '100%', resize: 'vertical', minHeight: 160, padding: '10px 12px', fontSize: 12, lineHeight: 1.6, borderRadius: 'var(--radius)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: 'var(--fg3)' }}><span>{corpus.length} chars</span><span>{lines.length} docs</span></div>
    </div>
  );
}

function SearchApp() {
  const nav = useNavigate();
  const [query, setQuery] = useState('');
  const [corpus, setCorpus] = useState('');
  const [alpha, setAlpha] = useState(0.5);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [sortBy, setSortBy] = useState<'hybrid' | 'lexical' | 'semantic'>('hybrid');
  const [aiQueryReport, setAiQueryReport] = useState<any>(null);
  const [loadingAIQuery, setLoadingAIQuery] = useState(false);
  const [selectedResultForAI, setSelectedResultForAI] = useState<number | null>(null);
  const [aiCorrections, setAiCorrections] = useState<Record<number, any>>({});
  const [loadingCorrections, setLoadingCorrections] = useState<Set<number>>(new Set());
  const [exportMsg, setExportMsg] = useState('');

  useEffect(() => { api.health().then(s => setServerStatus(s)).catch(() => setServerStatus({ status: 'offline', geminiEnabled: false, features: {} })); }, []);

  const documents = corpus.trim() ? corpus.trim().split('\n').filter(l => l.trim()) : [];

  const handleAnalyze = async () => {
    if (!query.trim() || !documents.length) return;
    setLoading(true); setError(null); setResults(null); setAiQueryReport(null); setAiCorrections({});
    try {
      const data = await api.analyze(query, documents, alpha);
      setResults(data.results); setMeta(data.meta); setSearchedQuery(query);
    } catch (e: any) { setError(e.message || 'Backend not reachable. Make sure backend is running on port 3001.'); }
    finally { setLoading(false); }
  };

  const sortedResults = results ? [...results].sort((a, b) => {
    if (sortBy === 'lexical') return b.lexicalScore - a.lexicalScore;
    if (sortBy === 'semantic') return b.semanticScore - a.semanticScore;
    return b.hybridScore - a.hybridScore;
  }) : null;

  const handleExportJSON = () => {
    if (!sortedResults) return;
    const blob = new Blob([JSON.stringify({ query: searchedQuery, alpha, sortBy, meta, results: sortedResults }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `searchlens-results-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    setExportMsg('Exported!');
    setTimeout(() => setExportMsg(''), 2000);
  };

  const handleAIQueryAnalysis = async () => {
    if (!query.trim() || !documents.length) return;
    setLoadingAIQuery(true);
    try {
      const data = await api.aiAnalyzeQuery(query, documents);
      setAiQueryReport(data);
    } catch (e: any) { setAiQueryReport({ error: e.message }); }
    finally { setLoadingAIQuery(false); }
  };

  const handleAICorrections = async (result: SearchResult) => {
    setLoadingCorrections(prev => new Set([...prev, result.id]));
    try {
      const data = await api.aiSuggestCorrections(result.text, documents, result.lexicalScore, result.semanticScore);
      setAiCorrections(prev => ({ ...prev, [result.id]: data }));
    } catch (e: any) { setAiCorrections(prev => ({ ...prev, [result.id]: { error: e.message } })); }
    finally { setLoadingCorrections(prev => { const n = new Set(prev); n.delete(result.id); return n; }); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px', height: 52, borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 }}>
        <button onClick={() => nav('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, padding: 0 }}>
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none"><circle cx="12" cy="12" r="8" stroke="#00f5d4" strokeWidth="2"/><line x1="18" y1="18" x2="25" y2="25" stroke="#00f5d4" strokeWidth="2.5" strokeLinecap="round"/></svg>
          SearchLens
        </button>
        <span className="tag tag-cyan">Hybrid Search</span>
        <div style={{ flex: 1 }}>{meta && <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}><span className="tag tag-gray">{meta.totalDocuments} docs</span><span className="tag tag-cyan">top: {(meta.topScore * 100).toFixed(0)}%</span></div>}</div>
        <button onClick={() => nav('/resume')} style={{ padding: '5px 12px', background: 'rgba(255,110,199,0.08)', border: '1px solid rgba(255,110,199,0.2)', color: 'var(--magenta)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>📋 Resume</button>
        <button onClick={() => nav('/anomaly')} style={{ padding: '5px 12px', background: 'rgba(77,159,255,0.08)', border: '1px solid rgba(77,159,255,0.2)', color: 'var(--blue)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>📊 Anomaly</button>
        <button onClick={() => nav('/iot')} style={{ padding: '5px 12px', background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.2)', color: 'var(--cyan)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>📡 IoT</button>
        <StatusBar status={serverStatus} />
      </header>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg2)', overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 8 }}>Search Query</label>
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAnalyze()} placeholder="e.g. machine learning healthcare…" style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 'var(--radius)' }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)' }}>Alpha (α)</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)' }}>α = {alpha.toFixed(2)}</span>
            </div>
            <input type="range" min="0" max="1" step="0.05" value={alpha} onChange={e => setAlpha(parseFloat(e.target.value))} style={{ width: '100%', WebkitAppearance: 'none', appearance: 'none', background: `linear-gradient(90deg, var(--cyan) ${alpha * 100}%, var(--amber) ${alpha * 100}%)`, height: 4, borderRadius: 2, border: 'none', cursor: 'pointer' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10 }}><span style={{ color: 'var(--cyan)' }}>◀ Lexical</span><span style={{ color: 'var(--amber)' }}>Semantic ▶</span></div>
          </div>
          <CorpusPanel corpus={corpus} onCorpusChange={setCorpus} />
          <button onClick={handleAnalyze} disabled={!query.trim() || !documents.length || loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: 12, background: 'var(--cyan)', color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer' }}>
            {loading ? <><Spinner color="#000" /> Analyzing…</> : <>◈ Analyze Relevance</>}
          </button>
          {serverStatus?.geminiEnabled && query.trim() && documents.length > 0 && (
            <button onClick={handleAIQueryAnalysis} disabled={loadingAIQuery} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: 10, background: 'rgba(255,179,71,0.08)', color: 'var(--amber)', border: '1px solid rgba(255,179,71,0.2)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12, borderRadius: 'var(--radius)', cursor: 'pointer' }}>
              {loadingAIQuery ? <><Spinner color="var(--amber)" size={12} /> Analyzing Query…</> : <>🤖 AI Query Intelligence</>}
            </button>
          )}
          {error && <div style={{ padding: '8px 12px', background: 'rgba(255,69,96,0.08)', border: '1px solid rgba(255,69,96,0.2)', borderRadius: 'var(--radius)', fontSize: 11, color: 'var(--red)' }}>⚠ {error}</div>}

          {/* AI Query Intelligence Panel */}
          {aiQueryReport && !aiQueryReport.error && (
            <div style={{ padding: 14, background: 'rgba(255,179,71,0.05)', border: '1px solid rgba(255,179,71,0.15)', borderRadius: 'var(--radius)', animation: 'fadeIn 0.4s ease' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>🤖 Query Intelligence</div>
              {aiQueryReport.rewrittenQuery && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Rewritten Query</div>
                  <div style={{ fontSize: 12, color: 'var(--amber)', background: 'var(--bg3)', padding: '6px 10px', borderRadius: 4 }}>{aiQueryReport.rewrittenQuery}</div>
                </div>
              )}
              {aiQueryReport.domainDetected && <div style={{ fontSize: 11, color: 'var(--fg2)', marginBottom: 6 }}>Domain: <span style={{ color: 'var(--cyan)' }}>{aiQueryReport.domainDetected}</span> · Strength: <span style={{ color: aiQueryReport.queryStrength === 'strong' ? 'var(--green)' : 'var(--amber)' }}>{aiQueryReport.queryStrength}</span></div>}
              {aiQueryReport.searchTip && <div style={{ fontSize: 11, color: 'var(--fg3)', lineHeight: 1.5, marginBottom: 8 }}>💡 {aiQueryReport.searchTip}</div>}
              {Array.isArray(aiQueryReport.alternativeQueries) && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Alternative Queries</div>
                  {aiQueryReport.alternativeQueries.map((q: string, i: number) => (
                    <div key={i} onClick={() => { setQuery(q); setAiQueryReport(null); }} style={{ fontSize: 11, color: 'var(--fg2)', padding: '4px 8px', background: 'var(--bg3)', borderRadius: 4, marginBottom: 4, cursor: 'pointer', border: '1px solid var(--border)' }}>
                      → {q}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {!results && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, textAlign: 'center', gap: 12 }}>
              <div className="animate-float"><svg width="80" height="80" viewBox="0 0 80 80" fill="none"><circle cx="34" cy="34" r="22" stroke="rgba(0,245,212,0.2)" strokeWidth="2" strokeDasharray="6 4" /><circle cx="34" cy="34" r="10" stroke="rgba(0,245,212,0.15)" strokeWidth="1.5" /><line x1="50" y1="50" x2="68" y2="68" stroke="rgba(0,245,212,0.2)" strokeWidth="2.5" strokeLinecap="round" /></svg></div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>Ready to analyze</h3>
              <p style={{ fontSize: 13, color: 'var(--fg2)' }}>Enter query, paste corpus, click Analyze.</p>
            </div>
          )}
          {loading && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}><div style={{ width: 48, height: 48, border: '2px solid var(--border)', borderTopColor: 'var(--cyan)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /><p style={{ fontSize: 12, color: 'var(--cyan)' }}>Running BM25 + semantic scoring…</p></div>}
          {sortedResults && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>Results for: <span style={{ color: 'var(--cyan)' }}>"{searchedQuery}"</span></div>
                  <div style={{ fontSize: 11, color: 'var(--fg3)', marginTop: 2 }}>{sortedResults.length} documents · sorted by {sortBy}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {/* Sort toggle */}
                  <div style={{ display: 'flex', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                    {(['hybrid', 'lexical', 'semantic'] as const).map(s => (
                      <button key={s} onClick={() => setSortBy(s)}
                        style={{ padding: '5px 10px', background: sortBy === s ? (s === 'hybrid' ? 'var(--bg3)' : s === 'lexical' ? 'rgba(0,245,212,0.12)' : 'rgba(255,179,71,0.12)') : 'transparent', color: sortBy === s ? (s === 'lexical' ? 'var(--cyan)' : s === 'semantic' ? 'var(--amber)' : 'var(--fg)') : 'var(--fg3)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.15s' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                  {/* JSON Export */}
                  <button onClick={handleExportJSON}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: exportMsg ? 'rgba(57,255,107,0.1)' : 'var(--bg3)', border: `1px solid ${exportMsg ? 'rgba(57,255,107,0.3)' : 'var(--border)'}`, color: exportMsg ? 'var(--green)' : 'var(--fg3)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.2s' }}>
                    {exportMsg ? '✓ ' + exportMsg : '⤓ Export JSON'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sortedResults.map((r, rank) => (
                  <div key={r.id} className="card" style={{ padding: 16, animation: 'fadeInUp 0.4s ease forwards', opacity: 0, animationDelay: `${rank * 60}ms`, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: rank === 0 ? 'var(--gold)' : rank === 1 ? 'var(--silver)' : rank === 2 ? 'var(--bronze)' : 'transparent' }} />
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <div style={{ minWidth: 26, height: 26, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: rank === 0 ? 'rgba(255,215,0,0.15)' : 'var(--bg3)', border: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: rank === 0 ? 'var(--gold)' : 'var(--fg3)', flexShrink: 0 }}>#{rank + 1}</div>
                      <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.6, flex: 1 }}>{r.text}</div>
                      {serverStatus?.geminiEnabled && (
                        <button onClick={() => { setSelectedResultForAI(r.id === selectedResultForAI ? null : r.id); if (!aiCorrections[r.id]) handleAICorrections(r); }}
                          style={{ flexShrink: 0, padding: '4px 8px', background: selectedResultForAI === r.id ? 'rgba(255,179,71,0.15)' : 'rgba(255,179,71,0.06)', border: `1px solid rgba(255,179,71,${selectedResultForAI === r.id ? '0.4' : '0.15'})`, color: 'var(--amber)', fontSize: 10, fontFamily: 'var(--font-mono)', borderRadius: 4, cursor: 'pointer', height: 26, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {loadingCorrections.has(r.id) ? <Spinner size={10} color="var(--amber)" /> : '✏ AI Fix'}
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <ScoreRow label="Lexical" score={r.lexicalScore} color="var(--cyan)" delay={rank * 60} />
                      <ScoreRow label="Semantic" score={r.semanticScore} color="var(--amber)" delay={rank * 60 + 80} />
                      <ScoreRow label="Hybrid" score={r.hybridScore} color="var(--fg)" bold delay={rank * 60 + 160} />
                    </div>
                    {/* AI Correction Panel */}
                    {selectedResultForAI === r.id && aiCorrections[r.id] && !aiCorrections[r.id].error && (
                      <div style={{ marginTop: 14, padding: 14, background: 'rgba(255,179,71,0.04)', border: '1px solid rgba(255,179,71,0.15)', borderRadius: 'var(--radius)', animation: 'fadeIn 0.3s ease' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', marginBottom: 10 }}>✏ AI Text Correction Suggestions</div>
                        {aiCorrections[r.id].analysis && <div style={{ fontSize: 12, color: 'var(--fg2)', marginBottom: 10, lineHeight: 1.6 }}>{aiCorrections[r.id].analysis}</div>}
                        {Array.isArray(aiCorrections[r.id].suggestions) && aiCorrections[r.id].suggestions.slice(0, 3).map((s: any, i: number) => (
                          <div key={i} style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--bg3)', borderRadius: 4 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                              <span className={`tag tag-${s.type === 'keyword' ? 'cyan' : s.type === 'clarity' ? 'amber' : 'gray'}`} style={{ fontSize: 9 }}>{s.type}</span>
                              <span className={`tag tag-${s.confidence > 0.7 ? 'green' : 'amber'}`} style={{ fontSize: 9 }}>{Math.round(s.confidence * 100)}% conf</span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--fg3)', marginBottom: 3 }}>"{s.original}"</div>
                            <div style={{ fontSize: 11, color: 'var(--cyan)' }}>→ "{s.suggested}"</div>
                            {s.reason && <div style={{ fontSize: 10, color: 'var(--fg3)', marginTop: 4 }}>{s.reason}</div>}
                          </div>
                        ))}
                        {aiCorrections[r.id].improvedText && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 10, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Improved Version</div>
                            <div style={{ fontSize: 12, color: 'var(--green)', padding: '8px 10px', background: 'rgba(57,255,107,0.04)', border: '1px solid rgba(57,255,107,0.1)', borderRadius: 4, lineHeight: 1.6 }}>{aiCorrections[r.id].improvedText}</div>
                          </div>
                        )}
                      </div>
                    )}
                    {selectedResultForAI === r.id && aiCorrections[r.id]?.error && (
                      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--red)', padding: '8px 12px', background: 'rgba(255,69,96,0.06)', borderRadius: 4 }}>⚠ {aiCorrections[r.id].error}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// =============================================
// RESUME ANALYZER
// =============================================
function ResumeApp() {
  const nav = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [sections, setSections] = useState<Record<string, string>>({});
  const [sectionScores, setSectionScores] = useState<Record<string, SectionScore> | null>(null);
  const [atsData, setAtsData] = useState<ATSData | null>(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [resumeEntities, setResumeEntities] = useState<Record<string, string[]> | null>(null);
  const [jdEntities, setJdEntities] = useState<Record<string, string[]> | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, any>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState<Set<string>>(new Set());
  const [improvedSections, setImprovedSections] = useState<Record<string, string>>({});
  const [loadingImproved, setLoadingImproved] = useState<Set<string>>(new Set());
  const [atsReport, setAtsReport] = useState<any>(null);
  const [loadingATSReport, setLoadingATSReport] = useState(false);
  const [activeTab, setActiveTab] = useState<'scores' | 'entities' | 'ats-report'>('scores');

  useEffect(() => { api.health().then(s => setServerStatus(s)).catch(() => setServerStatus({ status: 'offline', geminiEnabled: false, features: {} })); }, []);

  const handleFile = async (f: File) => {
    setFile(f); setError(null); setExtracting(true);
    try { const d = await api.resumeExtract(f); setResumeText(d.text || ''); setSections(d.sections || {}); }
    catch (e: any) { setError('Extract failed: ' + e.message); }
    finally { setExtracting(false); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleAnalyze = async () => {
    setLoading(true); setError(null); setAiSuggestions({}); setImprovedSections({}); setAtsReport(null);
    try {
      const d = await api.resumeAnalyze(file, resumeText, sections, jobDescription);
      setSectionScores(d.sectionScores); setAtsData(d.atsData); setSections(d.sections || sections);
      if (d.resumeEntities) setResumeEntities(d.resumeEntities);
      if (d.jdEntities) setJdEntities(d.jdEntities);
      setActiveTab('scores');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleAISuggestions = async (secName: string) => {
    if (!sectionScores) return;
    setLoadingSuggestions(prev => new Set([...prev, secName]));
    try {
      const data = await api.resumeAISuggestions(secName, sections[secName] || '', jobDescription, sectionScores);
      setAiSuggestions(prev => ({ ...prev, [secName]: data }));
    } catch (e: any) { setAiSuggestions(prev => ({ ...prev, [secName]: { error: e.message } })); }
    finally { setLoadingSuggestions(prev => { const n = new Set(prev); n.delete(secName); return n; }); }
  };

  const handleGenerateImproved = async (secName: string) => {
    setLoadingImproved(prev => new Set([...prev, secName]));
    const gaps = atsData?.missingKeywords || [];
    try {
      const data = await api.resumeGenerateImproved(secName, sections[secName] || '', jobDescription, gaps);
      setImprovedSections(prev => ({ ...prev, [secName]: data.improvedText }));
    } catch (e: any) { setImprovedSections(prev => ({ ...prev, [secName]: 'Error: ' + e.message })); }
    finally { setLoadingImproved(prev => { const n = new Set(prev); n.delete(secName); return n; }); }
  };

  const handleATSReport = async () => {
    if (!atsData) return;
    setLoadingATSReport(true);
    try {
      const data = await api.resumeATSReport(resumeText, jobDescription, atsData);
      setAtsReport(data); setActiveTab('ats-report');
    } catch (e: any) { setAtsReport({ error: e.message }); }
    finally { setLoadingATSReport(false); }
  };

  const scoreColor = (v: number) => v >= 0.7 ? 'var(--green)' : v >= 0.4 ? 'var(--amber)' : 'var(--red)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px', height: 52, borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 }}>
        <button onClick={() => nav('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, padding: 0 }}>
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none"><circle cx="12" cy="12" r="8" stroke="#00f5d4" strokeWidth="2"/><line x1="18" y1="18" x2="25" y2="25" stroke="#00f5d4" strokeWidth="2.5" strokeLinecap="round"/></svg>
          SearchLens
        </button>
        <span className="tag tag-magenta">Resume · ATS Analyzer</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => nav('/app')} style={{ padding: '5px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--fg2)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>← Search</button>
        <StatusBar status={serverStatus} />
      </header>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg2)', overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 8 }}>Upload Resume</label>
            {/* Drag-and-drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              style={{ padding: 20, border: `2px dashed ${isDragOver ? 'var(--cyan)' : 'var(--border)'}`, background: isDragOver ? 'rgba(0,245,212,0.04)' : 'transparent', borderRadius: 'var(--radius)', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
              {extracting ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Spinner /><span style={{ fontSize: 12, color: 'var(--fg3)' }}>Extracting…</span></div>
                : isDragOver ? <div><div style={{ fontSize: 28, marginBottom: 6 }}>📂</div><div style={{ fontSize: 12, color: 'var(--cyan)' }}>Drop to upload</div></div>
                : file ? <div><div style={{ fontSize: 20, marginBottom: 4 }}>📄</div><div style={{ fontSize: 12, color: 'var(--cyan)' }}>{file.name}</div><div style={{ fontSize: 10, color: 'var(--fg3)', marginTop: 2 }}>{resumeText ? resumeText.split(/\s+/).filter(Boolean).length + ' words' : ''}</div></div>
                : <div><div style={{ fontSize: 28, marginBottom: 6 }}>📎</div><div style={{ fontSize: 12, color: 'var(--fg2)' }}>Drag &amp; drop or click to upload</div><div style={{ fontSize: 10, color: 'var(--fg3)', marginTop: 2 }}>PDF · DOCX · XLSX · CSV · JSON · TXT</div></div>}
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.json,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} style={{ display: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 6 }}>Or Paste Resume Text</label>
            <textarea value={resumeText} onChange={e => { setResumeText(e.target.value); setSectionScores(null); setAtsData(null); setResumeEntities(null); }} placeholder="Paste resume text…" style={{ width: '100%', minHeight: 100, padding: '8px 10px', resize: 'vertical', borderRadius: 'var(--radius)' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 6 }}>Job Description</label>
            <textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)} placeholder="Paste job description…" style={{ width: '100%', minHeight: 160, padding: '8px 10px', resize: 'vertical', borderRadius: 'var(--radius)' }} />
          </div>
          <button onClick={handleAnalyze} disabled={!resumeText.trim() || !jobDescription.trim() || loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: 12, background: 'var(--magenta)', color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer' }}>
            {loading ? <><Spinner color="#000" /> Analyzing…</> : <>◈ Analyze Resume vs JD</>}
          </button>
          {error && <div style={{ padding: '8px 12px', background: 'rgba(255,69,96,0.08)', border: '1px solid rgba(255,69,96,0.2)', borderRadius: 'var(--radius)', fontSize: 11, color: 'var(--red)' }}>⚠ {error}</div>}
          {Object.keys(sections).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 6 }}>Detected Sections</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {Object.keys(sections).map(s => <span key={s} className="tag tag-gray" style={{ textTransform: 'capitalize' }}>{s}</span>)}
              </div>
            </div>
          )}
        </aside>
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {!sectionScores && !atsData && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16, textAlign: 'center' }}>
              <div className="animate-float" style={{ fontSize: 60 }}>📋</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>Resume ATS Analyzer</h3>
              <p style={{ fontSize: 13, maxWidth: 460, lineHeight: 1.7, color: 'var(--fg2)' }}>Upload your resume (or paste text) and a job description to get ATS compatibility score, section-wise analysis, entity extraction, keyword gap analysis, and AI-powered improvement suggestions.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {['Drag & Drop', 'Languages Section', 'Entity Extraction', 'AI Section Rewriter', 'ATS Report'].map(f => <span key={f} className="tag tag-magenta" style={{ fontSize: 9 }}>{f}</span>)}
              </div>
            </div>
          )}
          {atsData && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              {/* ATS Score Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, marginBottom: 20 }}>
                <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                  <div style={{ fontSize: 64, fontWeight: 800, color: atsData.atsScore >= 70 ? 'var(--green)' : atsData.atsScore >= 50 ? 'var(--amber)' : 'var(--red)', fontFamily: 'var(--font-display)', letterSpacing: '-0.04em', lineHeight: 1 }}>{atsData.atsScore}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg3)', marginTop: 4 }}>ATS Score</div>
                  <span className={`tag tag-${atsData.atsScore >= 70 ? 'green' : atsData.atsScore >= 50 ? 'amber' : 'red'}`} style={{ marginTop: 10, display: 'inline-block' }}>{atsData.atsScore >= 70 ? 'Excellent' : atsData.atsScore >= 50 ? 'Good' : 'Needs Work'}</span>
                  {serverStatus?.geminiEnabled && (
                    <button onClick={handleATSReport} disabled={loadingATSReport}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginTop: 12, padding: '8px', background: 'rgba(255,110,199,0.1)', border: '1px solid rgba(255,110,199,0.2)', color: 'var(--magenta)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, borderRadius: 'var(--radius)', cursor: 'pointer' }}>
                      {loadingATSReport ? <><Spinner size={10} color="var(--magenta)" /> Generating…</> : '🤖 Full AI ATS Report'}
                    </button>
                  )}
                </div>
                <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
                  <ScoreRow label="Lexical" score={atsData.lexicalScore / 100} color="var(--cyan)" />
                  <ScoreRow label="Semantic" score={atsData.semanticScore / 100} color="var(--amber)" />
                  <ScoreRow label="Hybrid" score={atsData.hybridScore / 100} color="var(--fg)" bold />
                  <ScoreRow label="Keyword" score={atsData.keywordScore / 100} color="var(--magenta)" />
                </div>
              </div>

              {/* Keyword gap */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--green)', marginBottom: 10 }}>✓ Matched ({atsData.totalMatched})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{atsData.matchedKeywords.slice(0, 20).map((kw, i) => <span key={i} className="tag tag-green" style={{ fontSize: 10 }}>{kw}</span>)}</div>
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--red)', marginBottom: 10 }}>✗ Missing ({atsData.missingKeywords.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{atsData.missingKeywords.map((kw, i) => <span key={i} className="tag tag-red" style={{ fontSize: 10 }}>{kw}</span>)}</div>
                </div>
              </div>

              {/* Tab bar */}
              <div style={{ display: 'flex', gap: 0, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 20 }}>
                {([['scores', '📊 Section Scores'], ['entities', '🧬 Entity Extraction'], ['ats-report', '🤖 AI ATS Report']] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    style={{ flex: 1, padding: '9px', background: activeTab === id ? 'var(--bg3)' : 'transparent', color: activeTab === id ? 'var(--fg)' : 'var(--fg3)', fontFamily: 'var(--font-mono)', fontWeight: activeTab === id ? 700 : 400, fontSize: 11, border: 'none', cursor: 'pointer', borderRight: id !== 'ats-report' ? '1px solid var(--border)' : 'none', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Section Scores tab */}
              {activeTab === 'scores' && sectionScores && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                  {Object.entries(sectionScores).map(([sec, s]) => (
                    <div key={sec} className="card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize', color: 'var(--fg)' }}>{sec}</span>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor(s.hybrid) }}>{(s.hybrid * 100).toFixed(0)}%</span>
                          <span className="tag tag-gray" style={{ fontSize: 9 }}>{s.wordCount}w</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                        <ScoreRow label="Lexical" score={s.lexical} color="var(--cyan)" />
                        <ScoreRow label="Semantic" score={s.semantic} color="var(--amber)" />
                        <ScoreRow label="Hybrid" score={s.hybrid} color={scoreColor(s.hybrid)} bold />
                      </div>
                      {serverStatus?.geminiEnabled && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleAISuggestions(sec)} disabled={loadingSuggestions.has(sec)}
                            style={{ flex: 1, padding: '5px 8px', background: 'rgba(255,110,199,0.07)', border: '1px solid rgba(255,110,199,0.2)', color: 'var(--magenta)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            {loadingSuggestions.has(sec) ? <Spinner size={10} color="var(--magenta)" /> : '✦ AI Suggestions'}
                          </button>
                          <button onClick={() => handleGenerateImproved(sec)} disabled={loadingImproved.has(sec)}
                            style={{ flex: 1, padding: '5px 8px', background: 'rgba(57,255,107,0.07)', border: '1px solid rgba(57,255,107,0.2)', color: 'var(--green)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            {loadingImproved.has(sec) ? <Spinner size={10} color="var(--green)" /> : '✍ Rewrite'}
                          </button>
                        </div>
                      )}
                      {/* AI Suggestions */}
                      {aiSuggestions[sec] && !aiSuggestions[sec].error && (
                        <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,110,199,0.04)', border: '1px solid rgba(255,110,199,0.12)', borderRadius: 4, animation: 'fadeIn 0.3s ease' }}>
                          {Array.isArray(aiSuggestions[sec].weaknesses) && aiSuggestions[sec].weaknesses.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 10, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Weaknesses</div>
                              {aiSuggestions[sec].weaknesses.slice(0, 2).map((w: string, i: number) => <div key={i} style={{ fontSize: 11, color: 'var(--red)', marginBottom: 2 }}>• {w}</div>)}
                            </div>
                          )}
                          {Array.isArray(aiSuggestions[sec].suggestions) && aiSuggestions[sec].suggestions.slice(0, 2).map((sg: any, i: number) => (
                            <div key={i} style={{ marginBottom: 6, padding: '6px 8px', background: 'var(--bg3)', borderRadius: 4 }}>
                              <div style={{ fontSize: 10, color: 'var(--magenta)', fontWeight: 700, marginBottom: 3 }}>{sg.type} · {sg.priority}</div>
                              <div style={{ fontSize: 11, color: 'var(--fg2)', lineHeight: 1.5 }}>{sg.reason}</div>
                            </div>
                          ))}
                          {aiSuggestions[sec].atsNote && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 8, padding: '5px 8px', background: 'rgba(255,179,71,0.07)', borderRadius: 4 }}>💡 {aiSuggestions[sec].atsNote}</div>}
                        </div>
                      )}
                      {/* AI Rewritten Section */}
                      {improvedSections[sec] && (
                        <div style={{ marginTop: 10, padding: 12, background: 'rgba(57,255,107,0.04)', border: '1px solid rgba(57,255,107,0.15)', borderRadius: 4, animation: 'fadeIn 0.3s ease' }}>
                          <div style={{ fontSize: 10, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 700 }}>✍ AI Rewritten Version</div>
                          <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>{improvedSections[sec]}</div>
                          <button onClick={() => navigator.clipboard.writeText(improvedSections[sec])}
                            style={{ marginTop: 8, padding: '4px 10px', background: 'rgba(57,255,107,0.1)', border: '1px solid rgba(57,255,107,0.2)', color: 'var(--green)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700, borderRadius: 4, cursor: 'pointer' }}>
                            ⎘ Copy
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Entity Extraction tab */}
              {activeTab === 'entities' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  {[{ label: '📄 Resume Entities', data: resumeEntities, color: 'var(--cyan)' }, { label: '💼 JD Entities', data: jdEntities, color: 'var(--magenta)' }].map(({ label, data, color }) => (
                    <div key={label} className="card" style={{ padding: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 16 }}>{label}</div>
                      {data ? Object.entries(data).filter(([, vals]) => (vals as string[]).length > 0).map(([cat, vals]) => (
                        <div key={cat} style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg3)', marginBottom: 6 }}>{cat}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {(vals as string[]).map((v, i) => <span key={i} className="tag tag-gray" style={{ fontSize: 10 }}>{v}</span>)}
                          </div>
                        </div>
                      )) : <div style={{ fontSize: 12, color: 'var(--fg3)' }}>Run analysis to see entities</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* AI ATS Report tab */}
              {activeTab === 'ats-report' && (
                <div>
                  {!atsReport && (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                      <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 16 }}>Click "Full AI ATS Report" in the score panel to generate a comprehensive AI analysis.</div>
                      {!serverStatus?.geminiEnabled && <div style={{ fontSize: 12, color: 'var(--amber)' }}>⚠ Gemini AI not configured. Add GEMINI_API_KEY to backend .env</div>}
                    </div>
                  )}
                  {atsReport?.error && <div style={{ padding: '12px 16px', background: 'rgba(255,69,96,0.08)', border: '1px solid rgba(255,69,96,0.2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--red)' }}>⚠ {atsReport.error}</div>}
                  {atsReport && !atsReport.error && (
                    <div style={{ animation: 'fadeIn 0.4s ease' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '16px 20px', background: 'rgba(255,110,199,0.05)', border: '1px solid rgba(255,110,199,0.15)', borderRadius: 'var(--radius)' }}>
                        <span style={{ fontSize: 28 }}>🤖</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--magenta)', marginBottom: 4 }}>AI ATS Compatibility Report</div>
                          <div style={{ fontSize: 12, color: 'var(--fg2)', lineHeight: 1.6 }}>{atsReport.verdict}</div>
                        </div>
                        <span className={`tag tag-${atsReport.passLikelihood === 'high' ? 'green' : atsReport.passLikelihood === 'medium' ? 'amber' : 'red'}`} style={{ fontSize: 12 }}>{atsReport.passLikelihood} pass likelihood</span>
                      </div>
                      {Array.isArray(atsReport.criticalIssues) && atsReport.criticalIssues.length > 0 && (
                        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>⚠ Critical Issues</div>
                          {atsReport.criticalIssues.map((issue: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--fg2)', marginBottom: 5, paddingLeft: 12, borderLeft: '2px solid var(--red)' }}>{issue}</div>)}
                        </div>
                      )}
                      {Array.isArray(atsReport.quickWins) && atsReport.quickWins.length > 0 && (
                        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>✓ Quick Wins</div>
                          {atsReport.quickWins.map((win: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--fg2)', marginBottom: 5, paddingLeft: 12, borderLeft: '2px solid var(--green)' }}>{win}</div>)}
                        </div>
                      )}
                      {atsReport.keywordStrategy && (
                        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>🔑 Keyword Strategy</div>
                          <div style={{ fontSize: 12, color: 'var(--fg2)', lineHeight: 1.7 }}>{atsReport.keywordStrategy}</div>
                        </div>
                      )}
                      {Array.isArray(atsReport.formattingAdvice) && atsReport.formattingAdvice.length > 0 && (
                        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>📐 Formatting Advice</div>
                          {atsReport.formattingAdvice.map((a: string, i: number) => <div key={i} style={{ fontSize: 12, color: 'var(--fg2)', marginBottom: 5, paddingLeft: 12, borderLeft: '2px solid var(--blue)' }}>{a}</div>)}
                        </div>
                      )}
                      {atsReport.overallRecommendation && (
                        <div className="card" style={{ padding: 16, borderColor: 'rgba(255,110,199,0.2)' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--magenta)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>💬 Overall Recommendation</div>
                          <div style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.7 }}>{atsReport.overallRecommendation}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// =============================================
// LANDING PAGE
// =============================================
const FEATURES = [
  { id: 'search', icon: '◈', title: 'Hybrid Search Engine', tag: 'NLP · BM25 · AI', color: 'cyan', tagClass: 'tag-cyan', desc: 'BM25 lexical + n-gram semantic scoring with adjustable alpha blend, sort toggle (hybrid/lexical/semantic), JSON export, AI query intelligence & text correction suggestions.', path: '/app' },
  { id: 'resume', icon: '📋', title: 'Resume ATS Scorer', tag: 'NLP · IR · AI', color: 'magenta', tagClass: 'tag-magenta', desc: 'Drag & drop upload (PDF, DOCX, XLSX, CSV, JSON, TXT). Section-wise scores, Languages section, entity extraction, AI section rewriter, and full AI ATS compatibility report.', path: '/resume' },
  { id: 'anomaly', icon: '📊', title: 'Anomaly Detection', tag: 'ML · Real PC', color: 'blue', tagClass: 'tag-blue', desc: 'Z-score algorithm detects anomalies in your real PC metrics (CPU, Memory, Network) or manual cloud metric inputs.', path: '/anomaly' },
  { id: 'iot', icon: '📡', title: 'IoT Device Fleet', tag: 'IoT · Real PC', color: 'green', tagClass: 'tag-green', desc: 'Your real PC hardware is the first device! Live CPU, memory, temperature stream alongside 5 simulated cloud devices.', path: '/iot' },
];

function Landing() {
  const nav = useNavigate();
  const { user } = useAuth();
  const featureColors: Record<string, string> = { cyan: 'var(--cyan)', magenta: 'var(--magenta)', blue: 'var(--blue)', green: 'var(--green)' };
  const featureBg: Record<string, string> = { cyan: 'rgba(0,245,212,', magenta: 'rgba(255,110,199,', blue: 'rgba(77,159,255,', green: 'rgba(57,255,107,' };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <div className="grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.5 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 20% 0%, rgba(0,245,212,0.05) 0%, transparent 50%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% 100%, rgba(77,159,255,0.05) 0%, transparent 50%)' }} />
      </div>

      <nav style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 48px', borderBottom: '1px solid rgba(26,37,53,0.8)', backdropFilter: 'blur(10px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none"><circle cx="12" cy="12" r="8" stroke="#00f5d4" strokeWidth="2"/><line x1="18" y1="18" x2="25" y2="25" stroke="#00f5d4" strokeWidth="2.5" strokeLinecap="round"/><circle cx="12" cy="12" r="3" fill="rgba(0,245,212,0.3)"/></svg>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>SearchLens</span>
          
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {FEATURES.map(f => (
            <button key={f.id} onClick={() => nav(f.path)} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--fg2)', fontSize: 11, fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius)', cursor: 'pointer', fontWeight: 600 }}>
              {f.icon} {f.title.split(' ')[0]}
            </button>
          ))}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 8, borderLeft: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--fg2)' }}>👤 {user.name}</span>
            </div>
          ) : (
            <button onClick={() => nav('/login')} style={{ padding: '6px 16px', background: 'var(--cyan)', color: '#000', fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer' }}>Sign In →</button>
          )}
        </div>
      </nav>

      <section style={{ position: 'relative', zIndex: 5, maxWidth: 1100, margin: '0 auto', padding: '60px 48px 40px' }}>
        <div className="animate-fade-up" style={{ textAlign: 'center', marginBottom: 50 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            <span className="tag tag-cyan">Hybrid NLP Search</span>
            <span className="tag tag-magenta">Resume ATS Scorer</span>
            <span className="tag tag-blue">ML Anomaly Detection</span>
            <span className="tag tag-green">Real PC IoT Fleet</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(44px,5.5vw,80px)', lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: 20 }}>
          Hybrid Lexical and Semantic Matching<br /><span style={{ color: 'var(--cyan)' }}></span>
          </h1>
          <p style={{ fontSize: 15, color: 'var(--fg2)', lineHeight: 1.7, maxWidth: 600, margin: '0 auto 32px' }}>
            Real PC hardware as an IoT device · Live CPU/memory anomaly detection · AI-powered search · ATS resume analysis. All running live from <strong style={{ color: 'var(--cyan)' }}>your actual machine</strong>.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => nav(user ? '/app' : '/login')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 32px', background: 'var(--cyan)', color: '#000', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer' }}>
              {user ? '▶ Open Dashboard →' : '→ Get Started Free'}
            </button>
            {!user && <button onClick={() => nav('/login')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 24px', background: 'transparent', color: 'var(--fg2)', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14, borderRadius: 'var(--radius)', border: '1px solid var(--border)', cursor: 'pointer' }}>Demo: demo@searchlens.ai / demo123</button>}
          </div>
        </div>

       
        {/* Live Animated Demo */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
            Live Feature Preview
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {/* Demo: Search sort */}
            <div className="card" style={{ padding: 16, borderColor: 'rgba(0,245,212,0.15)' }}>
              <div style={{ fontSize: 10, color: 'var(--cyan)', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>◈ Sort Results</div>
              <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                {['Hybrid', 'Lexical', 'Semantic'].map((s, i) => (
                  <div key={s} style={{ flex: 1, padding: '4px', textAlign: 'center', fontSize: 9, fontFamily: 'var(--font-mono)', background: i === 0 ? 'rgba(0,245,212,0.12)' : 'transparent', color: i === 0 ? 'var(--cyan)' : 'var(--fg3)', fontWeight: i === 0 ? 700 : 400 }}>{s}</div>
                ))}
              </div>
              {[85, 62, 44].map((v, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 9, color: 'var(--fg3)', minWidth: 14 }}>#{i+1}</span>
                  <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2 }}><div style={{ width: `${v}%`, height: '100%', background: 'var(--cyan)', borderRadius: 2 }} /></div>
                  <span style={{ fontSize: 9, color: 'var(--cyan)', minWidth: 24 }}>{v}%</span>
                </div>
              ))}
              <div style={{ marginTop: 8, display: 'flex', gap: 5 }}>
                <span style={{ fontSize: 9, padding: '3px 7px', background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.2)', color: 'var(--cyan)', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>⤓ Export JSON</span>
                <span style={{ fontSize: 9, padding: '3px 7px', background: 'rgba(255,179,71,0.08)', border: '1px solid rgba(255,179,71,0.2)', color: 'var(--amber)', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>🤖 AI Fix</span>
              </div>
            </div>
            {/* Demo: AI Query Intelligence */}
            <div className="card" style={{ padding: 16, borderColor: 'rgba(255,179,71,0.15)' }}>
              <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>🤖 AI Query Intelligence</div>
              <div style={{ fontSize: 11, color: 'var(--fg3)', marginBottom: 6 }}>Query: <span style={{ color: 'var(--fg)' }}>"ml engineer jobs"</span></div>
              <div style={{ padding: '6px 10px', background: 'var(--bg3)', borderRadius: 4, marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'var(--fg3)', marginBottom: 3 }}>Rewritten →</div>
                <div style={{ fontSize: 11, color: 'var(--amber)' }}>"machine learning engineer positions remote"</div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--fg3)', marginBottom: 4 }}>Domain: <span style={{ color: 'var(--cyan)' }}>Recruitment</span> · Strength: <span style={{ color: 'var(--green)' }}>Strong</span></div>
              <div style={{ fontSize: 10, color: 'var(--fg3)', background: 'rgba(255,179,71,0.06)', padding: '5px 8px', borderRadius: 4 }}>💡 Add years of experience for better results</div>
            </div>
            {/* Demo: Resume Drag Drop + Entity */}
            <div className="card" style={{ padding: 16, borderColor: 'rgba(255,110,199,0.15)' }}>
              <div style={{ fontSize: 10, color: 'var(--magenta)', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>📋 Resume Features</div>
              <div style={{ padding: '8px 10px', border: '2px dashed rgba(255,110,199,0.3)', borderRadius: 4, textAlign: 'center', marginBottom: 10, fontSize: 11, color: 'var(--fg3)' }}>📎 Drag & Drop Resume Here</div>
              <div style={{ fontSize: 10, color: 'var(--fg3)', marginBottom: 5 }}>Detected Sections:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {['Summary', 'Experience', 'Skills', 'Languages', 'Certifications'].map(s => (
                  <span key={s} style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(255,110,199,0.08)', border: '1px solid rgba(255,110,199,0.2)', color: 'var(--magenta)', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>{s}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <span style={{ fontSize: 9, padding: '3px 7px', background: 'rgba(255,110,199,0.08)', border: '1px solid rgba(255,110,199,0.2)', color: 'var(--magenta)', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>✦ AI Suggestions</span>
                <span style={{ fontSize: 9, padding: '3px 7px', background: 'rgba(57,255,107,0.08)', border: '1px solid rgba(57,255,107,0.2)', color: 'var(--green)', borderRadius: 3, fontFamily: 'var(--font-mono)' }}>✍ Rewrite</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {FEATURES.map(f => (
            <div key={f.id} onClick={() => nav(user ? f.path : '/login')} className="card"
              style={{ padding: 24, cursor: 'pointer', transition: 'all 0.25s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = featureColors[f.color]; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.transform = ''; }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 28 }}>{f.icon}</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{f.title}</div>
                  <span className={`tag ${f.tagClass}`} style={{ marginTop: 4, display: 'inline-block' }}>{f.tag}</span>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 18, color: featureColors[f.color] }}>→</div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--fg2)', lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ position: 'relative', zIndex: 5, padding: '20px 48px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg2)' }}>
          <svg width="18" height="18" viewBox="0 0 28 28" fill="none"><circle cx="12" cy="12" r="8" stroke="#00f5d4" strokeWidth="2"/><line x1="18" y1="18" x2="25" y2="25" stroke="#00f5d4" strokeWidth="2.5" strokeLinecap="round"/></svg>
          SearchLens
        </div>
        <p style={{ fontSize: 11, color: 'var(--fg3)' }}>Sort · Export · AI Query Intel · AI Rewriter · Drag&Drop · Languages · Entity Extraction · ATS Report</p>
      </footer>
    </div>
  );
}

// =============================================
// ROOT APP WITH AUTH
// =============================================
function AppWithStatus() {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  useEffect(() => {
    api.health().then(s => setServerStatus(s)).catch(() => setServerStatus({ status: 'offline', geminiEnabled: false, features: {} }));
  }, []);
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Landing /></ProtectedRoute>} />
      <Route path="/app" element={<ProtectedRoute><SearchApp /></ProtectedRoute>} />
      <Route path="/resume" element={<ProtectedRoute><ResumeApp /></ProtectedRoute>} />
      <Route path="/anomaly" element={<ProtectedRoute><AnomalyPage serverStatus={serverStatus} /></ProtectedRoute>} />
      <Route path="/iot" element={<ProtectedRoute><IoTPage serverStatus={serverStatus} /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = GLOBAL_STYLES;
    document.head.appendChild(style);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
    return () => { document.head.removeChild(style); };
  }, []);
  return <BrowserRouter><AuthProvider><AppWithStatus /></AuthProvider></BrowserRouter>;
}
