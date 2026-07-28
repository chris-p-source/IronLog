import React, { useState, useEffect } from 'react';
import api from '../api';

const MUSCLE_GROUPS = {
  chest:      { label: 'Chest',       keywords: ['bench', 'chest', 'fly', 'pec', 'dip', 'push up', 'pushup'] },
  shoulders:  { label: 'Shoulders',   keywords: ['shoulder', 'ohp', 'overhead press', 'lateral raise', 'delt', 'military', 'arnold'] },
  back:       { label: 'Back',        keywords: ['row', 'pull up', 'pullup', 'pull-up', 'lat', 'deadlift', 'pulldown', 'pull down', 'back', 'chin up', 'chinup', 'shrug', 'trap'] },
  biceps:     { label: 'Biceps',      keywords: ['curl', 'bicep', 'hammer', 'preacher'] },
  triceps:    { label: 'Triceps',     keywords: ['tricep', 'skull', 'pushdown', 'tricep extension', 'kickback', 'close grip'] },
  core:       { label: 'Core',        keywords: ['abs', 'core', 'plank', 'crunch', 'sit up', 'leg raise', 'russian twist', 'ab '] },
  quads:      { label: 'Quads',       keywords: ['squat', 'leg press', 'lunge', 'quad', 'leg extension', 'hack squat', 'split squat', 'step up'] },
  hamstrings: { label: 'Hamstrings',  keywords: ['hamstring', 'romanian', 'rdl', 'leg curl', 'nordic', 'good morning', 'stiff leg'] },
  glutes:     { label: 'Glutes',      keywords: ['glute', 'hip thrust', 'rdl', 'bulgarian', 'bridge', 'hip abduction'] },
  calves:     { label: 'Calves',      keywords: ['calf', 'calves', 'calf raise', 'standing raise', 'seated raise'] },
};

// Fatigue half-life: ~48 hours. Score = sets * e^(-hoursElapsed / 48)
// A score of 0 = fully recovered, 1+ = fatigued (normalised to 0–1 for display)
const HALF_LIFE_HOURS = 48;

function classify(exerciseName) {
  const name = exerciseName.toLowerCase();
  const matches = [];
  for (const [group, { keywords }] of Object.entries(MUSCLE_GROUPS)) {
    if (keywords.some(kw => name.includes(kw))) matches.push(group);
  }
  return matches;
}

function computeFatigue(activity) {
  // activity: [{ exercise_name, completed_at, sets }]
  const scores = {};
  const now = Date.now();
  for (const row of activity) {
    const hoursElapsed = (now - new Date(row.completed_at).getTime()) / 3600000;
    const decay = Math.exp(-hoursElapsed / HALF_LIFE_HOURS);
    const contribution = parseInt(row.sets) * decay;
    for (const group of classify(row.exercise_name)) {
      scores[group] = (scores[group] || 0) + contribution;
    }
  }
  return scores;
}

// Colour: red = very fatigued, orange = moderate, green = recovered
function fatigueColor(pct) {
  if (pct >= 0.7) return '#e63030';
  if (pct >= 0.4) return '#ff6b00';
  if (pct >= 0.1) return '#f0b429';
  return '#22c55e';
}

function fatigueLabel(pct) {
  if (pct >= 0.7) return 'Fatigued';
  if (pct >= 0.4) return 'Moderate';
  if (pct >= 0.1) return 'Low';
  return 'Recovered';
}

// SVG paths — front view, viewBox "0 0 160 340"
const FRONT_REGIONS = {
  chest:     ['M58,55 L102,55 L106,112 L54,112 Z'],
  shoulders: ['M28,55 L56,55 L58,108 L26,100 Z', 'M104,55 L132,55 L134,100 L102,108 Z'],
  biceps:    ['M22,100 L50,105 L47,160 L19,155 Z', 'M110,105 L138,100 L141,155 L113,160 Z'],
  triceps:   null,
  core:      ['M54,112 L106,112 L108,178 L52,178 Z'],
  quads:     ['M52,180 L82,180 L79,278 L47,271 Z', 'M82,180 L112,180 L117,271 L85,278 Z'],
  calves:    ['M47,275 L78,278 L74,325 L43,320 Z', 'M85,278 L117,275 L121,320 L89,325 Z'],
  back: null, hamstrings: null, glutes: null,
};

