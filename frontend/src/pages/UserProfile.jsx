import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../api';

function shortDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function relativeDate(d) {
  if (!d) return '—';
  const days = Math.floor((Date.now() - new Date(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatJoinDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

const METRIC_LABELS = {
  max_weight: 'Max Weight',
  total_volume: 'Total Volume',
  max_reps: 'Max Reps',
  sets_completed: 'Sets',
  avg_weight: 'Avg Weight',
};

const METRIC_UNITS = {
  max_weight: 'kg',
  total_volume: 'kg·reps',
  max_reps: 'reps',
  sets_completed: 'sets',
  avg_weight: 'kg',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)',
      borderRadius: 10, padding: '10px 14px',
    }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginBottom: 6, fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
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

function StatBox({ value, label, color }) {
  return (
    <div className="stat-box">
      <div className="stat-box-value" style={color ? { color } : {}}>{value}</div>
      <div className="stat-box-label">{label}</div>
    </div>
  );
}

export default function UserProfile() {
  const { username } = useParams();
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedExercise, setSelectedExercise] = useState('');
  const [progressData, setProgressData] = useState(null);

  useEffect(() => {
    api.get(`/users/${username}`)
      .then(res => {
        setProfile(res.data);
        if (res.data.exercises?.length) setSelectedExercise(res.data.exercises[0]);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.error || 'Could not load profile');
        setLoading(false);
      });
  }, [username]);

  useEffect(() => {
    if (!selectedExercise || !profile) return;
    api.get(`/progress/exercise/${encodeURIComponent(selectedExercise)}?userId=${profile.id}`)
      .then(res => setProgressData(res.data))
      .catch(() => setProgressData(null));
  }, [selectedExercise, profile]);

  const initials = profile?.username?.slice(0, 2).toUpperCase();

  if (loading) return <div className="loading">Loading...</div>;

  if (error) return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</button>
      </div>
      <div className="empty-state">
        <div className="empty-state-icon"><Lock size={44} /></div>
        <h3>Private Profile</h3>
        <p>{error}</p>
      </div>
    </div>
  );

  const chartData = progressData?.sessions.map(s => ({
    date: shortDate(s.workout_date),
    max_weight: s.max_weight ? parseFloat(parseFloat(s.max_weight).toFixed(1)) : null,
    max_reps: parseInt(s.max_reps) || 0,
  })) || [];

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</button>
      </div>

      {/* Hero */}
      <div className="user-profile-hero">
        <div className="user-profile-avatar">
          {profile.avatar_data
            ? <img src={profile.avatar_data} alt={profile.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 32, color: 'var(--accent)' }}>{initials}</span>
          }
        </div>
        <div className="user-profile-name">{profile.username}</div>
        <div className="user-profile-since">Member since {formatJoinDate(profile.created_at)}</div>
      </div>

      {/* Stats — consistent 2×2 grid */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatBox
          value={profile.total_points?.toLocaleString() ?? 0}
          label="Total Points"
          color="var(--accent)"
        />
        <StatBox
          value={profile.gold_medals ? `🥇 ${profile.gold_medals}` : '—'}
          label="Gold Medals"
        />
        <StatBox
          value={profile.total_workouts ?? 0}
          label="Workouts"
        />
        <StatBox
          value={relativeDate(profile.last_workout)}
          label="Last Workout"
        />
      </div>

      {/* Exercise progress */}
      {profile.exercises?.length > 0 && (
        <>
          <div className="section-heading">Exercise Progress</div>
          <div className="form-group">
            <select
              className="exercise-picker"
              value={selectedExercise}
              onChange={e => setSelectedExercise(e.target.value)}
            >
              {profile.exercises.map(ex => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
          </div>

          {progressData && chartData.length > 0 && (
            <>
              {chartData.some(d => d.max_weight != null) && (
                <div className="chart-container">
                  <div className="chart-title">Max Weight (kg)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="max_weight" stroke="#e63030" strokeWidth={2.5}
                        dot={{ fill: '#e63030', r: 4, strokeWidth: 0 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="chart-container">
                <div className="chart-title">Max Reps per Session</div>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                    <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="max_reps" stroke="#00c896" strokeWidth={2.5}
                      dot={{ fill: '#00c896', r: 4, strokeWidth: 0 }} />
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
