import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Dumbbell, Heart, ChevronLeft, Activity } from 'lucide-react';
import MuscleMap from './MuscleMap';
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

function groupByDay(workouts) {
  const groups = [];
  const seen = {};
  for (const w of workouts) {
    const date = new Date(w.completed_at);
    const iso = date.toISOString().slice(0, 10);
    if (!seen[iso]) {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      let dayLabel;
      if (iso === today.toISOString().slice(0, 10)) dayLabel = 'Today';
      else if (iso === yesterday.toISOString().slice(0, 10)) dayLabel = 'Yesterday';
      else dayLabel = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      seen[iso] = { dayLabel, workouts: [] };
      groups.push(seen[iso]);
    }
    seen[iso].workouts.push(w);
  }
  return groups;
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

// Returns { from, to, label } for a given period type and offset (0 = current, -1 = previous, etc.)
function getPeriodRange(period, offset) {
  const now = new Date();
  let from, to, label;

  if (period === 'week') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - dowMon(start) + offset * 7); // Monday-aligned
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    from = start;
    to = end;
    const opts = { day: 'numeric', month: 'short' };
    label = `${start.toLocaleDateString('en-GB', opts)} – ${new Date(end.getTime() - 1).toLocaleDateString('en-GB', opts)}`;
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    label = from.toLocaleString('default', { month: 'long', year: 'numeric' });
  } else if (period === 'year') {
    from = new Date(now.getFullYear() + offset, 0, 1);
    to = new Date(now.getFullYear() + offset + 1, 0, 1);
    label = String(now.getFullYear() + offset);
  }

  return { from, to, label };
}

// Monday-first: Mon=0 … Sun=6
function dowMon(date) { return (date.getDay() + 6) % 7; }

