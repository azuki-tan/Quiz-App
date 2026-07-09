import React, { useState, useEffect, useMemo } from 'react';
import { 
  Award, User, Calendar, Clock, CheckCircle, 
  XCircle, ArrowLeft, BookOpen, ShieldAlert, Sparkles, 
  ChevronRight, BarChart2, Eye, Filter
} from 'lucide-react';
import { cleanHtmlExplanation } from './utils/html';

interface Session {
  id: number;
  sessionToken: string;
  startTime: string;
  endTime: string | null;
  studyTime: number;
  totalCorrect: number | null;
  totalWrong: number | null;
  score: string | null;
  allowReview: boolean;
}

interface ExamInfo {
  id: number;
  examCode: string;
  durationTime: number;
  allowReview: boolean;
  showScore: boolean;
  quizTargetId: number;
}

interface UserInfo {
  name: string;
  email: string;
  mssv: string;
}

interface DetailItem {
  id: number;
  learningSessionId: number;
  questionTargetId: number;
  isChecked: number;
  isSeen: number;
  isCorrect: boolean | number | null;
  selectedAnswersList: number[]; // Array of selected answer IDs
}

interface Answer {
  id: number;
  content: string;
  isCorrect: number | boolean;
}

interface Question {
  id: number;
  content: string;
  explanation: string;
  answersList?: Answer[];
  answers?: Answer[];
}

