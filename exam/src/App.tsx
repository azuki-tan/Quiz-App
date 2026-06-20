import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom';
import { LoginExamPage } from './pages/LoginExamPage';
import { LearningPlayPage } from './pages/LearningPlayPage';
import { LearningResultPage } from './pages/LearningResultPage';
import './App.css';

const AppContent: React.FC = () => {
  const { activePage } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const queryToken = urlParams.get('sessionToken') || urlParams.get('sessionId');

    if (queryToken) {
      if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/dashboard') {
        navigate(`/learning/play/${queryToken}`, { replace: true });
      }
    } else {
      if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/dashboard') {
        navigate('/login-exam', { replace: true });
      }
    }
  }, [location.pathname, navigate]);

  const renderPage = () => {
    switch (activePage.type) {
      case 'learning-play':
        return <LearningPlayPage sessionId={activePage.sessionTokenOrId} />;
      case 'learning-result':
        return <LearningResultPage sessionId={activePage.sessionTokenOrId} />;
      case 'login-exam':
        return <LoginExamPage />;
      default:
        return <LoginExamPage />;
    }
  };

  // Enforce full-screen layout for exam client
  return (
    <div className="w-full h-full" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {renderPage()}
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
