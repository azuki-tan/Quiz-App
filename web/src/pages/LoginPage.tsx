import React from 'react';
import { GraduationCap, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { authError } = useAuth();

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Background circles */}
      <div style={{
        position: 'absolute', width: '400px', height: '400px',
        borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
        top: '-100px', left: '-100px',
      }} />
      <div style={{
        position: 'absolute', width: '300px', height: '300px',
        borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
        bottom: '-80px', right: '-80px',
      }} />

      {/* Card */}
      <div
        style={{
          background: '#fff',
          borderRadius: '20px',
          padding: '48px 40px',
          width: '400px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          position: 'relative',
          zIndex: 1,
          animation: 'fadeInUp 0.4s ease',
        }}
      >
        {/* Logo */}
        <div style={{
          width: '72px', height: '72px',
          borderRadius: '18px',
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(102,126,234,0.4)',
        }}>
          <GraduationCap size={36} color="white" />
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
            Quiz App
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#64748b', marginTop: '6px' }}>
            Hệ thống luyện thi trắc nghiệm
          </p>
        </div>

        {/* Error message */}
        {authError && (
          <div style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '10px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            color: '#dc2626',
            fontSize: '0.88rem',
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{authError}</span>
          </div>
        )}

        {/* Divider */}
        <div style={{ width: '100%', borderTop: '1px solid #e2e8f0' }} />

        <p style={{ fontSize: '0.88rem', color: '#94a3b8', textAlign: 'center', margin: 0 }}>
          Đăng nhập bằng tài khoản Google được cấp phép để tiếp tục
        </p>

        {/* Google Login Button */}
        <button
          id="google-login-btn"
          onClick={handleGoogleLogin}
          style={{
            width: '100%',
            padding: '14px 20px',
            borderRadius: '12px',
            border: '1.5px solid #e2e8f0',
            background: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: '#374151',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#667eea';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(102,126,234,0.2)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {/* Google Icon */}
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Đăng nhập với Google
        </button>

        <p style={{ fontSize: '0.78rem', color: '#cbd5e1', textAlign: 'center', margin: 0 }}>
          Chỉ tài khoản được quản trị viên cấp quyền mới có thể đăng nhập
        </p>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
