import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Dumbbell, Clock, TrendingUp, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const path = location.pathname;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
      <button className="nav-item" onClick={handleLogout}>
        <LogOut />
        <span>Logout</span>
      </button>
    </nav>
  );
}
