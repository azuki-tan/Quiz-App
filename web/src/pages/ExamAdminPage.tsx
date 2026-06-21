import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { Exam, Quiz, Subject } from '../types';
import { Calendar, Plus, Trash2, Edit2, UserCheck, ClipboardList } from 'lucide-react';

interface AppUser {
  id: number;
  email: string;
  name: string;
  mssv: string;
  is_active: number;
}

export const ExamAdminPage: React.FC = () => {
  const { exams, quizzes, subjects, createExam, updateExam, deleteExam, createQuiz, sessions, deleteSession, loadData } = useApp();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);

  const [showResultsModal, setShowResultsModal] = useState(false);
  const [selectedExamForResults, setSelectedExamForResults] = useState<Exam | null>(null);

  const getExamStatus = (exam: Exam) => {
    const now = new Date();
    const open = new Date(exam.timeOpen);
    const end = new Date(exam.timeEnd);
    if (now < open) {
      return { text: 'Chưa mở', color: '#d97706', bg: '#fef3c7' }; // Orange
    } else if (now > end) {
      return { text: 'Đã đóng', color: '#dc2626', bg: '#fef2f2' }; // Red
    } else {
      return { text: 'Đang mở', color: '#16a34a', bg: '#dcfce7' }; // Green
    }
  };

  const renderOpenCode = (exam: Exam) => {
    const now = new Date();
    const open = new Date(exam.timeOpen);
    const end = new Date(exam.timeEnd);
    if (now < open) {
      return (
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          Chưa đến giờ
        </span>
      );
    } else if (now > end) {
      return (
        <span style={{ fontSize: '0.85rem', color: '#dc2626', fontStyle: 'italic', fontWeight: 600 }}>
          Đã hết giờ
        </span>
      );
    } else {
      return (
        <code style={{
          fontSize: '1rem', fontWeight: 700, backgroundColor: '#f1f5f9',
          padding: '4px 8px', borderRadius: '4px', color: '#1e293b', border: '1px solid #cbd5e1'
        }}>
          {exam.openCode || '—'}
        </code>
      );
    }
  };

  const handleViewResults = async (exam: Exam) => {
    setSelectedExamForResults(exam);
    setShowResultsModal(true);
    try {
      await loadData();
    } catch (e) {
      console.error('Failed to reload sessions:', e);
    }
  };

  const handleDeleteSession = async (sessionId: number) => {
    if (confirm('Bạn có chắc chắn muốn xóa lượt làm bài này không? Hành động này sẽ cho phép thí sinh thực hiện lại bài thi.')) {
      try {
        await deleteSession(sessionId);
        await loadData();
      } catch (err: any) {
        alert(err.message || 'Lỗi khi xóa lượt làm bài.');
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}p ${secs}s`;
  };

  // Form Fields
  const [examCode, setExamCode] = useState('');
  const [quizTargetId, setQuizTargetId] = useState<number | ''>('');
  const [isCreateNewQuiz, setIsCreateNewQuiz] = useState(false);
  const [newQuizName, setNewQuizName] = useState('');
  const [newQuizSubjectId, setNewQuizSubjectId] = useState<number | ''>('');

  const [useSeb, setUseSeb] = useState(false);
  const [durationTime, setDurationTime] = useState(60);
  const [attemptsAllowed, setAttemptsAllowed] = useState(1);
  const [timeOpen, setTimeOpen] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [openCode, setOpenCode] = useState('');
  const [allowedUsersInput, setAllowedUsersInput] = useState(''); // comma/newline separated
  const [showScore, setShowScore] = useState(true);
  const [allowReview, setAllowReview] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch users to aid multi-select click-to-add
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await fetch('/api/users', { credentials: 'include' });
        if (res.ok) {
          setUsers(await res.json());
        }
      } catch (e) {
        console.error('Failed to load users:', e);
      }
    };
    loadUsers();
  }, []);

  const handleEditClick = (exam: Exam) => {
    setEditingExam(exam);
    setExamCode(exam.examCode);
    setQuizTargetId(exam.quizTargetId);
    setIsCreateNewQuiz(false);
    setNewQuizName('');
    setNewQuizSubjectId('');

    setUseSeb(exam.useSeb === 1);
    setDurationTime(exam.durationTime);
    setAttemptsAllowed(exam.attemptsAllowed);
    
    // Format dates to YYYY-MM-DDTHH:MM
    const formatForDatetimeLocal = (iso: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setTimeOpen(formatForDatetimeLocal(exam.timeOpen));
    setTimeEnd(formatForDatetimeLocal(exam.timeEnd));
    setOpenCode(exam.openCode || '');
    
    let parsedUsers: string[] = [];
    try {
      parsedUsers = JSON.parse(exam.allowedUsers) || [];
    } catch {
      parsedUsers = [];
    }
    setAllowedUsersInput(parsedUsers.join(', '));
    setShowScore(exam.showScore === 1);
    setAllowReview(exam.allowReview === 1);
    setErrorMsg('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examCode.trim() || !timeOpen || !timeEnd) {
      setErrorMsg('Vui lòng nhập đầy đủ thông tin Exam Code và thời gian mở/đóng.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      let finalQuizId = quizTargetId;

      // Handle creation of new quiz marked as exam only
      if (isCreateNewQuiz) {
        if (!newQuizName.trim() || !newQuizSubjectId) {
          setErrorMsg('Vui lòng điền Tên đề thi mới và Môn học.');
          setSaving(false);
          return;
        }
        const createdId = await createQuiz(newQuizName.trim(), Number(newQuizSubjectId), 1); // 1 = isExamOnly
        finalQuizId = createdId;
      }

      if (!finalQuizId) {
        setErrorMsg('Vui lòng chọn Bộ đề thi.');
        setSaving(false);
        return;
      }

      // Clean list of allowed users
      const cleanAllowed = allowedUsersInput
        .split(/[,\n]/)
        .map(u => u.trim())
        .filter(u => u.length > 0);

      const examData: Exam = {
        id: editingExam?.id,
        examCode: examCode.trim(),
        quizTargetId: Number(finalQuizId),
        useSeb: useSeb ? 1 : 0,
        durationTime: Number(durationTime),
        attemptsAllowed: Number(attemptsAllowed),
        timeOpen: new Date(timeOpen).toISOString(),
        timeEnd: new Date(timeEnd).toISOString(),
        openCode: openCode.trim() || undefined, // backend will generate if empty
        allowedUsers: JSON.stringify(cleanAllowed),
        showScore: showScore ? 1 : 0,
        allowReview: (showScore && allowReview) ? 1 : 0,
      };

      if (editingExam) {
        await updateExam(examData);
      } else {
        await createExam(examData);
      }

      setShowModal(false);
      resetForm();
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi lưu thông tin đợt thi.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = async (examId: number, code: string) => {
    if (confirm(`Bạn có chắc muốn xóa đợt thi "${code}" không? Thao tác này không thể hoàn tác.`)) {
      try {
        await deleteExam(examId);
      } catch (err: any) {
        alert(err.message || 'Lỗi khi xóa đợt thi.');
      }
    }
  };

  const resetForm = () => {
    setEditingExam(null);
    setExamCode('');
    setQuizTargetId('');
    setIsCreateNewQuiz(false);
    setNewQuizName('');
    setNewQuizSubjectId('');
    setUseSeb(false);
    setDurationTime(60);
    setAttemptsAllowed(1);
    setTimeOpen('');
    setTimeEnd('');
    setOpenCode('');
    setAllowedUsersInput('');
    setShowScore(true);
    setAllowReview(true);
    setErrorMsg('');
  };

  const handleAddUserTag = (identifier: string) => {
    const cleanList = allowedUsersInput
      .split(',')
      .map(u => u.trim())
      .filter(u => u.length > 0);
    
    if (!cleanList.includes(identifier)) {
      cleanList.push(identifier);
      setAllowedUsersInput(cleanList.join(', '));
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="overflow-y-auto w-full h-full" style={{ height: '100%' }}>
      <div className="p-6 animate-fade-in flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div style={{
              width: '42px', height: '42px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Calendar size={22} color="white" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Quản lý Kỳ thi (Exams)</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
                Quản lý các đợt thi khảo thí chính thức, cấu hình SEB, giới hạn giờ thi và cài đặt ẩn/hiện kết quả.
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => { resetForm(); setShowModal(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={18} /> Lên lịch đợt thi
          </button>
        </div>

        {/* Stats */}
        <div className="card p-4 flex items-center gap-3" style={{ borderLeft: '4px solid #d97706' }}>
          <UserCheck size={20} style={{ color: '#d97706' }} />
          <span style={{ fontWeight: 600 }}>
            {exams.length} đợt thi hiện có trên hệ thống
          </span>
        </div>

        {/* List Grid */}
        {exams.length === 0 ? (
          <div className="card flex flex-col items-center justify-center p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
            <Calendar size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <span style={{ fontWeight: 600 }}>Chưa có đợt thi nào được cấu hình</span>
            <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
              Hãy nhấp vào "Lên lịch đợt thi" để tạo mới đợt thi khảo thí của bạn.
            </p>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--bg-content)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Exam Code</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Đề thi</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Mở - Đóng phòng</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Thời lượng</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Trạng thái</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Cài đặt</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Mã mở đề</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>SL Thí sinh</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((exam: Exam) => {
                    const quiz = quizzes.find(q => q.id === exam.quizTargetId);
                    let allowedList: string[] = [];
                    try {
                      allowedList = JSON.parse(exam.allowedUsers) || [];
                    } catch {
                      allowedList = [];
                    }

                    return (
                      <tr
                        key={exam.id}
                        style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#b45309' }}>{exam.examCode}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                          <div style={{ fontWeight: 600 }}>{quiz ? quiz.name : `Quiz #${exam.quizTargetId}`}</div>
                          {quiz?.isExamOnly === 1 && (
                            <span style={{
                              fontSize: '0.72rem', backgroundColor: '#fee2e2', color: '#ef4444',
                              padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '4px', fontWeight: 600
                            }}>
                              Exam Only (Ẩn ôn luyện)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <div>Mở: {formatDate(exam.timeOpen)}</div>
                          <div>Đóng: {formatDate(exam.timeEnd)}</div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 600 }}>
                          {exam.durationTime} phút
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {(() => {
                            const status = getExamStatus(exam);
                            return (
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontWeight: 600,
                                fontSize: '0.78rem',
                                color: status.color,
                                backgroundColor: status.bg,
                                display: 'inline-block'
                              }}>
                                {status.text}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.75rem' }}>
                          <div className="flex flex-col gap-1 items-start">
                            <span style={{
                              padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
                              backgroundColor: exam.useSeb === 1 ? '#dbeafe' : '#f1f5f9',
                              color: exam.useSeb === 1 ? '#1d4ed8' : '#64748b'
                            }}>
                              SEB: {exam.useSeb === 1 ? 'Bắt buộc' : 'Bỏ qua'}
                            </span>
                            <span style={{
                              padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
                              backgroundColor: exam.showScore === 1 ? '#dcfce7' : '#fee2e2',
                              color: exam.showScore === 1 ? '#15803d' : '#ef4444'
                            }}>
                              Điểm: {exam.showScore === 1 ? 'Hiển thị' : 'Ẩn'}
                            </span>
                            {exam.showScore === 1 && (
                              <span style={{
                                padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
                                backgroundColor: exam.allowReview === 1 ? '#e0e7ff' : '#fef3c7',
                                color: exam.allowReview === 1 ? '#4338ca' : '#d97706'
                              }}>
                                Xem bài: {exam.allowReview === 1 ? 'Cho phép' : 'Chặn'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {renderOpenCode(exam)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>
                          {allowedList.length} thí sinh
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div className="flex gap-2 justify-center">
                            <button
                              className="btn btn-secondary p-1"
                              style={{ borderColor: 'transparent', color: '#10b981' }}
                              onClick={() => handleViewResults(exam)}
                              title="Xem kết quả"
                            >
                              <ClipboardList size={16} />
                            </button>
                            <button
                              className="btn btn-secondary p-1"
                              style={{ borderColor: 'transparent', color: 'var(--primary-color)' }}
                              onClick={() => handleEditClick(exam)}
                              title="Chỉnh sửa đợt thi"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className="btn btn-secondary p-1"
                              style={{ borderColor: 'transparent', color: 'var(--toast-error)' }}
                              onClick={() => handleDeleteClick(exam.id!, exam.examCode)}
                              title="Xóa đợt thi"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px', width: '90%' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingExam ? 'Chỉnh sửa đợt thi' : 'Lên lịch đợt thi mới'}</h3>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold' }}
              >&times;</button>
            </div>
            
            <form onSubmit={handleSave}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '6px' }}>
                
                {/* Exam Code & Code Mở đề */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Exam Code <span style={{ color: 'var(--toast-error)' }}>*</span></label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ví dụ: MAD101_PE_S26"
                      required
                      value={examCode}
                      onChange={e => setExamCode(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mã mở đề (Open Code)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Để trống để random 3 chữ số"
                      maxLength={10}
                      value={openCode}
                      onChange={e => setOpenCode(e.target.value)}
                    />
                  </div>
                </div>

                {/* Quiz Selection Target */}
                <div style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="checkbox"
                      id="createNewQuizCheck"
                      checked={isCreateNewQuiz}
                      onChange={e => setIsCreateNewQuiz(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="createNewQuizCheck" style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                      Tạo một Bộ đề thi mới hoàn toàn (Exam Only)
                    </label>
                  </div>

                  {isCreateNewQuiz ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                      <div className="form-group">
                        <label className="form-label">Tên bộ đề mới <span style={{ color: 'var(--toast-error)' }}>*</span></label>
                        <input
                          type="text"
                          className="input"
                          placeholder="Ví dụ: Đề thi PE Học kỳ Spring 2026"
                          value={newQuizName}
                          onChange={e => setNewQuizName(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Thuộc Môn học <span style={{ color: 'var(--toast-error)' }}>*</span></label>
                        <select
                          className="input"
                          value={newQuizSubjectId}
                          onChange={e => setNewQuizSubjectId(e.target.value ? Number(e.target.value) : '')}
                        >
                          <option value="">-- Chọn môn học --</option>
                          {subjects.map((sub: Subject) => (
                            <option key={sub.id} value={sub.id}>{sub.code} - {sub.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">Chọn Bộ đề thi có sẵn <span style={{ color: 'var(--toast-error)' }}>*</span></label>
                      <select
                        className="input"
                        value={quizTargetId}
                        onChange={e => setQuizTargetId(e.target.value ? Number(e.target.value) : '')}
                      >
                        <option value="">-- Chọn bộ đề --</option>
                        {quizzes.map((q: Quiz) => {
                          const subj = subjects.find(s => s.id === q.subjectTargetId);
                          return (
                            <option key={q.id} value={q.id}>
                              [{subj?.code || 'MON'}] {q.name} {q.isExamOnly === 1 ? '(Exam Only)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                {/* Duration & Attempts */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Thời lượng làm bài (phút) <span style={{ color: 'var(--toast-error)' }}>*</span></label>
                    <input
                      type="number"
                      className="input"
                      min={5}
                      max={180}
                      required
                      value={durationTime}
                      onChange={e => setDurationTime(Number(e.target.value))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Số lượt thi tối đa <span style={{ color: 'var(--toast-error)' }}>*</span></label>
                    <input
                      type="number"
                      className="input"
                      min={1}
                      max={10}
                      required
                      value={attemptsAllowed}
                      onChange={e => setAttemptsAllowed(Number(e.target.value))}
                    />
                  </div>
                </div>

                {/* Open & Close time limits */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label className="form-label">Thời gian mở phòng thi <span style={{ color: 'var(--toast-error)' }}>*</span></label>
                    <input
                      type="datetime-local"
                      className="input"
                      required
                      value={timeOpen}
                      onChange={e => setTimeOpen(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Thời gian đóng phòng thi <span style={{ color: 'var(--toast-error)' }}>*</span></label>
                    <input
                      type="datetime-local"
                      className="input"
                      required
                      value={timeEnd}
                      onChange={e => setTimeEnd(e.target.value)}
                    />
                  </div>
                </div>

                {/* Allowed Users input */}
                <div className="form-group">
                  <label className="form-label">Danh sách Thí sinh được phép thi (Email hoặc MSSV)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Nhập mssv hoặc email, phân tách bằng dấu phẩy hoặc dòng mới. Ví dụ: SE123456, test@fpt.edu.vn"
                    value={allowedUsersInput}
                    onChange={e => setAllowedUsersInput(e.target.value)}
                  />
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Chỉ thí sinh nằm trong danh sách này mới có thể đăng nhập kỳ thi qua cổng EOS.
                  </p>

                  {/* Registered Users Picker shortcut */}
                  {users.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Click nhanh để thêm thí sinh đăng ký:</span>
                      <div style={{
                        display: 'flex', gap: '6px', flexWrap: 'wrap', maxHeight: '90px', overflowY: 'auto',
                        padding: '6px', border: '1px dashed #cbd5e1', borderRadius: '6px', marginTop: '4px'
                      }}>
                        {users.map(u => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => handleAddUserTag(u.mssv || u.email)}
                            style={{
                              fontSize: '0.72rem', backgroundColor: '#e2e8f0', border: 'none',
                              borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontWeight: 500
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#cbd5e1'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                          >
                            {u.name} ({u.mssv || u.email.split('@')[0]})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Policies Toggles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      id="useSebCheck"
                      checked={useSeb}
                      onChange={e => setUseSeb(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="useSebCheck" style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                      Yêu cầu chạy Safe Exam Browser (SEB) bắt buộc
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      id="showScoreCheck"
                      checked={showScore}
                      onChange={e => {
                        setShowScore(e.target.checked);
                        if (!e.target.checked) setAllowReview(false);
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="showScoreCheck" style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                      Cho phép thí sinh xem điểm ngay sau khi thi xong
                    </label>
                  </div>

                  {showScore && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '20px' }}>
                      <input
                        type="checkbox"
                        id="allowReviewCheck"
                        checked={allowReview}
                        onChange={e => setAllowReview(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor="allowReviewCheck" style={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        Cho phép thí sinh xem lại bài làm chi tiết (đúng/sai từng câu)
                      </label>
                    </div>
                  )}
                </div>

              </div>

              {errorMsg && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px',
                  background: '#fef2f2', border: '1px solid #fecaca',
                  color: '#dc2626', fontSize: '0.875rem', margin: '12px 0', marginTop: '14px'
                }}>
                  {errorMsg}
                </div>
              )}

              <div className="modal-footer" style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : (editingExam ? 'Lưu thay đổi' : 'Tạo đợt thi')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Results Modal */}
      {showResultsModal && selectedExamForResults && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px', width: '95%' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                Kết quả đợt thi: <span style={{ color: '#d97706' }}>{selectedExamForResults.examCode}</span>
              </h3>
              <button
                onClick={() => { setShowResultsModal(false); setSelectedExamForResults(null); }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold' }}
              >&times;</button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto', padding: '10px 0' }}>
              {(() => {
                const examSessions = sessions.filter(s => s.quizTargetId === selectedExamForResults.quizTargetId && s.learningMode === 'exam');
                if (examSessions.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                      <ClipboardList size={40} style={{ opacity: 0.3, marginBottom: '8px' }} />
                      <p style={{ fontWeight: 600 }}>Chưa có lượt thi nào thực hiện</p>
                    </div>
                  );
                }

                return (
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-content)', borderBottom: '2px solid var(--border-color)' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>Thí sinh</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>Bắt đầu</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>Thời gian làm</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>Trạng thái</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>Điểm số</th>
                          <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {examSessions.map(s => {
                          const totalQuestions = s.totalCorrect + s.totalWrong;
                          const scorePercent = totalQuestions > 0 ? ((s.totalCorrect / totalQuestions) * 10).toFixed(2) : '0.00';
                          
                          return (
                            <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: 600 }}>{s.userName || '—'}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.userMssv || s.userEmail || '—'}</div>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.8rem' }}>
                                {formatDate(s.startTime)}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                {formatDuration(s.studyTime)}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <span style={{
                                  padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                                  backgroundColor: s.isCompleted ? '#dcfce7' : '#dbeafe',
                                  color: s.isCompleted ? '#15803d' : '#1d4ed8'
                                }}>
                                  {s.isCompleted ? 'Đã nộp bài' : 'Đang làm...'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>
                                {s.isCompleted ? (
                                  <span style={{ color: '#15803d' }}>
                                    {scorePercent} / 10 ({s.totalCorrect}/{totalQuestions})
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <button
                                  className="btn btn-secondary p-1"
                                  style={{ borderColor: 'transparent', color: 'var(--toast-error)', cursor: 'pointer' }}
                                  onClick={() => handleDeleteSession(s.id)}
                                  title="Xóa lượt thi (Cho thi lại)"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setShowResultsModal(false); setSelectedExamForResults(null); }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
