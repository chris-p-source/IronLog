import React, { useState, useEffect } from 'react';
import { Trophy, Search, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PersonalBests() {
  const [bests, setBests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/progress/personal-bests')
      .then(res => { setBests(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = bests.filter(b =>
    b.exercise_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Personal Bests</h1>
        <Trophy size={22} color="var(--warning)" />
      </div>

      {!loading && bests.length > 0 && (
        <div className="search-bar" style={{ marginBottom: 16 }}>
          <Search size={15} color="var(--text-muted)" />
          <input
            className="search-input"
            placeholder="Search exercises..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <div className="loading">Loading...</div>
      ) : bests.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Trophy size={52} /></div>
          <h3>No PRs Yet</h3>
          <p>Complete a strength workout with weights to see your bests here</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>No results</h3>
          <p>No exercises matching "{search}"</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(b => (
            <div
              key={b.exercise_name}
              className="pb-card"
              onClick={() => navigate(`/progress?exercise=${encodeURIComponent(b.exercise_name)}`)}
            >
              <div className="pb-card-header">
                <span className="pb-exercise-name">{b.exercise_name}</span>
                <ChevronRight size={16} color="var(--text-muted)" />
              </div>
              <div className="pb-stats">
                <div className="pb-stat">
                  <div className="pb-stat-value">{parseFloat(b.pr_weight)}kg</div>
                  <div className="pb-stat-label">Best Weight</div>
                </div>
                <div className="pb-divider" />
                <div className="pb-stat">
                  <div className="pb-stat-value">{b.pr_reps}</div>
                  <div className="pb-stat-label">Best Reps</div>
                </div>
                <div className="pb-divider" />
                <div className="pb-stat">
                  <div className="pb-stat-value">{Math.round(parseFloat(b.estimated_1rm))}kg</div>
                  <div className="pb-stat-label">Est. 1RM</div>
                </div>
                <div className="pb-divider" />
                <div className="pb-stat">
                  <div className="pb-stat-value">{b.total_sessions}</div>
                  <div className="pb-stat-label">Sessions</div>
                </div>
              </div>
              <div className="pb-last-date">Last performed {formatDate(b.last_performed)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
