import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import type { LearningSession, LearningSessionDetail, Question } from '../types';
import { cleanHtmlExplanation } from '../utils/html';

interface LearningReviewPageProps {
  sessionId: string;
}

export const LearningReviewPage: React.FC<LearningReviewPageProps> = ({ sessionId }) => {
  const { navigateTo, getSessionWithDetails, getQuestionsForQuiz } = useApp();
  const [session, setSession] = useState<LearningSession | null>(null);
  const [details, setDetails] = useState<LearningSessionDetail[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong'>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getSessionWithDetails(sessionId);
        if (!data) {
          setError('Không tìm thấy thông tin phiên làm bài này.');
          return;
        }
        setSession(data.session);
        setDetails(data.details);

        // Load all questions for the details in parallel/bulk
        const qIds = data.details.map(x => x.questionTargetId);
        let allQuestions: Question[] = [];
        if (data.session.quizTargetId < 0) {
          const subjectId = -data.session.quizTargetId;
          const API_URL = (import.meta.env.VITE_API_URL as string) || '/api';
          // Fetch quizzes directly from server to avoid empty lists during page refresh/direct loads
          const response = await fetch(`${API_URL}/subjects/${subjectId}/quizzes`, { credentials: 'include' });
          if (!response.ok) {
            throw new Error(`Failed to fetch quizzes for subject ${subjectId}`);
          }
          const subjectQuizzes = await response.json();
          const questionsResults = await Promise.all(subjectQuizzes.map((q: any) => getQuestionsForQuiz(q.id)));
          allQuestions = questionsResults.flat();
        } else {
          allQuestions = await getQuestionsForQuiz(data.session.quizTargetId);
        }
        const questionsMap = new Map(allQuestions.map(q => [q.id, q]));
        const loadedQuestions = qIds.map(qId => questionsMap.get(qId)).filter(Boolean) as Question[];
        setQuestions(loadedQuestions);
      } catch (e: any) {
        console.error(e);
        setError('Có lỗi xảy ra khi tải chi tiết bài làm: ' + (e.message || e));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sessionId]);

  // Trigger MathJax typeset when review questions are loaded
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((window as any).MathJax) {
        (window as any).MathJax.typesetPromise?.().catch((e: any) => console.error(e));
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [questions]);

  if (loading) {
    return <div className="p-12 flex justify-center">Đang tải chi tiết bài làm...</div>;
  }

  if (error || !session) {
    return (
      <div className="p-12 flex flex-col items-center gap-4 text-center">
        <div className="text-danger font-semibold" style={{ color: 'var(--toast-error)', fontSize: '1.1rem' }}>
          {error || 'Không tìm thấy phiên làm bài.'}
        </div>
        <button 
          className="btn btn-primary px-6 py-2" 
          onClick={() => navigateTo({ type: 'learning' })}
        >
          Quay lại Trang học tập
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 animate-fade-in flex flex-col gap-6 overflow-y-auto" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            className="btn btn-secondary p-2"
            style={{ borderRadius: '50%' }}
            onClick={() => navigateTo({ type: 'learning-result', sessionTokenOrId: session.sessionToken || String(sessionId) })}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2 }}>Chi tiết bài làm</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Xem lại câu trả lời đúng và sai của bạn.</p>
          </div>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <button
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('all')}
          style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600 }}
        >
          Tất cả ({details.length})
        </button>
        <button
          className={`btn ${filter === 'correct' ? 'btn-success' : 'btn-secondary'}`}
          onClick={() => setFilter('correct')}
          style={{ 
            padding: '8px 16px', 
            borderRadius: '8px', 
            fontSize: '0.9rem', 
            fontWeight: 600,
            backgroundColor: filter === 'correct' ? 'var(--toast-success)' : undefined,
            color: filter === 'correct' ? '#FFFFFF' : undefined,
            borderColor: filter === 'correct' ? 'var(--toast-success)' : undefined
          }}
        >
          Câu đúng ({details.filter(d => d.isCorrect === true).length})
        </button>
        <button
          className={`btn ${filter === 'wrong' ? 'btn-danger' : 'btn-secondary'}`}
          onClick={() => setFilter('wrong')}
          style={{ 
            padding: '8px 16px', 
            borderRadius: '8px', 
            fontSize: '0.9rem', 
            fontWeight: 600,
            backgroundColor: filter === 'wrong' ? 'var(--toast-error)' : undefined,
            color: filter === 'wrong' ? '#FFFFFF' : undefined,
            borderColor: filter === 'wrong' ? 'var(--toast-error)' : undefined
          }}
        >
          Câu sai ({details.length - details.filter(d => d.isCorrect === true).length})
        </button>
      </div>

      {/* Questions List */}
      <div className="flex flex-col gap-4">
        {details
          .map((detail, originalIdx) => ({ detail, originalIdx }))
          .filter(({ detail }) => {
            const isCorrect = detail.isCorrect;
            const hasAnswered = detail.selectedAnswersList && Array.isArray(detail.selectedAnswersList) && detail.selectedAnswersList.length > 0;
            if (filter === 'correct') return isCorrect === true;
            if (filter === 'wrong') return isCorrect === false || isCorrect === null || !hasAnswered;
            return true;
          })
          .map(({ detail, originalIdx }) => {
            const q = questions.find(question => question.id === detail.questionTargetId);
            const hasAnswered = detail.selectedAnswersList && Array.isArray(detail.selectedAnswersList) && detail.selectedAnswersList.length > 0;
            const isCorrect = detail.isCorrect;

            return (
              <div
                key={detail.id}
                className="card p-6 flex flex-col gap-4"
                style={{
                  borderLeft: `5px solid ${isCorrect === null || !hasAnswered ? '#94A3B8' :
                      isCorrect ? 'var(--toast-success)' : 'var(--toast-error)'
                    }`
                }}
              >
                {/* Question Index and Content */}
                <div className="flex justify-between items-start gap-4">
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.4, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ 
                      color: isCorrect ? 'var(--toast-success)' : (hasAnswered ? 'var(--toast-error)' : '#94A3B8'),
                      marginRight: '8px',
                      flexShrink: 0
                    }}>
                      Câu {originalIdx + 1}:
                    </span>
                    <div style={{ display: 'inline-block' }} dangerouslySetInnerHTML={{ __html: cleanHtmlExplanation(q?.content) }} />
                  </div>

                  {/* Score Status Tag */}
                  <div>
                    {!hasAnswered ? (
                      <span className="badge badge-warning flex items-center gap-1">
                        <AlertCircle size={14} />
                        Chưa trả lời
                      </span>
                    ) : isCorrect ? (
                      <span className="badge badge-success flex items-center gap-1">
                        <CheckCircle2 size={14} />
                        Chính xác
                      </span>
                    ) : (
                      <span className="badge badge-error flex items-center gap-1">
                        <XCircle size={14} />
                        Sai
                      </span>
                    )}
                  </div>
                </div>

                {/* Answers Options */}
                <div className="grid grid-cols-2 gap-3" style={{ paddingLeft: '1rem' }}>
                  {q?.answersList?.map((ans, aIdx) => {
                    const alphabet = String.fromCharCode(65 + aIdx);
                    const selectedList = detail.selectedAnswersList ? detail.selectedAnswersList.map(Number) : [];
                    const isUserSelected = selectedList.includes(Number(ans.id));
                    const isAnswerCorrect = ans.isCorrect;

                    let optionStyle: React.CSSProperties = {
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '0.92rem',
                      backgroundColor: '#FFFFFF'
                    };

                    if (isAnswerCorrect) {
                      optionStyle.borderColor = 'var(--toast-success)';
                      optionStyle.backgroundColor = 'rgba(82, 196, 26, 0.08)';
                      optionStyle.fontWeight = 600;
                      if (isUserSelected) {
                        optionStyle.borderWidth = '2px';
                      } else {
                        optionStyle.borderStyle = 'dashed';
                      }
                    } else if (isUserSelected && !isAnswerCorrect) {
                      optionStyle.borderColor = 'var(--toast-error)';
                      optionStyle.backgroundColor = 'rgba(255, 77, 79, 0.08)';
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
                            backgroundColor: isAnswerCorrect ? 'var(--toast-success)' : (isUserSelected ? 'var(--toast-error)' : '#F1F5F9'),
                            color: isAnswerCorrect || isUserSelected ? 'white' : 'var(--text-secondary)',
                            fontSize: '0.85rem',
                            flexShrink: 0
                          }}
                        >
                          {alphabet}
                        </div>
                        <span className="flex-1">{ans.content}</span>

                        {/* Checkmarks and Bạn chọn indicators */}
                        <div className="flex items-center gap-2" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                          {isUserSelected && (
                            <span style={{
                              fontSize: '0.75rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: isAnswerCorrect ? 'rgba(82, 196, 26, 0.15)' : 'rgba(255, 77, 79, 0.15)',
                              color: isAnswerCorrect ? 'var(--toast-success)' : 'var(--toast-error)',
                              fontWeight: 500
                            }}>
                              Bạn chọn
                            </span>
                          )}
                          {isAnswerCorrect && <CheckCircle2 size={16} style={{ color: 'var(--toast-success)' }} />}
                          {isUserSelected && !isAnswerCorrect && <XCircle size={16} style={{ color: 'var(--toast-error)' }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                {q?.explanation && (
                  <div
                    style={{
                      fontSize: '0.85rem',
                      backgroundColor: '#F8FAFC',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      marginTop: '4px',
                      borderLeft: '3px solid var(--sidebar-header)'
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Giải thích: </span>
                    <div className="explanation-content" dangerouslySetInnerHTML={{ __html: cleanHtmlExplanation(q.explanation) }} />
                  </div>
                )}

              </div>
            );
          })}
      </div>
    </div>
  );
};
