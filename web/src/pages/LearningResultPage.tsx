import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Trophy, Clock, CheckCircle2, XCircle, ArrowLeft, RefreshCw, Eye } from 'lucide-react';
import type { LearningSession } from '../types';

interface LearningResultPageProps {
  sessionId: string;
}

export const LearningResultPage: React.FC<LearningResultPageProps> = ({ sessionId }) => {
  const { quizzes, subjects, navigateTo, getSessionWithDetails } = useApp();
  const [session, setSession] = useState<LearningSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      setLoading(true);
      try {
        const data = await getSessionWithDetails(sessionId);
        if (data) setSession(data.session);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchSession();
  }, [sessionId]);

  const isSubjectWide = session && session.quizTargetId < 0;
  const subject = isSubjectWide ? subjects.find(s => s.id === -session.quizTargetId) : null;
  const quiz = session && !isSubjectWide ? quizzes.find(q => q.id === session.quizTargetId) : null;
  const totalQuestions = session ? (session.totalCorrect + session.totalWrong) : 0;
  const scorePercent = totalQuestions > 0 ? Math.round((session!.totalCorrect / totalQuestions) * 100) : 0;


  if (loading || !session) {
    return <div className="p-12 flex justify-center">Đang tải kết quả...</div>;
  }

  return (
    <div className="p-6 animate-fade-in flex flex-col gap-6 items-center justify-center overflow-y-auto" style={{ height: '100%', maxWidth: '800px', margin: '0 auto' }}>
      
      {/* Visual Trophy Header */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div 
          className="flex items-center justify-center mb-2"
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: scorePercent >= 50 ? 'rgba(82, 196, 26, 0.15)' : 'rgba(255, 77, 79, 0.15)',
            color: scorePercent >= 50 ? 'var(--toast-success)' : 'var(--toast-error)'
          }}
        >
          <Trophy size={40} />
        </div>
        <h2 style={{ fontSize: '2rem', fontWeight: 800 }}>Kết quả ôn luyện</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Bạn đã hoàn thành {isSubjectWide ? `tất cả bộ đề của môn học ${subject?.code || ''}` : <>bộ đề <strong>{quiz?.name}</strong></>} ở chế độ 
          <span className="badge badge-info ml-1" style={{ textTransform: 'capitalize' }}>
            {session.learningMode === 'study' ? 'Học tập' : session.learningMode === 'practice' ? 'Luyện tập' : 'Thi cử'}
          </span>
        </p>
      </div>

      {/* Main Score Display Box */}
      <div 
        className="card flex flex-col items-center p-8 w-full gap-4"
        style={{
          borderTop: `6px solid ${scorePercent >= 50 ? 'var(--toast-success)' : 'var(--toast-error)'}`
        }}
      >
        <div 
          className="flex flex-col items-center justify-center"
          style={{
            width: '140px',
            height: '140px',
            borderRadius: '50%',
            border: `10px solid ${scorePercent >= 50 ? 'rgba(82, 196, 26, 0.1)' : 'rgba(255, 77, 79, 0.1)'}`,
            borderTopColor: scorePercent >= 50 ? 'var(--toast-success)' : 'var(--toast-error)',
            transform: 'rotate(-45deg)'
          }}
        >
          <div style={{ transform: 'rotate(45deg)', textAlign: 'center' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, color: scorePercent >= 50 ? 'var(--toast-success)' : 'var(--toast-error)' }}>
              {scorePercent}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 w-full gap-4 text-center mt-4" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--toast-success)', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
              <CheckCircle2 size={18} />
              {session.totalCorrect}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Trả lời đúng</div>
          </div>

          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--toast-error)', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
              <XCircle size={18} />
              {session.totalWrong}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Trả lời sai</div>
          </div>

          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
              <Clock size={18} />
              {formatTime(session.studyTime)}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Thời gian làm</div>
          </div>
        </div>
      </div>

      {session.allowReview !== 0 && (window.location.hostname.startsWith('exam.') || window.location.hostname.startsWith('seb.') || window.location.port === '8100') && (
        <div style={{ margin: '8px 0', fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
          Tra cứu chi tiết tại{' '}
          <a 
            href="https://result.myazuki.net" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ color: 'var(--accent-blue, #3b82f6)', textDecoration: 'underline', fontWeight: 700 }}
          >
            https://result.myazuki.net
          </a>
        </div>
      )}

      {/* Buttons / Notice */}
      {(window.location.hostname.startsWith('exam.') || window.location.hostname.startsWith('seb.') || window.location.port === '8100') ? (
        <div className="card p-6 text-center w-full max-w-md" style={{ border: '1px solid var(--border-color)', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
          <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Nộp bài thành công!
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            Bạn có thể đóng trình duyệt Safe Exam Browser để kết thúc.
          </p>
        </div>
      ) : (
        <div className="flex gap-4 w-full justify-center">
          <button 
            className="btn btn-secondary py-3 px-6 flex items-center gap-2"
            onClick={() => navigateTo({ type: 'learning' })}
          >
            <ArrowLeft size={18} />
            <span>Về học tập</span>
          </button>

          <button 
            className="btn btn-secondary py-3 px-6 flex items-center gap-2"
            onClick={() => navigateTo({ type: 'learning-review', sessionTokenOrId: session.sessionToken || String(sessionId) })}
          >
            <Eye size={18} />
            <span>Xem lại bài làm</span>
          </button>

          <button 
            className="btn btn-primary py-3 px-6 flex items-center gap-2"
            onClick={async () => {
              // Restart session
              navigateTo({ type: 'learning' });
            }}
          >
            <RefreshCw size={18} />
            <span>Luyện lại</span>
          </button>
        </div>
      )}

    </div>
  );
};

// Helper for formatting time elapsed
function formatTime(totalSecs: number) {
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}
