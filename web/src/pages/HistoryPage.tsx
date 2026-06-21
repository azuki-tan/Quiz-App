import React from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { History, Trash2, Eye, Award } from 'lucide-react';

export const HistoryPage: React.FC = () => {
  const { subjects, quizzes, sessions, deleteSession, navigateTo, loadData } = useApp();
  const { currentUser } = useAuth();
  
  React.useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = currentUser?.isAdmin ?? false;

  // Filter only exam sessions
  const examSessions = sessions.filter(s => s.learningMode === 'exam');

  return (
    <div className="p-6 animate-fade-in flex flex-col gap-6 overflow-y-auto" style={{ height: '100%' }}>
      {/* Title */}
      <div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '4px' }}>Lịch sử thi cử</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Xem danh sách và kết quả chi tiết các kỳ thi trắc nghiệm đã thực hiện.</p>
      </div>

      {/* History board */}
      <div className="card flex-1 flex flex-col gap-4 overflow-hidden" style={{ minHeight: '300px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }} className="flex items-center gap-2">
          <Award size={20} style={{ color: 'var(--primary-color)' }} />
          Lịch sử các phiên thi cử
        </h3>

        {examSessions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center" style={{ color: 'var(--text-secondary)' }}>
            <History size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <span style={{ fontSize: '1.05rem', fontWeight: 600 }}>Chưa có lịch sử thi cử</span>
            <p style={{ fontSize: '0.85rem', marginTop: '4px', maxWidth: '300px' }}>
              Bạn chưa thực hiện bài thi nào. Hãy vào mục "Học tập" và bắt đầu một phiên thi cử!
            </p>
          </div>
        ) : (
          <div className="table-container flex-1 overflow-y-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Môn học</th>
                  <th>Bộ đề thi</th>
                  {isAdmin && <th>Người thi</th>}
                  <th>Số câu trả lời</th>
                  <th>Tỉ lệ đúng</th>
                  <th>Ngày thi</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {examSessions.map(s => {
                  const qz = quizzes.find(q => q.id === s.quizTargetId);
                  const subj = qz ? subjects.find(sub => sub.id === qz.subjectTargetId) : null;
                  
                  const hasScore = s.totalCorrect !== null && s.totalCorrect !== undefined;
                  const total = hasScore ? (s.totalCorrect! + s.totalWrong!) : 0;
                  const scorePercent = hasScore && total > 0 ? Math.round((s.totalCorrect! / total) * 100) : 0;
                  
                  // Hide review details button if not admin and allowReview is disabled (or showScore is disabled)
                  const showReviewBtn = isAdmin || (s.allowReview !== 0 && hasScore);
                  
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>
                        {subj ? `${subj.code} - ${subj.name}` : 'Không rõ'}
                      </td>
                      <td>{qz?.name || `Bộ đề #${s.quizTargetId}`}</td>
                      {isAdmin && (
                        <td>
                          <div style={{ fontWeight: 600 }}>{s.userName || '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {s.userMssv ? `MSSV: ${s.userMssv}` : (s.userEmail || '—')}
                          </div>
                        </td>
                      )}
                      <td>
                        {hasScore ? `${s.totalCorrect} / ${total} câu` : 'Đã hoàn thành'}
                      </td>
                      <td style={{ fontWeight: 700, color: hasScore ? (scorePercent >= 50 ? 'var(--toast-success)' : 'var(--toast-error)') : 'var(--text-secondary)' }}>
                        {hasScore ? `${scorePercent}%` : 'Đã ẩn'}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {new Date(s.startTime).toLocaleString('vi-VN')}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button 
                            className="btn btn-secondary py-1 px-3 flex items-center gap-1"
                            style={{ fontSize: '0.8rem' }}
                            onClick={() => navigateTo({ type: 'learning-result', sessionTokenOrId: s.sessionToken || String(s.id) })}
                          >
                            <Award size={14} />
                            <span>Kết quả</span>
                          </button>
                          
                          {showReviewBtn && (
                            <button 
                              className="btn btn-secondary py-1 px-3 flex items-center gap-1"
                              style={{ fontSize: '0.8rem' }}
                              onClick={() => navigateTo({ type: 'learning-review', sessionTokenOrId: s.sessionToken || String(s.id) })}
                            >
                              <Eye size={14} />
                              <span>Chi tiết</span>
                            </button>
                          )}
 
                          <button 
                            className="btn btn-secondary py-1 px-2 text-danger flex items-center gap-1"
                            style={{ fontSize: '0.8rem', color: 'var(--toast-error)', borderColor: 'transparent' }}
                            onClick={() => {
                              if (confirm('Bạn chắc chắn muốn xóa lịch sử thi này?')) {
                                deleteSession(s.id);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                            <span>Xóa</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
