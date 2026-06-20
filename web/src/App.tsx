import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom';
import { Breadcrumb } from './components/Breadcrumb';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { LibraryPage } from './pages/LibraryPage';
import { SubjectDetailPage } from './pages/SubjectDetailPage';
import { QuizDetailPage } from './pages/QuizDetailPage';
import { LearningPage } from './pages/LearningPage';
import { LearningPlayPage } from './pages/LearningPlayPage';
import { LearningResultPage } from './pages/LearningResultPage';
import { LearningReviewPage } from './pages/LearningReviewPage';
import { SettingPage } from './pages/SettingPage';
import { HistoryPage } from './pages/HistoryPage';
import { UsersPage } from './pages/UsersPage';
import './App.css';

const AppContent: React.FC = () => {
  const { activePage, sessions } = useApp();
  const { currentUser, authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Detect if running inside Safe Exam Browser
  const isSeb = React.useMemo(() => {
    return navigator.userAgent.includes('SafeExamBrowser');
  }, []);

  const isExamSubdomain = React.useMemo(() => {
    return window.location.hostname.startsWith('exam.') || window.location.hostname.startsWith('seb.') || window.location.port === '8100';
  }, []);

  // ✅ All hooks must be called unconditionally BEFORE any early returns
  const isExamMode = React.useMemo(() => {
    if (activePage.type !== 'learning-play' && activePage.type !== 'learning-result') return false;
    if (isSeb) return true; // Force exam layout (no sidebar/breadcrumbs) inside SEB
    const session = sessions.find(s => s.sessionToken === activePage.sessionTokenOrId || String(s.id) === activePage.sessionTokenOrId);
    return session?.learningMode === 'exam' && !session.isCompleted;
  }, [activePage, sessions, isSeb]);

  React.useEffect(() => {
    if (isExamSubdomain) return;
    if (authLoading) return;

    // Skip auth redirection for play and result pages under SEB
    if (isSeb && (activePage.type === 'learning-play' || activePage.type === 'learning-result')) {
      return;
    }

    if (!currentUser) {
      if (location.pathname !== '/login') {
        navigate('/login');
      }
    } else {
      if (location.pathname === '/login' || location.pathname === '/') {
        navigate('/dashboard');
      }

      // Redirect non-admins away from admin-only pages to /learning
      const adminOnlyRoutes = ['/dashboard', '/library', '/settings', '/users'];
      if (!currentUser.isAdmin && adminOnlyRoutes.includes(location.pathname)) {
        navigate('/learning');
      }
    }
  }, [currentUser, authLoading, location.pathname, navigate, isSeb, activePage.type, isExamSubdomain]);

  // If accessed via exam subdomain/port, bypass auth & layouts entirely
  if (isExamSubdomain) {
    if (activePage.type === 'learning-play') {
      return (
        <div className="w-full h-full" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
          <LearningPlayPage sessionId={activePage.sessionTokenOrId} />
        </div>
      );
    }
    if (activePage.type === 'learning-result') {
      return (
        <div className="w-full h-full" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
          <LearningResultPage sessionId={activePage.sessionTokenOrId} />
        </div>
      );
    }
    // Accessing exam subdomain without parameters shows a blank dark screen
    return <div style={{ width: '100vw', height: '100vh', backgroundColor: '#111827' }} />;
  }

  // Show loading spinner while checking auth
  if (authLoading && !isSeb) {
    return (
      <div style={{
        width: '100vw', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '32px 40px',
          textAlign: 'center',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        }}>
          <div style={{
            width: '40px', height: '40px', margin: '0 auto 16px',
            border: '4px solid #667eea',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: '#64748b', fontWeight: 600, margin: 0 }}>Đang xác thực...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Not logged in → show login page (unless viewing learning play/result directly)
  if (!currentUser && activePage.type !== 'learning-play' && activePage.type !== 'learning-result') {
    return <LoginPage />;
  }

  const isAdmin = currentUser ? currentUser.isAdmin : false;

  const renderPage = () => {
    switch (activePage.type) {
      case 'dashboard':
        return isAdmin ? <DashboardPage /> : <LearningPage />;
      case 'library':
        return isAdmin ? <LibraryPage /> : <LearningPage />;
      case 'subject-detail':
        return isAdmin ? <SubjectDetailPage subjectId={activePage.subjectId} /> : <LearningPage />;
      case 'quiz-detail':
        return isAdmin ? <QuizDetailPage quizId={activePage.quizId} /> : <LearningPage />;
      case 'learning':
        return <LearningPage />;
      case 'learning-play':
        return <LearningPlayPage sessionId={activePage.sessionTokenOrId} />;
      case 'learning-result':
        return <LearningResultPage sessionId={activePage.sessionTokenOrId} />;
      case 'learning-review':
        return <LearningReviewPage sessionId={activePage.sessionTokenOrId} />;
      case 'setting':
        return isAdmin ? <SettingPage /> : <LearningPage />;
      case 'history':
        return <HistoryPage />;
      case 'users':
        return isAdmin ? <UsersPage /> : <LearningPage />;
      default:
        return isAdmin ? <DashboardPage /> : <LearningPage />;
    }
  };

  if (isExamMode) {
    return (
      <div className="w-full h-full" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        {renderPage()}
      </div>
    );
  }

  return (
    <div className="flex w-full h-full" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Collapsible Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1" style={{ height: '100%', overflow: 'hidden' }}>
        {/* Top Breadcrumb Bar */}
        <Breadcrumb />

        {/* Dynamic Page Viewer */}
        <div className="flex-1 overflow-hidden" style={{ backgroundColor: 'var(--bg-content)' }}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
