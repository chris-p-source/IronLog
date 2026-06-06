import React, { useState, useEffect } from 'react';
import { TrendingUp, Dumbbell, Heart } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import api from '../api';

function shortDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const METRIC_LABELS = {
  max_weight: 'Max Weight',
  total_volume: 'Total Volume',
  max_reps: 'Max Reps',
  sets_completed: 'Sets',
  duration: 'Duration',
  distance_km: 'Distance',
  distance_m: 'Distance',
  avg_pace: 'Avg Pace',
  avg_speed: 'Avg Speed',
  laps: 'Laps',
};
const METRIC_UNITS = {
  max_weight: 'kg',
  total_volume: 'kg·reps',
  max_reps: 'reps',
  sets_completed: 'sets',
  duration: 'min',
  distance_km: 'km',
  distance_m: 'm',
  avg_speed: 'km/h',
  laps: 'laps',
};

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
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 16 }}>
          {p.value != null ? p.value : '—'}
          {METRIC_UNITS[p.dataKey] ? ` ${METRIC_UNITS[p.dataKey]}` : ''}
          <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 4, color: 'var(--text-secondary)' }}>
            {METRIC_LABELS[p.dataKey] || p.dataKey}
          </span>
        </div>
      ))}
    </div>
  );
};

function ChartCard({ title, children }) {
  return (
    <div className="chart-container">
      <div className="chart-title">{title}</div>
      {children}
    </div>
  );
}

export default function Progress() {
  const [tab, setTab] = useState('strength');
  const [exercises, setExercises] = useState([]);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Reload exercise list when tab changes
  useEffect(() => {
    setSelected('');
    setData(null);
    api.get(`/progress/exercises?type=${tab}`)
      .then(res => {
        setExercises(res.data);
        if (res.data.length > 0) setSelected(res.data[0]);
      })
      .catch(() => setExercises([]));
  }, [tab]);

  // Reload chart data when selected exercise changes
  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setData(null);
    api.get(`/progress/exercise/${encodeURIComponent(selected)}`)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selected]);

  // ── Strength chart data ──
  const strengthChart = data?.exercise_type === 'strength'
    ? data.sessions.map(s => ({
        date: shortDate(s.workout_date),
        max_weight: s.max_weight ? parseFloat(parseFloat(s.max_weight).toFixed(1)) : null,
        total_volume: s.total_volume ? Math.round(parseFloat(s.total_volume)) : null,
        sets_completed: parseInt(s.sets_completed) || 0,
        max_reps: parseInt(s.max_reps) || 0,
      }))
    : [];

  // ── Cardio chart data ──
  const cardioChart = data?.exercise_type === 'cardio'
    ? data.sessions.map(s => {
        const m = s.cardio_metrics || {};
        return {
          date: shortDate(s.workout_date),
          duration: s.actual_duration_minutes ? parseFloat(parseFloat(s.actual_duration_minutes).toFixed(1)) : null,
          distance_km: m.distance_km ? parseFloat(parseFloat(m.distance_km).toFixed(2)) : null,
          distance_m: m.distance_m ? parseInt(m.distance_m) : null,
          avg_speed: m.avg_speed ? parseFloat(parseFloat(m.avg_speed).toFixed(1)) : null,
          laps: m.laps ? parseInt(m.laps) : null,
        };
      })
    : [];

  const hasCardioMetric = (key) => cardioChart.some(d => d[key] != null);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Progress</h1>
      </div>

      {/* Strength / Cardio tabs */}
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        <button
          className={`tab-btn ${tab === 'strength' ? 'active' : ''}`}
          onClick={() => setTab('strength')}
        >
          <Dumbbell size={13} /> Strength
        </button>
        <button
          className={`tab-btn ${tab === 'cardio' ? 'active' : ''}`}
          onClick={() => setTab('cardio')}
          style={tab === 'cardio' ? { background: 'var(--accent-secondary)' } : {}}
        >
          <Heart size={13} /> Cardio
        </button>
      </div>

      {exercises.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            {tab === 'cardio' ? <Heart size={52} /> : <TrendingUp size={52} />}
          </div>
          <h3>No {tab === 'cardio' ? 'Cardio' : 'Strength'} Data Yet</h3>
          <p>Complete {tab} workouts to start tracking your progress here</p>
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

          {/* ── Strength charts ── */}
          {data?.exercise_type === 'strength' && !loading && (
            <>
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="stat-box-value">{data.pr?.pr_weight ? `${parseFloat(data.pr.pr_weight)} kg` : '—'}</div>
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

              {strengthChart.some(d => d.max_weight != null) && (
                <ChartCard title="Max Weight per Session (kg)">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={strengthChart} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="max_weight" stroke="#e63030" strokeWidth={2.5}
                        dot={{ fill: '#e63030', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {strengthChart.some(d => d.total_volume != null && d.total_volume > 0) && (
                <ChartCard title="Total Volume (kg × reps)">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={strengthChart} margin={{ top: 4, right: 8, left: -8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="total_volume" stroke="#ff6b00" strokeWidth={2.5}
                        dot={{ fill: '#ff6b00', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              <ChartCard title="Max Reps per Session">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={strengthChart} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                    <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="max_reps" stroke="#00c896" strokeWidth={2.5}
                      dot={{ fill: '#00c896', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Sets Completed per Session">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={strengthChart} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                    <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="sets_completed" fill="#7c5cfc" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </>
          )}

          {/* ── Cardio charts ── */}
          {data?.exercise_type === 'cardio' && !loading && (
            <>
              <div className="stat-grid">
                <div className="stat-box">
                  <div className="stat-box-value" style={{ color: 'var(--accent-secondary)' }}>
                    {data.summary.best_duration ? `${data.summary.best_duration} min` : '—'}
                  </div>
                  <div className="stat-box-label">Best Session</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-value" style={{ color: 'var(--accent-secondary)' }}>
                    {data.summary.total_minutes} min
                  </div>
                  <div className="stat-box-label">Total Time</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-value">{data.summary.total_sessions}</div>
                  <div className="stat-box-label">Sessions</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-value">
                    {data.summary.total_sessions > 0
                      ? `${Math.round(data.summary.total_minutes / data.summary.total_sessions)} min`
                      : '—'}
                  </div>
                  <div className="stat-box-label">Avg Duration</div>
                </div>
              </div>

              {/* Duration — always shown */}
              <ChartCard title="Duration per Session (min)">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={cardioChart} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                    <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="duration" fill="#ff6b00" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Distance (km) — e.g. running, cycling */}
              {hasCardioMetric('distance_km') && (
                <ChartCard title="Distance per Session (km)">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={cardioChart} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="distance_km" stroke="#e63030" strokeWidth={2.5}
                        dot={{ fill: '#e63030', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* Distance (m) — e.g. rowing */}
              {hasCardioMetric('distance_m') && (
                <ChartCard title="Distance per Session (m)">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={cardioChart} margin={{ top: 4, right: 8, left: -8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="distance_m" stroke="#e63030" strokeWidth={2.5}
                        dot={{ fill: '#e63030', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* Avg speed — cycling */}
              {hasCardioMetric('avg_speed') && (
                <ChartCard title="Avg Speed per Session (km/h)">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={cardioChart} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="avg_speed" stroke="#00c896" strokeWidth={2.5}
                        dot={{ fill: '#00c896', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* Laps — swimming */}
              {hasCardioMetric('laps') && (
                <ChartCard title="Laps per Session">
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={cardioChart} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="laps" fill="#7c5cfc" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
