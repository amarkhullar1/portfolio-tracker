import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Data directory — mounted as a Docker volume for persistence
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const HOLDINGS_FILE = join(DATA_DIR, 'holdings.json');
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Serve built frontend in production
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

// --- API Routes ---

// GET /api/holdings — read holdings
app.get('/api/holdings', (req, res) => {
  try {
    if (existsSync(HOLDINGS_FILE)) {
      const data = JSON.parse(readFileSync(HOLDINGS_FILE, 'utf-8'));
      return res.json(data);
    }
    return res.json(null);
  } catch (e) {
    console.error('Error reading holdings:', e.message);
    return res.status(500).json({ error: 'Failed to read holdings' });
  }
});

// PUT /api/holdings — save holdings
app.put('/api/holdings', (req, res) => {
  try {
    writeFileSync(HOLDINGS_FILE, JSON.stringify(req.body, null, 2), 'utf-8');

    // Also write a timestamped backup (keep last 10)
    const backupDir = join(DATA_DIR, 'backups');
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(join(backupDir, `holdings-${ts}.json`), JSON.stringify(req.body, null, 2), 'utf-8');

    // Clean old backups (keep last 10)
    const backups = readdirSync(backupDir)
      .filter(f => f.startsWith('holdings-'))
      .sort()
      .reverse();
    backups.slice(10).forEach(f => {
      try { unlinkSync(join(backupDir, f)); } catch (e) {}
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('Error saving holdings:', e.message);
    return res.status(500).json({ error: 'Failed to save holdings' });
  }
});

// GET /api/settings — read settings (API key, FX rates, etc.)
app.get('/api/settings', (req, res) => {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
      return res.json(data);
    }
    return res.json({});
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read settings' });
  }
});

// PUT /api/settings — save settings
app.put('/api/settings', (req, res) => {
  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify(req.body, null, 2), 'utf-8');
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Yahoo Finance: batch quotes for all symbols
app.get('/api/yahoo/quotes', async (req, res) => {
  const { symbols } = req.query;
  if (!symbols) return res.json({});
  const symbolList = symbols.split(',').map(s => s.trim()).filter(Boolean);
  const results = {};
  try {
    for (const sym of symbolList) {
      try {
        const quote = await yahooFinance.quote(sym);
        let price = quote.regularMarketPrice;
        if (price == null || price <= 0) continue;
        // LSE returns prices in pence — convert to pounds
        if (quote.currency === 'GBp' || quote.currency === 'GBX') {
          price = price / 100;
        }
        results[sym] = { price };
      } catch (e) { /* skip failed symbol */ }
    }
    return res.json(results);
  } catch (e) {
    return res.status(502).json({ error: 'Yahoo Finance request failed' });
  }
});

// Yahoo Finance: single symbol lookup (for add/edit modal)
app.get('/api/yahoo/lookup', async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const quote = await yahooFinance.quote(symbol);
    let price = quote.regularMarketPrice;
    const isPence = quote.currency === 'GBp' || quote.currency === 'GBX';
    if (isPence && price) price = price / 100;

    let profile = {};
    try {
      const summary = await yahooFinance.quoteSummary(symbol, { modules: ['assetProfile'] });
      profile = summary.assetProfile || {};
    } catch (e) { /* ETFs often lack assetProfile */ }

    return res.json({
      name: quote.shortName || quote.longName || '',
      price: price || null,
      currency: isPence ? 'GBP' : (quote.currency || ''),
      exchange: quote.exchange || '',
      quoteType: quote.quoteType || '',
      industry: profile.industry || '',
      sector: profile.sector || '',
      country: profile.country || '',
    });
  } catch (e) {
    return res.status(502).json({ error: 'Yahoo Finance lookup failed' });
  }
});

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const indexPath = join(distPath, 'index.html');
  if (existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).send('Build the frontend first: npm run build');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Portfolio Dashboard server running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