// Use local date parts to avoid UTC-offset shifting the day boundary
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Build a 53-week grid, Mon→Sun, ending today
function buildGrid(data) {
  const map = {};
  for (const row of data) {
    map[row.day] = {
      count: Number(row.count),
      strengthCount: Number(row.strength_count || 0),
      cardioCount: Number(row.cardio_count || 0),
      templates: row.templates || [],
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // rewind to the Monday that starts the grid (52 full weeks back)
  const start = new Date(today);
  start.setDate(start.getDate() - 52 * 7 - dowMon(today));

  const weeks = [];
  let current = new Date(start);
  while (current <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const iso = localISO(current);
      const entry = map[iso] || { count: 0, strengthCount: 0, cardioCount: 0, templates: [] };
      week.push({ date: iso, ...entry, future: current > today });
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

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function cellColor(cell) {
  if (cell.future || cell.count === 0) return null; // use CSS class
  if (cell.strengthCount > 0 && cell.cardioCount > 0) return '#e63030'; // mixed → strength wins
  if (cell.strengthCount > 0) return '#e63030';
  return '#ff6b00'; // cardio only
}

function WorkoutHeatmap({ data, from, to }) {
  const scrollRef = useRef(null);
  const [tooltip, setTooltip] = useState(null); // { cell, x, y }

  const weeks = buildGrid(data);
  const monthLabels = getMonthLabels(weeks);
  const CELL = 14;
  const GAP = 3;
  const STEP = CELL + GAP;
  const TOP = 20;
  const LABEL_W = 28;

  const totalWorkouts = data.reduce((s, d) => s + Number(d.count), 0);
  const svgW = weeks.length * STEP;
  const svgH = TOP + 7 * STEP;

  const inRange = (iso) => !from || (iso >= from && iso < to);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [data.length]);

  // Close tooltip on outside tap
  useEffect(() => {
    if (!tooltip) return;
    const close = () => setTooltip(null);
    document.addEventListener('touchstart', close, { passive: true });
    return () => document.removeEventListener('touchstart', close);
  }, [tooltip]);

  const handleCellTap = (e, cell, wi, di) => {
    e.stopPropagation();
    if (cell.future) return;
    setTooltip(t => (t?.cell.date === cell.date ? null : { cell, wi, di }));
  };

  return (
    <div className="heatmap-card">
      <div className="heatmap-title">
        <span>Workout Activity</span>
        <span className="heatmap-subtitle">{totalWorkouts} sessions in the last year</span>
      </div>
      <div className="heatmap-scroll" ref={scrollRef}>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* Day labels — Mon at top */}
          <div style={{ display: 'flex', flexDirection: 'column', paddingTop: TOP + 1, gap: GAP, flexShrink: 0 }}>
            {DAY_LABELS.map((l, i) => (
              <div key={i} style={{ height: CELL, fontSize: 9, color: 'var(--text-secondary)', lineHeight: `${CELL}px`, width: LABEL_W, textAlign: 'right', paddingRight: 4 }}>
                {l}
              </div>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <svg width={svgW} height={svgH} style={{ display: 'block', flexShrink: 0 }}>
              {monthLabels.map(({ col, label }) => (
                <text key={col} x={col * STEP} y={13} fontSize={10} fill="var(--text-muted)">{label}</text>
              ))}
              {weeks.map((week, wi) =>
                week.map((cell, di) => {
                  const color = cellColor(cell);
                  const dimmed = from && !inRange(cell.date);
                  const isSelected = tooltip?.cell.date === cell.date;
                  return (
                    <rect
                      key={`${wi}-${di}`}
                      x={wi * STEP}
                      y={TOP + di * STEP}
                      width={CELL}
                      height={CELL}
                      rx={2}
                      fill={color || 'var(--bg-elevated)'}
                      opacity={dimmed ? 0.2 : isSelected ? 0.7 : 1}
                      style={{ cursor: cell.count > 0 ? 'pointer' : 'default' }}
                      onMouseEnter={() => cell.count > 0 && setTooltip({ cell, wi, di })}
                      onMouseLeave={() => setTooltip(null)}
                      onTouchStart={e => handleCellTap(e, cell, wi, di)}
                    />
                  );
                })
              )}
            </svg>
            {/* Floating tooltip */}
            {tooltip && (
              <div
                className="heatmap-tooltip"
                style={{
                  left: Math.min(tooltip.wi * STEP, svgW - 160),
                  top: tooltip.di * STEP + TOP - 8,
                }}
              >
                <div className="heatmap-tooltip-date">{new Date(tooltip.cell.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                {(tooltip.cell.templates || []).map((t, i) => (
                  <div key={i} className="heatmap-tooltip-item">• {t}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function History() {
  const [workouts, setWorkouts] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('strength');
  const [period, setPeriod] = useState('all'); // 'all' | 'week' | 'month' | 'year'
  const [offset, setOffset] = useState(0);
  const navigate = useNavigate();

  const range = useMemo(() => {
    if (period === 'all') return { from: null, to: null, label: 'All Time' };
    return getPeriodRange(period, offset);
  }, [period, offset]);

  // Reset offset when period changes
  const handlePeriodChange = (p) => {
    setPeriod(p);
    setOffset(0);
  };

  useEffect(() => {
    api.get('/workouts/heatmap').then(res => setHeatmapData(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ type: tab });
    if (range.from) params.set('from', range.from.toISOString());
    if (range.to) params.set('to', range.to.toISOString());
    api.get(`/workouts/history?${params}`)
      .then(res => { setWorkouts(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tab, range]);

  const isCardio = tab === 'cardio';
  const fromIso = range.from ? range.from.toISOString().slice(0, 10) : null;
  const toIso = range.to ? range.to.toISOString().slice(0, 10) : null;

  // Disable next when already at current period
  const isCurrentPeriod = offset === 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Workout Log</h1>
      </div>

      {tab !== 'recovery' && <WorkoutHeatmap data={heatmapData} from={fromIso} to={toIso} />}

      {/* Period filter */}
      {tab !== 'recovery' && (
        <div className="period-filter">
          <div className="period-tabs">
            {['all', 'week', 'month', 'year'].map(p => (
              <button
                key={p}
                className={`period-tab ${period === p ? 'active' : ''}`}
                onClick={() => handlePeriodChange(p)}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          {period !== 'all' && (
            <div className="period-nav">
              <button className="period-nav-btn" onClick={() => setOffset(o => o - 1)}>
                <ChevronLeft size={16} />
              </button>
              <span className="period-nav-label">{range.label}</span>
              <button className="period-nav-btn" onClick={() => setOffset(o => o + 1)} disabled={isCurrentPeriod}>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Workout type tabs */}
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
        <button
          className={`tab-btn ${tab === 'recovery' ? 'active' : ''}`}
          onClick={() => setTab('recovery')}
          style={tab === 'recovery' ? { background: '#22c55e22', color: '#22c55e', borderColor: '#22c55e44' } : {}}
        >
          <Activity size={13} /> Recovery
        </button>
      </div>

      {tab === 'recovery' && <MuscleMap hideHeader />}

      {tab !== 'recovery' && (loading ? (
        <div className="loading">Loading...</div>
      ) : workouts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            {isCardio ? <Heart size={52} /> : <Clock size={52} />}
          </div>
          <h3>No {isCardio ? 'Cardio' : 'Strength'} Workouts</h3>
          <p>{period === 'all' ? `Complete a ${isCardio ? 'cardio' : 'strength'} workout to see it here` : `None in ${range.label}`}</p>
        </div>
      ) : (
        groupByDay(workouts).map(({ dayLabel, workouts: dayWorkouts }) => (
          <div key={dayLabel} className="history-day-group">
            <div className="history-day-label">{dayLabel}</div>
            {dayWorkouts.map(w => (
              <div
                key={w.id}
                className={`history-item ${isCardio ? 'history-item-cardio' : ''}`}
                onClick={() => navigate(`/history/${w.id}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="history-workout-name">{w.template_name}</div>
                    <div className="history-time">{new Date(w.completed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
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
            ))}
          </div>
        ))
      ))}
    </div>
  );
}
