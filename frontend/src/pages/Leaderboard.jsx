import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Zap, Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const TABS = [
  { key: 'weekly', label: 'This Week' },
  { key: 'alltime', label: 'All Time' },
  { key: 'cardio', label: 'Cardio' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

function Avatar({ user, size = 38 }) {
  const initials = user.username?.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--bg-elevated)', border: '2px solid var(--border-accent)',
      overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size * 0.36, color: 'var(--accent)',
    }}>
      {user.avatar_data
        ? <img src={user.avatar_data} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials
      }
    </div>
  );
}

function LeaderboardList({ rows, metric, unit, myId, onUserClick }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '40px 20px' }}>
        <div className="empty-state-icon"><Trophy size={44} /></div>
        <h3>No Data Yet</h3>
        <p>Complete workouts to appear on the leaderboard</p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row, i) => {
        const isMe = row.id === myId;
        const medal = MEDALS[i];
        return (
          <div
            key={row.id}
            className={`leaderboard-row${isMe ? ' leaderboard-row-me' : ''}`}
            onClick={() => onUserClick(row.username)}
          >
            <div className="lb-rank">
              {medal ? <span style={{ fontSize: 20 }}>{medal}</span> : <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 800 }}>{i + 1}</span>}
            </div>
            <Avatar user={row} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lb-username">
                {row.username}
                {isMe && <span className="lb-you-badge">YOU</span>}
              </div>
            </div>
            <div className="lb-points">
              <span className="lb-points-value">{Number(row[metric]).toLocaleString()}</span>
              <span className="lb-points-unit">{unit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Leaderboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('weekly');
  const [cardioTab, setCardioTab] = useState('weekly');
  const [data, setData] = useState({ weekly: null, alltime: null, cardioWeekly: null, cardioAlltime: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [weekly, alltime, cardioW, cardioA] = await Promise.allSettled([
        api.get('/leaderboard/weekly'),
        api.get('/leaderboard/alltime'),
        api.get('/leaderboard/cardio/weekly'),
        api.get('/leaderboard/cardio/alltime'),
      ]);
      setData({
        weekly: weekly.value?.data || [],
        alltime: alltime.value?.data || [],
        cardioWeekly: cardioW.value?.data || [],
        cardioAlltime: cardioA.value?.data || [],
      });
      setLoading(false);
    };
    fetchAll();
  }, []);

  const handleUserClick = (username) => {
    if (username === user?.username) navigate('/profile');
    else navigate(`/user/${username}`);
  };

  const myRankIn = (rows) => {
    const idx = rows?.findIndex(r => r.id === user?.id);
    return idx >= 0 ? idx + 1 : null;
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Leader<span>board</span></h1>
        <Trophy size={26} color="var(--accent)" />
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.key === 'weekly' && <Zap size={13} />}
            {t.key === 'alltime' && <Trophy size={13} />}
            {t.key === 'cardio' && <Heart size={13} />}
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          {/* Points info banner */}
          {tab !== 'cardio' && (
            <div className="points-info-banner">
              <Zap size={13} color="var(--accent)" />
              <span>1 rep = 1 pt &nbsp;·&nbsp; 1 cardio min = 2 pts</span>
              {tab === 'weekly' && (
                <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)' }}>
                  Resets Monday
                </span>
              )}
            </div>
          )}

          {tab === 'weekly' && (
            <>
              {myRankIn(data.weekly) && (
                <div className="my-rank-banner">
                  Your rank this week: <strong>#{myRankIn(data.weekly)}</strong>
                </div>
              )}
              <LeaderboardList rows={data.weekly || []} metric="total_points" unit="pts" myId={user?.id} onUserClick={handleUserClick} />
            </>
          )}

          {tab === 'alltime' && (
            <>
              {myRankIn(data.alltime) && (
                <div className="my-rank-banner">
                  Your all-time rank: <strong>#{myRankIn(data.alltime)}</strong>
                </div>
              )}
              <LeaderboardList rows={data.alltime || []} metric="total_points" unit="pts" myId={user?.id} onUserClick={handleUserClick} />
            </>
          )}

          {tab === 'cardio' && (
            <>
              <div className="tab-bar" style={{ marginBottom: 16 }}>
                <button className={`tab-btn ${cardioTab === 'weekly' ? 'active' : ''}`} onClick={() => setCardioTab('weekly')}>This Week</button>
                <button className={`tab-btn ${cardioTab === 'alltime' ? 'active' : ''}`} onClick={() => setCardioTab('alltime')}>All Time</button>
              </div>
              <div className="points-info-banner">
                <Heart size={13} color="var(--accent-secondary)" />
                <span>Ranked by total cardio minutes</span>
              </div>
              <LeaderboardList
                rows={cardioTab === 'weekly' ? (data.cardioWeekly || []) : (data.cardioAlltime || [])}
                metric="total_minutes"
                unit="min"
                myId={user?.id}
                onUserClick={handleUserClick}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