// Back view
const BACK_REGIONS = {
  back:       ['M58,55 L102,55 L108,165 L52,165 Z'],
  shoulders:  ['M28,55 L56,55 L54,108 L26,100 Z', 'M104,55 L132,55 L134,100 L106,108 Z'],
  triceps:    ['M22,100 L50,105 L47,160 L19,155 Z', 'M110,105 L138,100 L141,155 L113,160 Z'],
  glutes:     ['M52,168 L82,168 L80,210 L48,205 Z', 'M82,168 L112,168 L116,205 L84,210 Z'],
  hamstrings: ['M48,210 L80,210 L76,278 L44,271 Z', 'M84,210 L116,210 L120,271 L88,278 Z'],
  calves:     ['M44,275 L76,278 L72,325 L40,320 Z', 'M88,278 L120,275 L124,320 L92,325 Z'],
  chest: null, biceps: null, core: null, quads: null,
};

const BODY_PATH = `
  M80,6 m-16,0 a16,16 0 1,0 32,0 a16,16 0 1,0 -32,0
  M74,38 L86,38 L88,52 L72,52 Z
  M46,52 L114,52 L120,185 L40,185 Z
  M20,56 L46,56 L42,185 L16,178 Z
  M114,56 L140,56 L144,178 L118,185 Z
  M16,178 L42,185 L38,235 L12,228 Z
  M118,185 L144,178 L148,228 L122,235 Z
  M40,188 L80,188 L76,285 L36,278 Z
  M80,188 L120,188 L124,278 L84,285 Z
  M36,280 L76,285 L72,330 L32,324 Z
  M84,285 L124,280 L128,324 L88,330 Z
`;

function BodyView({ title, regions, normalisedScores }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{title}</div>
      <svg viewBox="0 0 160 340" style={{ width: '100%', maxWidth: 160, height: 'auto' }}>
        <path d={BODY_PATH} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth="1.5" fillRule="evenodd" />
        {Object.entries(regions).map(([muscle, paths]) => {
          const pct = normalisedScores[muscle] || 0;
          if (!paths || pct === 0) return null;
          return paths.map((d, i) => (
            <path key={`${muscle}-${i}`} d={d} fill={fatigueColor(pct)} opacity={0.5 + pct * 0.45}
              style={{ transition: 'fill 0.3s, opacity 0.3s' }} />
          ));
        })}
      </svg>
    </div>
  );
}

export default function MuscleMap({ hideHeader } = {}) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/progress/muscle-activity')
      .then(res => { setActivity(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const rawScores = computeFatigue(activity);

  // Normalise to 0–1 relative to max raw score (cap at ~12 sets which is a hard session)
  const MAX_SCORE = 12;
  const normalisedScores = {};
  for (const [group, score] of Object.entries(rawScores)) {
    normalisedScores[group] = Math.min(1, score / MAX_SCORE);
  }

  const sortedGroups = Object.entries(normalisedScores).sort(([, a], [, b]) => b - a);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className={hideHeader ? undefined : 'page'} style={hideHeader ? { padding: '12px 0' } : undefined}>
      {!hideHeader && (
        <div className="page-header">
          <h1 className="page-title">Recovery</h1>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Last 7 days</span>
        </div>
      )}

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
        Estimated fatigue based on training recency and volume. Muscles fade toward green as they recover (~48h half-life).
      </p>

      {activity.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div className="empty-state-icon" style={{ fontSize: 48 }}>💪</div>
          <h3>No recent activity</h3>
          <p>Complete a strength workout to see your recovery status.</p>
        </div>
      ) : (
        <>
          {/* Body diagrams */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <BodyView title="Front" regions={FRONT_REGIONS} normalisedScores={normalisedScores} />
            <BodyView title="Back" regions={BACK_REGIONS} normalisedScores={normalisedScores} />
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginRight: 2 }}>Status:</span>
            {[['Recovered', '#22c55e'], ['Low', '#f0b429'], ['Moderate', '#ff6b00'], ['Fatigued', '#e63030']].map(([l, c]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block', flexShrink: 0 }} />
                {l}
              </span>
            ))}
          </div>

          {/* Muscle breakdown */}
          <div className="section-heading">Muscle Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedGroups.map(([group, pct]) => (
              <div key={group} className="muscle-row">
                <div className="muscle-row-label">{MUSCLE_GROUPS[group].label}</div>
                <div className="muscle-row-bar-track">
                  <div
                    className="muscle-row-bar-fill"
                    style={{ width: `${Math.round(pct * 100)}%`, background: fatigueColor(pct) }}
                  />
                </div>
                <div className="muscle-row-status" style={{ color: fatigueColor(pct) }}>
                  {fatigueLabel(pct)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
