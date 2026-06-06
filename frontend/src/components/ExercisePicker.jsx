import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Check } from 'lucide-react';
import api from '../api';

export default function ExercisePicker({ templateType, addedNames, onAdd, onRemove, onClose }) {
  const [exercises, setExercises] = useState([]);
  const [search, setSearch] = useState('');
  const searchRef = useRef();

  useEffect(() => {
    const endpoint = templateType === 'cardio' ? '/exercises/cardio' : '/exercises/strength';
    api.get(endpoint).then(res => setExercises(res.data)).catch(() => {});
    setTimeout(() => searchRef.current?.focus(), 150);
  }, [templateType]);

  const filtered = search.trim()
    ? exercises.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
    : exercises;

  const groups = filtered.reduce((acc, ex) => {
    if (!acc[ex.group]) acc[ex.group] = [];
    acc[ex.group].push(ex);
    return acc;
  }, {});

  const addedSet = new Set(addedNames);

  const handleTap = (name) => {
    if (addedSet.has(name)) {
      onRemove(name);
    } else {
      onAdd(name);
    }
  };

  const renderItem = (ex) => {
    const added = addedSet.has(ex.name);
    return (
      <button
        key={ex.name}
        className={`picker-item ${added ? 'added' : ''}`}
        onClick={() => handleTap(ex.name)}
      >
        <span className="picker-item-name">{ex.name}</span>
        {added
          ? <span className="picker-item-remove"><X size={14} /></span>
          : null
        }
      </button>
    );
  };

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-sheet" onClick={e => e.stopPropagation()}>
        <div className="picker-header">
          <span className="picker-title">
            {templateType === 'cardio' ? 'Cardio Exercises' : 'Strength Exercises'}
          </span>
          <button className="picker-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="picker-search-wrap">
          <Search size={15} className="picker-search-icon" />
          <input
            ref={searchRef}
            className="picker-search"
            placeholder="Search exercises..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="picker-clear" onClick={() => setSearch('')}><X size={13} /></button>
          )}
        </div>

        {addedSet.size > 0 && (
          <div className="picker-added-count">
            {addedSet.size} exercise{addedSet.size !== 1 ? 's' : ''} selected — tap to remove
          </div>
        )}

        <div className="picker-list">
          {templateType === 'cardio' ? (
            filtered.map(ex => renderItem(ex))
          ) : (
            Object.entries(groups).map(([group, exList]) => (
              <div key={group}>
                <div className="picker-group-label">{group}</div>
                {exList.map(ex => renderItem(ex))}
              </div>
            ))
          )}
          {filtered.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No exercises match "{search}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
