import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { CheckCircle2, Circle, Trophy, Heart, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../api';

const REST_DURATION = 120;

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function formatDateShort(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Per-exercise cardio metric fields based on exercise name
function getCardioFields(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('run') || n.includes('sprint') || n.includes('walk') || n.includes('hik') || n.includes('treadmill')) {
    return [
      { key: 'distance_km', label: 'Distance', unit: 'km', inputMode: 'decimal', step: '0.01' },
      { key: 'avg_pace', label: 'Avg Pace', unit: 'min/km', inputMode: 'text', placeholder: '5:30' },
    ];
  }
  if (n.includes('swim')) {
    return [
      { key: 'laps', label: 'Laps', unit: 'laps', inputMode: 'numeric' },
      { key: 'pool_length', label: 'Pool', unit: 'm', inputMode: 'numeric', placeholder: '25' },
    ];
  }
  if (n.includes('cycl') || n.includes('bike') || n.includes('spin')) {
    return [
      { key: 'distance_km', label: 'Distance', unit: 'km', inputMode: 'decimal', step: '0.1' },
      { key: 'avg_speed', label: 'Avg Speed', unit: 'km/h', inputMode: 'decimal', step: '0.1' },
    ];
  }
  if (n.includes('row') || n.includes('erg')) {
    return [
      { key: 'distance_m', label: 'Distance', unit: 'm', inputMode: 'numeric' },
      { key: 'split_500m', label: 'Split /500m', unit: 'min', inputMode: 'text', placeholder: '2:00' },
    ];
  }
  if (n.includes('jump rope') || n.includes('skip')) {
    return [
      { key: 'skips', label: 'Skips', unit: 'reps', inputMode: 'numeric' },
    ];
  }
  return [];
}

function LastSessionBadge({ data }) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;
  const sets = data.sets || [];
  const best = sets.reduce((a, s) => (!a || (s.weight_kg && parseFloat(s.weight_kg) > parseFloat(a.weight_kg || 0))) ? s : a, null);

  return (
    <div className="last-session-badge" onClick={() => sets.length > 0 && setExpanded(e => !e)}>
      <div className="last-session-header">
        <span className="last-session-label">Last: {formatDateShort(data.completed_at)}</span>
        {best?.weight_kg
          ? <span className="last-session-best">Top: {parseFloat(best.weight_kg)}kg × {best.reps_completed}</span>
          : best
            ? <span className="last-session-best">{best.reps_completed} reps</span>
            : <span className="last-session-best">No sets logged</span>
        }
        {sets.length > 0 && (expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
      </div>
      {expanded && sets.length > 0 && (
        <div className="last-session-sets">
          {sets.map(s => (
            <span key={s.set_number} className="last-session-set">
              S{s.set_number}: {s.reps_completed}r{s.weight_kg ? ` @ ${parseFloat(s.weight_kg)}kg` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function LastCardioSessionBadge({ data }) {
  if (!data?.actual_duration_minutes) return null;
  const m = data.cardio_metrics || {};
  const parts = [`${parseFloat(data.actual_duration_minutes)} min`];
  if (m.distance_km) parts.push(`${m.distance_km} km`);
  if (m.avg_pace) parts.push(`@ ${m.avg_pace} /km`);
  if (m.avg_speed) parts.push(`${m.avg_speed} km/h`);
  if (m.laps) parts.push(`${m.laps} laps`);
  if (m.distance_m) parts.push(`${m.distance_m} m`);

  return (
    <div className="last-session-badge" style={{ borderColor: 'rgba(255,107,0,0.3)' }}>
      <div className="last-session-header">
        <span className="last-session-label">Last: {formatDateShort(data.completed_at)}</span>
        <span className="last-session-best" style={{ color: 'var(--accent-secondary)' }}>{parts.join(' · ')}</span>
      </div>
    </div>
  );
}

export default function RunWorkout() {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [session, setSession] = useState(location.state?.session || null);
  const [exercises, setExercises] = useState(location.state?.exercises || []);
  const [loading, setLoading] = useState(!location.state);
  const [lastSessionData, setLastSessionData] = useState({});

  const [elapsed, setElapsed] = useState(0);
  const [restActive, setRestActive] = useState(false);
  const [restRemaining, setRestRemaining] = useState(REST_DURATION);
  const [restExName, setRestExName] = useState('');

  const [setData, setSetData] = useState({});
  // cardioData: { [exId]: { minutes, done, metrics: { key: value } } }
  const [cardioData, setCardioData] = useState({});
  const [showFinish, setShowFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const elapsedRef = useRef(null);
  const restRef = useRef(null);

  useEffect(() => {
    if (loading) {
      api.get(`/workouts/${sessionId}`)
        .then(res => { setSession(res.data.session); setExercises(res.data.exercises); setLoading(false); })
        .catch(() => navigate('/'));
    }
  }, [sessionId]);

  useEffect(() => {
    if (exercises.length === 0) return;
    const initSets = {};
    const initCardio = {};
    for (const ex of exercises) {
      if (ex.exercise_type === 'cardio') {
        initCardio[ex.id] = { minutes: String(ex.planned_duration_minutes || ''), done: false, metrics: {} };
      } else {
        initSets[ex.id] = {};
        for (let s = 1; s <= ex.sets_planned; s++) {
          initSets[ex.id][s] = { reps: String(ex.reps_planned), weight: '', done: false };
        }
      }
    }
    setSetData(initSets);
    setCardioData(initCardio);

    const fetchLast = async () => {
      const results = {};
      await Promise.all(exercises.map(async (ex) => {
        try {
          const res = await api.get(`/progress/last-session/${encodeURIComponent(ex.exercise_name)}`);
          if (res.data) results[ex.id] = res.data;
        } catch { /* silent */ }
      }));
      setLastSessionData(results);
    };
    fetchLast();
  }, [exercises]);

  useEffect(() => {
    elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(elapsedRef.current);
  }, []);

  useEffect(() => {
    if (!restActive) return;
    restRef.current = setInterval(() => {
      setRestRemaining(r => {
        if (r <= 1) { clearInterval(restRef.current); setRestActive(false); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(restRef.current);
  }, [restActive]);

  const startRest = (exName) => {
    clearInterval(restRef.current);
    setRestRemaining(REST_DURATION);
    setRestExName(exName);
    setRestActive(true);
  };

  const skipRest = () => { clearInterval(restRef.current); setRestActive(false); };

  const updateSet = (exId, setNum, field, value) => {
    setSetData(d => ({ ...d, [exId]: { ...d[exId], [setNum]: { ...d[exId]?.[setNum], [field]: value } } }));
  };

  const updateCardioMetric = (exId, key, value) => {
    setCardioData(d => ({ ...d, [exId]: { ...d[exId], metrics: { ...d[exId].metrics, [key]: value } } }));
  };

  const toggleSet = async (ex, setNum) => {
    const current = setData[ex.id]?.[setNum];
    if (!current) return;
    const nowDone = !current.done;
    updateSet(ex.id, setNum, 'done', nowDone);
    if (nowDone) {
      startRest(ex.exercise_name);
      try {
        await api.post(`/workouts/${sessionId}/log-set`, {
          session_exercise_id: ex.id,
          set_number: setNum,
          reps_completed: Number(current.reps) || 0,
          weight_kg: current.weight ? Number(current.weight) : null,
        });
      } catch (e) { console.error(e); }
    }
  };

  const toggleCardio = async (ex) => {
    const current = cardioData[ex.id];
    if (!current) return;
    const nowDone = !current.done;
    setCardioData(d => ({ ...d, [ex.id]: { ...d[ex.id], done: nowDone } }));
    if (nowDone) {
      try {
        await api.post(`/workouts/${sessionId}/log-cardio`, {
          session_exercise_id: ex.id,
          duration_minutes: Number(current.minutes) || 0,
          cardio_metrics: Object.keys(current.metrics).length > 0 ? current.metrics : null,
        });
      } catch (e) { console.error(e); }
    }
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await api.post(`/workouts/${sessionId}/complete`);
      navigate('/history', { replace: true });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save workout');
      setFinishing(false);
    }
  };

  const strengthExercises = exercises.filter(e => e.exercise_type !== 'cardio');
  const cardioExercises = exercises.filter(e => e.exercise_type === 'cardio');
  const totalSets = strengthExercises.reduce((a, e) => a + e.sets_planned, 0);
  const doneSets = Object.values(setData).reduce((a, ex) => a + Object.values(ex).filter(s => s.done).length, 0);
  const doneCardio = Object.values(cardioData).filter(c => c.done).length;
  const totalDone = doneSets + doneCardio;
  const totalItems = totalSets + cardioExercises.length;
  const pct = totalItems > 0 ? (totalDone / totalItems) * 100 : 0;

  if (loading) {
    return (
      <div style={{ background: 'var(--bg-primary)', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading">Loading workout...</div>
      </div>
    );
  }

  return (
    <div className="workout-page">
      <div className="workout-header">
        <div className="workout-name-label">{session?.template_name}</div>
        <div className="workout-timer-main">{formatTime(elapsed)}</div>
        <div className="workout-progress-row">
          <span className="workout-progress-text">
            <span style={{ color: 'var(--success)', fontWeight: 800 }}>{totalDone}</span>
            <span style={{ color: 'var(--text-muted)' }}>/{totalItems}</span>
          </span>
          <div className="workout-progress-bar">
            <div className="workout-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="workout-progress-text" style={{ color: 'var(--text-muted)' }}>{Math.round(pct)}%</span>
        </div>
      </div>

      <div className="workout-exercises">
        {/* Strength exercises */}
        {strengthExercises.map(ex => {
          const exData = setData[ex.id] || {};
          const allDone = ex.sets_planned > 0 && Object.values(exData).every(s => s.done);
          const last = lastSessionData[ex.id];
          return (
            <div key={ex.id} className={`exercise-workout-card${allDone ? ' all-done' : ''}`}>
              <div className="exercise-workout-header">
                <span className="exercise-workout-name">{ex.exercise_name}</span>
                <span className="exercise-workout-target">
                  {ex.sets_planned} × {ex.reps_planned}
                  {allDone && <span style={{ marginLeft: 8, color: 'var(--success)' }}>✓</span>}
                </span>
              </div>
              <LastSessionBadge data={last} />
              {Array.from({ length: ex.sets_planned }, (_, i) => i + 1).map(setNum => {
                const s = exData[setNum] || { reps: String(ex.reps_planned), weight: '', done: false };
                const lastSet = last?.sets?.find(ls => ls.set_number === setNum);
                return (
                  <div key={setNum} className={`set-row${s.done ? ' set-done' : ''}`}>
                    <span className="set-number">Set {setNum}</span>
                    <div className="set-inputs">
                      <div className="set-input-group">
                        <span className="set-input-label">Reps</span>
                        <input
                          className="set-input"
                          type="number" min={0}
                          value={s.reps}
                          onChange={e => updateSet(ex.id, setNum, 'reps', e.target.value)}
                          disabled={s.done}
                          placeholder={lastSet ? String(lastSet.reps_completed) : ''}
                        />
                      </div>
                      <div className="set-input-group">
                        <span className="set-input-label">kg</span>
                        <input
                          className="set-input"
                          type="number" min={0} step={0.5}
                          value={s.weight}
                          onChange={e => updateSet(ex.id, setNum, 'weight', e.target.value)}
                          disabled={s.done}
                          placeholder={lastSet?.weight_kg ? String(parseFloat(lastSet.weight_kg)) : '—'}
                        />
                      </div>
                    </div>
                    <button
                      className={`set-done-btn${s.done ? ' done' : ''}`}
                      onClick={() => toggleSet(ex, setNum)}
                    >
                      {s.done ? <CheckCircle2 size={17} strokeWidth={2.5} /> : <Circle size={17} />}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Cardio exercises */}
        {cardioExercises.map(ex => {
          const cd = cardioData[ex.id] || { minutes: '', done: false, metrics: {} };
          const last = lastSessionData[ex.id];
          const extraFields = getCardioFields(ex.exercise_name);
          return (
            <div key={ex.id} className={`exercise-workout-card cardio-card${cd.done ? ' all-done' : ''}`}>
              <div className="exercise-workout-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Heart size={15} color="var(--accent-secondary)" />
                  <span className="exercise-workout-name">{ex.exercise_name}</span>
                </div>
                <span className="exercise-workout-target" style={{ color: 'var(--accent-secondary)' }}>
                  {ex.planned_duration_minutes}min planned
                  {cd.done && <span style={{ marginLeft: 8, color: 'var(--success)' }}>✓</span>}
                </span>
              </div>

              <LastCardioSessionBadge data={last} />

              {/* Duration row */}
              <div className="set-row">
                <span className="set-number">Time</span>
                <div className="set-inputs">
                  <div className="set-input-group">
                    <span className="set-input-label">Minutes</span>
                    <input
                      className="set-input"
                      style={{ width: 76, borderColor: cd.done ? 'var(--border-accent)' : 'rgba(255,107,0,0.4)' }}
                      type="number" min={0} step={1}
                      value={cd.minutes}
                      onChange={e => setCardioData(d => ({ ...d, [ex.id]: { ...d[ex.id], minutes: e.target.value } }))}
                      disabled={cd.done}
                      placeholder={String(ex.planned_duration_minutes || '')}
                    />
                  </div>
                </div>
                <button
                  className={`set-done-btn${cd.done ? ' done' : ''}`}
                  style={!cd.done ? { borderColor: 'rgba(255,107,0,0.5)' } : {}}
                  onClick={() => toggleCardio(ex)}
                >
                  {cd.done ? <CheckCircle2 size={17} strokeWidth={2.5} /> : <Circle size={17} />}
                </button>
              </div>

              {/* Extra metric rows */}
              {extraFields.length > 0 && (
                <div className="cardio-metrics-row">
                  {extraFields.map(field => (
                    <div key={field.key} className="cardio-metric-field">
                      <span className="set-input-label">{field.label} ({field.unit})</span>
                      <input
                        className="set-input cardio-metric-input"
                        type={field.inputMode === 'text' ? 'text' : 'number'}
                        inputMode={field.inputMode || 'decimal'}
                        step={field.step || '1'}
                        placeholder={field.placeholder || ''}
                        value={cd.metrics[field.key] || ''}
                        onChange={e => updateCardioMetric(ex.id, field.key, e.target.value)}
                        disabled={cd.done}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="finish-section">
        <button className="btn btn-success btn-block btn-lg" onClick={() => setShowFinish(true)}>
          <Trophy size={19} /> Finish Workout
        </button>
      </div>

      {restActive && (
        <div className="rest-timer-overlay" onClick={skipRest}>
          <div className="rest-timer-heading">Rest — {restExName}</div>
          <div className="rest-timer-value">{formatTime(restRemaining)}</div>
          <div className="rest-timer-track">
            <div className="rest-timer-bar" style={{ width: `${(restRemaining / REST_DURATION) * 100}%` }} />
          </div>
          <div className="rest-timer-hint">Tap anywhere to skip</div>
        </div>
      )}

      {showFinish && (
        <div className="modal-overlay" onClick={() => setShowFinish(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Finish Workout?</div>
            <div className="modal-body">
              {totalDone} of {totalItems} items completed in {formatTime(elapsed)}.
            </div>
            <div className="modal-actions">
              <button className="btn btn-success btn-block btn-lg" onClick={handleFinish} disabled={finishing}>
                <Trophy size={18} /> {finishing ? 'Saving...' : 'Save & Finish'}
              </button>
              <button className="btn btn-secondary btn-block" onClick={() => setShowFinish(false)}>
                Keep Going
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
