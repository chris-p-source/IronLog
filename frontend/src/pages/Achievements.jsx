import React, { useState, useEffect } from 'react';
import { Trophy, Lock, Check, Sparkles } from 'lucide-react';
import api from '../api';

const TIER_COLOUR = {
  bronze: '#c07a3e',
  silver: '#b8b8c0',
  gold: 'var(--warning)',
};

// Thresholds run from 1 to a million, so show them at a sensible size.
function formatValue(value, unit) {
  if (unit === 'kg') {
    return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}t` : `${Math.round(value)}kg`;
  }
  if (unit === 'x') return `${value.toFixed(2)}x`;
  if (unit === 'km') return `${value.toFixed(1)}km`;
  if (unit === 'min') return `${Math.round(value)}min`;
  return Math.round(value).toLocaleString();
}

function LevelCard({ profile }) {
  return (
    <div className="level-card">
      <div className="level-card-glow" />
      <div className="level-card-top">
        <div className="level-ring">
          <span className="level-ring-num">{profile.level}</span>
          <span className="level-ring-label">LVL</span>
        </div>
        <div className="level-card-titles">
          <div className="level-card-title">{profile.title}</div>
          {profile.equippedTitle && (
            <div className="level-card-flair">{profile.equippedTitle}</div>
          )}
          <div className="level-card-xp">{profile.xp.toLocaleString()} XP</div>
        </div>
      </div>

      <div className="level-progress-track">
        <div className="level-progress-fill" style={{ width: `${profile.percent}%` }} />
      </div>
      <div className="level-progress-legend">
        <span>{profile.xpIntoLevel.toLocaleString()} / {profile.xpForNextLevel.toLocaleString()}</span>
        <span>{profile.xpToNextLevel.toLocaleString()} XP to level {profile.level + 1}</span>
      </div>

      {/* Where the XP came from — otherwise nobody discovers that weighing in
          and tracking meals earn any. */}
      {profile.breakdown && (
        <div className="level-breakdown">
          <span><strong>{profile.breakdown.training.toLocaleString()}</strong> training</span>
          <span className="level-breakdown-dot">·</span>
          <span><strong>{profile.breakdown.tracking.toLocaleString()}</strong> tracking</span>
        </div>
      )}
    </div>
  );
}

function BadgeCard({ badge }) {
  const colour = TIER_COLOUR[badge.tier] || 'var(--text-secondary)';
  return (
    <div className={`badge-card${badge.earned ? ' earned' : ''}`}>
      <div className="badge-medal" style={badge.earned ? { borderColor: colour, color: colour } : undefined}>
        {badge.earned ? <Trophy size={18} /> : <Lock size={15} />}
      </div>
      <div className="badge-body">
        <div className="badge-name">{badge.name}</div>
        <div className="badge-desc">{badge.description}</div>
        {!badge.earned && (
          <>
            <div className="badge-progress-track">
              <div className="badge-progress-fill" style={{ width: `${badge.percent}%` }} />
            </div>
            <div className="badge-progress-text">
              {formatValue(badge.value, badge.unit)} / {formatValue(badge.threshold, badge.unit)}
            </div>
          </>
        )}
        {badge.earned && badge.title && (
          <div className="badge-unlocks">Unlocks title: {badge.title}</div>
        )}
      </div>
    </div>
  );
}

function TitlePicker({ titles, equipped, onPick, saving }) {
  if (titles.length === 0) {
    return (
      <div className="titles-empty">
        Earn badges to unlock titles you can display next to your name.
      </div>
    );
  }
  return (
    <div className="title-chips">
      <button
        className={`title-chip${!equipped ? ' active' : ''}`}
        onClick={() => onPick(null)}
        disabled={saving}
      >
        None
      </button>
      {titles.map(title => (
        <button
          key={title}
          className={`title-chip${equipped === title ? ' active' : ''}`}
          onClick={() => onPick(title)}
          disabled={saving}
        >
          {equipped === title && <Check size={13} />}
          {title}
        </button>
      ))}
    </div>
  );
}

export default function Achievements() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState('All');

  useEffect(() => {
    api.get('/gamification/me')
      .then(res => setProfile(res.data))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  const pickTitle = async (title) => {
    setSaving(true);
    const previous = profile.equippedTitle;
    setProfile(p => ({ ...p, equippedTitle: title }));
    try {
      await api.put('/gamification/title', { title });
    } catch {
      setProfile(p => ({ ...p, equippedTitle: previous }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page"><div className="loading">Loading achievements...</div></div>;
  if (!profile) return <div className="page"><div className="empty-state"><p>Could not load achievements.</p></div></div>;

  const categories = ['All', ...new Set(profile.badges.map(b => b.category))];
  const shown = category === 'All'
    ? profile.badges
    : profile.badges.filter(b => b.category === category);
  // Earned first, then whatever is closest to being earned — so the next thing
  // worth chasing is always near the top.
  const ordered = [...shown].sort((a, b) => (b.earned - a.earned) || (b.percent - a.percent));

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Achievements</h1>
      </div>

      <LevelCard profile={profile} />

      <div className="section-heading">
        Titles
        <Sparkles size={14} style={{ marginLeft: 6, color: 'var(--warning)' }} />
      </div>
      <TitlePicker
        titles={profile.availableTitles}
        equipped={profile.equippedTitle}
        onPick={pickTitle}
        saving={saving}
      />

      <div className="section-heading" style={{ marginTop: 24 }}>
        Badges
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, marginLeft: 8 }}>
          {profile.earnedCount} / {profile.totalBadges}
        </span>
      </div>

      <div className="badge-filter-row">
        {categories.map(c => (
          <button
            key={c}
            className={`badge-filter${category === c ? ' active' : ''}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="badge-grid">
        {ordered.map(badge => <BadgeCard key={badge.id} badge={badge} />)}
      </div>
    </div>
  );
}
