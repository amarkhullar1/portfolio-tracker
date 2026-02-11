# Portfolio Dashboard

A self-hosted portfolio tracker with live prices via Yahoo Finance. Track stocks, ETFs, cash, crypto, gold, commodities, and bonds in one place.

## Features

- **Live prices** via Yahoo Finance — no API key required
- **Multi-asset support** — Stocks, ETFs, Cash, Crypto, Gold, Commodities, Bonds
- **Ticker lookup** — Search by ticker + exchange, auto-fills name, sector, geography, and price
- **Multi-currency** — GBP, USD, EUR with approximate FX conversion
- **Allocation breakdowns** — Pie charts and detailed views for geography, sector, and asset class
- **P&L tracking** — Per-holding and total gain/loss against cost basis
- **Sortable & filterable** holdings table with filter pills for region, sector, and asset class
- **Concentration alerts** when a single region exceeds 40%
- **Persistent storage** — Holdings saved to disk as JSON with automatic backups (last 10)
- **Docker-ready** — Single-container deployment with a volume mount for data

## Quick Start (Docker)

```bash
git clone <repo-url> && cd portfolio-dashboard
docker compose up -d --build
```

Open [http://localhost:3001](http://localhost:3001). The app starts empty — add holdings via the **+ Add Holding** button.

## Local Development

Requires Node.js 20+.

```bash
npm install
```

Run the backend and frontend dev server in separate terminals:

```bash
# Terminal 1 — Express API server (port 3001)
npm run server

# Terminal 2 — Vite dev server with hot reload (port 5173)
npm run dev
```

The Vite dev server proxies `/api` requests to the Express backend on port 3001.

### Production build (without Docker)

```bash
npm run build
npm start
```

Builds the frontend into `dist/` and starts the Express server, which serves both the API and the static frontend on port 3001.

## Project Structure

```
├── src/
│   ├── App.jsx          # Main dashboard UI
│   ├── api.js           # Frontend API client
│   └── main.jsx         # React entry point
├── server/
│   └── index.js         # Express API + Yahoo Finance proxy
├── data/                # Runtime data (gitignored)
│   ├── holdings.json    # Your portfolio holdings
│   ├── settings.json    # App settings
│   └── backups/         # Auto-rotating backups
├── Dockerfile
├── docker-compose.yml
└── vite.config.js
```

## How It Works

Holdings are stored as JSON on disk in the `data/` directory. The Express server proxies requests to Yahoo Finance for live quotes and ticker lookups — no API key needed. The frontend fetches prices on page load and on demand via the "Refresh Prices" button. Non-market assets (Cash, Crypto, Gold, Commodities, Bonds) use manually entered values. All values are converted to GBP using approximate FX rates.

## Supported Exchanges

When adding a stock or ETF, select the exchange suffix:

| Exchange | Suffix | Example |
|---|---|---|
| US (default) | *(none)* | MSFT, AAPL |
| London (LSE) | .L | DGE.L, VUAG.L |
| XETRA (Germany) | .DE | SIE.DE, BMW.DE |
| Euronext Paris | .PA | DG.PA, MC.PA |
| Euronext Amsterdam | .AS | ASML.AS |
| Borsa Italiana | .MI | ENI.MI |
| Toronto (TSX) | .TO | RY.TO |
| Hong Kong | .HK | 0700.HK |
| Tokyo | .T | 6758.T |
| Singapore | .SG | D05.SG |

LSE prices from Yahoo Finance are returned in pence (GBp) — the server converts these to pounds automatically.

## Data & Backups

All data lives in the `data/` directory, which is gitignored. When running with Docker, this directory is mounted as a volume (`./data:/app/data`) so data survives container rebuilds.

Backups are created automatically on every save. The 10 most recent are kept in `data/backups/`.

```bash
# Manual backup
cp data/holdings.json ~/portfolio-backup-$(date +%Y%m%d).json
```

## Updating

```bash
docker compose down
git pull
docker compose up -d --build
```

Your data in `./data/` is untouched during rebuilds.

## Security Notes

- Designed to run on **your local machine or home network only**
- No authentication — do not expose port 3001 to the public internet
- No API keys required (Yahoo Finance is used without authentication)
