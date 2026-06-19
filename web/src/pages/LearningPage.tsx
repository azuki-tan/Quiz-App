import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Play, Settings, CheckCircle2 } from 'lucide-react';
import type { Quiz, LearningSessionDetail } from '../types';

export const LearningPage: React.FC = () => {
  const { subjects, quizzes, sessions, deleteSession, navigateTo, getSessionWithDetails, startNewSession, loadData } = useApp();

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(0);
  const [selectedQuizId, setSelectedQuizId] = useState<number>(0);
  const [filteredQuizzes, setFilteredQuizzes] = useState<Quiz[]>([]);
  
  const [learningMode, setLearningMode] = useState<'study' | 'practice' | 'exam'>('practice');
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [timeLimit, setTimeLimit] = useState(60); // Default 60 mins for exams
  const [questionLimit, setQuestionLimit] = useState(50); // Default 50 questions

  const [activeSessionDetails, setActiveSessionDetails] = useState<LearningSessionDetail[]>([]);
  const [loadingActiveDetails, setLoadingActiveDetails] = useState(false);

  const activeSession = React.useMemo(() => {
    if (learningMode === 'exam') return null;
    return sessions.find(s => 
      s.learningMode === learningMode && 
      s.quizTargetId === -selectedSubjectId && 
      !s.isCompleted
    );
  }, [sessions, learningMode, selectedSubjectId]);

  useEffect(() => {
    if (activeSession) {
      setLoadingActiveDetails(true);
      getSessionWithDetails(activeSession.sessionToken || activeSession.id)
        .then(data => {
          if (data) {
            setActiveSessionDetails(data.details);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingActiveDetails(false));
    } else {
      setActiveSessionDetails([]);
    }
  }, [activeSession, getSessionWithDetails]);

  // Force shuffle and pick random quiz when mode switches to exam
  useEffect(() => {
    if (learningMode === 'exam') {
      setShuffleQuestions(true);
      
      const related = quizzes.filter(q => q.subjectTargetId === selectedSubjectId);
      if (related.length > 0) {
        const randomIndex = Math.floor(Math.random() * related.length);
        setSelectedQuizId(related[randomIndex].id);
      }
    }
  }, [learningMode, selectedSubjectId, quizzes]);

  // Sync subject and quizzes
  useEffect(() => {
    if (subjects.length > 0) {
      // Determine target subject
      const exists = subjects.some(s => s.id === selectedSubjectId);
      let targetSubjectId = selectedSubjectId;
      if (selectedSubjectId === 0 || !exists) {
        targetSubjectId = subjects[0].id;
        setSelectedSubjectId(targetSubjectId);
      }

      // Update filtered quizzes for target subject
      const relatedQuizzes = quizzes.filter(q => q.subjectTargetId === targetSubjectId);
      setFilteredQuizzes(relatedQuizzes);

      // Handle quiz selection in exam mode
      if (learningMode === 'exam') {
        const quizExists = relatedQuizzes.some(q => q.id === selectedQuizId);
        if (selectedQuizId === 0 || !quizExists) {
          if (relatedQuizzes.length > 0) {
            const randomIndex = Math.floor(Math.random() * relatedQuizzes.length);
            setSelectedQuizId(relatedQuizzes[randomIndex].id);
          } else {
            setSelectedQuizId(0);
          }
        }
      } else {
        setSelectedQuizId(0);
      }
    }
  }, [subjects, quizzes, learningMode, selectedSubjectId, selectedQuizId]);

  const handleSubjectChange = (subjectId: number) => {
    setSelectedSubjectId(subjectId);
    const relatedQuizzes = quizzes.filter(q => q.subjectTargetId === subjectId);
    setFilteredQuizzes(relatedQuizzes);
    if (relatedQuizzes.length > 0) {
      if (learningMode === 'exam') {
        const randomIndex = Math.floor(Math.random() * relatedQuizzes.length);
        setSelectedQuizId(relatedQuizzes[randomIndex].id);
      } else {
        setSelectedQuizId(relatedQuizzes[0].id);
      }
    } else {
      setSelectedQuizId(0);
    }
  };

  const handleResetSession = async () => {
    if (!activeSession) return;
    if (confirm('Bạn có chắc chắn muốn làm mới (reset) tiến trình của phiên ôn luyện này? Tiến trình làm bài hiện tại sẽ bị xóa và bắt đầu lại từ đầu.')) {
      try {
        // Clear all local storage study progress keys to allow studying again
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('study_progress_') || key.startsWith(`study_progress_${activeSession.id}_`))) {
            localStorage.removeItem(key);
          }
        }
        await deleteSession(activeSession.id);
      } catch (e: any) {
        alert('Lỗi khi xóa tiến trình cũ: ' + (e.message || e));
      }
    }
  };

  const handleStart = async () => {
    if (learningMode === 'exam' && selectedQuizId === 0) {
      alert('Vui lòng chọn bộ đề trước khi bắt đầu.');
      return;
    }
    if (selectedSubjectId === 0) {
      alert('Vui lòng chọn môn học.');
      return;
    }

    if (learningMode !== 'exam' && activeSession) {
      navigateTo({ type: 'learning-play', sessionTokenOrId: activeSession.sessionToken || String(activeSession.id) });
      return;
    }

    try {
      const sessionId = await startNewSession(learningMode === 'exam' ? selectedQuizId : 0, learningMode, {
        shuffleQuestions: learningMode === 'exam' ? true : shuffleQuestions,
        shuffleAnswers: learningMode === 'exam' ? true : false,
        timeLimit: learningMode === 'exam' ? timeLimit * 60 : undefined, // in seconds
        subjectId: selectedSubjectId,
        questionLimit: learningMode === 'exam' ? questionLimit : undefined
      });

      navigateTo({ type: 'learning-play', sessionTokenOrId: sessionId });
    } catch (e: any) {
      alert(e.message || 'Lỗi khi khởi tạo phiên học.');
    }
  };

  return (
    <div className="p-6 animate-fade-in flex flex-col gap-6 overflow-y-auto" style={{ height: '100%' }}>
      {/* Title */}
      <div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '4px' }}>Học tập & Luyện đề</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Chọn môn học, bộ đề và chế độ ôn luyện để bắt đầu học tập.</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="card grid-span-2 flex flex-col gap-4" style={{ gridColumn: 'span 2' }}>
          <h3 className="flex items-center gap-2" style={{ fontSize: '1.15rem', fontWeight: 700 }}>
            <Settings size={20} style={{ color: 'var(--primary-color)' }} />
            Cấu hình phiên học
          </h3>

          {/* Form */}
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Chọn môn học</label>
              <select 
                className="input" 
                value={selectedSubjectId}
                onChange={(e) => handleSubjectChange(Number(e.target.value))}
              >
                {subjects.length === 0 && <option value="0">Chưa có môn học nào</option>}
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                ))}
              </select>
            </div>

            {learningMode === 'exam' ? (
              <div className="form-group">
                <label className="form-label">Chọn bộ đề</label>
                <select 
                  className="input" 
                  value={selectedQuizId}
                  onChange={(e) => setSelectedQuizId(Number(e.target.value))}
                >
                  {filteredQuizzes.length === 0 && <option value="0">Chưa có bộ đề nào</option>}
                  {filteredQuizzes.map(q => (
                    <option key={q.id} value={q.id}>{q.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group flex flex-col justify-end" style={{ paddingBottom: '4px' }}>
                <span className="badge badge-info py-2 px-3 text-center" style={{ fontSize: '0.9rem', width: 'fit-content' }}>
                  📖 Học/Luyện toàn bộ câu hỏi môn học
                </span>
              </div>
            )}
          </div>

          {/* Learning Mode Selection */}
          <div className="form-group">
            <label className="form-label">Chọn chế độ ôn tập</label>
            <div className="grid grid-cols-3 gap-3">
              {/* Study Mode */}
              <div 
                className="card p-3 flex flex-col items-center gap-2 text-center justify-between"
                style={{ 
                  cursor: 'pointer',
                  borderColor: learningMode === 'study' ? 'var(--primary-color)' : 'var(--border-color)',
                  backgroundColor: learningMode === 'study' ? 'rgba(1, 117, 194, 0.05)' : 'transparent',
                }}
                onClick={() => setLearningMode('study')}
              >
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>📖 Học tập (Study)</div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Xem câu hỏi và đáp án dưới dạng flashcard.</p>
              </div>

              {/* Practice Mode */}
              <div 
                className="card p-3 flex flex-col items-center gap-2 text-center justify-between"
                style={{ 
                  cursor: 'pointer',
                  borderColor: learningMode === 'practice' ? 'var(--primary-color)' : 'var(--border-color)',
                  backgroundColor: learningMode === 'practice' ? 'rgba(1, 117, 194, 0.05)' : 'transparent',
                }}
                onClick={() => setLearningMode('practice')}
              >
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>✏️ Luyện tập (Practice)</div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Trả lời câu hỏi và nhận đáp án đúng/sai lập tức.</p>
              </div>

              {/* Exam Mode */}
              <div 
                className="card p-3 flex flex-col items-center gap-2 text-center justify-between"
                style={{ 
                  cursor: 'pointer',
                  borderColor: learningMode === 'exam' ? 'var(--primary-color)' : 'var(--border-color)',
                  backgroundColor: learningMode === 'exam' ? 'rgba(1, 117, 194, 0.05)' : 'transparent',
                }}
                onClick={() => setLearningMode('exam')}
              >
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>⏱️ Thi cử (Exam)</div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Bấm giờ thi, xáo trộn đề, chấm điểm sau khi nộp.</p>
              </div>
            </div>
          </div>

          {/* Exam options if exam is selected */}
          {learningMode === 'exam' && (
            <div className="grid grid-cols-2 gap-4 animate-fade-in">
              <div className="form-group">
                <label className="form-label">Giới hạn thời gian thi (Phút)</label>
                <input 
                  type="number" 
                  className="input" 
                  min="1" 
                  max="180"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Số lượng câu hỏi thi</label>
                <input 
                  type="number" 
                  className="input" 
                  min="1" 
                  max="200"
                  value={questionLimit}
                  onChange={(e) => setQuestionLimit(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {/* Options Shuffling */}
          {learningMode !== 'exam' && (
            <div className="flex gap-6 mt-2">
              <label className="checkbox-container">
                <input 
                  type="checkbox" 
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                />
                <span className="checkmark"></span>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                  Xáo trộn thứ tự câu hỏi
                </span>
              </label>
            </div>
          )}

          {/* Progress Banner */}
          {learningMode !== 'exam' && activeSession && (
            <div 
              className="p-4" 
              style={{ 
                backgroundColor: 'rgba(34, 197, 94, 0.05)', 
                borderColor: 'rgba(34, 197, 94, 0.2)', 
                borderWidth: '1px',
                borderStyle: 'solid',
                borderRadius: '8px',
                marginTop: '12px'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#16a34a', marginBottom: '4px' }}>
                📝 Tiến trình ôn tập hiện tại:
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Đang ôn luyện câu: <strong>{activeSession.currentIndex + 1}</strong> / {activeSessionDetails.length || '—'}
                <br />
                Đã học (đã trả lời): <strong>{activeSessionDetails.filter(d => d.selectedAnswersList && d.selectedAnswersList.length > 0).length}</strong> / {activeSessionDetails.length || '—'} câu hỏi
              </div>
            </div>
          )}

          {/* Start/Reset Buttons */}
          {learningMode !== 'exam' && activeSession ? (
            <div className="flex gap-3 mt-4">
              <button 
                onClick={handleStart}
                className="btn btn-primary flex-1 py-3 flex justify-center items-center gap-2"
                disabled={loadingActiveDetails}
              >
                <Play size={18} fill="white" />
                <span>Tiếp Tục Ôn Luyện</span>
              </button>
              <button 
                onClick={handleResetSession}
                className="btn btn-secondary py-3 px-6 text-danger flex justify-center items-center gap-2"
                style={{ color: 'var(--toast-error)', borderColor: 'var(--toast-error)', backgroundColor: 'transparent' }}
              >
                <span>Reset tiến trình</span>
              </button>
            </div>
          ) : (
            <button 
              onClick={handleStart}
              className="btn btn-primary w-full py-3 mt-4 flex justify-center items-center gap-2"
              disabled={selectedSubjectId === 0 || (learningMode === 'exam' && selectedQuizId === 0)}
            >
              <Play size={18} fill="white" />
              <span>Bắt Đầu Ôn Luyện</span>
            </button>
          )}
        </div>

        {/* Quick Help Card */}
        <div className="card flex flex-col gap-4">
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Hướng dẫn ôn luyện</h3>
          
          <ul className="flex flex-col gap-3" style={{ listStyle: 'none', fontSize: '0.85rem' }}>
            <li className="flex gap-2">
              <CheckCircle2 size={16} className="flex-shrink-0" style={{ color: 'var(--toast-success)' }} />
              <span>Sử dụng phím <strong>H</strong> để hiện nhanh đáp án gợi ý.</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 size={16} className="flex-shrink-0" style={{ color: 'var(--toast-success)' }} />
              <span>Sử dụng <strong>Enter</strong> để kiểm tra kết quả vừa chọn.</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 size={16} className="flex-shrink-0" style={{ color: 'var(--toast-success)' }} />
              <span>Sử dụng phím <strong>Space</strong> (hoặc Phím Mũi Tên Phải) để chuyển sang câu kế tiếp.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
