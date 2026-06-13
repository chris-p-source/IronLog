import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Dumbbell, Clock, TrendingUp, Trophy, Scale } from 'lucide-react';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  return (
    <nav className="bottom-nav">
      <button
        className={`nav-item ${path === '/' ? 'active' : ''}`}
        onClick={() => navigate('/')}
      >
        <Dumbbell />
        <span>Templates</span>
      </button>
      <button
        className={`nav-item ${path.startsWith('/history') ? 'active' : ''}`}
        onClick={() => navigate('/history')}
      >
        <Clock />
        <span>History</span>
      </button>
      <button
        className={`nav-item ${path === '/progress' ? 'active' : ''}`}
        onClick={() => navigate('/progress')}
      >
        <TrendingUp />
        <span>Progress</span>
      </button>
      <button
        className={`nav-item ${path === '/leaderboard' ? 'active' : ''}`}
        onClick={() => navigate('/leaderboard')}
      >
        <Trophy />
        <span>Leaderboard</span>
      </button>
      <button
        className={`nav-item ${path === '/bodyweight' ? 'active' : ''}`}
        onClick={() => navigate('/bodyweight')}
      >
        <Scale />
        <span>Weight</span>
      </button>
    </nav>
  );
}
