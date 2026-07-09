import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, UserCheck, Edit2, Sparkles } from 'lucide-react';

interface AppUser {
  id: number;
  email: string;
  name: string;
  mssv: string;
  class?: string;
  is_active: number;
  created_at: string;
}

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formMssv, setFormMssv] = useState('');
  const [formClass, setFormClass] = useState('');
  const [selectedClass, setSelectedClass] = useState('All');
  
  // Selection & Bulk actions state
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkClassInput, setBulkClassInput] = useState('');

  // Import AI state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importClass, setImportClass] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail.trim() || !formName.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formEmail.trim(), name: formName.trim(), mssv: formMssv.trim(), class: formClass.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Lỗi khi lưu người dùng');
      } else {
        setShowModal(false);
        setFormEmail(''); setFormName(''); setFormMssv(''); setFormClass('');
        setEditingUser(null);
        loadUsers();
      }
    } catch {
      setErrorMsg('Không thể kết nối đến server');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (user: AppUser) => {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormName(user.name);
    setFormMssv(user.mssv || '');
    setFormClass(user.class || '');
    setErrorMsg('');
    setShowModal(true);
  };

  const handleDelete = async (id: number, email: string) => {
    if (!confirm(`Xóa người dùng "${email}" khỏi hệ thống?`)) return;
    try {
      await fetch(`/api/users/${id}`, { method: 'DELETE', credentials: 'include' });
      loadUsers();
    } catch (e) {
      console.error(e);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return iso; }
  };

  const handleBulkUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/users/bulk-update-class', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedUserIds, class: bulkClassInput.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setShowBulkEditModal(false);
        setSelectedUserIds([]);
        setBulkClassInput('');
        loadUsers();
      } else {
        alert(data.error || 'Lỗi khi sửa lớp hàng loạt');
      }
    } catch {
      alert('Không thể kết nối đến server');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Xóa ${selectedUserIds.length} người dùng đã chọn khỏi hệ thống?`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/users/bulk-delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedUserIds })
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedUserIds([]);
        loadUsers();
      } else {
        alert(data.error || 'Lỗi khi xóa hàng loạt');
      }
    } catch {
      alert('Không thể kết nối đến server');
    } finally {
      setLoading(false);
    }
  };

  const handleImportAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/users/import-ai', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: importText, class: importClass.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Đã import thành công ${data.count} sinh viên vào lớp ${importClass || 'trống'}.`);
        setShowImportModal(false);
        setImportText('');
        setImportClass('');
        loadUsers();
      } else {
        setErrorMsg(data.error || 'Lỗi khi import AI');
      }
    } catch {
      setErrorMsg('Không thể kết nối đến server');
    } finally {
      setSaving(false);
    }
  };

  const classesList = ['All', ...Array.from(new Set(users.map(u => u.class || '').filter(Boolean)))];
  const filteredUsers = selectedClass === 'All' ? users : users.filter(u => u.class === selectedClass);

  return (
    <div className="overflow-y-auto w-full h-full" style={{ height: '100%' }}>
      <div className="p-6 animate-fade-in flex flex-col gap-6">
        {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div style={{
            width: '42px', height: '42px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users size={22} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>Quản lý Người dùng</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Chỉ email được đăng ký mới có thể đăng nhập vào hệ thống
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary flex items-center gap-2"
            onClick={() => {
              setImportClass(selectedClass === 'All' ? '' : selectedClass);
              setImportText('');
              setErrorMsg('');
              setShowImportModal(true);
            }}
            style={{ borderColor: 'var(--border-color)', color: 'var(--primary-color)' }}
          >
            <Sparkles size={18} /> Import AI
          </button>
          
          <button
            id="add-user-btn"
            className="btn btn-primary"
            onClick={() => { 
              setEditingUser(null); 
              setFormEmail(''); 
              setFormName(''); 
              setFormMssv(''); 
              setFormClass(selectedClass === 'All' ? '' : selectedClass); 
              setShowModal(true); 
              setErrorMsg(''); 
            }}
          >
            <Plus size={18} /> Thêm người dùng
          </button>
        </div>
      </div>

      {/* Filter and Stats */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="card p-4 flex items-center gap-3" style={{ borderLeft: '4px solid var(--primary-color)', flex: 1, margin: 0 }}>
          <UserCheck size={20} style={{ color: 'var(--primary-color)' }} />
          <span style={{ fontWeight: 600 }}>
            {loading ? '...' : `${filteredUsers.length} / ${users.length}`} người dùng
          </span>
        </div>
        
        <div className="card p-4 flex items-center gap-3" style={{ margin: 0, minWidth: '240px' }}>
          <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Lớp học (Class):</label>
          <select
            value={selectedClass}
            onChange={e => {
              setSelectedClass(e.target.value);
              setSelectedUserIds([]); // reset selection when class filter changes
            }}
            className="input"
            style={{ padding: '6px 12px', minWidth: '120px', margin: 0, height: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}
          >
            {classesList.map(cls => (
              <option key={cls} value={cls}>{cls === 'All' ? 'Tất cả' : cls}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedUserIds.length > 0 && (
        <div 
          className="card flex justify-between items-center p-4 animate-fade-in" 
          style={{ 
            backgroundColor: 'var(--sidebar-hover)', 
            borderLeft: '4px solid var(--primary-color)',
            flexDirection: 'row',
            gap: '16px',
            flexWrap: 'wrap',
            margin: 0
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              Đã chọn {selectedUserIds.length} người dùng
            </span>
          </div>
          <div className="flex gap-3">
            <button
              className="btn btn-secondary py-2 px-4"
              onClick={() => {
                setBulkClassInput('');
                setShowBulkEditModal(true);
              }}
              style={{ fontSize: '0.875rem' }}
            >
              Sửa lớp hàng loạt
            </button>
            <button
              className="btn btn-primary py-2 px-4"
              onClick={handleBulkDelete}
              style={{ backgroundColor: 'var(--toast-error)', borderColor: 'var(--toast-error)', fontSize: '0.875rem' }}
            >
              Xóa hàng loạt
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center p-12" style={{ color: 'var(--text-secondary)' }}>
          Đang tải danh sách...
        </div>
      ) : users.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12" style={{ color: 'var(--text-secondary)' }}>
          <Users size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <span style={{ fontWeight: 600 }}>Chưa có người dùng nào</span>
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
            Thêm email để cấp quyền truy cập cho sinh viên.
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--bg-content)' }}>
                <th style={{ padding: '12px 16px', width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                    onChange={() => {
                      if (selectedUserIds.length === filteredUsers.length) {
                        setSelectedUserIds([]);
                      } else {
                        setSelectedUserIds(filteredUsers.map(u => u.id));
                      }
                    }}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>#</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Email</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Họ và Tên</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>MSSV</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Lớp</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Ngày thêm</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, idx) => (
                <tr
                  key={user.id}
                  style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => {
                        if (selectedUserIds.includes(user.id)) {
                          setSelectedUserIds(selectedUserIds.filter(id => id !== user.id));
                        } else {
                          setSelectedUserIds([...selectedUserIds, user.id]);
                        }
                      }}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{idx + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.9rem' }}>{user.email}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{user.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.9rem', fontFamily: 'monospace', color: 'var(--primary-color)', fontWeight: 600 }}>
                    {user.mssv || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontFamily: 'inherit', fontWeight: 400 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '0.9rem', fontWeight: 600 }}>
                    {user.class || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontWeight: 400 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{formatDate(user.created_at)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div className="flex gap-2 justify-center">
                      <button
                        className="btn btn-secondary p-1"
                        style={{ borderColor: 'transparent', color: 'var(--primary-color)' }}
                        onClick={() => handleEditClick(user)}
                        title="Chỉnh sửa người dùng"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="btn btn-secondary p-1"
                        style={{ borderColor: 'transparent', color: 'var(--toast-error)' }}
                        onClick={() => handleDelete(user.id, user.email)}
                        title="Xóa người dùng"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {/* Add/Edit User Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingUser ? 'Chỉnh sửa người dùng' : 'Thêm người dùng mới'}</h3>
              <button
                onClick={() => { setShowModal(false); setEditingUser(null); }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold' }}
              >&times;</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Email Google <span style={{ color: 'var(--toast-error)' }}>*</span></label>
                <input
                  type="email"
                  className="input"
                  placeholder="example@gmail.com"
                  required
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Phải trùng với email Google mà sinh viên dùng để đăng nhập.
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Họ và Tên <span style={{ color: 'var(--toast-error)' }}>*</span></label>
                <input
                  type="text"
                  className="input"
                  placeholder="Nguyễn Văn A"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">MSSV</label>
                <input
                  type="text"
                  className="input"
                  placeholder="SE123456"
                  value={formMssv}
                  onChange={e => setFormMssv(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Lớp học (Class)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ví dụ: SE1701"
                  value={formClass}
                  onChange={e => setFormClass(e.target.value)}
                />
              </div>
              {errorMsg && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px',
                  background: '#fef2f2', border: '1px solid #fecaca',
                  color: '#dc2626', fontSize: '0.875rem', marginBottom: '12px',
                }}>
                  {errorMsg}
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditingUser(null); }}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang lưu...' : (editingUser ? 'Lưu thay đổi' : 'Thêm người dùng')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Edit Class Modal */}
      {showBulkEditModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Sửa Lớp hàng loạt</h3>
              <button
                onClick={() => setShowBulkEditModal(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold' }}
              >&times;</button>
            </div>
            <form onSubmit={handleBulkUpdateClass}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Thay đổi lớp học cho <strong>{selectedUserIds.length}</strong> người dùng đã chọn.
              </p>
              <div className="form-group">
                <label className="form-label">Tên lớp học mới</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ví dụ: SE1701"
                  required
                  value={bulkClassInput}
                  onChange={e => setBulkClassInput(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowBulkEditModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang cập nhật...' : 'Cập nhật Lớp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import AI Modal */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={20} style={{ color: 'var(--primary-color)' }} /> 
                Import thành viên bằng AI
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold' }}
              >&times;</button>
            </div>
            <form onSubmit={handleImportAI}>
              <div className="form-group">
                <label className="form-label">Lớp học đích (Target Class)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ví dụ: SE1701 (Để trống nếu tự động)"
                  value={importClass}
                  onChange={e => setImportClass(e.target.value)}
                />
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Sinh viên import sẽ được tự động xếp vào lớp này.
                </p>
              </div>
              
              <div className="form-group">
                <label className="form-label">Dán văn bản thô chứa danh sách sinh viên <span style={{ color: 'var(--toast-error)' }}>*</span></label>
                <textarea
                  className="input"
                  rows={8}
                  required
                  placeholder="Dán thông tin sao chép từ Excel/Word/Text. Ví dụ:&#10;DE190305  Võ Phan Huy  vophanhuy9@gmail.com&#10;DE201025  Nguyễn Lê Hoàng Anh  anh0387837525@gmail.com"
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
              </div>

              {errorMsg && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px',
                  background: '#fef2f2', border: '1px solid #fecaca',
                  color: '#dc2626', fontSize: '0.875rem', marginBottom: '12px',
                }}>
                  {errorMsg}
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Đang phân tích & import...' : 'Phân tích & Thêm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
