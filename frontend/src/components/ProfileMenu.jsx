import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, LogOut, ChevronRight, User, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api';

export default function ProfileMenu({ onClose }) {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();

  const [isPublic, setIsPublic] = useState(false);
  const [view, setView] = useState('menu');
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    api.get('/users/me').then(res => {
      setIsPublic(!!res.data.is_public);
      const updated = {
        id: res.data.id,
        username: res.data.username,
        avatar_data: res.data.avatar_data,
        is_public: res.data.is_public,
      };
      login(localStorage.getItem('token'), updated);
    }).catch(() => setIsPublic(!!user?.is_public));
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const max = 256;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      try {
        const res = await api.post('/users/me/avatar', { avatar_data: dataUrl });
        login(localStorage.getItem('token'), { ...user, avatar_data: res.data.avatar_data });
      } catch (err) {
        alert(err.response?.data?.error || 'Upload failed');
      }
    };
    img.src = URL.createObjectURL(file);
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
      setTimeout(onClose, 1400);
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to update password');
    } finally { setSaving(false); }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleExport = async () => {
    try {
      const res = await api.get('/users/me/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ironlog-export-${user?.username}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.response?.data?.error || 'Export failed');
    }
  };

  const initials = user?.username?.slice(0, 2).toUpperCase() || '??';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet profile-menu-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />

        {view === 'menu' && (
          <>
            {/* Avatar + username — tap avatar to change photo, no camera badge */}
            <div className="profile-menu-header">
              <div className="profile-avatar-lg" onClick={() => fileRef.current?.click()}>
                {user?.avatar_data
                  ? <img src={user.avatar_data} alt="avatar" className="avatar-img-lg" />
                  : <span className="avatar-initials-lg">{initials}</span>
                }
              </div>
              <div>
                <div className="profile-menu-username">{user?.username}</div>
                <button className="avatar-change-hint" onClick={() => fileRef.current?.click()}>
                  Tap photo to change
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            </div>

            <div className="divider" />

            <div className="profile-menu-row" onClick={handleTogglePublic}>
              <div style={{ flex: 1 }}>
                <div className="profile-menu-row-title">Public Profile</div>
                <div className="profile-menu-row-sub">
                  {isPublic ? 'Others can view your stats & progress' : 'Your profile is private'}
                </div>
              </div>
              <div className={`toggle ${isPublic ? 'on' : ''}`} />
            </div>

            <div className="profile-menu-row" onClick={() => setView('password')}>
              <div className="profile-menu-row-icon"><Lock size={18} /></div>
              <div className="profile-menu-row-title" style={{ flex: 1 }}>Change Password</div>
              <ChevronRight size={16} color="var(--text-muted)" />
            </div>

            <div className="profile-menu-row" onClick={() => { navigate(`/user/${user?.username}`); onClose(); }}>
              <div className="profile-menu-row-icon"><User size={18} /></div>
              <div className="profile-menu-row-title" style={{ flex: 1 }}>View My Profile</div>
              <ChevronRight size={16} color="var(--text-muted)" />
            </div>

            <div className="profile-menu-row" onClick={handleExport}>
              <div className="profile-menu-row-icon"><Download size={18} /></div>
              <div className="profile-menu-row-title" style={{ flex: 1 }}>Export My Data (JSON)</div>
              <ChevronRight size={16} color="var(--text-muted)" />
            </div>

            <div className="divider" />

            <button className="profile-menu-row logout-row" onClick={handleLogout}>
              <div className="profile-menu-row-icon" style={{ color: 'var(--accent)' }}><LogOut size={18} /></div>
              <div className="profile-menu-row-title" style={{ color: 'var(--accent)', flex: 1 }}>Logout</div>
            </button>
          </>
        )}

        {view === 'password' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <button className="back-btn" onClick={() => { setView('menu'); setPwError(''); setPwSuccess(false); setPwForm({ current: '', next: '', confirm: '' }); }}>
                ← Back
              </button>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, textTransform: 'uppercase' }}>
                Change Password
              </span>
            </div>
            {pwError && <div className="error-msg">{pwError}</div>}
            {pwSuccess && <div style={{ background: 'var(--success-dim)', color: 'var(--success)', padding: '10px 14px', borderRadius: 9, marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Password updated! ✓</div>}
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
