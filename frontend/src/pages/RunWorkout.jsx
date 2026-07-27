import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { CheckCircle2, Circle, Trophy, Heart, ChevronDown, ChevronUp, Calculator } from 'lucide-react';
import api from '../api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

const DEFAULT_REST = 120;
const BAR_WEIGHT = 20;
const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

// Returns array of plates needed per side to reach targetKg (assumes 20kg bar)
function calcPlates(targetKg) {
  let perSide = (targetKg - BAR_WEIGHT) / 2;
  if (perSide <= 0) return [];
  const result = [];
  for (const plate of PLATES) {
    while (perSide + 1e-6 >= plate) {
      result.push(plate);
      perSide -= plate;
    }
  }
  return result;
}

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
  const suggestion = best?.weight_kg
    ? `Try ${(parseFloat(best.weight_kg) + 2.5)}kg × ${best.reps_completed}?`
    : null;

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
      {suggestion && (
        <div className="overload-suggestion">{suggestion}</div>
      )}
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

function PlateCalc({ weightKg, onClose }) {
  const plates = calcPlates(weightKg);
  return (
    <div className="plate-calc-popover" onClick={e => e.stopPropagation()}>
      <div className="plate-calc-title">Per side ({BAR_WEIGHT}kg bar)</div>
      {plates.length === 0 ? (
        <div className="plate-calc-empty">Bar only</div>
      ) : (
        <div className="plate-calc-plates">
          {plates.map((p, i) => (
            <span key={i} className="plate-chip">{p}</span>
          ))}
        </div>
      )}
      <button className="plate-calc-close" onClick={onClose}>Close</button>
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
  const backfillDate = location.state?.backfillDate || null;
  const [lastSessionData, setLastSessionData] = useState({});

  const [elapsed, setElapsed] = useState(0);
  const [restActive, setRestActive] = useState(false);
  const [restMinimized, setRestMinimized] = useState(false);
  const [restRemaining, setRestRemaining] = useState(DEFAULT_REST);
  const [restDuration, setRestDuration] = useState(DEFAULT_REST);
  const [restExName, setRestExName] = useState('');

  const [setData, setSetData] = useState({});
  // cardioData: { [exId]: { minutes, done, metrics: { key: value } } }
  const [cardioData, setCardioData] = useState({});
  const [showFinish, setShowFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [notes, setNotes] = useState('');
  const [prCelebration, setPrCelebration] = useState(null);
  const [plateCalcKey, setPlateCalcKey] = useState(null);
  const prTimeoutRef = useRef(null);
  const pushReadyRef = useRef(false);

  const elapsedRef = useRef(null);
  const restRef = useRef(null);
  const workoutStartRef = useRef(null);
  const restStartRef = useRef(null);
  const restDurationRef = useRef(DEFAULT_REST);

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
        const baseWeight = ex.base_weight_kg ? String(parseFloat(ex.base_weight_kg)) : '';
        initSets[ex.id] = {};
        for (let s = 1; s <= ex.sets_planned; s++) {
          initSets[ex.id][s] = { reps: String(ex.reps_planned), weight: baseWeight, done: false };
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

      // Pre-fill weights from last session, per set number
      setSetData(prev => {
        const next = { ...prev };
        for (const ex of exercises) {
          if (ex.exercise_type === 'cardio') continue;
          const lastSets = results[ex.id]?.sets || [];
          if (lastSets.length === 0) continue;
          next[ex.id] = { ...next[ex.id] };
          for (let s = 1; s <= ex.sets_planned; s++) {
            const lastSet = lastSets.find(ls => ls.set_number === s) || lastSets[lastSets.length - 1];
            const lastWeight = lastSet?.weight_kg ? String(parseFloat(lastSet.weight_kg)) : '';
            const lastReps = lastSet?.reps_completed ? String(lastSet.reps_completed) : '';
            if ((lastWeight || lastReps) && next[ex.id]?.[s] && !next[ex.id][s].done) {
              next[ex.id][s] = {
                ...next[ex.id][s],
                ...(lastWeight && { weight: lastWeight }),
                ...(lastReps && { reps: lastReps }),
              };
            }
          }
        }
        return next;
      });
    };
    fetchLast();
  }, [exercises]);

  // Workout elapsed timer — timestamp-based so screen lock doesn't lose time
  useEffect(() => {
    if (!session) return;
    workoutStartRef.current = new Date(session.started_at).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - workoutStartRef.current) / 1000));
    tick();
    elapsedRef.current = setInterval(tick, 1000);
    return () => clearInterval(elapsedRef.current);
  }, [session]);

  // Rest timer — timestamp-based
  useEffect(() => {
    if (!restActive) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - restStartRef.current) / 1000);
      const remaining = Math.max(0, restDurationRef.current - secs);
      setRestRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(restRef.current);
        setRestActive(false);
        setRestMinimized(false);
      }
    };
    tick();
    restRef.current = setInterval(tick, 500);
    return () => clearInterval(restRef.current);
  }, [restActive]);

  // On returning from background/lock screen, immediately recalculate both timers
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (workoutStartRef.current) {
        setElapsed(Math.floor((Date.now() - workoutStartRef.current) / 1000));
      }
      if (restStartRef.current) {
        const secs = Math.floor((Date.now() - restStartRef.current) / 1000);
        const remaining = Math.max(0, restDurationRef.current - secs);
        setRestRemaining(remaining);
        if (remaining <= 0) { setRestActive(false); setRestMinimized(false); }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Request push permission and subscribe on mount
  useEffect(() => {
    async function setupPush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
        const reg = await navigator.serviceWorker.ready;
        const keyRes = await api.get('/push/vapid-public-key').catch(() => null);
        if (!keyRes?.data?.publicKey) return;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyRes.data.publicKey),
        });
        await api.post('/push/subscribe', { subscription: sub.toJSON() });
        pushReadyRef.current = true;
      } catch (err) {
        console.warn('Push setup failed:', err);
      }
    }
    setupPush();
  }, []);

  const startRest = (ex) => {
    clearInterval(restRef.current);
    const duration = ex.rest_seconds || DEFAULT_REST;
    restStartRef.current = Date.now();
    restDurationRef.current = duration;
    setRestDuration(duration);
    setRestRemaining(duration);
    setRestExName(ex.exercise_name);
    setRestMinimized(false);
    setRestActive(true);

    if (pushReadyRef.current) {
      api.post('/push/rest-timer', {
        duration_seconds: duration,
        exercise_name: ex.exercise_name,
      }).catch(() => {});
    }
  };

  const skipRest = () => {
    clearInterval(restRef.current);
    restStartRef.current = null;
    setRestActive(false);
    setRestMinimized(false);
  };

  const minimizeRest = () => setRestMinimized(true);

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
      startRest(ex);

      const weight = current.weight ? Number(current.weight) : 0;
      const reps = Number(current.reps) || 0;
      const last = lastSessionData[ex.id];
      const prWeight = parseFloat(last?.pr_weight) || 0;
      const prReps = parseInt(last?.pr_reps) || 0;
      if (weight > 0 && weight > prWeight) {
        showPrCelebration(`New Weight PR! ${weight}kg on ${ex.exercise_name}`);
      } else if (weight >= prWeight && weight > 0 && reps > prReps) {
        showPrCelebration(`New Rep PR! ${reps} reps on ${ex.exercise_name}`);
      } else if (weight === 0 && reps > prReps && prReps > 0) {
        showPrCelebration(`New Rep PR! ${reps} reps on ${ex.exercise_name}`);
      }

      try {
        await api.post(`/workouts/${sessionId}/log-set`, {
          session_exercise_id: ex.id,
          set_number: setNum,
          reps_completed: reps,
          weight_kg: current.weight ? Number(current.weight) : null,
        });
      } catch (e) { console.error(e); }
    }
  };

  const showPrCelebration = (message) => {
    clearTimeout(prTimeoutRef.current);
    setPrCelebration(message);
    prTimeoutRef.current = setTimeout(() => setPrCelebration(null), 2800);
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
      const completeBody = { notes: notes.trim() || null };
      if (backfillDate) completeBody.completed_at = backfillDate;
      await api.post(`/workouts/${sessionId}/complete`, completeBody);
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
                      <button
                        type="button"
                        className="plate-calc-btn"
                        onClick={() => setPlateCalcKey(k => k === `${ex.id}-${setNum}` ? null : `${ex.id}-${setNum}`)}
                        title="Plate calculator"
                      >
                        <Calculator size={15} />
                      </button>
                      {plateCalcKey === `${ex.id}-${setNum}` && (
                        <PlateCalc weightKg={Number(s.weight) || 0} onClose={() => setPlateCalcKey(null)} />
                      )}
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

      {restActive && !restMinimized && (
        <div className="rest-timer-overlay" onClick={minimizeRest}>
          <div className="rest-timer-heading">Rest — {restExName}</div>
          <div className="rest-timer-value">{formatTime(restRemaining)}</div>
          <div className="rest-timer-track">
            <div className="rest-timer-bar" style={{ width: `${(restRemaining / restDuration) * 100}%` }} />
          </div>
          <div className="rest-timer-hint">Tap to minimise</div>
          <button
            className="rest-timer-skip-btn"
            onClick={e => { e.stopPropagation(); skipRest(); }}
          >
            Skip Rest
          </button>
        </div>
      )}

      {restActive && restMinimized && (
        <div className="rest-banner" onClick={() => setRestMinimized(false)}>
          <div className="rest-banner-left">
            <span className="rest-banner-label">REST</span>
            <span className="rest-banner-time">{formatTime(restRemaining)}</span>
            <span className="rest-banner-ex">{restExName}</span>
          </div>
          <button
            className="rest-banner-skip"
            onClick={e => { e.stopPropagation(); skipRest(); }}
          >
            Skip
          </button>
        </div>
      )}

      {prCelebration && (
        <div className="pr-celebration" onClick={() => setPrCelebration(null)}>
          <Trophy size={20} /> {prCelebration}
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
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="How did it feel? Anything to remember..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
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
