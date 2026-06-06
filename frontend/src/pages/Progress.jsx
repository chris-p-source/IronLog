import React, { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import api from '../api';

function shortDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-accent)',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 13,
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6, fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11 }}>
        {label}
      </div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 16 }}>
          {p.value != null ? p.value : '—'}
          {p.dataKey === 'max_weight' && ' kg'}
          {p.dataKey === 'total_volume' && ' vol'}
          {p.dataKey === 'max_reps' && ' reps'}
          {p.dataKey === 'sets_completed' && ' sets'}
        </div>
      ))}
    </div>
  );
};

export default function Progress() {
  const [exercises, setExercises] = useState([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/progress/exercises').then(res => {
      setExercises(res.data);
      if (res.data.length > 0) setSelected(res.data[0]);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setData(null);
    api.get(`/progress/exercise/${encodeURIComponent(selected)}`)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selected]);

  const chartData = data?.sessions.map(s => ({
    date: shortDate(s.workout_date),
    max_weight: s.max_weight ? parseFloat(parseFloat(s.max_weight).toFixed(1)) : null,
    total_volume: s.total_volume ? Math.round(parseFloat(s.total_volume)) : null,
    sets_completed: parseInt(s.sets_completed) || 0,
    max_reps: parseInt(s.max_reps) || 0,
  })) || [];

  const hasWeight = chartData.some(d => d.max_weight != null);
  const hasVolume = chartData.some(d => d.total_volume != null && d.total_volume > 0);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Pro<span>gress</span></h1>
      </div>

      {exercises.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><TrendingUp size={52} /></div>
          <h3>No Data Yet</h3>
          <p>Complete workouts to start tracking your progress here</p>
        </div>
      ) : (
        <>
          <div className="form-group">
            <label className="form-label">Exercise</label>
            <select
              className="exercise-picker"
              value={selected}
              onChange={e => setSelected(e.target.value)}
            >
              {exercises.map(ex => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
          </div>

          {loading && <div className="loading">Loading...</div>}

          {data && !loading && (
            <>
              {/* Stats */}
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="stat-box-value">
                    {data.pr?.pr_weight ? `${parseFloat(data.pr.pr_weight)} kg` : '—'}
                  </div>
                  <div className="stat-box-label">PR Weight</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-value">{data.pr?.pr_reps || '—'}</div>
                  <div className="stat-box-label">PR Reps</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-value">{data.sessions.length}</div>
                  <div className="stat-box-label">Sessions</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-value">
                    {data.sessions.reduce((a, s) => a + (parseInt(s.sets_completed) || 0), 0)}
                  </div>
                  <div className="stat-box-label">Total Sets</div>
                </div>
              </div>

              {/* Max weight over time */}
              {hasWeight && (
                <div className="chart-container">
                  <div className="chart-title">Max Weight per Session (kg)</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="max_weight"
                        stroke="#e63030"
                        strokeWidth={2.5}
                        dot={{ fill: '#e63030', r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Total volume */}
              {hasVolume && (
                <div className="chart-container">
                  <div className="chart-title">Total Volume (kg × reps)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="total_volume"
                        stroke="#ff6b00"
                        strokeWidth={2.5}
                        dot={{ fill: '#ff6b00', r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Max reps */}
              <div className="chart-container">
                <div className="chart-title">Max Reps per Session</div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                    <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="max_reps"
                      stroke="#00c896"
                      strokeWidth={2.5}
                      dot={{ fill: '#00c896', r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Sets completed */}
              <div className="chart-container">
                <div className="chart-title">Sets Completed per Session</div>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                    <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="sets_completed"
                      stroke="#7c5cfc"
                      strokeWidth={2.5}
                      dot={{ fill: '#7c5cfc', r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
