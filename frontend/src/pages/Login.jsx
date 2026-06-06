import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registerEnabled, setRegisterEnabled] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
    api.get('/health').then(r => setRegisterEnabled(r.data.registerEnabled)).catch(() => {});
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      login(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-logo">
        <div className="auth-logo-text">IRON<span>LOG</span></div>
        <div className="auth-tagline">Track. Lift. Dominate.</div>
      </div>
      <div className="auth-card">
        <h2 className="auth-title">Sign In</h2>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              type="text"
              placeholder="your username"
              autoCapitalize="none"
              autoCorrect="off"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
          </div>
          <button
            className="btn btn-primary btn-block btn-lg"
            type="submit"
            disabled={loading}
            style={{ marginTop: 4 }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        {registerEnabled && (
          <div className="auth-footer">
            No account? <Link to="/register">Create one</Link>
          </div>
        )}
      </div>
    </div>
  );
}
