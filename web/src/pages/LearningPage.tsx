import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Play, Search, BookOpen, Clock, Layers, RotateCcw, X, Sparkles, Loader2 } from 'lucide-react';

export const LearningPage: React.FC = () => {
  const { subjects, quizzes, sessions, deleteSession, navigateTo, getSessionWithDetails, startNewSession, loadData } = useApp();
  const { currentUser } = useAuth();

  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(0);
  const [subjectQuery, setSubjectQuery] = useState('');
  const [showModesModal, setShowModesModal] = useState(false);
  
  // Modes configuration
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState<number>(0);
  const [timeLimit, setTimeLimit] = useState(60); // minutes
  const [questionLimit, setQuestionLimit] = useState(50); // count

  const [sessionQuestionCounts, setSessionQuestionCounts] = useState<Record<number, number>>({});

  // AI progress progress states inside modal
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<string | null>(null);
  const [loadingPractice, setLoadingPractice] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load session question counts
  const loadSessionDetailsIfNeeded = async (sessionId: number) => {
    if (sessionQuestionCounts[sessionId]) return;
    try {
      const data = await getSessionWithDetails(sessionId);
      if (data) {
        setSessionQuestionCounts(prev => ({
          ...prev,
          [sessionId]: data.details.length
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (selectedSubjectId) {
      const studyActive = sessions.find(s => s.learningMode === 'study' && s.quizTargetId === -selectedSubjectId && !s.isCompleted && (!s.userEmail || s.userEmail === currentUser?.email));
      if (studyActive) loadSessionDetailsIfNeeded(studyActive.id);
      
      const practiceActive = sessions.find(s => s.learningMode === 'practice' && s.quizTargetId === -selectedSubjectId && !s.isCompleted && (!s.userEmail || s.userEmail === currentUser?.email));
      if (practiceActive) loadSessionDetailsIfNeeded(practiceActive.id);
    }
  }, [sessions, selectedSubjectId, currentUser]);

  // Sync quiz selection for Exam mode
  useEffect(() => {
    if (selectedSubjectId) {
      const related = quizzes.filter(q => q.subjectTargetId === selectedSubjectId);
      if (related.length > 0) {
        const exists = related.some(q => q.id === selectedQuizId);
        if (!exists) {
          setSelectedQuizId(related[0].id);
        }
      } else {
        setSelectedQuizId(0);
      }
    }
  }, [selectedSubjectId, quizzes, selectedQuizId]);

  const getActiveSessionForMode = (mode: 'study' | 'practice') => {
    return sessions.find(s => 
      s.learningMode === mode && 
      s.quizTargetId === -selectedSubjectId && 
      !s.isCompleted &&
      (!s.userEmail || s.userEmail === currentUser?.email)
    );
  };

  const handleStartMode = async (mode: 'study' | 'practice') => {
    const active = getActiveSessionForMode(mode);
    if (active) {
      setShowModesModal(false);
      navigateTo({ type: 'learning-play', sessionTokenOrId: active.sessionToken || String(active.id) });
      return;
    }

    try {
      const sessionId = await startNewSession(0, mode, {
        shuffleQuestions: mode === 'practice' ? shuffleQuestions : false,
        shuffleAnswers: false,
        subjectId: selectedSubjectId
      });
      setShowModesModal(false);
      navigateTo({ type: 'learning-play', sessionTokenOrId: sessionId });
    } catch (e: any) {
      alert(e.message || 'Lỗi khi khởi tạo phiên học.');
    }
  };

  const handleStartExam = async () => {
    if (selectedQuizId === 0) {
      alert('Vui lòng chọn bộ đề trước khi bắt đầu thi.');
      return;
    }

    try {
      const sessionId = await startNewSession(selectedQuizId, 'exam', {
        shuffleQuestions: true,
        shuffleAnswers: true,
        timeLimit: timeLimit * 60,
        subjectId: selectedSubjectId,
        questionLimit: questionLimit
      });
      setShowModesModal(false);
      navigateTo({ type: 'learning-play', sessionTokenOrId: sessionId });
    } catch (e: any) {
      alert(e.message || 'Lỗi khi khởi tạo phiên thi.');
    }
  };

  const handleResetSessionForMode = async (mode: 'study' | 'practice') => {
    const active = getActiveSessionForMode(mode);
    if (!active) return;
    if (confirm(`Bạn có chắc chắn muốn làm mới (reset) tiến trình của phiên ôn luyện này? Tiến trình làm bài hiện tại sẽ bị xóa.`)) {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('study_progress_') || key.startsWith(`study_progress_${active.id}_`))) {
            localStorage.removeItem(key);
          }
        }
        await deleteSession(active.id);
        setSessionQuestionCounts(prev => {
          const next = { ...prev };
          delete next[active.id];
          return next;
        });
      } catch (e: any) {
        alert('Lỗi khi xóa tiến trình cũ: ' + (e.message || e));
      }
    }
  };

  const handleSubjectClick = (subjId: number) => {
    setSelectedSubjectId(subjId);
    setAnalysisReport(null);
    setPracticeError(null);
    setShowModesModal(true);
  };

  const handleCloseModal = () => {
    setShowModesModal(false);
    setAnalysisReport(null);
    setPracticeError(null);
  };

  const handleStartAnalysis = async () => {
    setLoadingAnalysis(true);
    setAnalysisReport(null);
    try {
      const res = await fetch('/api/ai/analyze-progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjectId: selectedSubjectId || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to call AI analysis API');
      }

      const data = await res.json();
      setAnalysisReport(data.report);
    } catch (err: any) {
      console.error(err);
      setAnalysisReport(`❌ **Lỗi:** ${err.message || 'Không thể liên kết với API Trợ lý AI. Hãy chắc chắn AI_ENDPOINT và AI_API_KEY đã được thiết lập trong tệp cấu hình .env của bạn.'}`);
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleStartSmartPractice = async () => {
    setLoadingPractice(true);
    setPracticeError(null);

    try {
      const res = await fetch('/api/ai/recommend-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjectId: selectedSubjectId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch recommendations');
      }

      const data = await res.json();
      const questionIds = data.recommendedQuestionIds;

      if (!questionIds || questionIds.length === 0) {
        throw new Error('Môn học này không có đủ câu hỏi hoặc dữ liệu đề thi để ôn luyện.');
      }

      const sessionToken = await startNewSession(0, 'practice', {
        shuffleQuestions: true,
        shuffleAnswers: false,
        subjectId: Number(selectedSubjectId),
        questionIds: questionIds,
      });

      setShowModesModal(false);
      navigateTo({ type: 'learning-play', sessionTokenOrId: sessionToken });
    } catch (err: any) {
      console.error(err);
      setPracticeError(err.message || 'Không thể khởi tạo đề thi mục tiêu. Kiểm tra cấu hình .env.');
    } finally {
      setLoadingPractice(false);
    }
  };

  const getSubjectStats = () => {
    let targetQuizIds: number[] = [];
    if (selectedSubjectId) {
      const subjectQuizzes = quizzes.filter(q => q.subjectTargetId === selectedSubjectId);
      targetQuizIds = subjectQuizzes.map(q => q.id);
    } else {
      targetQuizIds = quizzes.map(q => q.id);
    }

    const filteredSessions = sessions.filter(s => targetQuizIds.includes(s.quizTargetId));
    let correct = 0;
    let wrong = 0;
    filteredSessions.forEach(s => {
      correct += s.totalCorrect || 0;
      wrong += s.totalWrong || 0;
    });

    const total = correct + wrong;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { correct, wrong, total, accuracy };
  };

  const formatMarkdown = (md: string) => {
    if (!md) return '';
    return md
      .replace(/### (.*)/g, '<h4 style="font-size: 0.95rem; font-weight: 700; margin-top: 10px; margin-bottom: 4px; color: var(--primary-color)">$1</h4>')
      .replace(/## (.*)/g, '<h3 style="font-size: 1.1rem; font-weight: 700; margin-top: 14px; margin-bottom: 8px; color: var(--primary-color)">$1</h3>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight: 700; color: var(--text-main)">$1</strong>')
      .replace(/^- (.*)/gm, '<li style="margin-left: 15px; margin-bottom: 4px; list-style-type: disc; color: var(--text-secondary)">$1</li>')
      .split('\n').map(line => line.trim().startsWith('<li') ? line : `<p style="margin-bottom: 6px; color: var(--text-secondary); line-height: 1.4; font-size: 0.8rem;">${line}</p>`).join('');
  };

  const filteredSubjects = subjects.filter(s =>
    s.code.toLowerCase().includes(subjectQuery.toLowerCase()) ||
    s.name.toLowerCase().includes(subjectQuery.toLowerCase())
  );

  // Grouping subjects by semester
  const semesters = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const subjectGroups: Array<{ name: string; items: typeof subjects }> = [];
  
  semesters.forEach(sem => {
    const items = filteredSubjects.filter(s => s.semester === sem);
    if (items.length > 0) {
      subjectGroups.push({ name: `Kỳ ${sem}`, items });
    }
  });
  
  const naItems = filteredSubjects.filter(s => s.semester === null || s.semester === undefined || !semesters.includes(s.semester));
  if (naItems.length > 0) {
    subjectGroups.push({ name: 'N/A (Không rõ kỳ)', items: naItems });
  }

  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);
  const relatedQuizzes = quizzes.filter(q => q.subjectTargetId === selectedSubjectId);

  // Active sessions for the currently selected subject in modal
  const studySession = getActiveSessionForMode('study');
  const practiceSession = getActiveSessionForMode('practice');
  const stats = getSubjectStats();

  return (
    <div className="overflow-y-auto w-full h-full" style={{ height: '100%' }}>
      <div className="p-6 animate-fade-in flex flex-col gap-6">
        
        {/* Title */}
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '4px' }}>Học tập & Luyện đề</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Chọn môn học để bắt đầu học tập và ôn luyện trắc nghiệm.</p>
        </div>

        {/* Search Bar - styled identically to library */}
        <div 
          className="flex items-center px-3 gap-2"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            height: '42px',
            maxWidth: '380px'
          }}
        >
          <Search size={18} style={{ color: 'var(--text-secondary)' }} />
          <input 
            type="text" 
            placeholder="Tìm kiếm môn học..." 
            value={subjectQuery}
            onChange={(e) => setSubjectQuery(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              width: '100%',
              fontSize: '0.9rem',
              backgroundColor: 'transparent'
            }}
          />
        </div>

        {/* Grid List of Subjects - styled identically to library */}
        {filteredSubjects.length === 0 ? (
          <div className="card flex flex-col items-center justify-center p-12" style={{ color: 'var(--text-secondary)' }}>
            <BookOpen size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <span style={{ fontWeight: 600 }}>Không tìm thấy môn học nào</span>
            <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Nhập từ khóa khác hoặc liên hệ quản trị viên.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {subjectGroups.map(group => (
              <div key={group.name} className="flex flex-col gap-4">
                <h3 
                  style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: 800, 
                    color: '#1e293b', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    borderBottom: '1px solid var(--border-color)',
                    paddingBottom: '8px',
                    marginTop: '8px'
                  }}
                >
                  <span style={{ width: '4px', height: '18px', backgroundColor: 'var(--primary-color)', borderRadius: '2px' }}></span>
                  {group.name}
                </h3>
                <div className="grid grid-cols-3 gap-6">
                  {group.items.map(s => {
                    return (
                      <div
                        key={s.id}
                        className="card flex flex-col justify-between"
                        style={{ cursor: 'pointer', minHeight: '160px' }}
                        onClick={() => handleSubjectClick(s.id)}
                      >
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <span 
                              style={{ 
                                fontSize: '0.8rem', 
                                fontWeight: 700, 
                                color: 'var(--primary-color)',
                                backgroundColor: 'rgba(1, 117, 194, 0.1)',
                                padding: '3px 8px',
                                borderRadius: '4px'
                              }}
                            >
                              {s.code}
                            </span>
                          </div>
                          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px', lineHeight: 1.3 }}>
                            {s.name}
                          </h3>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Modal Popup containing the 3 Modes and AI Analysis Panel */}
      {showModesModal && selectedSubject && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div 
            className="modal-content" 
            style={{ maxWidth: '850px', width: '95%', padding: '24px', borderRadius: '12px' }} 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'between', alignItems: 'start', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary-color)' }}>{selectedSubject.code}</span>
                <h3 className="modal-title" style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, marginTop: '2px' }}>
                  {selectedSubject.name}
                </h3>
              </div>
              <button 
                onClick={handleCloseModal}
                style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '50%', color: 'var(--text-secondary)' }}
                className="hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* Split Layout Modal Body */}
            <div className="flex flex-col md:flex-row gap-6" style={{ overflowY: 'auto', maxHeight: '72vh' }}>
              
              {/* Left Column: Learning Modes (Width: 55%) */}
              <div className="flex flex-col gap-4" style={{ flex: '55%' }}>
                <h4 style={{ fontWeight: 700, fontSize: '0.95rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', color: 'var(--primary-color)', marginBottom: '8px' }}>
                  Cấu hình ôn tập
                </h4>

                {/* Study Mode */}
                <div className="card p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4" style={{ backgroundColor: 'var(--bg-content)' }}>
                  <div className="flex-1 flex gap-3">
                    <div className="p-2.5" style={{ backgroundColor: 'rgba(1, 117, 194, 0.08)', borderRadius: '8px', height: 'fit-content' }}>
                      <BookOpen size={20} style={{ color: 'var(--primary-color)' }} />
                    </div>
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '2px' }}>📖 Chế độ Học tập (Study)</h4>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        Xem câu hỏi và đáp án gợi ý dưới dạng flashcard ghi nhớ.
                      </p>
                      {studySession && (
                        <div className="mt-1 text-xs" style={{ color: '#16a34a', fontWeight: 600 }}>
                          ⏳ Đang học: Câu {studySession.currentIndex + 1} / {sessionQuestionCounts[studySession.id] || '—'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex md:flex-col gap-2 w-full md:w-auto flex-shrink-0">
                    <button
                      onClick={() => handleStartMode('study')}
                      className="btn btn-primary py-2 px-5 flex items-center justify-center gap-1.5"
                      style={{ fontSize: '0.85rem' }}
                    >
                      <Play size={14} fill="white" />
                      <span>{studySession ? 'Tiếp tục' : 'Bắt đầu'}</span>
                    </button>
                    {studySession && (
                      <button
                        onClick={() => handleResetSessionForMode('study')}
                        className="btn btn-secondary py-1.5 px-4 text-danger flex items-center justify-center gap-1"
                        style={{ color: 'var(--toast-error)', borderColor: 'rgba(255, 77, 79, 0.15)', backgroundColor: 'transparent', fontSize: '0.75rem' }}
                      >
                        <RotateCcw size={12} />
                        <span>Làm lại</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Practice Mode */}
                <div className="card p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4" style={{ backgroundColor: 'var(--bg-content)' }}>
                  <div className="flex-1 flex gap-3">
                    <div className="p-2.5" style={{ backgroundColor: 'rgba(1, 117, 194, 0.08)', borderRadius: '8px', height: 'fit-content' }}>
                      <Layers size={20} style={{ color: 'var(--primary-color)' }} />
                    </div>
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '2px' }}>✏️ Chế độ Luyện tập (Practice)</h4>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        Trả lời trắc nghiệm nhận đáp án Đúng/Sai và giải thích trực tiếp.
                      </p>

                      {!practiceSession && (
                        <div className="mt-2.5">
                          <label className="checkbox-container">
                            <input 
                              type="checkbox" 
                              checked={shuffleQuestions}
                              onChange={(e) => setShuffleQuestions(e.target.checked)}
                            />
                            <span className="checkmark" style={{ width: '14px', height: '14px' }}></span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginLeft: '4px' }}>
                              Xáo trộn câu hỏi
                            </span>
                          </label>
                        </div>
                      )}
                      {practiceSession && (
                        <div className="mt-1 text-xs" style={{ color: '#16a34a', fontWeight: 600 }}>
                          ⏳ Đang luyện: Câu {practiceSession.currentIndex + 1} / {sessionQuestionCounts[practiceSession.id] || '—'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex md:flex-col gap-2 w-full md:w-auto flex-shrink-0">
                    <button
                      onClick={() => handleStartMode('practice')}
                      className="btn btn-primary py-2 px-5 flex items-center justify-center gap-1.5"
                      style={{ fontSize: '0.85rem' }}
                    >
                      <Play size={14} fill="white" />
                      <span>{practiceSession ? 'Tiếp tục' : 'Bắt đầu'}</span>
                    </button>
                    {practiceSession && (
                      <button
                        onClick={() => handleResetSessionForMode('practice')}
                        className="btn btn-secondary py-1.5 px-4 text-danger flex items-center justify-center gap-1"
                        style={{ color: 'var(--toast-error)', borderColor: 'rgba(255, 77, 79, 0.15)', backgroundColor: 'transparent', fontSize: '0.75rem' }}
                      >
                        <RotateCcw size={12} />
                        <span>Làm lại</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Exam Mode */}
                <div className="card p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--bg-content)' }}>
                  <div className="flex gap-3">
                    <div className="p-2.5" style={{ backgroundColor: 'rgba(1, 117, 194, 0.08)', borderRadius: '8px', height: 'fit-content' }}>
                      <Clock size={20} style={{ color: 'var(--primary-color)' }} />
                    </div>
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '2px' }}>⏱️ Chế độ Thi thử (Exam)</h4>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        Thi thử giới hạn thời gian, tự động xáo đề và lưu điểm.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3" style={{ backgroundColor: 'var(--bg-card)', borderRadius: '6px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '2px' }}>Chọn đề thi</label>
                      <select
                        className="input"
                        value={selectedQuizId}
                        onChange={(e) => setSelectedQuizId(Number(e.target.value))}
                        style={{ height: '32px', padding: '0 6px', fontSize: '0.8rem' }}
                      >
                        {relatedQuizzes.length === 0 && <option value="0">Chưa có đề nào</option>}
                        {relatedQuizzes.map(q => (
                          <option key={q.id} value={q.id}>{q.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '2px' }}>Thời gian (Phút)</label>
                      <input 
                        type="number" 
                        className="input" 
                        min="1" 
                        max="180"
                        value={timeLimit}
                        onChange={(e) => setTimeLimit(Number(e.target.value))}
                        style={{ height: '32px', padding: '0 6px', fontSize: '0.8rem' }}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: '2px' }}>Số câu hỏi</label>
                      <input 
                        type="number" 
                        className="input" 
                        min="1" 
                        max="200"
                        value={questionLimit}
                        onChange={(e) => setQuestionLimit(Number(e.target.value))}
                        style={{ height: '32px', padding: '0 6px', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleStartExam}
                    className="btn btn-primary py-2 px-5 flex items-center justify-center gap-1.5"
                    disabled={selectedQuizId === 0}
                    style={{ alignSelf: 'flex-end', width: '100%', fontSize: '0.85rem' }}
                  >
                    <Play size={14} fill="white" />
                    <span>Bắt đầu thi thử</span>
                  </button>
                </div>
              </div>

              {/* Right Column: AI Assistant Monitoring (Width: 45%) */}
              <div className="flex flex-col gap-4" style={{ flex: '45%', borderLeft: '1px solid var(--border-color)', paddingLeft: '15px' }}>
                <h4 style={{ fontWeight: 700, fontSize: '0.95rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', color: 'var(--primary-color)', marginBottom: '8px' }}>
                  🤖 Trợ lý Giám sát AI
                </h4>

                {/* Progress Circle and Stat text */}
                <div className="flex items-center gap-4" style={{ backgroundColor: 'var(--bg-content)', padding: '12px', borderRadius: '8px' }}>
                  {/* Accuracy progress circle */}
                  <div className="relative flex items-center justify-center flex-shrink-0">
                    <svg className="w-16 h-16 transform -rotate-90">
                      <circle cx="32" cy="32" r="26" stroke="var(--border-color)" strokeWidth="4" fill="transparent" />
                      <circle
                        cx="32"
                        cy="32"
                        r="26"
                        stroke="var(--primary-color)"
                        strokeWidth="5"
                        fill="transparent"
                        strokeDasharray={163.3}
                        strokeDashoffset={163.3 - (163.3 * stats.accuracy) / 100}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span style={{ position: 'absolute', fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary-color)' }}>
                      {stats.accuracy}%
                    </span>
                  </div>

                  {/* Statistics */}
                  <div className="flex-1 flex flex-col gap-1" style={{ fontSize: '0.78rem' }}>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>Đã làm:</span>
                      <strong style={{ color: 'var(--text-main)' }}>{stats.total} câu</strong>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--toast-success)' }}>Đúng:</span>
                      <strong style={{ color: 'var(--toast-success)' }}>{stats.correct}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--toast-error)' }}>Sai:</span>
                      <strong style={{ color: 'var(--toast-error)' }}>{stats.wrong}</strong>
                    </div>
                  </div>
                </div>

                {/* Smart Practice recommender button */}
                <div>
                  <button
                    className="btn btn-secondary flex items-center justify-center gap-1.5 w-full py-2"
                    style={{ fontSize: '0.8rem', fontWeight: 700 }}
                    onClick={handleStartSmartPractice}
                    disabled={loadingPractice}
                  >
                    {loadingPractice ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} style={{ color: 'var(--primary-color)' }} />
                    )}
                    Luyện tập mục tiêu bằng AI
                  </button>
                  {practiceError && (
                    <div style={{ color: 'var(--toast-error)', fontSize: '0.72rem', marginTop: '4px' }}>{practiceError}</div>
                  )}
                </div>

                {/* AI report progress */}
                <div className="flex flex-col gap-2 flex-1" style={{ minHeight: '150px' }}>
                  <div className="flex justify-between items-center">
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Báo cáo học lực:</span>
                    <button
                      className="btn btn-secondary py-1 px-3"
                      style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      onClick={handleStartAnalysis}
                      disabled={loadingAnalysis}
                    >
                      {loadingAnalysis ? <Loader2 size={12} className="animate-spin" /> : 'Yêu cầu AI phân tích'}
                    </button>
                  </div>

                  <div 
                    style={{ 
                      flex: 1, 
                      backgroundColor: 'var(--bg-content)', 
                      borderRadius: '8px', 
                      padding: '10px', 
                      fontSize: '0.8rem', 
                      overflowY: 'auto',
                      maxHeight: '160px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    {loadingAnalysis ? (
                      <div className="flex flex-col items-center justify-center py-6 gap-2">
                        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--primary-color)' }} />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>AI đang phân tích...</span>
                      </div>
                    ) : analysisReport ? (
                      <div dangerouslySetInnerHTML={{ __html: formatMarkdown(analysisReport) }} />
                    ) : (
                      <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '15px 0' }}>
                        Bấm "Yêu cầu AI phân tích" để AI đánh giá tiến trình học tập của bạn.
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>

            {/* Modal Footer Shortcuts Info */}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '15px', justifyContent: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '12px' }}>
              <span>• <strong>H</strong>: Xem đáp án nhanh</span>
              <span>• <strong>Space</strong>: Chuyển câu kế</span>
              <span>• <strong>1, 2, 3...</strong>: Chọn đáp án</span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
