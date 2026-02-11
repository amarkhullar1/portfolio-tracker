# Portfolio Dashboard

A self-hosted portfolio tracker with live prices via Yahoo Finance. Track stocks, ETFs, cash, crypto, gold, commodities, and bonds in one place.

## Features

- **Live prices** via Yahoo Finance — no API key required
- **Multi-asset support** — Stocks, ETFs, Cash, Crypto, Gold, Commodities, Bonds
- **Ticker lookup** — Search by ticker + exchange, auto-fills name, sector, geography, and price
- **Multi-currency** — GBP, USD, EUR with live FX rates via Yahoo Finance (static fallback if unavailable)
- **Dynamic sectors & geographies** — Any sector or geography from Yahoo Finance or user input is accepted; colors are auto-assigned
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

### Docker Setup Details

**Prerequisites:** Docker and Docker Compose (included with Docker Desktop on Mac/Windows, or install separately on Linux).

**What happens on first run:**

1. Docker builds a multi-stage image — installs dependencies, builds the Vite frontend, then creates a slim production image with only the Express server and built assets
2. A `data/` directory is created on the host (mounted as a volume) to persist holdings and backups across container restarts
3. The Express server starts on port 3001 and serves both the API and the frontend

**Custom port:** Edit `docker-compose.yml` to change the host port:

```yaml
ports:
  - "8080:3001"   # access on http://localhost:8080
```

**Viewing logs:**

```bash
docker compose logs -f portfolio
```

**Stopping and restarting:**

```bash
docker compose down       # stop (data in ./data/ is preserved)
docker compose up -d      # restart without rebuilding
docker compose up -d --build  # rebuild after code changes
```

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

Holdings are stored as JSON on disk in the `data/` directory. The Express server proxies requests to Yahoo Finance for live quotes, ticker lookups, and FX rates — no API key needed. The frontend fetches prices and exchange rates on page load and on demand via the "Refresh Prices" button. Non-market assets (Cash, Crypto, Gold, Commodities, Bonds) use manually entered values. All values are converted to GBP using live FX rates from Yahoo Finance (with static fallbacks if the FX fetch fails).

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
