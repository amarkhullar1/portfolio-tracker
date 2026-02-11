import { useState, useMemo, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import { storage, yahoo } from "./api.js";

const EXCHANGE_OPTIONS = [
  { code: "", label: "US (default — no suffix)", example: "MSFT, AAPL" },
  { code: ".L", label: "London Stock Exchange", example: "DGE.L, VUAG.L" },
  { code: ".DE", label: "XETRA (Germany)", example: "SIE.DE, BMW.DE" },
  { code: ".PA", label: "Euronext Paris", example: "DG.PA, MC.PA" },
  { code: ".AS", label: "Euronext Amsterdam", example: "ASML.AS" },
  { code: ".MI", label: "Borsa Italiana", example: "ENI.MI" },
  { code: ".TO", label: "Toronto (TSX)", example: "RY.TO" },
  { code: ".HK", label: "Hong Kong", example: "0700.HK" },
  { code: ".T", label: "Tokyo", example: "6758.T" },
  { code: ".SG", label: "Singapore", example: "D05.SG" },
];

const DEFAULT_GEOS = ["USA", "UK", "Global"];
const DEFAULT_SECTORS = ["Technology", "Index Fund", "Energy"];
const CURRENCY_OPTIONS = ["GBP", "USD", "EUR"];
const TYPE_OPTIONS = ["Stock", "ETF", "Cash", "Crypto", "Gold", "Commodity", "Bond"];
const NON_MARKET_TYPES = ["Cash", "Crypto", "Gold", "Commodity", "Bond"];

const COLOR_PALETTE = [
  "#3b82f6", "#ef4444", "#f59e0b", "#8b5cf6", "#10b981", "#6366f1", "#ec4899",
  "#f43f5e", "#14b8a6", "#f97316", "#22c55e", "#06b6d4", "#84cc16", "#a855f7",
  "#d97706", "#64748b", "#22d3ee", "#f472b6", "#eab308", "#a3e635",
];
function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = Math.imul(31, h) + name.charCodeAt(i) | 0;
  return COLOR_PALETTE[((h % COLOR_PALETTE.length) + COLOR_PALETTE.length) % COLOR_PALETTE.length];
}
const CLASS_COLORS = { "Equities": "#6366f1", "Cash": "#22d3ee", "Crypto": "#f472b6", "Gold": "#eab308", "Commodities": "#a3e635", "Bonds": "#38bdf8" };
const getAssetClass = (type) => ({ Stock: "Equities", ETF: "Equities", Cash: "Cash", Crypto: "Crypto", Gold: "Gold", Commodity: "Commodities", Bond: "Bonds" }[type] || "Equities");

// Storage handled by backend API — see src/api.js

const fmt = (v) => `£${Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtSigned = (v) => `${v < 0 ? "-" : "+"}£${Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
      <div>{fmt(d.value)} ({d.pct}%)</div>
    </div>
  );
};

// Maps Finnhub country codes to our geo labels
const COUNTRY_MAP = {
  "US": "USA", "GB": "UK", "DE": "Germany", "FR": "France", "IE": "Ireland",
  "UY": "Uruguay", "JP": "Japan", "CN": "China", "HK": "China", "CA": "Canada",
  "NL": "Netherlands", "IT": "Italy", "SE": "Sweden", "CH": "Switzerland",
  "AU": "Australia", "KR": "South Korea", "IN": "India", "BR": "Brazil",
  "ES": "Spain", "SG": "Singapore", "NO": "Norway", "DK": "Denmark",
  "FI": "Finland", "BE": "Belgium", "AT": "Austria", "PT": "Portugal",
};

// Maps Finnhub industry strings to our sector categories
const INDUSTRY_TO_SECTOR = {
  "Technology": "Technology", "Software": "Technology", "Semiconductors": "Technology",
  "Media": "Communication Services", "Telecommunication": "Communication Services",
  "Financial Services": "Financials", "Banking": "Financials", "Insurance": "Financials",
  "Healthcare": "Healthcare", "Biotechnology": "Healthcare", "Pharmaceuticals": "Healthcare",
  "Consumer Cyclical": "Consumer Discretionary", "Auto Manufacturers": "Consumer Discretionary",
  "Consumer Defensive": "Consumer Staples", "Beverages": "Consumer Staples",
  "Industrials": "Industrials", "Aerospace & Defense": "Industrials", "Airlines": "Industrials",
  "Construction": "Industrials", "Manufacturing": "Industrials",
  "Energy": "Energy", "Oil & Gas": "Energy", "Utilities": "Utilities",
  "Basic Materials": "Materials", "Mining": "Materials",
  "Real Estate": "Real Estate",
};

