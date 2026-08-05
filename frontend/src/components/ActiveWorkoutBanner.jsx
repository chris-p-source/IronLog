import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Dumbbell, ChevronRight } from 'lucide-react';
import { useWorkout } from '../context/WorkoutContext';

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60 < 10 ? '0' : ''}${s % 60}s`;
}

export default function ActiveWorkoutBanner() {
  const { activeWorkout } = useWorkout();
  const navigate = useNavigate();
  const location = useLocation();
  const [elapsed, setElapsed] = useState(0);

  // Don't show while actually inside the workout page
  const isOnWorkout = location.pathname.startsWith('/workout/');

  useEffect(() => {
    if (!activeWorkout || isOnWorkout) return;
    const tick = () => setElapsed(Date.now() - new Date(activeWorkout.startedAt).getTime());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeWorkout, isOnWorkout]);

  if (!activeWorkout || isOnWorkout) return null;

  return (
    <div
      className="active-workout-banner"
      onClick={() => navigate(`/workout/${activeWorkout.sessionId}`)}
    >
      <div className="active-workout-banner-pulse" />
      <Dumbbell size={15} />
      <div className="active-workout-banner-text">
        <span className="active-workout-banner-name">{activeWorkout.templateName}</span>
        <span className="active-workout-banner-time">{formatElapsed(elapsed)}</span>
      </div>
      <div className="active-workout-banner-cta">
        Resume <ChevronRight size={14} />
      </div>
    </div>
  );
}
