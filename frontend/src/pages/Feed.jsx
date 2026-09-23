import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Dumbbell, Heart, Share2 } from 'lucide-react';
import api from '../api';
import { SharedTemplateCard } from './SharedTemplates';

function timeAgo(d) {
  const secs = Math.floor((Date.now() - new Date(d)) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtDuration(s) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Avatar({ username, avatarData, size = 38 }) {
  const initials = username?.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden',
      background: 'var(--bg-elevated)', border: '2px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {avatarData
        ? <img src={avatarData} alt={username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: size * 0.35, color: 'var(--accent)' }}>{initials}</span>
      }
    </div>
  );
}

export default function Feed({ hideHeader } = {}) {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/users/feed')
      .then(res => { setFeed(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className={hideHeader ? undefined : 'page'} style={hideHeader ? { padding: '12px 0' } : undefined}>
      {!hideHeader && (
        <div className="page-header">
          <h1 className="page-title">Feed</h1>
        </div>
      )}

      {feed.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Users size={52} /></div>
          <h3>Nothing here yet</h3>
          <p>Find people to follow from the Leaderboard or by visiting their profile.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {feed.map(item => (item.kind === 'template_shared' ? (
            // A published template is worth taking straight from the feed, so
            // the card is the real thing rather than a link to it.
            <div key={item.id} className="feed-share">
              <div className="feed-share-header" onClick={() => navigate(`/user/${item.username}`)}>
                <Avatar username={item.username} avatarData={item.avatar_data} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="feed-card-username">{item.username}</div>
                  <div className="feed-card-time">shared a template · {timeAgo(item.happened_at)}</div>
                </div>
                <Share2 size={16} color="var(--accent)" />
              </div>
              <SharedTemplateCard template={item.template} />
            </div>
          ) : (
            <div
              key={item.id}
              className="feed-card"
              onClick={() => navigate(`/user/${item.username}`)}
            >
              <div className="feed-card-header">
                <Avatar username={item.username} avatarData={item.avatar_data} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="feed-card-username">{item.username}</div>
                  <div className="feed-card-time">{timeAgo(item.completed_at)}</div>
                </div>
                {item.template_type === 'cardio'
                  ? <Heart size={16} color="var(--accent-secondary)" />
                  : <Dumbbell size={16} color="var(--accent)" />
                }
              </div>

              <div className="feed-card-workout">
                {item.template_name || 'Workout'}
              </div>

              <div className="feed-card-stats">
                {fmtDuration(item.duration_seconds) && (
                  <span className="feed-stat">{fmtDuration(item.duration_seconds)}</span>
                )}
                {/* Counts arrive from Postgres as strings, so compare numerically. */}
                <span className="feed-stat">{item.exercise_count} exercise{Number(item.exercise_count) === 1 ? '' : 's'}</span>
                <span className="feed-stat">{item.sets_completed} set{Number(item.sets_completed) === 1 ? '' : 's'}</span>
                {parseFloat(item.total_volume) > 0 && (
                  <span className="feed-stat">{Math.round(item.total_volume).toLocaleString()} kg</span>
                )}
              </div>
            </div>
          )))}
        </div>
      )}
    </div>
  );
}
