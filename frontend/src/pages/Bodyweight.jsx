import React, { useState, useEffect } from 'react';
import { Scale } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../api';

function shortDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)',
      borderRadius: 10, padding: '10px 14px',
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11 }}>
        {label}
      </div>
      <div style={{ color: payload[0].color, fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 16 }}>
        {payload[0].value} kg
      </div>
    </div>
  );
};

export default function Bodyweight() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get('/bodyweight')
      .then(res => { setEntries(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleLog = async () => {
    const w = parseFloat(weight);
    if (!w || w <= 0) return;
    setSaving(true);
    try {
      await api.post('/bodyweight', { weight_kg: w });
      setWeight('');
      load();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const chartData = entries.map(e => ({
    date: shortDate(e.logged_at),
    weight: parseFloat(e.weight_kg),
  }));

  const latest = entries[entries.length - 1];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Bodyweight</h1>
      </div>

      <div className="form-group">
        <label className="form-label">Log Today's Weight (kg)</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            className="form-input"
            type="number" min={0} step={0.1} inputMode="decimal"
            placeholder={latest ? String(parseFloat(latest.weight_kg)) : 'e.g. 82.5'}
            value={weight}
            onChange={e => setWeight(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleLog} disabled={saving || !weight}>
            {saving ? 'Saving...' : 'Log'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Scale size={52} /></div>
          <h3>No Bodyweight Logged Yet</h3>
          <p>Log your weight regularly to track trends over time</p>
        </div>
      ) : (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 20 }}>
            <div className="stat-box">
              <div className="stat-box-value">{parseFloat(latest.weight_kg)} kg</div>
              <div className="stat-box-label">Latest</div>
            </div>
            <div className="stat-box">
              <div className="stat-box-value">{entries.length}</div>
              <div className="stat-box-label">Entries</div>
            </div>
          </div>

          <div className="chart-container">
            <div className="chart-title">Bodyweight Over Time (kg)</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="weight" stroke="#e63030" strokeWidth={2.5}
                  dot={{ fill: '#e63030', r: 3, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div style={{ height: 20 }} />
    </div>
  );
}
