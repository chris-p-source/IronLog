import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ProfileMenu from './ProfileMenu';

function BarbellIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="22" fill="#e63030"/>
      <rect x="22" y="45" width="56" height="11" rx="5.5" fill="white"/>
      <rect x="9" y="31" width="15" height="38" rx="5" fill="white"/>
      <rect x="76" y="31" width="15" height="38" rx="5" fill="white"/>
      <rect x="22" y="38" width="9" height="24" rx="3" fill="rgba(255,255,255,0.5)"/>
      <rect x="69" y="38" width="9" height="24" rx="3" fill="rgba(255,255,255,0.5)"/>
    </svg>
  );
}

export default function TopBar() {
  const { user, refreshUser } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => { refreshUser(); }, []);

  const initials = user?.username?.slice(0, 2).toUpperCase() || '??';

  return (
    <>
      <div className="top-bar">
        <div className="top-bar-brand">
          <BarbellIcon size={30} />
          <span className="top-bar-logo-text">IRONLOG</span>
        </div>
        <button className="avatar-btn" onClick={() => setOpen(true)} aria-label="Profile">
          {user?.avatar_data
            ? <img src={user.avatar_data} alt="avatar" className="avatar-img" />
            : <span className="avatar-initials">{initials}</span>
          }
        </button>
      </div>
      {open && <ProfileMenu onClose={() => setOpen(false)} />}
    </>
  );
}
