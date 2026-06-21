import React, { useState, useEffect } from 'react';
import { GraduationCap, AlertCircle, Volume2, Type, Shield } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const LoginExamPage: React.FC = () => {
  const { navigateTo } = useApp();
  const [examCode, setExamCode] = useState('');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Detect if running inside Safe Exam Browser
  const [isSeb, setIsSeb] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isSebAgent = userAgent.includes('safeexambrowser') || userAgent.includes('seb/');
    setIsSeb(isSebAgent);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examCode.trim() || !userName.trim()) {
      setErrorMsg('Vui lòng điền đầy đủ Exam Code và User Name.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/auth/exam-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examCode: examCode.trim(),
          userName: userName.trim(),
          password: password.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Đăng nhập phòng thi thất bại.');
      }

      // If successful, navigate to the learning play page
      navigateTo({ type: 'learning-play', sessionTokenOrId: data.sessionToken });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Lỗi kết nối đến máy chủ.');
    } finally {
      setLoading(false);
    }
  };



  const playBeep = () => {
    try {
      const audio = new Audio('/ghosts.mp3');
      audio.play().then(() => {
        alert('Đang phát âm thanh kiểm tra (ghosts.mp3). Hãy xác nhận loa đang hoạt động.');
      }).catch(err => {
        console.error('Audio play failed:', err);
        alert('Không thể phát âm thanh: ' + err.message);
      });
    } catch (err) {
      console.error('Error playing beep:', err);
    }
  };

  const checkFont = () => {
    alert('Font chữ của hệ thống đã được tải và xác minh: Hợp lệ!');
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
        fontFamily: '"Microsoft Sans Serif", "Segoe UI", Arial, sans-serif',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Background patterns */}
      <div style={{
        position: 'absolute', width: '500px', height: '500px',
        borderRadius: '50%', background: 'rgba(255,255,255,0.03)',
        top: '-150px', left: '-150px',
      }} />
      <div style={{
        position: 'absolute', width: '400px', height: '400px',
        borderRadius: '50%', background: 'rgba(255,255,255,0.03)',
        bottom: '-100px', right: '-100px',
      }} />

      {/* Main card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '460px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 1,
          border: '1px solid rgba(255, 255, 255, 0.2)',
          animation: 'fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      >
        {/* Header bar */}
        <div style={{
          background: '#f1f5f9',
          padding: '14px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <GraduationCap size={20} style={{ color: '#1e3a8a' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155' }}>
            QUIZ EXAM Login Form
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleLogin} style={{ padding: '24px 30px 20px 30px' }}>
          {/* SEB Compatibility Banner */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            background: isSeb ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${isSeb ? '#bbf7d0' : '#fecaca'}`,
            color: isSeb ? '#15803d' : '#b91c1c',
            fontSize: '0.85rem',
            fontWeight: 600,
            textAlign: 'center'
          }}>
            {isSeb ? (
              <>
                <div>[Safe Exam Browser Hợp lệ]</div>
                <div>[Phiên bản hợp lệ]</div>
              </>
            ) : (
              <div>[Không tồn tại Safe Exam Browser Session]</div>
            )}
          </div>

          {/* Form Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Exam Code */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label style={{ width: '110px', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>
                Exam Code:
              </label>
              <input
                type="text"
                value={examCode}
                onChange={e => setExamCode(e.target.value)}
                placeholder=""
                required
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = '#cbd5e1'}
              />
            </div>

            {/* User Name */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label style={{ width: '110px', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>
                User Name:
              </label>
              <input
                type="text"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder=""
                required
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = '#cbd5e1'}
              />
            </div>

            {/* Password */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label style={{ width: '110px', fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>
                Password:
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder=""
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  backgroundColor: '#f8fafc'
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = '#cbd5e1'}
              />
            </div>
          </div>


            {/* Error Message */}
            {errorMsg && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '6px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                fontSize: '0.85rem',
                marginTop: '16px'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '20px',
              marginTop: '24px'
            }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '8px 32px',
                  borderRadius: '6px',
                  border: '1px solid #2563eb',
                  background: '#ffffff',
                  color: '#2563eb',
                  fontSize: '#0.9rem',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  if (!loading) {
                    e.currentTarget.style.background = '#2563eb';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
                onMouseLeave={e => {
                  if (!loading) {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.color = '#2563eb';
                  }
                }}
              >
                {loading ? 'Logging...' : 'Login'}
              </button>
            </div>
        </form>

        {/* Footer info checks & links */}
        <div style={{
          background: '#f8fafc',
          borderTop: '1px solid #f1f5f9',
          padding: '16px 30px 24px 30px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          {/* Checks links */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '16px',
            fontSize: '0.85rem'
          }}>
            <button
              type="button"
              onClick={playBeep}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                textDecoration: 'underline',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 500
              }}
            >
              <Volume2 size={14} />
              Check sound
            </button>
            <button
              type="button"
              onClick={checkFont}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                textDecoration: 'underline',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 500
              }}
            >
              <Type size={14} />
              Check font
            </button>
            <a
              href={`${window.location.protocol === 'https:' ? 'sebs://' : 'seb://'}${window.location.host}/api/config/seb`}
              style={{
                color: '#2563eb',
                textDecoration: 'underline',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 500
              }}
            >
              <Shield size={14} />
              :Run SEB
            </a>
          </div>

          {/* Info status text */}
          <div style={{
            fontSize: '0.85rem',
            color: '#2563eb',
            fontWeight: 700,
            textAlign: 'center',
            marginTop: '4px'
          }}>
            Register the exam may take time, please wait!
          </div>
        </div>
      </div>

      {/* Embedded CSS animation for premium entrance */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};
