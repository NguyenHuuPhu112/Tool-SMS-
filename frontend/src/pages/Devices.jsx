import React, { useState, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Smartphone, Plus, Power, Edit2, Activity } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import { format } from 'date-fns';

function Devices() {
  const { user } = useContext(AuthContext);
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const [showModal, setShowModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [formData, setFormData] = useState({ name: '', base_url: '', api_key: '', is_active: true });

  const { data: devices, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const res = await axios.get('/api/gateway/devices');
      return res.data;
    },
    refetchInterval: 10000,
  });

  const toggleMutation = useMutation({
    mutationFn: (device) => axios.put(`/api/gateway/devices/${device.id}`, { is_active: !device.is_active }),
    onSuccess: () => {
      toast.success('Đã cập nhật trạng thái thiết bị');
      queryClient.invalidateQueries(['devices']);
    },
    onError: () => toast.error('Lỗi khi cập nhật thiết bị')
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (editingDevice) {
        return axios.put(`/api/gateway/devices/${editingDevice.id}`, data);
      }
      return axios.post('/api/gateway/devices', data);
    },
    onSuccess: () => {
      toast.success('Đã lưu thiết bị thành công');
      setShowModal(false);
      queryClient.invalidateQueries(['devices']);
      // Ping device health to get immediate status
      axios.get('/api/gateway/device-health').then(res => {
        const devicesHealth = res.data.devices || [];
        // find matching base_url (normalized)
        const normalized = formData.base_url.replace(/\/$/, '');
        const match = devicesHealth.find(d => (d.base_url || '').replace(/\/$/, '') === normalized);
        if (match) {
          if (match.online) toast.success('Thiết bị đang online');
          else toast('Thiết bị chưa online', { icon: '⚠️' });
        }
      }).catch(() => {});
    },
    onError: () => toast.error('Lỗi khi lưu thiết bị')
  });

  const openCreateModal = () => {
    setEditingDevice(null);
    setFormData({ name: '', base_url: 'http://100.120.152.19:8082/', api_key: '', is_active: true });
    setShowModal(true);
  };

  const openEditModal = (device) => {
    setEditingDevice(device);
    setFormData({ name: device.name, base_url: device.base_url, api_key: '', is_active: device.is_active });
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <div className="space-y-6 animate-fade-in-down h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white flex items-center">
          <Smartphone className="w-6 h-6 mr-3 text-indigo-400" /> Quản lý Thiết bị (SIM Farm)
        </h1>
        <button 
          onClick={openCreateModal}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl flex items-center transition"
        >
          <Plus className="w-5 h-5 mr-2" /> Thêm thiết bị
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="text-gray-500">Đang tải...</div>
        ) : devices?.length === 0 ? (
          <div className="text-gray-500">Chưa có thiết bị nào.</div>
        ) : (
          devices?.map(device => (
            <div key={device.id || device.base_url} className={`bg-[#121214] border ${device.is_active ? 'border-white/10' : 'border-red-500/20 opacity-70'} rounded-2xl p-6 shadow-lg relative`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${device.status === 'online' && device.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">{device.name}</h3>
                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md mt-1 inline-block ${device.status === 'online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {device.status}
                    </span>
                  </div>
                </div>
                
                <button 
                  onClick={() => toggleMutation.mutate(device)}
                  className={`p-2 rounded-full transition-colors ${device.is_active ? 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
                  title={device.is_active ? "Tắt thiết bị" : "Bật thiết bị"}
                >
                  <Power className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 mt-6">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">IP / URL:</span>
                  <span className="text-gray-300 font-mono text-xs">{device.base_url}</span>
                </div>
                {isAdmin && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Chủ sở hữu:</span>
                    <span className="text-gray-300 text-xs">{device.user_id ? device.user_id.slice(0,8) + '...' : 'Hệ thống'}</span>
                  </div>
                )}
                {device.last_health_check_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Cập nhật cuối:</span>
                    <span className="text-gray-300 text-xs">{format(new Date(device.last_health_check_at + 'Z'), 'HH:mm:ss dd/MM')}</span>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 flex justify-end">
                <button 
                  onClick={() => openEditModal(device)}
                  className="text-xs flex items-center text-gray-400 hover:text-indigo-400 transition"
                >
                  <Edit2 className="w-3 h-3 mr-1" /> Chỉnh sửa
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121214] border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-white">
              {editingDevice ? 'Sửa Thiết bị' : 'Thêm Thiết bị mới'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Tên thiết bị</label>
                <input 
                  type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-black/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                  placeholder="VD: Samsung A50 - Viettel" required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Base URL</label>
                <input 
                  type="url" value={formData.base_url} onChange={e => setFormData({...formData, base_url: e.target.value})}
                  className="w-full bg-black/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                  placeholder="VD: http://100.120.152.19:8082/ (ví dụ Traccar endpoint)" required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">API Key (Tùy chọn)</label>
                <input 
                  type="password" value={formData.api_key} onChange={e => setFormData({...formData, api_key: e.target.value})}
                  className="w-full bg-black/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Để trống nếu app không cài mật khẩu"
                />
              </div>
              
              <div className="flex justify-end space-x-3 mt-8">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-400 hover:text-white transition">Hủy</button>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl font-semibold transition" disabled={saveMutation.isLoading}>
                  {saveMutation.isLoading ? 'Đang lưu...' : 'Lưu Thiết bị'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Devices;
