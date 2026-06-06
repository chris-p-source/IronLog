import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Pencil, Trash2, Dumbbell, Heart } from 'lucide-react';
import api from '../api';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('strength');
  const [starting, setStarting] = useState(null);
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

  const handleStart = async (e, id) => {
    e.stopPropagation();
    setStarting(id);
    try {
      const res = await api.post('/workouts/start', { template_id: id });
      navigate(`/workout/${res.data.session.id}`, {
        state: { session: res.data.session, exercises: res.data.exercises },
      });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start workout');
      setStarting(null);
    }
  };

  // Pass the current tab type so TemplateEditor pre-selects it
  const handleNew = () => navigate('/template/new', { state: { templateType: tab } });

  const filtered = templates.filter(t => (t.template_type || 'strength') === tab);
  const isCardio = tab === 'cardio';

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">My <span>Templates</span></h1>
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
    </div>
  );
}
