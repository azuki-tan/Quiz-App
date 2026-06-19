import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { BookOpen, Plus, Trash2, FolderOpen, Search, Edit2 } from 'lucide-react';
import type { Subject } from '../types';

export const LibraryPage: React.FC = () => {
  const { subjects, quizzes, createSubject, updateSubject, deleteSubject, navigateTo } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectCode.trim() || !subjectName.trim()) return;
    if (editingSubject) {
      await updateSubject(editingSubject.id, subjectCode.toUpperCase().trim(), subjectName.trim());
    } else {
      await createSubject(subjectCode.toUpperCase().trim(), subjectName.trim());
    }
    setSubjectCode('');
    setSubjectName('');
    setEditingSubject(null);
    setShowAddModal(false);
  };

  const handleEditClick = (subject: Subject) => {
    setEditingSubject(subject);
    setSubjectCode(subject.code);
    setSubjectName(subject.name);
    setShowAddModal(true);
  };

  const filteredSubjects = subjects.filter(
    s => 
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="overflow-y-auto w-full h-full" style={{ height: '100%' }}>
      <div className="p-6 animate-fade-in flex flex-col gap-6">
        {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '4px' }}>Thư viện môn học</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Quản lý ngân hàng môn học và các bộ đề trắc nghiệm.</p>
        </div>
        <button 
          className="btn btn-primary"
          onClick={() => { setEditingSubject(null); setSubjectCode(''); setSubjectName(''); setShowAddModal(true); }}
        >
          <Plus size={18} />
          <span>Thêm môn học</span>
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
          placeholder="Tìm kiếm môn học..." 
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

      {/* Grid List of Subjects */}
      {filteredSubjects.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12" style={{ color: 'var(--text-secondary)' }}>
          <FolderOpen size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <span style={{ fontWeight: 600 }}>Không tìm thấy môn học nào</span>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Hãy bắt đầu bằng cách thêm một môn học mới.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {filteredSubjects.map((subject) => {
            const subjectQuizzes = quizzes.filter(q => q.subjectTargetId === subject.id);
            return (
              <div 
                key={subject.id} 
                className="card flex flex-col justify-between"
                style={{ cursor: 'pointer', minHeight: '160px' }}
                onClick={() => navigateTo({ type: 'subject-detail', subjectId: subject.id })}
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
                      {subject.code}
                    </span>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-secondary p-1"
                        style={{ borderRadius: '50%', color: 'var(--primary-color)', borderColor: 'transparent' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(subject);
                        }}
                        title="Chỉnh sửa môn học"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="btn btn-secondary p-1"
                        style={{ borderRadius: '50%', color: 'var(--toast-error)', borderColor: 'transparent' }}
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent navigating
                          if (confirm(`Bạn có chắc chắn muốn xóa môn học ${subject.code}? Mọi bộ đề thuộc môn học này cũng sẽ bị xóa.`)) {
                            deleteSubject(subject.id);
                          }
                        }}
                        title="Xóa môn học"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px', lineHeight: 1.3 }}>
                    {subject.name}
                  </h3>
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
                  <BookOpen size={16} />
                  <span>{subjectQuizzes.length} bộ đề trắc nghiệm</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Add/Edit Subject Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">{editingSubject ? 'Chỉnh sửa môn học' : 'Thêm môn học mới'}</h3>
              <button 
                onClick={() => { setShowAddModal(false); setEditingSubject(null); }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold' }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveSubject}>
              <div className="form-group">
                <label className="form-label">Mã môn học (Ví dụ: SWE301, MAD101)</label>
                <input 
                  type="text" 
                  className="input"
                  required
                  placeholder="Nhập mã môn học..." 
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Tên môn học</label>
                <input 
                  type="text" 
                  className="input"
                  required
                  placeholder="Nhập tên môn học..." 
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => { setShowAddModal(false); setEditingSubject(null); }}
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                >
                  {editingSubject ? 'Lưu thay đổi' : 'Lưu lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
