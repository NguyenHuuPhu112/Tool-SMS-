import React, { useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogIn, Lock, User } from 'lucide-react';
import { toast } from 'react-hot-toast';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error('Vui lòng nhập đầy đủ thông tin');
      return;
    }
    
    setIsLoading(true);
    toast.dismiss(); // Clear any previous error/success toasts
    
    try {
      await login(username, password);
      toast.success('Đăng nhập thành công');
      navigate('/');
    } catch (error) {
      if (error.response && error.response.status === 403 && error.response.data.detail?.email) {
        toast.error(error.response.data.detail.message);
        navigate(`/verify-email?email=${encodeURIComponent(error.response.data.detail.email)}`);
      } else if (error.response && error.response.data && error.response.data.detail) {
          toast.error(typeof error.response.data.detail === 'string' ? error.response.data.detail : 'Đăng nhập thất bại');
      } else {
        toast.error('Sai tên đăng nhập hoặc mật khẩu');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-3xl p-8 shadow-xl relative animate-fade-in-up">
        
        <div className="text-center mb-8">
          <div className="inline-block p-3 rounded-full bg-blue-50 mb-4 border border-blue-100">
            <LogIn className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900">
            Hệ thống quản lý SMS
          </h1>
          <p className="text-gray-500 mt-2">Vui lòng đăng nhập để tiếp tục</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input 
                type="text" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full pl-10 bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Nhập tên đăng nhập..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3.5 flex justify-center items-center transition shadow-lg shadow-blue-600/20 disabled:opacity-70"
          >
            {isLoading ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="mt-6 text-center text-gray-600 text-sm">
          Chưa có tài khoản?{' '}
          <span 
            onClick={() => navigate('/register')}
            className="text-blue-600 hover:text-blue-700 font-bold transition-colors cursor-pointer"
          >
            Đăng ký ngay
          </span>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />
    </div>
  );
}

export default Login;
