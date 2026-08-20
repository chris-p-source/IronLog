import React, { useState, useEffect } from 'react';
import { Plus, Check, X, Pill } from 'lucide-react';
import api from '../api';

// What a first-time user sees before they have any history of their own.
const STARTERS = [
  { name: 'Creatine', dose: 5, unit: 'g' },
  { name: 'Whey Protein', dose: 30, unit: 'g' },
  { name: 'Caffeine', dose: 200, unit: 'mg' },
  { name: 'Vitamin D', dose: 1000, unit: 'iu' },
  { name: 'Omega-3', dose: 1, unit: 'g' },
  { name: 'Magnesium', dose: 400, unit: 'mg' },
];

const UNITS = ['g', 'mg', 'ml', 'iu', 'caps', 'scoops'];

function formatDose(dose, unit) {
  if (dose == null || dose === '') return null;
  const n = parseFloat(dose);
  if (!Number.isFinite(n)) return null;
  return `${n % 1 === 0 ? n : n.toFixed(1)}${unit ? ` ${unit}` : ''}`;
}

function AddSupplementModal({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [unit, setUnit] = useState('g');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    await onAdd({ name: name.trim(), dose: dose === '' ? null : Number(dose), unit });
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">Add Supplement</div>

        <div className="form-group">
          <label className="form-label">Name</label>
          <input
            className="form-input"
            autoFocus
            maxLength={60}
            placeholder="Creatine"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Dose</label>
          <div className="supp-dose-row">
            <input
              className="form-input"
              type="number"
              min={0}
              step="0.5"
              inputMode="decimal"
              placeholder="5"
              value={dose}
              onChange={e => setDose(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
            <div className="supp-unit-chips">
              {UNITS.map(u => (
                <button
                  key={u}
                  className={`supp-unit-chip${unit === u ? ' active' : ''}`}
                  onClick={() => setUnit(u)}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-block" onClick={submit} disabled={!name.trim() || saving}>
          {saving ? 'Saving...' : 'Log Supplement'}
        </button>
      </div>
    </div>
  );
}

export default function SupplementSection({ date }) {
  const [taken, setTaken] = useState([]);
  const [recent, setRecent] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  const loadRecent = () => api.get('/nutrition/supplements/recent')
    .then(r => setRecent(r.data))
    .catch(() => {});

  useEffect(() => {
    api.get(`/nutrition/supplements?date=${date}`)
      .then(r => setTaken(r.data))
      .catch(() => setTaken([]));
  }, [date]);

  useEffect(() => { loadRecent(); }, []);

  const log = async (entry) => {
    try {
      const res = await api.post('/nutrition/supplements', { ...entry, date });
      setTaken(t => [...t.filter(x => x.name !== res.data.name), res.data]);
      loadRecent();
    } catch { /* leave the row untouched */ }
  };

  const remove = async (id) => {
    const previous = taken;
    setTaken(t => t.filter(x => x.id !== id));
    try {
      await api.delete(`/nutrition/supplements/${id}`);
    } catch {
      setTaken(previous);
    }
  };

  const takenNames = new Set(taken.map(t => t.name.toLowerCase()));
  // Your usual stack once you have one, common starters until then.
  const suggestions = (recent.length > 0 ? recent : STARTERS)
    .filter(s => !takenNames.has(s.name.toLowerCase()));

  return (
    <div className="meal-section supp-section">
      <div className="meal-section-header">
        <div>
          <span className="meal-section-title">
            <Pill size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
            Supplements
          </span>
          {taken.length > 0 && <span className="meal-section-cal">{taken.length} taken</span>}
        </div>
        <button className="meal-add-btn" onClick={() => setShowAdd(true)} title="Add supplement">
          <Plus size={15} />
        </button>
      </div>

      {taken.length === 0 && suggestions.length === 0 ? (
        <div className="meal-empty">Nothing logged yet</div>
      ) : (
        <>
          {taken.map(s => (
            <div key={s.id} className="supp-row taken">
              <span className="supp-check"><Check size={14} strokeWidth={3} /></span>
              <span className="supp-name">{s.name}</span>
              {formatDose(s.dose, s.unit) && (
                <span className="supp-dose">{formatDose(s.dose, s.unit)}</span>
              )}
              <button className="supp-remove" onClick={() => remove(s.id)} title="Not taken">
                <X size={14} />
              </button>
            </div>
          ))}

          {suggestions.length > 0 && (
            <div className="supp-suggestions">
              {suggestions.map(s => (
                <button
                  key={s.name}
                  className="supp-suggestion"
                  onClick={() => log({ name: s.name, dose: s.dose, unit: s.unit })}
                >
                  <Plus size={12} />
                  {s.name}
                  {formatDose(s.dose, s.unit) && (
                    <span className="supp-suggestion-dose">{formatDose(s.dose, s.unit)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {showAdd && (
        <AddSupplementModal onAdd={log} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}
