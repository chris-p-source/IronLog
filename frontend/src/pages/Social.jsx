import React, { useState } from 'react';
import { Trophy, Users, Search } from 'lucide-react';
import Feed from './Feed';
import Leaderboard from './Leaderboard';
import FindUsers from './FindUsers';

export default function Social() {
  const [tab, setTab] = useState('feed');

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Social</h1>
      </div>

      <div className="tab-bar" style={{ marginBottom: 20 }}>
        <button className={`tab-btn ${tab === 'feed' ? 'active' : ''}`} onClick={() => setTab('feed')}>
          <Users size={13} /> Feed
        </button>
        <button className={`tab-btn ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => setTab('leaderboard')}>
          <Trophy size={13} /> Leaderboard
        </button>
        <button className={`tab-btn ${tab === 'find' ? 'active' : ''}`} onClick={() => setTab('find')}>
          <Search size={13} /> Find People
        </button>
      </div>

      {tab === 'feed' && <Feed hideHeader />}
      {tab === 'leaderboard' && <Leaderboard hideHeader />}
      {tab === 'find' && <FindUsers hideHeader />}
    </div>
  );
}
