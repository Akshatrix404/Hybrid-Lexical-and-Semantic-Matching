import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'searchlens_dev_secret_2024';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// =============================================
// SYSTEMINFORMATION - real PC metrics
// =============================================
let si;
try {
  si = await import('systeminformation');
} catch (e) {
  console.warn('systeminformation not available, using OS fallback');
  si = null;
}

// =============================================
// GEMINI AI
// =============================================
const geminiEnabled = !!process.env.GEMINI_API_KEY;
let genAI, model;
if (geminiEnabled) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

// =============================================
// IN-MEMORY USER STORE (demo - use DB in prod)
// =============================================
const users = new Map();

// Pre-seed a demo user
const demoHash = await bcrypt.hash('demo123', 10);
users.set('demo@searchlens.ai', {
  id: '1',
  email: 'demo@searchlens.ai',
  name: 'Demo User',
  passwordHash: demoHash,
  createdAt: new Date().toISOString(),
});

// =============================================
// AUTH MIDDLEWARE
// =============================================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// =============================================
// AUTH ROUTES
// =============================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (users.has(email)) return res.status(409).json({ error: 'Email already registered' });
    const passwordHash = await bcrypt.hash(password, 10);
    const id = Date.now().toString();
    users.set(email, { id, email, name, passwordHash, createdAt: new Date().toISOString() });
    const token = jwt.sign({ id, email, name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id, email, name } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = users.get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// =============================================
// REAL PC METRICS COLLECTION
// =============================================
async function getRealPCMetrics() {
  const metrics = {};

  // --- CPU ---
  try {
    if (si?.currentLoad) {
      const load = await si.currentLoad();
      metrics.cpu = {
        usage: parseFloat(load.currentLoad?.toFixed(1) ?? '0'),
        user: parseFloat(load.currentLoadUser?.toFixed(1) ?? '0'),
        system: parseFloat(load.currentLoadSystem?.toFixed(1) ?? '0'),
        cores: load.cpus?.map((c, i) => ({
          core: i,
          load: parseFloat(c.load?.toFixed(1) ?? '0'),
        })) ?? [],
      };
    } else throw new Error('si not available');
  } catch {
    // OS fallback
    const cpus = os.cpus();
    const totalIdle = cpus.reduce((s, c) => s + c.times.idle, 0);
    const totalTick = cpus.reduce((s, c) => s + Object.values(c.times).reduce((a, b) => a + b, 0), 0);
    const usage = 100 - (totalIdle / totalTick) * 100;
    metrics.cpu = {
      usage: parseFloat(usage.toFixed(1)),
      user: parseFloat((usage * 0.7).toFixed(1)),
      system: parseFloat((usage * 0.3).toFixed(1)),
      cores: cpus.map((c, i) => {
        const total = Object.values(c.times).reduce((a, b) => a + b, 0);
        return { core: i, load: parseFloat((100 - (c.times.idle / total) * 100).toFixed(1)) };
      }),
    };
  }

  // --- Memory ---
  try {
    if (si?.mem) {
      const mem = await si.mem();
      metrics.memory = {
        total: mem.total,
        used: mem.used,
        free: mem.free,
        active: mem.active,
        available: mem.available,
        usagePercent: parseFloat(((mem.used / mem.total) * 100).toFixed(1)),
        swapTotal: mem.swaptotal,
        swapUsed: mem.swapused,
        swapPercent: mem.swaptotal > 0 ? parseFloat(((mem.swapused / mem.swaptotal) * 100).toFixed(1)) : 0,
      };
    } else throw new Error('si not available');
  } catch {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    metrics.memory = {
      total,
      used,
      free,
      active: used,
      available: free,
      usagePercent: parseFloat(((used / total) * 100).toFixed(1)),
      swapTotal: 0,
      swapUsed: 0,
      swapPercent: 0,
    };
  }

  // --- Disk ---
  try {
    if (si?.fsSize) {
      const disks = await si.fsSize();
      metrics.disk = disks.slice(0, 4).map(d => ({
        fs: d.fs,
        type: d.type,
        mount: d.mount,
        size: d.size,
        used: d.used,
        available: d.available,
        usePercent: parseFloat(d.use?.toFixed(1) ?? '0'),
      }));
    } else throw new Error('si not available');
  } catch {
    metrics.disk = [{
      fs: 'unknown',
      type: 'unknown',
      mount: '/',
      size: 0,
      used: 0,
      available: 0,
      usePercent: 0,
    }];
  }

  // --- Network ---
  try {
    if (si?.networkStats) {
      const nets = await si.networkStats();
      metrics.network = nets.slice(0, 4).filter(n => n.iface).map(n => ({
        iface: n.iface,
        rxBytes: n.rx_bytes,
        txBytes: n.tx_bytes,
        rxSec: Math.max(0, n.rx_sec ?? 0),
        txSec: Math.max(0, n.tx_sec ?? 0),
        rxDropped: n.rx_dropped ?? 0,
        txDropped: n.tx_dropped ?? 0,
      }));
    } else throw new Error('si not available');
  } catch {
    const nets = os.networkInterfaces();
    metrics.network = Object.entries(nets).slice(0, 3).map(([iface]) => ({
      iface,
      rxBytes: 0,
      txBytes: 0,
      rxSec: 0,
      txSec: 0,
      rxDropped: 0,
      txDropped: 0,
    }));
  }

  // --- Temperature ---
  try {
    if (si?.cpuTemperature) {
      const temp = await si.cpuTemperature();
      metrics.temperature = {
        main: temp.main ?? null,
        cores: temp.cores ?? [],
        max: temp.max ?? null,
        socket: temp.socket ?? [],
      };
    } else throw new Error('si not available');
  } catch {
    metrics.temperature = { main: null, cores: [], max: null, socket: [] };
  }

  // --- Process count ---
  try {
    if (si?.processes) {
      const procs = await si.processes();
      metrics.processes = {
        all: procs.all,
        running: procs.running,
        blocked: procs.blocked,
        sleeping: procs.sleeping,
      };
    } else throw new Error('si not available');
  } catch {
    metrics.processes = { all: 0, running: 0, blocked: 0, sleeping: 0 };
  }

  // --- System uptime & basic info ---
  metrics.system = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
    loadAvg: os.loadavg(),
    nodeVersion: process.version,
  };

  metrics.timestamp = new Date().toISOString();
  return metrics;
}

