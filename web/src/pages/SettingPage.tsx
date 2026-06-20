import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Settings, Type, Keyboard, Trash2, Key } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const SettingPage: React.FC = () => {
  const { config, saveConfig, resetAllData } = useApp();
  const { currentUser } = useAuth();
  const [fontFamily, setFontFamily] = useState(config.fontFamily);
  const [fontSize, setFontSize] = useState(config.fontSize);
  const [enableQuickAnswer, setEnableQuickAnswer] = useState(config.enableQuickAnswer);
  const [isMouseEnabled, setIsMouseEnabled] = useState(config.isMouseEnabled);
  const [examOpenCode, setExamOpenCode] = useState(config.examOpenCode || '12345');

  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchToken = async () => {
    try {
      const res = await fetch('/api/auth/token', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setApiToken(data.token);
      }
    } catch (err) {
      console.error('Failed to fetch token:', err);
    }
  };

  const handleSave = async () => {
    await saveConfig({
      ...config,
      fontFamily,
      fontSize,
      enableQuickAnswer,
      isMouseEnabled,
      examOpenCode
    });
    alert('Đã lưu cấu hình cài đặt thành công!');
  };

  const handleReset = async () => {
    if (confirm('CẢNH BÁO: Thao tác này sẽ xóa TOÀN BỘ môn học, bộ đề câu hỏi và lịch sử ôn thi trong trình duyệt của bạn. Bạn vẫn chắc chắn muốn xóa?')) {
      if (confirm('Xác nhận lại một lần nữa. Mọi dữ liệu sẽ mất vĩnh viễn!')) {
        await resetAllData();
        alert('Đã dọn dẹp và reset dữ liệu thành công.');
        window.location.reload();
      }
    }
  };

  return (
    <div className="p-6 animate-fade-in flex flex-col gap-6 overflow-y-auto" style={{ height: '100%', maxWidth: '800px', margin: '0 auto' }}>

      {/* Title */}
      <div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '4px' }}>Cài đặt hệ thống</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Tùy chỉnh font chữ, cỡ chữ, phím tắt và quản lý bộ nhớ cục bộ.</p>
      </div>

      {/* Font & Design settings */}
      <div className="card flex flex-col gap-4">
        <h3 className="flex items-center gap-2" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
          <Type size={18} style={{ color: 'var(--primary-color)' }} />
          Tùy chỉnh giao diện
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-group">
            <label className="form-label">Chọn Font chữ</label>
            <select
              className="input"
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
            >
              <option value="Microsoft Sans Serif">Microsoft Sans Serif (Mặc định)</option>
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Kích thước chữ ({fontSize}px)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="12"
                max="22"
                step="1"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary-color)' }}
              />
            </div>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '10px' }}>
          <label className="form-label">Mã mở đề thi mặc định (Open Code)</label>
          <input
            type="text"
            className="input"
            value={examOpenCode}
            onChange={(e) => setExamOpenCode(e.target.value)}
            placeholder="Ví dụ: ABCDE"
            style={{ maxWidth: '300px' }}
          />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Mã xác thực này sẽ được yêu cầu ở bước cuối cùng trước khi thí sinh bắt đầu làm bài thi trắc nghiệm.
          </span>
        </div>

        <div className="flex flex-col gap-3 mt-2">
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={enableQuickAnswer}
              onChange={(e) => setEnableQuickAnswer(e.target.checked)}
            />
            <span className="checkmark"></span>
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
              Bật phản hồi nhanh khi nhấp chuột (Practice mode)
            </span>
          </label>

          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={isMouseEnabled}
              onChange={(e) => setIsMouseEnabled(e.target.checked)}
            />
            <span className="checkmark"></span>
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
              Kích hoạt chuột để chọn đáp án
            </span>
          </label>
        </div>
      </div>

      {/* Keyboard Shortcuts settings (Static info) */}
      <div className="card flex flex-col gap-4">
        <h3 className="flex items-center gap-2" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
          <Keyboard size={18} style={{ color: 'var(--primary-color)' }} />
          Phím tắt ôn tập
        </h3>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Hành động</th>
                <th>Phím tắt mặc định</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600 }}>Câu tiếp theo</td>
                <td><kbd style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>Space</kbd> hoặc <kbd style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>Mũi tên phải</kbd></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Câu trước đó</td>
                <td><kbd style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>Mũi tên trái</kbd></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Hiện đáp án (Study mode)</td>
                <td><kbd style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>H</kbd></td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Kiểm tra đáp án (Practice mode)</td>
                <td><kbd style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>Enter</kbd></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin API Token settings */}
      {currentUser?.isAdmin && (
        <div className="card flex flex-col gap-4">
          <h3 className="flex items-center gap-2" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            <Key size={18} style={{ color: 'var(--primary-color)' }} />
            Mã kết nối App Desktop (API Token)
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Dùng mã này để đăng nhập vào ứng dụng quản lý Desktop. Giữ mã này bảo mật.
          </p>
          <div className="flex gap-2 items-center">
            <input
              type={showToken ? "text" : "password"}
              className="input"
              readOnly
              value={apiToken || 'Nhấp vào nút để lấy mã...'}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem', flex: 1 }}
            />
            {!apiToken ? (
              <button
                type="button"
                className="btn btn-secondary py-2 px-4"
                onClick={fetchToken}
                style={{ whiteSpace: 'nowrap' }}
              >
                Lấy Token
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary py-2 px-4"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? 'Ẩn' : 'Hiện'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary py-2 px-4"
                  onClick={() => {
                    navigator.clipboard.writeText(apiToken);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {copied ? 'Đã copy!' : 'Copy'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Database control Settings */}
      <div className="card flex flex-col gap-4" style={{ borderColor: 'rgba(255, 77, 79, 0.2)' }}>
        <h3 className="flex items-center gap-2 text-danger" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--toast-error)' }}>
          <Trash2 size={18} />
          Khu vực nguy hiểm
        </h3>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Dọn dẹp và làm mới lại toàn bộ ứng dụng của bạn. Thao tác này sẽ xóa vĩnh viễn toàn bộ ngân hàng câu hỏi đã import.
        </p>

        <button
          className="btn btn-danger py-2.5 px-4"
          style={{ alignSelf: 'flex-start' }}
          onClick={handleReset}
        >
          Xóa toàn bộ dữ liệu ứng dụng
        </button>
      </div>

      {/* Save Button */}
      <button
        className="btn btn-primary py-3 px-8 flex items-center justify-center gap-2"
        style={{ alignSelf: 'flex-end', marginTop: '10px' }}
        onClick={handleSave}
      >
        <Settings size={18} />
        <span>Lưu cài đặt</span>
      </button>

    </div>
  );
};
