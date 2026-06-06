import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Dumbbell, Heart, Zap, Calendar } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const MEDALS = ['🥇', '🥈', '🥉'];

function Avatar({ user, size = 38 }) {
  const initials = user.username?.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--bg-elevated)', border: '2px solid var(--border-accent)',
      overflow: 'hidden', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-display)', fontWeight: 800,
      fontSize: Math.round(size * 0.36), color: 'var(--accent)',
    }}>
      {user.avatar_data
        ? <img src={user.avatar_data} alt={user.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials
      }
    </div>
  );
}

function LeaderboardList({ rows, valueKey, unit, myId, onUserClick }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '40px 20px' }}>
        <div className="empty-state-icon"><Trophy size={44} /></div>
        <h3>No Data Yet</h3>
        <p>Complete workouts this week to appear here</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row, i) => {
        const isMe = row.id === myId;
        return (
          <div
            key={row.id}
            className={`leaderboard-row${isMe ? ' leaderboard-row-me' : ''}`}
            onClick={() => onUserClick(row.username)}
          >
            <div className="lb-rank">
              {i < 3
                ? <span style={{ fontSize: 20 }}>{MEDALS[i]}</span>
                : <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 800 }}>{i + 1}</span>
              }
            </div>
            <Avatar user={row} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lb-username">
                {row.username}
                {isMe && <span className="lb-you-badge">YOU</span>}
              </div>
              {row.gold_medals > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                  🥇 {row.gold_medals} gold medal{row.gold_medals !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            <div className="lb-points">
              <span className="lb-points-value">{Number(row[valueKey]).toLocaleString()}</span>
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

  // Top-level: strength | cardio
  const [section, setSection] = useState('strength');
  // Sub-level: weekly | alltime
  const [period, setPeriod] = useState('weekly');

  const [data, setData] = useState({
    strengthWeekly: null,
    strengthAlltime: null,
    cardioWeekly: null,
    cardioAlltime: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [sw, sa, cw, ca] = await Promise.allSettled([
        api.get('/leaderboard/strength/weekly'),
        api.get('/leaderboard/strength/alltime'),
        api.get('/leaderboard/cardio/weekly'),
        api.get('/leaderboard/cardio/alltime'),
      ]);
      setData({
        strengthWeekly: sw.value?.data ?? [],
        strengthAlltime: sa.value?.data ?? [],
        cardioWeekly: cw.value?.data ?? [],
        cardioAlltime: ca.value?.data ?? [],
      });
      setLoading(false);
    };
    fetchAll();
  }, []);

  const handleUserClick = (username) => {
    navigate(`/user/${username}`);
  };

  const currentRows = {
    strength: { weekly: data.strengthWeekly, alltime: data.strengthAlltime },
    cardio:   { weekly: data.cardioWeekly,   alltime: data.cardioAlltime },
  }[section][period];

  const myRank = currentRows?.findIndex(r => r.id === user?.id);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Leader<span>board</span></h1>
        <Trophy size={24} color="var(--accent)" />
      </div>

      {/* Top-level section tabs */}
      <div className="tab-bar" style={{ marginBottom: 10 }}>
        <button
          className={`tab-btn ${section === 'strength' ? 'active' : ''}`}
          onClick={() => setSection('strength')}
        >
          <Dumbbell size={13} /> Strength
        </button>
        <button
          className={`tab-btn ${section === 'cardio' ? 'active' : ''}`}
          onClick={() => setSection('cardio')}
          style={section === 'cardio' ? { background: 'var(--accent-secondary)' } : {}}
        >
          <Heart size={13} /> Cardio
        </button>
      </div>

      {/* Period sub-tabs */}
      <div className="tab-bar tab-bar-sm" style={{ marginBottom: 16 }}>
        <button
          className={`tab-btn ${period === 'weekly' ? 'active' : ''}`}
          onClick={() => setPeriod('weekly')}
        >
          <Calendar size={12} /> This Week
        </button>
        <button
          className={`tab-btn ${period === 'alltime' ? 'active' : ''}`}
          onClick={() => setPeriod('alltime')}
        >
          <Trophy size={12} /> All Time
        </button>
      </div>

      {/* Context banner */}
      <div className="points-info-banner">
        {section === 'strength' ? (
          <>
            <Zap size={13} color="var(--accent)" />
            <span>1 rep completed = 1 point</span>
          </>
        ) : (
          <>
            <Heart size={13} color="var(--accent-secondary)" />
            <span>Ranked by total cardio minutes</span>
          </>
        )}
        {period === 'weekly' && (
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 11 }}>Resets Mon</span>
        )}
      </div>

      {/* My rank callout */}
      {!loading && myRank !== undefined && myRank >= 0 && (
        <div className="my-rank-banner">
          Your rank: <strong>#{myRank + 1}</strong>
          {myRank === 0 && period === 'weekly' && <span style={{ marginLeft: 8 }}>🔥 You're leading this week!</span>}
        </div>
      )}

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <LeaderboardList
          rows={currentRows}
          valueKey={section === 'strength' ? 'total_points' : 'total_minutes'}
          unit={section === 'strength' ? 'pts' : 'min'}
          myId={user?.id}
          onUserClick={handleUserClick}
        />
      )}
    </div>
  );
}
