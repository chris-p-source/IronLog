import React, { createContext, useContext, useState, useCallback } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });

  const login = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  // Pull fresh profile from server and update stored user (avatar, is_public, etc.)
  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/users/me');
      const updated = {
        id: res.data.id,
        username: res.data.username,
        avatar_data: res.data.avatar_data,
        is_public: res.data.is_public,
      };
      localStorage.setItem('user', JSON.stringify(updated));
      setUser(updated);
      return updated;
    } catch { return null; }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
