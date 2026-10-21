const express = require('express');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.TVHOST_ADMIN_KEY;
const ALLOWED_ORIGIN = process.env.TVHOST_ALLOWED_ORIGIN || 'https://tvmanisback.github.io';
let bot = null;
let workDir = null;
let logs = [];
let status = 'stopped';
let stopping = false;

if (!ADMIN_KEY || ADMIN_KEY.length < 32) {
  console.error('Set TVHOST_ADMIN_KEY to a random secret of at least 32 characters before starting.');
  process.exit(1);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '600kb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN) return res.status(403).json({ error: 'Origin not allowed.' });
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-TvHost-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
function authorized(req, res, next) {
  const supplied = req.get('X-TvHost-Key') || '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(ADMIN_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid TvHost access key.' });
  }
  next();
}
function addLog(chunk) {
  logs.push(String(chunk).replace(/\x1b\[[0-9;]*m/g, '').slice(0, 4000));
  logs = logs.join('').slice(-12000).split('\n').slice(-160);
}
function cleanup() {
  if (workDir) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    workDir = null;
  }
}
function publicStatus() {
  return { status, pid: bot && bot.pid ? bot.pid : null, logs: logs.join('\n').slice(-8000) };
}
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'TvHost terminal backend' }));
app.get('/api/status', authorized, (req, res) => res.json(publicStatus()));
app.post('/api/start', authorized, (req, res) => {
  if (bot && status === 'running') return res.status(409).json({ error: 'A bot is already running. Stop it before starting another.' });
  const { code, token } = req.body || {};
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ error: 'Bot code is required.' });
  if (Buffer.byteLength(code, 'utf8') > 500000) return res.status(413).json({ error: 'Bot code exceeds 500 KB.' });
  if (typeof token !== 'string' || token.length < 1 || token.length > 4096) return res.status(400).json({ error: 'A valid TvCord bot token is required.' });
  cleanup();
  logs = [];
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvhost-'));
  const file = path.join(workDir, 'bot.js');
  fs.writeFileSync(file, code, { mode: 0o600 });
  status = 'running';
  stopping = false;
  try {
    bot = spawn(process.execPath, [file], {
      cwd: workDir,
      env: { PATH: process.env.PATH || '', HOME: workDir, NODE_ENV: 'production', TVCORD_BOT_TOKEN: token },
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (err) {
    bot = null; status = 'stopped'; cleanup();
    return res.status(500).json({ error: 'Could not start Node.js process.' });
  }
  bot.stdout.on('data', addLog);
  bot.stderr.on('data', addLog);
  bot.on('error', err => { addLog('Process error: ' + err.message); status = 'error'; });
  bot.on('close', (code, signal) => {
    addLog('Bot process exited. code=' + code + ' signal=' + signal);
    bot = null;
    status = stopping ? 'stopped' : (code === 0 ? 'stopped' : 'error');
    stopping = false;
    cleanup();
  });
  res.json({ ok: true, status: 'running' });
});
app.post('/api/stop', authorized, (req, res) => {
  if (!bot) { status = 'stopped'; return res.json({ ok: true, status }); }
  stopping = true;
  status = 'stopping';
  bot.kill('SIGTERM');
  const current = bot;
  const timer = setTimeout(() => { if (bot === current) current.kill('SIGKILL'); }, 5000);
  timer.unref();
  res.json({ ok: true, status });
});
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON request.' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});
const server = app.listen(PORT, '0.0.0.0', () => console.log('TvHost backend listening on ' + PORT));
function shutdown() {
  if (bot) { stopping = true; bot.kill('SIGTERM'); }
  server.close(() => { cleanup(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
