import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
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
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function WorkoutDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/workouts/${sessionId}`)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(() => navigate('/history'));
  }, [sessionId]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!data) return null;

  const { session, exercises } = data;
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0);
  const totalVolume = exercises.reduce((a, ex) =>
    a + ex.sets.reduce((b, s) => b + (s.weight_kg ? s.weight_kg * s.reps_completed : 0), 0), 0
  );

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/history')}>
          <ArrowLeft size={15} /> History
        </button>
      </div>

      <h1 className="page-title" style={{ marginBottom: 4 }}>
        {session.template_name}
      </h1>
      <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
        {formatDate(session.completed_at)}
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        <div className="stat-box">
          <div className="stat-box-value">{formatDuration(session.duration_seconds)}</div>
          <div className="stat-box-label">Duration</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-value">{exercises.length}</div>
          <div className="stat-box-label">Exercises</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-value">{totalSets}</div>
          <div className="stat-box-label">Sets Done</div>
        </div>
      </div>

      {totalVolume > 0 && (
        <div className="stat-box" style={{ marginBottom: 20 }}>
          <div className="stat-box-value">{Math.round(totalVolume).toLocaleString()} kg</div>
          <div className="stat-box-label">Total Volume Lifted</div>
        </div>
      )}

      {session.notes && (
        <div className="workout-notes-box" style={{ marginBottom: 20 }}>
          <div className="section-heading" style={{ marginBottom: 6 }}>Notes</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {session.notes}
          </div>
        </div>
      )}

      <div className="section-heading">Exercises</div>

      {exercises.map(ex => (
        <div key={ex.id} className="detail-exercise">
          <div className="detail-exercise-header">
            <span>{ex.exercise_name}</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13 }}>
              {ex.sets_planned} planned
            </span>
          </div>
          {ex.sets.length === 0 ? (
            <div style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 13 }}>
              No sets logged
            </div>
          ) : (
            ex.sets.map(s => (
              <div key={s.id} className="detail-set-row">
                <CheckCircle2 size={15} color="var(--success)" strokeWidth={2.5} />
                <span style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-display)', textTransform: 'uppercase', minWidth: 44 }}>
                  Set {s.set_number}
                </span>
                <span style={{ fontWeight: 600 }}>{s.reps_completed} reps</span>
                {s.weight_kg && (
                  <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 16 }}>
                    {parseFloat(s.weight_kg)} kg
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      ))}

      <div style={{ height: 20 }} />
    </div>
  );
}