function mapSector(finnhubIndustry) {
  if (!finnhubIndustry) return null;
  if (INDUSTRY_TO_SECTOR[finnhubIndustry]) return INDUSTRY_TO_SECTOR[finnhubIndustry];
  // Fuzzy match
  const lower = finnhubIndustry.toLowerCase();
  for (const [key, val] of Object.entries(INDUSTRY_TO_SECTOR)) {
    if (lower.includes(key.toLowerCase())) return val;
  }
  return finnhubIndustry;
}

function mapCountry(countryCode) {
  if (!countryCode) return null;
  return COUNTRY_MAP[countryCode.toUpperCase()] || countryCode;
}

function HoldingModal({ onClose, onSave, editing, sectorOptions, geoOptions }) {
  const defaults = editing ? {
    name: editing.name || "", ticker: editing.ticker || "", exchange: "",
    shares: editing.shares != null ? String(editing.shares) : "",
    manualPrice: editing.manualPrice != null ? String(editing.manualPrice) : "",
    manualValue: editing.manualValue != null ? String(editing.manualValue) : "",
    currency: editing.currency || "GBP", sector: editing.sector || "Technology",
    industry: editing.industry || "", geo: editing.geo || "USA",
    type: editing.type || "Stock", costBasis: editing.costBasis != null ? String(editing.costBasis) : "",
    pie: editing.pie || "",
  } : { name: "", ticker: "", exchange: "", shares: "", manualPrice: "", manualValue: "", currency: "GBP", sector: "Technology", industry: "", geo: "USA", type: "Stock", costBasis: "", pie: "" };

  const [form, setForm] = useState(defaults);
  const [lookupStatus, setLookupStatus] = useState("idle");
  const [lookupData, setLookupData] = useState(null);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const finnhubSymbol = form.ticker + form.exchange;
  const isAltAsset = NON_MARKET_TYPES.includes(form.type);

  // Auto-set sector when switching to an alt asset type
  const handleTypeChange = (newType) => {
    const updates = { type: newType };
    if (newType === "Cash") { updates.sector = "Cash"; updates.industry = "Cash Holdings"; }
    else if (newType === "Crypto") { updates.sector = "Crypto"; updates.industry = "Cryptocurrency"; }
    else if (newType === "Gold") { updates.sector = "Precious Metals"; updates.industry = "Gold"; }
    else if (newType === "Commodity") { updates.sector = "Commodities"; updates.industry = "Commodity"; }
    else if (newType === "Bond") { updates.sector = "Bonds"; updates.industry = "Fixed Income"; }
    setForm(p => ({ ...p, ...updates }));
  };

  const handleLookup = async () => {
    if (!form.ticker) return;

    setLookupStatus("loading");
    setLookupData(null);
    const sym = form.ticker + form.exchange;

    try {
      const data = await yahoo.lookup(sym);

      const hasName = data && data.name;
      const hasPrice = data && data.price && data.price > 0;

      const result = { data, hasName, hasPrice };
      setLookupData(result);

      if (hasName) {
        const updates = {};
        updates.name = data.name;
        if (data.industry) {
          updates.industry = data.industry;
          const mapped = mapSector(data.industry);
          if (mapped) updates.sector = mapped;
        } else if (data.sector) {
          const mapped = mapSector(data.sector);
          if (mapped) updates.sector = mapped;
        }
        if (data.country) {
          const mapped = mapCountry(data.country);
          if (mapped) updates.geo = mapped;
        }
        if (data.currency) {
          const cur = data.currency.toUpperCase();
          if (["GBP", "USD", "EUR"].includes(cur)) updates.currency = cur;
        }
        if (data.quoteType === "EQUITY") updates.type = "Stock";
        else if (data.quoteType === "ETF") updates.type = "ETF";
        setForm(p => ({ ...p, ...updates }));
      }

      if (hasPrice) {
        setForm(p => ({ ...p, manualPrice: data.price.toString() }));
      }

      setLookupStatus(hasName ? "success" : hasPrice ? "partial" : "partial");
    } catch (e) {
      setLookupStatus("error");
    }
  };

  const handleSubmit = () => {
    if (!form.name) return;
    if (!isAltAsset && !form.ticker) return;
    const holding = {
      id: editing ? editing.id : Date.now().toString(),
      name: form.name,
      ticker: isAltAsset ? (form.ticker || form.name.toUpperCase().replace(/\s+/g, "-").slice(0, 10)) : form.ticker,
      finnhubSymbol: isAltAsset ? "" : finnhubSymbol,
      shares: form.shares ? parseFloat(form.shares) : null,
      manualPrice: form.manualPrice ? parseFloat(form.manualPrice) : null,
      manualValue: form.manualValue ? parseFloat(form.manualValue) : null,
      currency: form.currency,
      sector: form.sector,
      industry: form.industry,
      geo: form.geo,
      type: form.type,
      costBasis: form.costBasis ? parseFloat(form.costBasis) : 0,
      pie: form.pie || null,
    };
    onSave(holding);
    onClose();
  };

  const inputStyle = { width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4, display: "block" };
  const selectStyle = { ...inputStyle, appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" };
  const autoFilledStyle = (field) => lookupData?.hasName && lookupData.data[field] ? { boxShadow: "0 0 0 1px rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.05)" } : {};

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "linear-gradient(145deg, #141428, #0f1029)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 28, width: 520, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: "0 0 20px" }}>{editing ? "Edit Holding" : "Add Holding"}</h2>

        {/* Asset type selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Asset Type</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TYPE_OPTIONS.map(t => (
              <button key={t} onClick={() => handleTypeChange(t)} style={{
                padding: "6px 14px", borderRadius: 8, border: "1px solid",
                borderColor: form.type === t ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)",
                background: form.type === t ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
                color: form.type === t ? "#a5b4fc" : "#94a3b8", fontSize: 12, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Step 1: Ticker + Exchange + Lookup — only for stocks/ETFs */}
        {!isAltAsset && (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#a5b4fc", fontWeight: 600, marginBottom: 10 }}>① Enter ticker & exchange, then look up</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
            <div>
              <label style={labelStyle}>Ticker *</label>
              <input style={inputStyle} value={form.ticker} onChange={e => { set("ticker", e.target.value.toUpperCase()); setLookupStatus("idle"); }} placeholder="e.g. AAPL" />
            </div>
            <div>
              <label style={labelStyle}>Exchange</label>
              <select style={selectStyle} value={form.exchange} onChange={e => { set("exchange", e.target.value); setLookupStatus("idle"); }}>
                {EXCHANGE_OPTIONS.map(ex => <option key={ex.code} value={ex.code}>{ex.label}</option>)}
              </select>
            </div>
            <button onClick={handleLookup} disabled={!form.ticker || lookupStatus === "loading"} title="Look up via Yahoo Finance" style={{
              padding: "9px 18px", borderRadius: 8, border: "none", cursor: form.ticker ? "pointer" : "not-allowed",
              background: lookupStatus === "success" ? "rgba(74,222,128,0.2)" : "linear-gradient(135deg, #6366f1, #4f46e5)",
              color: lookupStatus === "success" ? "#4ade80" : "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
              opacity: !form.ticker ? 0.5 : 1, whiteSpace: "nowrap",
            }}>
              {lookupStatus === "loading" ? "Looking up..." : lookupStatus === "success" ? "✓ Found" : "Lookup"}
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
            Symbol: <code style={{ color: "#a5b4fc" }}>{finnhubSymbol || "—"}</code>
          </div>

          {/* Lookup status messages */}
          {lookupStatus === "error" && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, fontSize: 12, color: "#f87171" }}>
              Lookup failed — check the ticker and exchange, or fill in fields manually.
            </div>
          )}
          {lookupStatus === "success" && lookupData?.hasName && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, fontSize: 12, color: "#4ade80" }}>
              ✓ Found: <strong>{lookupData.data.name}</strong>{lookupData.data.industry ? ` — ${lookupData.data.industry}` : ""}{lookupData.data.country ? `, ${lookupData.data.country}` : ""}
              {lookupData.hasPrice && <span> · Price: {lookupData.data.price}</span>}
              <div style={{ color: "#86efac", marginTop: 4 }}>Fields highlighted in green were auto-filled. You can override any of them.</div>
            </div>
          )}
          {lookupStatus === "partial" && (
            <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, fontSize: 12, color: "#fbbf24" }}>
              Partial data found (common for ETFs). {lookupData?.hasPrice ? "Got a price quote." : "No quote available."} Please fill in the remaining fields manually.
            </div>
          )}
        </div>
        )}

        {/* Details */}
        <div style={{ fontSize: 12, color: "#a5b4fc", fontWeight: 600, marginBottom: 10 }}>{isAltAsset ? "①" : "②"} {editing ? "Edit" : "Enter"} details</div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{isAltAsset ? "Name" : "Company / Fund Name"} *</label>
          <input style={{ ...inputStyle, ...autoFilledStyle("name") }} value={form.name} onChange={e => set("name", e.target.value)} placeholder={isAltAsset ? "e.g. Cash GBP, Bitcoin, Gold" : "e.g. Apple Inc."} />
        </div>

        {/* Stock/ETF: shares + price row */}
        {!isAltAsset && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Shares</label>
            <input style={inputStyle} type="number" step="any" value={form.shares} onChange={e => set("shares", e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label style={labelStyle}>Price per share</label>
            <input style={{ ...inputStyle, ...(lookupData?.hasPrice ? { boxShadow: "0 0 0 1px rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.05)" } : {}) }} type="number" step="any" value={form.manualPrice} onChange={e => set("manualPrice", e.target.value)} placeholder="Fallback price" />
          </div>
          <div>
            <label style={labelStyle}>Currency</label>
            <select style={{ ...selectStyle, ...autoFilledStyle("currency") }} value={form.currency} onChange={e => set("currency", e.target.value)}>
              {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        )}

        {/* Alt asset: current value + currency */}
        {isAltAsset && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Current Value</label>
            <input style={inputStyle} type="number" step="any" value={form.manualValue} onChange={e => set("manualValue", e.target.value)} placeholder="Current value in currency" />
          </div>
          <div>
            <label style={labelStyle}>Currency</label>
            <select style={selectStyle} value={form.currency} onChange={e => set("currency", e.target.value)}>
              {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Cost Basis (£)</label>
            <input style={inputStyle} type="number" step="any" value={form.costBasis} onChange={e => set("costBasis", e.target.value)} placeholder="Total amount invested" />
          </div>
          {isAltAsset && (
          <div>
            <label style={labelStyle}>Ticker / Label</label>
            <input style={inputStyle} value={form.ticker} onChange={e => set("ticker", e.target.value.toUpperCase())} placeholder="e.g. BTC, GOLD" />
          </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Sector {lookupData?.hasName && (lookupData.data.sector || lookupData.data.industry) ? <span style={{ color: "#4ade80", fontWeight: 400, textTransform: "none" }}>(auto)</span> : ""}</label>
            <input list="sector-options" style={{ ...inputStyle, ...(lookupData?.hasName && (lookupData.data.sector || lookupData.data.industry) ? { boxShadow: "0 0 0 1px rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.05)" } : {}) }} value={form.sector} onChange={e => set("sector", e.target.value)} placeholder="e.g. Technology" />
            <datalist id="sector-options">
              {(sectorOptions || []).map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label style={labelStyle}>Industry {lookupData?.hasName && lookupData.data.industry ? <span style={{ color: "#4ade80", fontWeight: 400, textTransform: "none" }}>(auto)</span> : ""}</label>
            <input style={{ ...inputStyle, ...(lookupData?.hasName && lookupData.data.industry ? { boxShadow: "0 0 0 1px rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.05)" } : {}) }} value={form.industry} onChange={e => set("industry", e.target.value)} placeholder="e.g. Consumer Electronics" />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Geography {lookupData?.hasName && lookupData.data.country ? <span style={{ color: "#4ade80", fontWeight: 400, textTransform: "none" }}>(auto)</span> : ""}</label>
          <input list="geo-options" style={{ ...inputStyle, ...(lookupData?.hasName && lookupData.data.country ? { boxShadow: "0 0 0 1px rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.05)" } : {}) }} value={form.geo} onChange={e => set("geo", e.target.value)} placeholder="e.g. USA" />
          <datalist id="geo-options">
            {(geoOptions || []).map(g => <option key={g} value={g} />)}
          </datalist>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!form.name || (!isAltAsset && !form.ticker)} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: !form.name || (!isAltAsset && !form.ticker) ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#fff", cursor: !form.name || (!isAltAsset && !form.ticker) ? "not-allowed" : "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{editing ? "Save Changes" : "Add Holding"}</button>
        </div>
      </div>
    </div>
  );
}

function PortfolioDashboard() {
  const [holdings, setHoldings] = useState([]);
  const [view, setView] = useState("overview");
  const [sortBy, setSortBy] = useState("value");
  const [sortDir, setSortDir] = useState("desc");
  const [filter, setFilter] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [livePrices, setLivePrices] = useState({});
  const [failedSymbols, setFailedSymbols] = useState(new Set());
  const [fetchStatus, setFetchStatus] = useState("idle");
  const [lastFetched, setLastFetched] = useState(null);

  // Load holdings from backend and fetch live prices
  const [holdingsLoaded, setHoldingsLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const saved = await storage.getHoldings();
        if (saved && Array.isArray(saved) && saved.length > 0) setHoldings(saved);
      } catch (e) { /* use defaults */ }
      setHoldingsLoaded(true);
    })();
  }, []);

  // Save holdings to backend
  const saveHoldings = useCallback(async (h) => {
    setHoldings(h);
    try { await storage.saveHoldings(h); } catch (e) { console.error('Save failed:', e); }
  }, []);

  // FX rates — live from Yahoo Finance, with static fallbacks
  const [fxRates, setFxRates] = useState({ USD: 0.79, EUR: 0.86, GBP: 1.0 });

  const getHoldingValue = (h) => {
    const fx = fxRates[h.currency] || 1;
    // Alt assets: use manualValue directly (with FX)
    if (NON_MARKET_TYPES.includes(h.type)) {
      if (h.manualValue) return h.manualValue * fx;
      if (h.costBasis) return h.costBasis; // Cash: costBasis is already in GBP
      return 0;
    }
    if (livePrices[h.finnhubSymbol]) {
      const price = livePrices[h.finnhubSymbol];
      if (h.shares) return h.shares * price * fx;
    }
    if (h.manualValue) return h.manualValue * fx;
    if (h.shares && h.manualPrice) return h.shares * h.manualPrice * fx;
    return 0;
  };

  const enrichedHoldings = useMemo(() => {
    return holdings.map(h => {
      const value = getHoldingValue(h);
      const gain = value - (h.costBasis || 0);
      const gainPct = h.costBasis ? (gain / h.costBasis) * 100 : 0;
      return { ...h, value, gain, gainPct, assetClass: getAssetClass(h.type) };
    });
  }, [holdings, livePrices, fxRates]);

  const totalValue = useMemo(() => enrichedHoldings.reduce((s, h) => s + h.value, 0), [enrichedHoldings]);
  const totalGain = useMemo(() => enrichedHoldings.reduce((s, h) => s + h.gain, 0), [enrichedHoldings]);
  const totalCost = totalValue - totalGain;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  const geoData = useMemo(() => {
    const map = {};
    enrichedHoldings.forEach(h => { map[h.geo] = (map[h.geo] || 0) + h.value; });
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: ((value / totalValue) * 100).toFixed(1), color: hashColor(name) })).sort((a, b) => b.value - a.value);
  }, [enrichedHoldings, totalValue]);

  const sectorData = useMemo(() => {
    const map = {};
    enrichedHoldings.forEach(h => { map[h.sector] = (map[h.sector] || 0) + h.value; });
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: ((value / totalValue) * 100).toFixed(1), color: hashColor(name) })).sort((a, b) => b.value - a.value);
  }, [enrichedHoldings, totalValue]);

  const classData = useMemo(() => {
    const map = {};
    enrichedHoldings.forEach(h => { map[h.assetClass] = (map[h.assetClass] || 0) + h.value; });
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: ((value / totalValue) * 100).toFixed(1), color: CLASS_COLORS[name] || "#475569" })).sort((a, b) => b.value - a.value);
  }, [enrichedHoldings, totalValue]);

  const geoOptions = useMemo(() => {
    const vals = new Set(DEFAULT_GEOS);
    holdings.forEach(h => { if (h.geo) vals.add(h.geo); });
    return [...vals].sort();
  }, [holdings]);

  const sectorOptions = useMemo(() => {
    const vals = new Set(DEFAULT_SECTORS);
    holdings.forEach(h => { if (h.sector) vals.add(h.sector); });
    return [...vals].sort();
  }, [holdings]);

  const sortedHoldings = useMemo(() => {
    let list = [...enrichedHoldings];
    if (filter !== "All") {
      if (geoData.some(g => g.name === filter)) list = list.filter(h => h.geo === filter);
      else if (Object.keys(CLASS_COLORS).includes(filter)) list = list.filter(h => h.assetClass === filter);
      else list = list.filter(h => h.sector === filter);
    }
    list.sort((a, b) => {
      let va = a[sortBy], vb = b[sortBy];
      if (typeof va === "string") { va = va.toLowerCase(); vb = (vb || "").toLowerCase(); }
      return sortDir === "desc" ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1);
    });
    return list;
  }, [enrichedHoldings, sortBy, sortDir, filter]);

  // Fetch live prices and FX rates via Yahoo Finance
  const fetchPrices = useCallback(async () => {
    const symbols = [...new Set(holdings.filter(h => h.finnhubSymbol).map(h => h.finnhubSymbol))];
    if (symbols.length === 0) { setFetchStatus("idle"); return; }
    setFetchStatus("loading");
    try {
      const [data, fxData] = await Promise.all([
        yahoo.quotes(symbols),
        yahoo.fx().catch(() => null),
      ]);
      if (fxData) setFxRates(prev => ({ ...prev, ...fxData }));
      const prices = {};
      const failed = new Set();
      for (const sym of symbols) {
        if (data[sym]?.price > 0) prices[sym] = data[sym].price;
        else failed.add(sym);
      }
      setLivePrices(prices);
      setFailedSymbols(failed);
      setLastFetched(new Date().toLocaleTimeString());
      setFetchStatus(Object.keys(prices).length > 0 ? "success" : "empty");
    } catch (e) {
      setFetchStatus("error");
    }
  }, [holdings]);

  // Auto-fetch prices on page load once holdings are loaded
  useEffect(() => {
    if (holdingsLoaded && holdings.length > 0) fetchPrices();
  }, [holdingsLoaded]);

  const handleAddHolding = (h) => saveHoldings([...holdings, h]);
  const handleRemoveHolding = (id) => saveHoldings(holdings.filter(h => h.id !== id));
  const handleEditHolding = (h) => { setEditingHolding(h); setShowAddModal(true); };
  const handleSaveHolding = (h) => {
    if (editingHolding) {
      saveHoldings(holdings.map(existing => existing.id === h.id ? h : existing));
    } else {
      saveHoldings([...holdings, h]);
    }
  };

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const tabs = ["overview", "holdings", "geography", "sectors", "classes"];
  const SortArrow = ({ col }) => sortBy === col ? <span style={{ marginLeft: 4, opacity: 0.6 }}>{sortDir === "desc" ? "↓" : "↑"}</span> : null;
  const headerStyle = { cursor: "pointer", userSelect: "none", padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" };
  const btnBase = { border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, transition: "all 0.2s" };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Outfit', sans-serif", background: "linear-gradient(145deg, #0a0a1a 0%, #0f1029 40%, #0a0a1a 100%)", color: "#e2e8f0", minHeight: "100vh", padding: "24px 20px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@300;600;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: 28, margin: 0, background: "linear-gradient(135deg, #e2e8f0, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Portfolio</h1>
            <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Stocks ISA</span>
            {lastFetched && <span style={{ fontSize: 11, color: "#4ade80", background: "rgba(74,222,128,0.1)", padding: "2px 8px", borderRadius: 4 }}>Live · {lastFetched}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 8 }}>
            <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 36, fontWeight: 600, color: "#f8fafc" }}>{fmt(totalValue)}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: totalGain >= 0 ? "#34d399" : "#f87171", padding: "4px 10px", background: totalGain >= 0 ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", borderRadius: 6 }}>
              {fmtSigned(totalGain)} ({fmtPct(totalGainPct)})
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={fetchPrices} disabled={fetchStatus === "loading"} style={{ ...btnBase, padding: "8px 16px", borderRadius: 8, background: "rgba(52,211,153,0.15)", color: "#34d399", fontSize: 12, opacity: fetchStatus === "loading" ? 0.6 : 1 }}>
            {fetchStatus === "loading" ? "Fetching..." : "Refresh Prices"}
          </button>
          {fetchStatus === "success" && (() => { const liveCount = holdings.filter(h => livePrices[h.finnhubSymbol]).length; const failedCount = holdings.filter(h => failedSymbols.has(h.finnhubSymbol)).length; return (
            <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: failedCount > 0 ? "rgba(251,191,36,0.1)" : "rgba(74,222,128,0.1)", color: failedCount > 0 ? "#fbbf24" : "#4ade80", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#4ade80" }}>● {liveCount} live</span>
              {failedCount > 0 && <span style={{ color: "#f87171" }}>● {failedCount} fallback</span>}
            </span>
          ); })()}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setView(t)} style={{ ...btnBase, padding: "8px 18px", borderRadius: 8, fontSize: 13, background: view === t ? "rgba(99,102,241,0.2)" : "transparent", color: view === t ? "#a5b4fc" : "#64748b" }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ============ OVERVIEW ============ */}
      {view === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
            {[
              { label: "Holdings", val: enrichedHoldings.length.toString(), sub: `across ${geoData.length} regions` },
              { label: "Total Invested", val: fmt(totalCost), sub: "cost basis" },
              { label: "Biggest Position", val: enrichedHoldings.length ? [...enrichedHoldings].sort((a, b) => b.value - a.value)[0]?.ticker : "—", sub: enrichedHoldings.length ? `${((enrichedHoldings.sort((a, b) => b.value - a.value)[0]?.value / totalValue) * 100).toFixed(1)}% of portfolio` : "" },
              { label: "Top Sector", val: sectorData[0]?.name || "—", sub: `${sectorData[0]?.pct || 0}%` },
            ].map((c, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Outfit', sans-serif", color: "#f8fafc" }}>{c.val}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{c.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 28 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px", color: "#cbd5e1" }}>Geographic Allocation</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={geoData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} strokeWidth={0}>{geoData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip content={<CustomTooltip />} /></PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8 }}>
                {geoData.map((d, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94a3b8" }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color }} />{d.name} <span style={{ color: "#64748b" }}>{d.pct}%</span></div>))}
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px", color: "#cbd5e1" }}>Sector Allocation</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={sectorData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} strokeWidth={0}>{sectorData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip content={<CustomTooltip />} /></PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8 }}>
                {sectorData.map((d, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94a3b8" }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color }} />{d.name} <span style={{ color: "#64748b" }}>{d.pct}%</span></div>))}
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px", color: "#cbd5e1" }}>Asset Class Allocation</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={classData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} strokeWidth={0}>{classData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip content={<CustomTooltip />} /></PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8 }}>
                {classData.map((d, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94a3b8" }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color }} />{d.name} <span style={{ color: "#64748b" }}>{d.pct}%</span></div>))}
              </div>
            </div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px", color: "#cbd5e1" }}>Performance by Holding</h3>
            <ResponsiveContainer width="100%" height={Math.max(300, enrichedHoldings.length * 26)}>
              <BarChart data={[...enrichedHoldings].sort((a, b) => b.gainPct - a.gainPct)} layout="vertical" margin={{ left: 90, right: 20 }}>
                <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="ticker" tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip formatter={(v) => [`${v.toFixed(2)}%`, "Return"]} contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e2e8f0", fontSize: 12 }} />
                <Bar dataKey="gainPct" radius={[0, 4, 4, 0]}>
                  {[...enrichedHoldings].sort((a, b) => b.gainPct - a.gainPct).map((h, i) => <Cell key={i} fill={h.gainPct >= 0 ? "#34d399" : "#f87171"} fillOpacity={0.7} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ============ HOLDINGS TABLE ============ */}
      {view === "holdings" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["All", ...new Set([...geoData.map(g => g.name), ...sectorData.map(s => s.name), ...classData.map(c => c.name)])].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ ...btnBase, padding: "5px 12px", borderRadius: 6, border: "1px solid", borderColor: filter === f ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)", background: filter === f ? "rgba(99,102,241,0.15)" : "transparent", color: filter === f ? "#a5b4fc" : "#94a3b8", fontSize: 12 }}>
                  {f}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddModal(true)} style={{ ...btnBase, padding: "8px 18px", borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#fff", fontSize: 13 }}>+ Add Holding</button>
          </div>

          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th onClick={() => toggleSort("name")} style={headerStyle}>Name<SortArrow col="name" /></th>
                    <th onClick={() => toggleSort("ticker")} style={{ ...headerStyle, width: 70 }}>Ticker<SortArrow col="ticker" /></th>
                    <th onClick={() => toggleSort("assetClass")} style={headerStyle}>Class<SortArrow col="assetClass" /></th>
                    <th onClick={() => toggleSort("value")} style={{ ...headerStyle, textAlign: "right" }}>Value<SortArrow col="value" /></th>
                    <th onClick={() => toggleSort("gain")} style={{ ...headerStyle, textAlign: "right" }}>P&L<SortArrow col="gain" /></th>
                    <th onClick={() => toggleSort("gainPct")} style={{ ...headerStyle, textAlign: "right" }}>Return<SortArrow col="gainPct" /></th>
                    <th onClick={() => toggleSort("sector")} style={headerStyle}>Sector<SortArrow col="sector" /></th>
                    <th onClick={() => toggleSort("geo")} style={headerStyle}>Geo<SortArrow col="geo" /></th>
                    <th style={{ ...headerStyle, textAlign: "right" }}>Weight</th>
                    <th style={{ ...headerStyle, width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoldings.map((h, i) => (
                    <tr key={h.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "11px 12px", fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>
                        {h.name}
                        {h.pie && <span style={{ fontSize: 10, color: "#6366f1", marginLeft: 6, background: "rgba(99,102,241,0.15)", padding: "2px 6px", borderRadius: 4 }}>{h.pie}</span>}
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>{h.ticker}</td>
                      <td style={{ padding: "11px 12px", fontSize: 12, color: "#94a3b8" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: CLASS_COLORS[h.assetClass] || "#475569" }} />{h.assetClass}
                        </span>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 13, color: "#f1f5f9", textAlign: "right", fontWeight: 600 }}>{fmt(h.value)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 13, textAlign: "right", fontWeight: 500, color: h.gain >= 0 ? "#34d399" : "#f87171" }}>{fmtSigned(h.gain)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 13, textAlign: "right", fontWeight: 600, color: h.gainPct >= 0 ? "#34d399" : "#f87171" }}>{fmtPct(h.gainPct)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 12, color: "#94a3b8" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: hashColor(h.sector) }} />{h.sector}
                        </span>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 12, color: "#94a3b8" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: hashColor(h.geo) }} />{h.geo}
                        </span>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 12, color: "#64748b", textAlign: "right" }}>{totalValue > 0 ? ((h.value / totalValue) * 100).toFixed(1) : 0}%</td>
                      <td style={{ padding: "11px 6px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <button onClick={() => handleEditHolding(h)} style={{ ...btnBase, background: "none", color: "#64748b", fontSize: 13, padding: "2px 6px", borderRadius: 4 }} title="Edit holding">✎</button>
                        <button onClick={() => handleRemoveHolding(h.id)} style={{ ...btnBase, background: "none", color: "#475569", fontSize: 14, padding: "2px 6px", borderRadius: 4 }} title="Remove holding">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)" }}>
                    <td colSpan={3} style={{ padding: "12px", fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>Total ({sortedHoldings.length} holdings)</td>
                    <td style={{ padding: "12px", fontSize: 13, fontWeight: 700, color: "#f1f5f9", textAlign: "right" }}>{fmt(sortedHoldings.reduce((s, h) => s + h.value, 0))}</td>
                    <td style={{ padding: "12px", fontSize: 13, fontWeight: 600, textAlign: "right", color: sortedHoldings.reduce((s, h) => s + h.gain, 0) >= 0 ? "#34d399" : "#f87171" }}>{fmtSigned(sortedHoldings.reduce((s, h) => s + h.gain, 0))}</td>
                    <td colSpan={4}></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============ GEOGRAPHY ============ */}
      {view === "geography" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, marginBottom: 24 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 20px", color: "#cbd5e1" }}>By Region</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={geoData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} strokeWidth={0}>{geoData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip content={<CustomTooltip />} /></PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px", color: "#cbd5e1" }}>Regional Breakdown</h3>
              {geoData.map((g, i) => {
                const hlds = enrichedHoldings.filter(h => h.geo === g.name);
                return (
                  <div key={i} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: g.color }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{g.name}</span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>{hlds.length} holding{hlds.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{fmt(g.value)} <span style={{ color: "#64748b", fontWeight: 400 }}>({g.pct}%)</span></div>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${g.pct}%`, background: g.color, borderRadius: 3, transition: "width 0.5s" }} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {hlds.map((h, j) => (<span key={j} style={{ fontSize: 11, padding: "2px 8px", background: "rgba(255,255,255,0.05)", borderRadius: 4, color: "#94a3b8" }}>{h.ticker} {fmt(h.value)}</span>))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {geoData[0] && parseFloat(geoData[0].pct) > 40 && (
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fbbf24" }}>Concentration Alert</div>
                <div style={{ fontSize: 12, color: "#d4a373" }}>{geoData[0].pct}% of your portfolio is in {geoData[0].name}. Consider whether this exceeds your target allocation.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ SECTORS ============ */}
      {view === "sectors" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 20px", color: "#cbd5e1" }}>By Sector</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={sectorData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} strokeWidth={0}>{sectorData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip content={<CustomTooltip />} /></PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px", color: "#cbd5e1" }}>Sector Breakdown</h3>
              {sectorData.map((s, i) => {
                const hlds = enrichedHoldings.filter(h => h.sector === s.name);
                const sectorGain = hlds.reduce((sum, h) => sum + h.gain, 0);
                return (
                  <div key={i} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{s.name}</span>
                        <span style={{ fontSize: 11, color: sectorGain >= 0 ? "#34d399" : "#f87171" }}>{fmtSigned(sectorGain)}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{fmt(s.value)} <span style={{ color: "#64748b", fontWeight: 400 }}>({s.pct}%)</span></div>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${s.pct}%`, background: s.color, borderRadius: 3, transition: "width 0.5s" }} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {hlds.map((h, j) => (<span key={j} style={{ fontSize: 11, padding: "2px 8px", background: "rgba(255,255,255,0.05)", borderRadius: 4, color: "#94a3b8" }}>{h.ticker} {fmt(h.value)}</span>))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============ ASSET CLASSES ============ */}
      {view === "classes" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 20px", color: "#cbd5e1" }}>By Asset Class</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={classData} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} strokeWidth={0}>{classData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip content={<CustomTooltip />} /></PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 16px", color: "#cbd5e1" }}>Asset Class Breakdown</h3>
              {classData.map((c, i) => {
                const hlds = enrichedHoldings.filter(h => h.assetClass === c.name);
                const classGain = hlds.reduce((sum, h) => sum + h.gain, 0);
                return (
                  <div key={i} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{c.name}</span>
                        <span style={{ fontSize: 11, color: classGain >= 0 ? "#34d399" : "#f87171" }}>{fmtSigned(classGain)}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{fmt(c.value)} <span style={{ color: "#64748b", fontWeight: 400 }}>({c.pct}%)</span></div>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${c.pct}%`, background: c.color, borderRadius: 3, transition: "width 0.5s" }} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {hlds.map((h, j) => (<span key={j} style={{ fontSize: 11, padding: "2px 8px", background: "rgba(255,255,255,0.05)", borderRadius: 4, color: "#94a3b8" }}>{h.ticker} {fmt(h.value)}</span>))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 32, padding: "16px 0", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#475569" }}>
          {Object.keys(livePrices).length > 0 ? `Live prices for ${Object.keys(livePrices).length} symbols via Yahoo Finance` : "Using manual prices"} · Values in GBP · FX: 1 USD = £{fxRates.USD.toFixed(4)}, 1 EUR = £{fxRates.EUR.toFixed(4)}
        </span>
        <span style={{ fontSize: 11, color: "#475569" }}>Portfolio Dashboard v2</span>
      </div>

      {showAddModal && <HoldingModal onClose={() => { setShowAddModal(false); setEditingHolding(null); }} onSave={handleSaveHolding} editing={editingHolding} sectorOptions={sectorOptions} geoOptions={geoOptions} />}
    </div>
  );
}

export default PortfolioDashboard;
