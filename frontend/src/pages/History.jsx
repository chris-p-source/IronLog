import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Dumbbell, Heart } from 'lucide-react';
import api from '../api';

function formatDuration(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(d) {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// Build a 53-week grid ending today
function buildGrid(data) {
  const map = {};
  for (const { day, count } of data) map[day] = Number(count);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // start = Sunday of the week 52 weeks ago
  const start = new Date(today);
  start.setDate(start.getDate() - 52 * 7 - start.getDay());

  const weeks = [];
  let current = new Date(start);
  while (current <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const iso = current.toISOString().slice(0, 10);
      week.push({ date: iso, count: map[iso] || 0, future: current > today });
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function getMonthLabels(weeks) {
  const labels = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const d = new Date(week[0].date);
    const m = d.getMonth();
    if (m !== lastMonth) {
      labels.push({ col: i, label: d.toLocaleString('default', { month: 'short' }) });
      lastMonth = m;
    }
  });
  return labels;
}

function WorkoutHeatmap({ data }) {
  const scrollRef = useRef(null);
  const weeks = buildGrid(data);
  const monthLabels = getMonthLabels(weeks);
  const CELL = 13;
  const GAP = 3;
  const STEP = CELL + GAP;
  const TOP = 20; // room for month labels
  const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  // intensity: 0 = empty, 1-4 levels
  const level = (count) => {
    if (count === 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count <= 3) return 3;
    return 4;
  };

  const totalWorkouts = data.reduce((s, d) => s + Number(d.count), 0);
  const svgW = weeks.length * STEP;
  const svgH = TOP + 7 * STEP;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [data.length]);

  return (
    <div className="heatmap-card">
      <div className="heatmap-title">
        <span>Workout Activity</span>
        <span className="heatmap-subtitle">{totalWorkouts} sessions in the last year</span>
      </div>
      <div className="heatmap-scroll" ref={scrollRef}>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* day-of-week labels */}
          <div style={{ display: 'flex', flexDirection: 'column', paddingTop: TOP + 1, gap: GAP }}>
            {DAY_LABELS.map((l, i) => (
              <div key={i} style={{ height: CELL, fontSize: 9, color: 'var(--text-muted)', lineHeight: `${CELL}px`, width: 22, textAlign: 'right', paddingRight: 4 }}>
                {l}
              </div>
            ))}
          </div>
          <svg width={svgW} height={svgH} style={{ display: 'block', flexShrink: 0 }}>
            {/* month labels */}
            {monthLabels.map(({ col, label }) => (
              <text key={col} x={col * STEP} y={13} fontSize={10} fill="var(--text-muted)">{label}</text>
            ))}
            {/* cells */}
            {weeks.map((week, wi) =>
              week.map((cell, di) => (
                <rect
                  key={`${wi}-${di}`}
                  x={wi * STEP}
                  y={TOP + di * STEP}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  className={`heatmap-cell heatmap-level-${cell.future ? 'empty' : level(cell.count)}`}
                >
                  <title>{cell.date}: {cell.count} workout{cell.count !== 1 ? 's' : ''}</title>
                </rect>
              ))
            )}
          </svg>
        </div>
      </div>
      <div className="heatmap-legend">
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Less</span>
        {[0, 1, 2, 3, 4].map(l => (
          <svg key={l} width={CELL} height={CELL}><rect width={CELL} height={CELL} rx={2} className={`heatmap-cell heatmap-level-${l}`} /></svg>
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>More</span>
      </div>
    </div>
  );
}

export default function History() {
  const [workouts, setWorkouts] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('strength');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/workouts/heatmap').then(res => setHeatmapData(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.get(`/workouts/history?type=${tab}`)
      .then(res => { setWorkouts(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tab]);

  const isCardio = tab === 'cardio';

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Workout Log</h1>
      </div>

      <WorkoutHeatmap data={heatmapData} />

      <div className="tab-bar" style={{ marginBottom: 20 }}>
        <button
          className={`tab-btn ${tab === 'strength' ? 'active' : ''}`}
          onClick={() => setTab('strength')}
        >
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

      {loading ? (
        <div className="loading">Loading...</div>
      ) : workouts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            {isCardio ? <Heart size={52} /> : <Clock size={52} />}
          </div>
          <h3>No {isCardio ? 'Cardio' : 'Strength'} History</h3>
          <p>Complete a {isCardio ? 'cardio' : 'strength'} workout to see it here</p>
        </div>
      ) : (
        workouts.map(w => (
          <div
            key={w.id}
            className={`history-item ${isCardio ? 'history-item-cardio' : ''}`}
            onClick={() => navigate(`/history/${w.id}`)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="history-date">{formatDate(w.completed_at)}</div>
                <div className="history-workout-name">{w.template_name}</div>
              </div>
              <ChevronRight size={18} color="var(--text-muted)" style={{ marginTop: 4 }} />
            </div>
            <div className="history-stats">
              <div>
                <div className="history-stat-value" style={isCardio ? { color: 'var(--accent-secondary)' } : {}}>
                  {formatDuration(w.duration_seconds)}
                </div>
                <div className="history-stat-label">Duration</div>
              </div>
              <div>
                <div className="history-stat-value" style={isCardio ? { color: 'var(--accent-secondary)' } : {}}>
                  {w.exercise_count}
                </div>
                <div className="history-stat-label">Exercises</div>
              </div>
              {!isCardio && (
                <div>
                  <div className="history-stat-value">{w.total_sets_completed}</div>
                  <div className="history-stat-label">Sets Done</div>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
