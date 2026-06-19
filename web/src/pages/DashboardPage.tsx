import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  Trophy, 
  BookOpen, 
  FileText, 
  History,
  GraduationCap
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { subjects, quizzes, sessions, navigateTo } = useApp();

  // Calculate stats
  const totalSessions = sessions.length;
  
  // Calculate average accuracy
  let totalCorrect = 0;
  let totalAnswered = 0;
  sessions.forEach(s => {
    totalCorrect += s.totalCorrect;
    totalAnswered += (s.totalCorrect + s.totalWrong);
  });
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  // Calculate 7 days statistics
  const get7DaysData = () => {
    const days = [];
    const counts = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateString = d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' });
      days.push(dateString);

      // Find sessions started on this day
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime();
      const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();

      let dayCount = 0;
      sessions.forEach(s => {
        const sTime = new Date(s.startTime).getTime();
        if (sTime >= startOfDay && sTime <= endOfDay) {
          dayCount += (s.totalCorrect + s.totalWrong);
        }
      });
      counts.push(dayCount);
    }
    return { days, counts };
  };

  const { days, counts } = get7DaysData();
  const maxCount = Math.max(...counts, 5); // default height scale at least 5

  return (
    <div className="p-6 animate-fade-in flex flex-col gap-6 overflow-y-auto" style={{ height: '100%' }}>
      {/* Title */}
      <div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '4px' }}>Bảng điều khiển</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Chào mừng bạn quay trở lại! Cùng ôn tập kiến thức hôm nay nào.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* Accuracy */}
        <div className="card flex items-center gap-4">
          <div className="flex items-center justify-center" style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(82, 196, 26, 0.15)', color: 'var(--toast-success)' }}>
            <Trophy size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{accuracy}%</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tỉ lệ trả lời đúng</div>
          </div>
        </div>

        {/* Subjects */}
        <div className="card flex items-center gap-4">
          <div className="flex items-center justify-center" style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(1, 117, 194, 0.15)', color: 'var(--primary-color)' }}>
            <BookOpen size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{subjects.length}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Môn học đã tạo</div>
          </div>
        </div>

        {/* Quizzes */}
        <div className="card flex items-center gap-4">
          <div className="flex items-center justify-center" style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(250, 173, 20, 0.15)', color: 'var(--toast-warning)' }}>
            <FileText size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{quizzes.length}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Bộ đề câu hỏi</div>
          </div>
        </div>

        {/* Sessions */}
        <div className="card flex items-center gap-4">
          <div className="flex items-center justify-center" style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: 'rgba(24, 144, 255, 0.15)', color: 'var(--toast-info)' }}>
            <History size={24} />
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalSessions}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Lượt học tập</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Chart Card */}
        <div className="card grid-span-2 flex flex-col justify-between" style={{ gridColumn: 'span 2' }}>
          <div className="mb-4">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Tiến độ học tập 7 ngày qua</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Số câu hỏi đã hoàn thành hàng ngày</p>
          </div>
          {/* Custom SVG Bar Chart */}
          <div className="flex flex-col flex-1 justify-end" style={{ height: '200px', paddingBottom: '10px' }}>
            <div className="flex items-end justify-between flex-1 gap-4" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              {counts.map((count, idx) => {
                const heightPercent = (count / maxCount) * 100;
                return (
                  <div key={idx} className="flex flex-col items-center flex-1 group" style={{ position: 'relative' }}>
                    {/* Tooltip */}
                    <div 
                      className="absolute bg-slate-800 text-white rounded text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      style={{ 
                        bottom: `calc(${heightPercent}% + 15px)`,
                        backgroundColor: '#1E293B',
                        color: '#FFFFFF',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        pointerEvents: 'none',
                        zIndex: 10,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {count} câu hỏi
                    </div>
                    {/* Bar */}
                    <div 
                      style={{ 
                        height: `${Math.max(heightPercent, 2)}%`, // min height to show bar
                        width: '100%',
                        maxWidth: '36px',
                        backgroundColor: count > 0 ? 'var(--primary-color)' : '#E2E8F0',
                        borderRadius: '6px 6px 0 0',
                        transition: 'height 0.5s ease-out'
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {/* X-Axis Labels */}
            <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {days.map((day, idx) => (
                <div key={idx} className="flex-1 text-center" style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                  {day}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Info Card / Quick links */}
        <div className="card flex flex-col justify-between">
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '10px' }}>Ôn tập nhanh</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
              Bắt đầu một phiên luyện tập mới ngay lập tức để kiểm tra kiến thức của bạn.
            </p>
          </div>
          <button 
            className="btn btn-primary w-full flex items-center justify-center gap-2 py-3"
            onClick={() => navigateTo({ type: 'learning' })}
          >
            <GraduationCap size={18} />
            <span>Vào Học Ngay</span>
          </button>
        </div>
      </div>

      {/* Recent Sessions Table */}
      <div className="card">
        <h3 className="mb-4" style={{ fontSize: '1.1rem', fontWeight: 700 }}>Phiên học gần đây</h3>
        
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6" style={{ color: 'var(--text-secondary)' }}>
            <History size={40} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <span>Chưa thực hiện phiên học nào.</span>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Bộ Đề</th>
                  <th>Chế Độ</th>
                  <th>Số Câu Trả Lời</th>
                  <th>Tỉ Lệ Đúng</th>
                  <th>Trạng Thái</th>
                  <th>Thời Gian Thực Hiện</th>
                  <th>Hành Động</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 5).map((session) => {
                  const isSubjectWide = session.quizTargetId < 0;
                  const subject = isSubjectWide ? subjects.find(sub => sub.id === -session.quizTargetId) : null;
                  const quiz = !isSubjectWide ? quizzes.find(q => q.id === session.quizTargetId) : null;
                  const totalQuestions = session.totalCorrect + session.totalWrong;
                  const scorePercent = totalQuestions > 0 ? Math.round((session.totalCorrect / totalQuestions) * 100) : 0;
                  
                  return (
                    <tr key={session.id}>
                      <td style={{ fontWeight: 600 }}>{isSubjectWide ? `Tất cả đề môn ${subject?.code || ''}` : (quiz?.name || `Bộ đề #${session.quizTargetId}`)}</td>
                      <td>
                        <span className={`badge ${
                          session.learningMode === 'study' ? 'badge-info' : 
                          session.learningMode === 'practice' ? 'badge-warning' : 'badge-success'
                        }`}>
                          {session.learningMode === 'study' ? 'Học tập' : 
                           session.learningMode === 'practice' ? 'Luyện tập' : 'Thi cử'}
                        </span>
                      </td>
                      <td>{totalQuestions} câu</td>
                      <td style={{ fontWeight: 600, color: scorePercent > 50 ? 'var(--toast-success)' : 'var(--toast-error)' }}>
                        {scorePercent}% ({session.totalCorrect}/{totalQuestions})
                      </td>
                      <td>
                        <span className={`badge ${session.isCompleted ? 'badge-success' : 'badge-warning'}`}>
                          {session.isCompleted ? 'Hoàn thành' : 'Đang học'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {new Date(session.startTime).toLocaleString('vi-VN')}
                      </td>
                      <td>
                        <button 
                          className="btn btn-secondary py-1 px-3"
                          style={{ fontSize: '0.8rem' }}
                          onClick={() => navigateTo({ type: 'learning-result', sessionTokenOrId: session.sessionToken || String(session.id) })}
                        >
                          Xem Kết Quả
                        </button>
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
