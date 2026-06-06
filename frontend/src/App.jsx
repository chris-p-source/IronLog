import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Templates from './pages/Templates';
import TemplateEditor from './pages/TemplateEditor';
import RunWorkout from './pages/RunWorkout';
import History from './pages/History';
import WorkoutDetail from './pages/WorkoutDetail';
import Progress from './pages/Progress';
import Leaderboard from './pages/Leaderboard';
import UserProfile from './pages/UserProfile';
import BottomNav from './components/BottomNav';
import TopBar from './components/TopBar';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <TopBar />
      <main className="app-main">{children}</main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<PrivateRoute><AppLayout><Templates /></AppLayout></PrivateRoute>} />
        <Route path="/template/new" element={<PrivateRoute><AppLayout><TemplateEditor /></AppLayout></PrivateRoute>} />
        <Route path="/template/:id/edit" element={<PrivateRoute><AppLayout><TemplateEditor /></AppLayout></PrivateRoute>} />
        <Route path="/workout/:sessionId" element={<PrivateRoute><RunWorkout /></PrivateRoute>} />
        <Route path="/history" element={<PrivateRoute><AppLayout><History /></AppLayout></PrivateRoute>} />
        <Route path="/history/:sessionId" element={<PrivateRoute><AppLayout><WorkoutDetail /></AppLayout></PrivateRoute>} />
        <Route path="/progress" element={<PrivateRoute><AppLayout><Progress /></AppLayout></PrivateRoute>} />
        <Route path="/leaderboard" element={<PrivateRoute><AppLayout><Leaderboard /></AppLayout></PrivateRoute>} />
        <Route path="/user/:username" element={<PrivateRoute><AppLayout><UserProfile /></AppLayout></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
