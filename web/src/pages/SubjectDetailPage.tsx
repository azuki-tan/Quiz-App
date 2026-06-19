import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { FolderPlus, Trash2, ArrowLeft, FileText, Search, Edit2 } from 'lucide-react';
import type { Quiz } from '../types';

interface SubjectDetailPageProps {
  subjectId: number;
}

export const SubjectDetailPage: React.FC<SubjectDetailPageProps> = ({ subjectId }) => {
  const { subjects, quizzes, createQuiz, updateQuiz, deleteQuiz, navigateTo } = useApp();
  const [subjectQuizzes, setSubjectQuizzes] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [quizName, setQuizName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const subject = subjects.find(s => s.id === subjectId);

  useEffect(() => {
    // Filter quizzes belonging to this subject
    const qzs = quizzes.filter(q => q.subjectTargetId === subjectId);
    setSubjectQuizzes(qzs);
  }, [quizzes, subjectId]);

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
