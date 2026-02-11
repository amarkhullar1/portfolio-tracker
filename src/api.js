const API_BASE = '/api';

export const storage = {
  async getHoldings() {
    try {
      const res = await fetch(`${API_BASE}/holdings`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.error('Failed to fetch holdings:', e);
    }
    return null;
  },

  async saveHoldings(holdings) {
    try {
      const res = await fetch(`${API_BASE}/holdings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holdings),
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to save holdings:', e);
      return false;
    }
  },

  async getSettings() {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    }
    return {};
  },

  async saveSettings(settings) {
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      return res.ok;
    } catch (e) {
      console.error('Failed to save settings:', e);
      return false;
    }
  },
};

export const yahoo = {
  async quotes(symbols) {
    const res = await fetch(`${API_BASE}/yahoo/quotes?symbols=${encodeURIComponent(symbols.join(','))}`);
    if (res.ok) return await res.json();
    throw new Error('Quotes fetch failed');
  },

  async fx() {
    const res = await fetch(`${API_BASE}/yahoo/fx`);
    if (res.ok) return await res.json();
    throw new Error('FX fetch failed');
  },

  async lookup(symbol) {
    const res = await fetch(`${API_BASE}/yahoo/lookup?symbol=${encodeURIComponent(symbol)}`);
    if (res.ok) return await res.json();
    throw new Error('Lookup failed');
  },
};
