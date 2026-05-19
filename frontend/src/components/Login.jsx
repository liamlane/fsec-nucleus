import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { post } from '../utils/api.js';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pin) return;
    setLoading(true);
    setError('');
    try {
      const data = await post('/auth/login', { pin });
      login(data.token);
      nav('/', { replace: true });
    } catch (err) {
      setError('Incorrect PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (digit) => {
    if (digit === '⌫') setPin(p => p.slice(0, -1));
    else if (pin.length < 8) setPin(p => p + digit);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,106,255,0.12) 0%, transparent 70%)',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: 320, textAlign: 'center', animation: 'fadeIn 0.4s ease' }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: 'linear-gradient(135deg, #7c6aff, #4da6ff)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: 28,
          boxShadow: '0 0 32px rgba(124,106,255,0.4)',
        }}>⬡</div>

        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Nucleus</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 32, fontSize: 13 }}>Your personal operating system</p>

        {/* PIN dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: i < pin.length ? 'var(--accent)' : 'var(--bg-tertiary)',
              border: '2px solid',
              borderColor: i < pin.length ? 'var(--accent)' : 'var(--border)',
              transition: 'all 0.15s ease',
              boxShadow: i < pin.length ? '0 0 8px var(--accent-glow)' : 'none',
            }} />
          ))}
        </div>

        {error && (
          <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</p>
        )}

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
            <button
              key={i}
              onClick={() => d && handleKey(d)}
              disabled={!d && d !== '0'}
              style={{
                padding: '18px',
                borderRadius: 12,
                background: d ? 'var(--bg-card)' : 'transparent',
                border: d ? '1px solid var(--border)' : 'none',
                color: d === '⌫' ? 'var(--text-secondary)' : 'var(--text-primary)',
                fontSize: d === '⌫' ? 18 : 20,
                fontWeight: 500,
                cursor: d ? 'pointer' : 'default',
                transition: 'var(--transition)',
              }}
              onMouseEnter={(e) => { if (d) e.target.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { if (d) e.target.style.background = 'var(--bg-card)'; }}
            >
              {d}
            </button>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !pin}
          className="btn btn-primary w-full"
          style={{ justifyContent: 'center', padding: '14px', fontSize: 15, borderRadius: 12 }}
        >
          {loading ? 'Checking...' : 'Unlock'}
        </button>

        <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 24 }}>
          No PIN set? Any input will work on first run.
        </p>
      </div>
    </div>
  );
}