export default function App() {
  // Navigation states
  const [view, setView] = useState<'lookup' | 'dashboard' | 'review'>('lookup');
  
  // Filter state for questions review
  const [filter, setFilter] = useState<'all' | 'correct' | 'incorrect' | 'unanswered'>('all');

  // Input fields
  const [examCode, setExamCode] = useState('');
  const [userName, setUserName] = useState('');
  
  // API responses
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [examData, setExamData] = useState<{
    exam: ExamInfo;
    user: UserInfo;
    sessions: Session[];
  } | null>(null);
  
  // Review page states
  const [reviewLoading, setReviewLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
  const [reviewDetails, setReviewDetails] = useState<DetailItem[]>([]);
  
  // Trigger MathJax whenever view transitions or content is updated
  useEffect(() => {
    if ((window as any).MathJax) {
      setTimeout(() => {
        (window as any).MathJax.typesetPromise?.()
          .catch((e: any) => console.error('MathJax typeset error:', e));
      }, 100);
    }
  }, [view, reviewQuestions, filter]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examCode.trim() || !userName.trim()) {
      setErrorMsg('Vui lòng nhập đầy đủ mã kỳ thi và tên đăng nhập/MSSV.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setExamData(null);

    try {
      const response = await fetch('/api/exams/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examCode: examCode.trim(),
          userName: userName.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Tra cứu kết quả thất bại.');
      }

      setExamData(data);
      setView('dashboard');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Không thể kết nối đến máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (session: Session) => {
    if (!session.allowReview) return;
    
    setReviewLoading(true);
    setErrorMsg(null);
    setSelectedSession(session);
    setReviewQuestions([]);
    setReviewDetails([]);
    setFilter('all'); // Reset filter
    
    try {
      const response = await fetch(`/api/sessions/${session.sessionToken}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Không thể tải chi tiết bài thi.');
      }
      
      setReviewQuestions(data.questions || []);
      setReviewDetails(data.details || []);
      setView('review');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Lỗi khi tải chi tiết bài làm.');
    } finally {
      setReviewLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min} phút ${sec} giây`;
  };

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getScoreClass = (scoreStr: string | null) => {
    if (!scoreStr) return 'score-danger';
    const num = parseFloat(scoreStr);
    if (num >= 8.0) return 'score-success';
    if (num >= 5.0) return 'score-warning';
    return 'score-danger';
  };

  // Calculate dynamically counts for questions filters
  const filterCounts = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;

    reviewDetails.forEach(d => {
      const isCorrect = d.isCorrect === true || d.isCorrect === 1;
      const hasAnswered = d.selectedAnswersList && Array.isArray(d.selectedAnswersList) && d.selectedAnswersList.length > 0;

      if (!hasAnswered) {
        unanswered++;
      } else if (isCorrect) {
        correct++;
      } else {
        incorrect++;
      }
    });

    return {
      all: reviewDetails.length,
      correct,
      incorrect,
      unanswered
    };
  }, [reviewDetails]);

  // Filtered list of details mapped to index
  const filteredDetails = useMemo(() => {
    return reviewDetails
      .map((detail, originalIdx) => ({ detail, originalIdx }))
      .filter(({ detail }) => {
        const isCorrect = detail.isCorrect === true || detail.isCorrect === 1;
        const hasAnswered = detail.selectedAnswersList && Array.isArray(detail.selectedAnswersList) && detail.selectedAnswersList.length > 0;

        if (filter === 'correct') return hasAnswered && isCorrect;
        if (filter === 'incorrect') return hasAnswered && !isCorrect;
        if (filter === 'unanswered') return !hasAnswered;
        return true;
      });
  }, [reviewDetails, filter]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header bar */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid var(--border-color)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
        position: 'sticky',
        top: 0
      }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          Tra cứu kết quả thi
        </div>
        {view !== 'lookup' && (
          <button 
            className="secondary" 
            onClick={() => {
              if (view === 'review') {
                setView('dashboard');
              } else {
                setView('lookup');
                setExamCode('');
                setUserName('');
                setExamData(null);
              }
            }}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <ArrowLeft size={16} />
            {view === 'review' ? 'Quay lại danh sách' : 'Tra cứu mã khác'}
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '40px 20px', zIndex: 2 }}>
        
        {/* VIEW 1: LOOKUP FORM */}
        {view === 'lookup' && (
          <div className="glass-panel animate-fade-in" style={{
            width: '100%',
            maxWidth: '440px',
            padding: '32px',
            alignSelf: 'center'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>
                Tra Cứu Kết Quả
              </h2>
            </div>

            <form onSubmit={handleLookup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Mã phòng thi (Exam Code)
                </label>
                <input 
                  type="text" 
                  value={examCode}
                  onChange={e => setExamCode(e.target.value)}
                  placeholder="Nhập mã kỳ thi"
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Mã số sinh viên hoặc Email
                </label>
                <input 
                  type="text" 
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  placeholder="Nhập MSSV hoặc email đăng ký thi" 
                  required
                />
              </div>

              {errorMsg && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  borderRadius: '6px',
                  color: 'var(--color-danger)',
                  fontSize: '0.85rem',
                  lineHeight: 1.4
                }}>
                  <ShieldAlert size={18} style={{ flexShrink: 0 }} />
                  <div>{errorMsg}</div>
                </div>
              )}

              <button type="submit" className="primary" disabled={loading} style={{
                padding: '12px',
                fontSize: '0.95rem',
                marginTop: '6px'
              }}>
                {loading ? 'Đang truy vấn...' : 'Tra cứu kết quả'}
                {!loading && <ChevronRight size={18} />}
              </button>
            </form>
          </div>
        )}

        {/* VIEW 2: DASHBOARD */}
        {view === 'dashboard' && examData && (
          <div className="animate-fade-in" style={{
            width: '100%',
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {/* Top row - info cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '20px'
            }}>
              {/* Card 1: User metadata */}
              <div className="glass-panel" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{
                  background: 'rgba(124, 58, 237, 0.08)',
                  padding: '12px',
                  borderRadius: '8px',
                  color: 'var(--accent-purple)',
                  border: '1px solid rgba(124, 58, 237, 0.1)'
                }}>
                  <User size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Thí sinh dự thi
                  </span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '2px 0 4px 0' }}>
                    {examData.user.name}
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    MSSV: <strong>{examData.user.mssv}</strong> | Email: {examData.user.email}
                  </div>
                </div>
              </div>

              {/* Card 2: Exam metadata */}
              <div className="glass-panel" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{
                  background: 'rgba(37, 99, 235, 0.08)',
                  padding: '12px',
                  borderRadius: '8px',
                  color: 'var(--accent-blue)',
                  border: '1px solid rgba(37, 99, 235, 0.1)'
                }}>
                  <Award size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Thông tin phòng thi
                  </span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '2px 0 4px 0' }}>
                    Mã thi: {examData.exam.examCode}
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Thời gian làm bài: <strong>{examData.exam.durationTime} phút</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Attempts list */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <BarChart2 size={20} color="var(--accent-teal)" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                  Lịch sử các lượt thi đã hoàn thành
                </h3>
              </div>

              {examData.sessions.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '32px 20px',
                  color: 'var(--text-secondary)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '8px'
                }}>
                  Chưa ghi nhận lượt thi đã hoàn thành nào của thí sinh trong đợt thi này.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {examData.sessions.map((session, index) => {
                    const totalQ = (session.totalCorrect || 0) + (session.totalWrong || 0);
                    return (
                      <div 
                        key={session.id} 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px 20px',
                          background: '#f8fafc',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          gap: '16px',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div className={`score-badge ${getScoreClass(session.score)}`} style={{
                            width: '48px',
                            height: '48px',
                            fontSize: '1rem',
                            flexShrink: 0
                          }}>
                            {session.score || 'N/A'}
                          </div>
                          <div>
                            <h4 style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px' }}>
                              Lượt thi thứ {index + 1}
                            </h4>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Calendar size={13} />
                                {formatDate(session.startTime)}
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Clock size={13} />
                                {formatDuration(session.studyTime)}
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <BookOpen size={13} />
                                {session.totalCorrect} đúng / {totalQ} câu
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          {session.allowReview ? (
                            <button 
                              className="secondary" 
                              onClick={() => handleViewDetail(session)}
                              disabled={reviewLoading}
                              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                            >
                              <Eye size={14} />
                              Xem chi tiết bài làm
                            </button>
                          ) : (
                            <div style={{
                              fontSize: '0.8rem',
                              color: 'var(--text-muted)',
                              fontStyle: 'italic',
                              padding: '6px 12px',
                              background: '#f1f5f9',
                              borderRadius: '4px',
                              border: '1px solid #e2e8f0'
                            }}>
                              Khóa chế độ xem lại bài
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: REVIEW DETAILS */}
        {view === 'review' && selectedSession && (
          <div className="animate-fade-in" style={{
            width: '100%',
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {/* Review Header Panel */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-teal)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Chi tiết bài làm
                </span>
                <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.25rem', fontWeight: 800, margin: '2px 0' }}>
                  Lượt thi ngày {formatDate(selectedSession.startTime)}
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Thời gian: <strong>{formatDuration(selectedSession.studyTime)}</strong> | Điểm: <strong>{selectedSession.score}/10.0</strong>
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  textAlign: 'center',
                  minWidth: '80px'
                }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-success)' }}>
                    {selectedSession.totalCorrect}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>CÂU ĐÚNG</div>
                </div>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  textAlign: 'center',
                  minWidth: '80px'
                }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-danger)' }}>
                    {selectedSession.totalWrong}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600 }}>CÂU SAI</div>
                </div>
              </div>
            </div>

            {/* Filter Buttons */}
            <div style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              alignItems: 'center',
              padding: '4px 0'
            }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginRight: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Filter size={14} /> Lọc kết quả:
              </span>
              
              <button 
                onClick={() => setFilter('all')}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.85rem',
                  background: filter === 'all' ? 'var(--accent-blue)' : '#ffffff',
                  color: filter === 'all' ? '#ffffff' : 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '20px'
                }}
              >
                Tất cả ({filterCounts.all})
              </button>

              <button 
                onClick={() => setFilter('correct')}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.85rem',
                  background: filter === 'correct' ? 'var(--color-success)' : '#ffffff',
                  color: filter === 'correct' ? '#ffffff' : 'var(--color-success)',
                  border: `1px solid ${filter === 'correct' ? 'var(--color-success)' : 'var(--border-color)'}`,
                  borderRadius: '20px',
                  fontWeight: filter === 'correct' ? 'bold' : 'normal'
                }}
              >
                Câu đúng ({filterCounts.correct})
              </button>

              <button 
                onClick={() => setFilter('incorrect')}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.85rem',
                  background: filter === 'incorrect' ? 'var(--color-danger)' : '#ffffff',
                  color: filter === 'incorrect' ? '#ffffff' : 'var(--color-danger)',
                  border: `1px solid ${filter === 'incorrect' ? 'var(--color-danger)' : 'var(--border-color)'}`,
                  borderRadius: '20px',
                  fontWeight: filter === 'incorrect' ? 'bold' : 'normal'
                }}
              >
                Câu sai ({filterCounts.incorrect})
              </button>

              <button 
                onClick={() => setFilter('unanswered')}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.85rem',
                  background: filter === 'unanswered' ? '#64748b' : '#ffffff',
                  color: filter === 'unanswered' ? '#ffffff' : '#64748b',
                  border: `1px solid ${filter === 'unanswered' ? '#64748b' : 'var(--border-color)'}`,
                  borderRadius: '20px',
                  fontWeight: filter === 'unanswered' ? 'bold' : 'normal'
                }}
              >
                Chưa làm ({filterCounts.unanswered})
              </button>
            </div>

            {/* Questions list container */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {filteredDetails.length === 0 ? (
                <div className="glass-panel" style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '12px'
                }}>
                  Không có câu hỏi nào khớp với điều kiện lọc đã chọn.
                </div>
              ) : (
                filteredDetails.map(({ detail, originalIdx }) => {
                  const q = reviewQuestions.find(question => question.id === detail.questionTargetId);
                  if (!q) return null;

                  const isCorrect = detail.isCorrect === true || detail.isCorrect === 1;
                  const hasAnswered = detail.selectedAnswersList && Array.isArray(detail.selectedAnswersList) && detail.selectedAnswersList.length > 0;

                  // Safe fallback for answers list
                  const answers = q.answersList || q.answers || [];
                  
                  return (
                    <div 
                      key={detail.id} 
                      className="glass-panel" 
                      style={{ 
                        padding: '24px',
                        borderLeft: `5px solid ${
                          !hasAnswered ? '#94A3B8' : (isCorrect ? 'var(--color-success)' : 'var(--color-danger)')
                        }`
                      }}
                    >
                      {/* Question content */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', gap: '6px' }}>
                          <span style={{ 
                            color: isCorrect ? 'var(--color-success)' : (hasAnswered ? 'var(--color-danger)' : '#94A3B8'),
                            marginRight: '4px',
                            flexShrink: 0
                          }}>
                            Câu {originalIdx + 1}:
                          </span>
                          <span className="tex2jax_process mathjax-container" style={{ fontWeight: 500, lineHeight: 1.5 }}>{q.content}</span>
                        </div>
                        
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: !hasAnswered ? '#f1f5f9' : (isCorrect ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)'),
                          color: !hasAnswered ? '#475569' : (isCorrect ? 'var(--color-success)' : 'var(--color-danger)'),
                          border: `1px solid ${
                            !hasAnswered ? '#cbd5e1' : (isCorrect ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)')
                          }`,
                          flexShrink: 0
                        }}>
                          {!hasAnswered ? null : (isCorrect ? <CheckCircle size={12} /> : <XCircle size={12} />)}
                          {!hasAnswered ? 'Chưa làm' : (isCorrect ? 'Đúng' : 'Sai')}
                        </span>
                      </div>

                      {/* Answer list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {answers.map((ans, aIdx) => {
                          const alphabet = String.fromCharCode(65 + aIdx);
                          const selectedList = detail.selectedAnswersList ? detail.selectedAnswersList.map(Number) : [];
                          const isUserSelected = selectedList.includes(Number(ans.id));
                          const isAnswerCorrect = !!ans.isCorrect;
                          
                          let optionStyle: React.CSSProperties = {
                            padding: '12px 16px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            fontSize: '0.9rem',
                            backgroundColor: '#FFFFFF',
                            color: 'var(--text-primary)'
                          };
                          
                          if (isAnswerCorrect) {
                            optionStyle.borderColor = 'var(--color-success)';
                            optionStyle.backgroundColor = 'rgba(16, 185, 129, 0.05)';
                            optionStyle.fontWeight = 600;
                            if (isUserSelected) {
                              optionStyle.borderWidth = '2px';
                            } else {
                              optionStyle.borderStyle = 'dashed';
                            }
                          } else if (isUserSelected && !isAnswerCorrect) {
                            optionStyle.borderColor = 'var(--color-danger)';
                            optionStyle.backgroundColor = 'rgba(239, 68, 68, 0.05)';
                            optionStyle.fontWeight = 600;
                          }
                          
                          return (
                            <div key={ans.id} style={optionStyle}>
                              <div
                                className="flex items-center justify-center font-bold"
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  backgroundColor: isAnswerCorrect ? 'var(--color-success)' : (isUserSelected ? 'var(--color-danger)' : '#F1F5F9'),
                                  color: isAnswerCorrect || isUserSelected ? 'white' : 'var(--text-secondary)',
                                  fontSize: '0.85rem',
                                  flexShrink: 0
                                }}
                              >
                                {alphabet}
                              </div>

                              <span className="tex2jax_process mathjax-container flex-1">{ans.content}</span>
                              
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}>
                                {isUserSelected && (
                                  <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    backgroundColor: isAnswerCorrect ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: isAnswerCorrect ? 'var(--color-success)' : 'var(--color-danger)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                  }}>
                                    Bạn chọn
                                  </span>
                                )}
                                {isAnswerCorrect && <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />}
                                {isUserSelected && !isAnswerCorrect && <XCircle size={14} style={{ color: 'var(--color-danger)' }} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Explanations block */}
                      {q.explanation && (
                        <div style={{
                          background: '#f8fafc',
                          border: '1px dashed var(--border-color)',
                          borderRadius: '6px',
                          padding: '16px 20px',
                          fontSize: '0.85rem',
                          lineHeight: 1.6
                        }}>
                          <div style={{
                            fontWeight: 700,
                            color: 'var(--accent-teal)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginBottom: '8px'
                          }}>
                            <Sparkles size={14} />
                            Giải thích đáp án chi tiết
                          </div>
                          <div 
                            className="tex2jax_process mathjax-container explanation-content"
                            dangerouslySetInnerHTML={{ __html: cleanHtmlExplanation(q.explanation) }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Actions */}
            <div style={{ alignSelf: 'center', marginTop: '16px', marginBottom: '32px' }}>
              <button 
                className="secondary" 
                onClick={() => setView('dashboard')}
                style={{ padding: '10px 24px' }}
              >
                <ArrowLeft size={16} />
                Quay lại danh sách kết quả
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
