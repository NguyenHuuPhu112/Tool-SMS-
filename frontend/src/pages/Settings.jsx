import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Settings as SettingsIcon, Save, ShieldAlert, Activity } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';

function Settings() {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';
  
  const [settings, setSettings] = useState({
    android_api_url: '',
    max_retries: 3,
    rate_limit_per_minute: 30
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/gateway/settings');
      setSettings({
        android_api_url: res.data.android_api_url,
        max_retries: res.data.max_retries,
        rate_limit_per_minute: res.data.rate_limit_per_minute
      });
    } catch (error) {
      toast.error('Lỗi khi tải cài đặt');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    setIsSaving(true);
    try {
      await axios.post('/api/gateway/settings', settings);
      toast.success('Đã lưu cấu hình hệ thống');
    } catch (error) {
      toast.error('Lỗi khi lưu cấu hình');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="text-gray-500">Đang tải...</div>;
  }

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in-down">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center">
          <SettingsIcon className="w-6 h-6 mr-3 text-indigo-400" /> Cài đặt Hệ thống
        </h1>
        <p className="text-gray-400 mt-2 text-sm">Quản lý cấu hình kết nối và giới hạn tài nguyên của Gateway.</p>
      </div>

      <div className="bg-[#121214] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6 relative overflow-hidden">
        {!isAdmin && (
          <div className="absolute top-0 right-0 p-4">
            <span className="flex items-center text-xs font-semibold text-yellow-400 bg-yellow-500/10 px-3 py-1.5 rounded-full border border-yellow-500/20">
              <ShieldAlert className="w-4 h-4 mr-1.5" /> Chỉ xem (Cần quyền Admin)
            </span>
          </div>
        )}

        <div className="space-y-4 pt-2">
          <h3 className="text-lg font-semibold text-white flex items-center mb-4">
            <Activity className="w-5 h-5 mr-2 text-indigo-400" /> Traffic & Limits
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Rate Limit Toàn Cầu (tin/phút)
              </label>
              <input 
                type="number" 
                value={settings.rate_limit_per_minute} 
                onChange={e => setSettings({...settings, rate_limit_per_minute: parseInt(e.target.value) || 0})}
                disabled={!isAdmin}
                className="w-full bg-black/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 mt-2">Tổng số SMS tối đa hệ thống gửi trong 1 phút.</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Số lần Retry tối đa (khi gửi lỗi)
              </label>
              <input 
                type="number" 
                value={settings.max_retries} 
                onChange={e => setSettings({...settings, max_retries: parseInt(e.target.value) || 0})}
                disabled={!isAdmin}
                className="w-full bg-black/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 mt-2">Hệ thống sẽ thử gửi lại N lần trước khi đánh dấu FAILED hẳn.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-6 border-t border-white/5">
          <h3 className="text-lg font-semibold text-white flex items-center mb-4">
            Android Gateway API (Fallback)
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Default API URL
            </label>
            <input 
              type="text" 
              value={settings.android_api_url} 
              onChange={e => setSettings({...settings, android_api_url: e.target.value})}
              disabled={!isAdmin}
              className="w-full bg-black/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 font-mono text-sm"
              placeholder="http://192.168.1.100:8080/v1/sms"
            />
            <p className="text-xs text-gray-500 mt-2">Đường dẫn này được dùng khi không có thiết bị nào trong SIM Farm hoạt động.</p>
          </div>
        </div>

        {isAdmin && (
          <div className="pt-6 mt-6 border-t border-white/5 flex justify-end">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold transition flex items-center disabled:opacity-50 shadow-lg shadow-indigo-500/20"
            >
              <Save className="w-5 h-5 mr-2" />
              {isSaving ? 'Đang lưu...' : 'Lưu Thay Đổi'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Settings;
