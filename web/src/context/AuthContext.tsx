import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CurrentUser {
  email: string;
  name: string;
  mssv: string;
  isAdmin: boolean;
  picture?: string;
}

interface AuthContextType {
  currentUser: CurrentUser | null;
  authLoading: boolean;
  authError: string | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Check for auth error from OAuth callback redirect
    const params = new URLSearchParams(window.location.search);
    const error = params.get('auth_error');
    if (error) {
      const messages: Record<string, string> = {
        not_allowed: 'Email này chưa được cấp quyền truy cập. Vui lòng liên hệ Admin.',
        no_email: 'Không thể lấy email từ tài khoản Google.',
        missing_code: 'Đăng nhập thất bại. Vui lòng thử lại.',
        server_error: 'Lỗi server khi xác thực. Vui lòng thử lại.',
      };
      setAuthError(messages[error] || 'Đăng nhập thất bại.');
      // Clean up URL
      window.history.replaceState({}, '', '/');
    }

    // Fetch current user from session cookie
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(user => {
        setCurrentUser(user);
        setAuthLoading(false);
      })
      .catch(() => {
        setCurrentUser(null);
        setAuthLoading(false);
      });
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, authLoading, authError, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
