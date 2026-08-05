import React, { createContext, useContext, useState } from 'react';

const WorkoutContext = createContext(null);

const KEY = 'ironlog_active_workout';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export function WorkoutProvider({ children }) {
  const [activeWorkout, setActiveWorkoutState] = useState(load);

  const setActiveWorkout = (data) => {
    localStorage.setItem(KEY, JSON.stringify(data));
    setActiveWorkoutState(data);
  };

  const clearActiveWorkout = () => {
    localStorage.removeItem(KEY);
    setActiveWorkoutState(null);
  };

  return (
    <WorkoutContext.Provider value={{ activeWorkout, setActiveWorkout, clearActiveWorkout }}>
      {children}
    </WorkoutContext.Provider>
  );
}

export const useWorkout = () => useContext(WorkoutContext);
