import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { FolderPlus, Trash2, ArrowLeft, FileText, Search, Edit2, Brain, Loader2, AlertCircle } from 'lucide-react';
import type { Quiz } from '../types';

interface SubjectDetailPageProps {
  subjectId: number;
}

type TabType = 'quizzes' | 'repetition' | 'syllabus';

export const SubjectDetailPage: React.FC<SubjectDetailPageProps> = ({ subjectId }) => {
  const { subjects, quizzes, createQuiz, updateQuiz, deleteQuiz, navigateTo } = useApp();
  const [subjectQuizzes, setSubjectQuizzes] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [quizName, setQuizName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('quizzes');

  // Repetition State
  const [repetitionData, setRepetitionData] = useState<any | null>(null);
  const [loadingRepetition, setLoadingRepetition] = useState(false);

  // Syllabus State
  const [syllabusData, setSyllabusData] = useState<string | null>(null);
  const [loadingSyllabus, setLoadingSyllabus] = useState(false);

  const subject = subjects.find(s => s.id === subjectId);

  useEffect(() => {
    const qzs = quizzes.filter(q => q.subjectTargetId === subjectId);
    setSubjectQuizzes(qzs);
  }, [quizzes, subjectId]);

  const fetchRepetitionData = async () => {
    if (repetitionData) return;
    setLoadingRepetition(true);
    try {
      const res = await fetch(`/api/ai/analyze-repetition/${subjectId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRepetitionData(data);
      }
    } catch (err) {
      console.error('Failed to fetch repetition analysis:', err);
    } finally {
      setLoadingRepetition(false);
    }
  };

  const fetchSyllabusData = async () => {
    if (syllabusData || !subject) return;
    setLoadingSyllabus(true);
    try {
      const res = await fetch(`/api/ai/fpt-syllabus/${subject.code}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSyllabusData(data.syllabus);
      }
    } catch (err) {
      console.error('Failed to fetch FPT syllabus:', err);
    } finally {
      setLoadingSyllabus(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'repetition') {
      fetchRepetitionData();
    } else if (activeTab === 'syllabus') {
      fetchSyllabusData();
    }
  }, [activeTab]);

  const handleSaveQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizName.trim()) return;
    if (editingQuiz) {
      await updateQuiz(editingQuiz.id, quizName.trim(), subjectId);
    } else {
      await createQuiz(quizName.trim(), subjectId);
    }
    setQuizName('');
    setEditingQuiz(null);
    setShowAddModal(false);
  };

  const handleEditClick = (quiz: Quiz) => {
    setEditingQuiz(quiz);
    setQuizName(quiz.name);
    setShowAddModal(true);
  };

  const filteredQuizzes = subjectQuizzes.filter(
    q => q.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatMarkdown = (md: string) => {
    if (!md) return '';
    return md
      .replace(/### (.*)/g, '<h4 style="font-size: 1.1rem; font-weight: 700; margin-top: 14px; margin-bottom: 6px; color: var(--primary-color)">$1</h4>')
      .replace(/## (.*)/g, '<h3 style="font-size: 1.25rem; font-weight: 700; margin-top: 18px; margin-bottom: 10px; color: var(--primary-color)">$1</h3>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight: 700; color: var(--text-main)">$1</strong>')
      .replace(/^- (.*)/gm, '<li style="margin-left: 18px; margin-bottom: 6px; list-style-type: disc; color: var(--text-secondary); line-height: 1.5">$1</li>')
      .split('\n').map(line => line.trim().startsWith('<li') ? line : `<p style="margin-bottom: 8px; color: var(--text-secondary); line-height: 1.5">${line}</p>`).join('');
  };

  if (!subject) {
    return (
      <div className="p-6">
        <button className="btn btn-secondary mb-4" onClick={() => navigateTo({ type: 'library' })}>
          <ArrowLeft size={16} /> Quay lại
        </button>
        <div>Không tìm thấy thông tin môn học.</div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto w-full h-full" style={{ height: '100%' }}>
      <div className="p-6 animate-fade-in flex flex-col gap-6">
        
        {/* Back button and title */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button 
              className="btn btn-secondary p-2" 
              style={{ borderRadius: '50%' }}
              onClick={() => navigateTo({ type: 'library' })}
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-color)' }}>{subject.code}</span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2 }}>{subject.name}</h2>
            </div>
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => {
              setEditingQuiz(null);
              setQuizName('');
              setShowAddModal(true);
            }}
          >
            <FolderPlus size={18} />
            <span>Tạo bộ đề mới</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-6" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '2px' }}>
          <button
            onClick={() => setActiveTab('quizzes')}
            style={{
              paddingBottom: '10px',
              fontWeight: 600,
              fontSize: '0.95rem',
              color: activeTab === 'quizzes' ? 'var(--primary-color)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'quizzes' ? '2px solid var(--primary-color)' : '2px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Danh sách bộ đề
          </button>
          
          <button
            onClick={() => setActiveTab('repetition')}
            style={{
              paddingBottom: '10px',
              fontWeight: 600,
              fontSize: '0.95rem',
              color: activeTab === 'repetition' ? 'var(--primary-color)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'repetition' ? '2px solid var(--primary-color)' : '2px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Phân tích lặp câu hỏi (AI)
          </button>

          <button
            onClick={() => setActiveTab('syllabus')}
            style={{
              paddingBottom: '10px',
              fontWeight: 600,
              fontSize: '0.95rem',
              color: activeTab === 'syllabus' ? 'var(--primary-color)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'syllabus' ? '2px solid var(--primary-color)' : '2px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Cẩm nang FPT Syllabus (AI)
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === 'quizzes' && (
          <>
            {/* Search Bar */}
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
                placeholder="Tìm kiếm bộ đề..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  width: '100%',
                  fontSize: '0.9rem',
                  backgroundColor: 'transparent'
                }}
              />
            </div>

            {/* List of Quizzes */}
            {filteredQuizzes.length === 0 ? (
              <div className="card flex flex-col items-center justify-center p-12" style={{ color: 'var(--text-secondary)' }}>
                <FileText size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <span style={{ fontWeight: 600 }}>Không tìm thấy bộ đề nào</span>
                <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Hãy tạo bộ đề mới để bắt đầu thêm câu hỏi ôn tập.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-6">
                {filteredQuizzes.map((quiz) => (
                  <div 
                    key={quiz.id} 
                    className="card flex flex-col justify-between"
                    style={{ cursor: 'pointer', minHeight: '140px' }}
                    onClick={() => navigateTo({ type: 'quiz-detail', quizId: quiz.id })}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.3 }}>
                          {quiz.name}
                        </h3>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn btn-secondary p-1"
                            style={{ borderRadius: '50%', color: 'var(--primary-color)', borderColor: 'transparent' }}
                            onClick={() => handleEditClick(quiz)}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="btn btn-secondary p-1"
                            style={{ borderRadius: '50%', color: 'var(--toast-error)', borderColor: 'transparent' }}
                            onClick={() => {
                              if (confirm(`Bạn có chắc chắn muốn xóa bộ đề "${quiz.name}"? Mọi câu hỏi và kết quả thi của bộ đề này cũng sẽ bị xóa.`)) {
                                deleteQuiz(quiz.id);
                              }
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div 
                      className="flex items-center gap-2" 
                      style={{ 
                        fontSize: '0.85rem', 
                        color: 'var(--text-secondary)',
                        borderTop: '1px solid var(--border-color)',
                        paddingTop: '8px',
                        marginTop: '12px'
                      }}
                    >
                      <FileText size={16} />
                      <span>Xem chi tiết câu hỏi</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'repetition' && (
          <div className="flex flex-col gap-6">
            {loadingRepetition ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 card">
                <Loader2 size={36} className="animate-spin" style={{ color: 'var(--primary-color)' }} />
                <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Đang quét ngân hàng đề thi và đo tỷ lệ lặp câu...</p>
              </div>
            ) : repetitionData ? (
              <>
                {/* Stats Summary Grid */}
                <div className="grid grid-cols-3 gap-6">
                  <div className="card flex flex-col justify-center items-center py-6 gap-1">
                    <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary-color)' }}>{repetitionData.repetitionRate}%</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Tỷ lệ lặp lại câu hỏi</span>
                  </div>
                  <div className="card flex flex-col justify-center items-center py-6 gap-1">
                    <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)' }}>{repetitionData.totalQuestions}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Tổng số câu hỏi</span>
                  </div>
                  <div className="card flex flex-col justify-center items-center py-6 gap-1">
                    <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--toast-success)' }}>{repetitionData.uniqueQuestionsCount}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Số câu hỏi duy nhất</span>
                  </div>
                </div>

                {/* AI Summary report */}
                <div className="card flex flex-col gap-3">
                  <h3 className="flex items-center gap-2" style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                    <Brain size={18} style={{ color: 'var(--primary-color)' }} />
                    Báo cáo Phân tích từ AI
                  </h3>
                  <div
                    className="markdown-body"
                    dangerouslySetInnerHTML={{ __html: formatMarkdown(repetitionData.aiSummary) }}
                  />
                </div>

                {/* Duplicates List */}
                <div className="card flex flex-col gap-4">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Danh sách câu hỏi trùng lặp</h3>
                  {repetitionData.duplicatesList.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Không phát hiện thấy câu hỏi nào bị trùng lặp.</div>
                  ) : (
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th style={{ width: '60%' }}>Nội dung câu hỏi trùng</th>
                            <th style={{ width: '30%' }}>Các đề chứa câu này</th>
                            <th style={{ width: '10%', textAlign: 'center' }}>Số lần lặp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {repetitionData.duplicatesList.map((dup: any, idx: number) => (
                            <tr key={idx}>
                              <td style={{ fontSize: '0.85rem', verticalAlign: 'top' }}>{dup.text}</td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', verticalAlign: 'top' }}>
                                {dup.quizzes.join(', ')}
                              </td>
                              <td style={{ fontWeight: 700, color: 'var(--primary-color)', textAlign: 'center', verticalAlign: 'top' }}>
                                {dup.occurrences}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="card flex flex-col items-center justify-center p-12 gap-2 text-danger">
                <AlertCircle size={48} />
                <span style={{ fontWeight: 600 }}>Không tải được báo cáo trùng đề</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'syllabus' && (
          <div className="card flex flex-col gap-4" style={{ minHeight: '300px' }}>
            <h3 className="flex items-center gap-2" style={{ fontSize: '1.2rem', fontWeight: 800, borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <Brain size={18} style={{ color: 'var(--primary-color)' }} />
              Đúc kết Giáo trình & Cẩm nang ôn thi FPT
            </h3>

            {loadingSyllabus ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3" style={{ flex: 1 }}>
                <Loader2 size={36} className="animate-spin" style={{ color: 'var(--primary-color)' }} />
                <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>AI đang tổng hợp syllabus và bí kíp ôn thi môn {subject.code}...</p>
              </div>
            ) : syllabusData ? (
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: formatMarkdown(syllabusData) }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-danger" style={{ flex: 1 }}>
                <AlertCircle size={48} />
                <span style={{ fontWeight: 600 }}>Không tải được syllabus của môn học này</span>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Add/Edit Quiz Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                {editingQuiz ? 'Chỉnh sửa bộ đề' : 'Tạo bộ đề mới'}
              </h3>
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  setEditingQuiz(null);
                  setQuizName('');
                }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveQuiz}>
              <div className="form-group">
                <label className="form-label">Tên bộ đề trắc nghiệm (Ví dụ: Đề cương giữa kỳ, Quiz 1)</label>
                <input 
                  type="text" 
                  className="input"
                  required
                  placeholder="Nhập tên bộ đề..." 
                  value={quizName}
                  onChange={(e) => setQuizName(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingQuiz(null);
                    setQuizName('');
                  }}
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                >
                  {editingQuiz ? 'Lưu thay đổi' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
