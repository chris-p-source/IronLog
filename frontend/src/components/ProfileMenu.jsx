import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Lock, LogOut, X, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api';

export default function ProfileMenu({ onClose }) {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState('menu'); // menu | password
  const [isPublic, setIsPublic] = useState(user?.is_public ?? false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const res = await api.post('/users/me/avatar', { avatar_data: ev.target.result });
        login(localStorage.getItem('token'), { ...user, avatar_data: res.data.avatar_data });
      } catch (err) {
        alert(err.response?.data?.error || 'Upload failed');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTogglePublic = async () => {
    const next = !isPublic;
    setIsPublic(next);
    try {
      await api.put('/users/me', { is_public: next });
      login(localStorage.getItem('token'), { ...user, is_public: next });
    } catch { setIsPublic(!next); }
  };

  const handlePasswordSave = async () => {
    setPwError('');
    if (pwForm.next !== pwForm.confirm) return setPwError('Passwords do not match');
    if (pwForm.next.length < 6) return setPwError('Min. 6 characters');
    setSaving(true);
    try {
      await api.put('/users/me/password', { current_password: pwForm.current, new_password: pwForm.next });
      setPwSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.username?.slice(0, 2).toUpperCase() || '??';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet profile-menu-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />

        {view === 'menu' && (
          <>
            {/* Avatar + username */}
            <div className="profile-menu-header">
              <div className="profile-avatar-lg" onClick={() => fileRef.current?.click()}>
                {user?.avatar_data
                  ? <img src={user.avatar_data} alt="avatar" className="avatar-img-lg" />
                  : <span className="avatar-initials-lg">{initials}</span>
                }
                <div className="avatar-edit-badge"><Camera size={12} /></div>
              </div>
              <div>
                <div className="profile-menu-username">{user?.username}</div>
                <button className="avatar-change-hint" onClick={() => fileRef.current?.click()}>
                  Tap photo to change
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
            </div>

            <div className="divider" />

            {/* Public profile toggle */}
            <div className="profile-menu-row" onClick={handleTogglePublic}>
              <div>
                <div className="profile-menu-row-title">Public Profile</div>
                <div className="profile-menu-row-sub">Let others view your stats &amp; progress</div>
              </div>
              <div className={`toggle ${isPublic ? 'on' : ''}`} />
            </div>

            {/* Change password */}
            <div className="profile-menu-row" onClick={() => setView('password')}>
              <div className="profile-menu-row-icon"><Lock size={18} /></div>
              <div className="profile-menu-row-title">Change Password</div>
              <ChevronRight size={16} color="var(--text-muted)" style={{ marginLeft: 'auto' }} />
            </div>

            {/* View my profile */}
            <div className="profile-menu-row" onClick={() => { navigate(`/user/${user?.username}`); onClose(); }}>
              <div className="profile-menu-row-icon"><Eye size={18} /></div>
              <div className="profile-menu-row-title">View My Profile</div>
              <ChevronRight size={16} color="var(--text-muted)" style={{ marginLeft: 'auto' }} />
            </div>

            <div className="divider" />

            {/* Logout */}
            <button className="profile-menu-row logout-row" onClick={handleLogout}>
              <div className="profile-menu-row-icon" style={{ color: 'var(--accent)' }}><LogOut size={18} /></div>
              <div className="profile-menu-row-title" style={{ color: 'var(--accent)' }}>Logout</div>
            </button>
          </>
        )}

        {view === 'password' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <button className="back-btn" onClick={() => setView('menu')}>← Back</button>
              <span className="modal-title" style={{ fontSize: 18 }}>Change Password</span>
            </div>
            {pwError && <div className="error-msg">{pwError}</div>}
            {pwSuccess && <div style={{ background: 'var(--success-dim)', color: 'var(--success)', padding: '10px 14px', borderRadius: 9, marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Password updated!</div>}
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input className="form-input" type="password" placeholder="••••••••" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input className="form-input" type="password" placeholder="min. 6 characters" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input className="form-input" type="password" placeholder="repeat new password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
            </div>
            <button className="btn btn-primary btn-block" onClick={handlePasswordSave} disabled={saving}>
              {saving ? 'Saving...' : 'Update Password'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
