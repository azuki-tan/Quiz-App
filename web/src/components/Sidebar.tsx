import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Library,
  GraduationCap,
  Settings,
  ChevronLeft,
  ChevronRight,
  History,
  Users,
  LogOut,
  ShieldCheck,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activePage, navigateTo } = useApp();
  const { currentUser, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isAdmin = currentUser?.isAdmin ?? false;

  // Admin sees everything; regular user sees only Learning
  const menuItems = [
    ...(isAdmin ? [
      {
        id: 'dashboard',
        title: 'Dashboard',
        icon: <LayoutDashboard size={20} />,
        action: () => navigateTo({ type: 'dashboard' })
      },
      {
        id: 'library',
        title: 'Thư viện',
        icon: <Library size={20} />,
        action: () => navigateTo({ type: 'library' })
      },
    ] : []),
    {
      id: 'learning',
      title: 'Học tập',
      icon: <GraduationCap size={20} />,
      action: () => navigateTo({ type: 'learning' })
    },
    {
      id: 'history',
      title: 'Lịch sử thi',
      icon: <History size={20} />,
      action: () => navigateTo({ type: 'history' })
    },
    ...(isAdmin ? [
      {
        id: 'users',
        title: 'Người dùng',
        icon: <Users size={20} />,
        action: () => navigateTo({ type: 'users' })
      },
      {
        id: 'setting',
        title: 'Cài đặt',
        icon: <Settings size={20} />,
        action: () => navigateTo({ type: 'setting' })
      },
    ] : []),
  ];

  const getIsActive = (id: string) => {
    if (id === 'dashboard' && activePage.type === 'dashboard') return true;
    if (id === 'library' && ['library', 'subject-detail', 'quiz-detail'].includes(activePage.type)) return true;
    if (id === 'learning' && activePage.type.startsWith('learning')) return true;
    if (id === 'history' && activePage.type === 'history') return true;
    if (id === 'users' && activePage.type === 'users') return true;
    if (id === 'setting' && activePage.type === 'setting') return true;
    return false;
  };

  const handleLogout = async () => {
    if (confirm('Bạn có chắc muốn đăng xuất?')) {
      await logout();
    }
  };

  // Avatar initials from user name
  const initials = currentUser?.name
    ? currentUser.name.split(' ').slice(-2).map(w => w[0]?.toUpperCase()).join('')
    : '?';

  return (
    <div
      className="flex flex-col"
      style={{
        width: isCollapsed ? '70px' : '260px',
        backgroundColor: '#FFFFFF',
        borderRight: '1px solid var(--sidebar-border)',
        height: '100%',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Sidebar Header */}
      <div
        className="flex items-center p-4 gap-3"
        style={{
          height: '64px',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          overflow: 'hidden',
        }}
      >
        <div
          className="flex items-center justify-center bg-primary-color"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            backgroundColor: 'var(--primary-color)',
            flexShrink: 0,
          }}
        >
          <GraduationCap size={22} color="white" />
        </div>
        {!isCollapsed && (
          <span
            style={{
              fontWeight: 700,
              fontSize: '1.2rem',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              letterSpacing: '0.5px',
            }}
          >
            Quiz App
          </span>
        )}
      </div>

      {/* Collapse Toggle Button */}
      <div className="flex justify-center py-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-center"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            color: 'var(--text-secondary)',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Menu List */}
      <div className="flex-1 py-4 overflow-y-auto" style={{ paddingInline: '8px' }}>
        <ul style={{ listStyle: 'none' }} className="flex flex-col gap-2">
          {menuItems.map((item) => {
            const isActive = getIsActive(item.id);
            return (
              <li key={item.id}>
                <button
                  id={`sidebar-${item.id}`}
                  onClick={item.action}
                  className="flex items-center gap-3 w-100 p-2"
                  style={{
                    width: '100%',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: isActive ? 'var(--sidebar-active)' : 'transparent',
                    color: isActive ? 'var(--primary-color)' : 'var(--text-primary)',
                    padding: '12px 14px',
                    transition: 'all 0.2s',
                    textAlign: 'left',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div style={{ color: isActive ? 'var(--primary-color)' : 'var(--text-secondary)', display: 'inline-flex' }}>
                    {item.icon}
                  </div>
                  {!isCollapsed && (
                    <span style={{ fontWeight: isActive ? 600 : 500, fontSize: '0.95rem' }}>
                      {item.title}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* User Footer */}
      <div style={{
        borderTop: '1px solid rgba(0,0,0,0.07)',
        padding: isCollapsed ? '10px 8px' : '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}>
        {/* User info */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          overflow: 'hidden',
        }}>
          {/* Avatar */}
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: isAdmin
              ? 'linear-gradient(135deg, #f59e0b, #d97706)'
              : 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '0.8rem',
            fontWeight: 700,
            color: 'white',
          }}>
            {isAdmin ? <ShieldCheck size={16} /> : initials}
          </div>

          {!isCollapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontWeight: 600,
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {currentUser?.name || 'Người dùng'}
              </div>
              <div style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {isAdmin ? '👑 Quản trị viên' : (currentUser?.mssv ? `MSSV: ${currentUser.mssv}` : currentUser?.email)}
              </div>
            </div>
          )}
        </div>

        {/* Logout button */}
        <button
          id="logout-btn"
          onClick={handleLogout}
          style={{
            width: '100%',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            fontSize: '0.85rem',
            fontWeight: 500,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#fff0f0';
            e.currentTarget.style.color = '#dc2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <LogOut size={16} />
          {!isCollapsed && <span>Đăng xuất</span>}
        </button>
      </div>
    </div>
  );
};