// =============================================
// PC METRICS ENDPOINT
// =============================================
app.get('/api/pc/metrics', authMiddleware, async (req, res) => {
  try {
    const metrics = await getRealPCMetrics();
    res.json(metrics);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Streaming SSE for real-time PC metrics
app.get('/api/pc/stream', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const send = async () => {
    try {
      const metrics = await getRealPCMetrics();
      res.write(`data: ${JSON.stringify(metrics)}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    }
  };

  send();
  const interval = setInterval(send, 2000);
  req.on('close', () => clearInterval(interval));
});

// =============================================
// NLP UTILITIES (unchanged from v2.2)
// =============================================
function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

const STOPWORDS = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','was','are','were','be','been','has','have','had','do','does','did','will','would','could','should','may','might','shall','can','this','that','these','those','it','its','i','we','you','he','she','they','my','our','your','his','her','their','me','us','him','them','not','so','as','if','up','out','about','into','than','then','when','where','who','which','what','how','all','also','more','other','some','such','no','only','just','like','very','well','over','after','before','between']);

function removeStopwords(tokens) { return tokens.filter(t => !STOPWORDS.has(t)); }

function computeBM25(query, documents) {
  const k1 = 1.5, b = 0.75;
  const qTokens = removeStopwords(tokenize(query));
  const docTokens = documents.map(d => tokenize(d));
  const avgdl = docTokens.reduce((s, d) => s + d.length, 0) / (docTokens.length || 1);
  const df = {};
  for (const tokens of docTokens) for (const t of new Set(tokens)) df[t] = (df[t] || 0) + 1;
  const N = documents.length;
  return documents.map((doc, i) => {
    const tf = {};
    for (const t of docTokens[i]) tf[t] = (tf[t] || 0) + 1;
    let score = 0;
    for (const term of qTokens) {
      const idf = Math.log((N - (df[term] || 0) + 0.5) / ((df[term] || 0) + 0.5) + 1);
      const tfVal = tf[term] || 0;
      score += idf * (tfVal * (k1 + 1)) / (tfVal + k1 * (1 - b + b * docTokens[i].length / avgdl));
    }
    return score;
  });
}

function computeNgrams(text, n) {
  const tokens = removeStopwords(tokenize(text));
  const ngrams = new Set();
  for (let i = 0; i <= tokens.length - n; i++) ngrams.add(tokens.slice(i, i + n).join(' '));
  return ngrams;
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function computeSemantic(query, doc) {
  let score = 0;
  for (let n = 1; n <= 3; n++) {
    const j = jaccardSimilarity(computeNgrams(query, n), computeNgrams(doc, n));
    score += j * (n === 1 ? 0.5 : n === 2 ? 0.3 : 0.2);
  }
  return Math.min(score * 2.5, 1);
}

const NER_PATTERNS = {
  persons: [/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g],
  organizations: [/\b[A-Z][A-Z&]+\b/g, /\b(?:Inc|Corp|Ltd|LLC|University|Institute|Company|Foundation)\b/g],
  technologies: [/\b(?:React|Vue|Angular|Node|Python|Java|TypeScript|JavaScript|AWS|Azure|GCP|Docker|Kubernetes|ML|AI|NLP|API|SQL|NoSQL|MongoDB|PostgreSQL|Redis|GraphQL|REST|FastAPI|Flask|Django|Spring|TensorFlow|PyTorch|Scikit|OpenAI|Gemini|LLM|GPT|BERT|CSS|HTML|Linux|Git|GitHub|CI\/CD|DevOps|Cloud|IoT|Edge)\b/gi],
  locations: [/\b(?:New York|San Francisco|London|Tokyo|Berlin|Paris|Singapore|Mumbai|Remote|Hybrid)\b/gi],
  dates: [/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}\b/gi, /\b20\d{2}\b/g],
  education: [/\b(?:Bachelor|Master|PhD|B\.S\.|M\.S\.|MBA|B\.Tech|M\.Tech)\b/gi],
  certifications: [/\b(?:AWS Certified|Google Certified|PMP|CPA|CISSP|CCNA|Azure Certified|Scrum Master)\b/gi],
};

function extractEntities(text) {
  const result = {};
  for (const [cat, patterns] of Object.entries(NER_PATTERNS)) {
    const found = new Set();
    for (const pat of patterns) {
      const matches = text.match(new RegExp(pat.source, pat.flags)) || [];
      matches.forEach(m => found.add(m.trim()));
    }
    result[cat] = [...found].slice(0, 10);
  }
  return result;
}

const SYNONYMS = {
  'machine learning': ['ml', 'ai', 'artificial intelligence', 'deep learning', 'neural network'],
  'natural language processing': ['nlp', 'text analysis', 'language model'],
  'software engineer': ['developer', 'programmer', 'software developer', 'coder'],
  'cloud computing': ['aws', 'azure', 'gcp', 'cloud infrastructure', 'serverless'],
  'iot': ['internet of things', 'edge computing', 'embedded systems', 'sensors'],
  'anomaly': ['outlier', 'spike', 'deviation', 'irregularity'],
  'data': ['dataset', 'information', 'analytics', 'metrics'],
  'search': ['retrieval', 'query', 'lookup', 'find', 'discover'],
};

function expandQuery(query) {
  const tokens = tokenize(query);
  const expanded = new Set(tokens);
  const expansions = [];
  for (const [term, syns] of Object.entries(SYNONYMS)) {
    const termTokens = tokenize(term);
    if (termTokens.some(t => tokens.includes(t))) {
      for (const syn of syns) { tokenize(syn).forEach(t => expanded.add(t)); expansions.push({ original: term, synonym: syn }); }
    }
  }
  return { originalTokens: tokens, expandedTokens: [...expanded], expansions, expandedQuery: [...expanded].join(' ') };
}

function normalize(scores) {
  const max = Math.max(...scores, 0.001);
  return scores.map(s => Math.min(s / max, 1));
}

// =============================================
// RESUME UTILITIES
// =============================================
async function extractTextFromBuffer(buffer, mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (mimetype === 'application/pdf' || ext === '.pdf') {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdfParse(buffer);
    return data.text;
  }
  if (ext === '.docx' || ext === '.doc') {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
    const XLSX = (await import('xlsx')).default;
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let text = '';
    for (const sheetName of workbook.SheetNames) text += XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]) + '\n';
    return text;
  }
  if (ext === '.json') return JSON.stringify(JSON.parse(buffer.toString('utf8')), null, 2).replace(/[{}"[\]]/g, ' ');
  return buffer.toString('utf8');
}

function parseResumeSections(text) {
  const sectionHeaders = {
    summary: /\b(summary|objective|profile|about|overview|professional summary)\b/i,
    experience: /\b(experience|work experience|employment|work history|career)\b/i,
    education: /\b(education|academic|qualifications|degrees?|university|college)\b/i,
    skills: /\b(skills|technical skills|core competencies|technologies|tools)\b/i,
    projects: /\b(projects|portfolio|notable projects|key projects)\b/i,
    certifications: /\b(certifications?|certificates?|licenses?|credentials|awards?)\b/i,
    contact: /\b(contact|personal info|phone|email|address|linkedin|github)\b/i,
  };
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sections = {};
  let currentSection = 'general', currentLines = [];
  for (const line of lines) {
    let matched = false;
    for (const [sec, pat] of Object.entries(sectionHeaders)) {
      if (pat.test(line) && line.length < 60) {
        if (currentLines.length > 0) sections[currentSection] = (sections[currentSection] || '') + '\n' + currentLines.join('\n');
        currentSection = sec; currentLines = []; matched = true; break;
      }
    }
    if (!matched) currentLines.push(line);
  }
  if (currentLines.length > 0) sections[currentSection] = (sections[currentSection] || '') + '\n' + currentLines.join('\n');
  return sections;
}

function computeSectionScores(sections, jobDescription) {
  const sectionScores = {};
  for (const [sec, text] of Object.entries(sections)) {
    if (!text || text.trim().length < 10) continue;
    const lex = computeBM25(jobDescription, [text])[0];
    const sem = computeSemantic(jobDescription, text);
    sectionScores[sec] = { lexical: Math.min(lex / 3, 1), semantic: sem, hybrid: Math.min(lex / 3, 1) * 0.4 + sem * 0.6, wordCount: text.split(/\s+/).filter(Boolean).length, text: text.trim().slice(0, 500) };
  }
  return sectionScores;
}

function computeOverallATSScore(resumeText, jobDescription) {
  const lexScore = Math.min(computeBM25(jobDescription, [resumeText])[0] / 5, 1);
  const semScore = computeSemantic(jobDescription, resumeText);
  const hybrid = lexScore * 0.4 + semScore * 0.6;
  const jdTokens = new Set(removeStopwords(tokenize(jobDescription)));
  const resumeTokens = new Set(removeStopwords(tokenize(resumeText)));
  const matched = [...jdTokens].filter(t => resumeTokens.has(t));
  const keywordScore = matched.length / Math.max(jdTokens.size, 1);
  const atsScore = (hybrid * 0.5 + keywordScore * 0.5) * 100;
  return { atsScore: Math.round(Math.min(atsScore, 100)), lexicalScore: Math.round(lexScore * 100), semanticScore: Math.round(semScore * 100), hybridScore: Math.round(hybrid * 100), keywordScore: Math.round(keywordScore * 100), matchedKeywords: matched.slice(0, 30), missingKeywords: [...jdTokens].filter(t => !resumeTokens.has(t)).slice(0, 20), totalJDKeywords: jdTokens.size, totalMatched: matched.length };
}

// =============================================
// ANOMALY DETECTION - now reads REAL PC metrics
// =============================================
function detectAnomalies(values, threshold = 2.5) {
  const n = values.length;
  if (n < 3) return values.map((v, i) => ({ index: i, value: v, isAnomaly: false, zScore: 0, severity: 'normal' }));
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance) || 1;
  return values.map((v, i) => {
    const zScore = Math.abs((v - mean) / stdDev);
    const isAnomaly = zScore > threshold;
    const severity = zScore > threshold * 1.5 ? 'critical' : zScore > threshold ? 'warning' : 'normal';
    return { index: i, value: v, zScore: parseFloat(zScore.toFixed(3)), isAnomaly, severity, mean: parseFloat(mean.toFixed(2)), stdDev: parseFloat(stdDev.toFixed(2)), deviation: parseFloat((v - mean).toFixed(2)) };
  });
}

function analyzeMetrics(metricsData) {
  const results = {};
  for (const [metric, values] of Object.entries(metricsData)) {
    const anomalies = detectAnomalies(values);
    const anomalyCount = anomalies.filter(a => a.isAnomaly).length;
    const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    results[metric] = { values, anomalies, stats: { mean: parseFloat(mean.toFixed(2)), max, min, anomalyCount, criticalCount, anomalyRate: parseFloat(((anomalyCount / values.length) * 100).toFixed(1)) } };
  }
  return results;
}

// Buffer for rolling real PC metric history (for anomaly detection)
const pcMetricHistory = {
  CPU: [],
  Memory: [],
  Latency: [],
  Network: [],
};
const MAX_HISTORY = 30;

async function collectPCMetricSample() {
  try {
    const m = await getRealPCMetrics();
    pcMetricHistory.CPU.push(parseFloat(m.cpu.usage.toFixed(1)));
    pcMetricHistory.Memory.push(parseFloat(m.memory.usagePercent.toFixed(1)));
    // Estimate latency from load avg
    const latency = parseFloat((m.system.loadAvg[0] * 10 + Math.random() * 5).toFixed(1));
    pcMetricHistory.Latency.push(latency);
    // Network throughput KB/s (sum all interfaces)
    const netKBps = m.network.reduce((s, n) => s + (n.rxSec + n.txSec) / 1024, 0);
    pcMetricHistory.Network.push(parseFloat(netKBps.toFixed(1)));
    // Keep rolling window
    for (const k of Object.keys(pcMetricHistory)) {
      if (pcMetricHistory[k].length > MAX_HISTORY) pcMetricHistory[k].shift();
    }
  } catch {}
}

// Collect every 3s
setInterval(collectPCMetricSample, 3000);
collectPCMetricSample();

// =============================================
// HEALTH
// =============================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', geminiEnabled, features: { ner: true, expansion: true, hybrid: true, resumeAnalysis: true, anomalyDetection: true, iotSimulator: true, realPCMetrics: !!si, auth: true } });
});

// =============================================
// SEARCH ENDPOINTS (auth protected)
// =============================================
app.post('/api/analyze', authMiddleware, (req, res) => {
  try {
    const { query, documents, alpha = 0.5 } = req.body;
    if (!query || !documents?.length) return res.status(400).json({ error: 'query and documents required' });
    const lexNorm = normalize(computeBM25(query, documents));
    const semScores = documents.map(d => computeSemantic(query, d));
    const queryEntities = extractEntities(query);
    const queryExpansion = expandQuery(query);
    const results = documents.map((doc, i) => {
      const docEntities = extractEntities(doc);
      const qKeys = Object.values(queryEntities).flat();
      const dKeys = Object.values(docEntities).flat();
      const entityScore = qKeys.filter(k => dKeys.includes(k)).length / Math.max(qKeys.length, 1);
      const hybridScore = (1 - alpha) * lexNorm[i] + alpha * semScores[i] + entityScore * 0.1;
      return { id: i, text: doc, lexicalScore: +lexNorm[i].toFixed(4), semanticScore: +semScores[i].toFixed(4), hybridScore: +Math.min(hybridScore, 1).toFixed(4), entityScore: +entityScore.toFixed(4), entities: docEntities, winner: lexNorm[i] > semScores[i] ? 'lexical' : 'semantic' };
    }).sort((a, b) => b.hybridScore - a.hybridScore);
    const scores = results.map(r => r.hybridScore);
    res.json({ results, queryEntities, queryExpansion, meta: { totalDocuments: documents.length, topScore: scores[0] || 0, avgScore: scores.reduce((s, v) => s + v, 0) / (scores.length || 1), alpha } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/entities', authMiddleware, (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  res.json(extractEntities(text));
});

app.post('/api/expand', authMiddleware, (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });
  res.json(expandQuery(query));
});

// =============================================
// AI ENDPOINTS
// =============================================
async function callGemini(prompt) {
  if (!geminiEnabled) throw new Error('Gemini API key not configured');
  const result = await model.generateContent(prompt);
  return result.response.text();
}

app.post('/api/ai/explain-scores', authMiddleware, async (req, res) => {
  try {
    const { query, document, scores } = req.body;
    const prompt = `Analyze why this document scored as it did for the given search query. Return ONLY valid JSON.
Query: "${query}"
Document: "${document}"
Scores: Lexical=${scores.lexical.toFixed(2)}, Semantic=${scores.semantic.toFixed(2)}, Hybrid=${scores.hybrid.toFixed(2)}
Return JSON with: headline(string), verdict(excellent|good|moderate|weak|poor), lexicalExplanation, semanticExplanation, keyMatchingTerms(array), improvementTip`;
    const raw = await callGemini(prompt);
    res.json(JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/suggest-corrections', authMiddleware, async (req, res) => {
  try {
    const { text, corpusDocuments, lexicalScore, semanticScore } = req.body;
    const prompt = `Analyze this text and suggest improvements. Return ONLY valid JSON.
Text: "${text}"
Corpus context: ${corpusDocuments.slice(0, 3).map((d, i) => `[${i + 1}] ${d}`).join('\n')}
Scores: Lexical=${lexicalScore.toFixed(2)}, Semantic=${semanticScore.toFixed(2)}
Return JSON with: analysis(string), overallImprovementPotential(high|medium|low), suggestions(array of {original,suggested,type,reason,confidence,scoreImpact}), improvedText(string)`;
    const raw = await callGemini(prompt);
    res.json(JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/analyze-query', authMiddleware, async (req, res) => {
  try {
    const { query, corpusDocuments } = req.body;
    const prompt = `Analyze this search query. Return ONLY valid JSON.
Query: "${query}"
Corpus: ${corpusDocuments.slice(0, 5).join(' | ')}
Return JSON with: queryType, queryStrength(strong|moderate|weak), domainDetected, issues(array), rewrittenQuery, keyTerms(array), alternativeQueries(array of 3), searchTip`;
    const raw = await callGemini(prompt);
    res.json(JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================
// RESUME ENDPOINTS
// =============================================
app.post('/api/resume/extract', authMiddleware, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const text = await extractTextFromBuffer(req.file.buffer, req.file.mimetype, req.file.originalname);
    const sections = parseResumeSections(text);
    res.json({ text, sections, wordCount: text.split(/\s+/).filter(Boolean).length });
  } catch (e) { res.status(500).json({ error: 'Failed to extract: ' + e.message }); }
});

app.post('/api/resume/analyze', authMiddleware, upload.single('resume'), async (req, res) => {
  try {
    let resumeText = req.body.resumeText;
    let sections = req.body.sections ? JSON.parse(req.body.sections) : null;
    if (req.file) { resumeText = await extractTextFromBuffer(req.file.buffer, req.file.mimetype, req.file.originalname); sections = parseResumeSections(resumeText); }
    if (!resumeText) return res.status(400).json({ error: 'Resume text or file required' });
    if (!req.body.jobDescription) return res.status(400).json({ error: 'Job description required' });
    if (!sections) sections = parseResumeSections(resumeText);
    const sectionScores = computeSectionScores(sections, req.body.jobDescription);
    const atsData = computeOverallATSScore(resumeText, req.body.jobDescription);
    const resumeEntities = extractEntities(resumeText);
    const jdEntities = extractEntities(req.body.jobDescription);
    res.json({ sectionScores, atsData, resumeEntities, jdEntities, sections });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/resume/ai-suggestions', authMiddleware, async (req, res) => {
  try {
    const { sectionName, sectionText, jobDescription, sectionScores } = req.body;
    const scores = sectionScores[sectionName] || {};
    const prompt = `You are a professional resume coach. Analyze this resume section against the job description. Return ONLY valid JSON.
Section: ${sectionName.toUpperCase()}
Content: "${sectionText}"
Job Description: "${jobDescription}"
Scores: Lexical=${((scores.lexical || 0) * 100).toFixed(0)}%, Semantic=${((scores.semantic || 0) * 100).toFixed(0)}%
Return JSON: { strengths: [], weaknesses: [], keywordGaps: [], suggestions: [{type,priority,original,suggested,reason,impact}], improvedVersion: string, atsNote: string }`;
    const raw = await callGemini(prompt);
    res.json(JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/resume/ats-report', authMiddleware, async (req, res) => {
  try {
    const { resumeText, jobDescription, atsData } = req.body;
    const prompt = `You are an ATS expert. Generate a comprehensive ATS compatibility report. Return ONLY valid JSON.
Resume (first 1500 chars): "${resumeText.slice(0, 1500)}"
Job Description: "${jobDescription.slice(0, 1000)}"
ATS Score: ${atsData.atsScore}%
Matched: ${atsData.matchedKeywords.join(', ')}
Missing: ${atsData.missingKeywords.join(', ')}
Return JSON: { verdict: string, passLikelihood: high|medium|low, criticalIssues: [], quickWins: [], keywordStrategy: string, formattingAdvice: [], overallRecommendation: string }`;
    const raw = await callGemini(prompt);
    res.json(JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================
// ANOMALY DETECTION - uses REAL PC metric history
// =============================================
app.post('/api/anomaly/analyze', authMiddleware, (req, res) => {
  try {
    const { metricsData, threshold, useRealPC } = req.body;
    let data = metricsData;

    // If useRealPC flag, merge in real PC history
    if (useRealPC) {
      data = { ...metricsData };
      if (pcMetricHistory.CPU.length >= 3) data['CPU (Real)'] = [...pcMetricHistory.CPU];
      if (pcMetricHistory.Memory.length >= 3) data['Memory (Real)'] = [...pcMetricHistory.Memory];
      if (pcMetricHistory.Network.length >= 3) data['Network KB/s (Real)'] = [...pcMetricHistory.Network];
    }

    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'metricsData object required' });
    const results = analyzeMetrics(data);
    const totalAnomalies = Object.values(results).reduce((sum, r) => sum + r.stats.anomalyCount, 0);
    const overallHealth = totalAnomalies === 0 ? 'healthy' : totalAnomalies <= 3 ? 'warning' : 'critical';
    res.json({ results, summary: { totalAnomalies, overallHealth, metricsAnalyzed: Object.keys(results).length } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/anomaly/pc-history', authMiddleware, (req, res) => {
  res.json({ history: pcMetricHistory, samples: pcMetricHistory.CPU.length });
});

app.post('/api/anomaly/ai-report', authMiddleware, async (req, res) => {
  try {
    const { analysisResults, metricName } = req.body;
    const metricData = analysisResults[metricName];
    if (!metricData) return res.status(400).json({ error: 'Metric not found' });
    const prompt = `You are a cloud infrastructure monitoring expert. Analyze these ${metricName} anomalies and provide insights. Return ONLY valid JSON.
Metric: ${metricName}
Stats: mean=${metricData.stats.mean}, max=${metricData.stats.max}, min=${metricData.stats.min}
Anomaly Rate: ${metricData.stats.anomalyRate}%
Anomalies: ${JSON.stringify(metricData.anomalies.filter(a => a.isAnomaly).slice(0, 10))}
Return JSON: { rootCause: string, impact: string, recommendations: [], urgency: low|medium|high|critical, predictedTrend: string, alertMessage: string }`;
    const raw = await callGemini(prompt);
    res.json(JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================
// IOT FLEET - uses REAL PC metrics as primary device
// =============================================
const generateDeviceTelemetry = (deviceId, deviceType, prevState, realMetrics) => {
  const noise = () => (Math.random() - 0.5) * 10;
  const spike = () => Math.random() > 0.92 ? (Math.random() > 0.5 ? 40 : -20) : 0;
  const baseValues = {
    'server': { cpu: 45, memory: 62, temperature: 58, network: 85, latency: 12 },
    'edge-sensor': { cpu: 28, memory: 41, temperature: 42, network: 92, latency: 8 },
    'gateway': { cpu: 35, memory: 55, temperature: 48, network: 78, latency: 15 },
    'database': { cpu: 67, memory: 78, temperature: 65, network: 70, latency: 22 },
    'loadbalancer': { cpu: 52, memory: 48, temperature: 52, network: 95, latency: 5 },
    'monitor': { cpu: 22, memory: 35, temperature: 38, network: 88, latency: 10 },
  };
  const base = baseValues[deviceType] || baseValues['server'];
  const prev = prevState || base;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  let newState;

  // If this is the "host" device and we have real PC metrics, use them directly
  if (deviceId === 'host-pc' && realMetrics) {
    newState = {
      cpu: clamp(realMetrics.cpu.usage, 0, 100),
      memory: clamp(realMetrics.memory.usagePercent, 0, 100),
      temperature: realMetrics.temperature?.main ?? clamp(45 + realMetrics.cpu.usage * 0.4 + noise() * 0.5, 20, 95),
      network: clamp(Math.min(realMetrics.network.reduce((s, n) => s + (n.rxSec + n.txSec) / 1024 / 10, 0) * 100, 100), 0, 100),
      latency: clamp(realMetrics.system.loadAvg[0] * 5 + 5 + Math.random() * 3, 1, 200),
      processes: realMetrics.processes?.running ?? 0,
      loadAvg: realMetrics.system.loadAvg[0].toFixed(2),
      uptime: realMetrics.system.uptime,
      isRealData: true,
    };
  } else {
    newState = {
      cpu: clamp(prev.cpu + noise() + spike(), 0, 100),
      memory: clamp(prev.memory + noise() * 0.5, 0, 100),
      temperature: clamp(prev.temperature + noise() * 0.3, 20, 100),
      network: clamp(prev.network + noise() * 0.8, 0, 100),
      latency: clamp(prev.latency + noise() * 0.5 + (Math.random() > 0.95 ? 50 : 0), 1, 200),
      isRealData: false,
    };
  }

  const isOffline = deviceId !== 'host-pc' && Math.random() > 0.97;
  const isDegraded = !isOffline && (newState.cpu > 85 || newState.memory > 90 || newState.temperature > 80);
  const status = isOffline ? 'offline' : isDegraded ? 'degraded' : 'online';
  return { ...newState, status, timestamp: new Date().toISOString(), alerts: isDegraded ? [`High ${newState.cpu > 85 ? 'CPU' : newState.memory > 90 ? 'Memory' : 'Temperature'} on ${deviceId}`] : [] };
};

const devices = [
  { id: 'host-pc', name: 'Host PC (Your Machine)', type: 'server', location: os.hostname(), isRealDevice: true },
  { id: 'edge-01', name: 'Edge Sensor Beta', type: 'edge-sensor', location: 'EU-West' },
  { id: 'gw-01', name: 'Network Gateway', type: 'gateway', location: 'AP-South' },
  { id: 'db-01', name: 'Database Cluster', type: 'database', location: 'US-West' },
  { id: 'lb-01', name: 'Load Balancer', type: 'loadbalancer', location: 'EU-Central' },
  { id: 'mon-01', name: 'Monitor Node', type: 'monitor', location: 'AP-East' },
];

let deviceStates = {};

app.get('/api/iot/devices', authMiddleware, (req, res) => {
  res.json({ devices });
});

app.get('/api/iot/telemetry', authMiddleware, async (req, res) => {
  let realMetrics = null;
  try {
    realMetrics = await getRealPCMetrics();
  } catch {}

  const telemetry = {};
  for (const device of devices) {
    const newState = generateDeviceTelemetry(device.id, device.type, deviceStates[device.id], device.isRealDevice ? realMetrics : null);
    deviceStates[device.id] = newState;
    telemetry[device.id] = { ...device, telemetry: newState };
  }

  const online = Object.values(telemetry).filter(d => d.telemetry.status === 'online').length;
  const degraded = Object.values(telemetry).filter(d => d.telemetry.status === 'degraded').length;
  const offline = Object.values(telemetry).filter(d => d.telemetry.status === 'offline').length;
  const allAlerts = Object.values(telemetry).flatMap(d => d.telemetry.alerts.map(a => ({ device: d.name, message: a, time: new Date().toISOString(), isReal: d.isRealDevice ?? false })));
  res.json({ devices: telemetry, summary: { total: devices.length, online, degraded, offline }, alerts: allAlerts, hasRealMetrics: !!realMetrics });
});

app.post('/api/iot/command', authMiddleware, (req, res) => {
  const { deviceId, command } = req.body;
  if (!deviceId || !command) return res.status(400).json({ error: 'deviceId and command required' });

  // For host-pc, commands are informational
  if (deviceId === 'host-pc') {
    const pcResponses = {
      ping: { success: true, message: `Host PC responded in ${(Math.random() * 2 + 0.5).toFixed(1)}ms — Real hardware`, latency: parseFloat((Math.random() * 2 + 0.5).toFixed(1)) },
      restart: { success: false, message: 'Cannot restart host PC via dashboard (safety lock enabled)', newStatus: 'online' },
      shutdown: { success: false, message: 'Cannot shutdown host PC via dashboard (safety lock enabled)', newStatus: 'online' },
    };
    return res.json(pcResponses[command] || { success: false, message: 'Unknown command' });
  }

  const responses = {
    restart: { success: true, message: `Device ${deviceId} restarted successfully`, newStatus: 'online' },
    reset: { success: true, message: `Device ${deviceId} configuration reset`, newStatus: 'online' },
    ping: { success: true, message: `Device ${deviceId} responded to ping`, latency: Math.floor(Math.random() * 20) + 5 },
    shutdown: { success: true, message: `Device ${deviceId} shutdown initiated`, newStatus: 'offline' },
  };
  if (deviceStates[deviceId] && command !== 'shutdown') deviceStates[deviceId] = { ...deviceStates[deviceId], status: 'online', cpu: 30, memory: 45 };
  res.json(responses[command] || { success: false, message: 'Unknown command' });
});

// SSE for IoT real-time streaming
app.get('/api/iot/stream', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const send = async () => {
    try {
      let realMetrics = null;
      try { realMetrics = await getRealPCMetrics(); } catch {}
      const telemetry = {};
      for (const device of devices) {
        const newState = generateDeviceTelemetry(device.id, device.type, deviceStates[device.id], device.isRealDevice ? realMetrics : null);
        deviceStates[device.id] = newState;
        telemetry[device.id] = { ...device, telemetry: newState };
      }
      const allAlerts = Object.values(telemetry).flatMap(d => d.telemetry.alerts.map(a => ({ device: d.name, message: a, time: new Date().toISOString() })));
      const online = Object.values(telemetry).filter(d => d.telemetry.status === 'online').length;
      const degraded = Object.values(telemetry).filter(d => d.telemetry.status === 'degraded').length;
      const offline = Object.values(telemetry).filter(d => d.telemetry.status === 'offline').length;
      res.write(`data: ${JSON.stringify({ devices: telemetry, summary: { total: devices.length, online, degraded, offline }, alerts: allAlerts, hasRealMetrics: !!realMetrics })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    }
  };

  send();
  const interval = setInterval(send, 2000);
  req.on('close', () => clearInterval(interval));
});

app.listen(PORT, () => {
  console.log(`SearchLens v2.3 backend running on port ${PORT}`);
  console.log(`Gemini AI: ${geminiEnabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Real PC Metrics: ${si ? 'ENABLED (systeminformation)' : 'FALLBACK (os module)'}`);
  console.log(`Auth: ENABLED (JWT)`);
});

export default app;
