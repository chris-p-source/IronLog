import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, UserCheck } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

function Avatar({ username, avatarData, size = 40 }) {
  const initials = username?.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      background: 'var(--bg-elevated)', border: '2px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {avatarData
        ? <img src={avatarData} alt={username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: size * 0.35, color: 'var(--accent)' }}>{initials}</span>
      }
    </div>
  );
}

export default function FindUsers({ hideHeader } = {}) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState({});
  const { user: me } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.get(`/users/search?q=${encodeURIComponent(query)}`)
        .then(res => { setUsers(res.data); setLoading(false); })
        .catch(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const handleFollow = async (e, user) => {
    e.stopPropagation();
    if (followLoading[user.id]) return;
    setFollowLoading(f => ({ ...f, [user.id]: true }));
    try {
      if (user.is_following) {
        await api.delete(`/users/${user.username}/follow`);
        setUsers(us => us.map(u => u.id === user.id ? { ...u, is_following: false } : u));
      } else {
        await api.post(`/users/${user.username}/follow`);
        setUsers(us => us.map(u => u.id === user.id ? { ...u, is_following: true } : u));
      }
    } catch (err) { console.error(err); }
    setFollowLoading(f => ({ ...f, [user.id]: false }));
  };

  return (
    <div className={hideHeader ? undefined : 'page'} style={hideHeader ? { padding: '12px 0' } : undefined}>
      {!hideHeader && (
        <div className="page-header">
          <h1 className="page-title">Find People</h1>
        </div>
      )}

      <div className="search-bar" style={{ marginBottom: 16 }}>
        <Search size={15} color="var(--text-muted)" />
        <input
          className="search-input"
          placeholder="Search by username…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus={!hideHeader}
        />
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : users.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 32 }}>
          <h3>No users found</h3>
          <p>{query ? `Nobody matching "${query}"` : 'No public profiles yet'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.map(u => (
            <div
              key={u.id}
              className="find-user-card"
              onClick={() => navigate(`/user/${u.username}`)}
            >
              <Avatar username={u.username} avatarData={u.avatar_data} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="find-user-name">{u.username}</div>
                <div className="find-user-meta">{u.total_workouts} workout{u.total_workouts !== 1 ? 's' : ''}</div>
              </div>
              {u.id !== me?.id && (
                <button
                  className={u.is_following ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
                  onClick={e => handleFollow(e, u)}
                  disabled={!!followLoading[u.id]}
                  style={{ flexShrink: 0 }}
                >
                  {u.is_following
                    ? <><UserCheck size={13} /> Following</>
                    : <><UserPlus size={13} /> Follow</>
                  }
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
