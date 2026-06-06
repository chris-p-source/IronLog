import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, Dumbbell, Calendar, Lock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../api';

function formatDate(d) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function shortDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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

      {/* Profile hero */}
      <div className="user-profile-hero">
        <div className="user-profile-avatar">
          {profile.avatar_data
            ? <img src={profile.avatar_data} alt={profile.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 32, color: 'var(--accent)' }}>{initials}</span>
          }
        </div>
        <div className="user-profile-name">{profile.username}</div>
        <div className="user-profile-since">Member since {formatDate(profile.created_at)}</div>
      </div>

      {/* Stats grid */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-box">
          <div className="stat-box-value" style={{ color: 'var(--accent)' }}>{profile.total_points?.toLocaleString() || 0}</div>
          <div className="stat-box-label">Total Points</div>
        </div>
        <div className="stat-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 24 }}>🥇</span>
            <div className="stat-box-value">{profile.gold_medals || 0}</div>
          </div>
          <div className="stat-box-label">Gold Medals</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-value">{profile.total_workouts || 0}</div>
          <div className="stat-box-label">Workouts</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-value" style={{ fontSize: 16 }}>
            {profile.last_workout ? formatDate(profile.last_workout) : '—'}
          </div>
          <div className="stat-box-label">Last Workout</div>
        </div>
      </div>

      {/* Exercise progress (public profiles only) */}
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

          {progressData && (
            <>
              {chartData.some(d => d.max_weight != null) && (
                <div className="chart-container">
                  <div className="chart-title">Max Weight (kg)</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1c" />
                      <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 13 }} />
                      <Line type="monotone" dataKey="max_weight" stroke="#e63030" strokeWidth={2.5} dot={{ fill: '#e63030', r: 4, strokeWidth: 0 }} connectNulls />
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
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: 13 }} />
                    <Line type="monotone" dataKey="max_reps" stroke="#00c896" strokeWidth={2.5} dot={{ fill: '#00c896', r: 4, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}

      {me?.username !== username && !profile.is_public && (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, marginTop: 20 }}>
          Progress charts are hidden on private profiles
        </div>
      )}
    </div>
  );
}
