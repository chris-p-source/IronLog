import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, Dumbbell, Heart } from 'lucide-react';
import api from '../api';
import ExercisePicker from '../components/ExercisePicker';

const newExercise = (name, type) => ({
  _key: Math.random().toString(36).slice(2),
  name,
  exercise_type: type,
  sets: 3,
  reps: 10,
  planned_duration_minutes: 30,
});

export default function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [templateType, setTemplateType] = useState('strength'); // locked after first exercise added
  const [name, setName] = useState('');
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/templates/${id}`)
      .then(res => {
        setName(res.data.name);
        setTemplateType(res.data.template_type || 'strength');
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

  const handleAddFromPicker = (exerciseName) => {
    setExercises(ex => [...ex, newExercise(exerciseName, templateType)]);
  };

  const removeExercise = (key) =>
    setExercises(ex => ex.filter(e => e._key !== key));

  const update = (key, field, value) =>
    setExercises(ex => ex.map(e => e._key === key ? { ...e, [field]: value } : e));

  const handleSave = async () => {
    if (!name.trim()) return setError('Give your template a name');
    if (exercises.length === 0) return setError('Add at least one exercise');
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        template_type: templateType,
        exercises: exercises.map(e => ({
          name: e.name,
          exercise_type: templateType === 'cardio' ? 'cardio' : 'strength',
          sets: templateType === 'cardio' ? 0 : Math.max(1, parseInt(e.sets) || 1),
          reps: templateType === 'cardio' ? 0 : Math.max(1, parseInt(e.reps) || 1),
          planned_duration_minutes: templateType === 'cardio' ? Math.max(1, parseInt(e.planned_duration_minutes) || 30) : null,
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

  const isCardio = templateType === 'cardio';

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

      {/* Template type selector — locked when editing */}
      {!isEdit && (
        <div className="form-group">
          <label className="form-label">Workout Type</label>
          <div className="type-selector">
            <button
              className={`type-selector-btn ${!isCardio ? 'active strength' : ''}`}
              onClick={() => { setTemplateType('strength'); setExercises([]); }}
            >
              <Dumbbell size={18} />
              Strength
            </button>
            <button
              className={`type-selector-btn ${isCardio ? 'active cardio' : ''}`}
              onClick={() => { setTemplateType('cardio'); setExercises([]); }}
            >
              <Heart size={18} />
              Cardio
            </button>
          </div>
        </div>
      )}

      {isEdit && (
        <div className="form-group">
          <div className={`type-badge ${isCardio ? 'cardio' : 'strength'}`}>
            {isCardio ? <><Heart size={13} /> Cardio Template</> : <><Dumbbell size={13} /> Strength Template</>}
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Template Name</label>
        <input
          className="form-input"
          placeholder={isCardio ? 'e.g. Morning Cardio, HIIT Session...' : 'e.g. Push Day, Leg Day...'}
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ fontSize: 18, fontWeight: 700 }}
        />
      </div>

      <div className="divider" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="section-heading" style={{ margin: 0 }}>
          {exercises.length} Exercise{exercises.length !== 1 ? 's' : ''}
        </div>
        <button
          className={`btn btn-sm ${isCardio ? 'btn-cardio' : 'btn-primary'}`}
          onClick={() => setShowPicker(true)}
        >
          <Plus size={13} /> Add Exercise
        </button>
      </div>

      {exercises.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)', border: '1px dashed var(--border-accent)', borderRadius: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{isCardio ? '🏃' : '🏋️'}</div>
          <div style={{ fontSize: 14, fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Tap Add Exercise to get started
          </div>
        </div>
      ) : (
        exercises.map((ex, idx) => (
          <div key={ex._key} className={`exercise-item ${isCardio ? 'exercise-item-cardio' : ''}`}>
            <div className="exercise-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: isCardio ? 'var(--accent-secondary)' : 'var(--accent)', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                  #{idx + 1}
                </span>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{ex.name}</span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => removeExercise(ex._key)}
                style={{ color: 'var(--accent)', padding: '4px 8px' }}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {isCardio ? (
              <div className="exercise-row">
                <span className="row-label">Mins</span>
                <input
                  className="form-input num-input"
                  type="number" min={1} max={300}
                  value={ex.planned_duration_minutes}
                  onChange={e => update(ex._key, 'planned_duration_minutes', e.target.value)}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 8 }}>planned</span>
              </div>
            ) : (
              <div className="exercise-row">
                <span className="row-label">Sets</span>
                <input
                  className="form-input num-input"
                  type="number" min={1} max={20}
                  value={ex.sets}
                  onChange={e => update(ex._key, 'sets', e.target.value)}
                />
                <span className="row-label" style={{ marginLeft: 14 }}>Reps</span>
                <input
                  className="form-input num-input"
                  type="number" min={1} max={200}
                  value={ex.reps}
                  onChange={e => update(ex._key, 'reps', e.target.value)}
                />
              </div>
            )}
          </div>
        ))
      )}

      <div style={{ height: 20 }} />

      {showPicker && (
        <ExercisePicker
          templateType={templateType}
          addedNames={exercises.map(e => e.name)}
          onAdd={handleAddFromPicker}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
