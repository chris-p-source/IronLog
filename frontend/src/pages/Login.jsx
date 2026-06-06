import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';

function BarbellLogo() {
  return (
    <div className="auth-logo">
      <svg width="72" height="72" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', margin: '0 auto 16px' }}>
        <rect width="100" height="100" rx="22" fill="#e63030"/>
        <rect x="22" y="45" width="56" height="11" rx="5.5" fill="white"/>
        <rect x="9" y="31" width="15" height="38" rx="5" fill="white"/>
        <rect x="76" y="31" width="15" height="38" rx="5" fill="white"/>
        <rect x="22" y="38" width="9" height="24" rx="3" fill="rgba(255,255,255,0.5)"/>
        <rect x="69" y="38" width="9" height="24" rx="3" fill="rgba(255,255,255,0.5)"/>
      </svg>
      <div className="auth-logo-text">IRONLOG</div>
      <div className="auth-tagline">Track. Lift. Dominate.</div>
    </div>
  );
}

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
      <BarbellLogo />
      <div className="auth-card">
        <h2 className="auth-title">Sign In</h2>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" type="text" placeholder="your username" autoCapitalize="none" autoCorrect="off"
              value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        {registerEnabled && (
          <div className="auth-footer">No account? <Link to="/register">Create one</Link></div>
        )}
      </div>
    </div>
  );
}
