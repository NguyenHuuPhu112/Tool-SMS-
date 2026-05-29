import React, { useState, useEffect, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import { Users, Plus, Edit2, Shield, MessageSquare, ArrowLeft, RefreshCw } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

function Admin() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'user',
    monthly_quota: 1000,
    daily_quota: 100,
    allow_shared_devices: false
  });

  const { data: usersList = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await axios.get('/api/admin/users');
      return res.data;
    },
    enabled: !!user && user.role === 'admin'
  });

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/');
      toast.error('Bạn không có quyền truy cập trang này');
    }
  }, [user, navigate]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      role: 'user',
      monthly_quota: 1000,
      daily_quota: 100,
      allow_shared_devices: false
    });
    setShowModal(true);
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      password: '', // leave empty if not changing
      role: u.role,
      monthly_quota: u.monthly_quota,
      daily_quota: u.daily_quota || 100,
      allow_shared_devices: u.allow_shared_devices || false
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        // Update
        const payload = {
          role: formData.role,
          monthly_quota: parseInt(formData.monthly_quota),
          daily_quota: parseInt(formData.daily_quota),
          allow_shared_devices: formData.allow_shared_devices
        };
        if (formData.password) payload.password = formData.password;
        
        await axios.put(`/api/admin/users/${editingUser.id}`, payload);
        toast.success('Cập nhật thành công');
      } else {
        // Create
        if (!formData.username || !formData.password) {
          toast.error('Vui lòng nhập tài khoản và mật khẩu');
          return;
        }
        await axios.post('/api/admin/users', {
          ...formData,
          monthly_quota: parseInt(formData.monthly_quota),
          daily_quota: parseInt(formData.daily_quota),
          allow_shared_devices: formData.allow_shared_devices
        });
        toast.success('Tạo tài khoản thành công');
      }
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });

    } catch (err) {
      toast.error(err.response?.data?.detail || 'Có lỗi xảy ra');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => navigate('/')}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-3xl font-bold flex items-center text-gray-900">
              <Shield className="w-8 h-8 mr-3 text-blue-600" /> Quản Lý Hệ Thống
            </h1>
            <button onClick={() => refetch()} className="p-2 ml-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors" title="Làm mới">
              <RefreshCw className={`w-5 h-5 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <button 
            onClick={openCreateModal}
            className="btn-primary flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" /> Tạo Tài Khoản
          </button>
        </header>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-4 text-gray-500 font-semibold uppercase tracking-wider text-xs">Tài khoản</th>
                  <th className="p-4 text-gray-500 font-semibold uppercase tracking-wider text-xs">Phân quyền</th>
                  <th className="p-4 text-gray-500 font-semibold uppercase tracking-wider text-xs">Dùng TB Chung</th>
                  <th className="p-4 text-gray-500 font-semibold uppercase tracking-wider text-xs">Quota (Ngày / Tháng)</th>
                  <th className="p-4 text-gray-500 font-semibold uppercase tracking-wider text-xs">Đã gửi</th>
                  <th className="p-4 text-gray-500 font-semibold uppercase tracking-wider text-xs">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-gray-500">Đang tải...</td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-red-500">Lỗi khi tải dữ liệu!</td>
                  </tr>
                ) : usersList.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-gray-500">Chưa có người dùng nào.</td>
                  </tr>
                ) : (
                  usersList.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 transition">
                      <td className="p-4 font-semibold text-gray-900 flex items-center">
                        <Users className="w-4 h-4 mr-2 text-gray-400" /> {u.username}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-4">
                        {u.allow_shared_devices ? (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">Được phép</span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-600">Không</span>
                        )}
                      </td>
                      <td className="p-4 text-gray-700 font-medium">
                        {u.daily_quota} / {u.monthly_quota}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center text-xs">
                            <MessageSquare className="w-3 h-3 mr-1 text-blue-500" />
                            <span className={u.current_day_usage >= u.daily_quota ? "text-red-600 font-bold" : "text-emerald-600 font-medium"}>
                              {u.current_day_usage || 0} (hôm nay)
                            </span>
                          </div>
                          <div className="flex items-center text-xs">
                            <MessageSquare className="w-3 h-3 mr-1 text-gray-400" />
                            <span className={u.current_month_usage >= u.monthly_quota ? "text-red-600 font-bold" : "text-emerald-600 font-medium"}>
                              {u.current_month_usage} (tháng)
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <button 
                          onClick={() => openEditModal(u)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>


      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="card p-6 md:p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">
              {editingUser ? 'Sửa thông tin tài khoản' : 'Tạo tài khoản mới'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label-text">Tên đăng nhập</label>
                <input 
                  type="text" 
                  value={formData.username}
                  onChange={e => setFormData({...formData, username: e.target.value})}
                  disabled={!!editingUser}
                  className="input-field disabled:opacity-50 disabled:bg-gray-100"
                  required={!editingUser}
                />
              </div>
              <div>
                <label className="label-text">
                  Mật khẩu {editingUser && <span className="text-xs text-yellow-600 font-normal ml-1">(Để trống nếu không đổi)</span>}
                </label>
                <input 
                  type="password" 
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="input-field"
                  required={!editingUser}
                />
              </div>
              <div>
                <label className="label-text">Vai trò</label>
                <select 
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value})}
                  className="input-field"
                >
                  <option value="user">USER (Gửi tin nhắn)</option>
                  <option value="admin">ADMIN (Quản lý hệ thống)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-text">Tin nhắn / Ngày</label>
                  <input 
                    type="number" 
                    value={formData.daily_quota}
                    onChange={e => setFormData({...formData, daily_quota: e.target.value})}
                    className="input-field"
                    min="0"
                    required
                  />
                </div>
                <div>
                  <label className="label-text">Tin nhắn / Tháng</label>
                  <input 
                    type="number" 
                    value={formData.monthly_quota}
                    onChange={e => setFormData({...formData, monthly_quota: e.target.value})}
                    className="input-field"
                    min="0"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-gray-200 mt-4">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Dùng chung Thiết bị</h4>
                  <p className="text-xs text-gray-500 mt-1">Cho phép gửi qua thiết bị của hệ thống</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={formData.allow_shared_devices}
                    onChange={(e) => setFormData({...formData, allow_shared_devices: e.target.checked})}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div className="flex justify-end space-x-3 mt-8">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="btn-primary"
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
