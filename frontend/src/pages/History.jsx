import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Dumbbell, Heart } from 'lucide-react';
import api from '../api';

function formatDuration(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(d) {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function History() {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('strength');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.get(`/workouts/history?type=${tab}`)
      .then(res => { setWorkouts(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tab]);

  const isCardio = tab === 'cardio';

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Workout Log</h1>
      </div>

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

      {loading ? (
        <div className="loading">Loading...</div>
      ) : workouts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            {isCardio ? <Heart size={52} /> : <Clock size={52} />}
          </div>
          <h3>No {isCardio ? 'Cardio' : 'Strength'} History</h3>
          <p>Complete a {isCardio ? 'cardio' : 'strength'} workout to see it here</p>
        </div>
      ) : (
        workouts.map(w => (
          <div
            key={w.id}
            className={`history-item ${isCardio ? 'history-item-cardio' : ''}`}
            onClick={() => navigate(`/history/${w.id}`)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="history-date">{formatDate(w.completed_at)}</div>
                <div className="history-workout-name">{w.template_name}</div>
              </div>
              <ChevronRight size={18} color="var(--text-muted)" style={{ marginTop: 4 }} />
            </div>
            <div className="history-stats">
              <div>
                <div className="history-stat-value" style={isCardio ? { color: 'var(--accent-secondary)' } : {}}>
                  {formatDuration(w.duration_seconds)}
                </div>
                <div className="history-stat-label">Duration</div>
              </div>
              <div>
                <div className="history-stat-value" style={isCardio ? { color: 'var(--accent-secondary)' } : {}}>
                  {w.exercise_count}
                </div>
                <div className="history-stat-label">Exercises</div>
              </div>
              {!isCardio && (
                <div>
                  <div className="history-stat-value">{w.total_sets_completed}</div>
                  <div className="history-stat-label">Sets Done</div>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
