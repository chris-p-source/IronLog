import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import api from '../api';

const newExercise = () => ({
  _key: Math.random().toString(36).slice(2),
  name: '',
  sets: 3,
  reps: 10,
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
        setExercises(res.data.exercises.map(e => ({ ...e, _key: String(e.id) })));
        setLoading(false);
      })
      .catch(() => navigate('/'));
  }, [id]);

  const addExercise = () => setExercises(ex => [...ex, newExercise()]);

  const removeExercise = key =>
    setExercises(ex => ex.length > 1 ? ex.filter(e => e._key !== key) : ex);

  const update = (key, field, value) =>
    setExercises(ex => ex.map(e => e._key === key ? { ...e, [field]: value } : e));

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
          sets: Math.max(1, Number(e.sets) || 1),
          reps: Math.max(1, Number(e.reps) || 1),
        })),
      };
      if (isEdit) {
        await api.put(`/templates/${id}`, payload);
      } else {
        await api.post('/templates', payload);
      }
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
        <button className="btn btn-secondary btn-sm" onClick={addExercise}>
          <Plus size={13} /> Add
        </button>
      </div>

      {exercises.map((ex, idx) => (
        <div key={ex._key} className="exercise-item">
          <div className="exercise-header">
            <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
              #{idx + 1}
            </span>
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
              placeholder="Exercise name (e.g. Bench Press)"
              value={ex.name}
              onChange={e => update(ex._key, 'name', e.target.value)}
            />
          </div>
          <div className="exercise-row">
            <span className="row-label">Sets</span>
            <input
              className="form-input num-input"
              type="number"
              min={1}
              max={20}
              value={ex.sets}
              onChange={e => update(ex._key, 'sets', e.target.value)}
            />
            <span className="row-label" style={{ marginLeft: 14 }}>Reps</span>
            <input
              className="form-input num-input"
              type="number"
              min={1}
              max={200}
              value={ex.reps}
              onChange={e => update(ex._key, 'reps', e.target.value)}
            />
          </div>
        </div>
      ))}

      <button className="btn btn-secondary btn-block" onClick={addExercise} style={{ marginTop: 4 }}>
        <Plus size={16} /> Add Exercise
      </button>

      <div style={{ height: 20 }} />
    </div>
  );
}
