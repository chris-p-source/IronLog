import React, { useState, useEffect } from 'react';
import { Target, Plus, Trash2, TrendingUp, CheckCircle2, X, Search, Pencil, Zap } from 'lucide-react';
import api from '../api';

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatWeeks(weeks) {
  if (weeks < 1.5) return 'about a week';
  if (weeks < 9) return `about ${Math.round(weeks)} weeks`;
  const months = weeks / 4.345;
  return months < 18 ? `about ${Math.round(months)} months` : `over a year`;
}

const round = (n) => Math.round(n * 10) / 10;

// Every forecast state says something useful — a refusal explains itself rather
// than leaving an empty space where a date should be.
function ForecastLine({ goal }) {
  const f = goal.forecast || {};

  if (goal.achieved_at) {
    return (
      <div className="goal-forecast achieved">
        <CheckCircle2 size={13} />
        Achieved {formatDate(goal.achieved_at)}
      </div>
    );
  }

  if (f.status === 'ready') {
    return (
      <div className="goal-forecast">
        <TrendingUp size={13} />
        <span>
          On track for <strong>{formatDate(f.projectedDate)}</strong> — {formatWeeks(f.weeksRemaining)}
        </span>
        <span className={`goal-confidence ${f.confidence}`}>{f.confidence}</span>
        <span className="goal-rate">+{round(f.ratePerWeek)} kg/week</span>
      </div>
    );
  }

  if (f.status === 'within_reach') {
    return (
      <div className="goal-forecast within-reach">
        <TrendingUp size={13} />
        Within reach now — your recent sessions are at this level
      </div>
    );
  }

  if (f.status === 'no_upward_trend') {
    return (
      <div className="goal-forecast muted">
        No upward trend in recent sessions, so there is nothing to project from
      </div>
    );
  }

  if (f.status === 'beyond_horizon') {
    return (
      <div className="goal-forecast muted">
        More than {Math.round(f.horizonWeeks / 52)} years away at {round(f.ratePerWeek)} kg/week
      </div>
    );
  }

  return (
    <div className="goal-forecast muted">
      {f.sessionsNeeded
        ? `${f.sessionsNeeded} more session${f.sessionsNeeded === 1 ? '' : 's'} before a forecast`
        : 'Not enough history yet for a forecast'}
    </div>
  );
}

function GoalRow({ goal, onEdit, onDelete }) {
  return (
    <div className={`goal-row${goal.achieved_at ? ' achieved' : ''}`}>
      <div className="goal-row-top">
        <span className="goal-exercise">{goal.exercise_name}</span>
        <span className="goal-target">
          {round(goal.target_weight_kg)}kg × {goal.target_reps}
        </span>
        <button className="goal-icon-btn" onClick={() => onEdit(goal)} title="Change target">
          <Pencil size={14} />
        </button>
        <button className="goal-icon-btn" onClick={() => onDelete(goal)} title="Remove goal">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="goal-progress-track">
        <div
          className={`goal-progress-fill${goal.achieved_at ? ' achieved' : ''}`}
          style={{ width: `${goal.percent}%` }}
        />
      </div>

      <div className="goal-numbers">
        <span>
          Best so far <strong>{goal.current_best_weight_kg ? `${round(goal.current_best_weight_kg)}kg` : '—'}</strong>
        </span>
        <span className="goal-e1rm">
          {goal.current_e1rm || 0} / {goal.target_e1rm} est. 1RM
        </span>
      </div>

      <ForecastLine goal={goal} />

      {goal.achieved_at && (
        <>
          {goal.earned_xp ? (
            <div className="goal-xp"><Zap size={12} /> +{goal.xp_awarded} XP earned</div>
          ) : (
            <div className="goal-xp muted">
              <Zap size={12} /> No XP — this one was already in your history when you set it
            </div>
          )}
          <button className="goal-next-btn" onClick={() => onEdit(goal)}>
            <Target size={13} /> Set the next target
          </button>
        </>
      )}
    </div>
  );
}

