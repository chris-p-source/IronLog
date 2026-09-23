import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Download, Check, Dumbbell, Heart, Users, ChevronLeft } from 'lucide-react';
import api from '../api';

function ExerciseTags({ exercises, isCardio }) {
  if (!exercises?.length) return null;
  return (
    <div className="shared-template-tags">
      {exercises.slice(0, 4).map((ex, i) => (
        <span key={i} className={`tag ${isCardio ? 'tag-cardio' : ''}`}>{ex.name}</span>
      ))}
      {exercises.length > 4 && <span className="tag">+{exercises.length - 4}</span>}
    </div>
  );
}

// One template in the library. Expands to show what is actually in it, because
// nobody should take a programme on the strength of its name alone.
export function SharedTemplateCard({ template, onAdded }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(template.already_added);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const isCardio = template.template_type === 'cardio';

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) {
      try {
        const res = await api.get(`/templates/shared/${template.id}`);
        setDetail(res.data);
      } catch {
        setError('Could not load this template');
      }
    }
  };

  const add = async (e) => {
    e.stopPropagation();
    if (adding || added) return;
    setAdding(true);
    setError('');
    try {
      const res = await api.post(`/templates/shared/${template.id}/add`);
      setAdded(true);
      onAdded?.(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add that template');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className={`template-card shared-template-card${isCardio ? ' template-card-cardio' : ''}`}>
      <div className="shared-template-head" onClick={toggle}>
        <div className="shared-template-titles">
          <div className="template-name">{template.name}</div>
          <div className="shared-template-byline">
            <button
              className="shared-template-author"
              onClick={e => { e.stopPropagation(); navigate(`/user/${template.author}`); }}
            >
              by @{template.author}
            </button>
            {template.source_author && template.source_author !== template.author && (
              <span className="shared-template-adapted">adapted from @{template.source_author}</span>
            )}
          </div>
        </div>
        {isCardio ? <Heart size={15} color="var(--accent-secondary)" /> : <Dumbbell size={15} color="var(--accent)" />}
      </div>

      {template.description && (
        <div className="shared-template-description">{template.description}</div>
      )}

      <div className="template-meta">
        {template.exercise_count} exercise{template.exercise_count !== 1 ? 's' : ''}
        {template.add_count > 0 && (
          <> · <Users size={11} style={{ verticalAlign: -1 }} /> added by {template.add_count}</>
        )}
      </div>

      {expanded && detail && (
        <div className="shared-template-detail">
          {detail.exercises.map((ex, i) => (
            <div key={i} className="shared-template-exercise">
              <span>{ex.name}</span>
              <span className="shared-template-scheme">
                {ex.exercise_type === 'cardio'
                  ? `${ex.planned_duration_minutes || 0} min`
                  : `${ex.sets} × ${ex.reps}${ex.base_weight_kg ? ` @ ${parseFloat(ex.base_weight_kg)}kg` : ''}`}
              </span>
            </div>
          ))}
        </div>
      )}
      {!expanded && <ExerciseTags exercises={detail?.exercises} isCardio={isCardio} />}

      {error && <div className="error-msg">{error}</div>}

      <div className="template-actions">
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={toggle}>
          {expanded ? 'Hide' : 'View'}
        </button>
        {template.is_own ? (
          <span className="shared-template-own">Yours</span>
        ) : (
          <button
            className={`btn btn-sm ${added ? 'btn-secondary' : isCardio ? 'btn-cardio' : 'btn-primary'}`}
            style={{ flex: 1 }}
            onClick={add}
            disabled={adding || added}
          >
            {added ? <><Check size={13} /> Added</> : <><Download size={13} /> {adding ? 'Adding...' : 'Add'}</>}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SharedTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Re-query on every change so the exercise-name search stays server-side.
    const id = setTimeout(() => {
      setLoading(true);
      api.get('/templates/shared', { params: { search: search || undefined, type: type || undefined } })
        .then(r => setTemplates(r.data))
        .catch(() => setTemplates([]))
        .finally(() => setLoading(false));
    }, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [search, type]);

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>
          <ChevronLeft size={15} /> Mine
        </button>
        <h1 className="page-title" style={{ flex: 1, textAlign: 'right' }}>Shared</h1>
      </div>

      <div className="goal-search">
        <Search size={15} />
        <input
          placeholder="Search templates, people or exercises"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="tab-bar" style={{ marginBottom: 20 }}>
        <button className={`tab-btn ${type === '' ? 'active' : ''}`} onClick={() => setType('')}>All</button>
        <button className={`tab-btn ${type === 'strength' ? 'active' : ''}`} onClick={() => setType('strength')}>
          <Dumbbell size={13} /> Strength
        </button>
        <button
          className={`tab-btn ${type === 'cardio' ? 'active' : ''}`}
          onClick={() => setType('cardio')}
          style={type === 'cardio' ? { background: 'var(--accent-secondary)' } : {}}
        >
          <Heart size={13} /> Cardio
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Users size={52} /></div>
          <h3>{search ? 'Nothing Matches' : 'No Shared Templates Yet'}</h3>
          <p>
            {search
              ? 'Try another name, person or exercise.'
              : 'When someone shares a template it shows up here, ready to add to your own.'}
          </p>
        </div>
      ) : (
        <div className="template-list">
          {templates.map(t => <SharedTemplateCard key={t.id} template={t} />)}
        </div>
      )}
    </div>
  );
}
