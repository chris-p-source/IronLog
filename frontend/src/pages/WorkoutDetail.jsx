import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Pencil, Check, X } from 'lucide-react';
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

function EditableSet({ sessionId, set, onSave }) {
  const [reps, setReps] = useState(String(set.reps_completed ?? ''));
  const [weight, setWeight] = useState(String(set.weight_kg ? parseFloat(set.weight_kg) : ''));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/workouts/${sessionId}/sets/${set.id}`, {
        reps_completed: parseInt(reps) || 0,
        weight_kg: weight !== '' ? parseFloat(weight) : null,
      });
      onSave(res.data);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <div className="detail-set-row" style={{ gap: 8, alignItems: 'center' }}>
      <CheckCircle2 size={15} color="var(--success)" strokeWidth={2.5} />
      <span style={{ color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-display)', textTransform: 'uppercase', minWidth: 44 }}>
        Set {set.set_number}
      </span>
      <input
        className="edit-inline-input"
        type="number"
        value={reps}
        onChange={e => setReps(e.target.value)}
        onBlur={handleSave}
        placeholder="reps"
        min="0"
        style={{ width: 54 }}
      />
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>reps</span>
      <input
        className="edit-inline-input"
        type="number"
        value={weight}
        onChange={e => setWeight(e.target.value)}
        onBlur={handleSave}
        placeholder="kg"
        min="0"
        step="0.5"
        style={{ width: 60, marginLeft: 'auto' }}
      />
      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>kg</span>
    </div>
  );
}

function EditableCardioExercise({ sessionId, exercise, onSave }) {
  const metrics = exercise.cardio_metrics || {};
  const [duration, setDuration] = useState(String(exercise.actual_duration_minutes ? parseFloat(exercise.actual_duration_minutes) : ''));
  const [distance, setDistance] = useState(String(metrics.distance_km ?? metrics.distance_m ?? ''));

  const handleSave = async () => {
    const updatedMetrics = { ...metrics };
    if (distance !== '') {
      if (metrics.distance_km !== undefined) updatedMetrics.distance_km = parseFloat(distance);
      else if (metrics.distance_m !== undefined) updatedMetrics.distance_m = parseFloat(distance);
    }
    try {
      const res = await api.put(`/workouts/${sessionId}/exercises/${exercise.id}`, {
        actual_duration_minutes: duration !== '' ? parseFloat(duration) : null,
        cardio_metrics: updatedMetrics,
      });
      onSave(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const distanceUnit = metrics.distance_km !== undefined ? 'km' : metrics.distance_m !== undefined ? 'm' : null;

  return (
    <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 70 }}>Duration</span>
        <input
          className="edit-inline-input"
          type="number"
          value={duration}
          onChange={e => setDuration(e.target.value)}
          onBlur={handleSave}
          placeholder="min"
          min="0"
          step="0.5"
          style={{ width: 70 }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>min</span>
      </div>
      {distanceUnit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 70 }}>Distance</span>
          <input
            className="edit-inline-input"
            type="number"
            value={distance}
            onChange={e => setDistance(e.target.value)}
            onBlur={handleSave}
            placeholder={distanceUnit}
            min="0"
            step="0.01"
            style={{ width: 70 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{distanceUnit}</span>
        </div>
      )}
    </div>
  );
}

export default function WorkoutDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/workouts/${sessionId}`)
      .then(res => {
        setData(res.data);
        setNotes(res.data.session.notes || '');
        setLoading(false);
      })
      .catch(() => navigate('/history'));
  }, [sessionId]);

  const handleSaveSession = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/workouts/${sessionId}`, { notes });
      setData(d => ({ ...d, session: { ...d.session, notes: res.data.notes } }));
      setEditing(false);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const handleSetSaved = (exerciseId, updatedSet) => {
    setData(d => ({
      ...d,
      exercises: d.exercises.map(ex =>
        ex.id === exerciseId
          ? { ...ex, sets: ex.sets.map(s => s.id === updatedSet.id ? { ...s, ...updatedSet } : s) }
          : ex
      ),
    }));
  };

  const handleExerciseSaved = (exerciseId, updatedEx) => {
    setData(d => ({
      ...d,
      exercises: d.exercises.map(ex => ex.id === exerciseId ? { ...ex, ...updatedEx } : ex),
    }));
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!data) return null;

  const { session, exercises } = data;
  const totalSets = exercises.reduce((a, e) => a + e.sets.length, 0);
  const totalVolume = exercises.reduce((a, ex) =>
    a + ex.sets.reduce((b, s) => b + (s.weight_kg ? parseFloat(s.weight_kg) * s.reps_completed : 0), 0), 0
  );

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/history')}>
          <ArrowLeft size={15} /> History
        </button>
        {editing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => { setEditing(false); setNotes(session.notes || ''); }}>
              <X size={13} /> Cancel
            </button>
            <button className="btn btn-sm btn-primary" onClick={handleSaveSession} disabled={saving}>
              <Check size={13} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <button className="btn btn-sm btn-secondary" onClick={() => setEditing(true)}>
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>

      <h1 className="page-title" style={{ marginBottom: 4 }}>{session.template_name}</h1>
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

      {/* Notes */}
      <div style={{ marginBottom: 20 }}>
        <div className="section-heading" style={{ marginBottom: 8 }}>Notes</div>
        {editing ? (
          <textarea
            className="form-input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes about this workout…"
            rows={3}
            style={{ resize: 'none', lineHeight: 1.5 }}
          />
        ) : session.notes ? (
          <div className="workout-notes-box">
            <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {session.notes}
            </div>
          </div>
        ) : editing ? null : (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No notes</div>
        )}
      </div>

      <div className="section-heading">Exercises</div>

      {exercises.map(ex => (
        <div key={ex.id} className="detail-exercise">
          <div className="detail-exercise-header">
            <span>{ex.exercise_name}</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13 }}>
              {ex.sets_planned} planned
            </span>
          </div>

          {ex.exercise_type === 'cardio' ? (
            editing ? (
              <EditableCardioExercise
                sessionId={sessionId}
                exercise={ex}
                onSave={updated => handleExerciseSaved(ex.id, updated)}
              />
            ) : (
              <div style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
                {ex.actual_duration_minutes ? `${parseFloat(ex.actual_duration_minutes)} min` : 'No duration logged'}
                {ex.cardio_metrics?.distance_km && ` · ${ex.cardio_metrics.distance_km} km`}
                {ex.cardio_metrics?.distance_m && ` · ${ex.cardio_metrics.distance_m} m`}
              </div>
            )
          ) : ex.sets.length === 0 ? (
            <div style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 13 }}>No sets logged</div>
          ) : editing ? (
            ex.sets.map(s => (
              <EditableSet
                key={s.id}
                sessionId={sessionId}
                set={s}
                onSave={updated => handleSetSaved(ex.id, updated)}
              />
            ))
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