function AddGoalModal({ trained, editing, onSave, onClose }) {
  const [catalogue, setCatalogue] = useState([]);
  const [search, setSearch] = useState('');
  const [exercise, setExercise] = useState(editing?.exercise_name || '');
  // Editing an achieved goal is usually "same lift, more weight", so start from
  // what they just hit rather than an empty box.
  const [weight, setWeight] = useState(
    editing ? String(round(editing.target_weight_kg) + (editing.achieved_at ? 2.5 : 0)) : ''
  );
  const [reps, setReps] = useState(editing ? String(editing.target_reps) : '5');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/exercises/strength').then(r => setCatalogue(r.data)).catch(() => setCatalogue([]));
  }, []);

  // Exercises they already train come first — those are the ones with history
  // to forecast from.
  const names = [...new Set([...trained, ...catalogue.map(e => e.name)])];
  const filtered = search.trim()
    ? names.filter(n => n.toLowerCase().includes(search.trim().toLowerCase()))
    : names;

  const submit = async () => {
    setError('');
    if (!exercise || saving) return;
    setSaving(true);
    try {
      await onSave({ exercise_name: exercise, target_weight_kg: Number(weight), target_reps: Number(reps) });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save that goal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">{editing ? 'Change Target' : 'Set a Goal'}</div>
        {error && <div className="error-msg">{error}</div>}

        {exercise ? (
          <>
            <div className="goal-chosen">
              <span>{exercise}</span>
              {!editing && (
                <button onClick={() => setExercise('')}><X size={14} /></button>
              )}
            </div>
            {editing?.achieved_at && (
              <div className="goal-edit-note">
                You hit {round(editing.target_weight_kg)}kg × {editing.target_reps}. Setting a new
                target starts this goal again from today.
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="goal-weight">Target weight (kg)</label>
              <input
                id="goal-weight"
                className="form-input"
                type="number" min={0} step={2.5} inputMode="decimal"
                autoFocus
                placeholder="100"
                value={weight}
                onChange={e => setWeight(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="goal-reps">For how many reps</label>
              <input
                id="goal-reps"
                className="form-input"
                type="number" min={1} step={1} inputMode="numeric"
                placeholder="5"
                value={reps}
                onChange={e => setReps(e.target.value)}
              />
            </div>

            <button
              className="btn btn-primary btn-block"
              onClick={submit}
              disabled={!weight || !reps || saving}
            >
              {saving ? 'Saving...' : editing ? 'Update Goal' : 'Set Goal'}
            </button>
          </>
        ) : (
          <>
            <div className="goal-search">
              <Search size={15} />
              <input
                autoFocus
                placeholder="Search exercises"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="goal-exercise-list">
              {filtered.slice(0, 60).map(name => (
                <button key={name} className="goal-exercise-option" onClick={() => setExercise(name)}>
                  {name}
                  {trained.includes(name) && <span className="goal-trained">trained</span>}
                </button>
              ))}
              {filtered.length === 0 && <div className="meal-empty">No exercises match</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function GoalsCard({ trained = [] }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => api.get('/goals')
    .then(r => setGoals(r.data))
    .catch(() => setGoals([]))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const save = async (goal) => {
    // Updating goes through the same upsert, so a new target on the same lift
    // replaces the old one and starts unmet.
    const res = await api.post('/goals', goal);
    setGoals(gs => [res.data, ...gs.filter(g => g.exercise_name !== res.data.exercise_name)]);
  };

  const remove = async (goal) => {
    const previous = goals;
    setGoals(gs => gs.filter(g => g.id !== goal.id));
    try {
      await api.delete(`/goals/${goal.id}`);
    } catch {
      setGoals(previous);
    }
  };

  return (
    <div className="chart-container goals-card">
      <div className="goals-header">
        <div className="chart-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Target size={14} color="var(--accent)" /> Goals
        </div>
        <button className="meal-add-btn" onClick={() => setShowAdd(true)} title="Set a goal">
          <Plus size={15} />
        </button>
      </div>

      {loading ? (
        <div className="meal-empty">Loading goals...</div>
      ) : goals.length === 0 ? (
        <div className="goals-empty">
          Set a target weight and reps for a lift, and this will track how close you are
          and when you are on course to hit it.
        </div>
      ) : (
        goals.map(goal => (
          <GoalRow key={goal.id} goal={goal} onEdit={setEditing} onDelete={remove} />
        ))
      )}

      {(showAdd || editing) && (
        <AddGoalModal
          trained={trained}
          editing={editing}
          onSave={save}
          onClose={() => { setShowAdd(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
