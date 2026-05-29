import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Mail } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { verifyEmailOtp, resendEmailOtp } from '../utils/authApi';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

function VerifyEmail() {
  const [otp, setOtp] = useState('');
  const navigate = useNavigate();
  const query = useQuery();
  const email = query.get('email');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (!email) {
      toast.error('Không tìm thấy email cần xác thực');
      navigate('/login');
    }
  }, [email, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      toast.error('Vui lòng nhập mã OTP gồm 6 chữ số');
      return;
    }
    
    setIsLoading(true);
    toast.dismiss();
    
    try {
      const response = await verifyEmailOtp(email, otp);
      toast.success(response.message || 'Xác thực thành công. Vui lòng đăng nhập.');
      navigate('/login');
    } catch (error) {
      if (error.response && error.response.data && error.response.data.detail) {
        toast.error(typeof error.response.data.detail === 'string' ? error.response.data.detail : 'Xác thực thất bại');
      } else {
        toast.error('Có lỗi xảy ra. Vui lòng thử lại.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    toast.dismiss();
    try {
      const response = await resendEmailOtp(email);
      toast.success(response.message || 'Đã gửi lại mã xác thực.');
    } catch (error) {
       if (error.response && error.response.data && error.response.data.detail) {
        toast.error(typeof error.response.data.detail === 'string' ? error.response.data.detail : 'Không thể gửi lại mã');
      } else {
        toast.error('Có lỗi xảy ra. Vui lòng thử lại.');
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-3xl p-8 shadow-xl relative animate-fade-in-up">
        
        <div className="text-center mb-8">
          <div className="inline-block p-3 rounded-full bg-blue-50 mb-4 border border-blue-100">
            <ShieldCheck className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900">
            Xác thực Email
          </h1>
          <p className="text-gray-500 mt-4 text-sm">
            Chúng tôi đã gửi mã OTP gồm 6 chữ số đến email <br/>
            <span className="text-blue-600 font-bold">{email}</span>
          </p>
          <p className="text-gray-500 mt-1 text-sm">Vui lòng kiểm tra hộp thư đến hoặc thư rác.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <div className="relative">
              <input 
                type="text" 
                maxLength="6"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-4 text-center text-2xl tracking-widest text-gray-900 focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-400"
                placeholder="••••••"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={isLoading || otp.length !== 6}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3.5 flex justify-center items-center transition shadow-lg shadow-blue-600/20 disabled:opacity-70"
          >
            {isLoading ? 'Đang kiểm tra...' : 'Xác nhận mã'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button 
            onClick={handleResend}
            disabled={isResending}
            className="text-gray-500 hover:text-blue-600 font-medium transition-colors text-sm disabled:opacity-50"
          >
            {isResending ? 'Đang gửi...' : 'Chưa nhận được mã? Gửi lại'}
          </button>
        </div>
        
        <div className="mt-6 text-center">
          <span 
            onClick={() => navigate('/login')}
            className="text-blue-600 hover:text-blue-700 font-bold transition-colors cursor-pointer text-sm"
          >
            Quay lại đăng nhập
          </span>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
