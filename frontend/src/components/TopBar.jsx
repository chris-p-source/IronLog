import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ProfileMenu from './ProfileMenu';

export default function TopBar() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const initials = user?.username?.slice(0, 2).toUpperCase() || '??';

  return (
    <>
      <div className="top-bar">
        <span className="top-bar-logo">IRON<span>LOG</span></span>
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
