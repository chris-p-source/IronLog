import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Pencil, Trash2, Dumbbell, Heart, CalendarDays, X, Copy } from 'lucide-react';
import api from '../api';

function BackfillModal({ template, onClose, onConfirm }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('12:00');

  const handleConfirm = () => {
    const iso = new Date(`${date}T${time}:00`).toISOString();
    onConfirm(iso);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Log Past Workout</span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          When did you complete <strong style={{ color: 'var(--text-primary)' }}>{template.name}</strong>?
        </p>
        <div className="form-group">
          <label className="form-label">Date</label>
          <input
            type="date"
            className="form-input"
            value={date}
            max={today}
            onChange={e => setDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Time</label>
          <input
            type="time"
            className="form-input"
            value={time}
            onChange={e => setTime(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={handleConfirm}>
          <Play size={14} /> Start Logging
        </button>
      </div>
    </div>
  );
}

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('strength');
  const [starting, setStarting] = useState(null);
  const [backfillTemplate, setBackfillTemplate] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/templates')
      .then(res => { setTemplates(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this template?')) return;
    try {
      await api.delete(`/templates/${id}`);
      setTemplates(t => t.filter(x => x.id !== id));
    } catch (err) { console.error(err); }
  };

  const startWorkout = async (templateId, startedAt) => {
    setStarting(templateId);
    try {
      const body = { template_id: templateId };
      if (startedAt) body.started_at = startedAt;
      const res = await api.post('/workouts/start', body);
      navigate(`/workout/${res.data.session.id}`, {
        state: {
          session: res.data.session,
          exercises: res.data.exercises,
          backfillDate: startedAt || null,
        },
      });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start workout');
      setStarting(null);
    }
  };

  const handleStart = (e, id) => { e.stopPropagation(); startWorkout(id, null); };

  const handleDuplicate = async (e, id) => {
    e.stopPropagation();
    try {
      const res = await api.post(`/templates/${id}/duplicate`);
      setTemplates(t => [res.data, ...t]);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to duplicate');
    }
  };
  const handleBackfillConfirm = (iso) => {
    setBackfillTemplate(null);
    startWorkout(backfillTemplate.id, iso);
  };

  const handleNew = () => navigate('/template/new', { state: { templateType: tab } });

  const filtered = templates.filter(t => (t.template_type || 'strength') === tab);
  const isCardio = tab === 'cardio';

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">My Templates</h1>
        <button
          className={`btn btn-sm ${isCardio ? 'btn-cardio' : 'btn-primary'}`}
          onClick={handleNew}
        >
          <Plus size={15} /> New
        </button>
      </div>

      <div className="tab-bar" style={{ marginBottom: 20 }}>
        <button className={`tab-btn ${tab === 'strength' ? 'active' : ''}`} onClick={() => setTab('strength')}>
          <Dumbbell size={13} /> Strength
        </button>
        <button
          className={`tab-btn ${tab === 'cardio' ? 'active' : ''}`}
          onClick={() => setTab('cardio')}
          style={tab === 'cardio' ? { background: 'var(--accent-secondary)' } : {}}
        >
          <Heart size={13} /> Cardio
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{isCardio ? <Heart size={52} /> : <Dumbbell size={52} />}</div>
          <h3>No {isCardio ? 'Cardio' : 'Strength'} Templates</h3>
          <p>Create your first {isCardio ? 'cardio' : 'strength'} template to get started</p>
          <button className={`btn ${isCardio ? 'btn-cardio' : 'btn-primary'}`} onClick={handleNew}>
            <Plus size={16} /> Create Template
          </button>
        </div>
      ) : (
        <div className="template-list">
          {filtered.map(t => (
            <div key={t.id} className={`template-card ${isCardio ? 'template-card-cardio' : ''}`}>
              <div className="template-name">{t.name}</div>
              <div className="template-meta">
                {t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''}
                {isCardio
                  ? ` · ${t.exercises.reduce((a, e) => a + (e.planned_duration_minutes || 0), 0)} min planned`
                  : ` · ${t.exercises.reduce((a, e) => a + (parseInt(e.sets) || 0), 0)} total sets`
                }
              </div>
              {t.exercises.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {t.exercises.slice(0, 4).map((ex, i) => (
                    <span key={i} className={`tag ${isCardio ? 'tag-cardio' : ''}`}>{ex.name}</span>
                  ))}
                  {t.exercises.length > 4 && <span className="tag">+{t.exercises.length - 4}</span>}
                </div>
              )}
              <div className="template-actions">
                <button
                  className={`btn btn-sm ${isCardio ? 'btn-cardio' : 'btn-primary'}`}
                  style={{ flex: 1 }}
                  onClick={e => handleStart(e, t.id)}
                  disabled={starting === t.id}
                >
                  <Play size={13} />{starting === t.id ? 'Starting...' : 'Start Workout'}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  title="Log past workout"
                  onClick={e => { e.stopPropagation(); setBackfillTemplate(t); }}
                  disabled={starting === t.id}
                >
                  <CalendarDays size={14} />
                </button>
                <button className="btn btn-secondary btn-sm" title="Duplicate template" onClick={e => handleDuplicate(e, t.id)}>
                  <Copy size={14} />
                </button>
                <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/template/${t.id}/edit`); }}>
                  <Pencil size={14} />
                </button>
                <button className="btn btn-danger btn-sm" onClick={e => handleDelete(e, t.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {backfillTemplate && (
        <BackfillModal
          template={backfillTemplate}
          onClose={() => setBackfillTemplate(null)}
          onConfirm={handleBackfillConfirm}
        />
      )}
    </div>
  );
}
