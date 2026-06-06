import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Pencil, Trash2, Dumbbell } from 'lucide-react';
import api from '../api';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const res = await api.get('/templates');
      setTemplates(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this template? This cannot be undone.')) return;
    try {
      await api.delete(`/templates/${id}`);
      setTemplates(t => t.filter(x => x.id !== id));
    } catch (err) {
      console.error(err);
    }
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

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">My <span>Templates</span></h1>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/template/new')}>
          <Plus size={15} /> New
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Dumbbell size={52} /></div>
          <h3>No Templates Yet</h3>
          <p>Create your first workout template and start tracking your gains</p>
          <button className="btn btn-primary" onClick={() => navigate('/template/new')}>
            <Plus size={16} /> Create Template
          </button>
        </div>
      ) : (
        <div className="template-list">
          {templates.map(t => (
            <div
              key={t.id}
              className="template-card"
              onClick={() => navigate(`/template/${t.id}/edit`)}
            >
              <div className="template-name">{t.name}</div>
              <div className="template-meta">
                {t.exercises.length} exercise{t.exercises.length !== 1 ? 's' : ''} &middot;{' '}
                {t.exercises.reduce((a, e) => a + Number(e.sets), 0)} total sets
              </div>
              {t.exercises.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {t.exercises.slice(0, 4).map((ex, i) => (
                    <span key={i} className="tag">{ex.name}</span>
                  ))}
                  {t.exercises.length > 4 && (
                    <span className="tag">+{t.exercises.length - 4} more</span>
                  )}
                </div>
              )}
              <div className="template-actions">
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1 }}
                  onClick={e => handleStart(e, t.id)}
                  disabled={starting === t.id}
                >
                  <Play size={13} />
                  {starting === t.id ? 'Starting...' : 'Start Workout'}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={e => { e.stopPropagation(); navigate(`/template/${t.id}/edit`); }}
                  aria-label="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={e => handleDelete(e, t.id)}
                  aria-label="Delete"
                >
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
