import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { CheckCircle2, Circle, Trophy, X } from 'lucide-react';
import api from '../api';

const REST_DURATION = 120;

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

export default function RunWorkout() {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [session, setSession] = useState(location.state?.session || null);
  const [exercises, setExercises] = useState(location.state?.exercises || []);
  const [loading, setLoading] = useState(!location.state);

  const [elapsed, setElapsed] = useState(0);
  const [restActive, setRestActive] = useState(false);
  const [restRemaining, setRestRemaining] = useState(REST_DURATION);
  const [restExName, setRestExName] = useState('');

  // { [exerciseId]: { [setNum]: { reps, weight, done } } }
  const [setData, setSetData] = useState({});
  const [showFinish, setShowFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const elapsedRef = useRef(null);
  const restRef = useRef(null);

  useEffect(() => {
    if (loading) {
      api.get(`/workouts/${sessionId}`)
        .then(res => {
          setSession(res.data.session);
          setExercises(res.data.exercises);
          setLoading(false);
        })
        .catch(() => navigate('/'));
    }
  }, [sessionId]);

  useEffect(() => {
    if (exercises.length === 0) return;
    const init = {};
    for (const ex of exercises) {
      init[ex.id] = {};
      for (let s = 1; s <= ex.sets_planned; s++) {
        init[ex.id][s] = { reps: String(ex.reps_planned), weight: '', done: false };
      }
    }
    setSetData(init);
  }, [exercises]);

  // Workout timer
  useEffect(() => {
    elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(elapsedRef.current);
  }, []);

  // Rest timer
  useEffect(() => {
    if (!restActive) return;
    restRef.current = setInterval(() => {
      setRestRemaining(r => {
        if (r <= 1) {
          clearInterval(restRef.current);
          setRestActive(false);
          return 0;
        }
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

  const skipRest = () => {
    clearInterval(restRef.current);
    setRestActive(false);
  };

  const updateSet = (exId, setNum, field, value) => {
    setSetData(d => ({
      ...d,
      [exId]: { ...d[exId], [setNum]: { ...d[exId]?.[setNum], [field]: value } },
    }));
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

  const totalSets = exercises.reduce((a, e) => a + e.sets_planned, 0);
  const doneSets = Object.values(setData).reduce(
    (a, ex) => a + Object.values(ex).filter(s => s.done).length, 0
  );
  const pct = totalSets > 0 ? (doneSets / totalSets) * 100 : 0;

  if (loading) {
    return (
      <div style={{ background: 'var(--bg-primary)', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading">Loading workout...</div>
      </div>
    );
  }

  return (
    <div className="workout-page">
      {/* Sticky header */}
      <div className="workout-header">
        <div className="workout-name-label">{session?.template_name}</div>
        <div className="workout-timer-main">{formatTime(elapsed)}</div>
        <div className="workout-progress-row">
          <span className="workout-progress-text">
            <span style={{ color: 'var(--success)', fontWeight: 800 }}>{doneSets}</span>
            <span style={{ color: 'var(--text-muted)' }}>/{totalSets} sets</span>
          </span>
          <div className="workout-progress-bar">
            <div className="workout-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="workout-progress-text" style={{ color: 'var(--text-muted)' }}>
            {Math.round(pct)}%
          </span>
        </div>
      </div>

      {/* Exercise cards */}
      <div className="workout-exercises">
        {exercises.map(ex => {
          const exData = setData[ex.id] || {};
          const allDone = ex.sets_planned > 0 && Object.values(exData).every(s => s.done);
          return (
            <div key={ex.id} className={`exercise-workout-card${allDone ? ' all-done' : ''}`}>
              <div className="exercise-workout-header">
                <span className="exercise-workout-name">{ex.exercise_name}</span>
                <span className="exercise-workout-target">
                  {ex.sets_planned} × {ex.reps_planned}
                  {allDone && <span style={{ marginLeft: 8, color: 'var(--success)' }}>✓</span>}
                </span>
              </div>
              {Array.from({ length: ex.sets_planned }, (_, i) => i + 1).map(setNum => {
                const s = exData[setNum] || { reps: String(ex.reps_planned), weight: '', done: false };
                return (
                  <div key={setNum} className={`set-row${s.done ? ' set-done' : ''}`}>
                    <span className="set-number">Set {setNum}</span>
                    <div className="set-inputs">
                      <div className="set-input-group">
                        <span className="set-input-label">Reps</span>
                        <input
                          className="set-input"
                          type="number"
                          min={0}
                          value={s.reps}
                          onChange={e => updateSet(ex.id, setNum, 'reps', e.target.value)}
                          disabled={s.done}
                        />
                      </div>
                      <div className="set-input-group">
                        <span className="set-input-label">kg</span>
                        <input
                          className="set-input"
                          type="number"
                          min={0}
                          step={0.5}
                          placeholder="—"
                          value={s.weight}
                          onChange={e => updateSet(ex.id, setNum, 'weight', e.target.value)}
                          disabled={s.done}
                        />
                      </div>
                    </div>
                    <button
                      className={`set-done-btn${s.done ? ' done' : ''}`}
                      onClick={() => toggleSet(ex, setNum)}
                    >
                      {s.done
                        ? <CheckCircle2 size={17} strokeWidth={2.5} />
                        : <Circle size={17} />
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Finish */}
      <div className="finish-section">
        <button className="btn btn-success btn-block btn-lg" onClick={() => setShowFinish(true)}>
          <Trophy size={19} /> Finish Workout
        </button>
      </div>

      {/* Rest timer overlay */}
      {restActive && (
        <div className="rest-timer-overlay" onClick={skipRest}>
          <div className="rest-timer-heading">Rest — {restExName}</div>
          <div className="rest-timer-value">{formatTime(restRemaining)}</div>
          <div className="rest-timer-track">
            <div
              className="rest-timer-bar"
              style={{ width: `${(restRemaining / REST_DURATION) * 100}%` }}
            />
          </div>
          <div className="rest-timer-hint">Tap anywhere to skip</div>
        </div>
      )}

      {/* Finish confirmation */}
      {showFinish && (
        <div className="modal-overlay" onClick={() => setShowFinish(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Finish Workout?</div>
            <div className="modal-body">
              {doneSets} of {totalSets} sets completed in {formatTime(elapsed)}.
              Your workout will be saved to history.
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-success btn-block btn-lg"
                onClick={handleFinish}
                disabled={finishing}
              >
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
