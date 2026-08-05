import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkoutProvider } from './context/WorkoutContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Templates from './pages/Templates';
import TemplateEditor from './pages/TemplateEditor';
import RunWorkout from './pages/RunWorkout';
import History from './pages/History';
import WorkoutDetail from './pages/WorkoutDetail';
import Progress from './pages/Progress';
import Bodyweight from './pages/Bodyweight';
import PersonalBests from './pages/PersonalBests';
import Social from './pages/Social';
import FindUsers from './pages/FindUsers';
import MuscleMap from './pages/MuscleMap';
import FoodDiary from './pages/FoodDiary';
import UserProfile from './pages/UserProfile';
import BottomNav from './components/BottomNav';
import TopBar from './components/TopBar';
import ActiveWorkoutBanner from './components/ActiveWorkoutBanner';
import WelcomeModal from './components/WelcomeModal';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <TopBar />
      <ActiveWorkoutBanner />
      <main className="app-main">{children}</main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkoutProvider>
        <WelcomeModal />
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
          <Route path="/bodyweight" element={<Navigate to="/progress" replace />} />
          <Route path="/recovery" element={<Navigate to="/progress" replace />} />
          <Route path="/nutrition" element={<PrivateRoute><AppLayout><FoodDiary /></AppLayout></PrivateRoute>} />
          <Route path="/personal-bests" element={<PrivateRoute><AppLayout><PersonalBests /></AppLayout></PrivateRoute>} />
          <Route path="/social" element={<PrivateRoute><AppLayout><Social /></AppLayout></PrivateRoute>} />
          <Route path="/users" element={<PrivateRoute><AppLayout><FindUsers /></AppLayout></PrivateRoute>} />
          <Route path="/leaderboard" element={<Navigate to="/social" replace />} />
          <Route path="/feed" element={<Navigate to="/social" replace />} />
          <Route path="/muscle-map" element={<PrivateRoute><AppLayout><MuscleMap /></AppLayout></PrivateRoute>} />
          <Route path="/user/:username" element={<PrivateRoute><AppLayout><UserProfile /></AppLayout></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </WorkoutProvider>
    </AuthProvider>
  );
}
