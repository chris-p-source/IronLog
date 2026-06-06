import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, Dumbbell, Heart } from 'lucide-react';
import api from '../api';

const newExercise = (type = 'strength') => ({
  _key: Math.random().toString(36).slice(2),
  name: '',
  exercise_type: type,
  sets: 3,
  reps: 10,
  planned_duration_minutes: 30,
});

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [name, setName] = useState('');
  const [exercises, setExercises] = useState([newExercise()]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/templates/${id}`)
      .then(res => {
        setName(res.data.name);
        setExercises(res.data.exercises.map(e => ({
          ...e,
          _key: String(e.id),
          exercise_type: e.exercise_type || 'strength',
          planned_duration_minutes: e.planned_duration_minutes || 30,
        })));
        setLoading(false);
      })
      .catch(() => navigate('/'));
  }, [id]);

  const addExercise = (type = 'strength') =>
    setExercises(ex => [...ex, newExercise(type)]);

  const removeExercise = key =>
    setExercises(ex => ex.length > 1 ? ex.filter(e => e._key !== key) : ex);

  const update = (key, field, value) =>
    setExercises(ex => ex.map(e => e._key === key ? { ...e, [field]: value } : e));

  const toggleType = (key) =>
    setExercises(ex => ex.map(e => e._key === key
      ? { ...e, exercise_type: e.exercise_type === 'strength' ? 'cardio' : 'strength' }
      : e
    ));

  const handleSave = async () => {
    if (!name.trim()) return setError('Give your template a name');
    const valid = exercises.filter(e => e.name.trim());
    if (valid.length === 0) return setError('Add at least one exercise');
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        exercises: valid.map(e => ({
          name: e.name.trim(),
          exercise_type: e.exercise_type,
          sets: e.exercise_type === 'cardio' ? 0 : Math.max(1, Number(e.sets) || 1),
          reps: e.exercise_type === 'cardio' ? 0 : Math.max(1, Number(e.reps) || 1),
          planned_duration_minutes: e.exercise_type === 'cardio' ? Math.max(1, Number(e.planned_duration_minutes) || 30) : null,
        })),
      };
      if (isEdit) await api.put(`/templates/${id}`, payload);
      else await api.post('/templates', payload);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={15} /> Back
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <h1 className="page-title" style={{ marginBottom: 20 }}>
        {isEdit ? 'Edit' : 'New'} <span>Template</span>
      </h1>

      {error && <div className="error-msg">{error}</div>}

      <div className="form-group">
        <label className="form-label">Template Name</label>
        <input
          className="form-input"
          placeholder="e.g. Push Day, Leg Day, Full Body..."
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ fontSize: 18, fontWeight: 700 }}
        />
      </div>

      <div className="divider" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="section-heading" style={{ margin: 0 }}>Exercises</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => addExercise('strength')}>
            <Dumbbell size={13} /> Strength
          </button>
          <button className="btn btn-secondary btn-sm" style={{ borderColor: 'rgba(255,107,0,0.4)', color: 'var(--accent-secondary)' }} onClick={() => addExercise('cardio')}>
            <Heart size={13} /> Cardio
          </button>
        </div>
      </div>

      {exercises.map((ex, idx) => {
        const isCardio = ex.exercise_type === 'cardio';
        return (
          <div key={ex._key} className={`exercise-item ${isCardio ? 'exercise-item-cardio' : ''}`}>
            <div className="exercise-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: isCardio ? 'var(--accent-secondary)' : 'var(--accent)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  #{idx + 1}
                </span>
                <button
                  className={`type-toggle ${isCardio ? 'cardio' : 'strength'}`}
                  onClick={() => toggleType(ex._key)}
                >
                  {isCardio ? <><Heart size={11} /> Cardio</> : <><Dumbbell size={11} /> Strength</>}
                </button>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => removeExercise(ex._key)}
                style={{ color: 'var(--accent)', padding: '4px 8px' }}
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="form-group" style={{ marginBottom: 10 }}>
              <input
                className="form-input"
                placeholder={isCardio ? 'Cardio name (e.g. Treadmill, Cycling...)' : 'Exercise name (e.g. Bench Press)'}
                value={ex.name}
                onChange={e => update(ex._key, 'name', e.target.value)}
              />
            </div>

            {isCardio ? (
              <div className="exercise-row">
                <span className="row-label">Mins</span>
                <input
                  className="form-input num-input"
                  type="number"
                  min={1}
                  max={300}
                  value={ex.planned_duration_minutes}
                  onChange={e => update(ex._key, 'planned_duration_minutes', e.target.value)}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 8 }}>planned duration</span>
              </div>
            ) : (
              <div className="exercise-row">
                <span className="row-label">Sets</span>
                <input
                  className="form-input num-input"
                  type="number"
                  min={1} max={20}
                  value={ex.sets}
                  onChange={e => update(ex._key, 'sets', e.target.value)}
                />
                <span className="row-label" style={{ marginLeft: 14 }}>Reps</span>
                <input
                  className="form-input num-input"
                  type="number"
                  min={1} max={200}
                  value={ex.reps}
                  onChange={e => update(ex._key, 'reps', e.target.value)}
                />
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => addExercise('strength')}>
          <Plus size={15} /><Dumbbell size={14} /> Strength
        </button>
        <button className="btn btn-secondary" style={{ flex: 1, borderColor: 'rgba(255,107,0,0.3)', color: 'var(--accent-secondary)' }} onClick={() => addExercise('cardio')}>
          <Plus size={15} /><Heart size={14} /> Cardio
        </button>
      </div>

      <div style={{ height: 20 }} />
    </div>
  );
}
