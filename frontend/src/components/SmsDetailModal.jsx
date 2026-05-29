import React, { useContext } from 'react';
import { X, Copy, CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { getSmsStatusDescription, getSmsStatusLabel } from '../utils/smsStatus';
import { AuthContext } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

// Timeline Step Helper
const TimelineStep = ({ title, time, active, isError }) => (
  <div className={`flex relative pb-6 ${active ? 'opacity-100' : 'opacity-40'}`}>
    <div className="absolute top-2 bottom-0 left-[11px] w-[2px] bg-gray-200 -ml-[1px]"></div>
    <div className="relative z-10 shrink-0 mt-1 mr-4">
      {isError ? (
        <AlertCircle className="w-[22px] h-[22px] text-red-500 bg-white rounded-full" />
      ) : active ? (
        <CheckCircle2 className="w-[22px] h-[22px] text-emerald-500 bg-white rounded-full" />
      ) : (
        <Circle className="w-[22px] h-[22px] text-gray-400 bg-white rounded-full" />
      )}
    </div>
    <div>
      <p className={`font-medium ${isError ? 'text-red-500' : 'text-gray-900'}`}>{title}</p>
      {time && <p className="text-xs text-gray-500 mt-1">{format(new Date(time + 'Z'), 'dd/MM/yyyy HH:mm:ss')}</p>}
    </div>
  </div>
);

function SmsDetailModal({ isOpen, onClose, log, devices = [] }) {
  const { user } = useContext(AuthContext);

  if (!isOpen || !log) return null;

  // Mask payload to hide sensitive tokens
  const maskSensitiveInfo = (str) => {
    if (!str) return str;
    try {
      let obj = typeof str === 'string' ? JSON.parse(str) : str;
      if (typeof obj === 'object') {
        const masked = { ...obj };
        if (masked.api_key) masked.api_key = '***MASKED***';
        if (masked.token) masked.token = '***MASKED***';
        // Add more fields if needed
        return JSON.stringify(masked, null, 2);
      }
    } catch (e) {
      // not JSON or parse error, try regex mask
      return str.replace(/(api_key|token)["\s:]+([^"}\s,]+)/gi, '$1": "***MASKED***"');
    }
    return str;
  };

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`Đã copy ${label}`);
  };

  const deviceName = log.device_id 
    ? (devices.find(d => d.device_id === log.device_id)?.device_name || `***${log.device_id.substring(log.device_id.length - 4)}`)
    : '-';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in-down">
      <div className="card p-6 md:p-8 w-full max-w-4xl relative flex flex-col max-h-[90vh]">
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-full transition"
        >
          <X className="w-5 h-5" />
        </button>
        
        <h2 className="text-xl font-bold mb-6 text-gray-900 flex items-center">
          Chi tiết tin nhắn SMS
        </h2>
        
        <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
          
          {/* Main Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
              <p className="text-sm text-gray-500 mb-1">Trạng thái hiện tại</p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-blue-600">{getSmsStatusLabel(log.status)}</span>
              </div>
              <p className="text-xs text-gray-600 mt-2">{getSmsStatusDescription(log.status)}</p>
            </div>
            
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Số điện thoại:</span>
                <span className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  {log.phone_number}
                  <button onClick={() => handleCopy(log.phone_number, 'số điện thoại')} className="text-gray-400 hover:text-blue-600"><Copy className="w-3 h-3" /></button>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Mã Log (ID):</span>
                <span className="text-xs font-mono text-gray-600 truncate max-w-[150px]">{log.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Request ID:</span>
                <span className="text-xs font-mono text-gray-600 truncate max-w-[150px]">{log.request_id || '-'}</span>
              </div>
            </div>
            
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Thiết bị gửi:</span>
                <span className="text-sm font-semibold text-gray-900">{deviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Nhà mạng phát hiện:</span>
                <span className="text-sm font-semibold text-gray-900">{log.detected_provider || '-'}</span>
              </div>
            </div>
            
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Chiến lược định tuyến:</span>
                <span className="text-sm font-semibold text-gray-900">{log.routing_strategy || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Lần thử lại:</span>
                <span className="text-sm font-semibold text-gray-900">{log.retry_count} / {log.max_retries}</span>
              </div>
            </div>
          </div>

          {/* Message Content */}
          <div>
            <div className="flex justify-between items-end mb-3">
              <h3 className="text-sm font-bold text-gray-900">Nội dung tin nhắn:</h3>
              <button onClick={() => handleCopy(log.message, 'nội dung')} className="text-xs flex items-center text-blue-600 hover:text-blue-700">
                <Copy className="w-3 h-3 mr-1" /> Copy
              </button>
            </div>
            <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
              {log.message}
            </div>
          </div>

          {/* Timeline & Status Details */}
          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-4">Tiến trình gửi:</h3>
            <div className="bg-gray-50 border border-gray-200 p-6 rounded-xl">
              
              <TimelineStep 
                title="Tạo yêu cầu" 
                time={log.created_at} 
                active={true} 
              />
              
              {(log.status === 'sending' || log.last_attempt_at) && (
                <TimelineStep 
                  title="Đang gửi xuống Gateway" 
                  time={log.last_attempt_at || log.updated_at} 
                  active={true} 
                />
              )}
              
              {(['gateway_accepted', 'sent', 'delivered'].includes(log.status)) && (
                <TimelineStep 
                  title="Gateway đã nhận lệnh" 
                  time={log.updated_at} 
                  active={true} 
                />
              )}

              {(['sent', 'delivered'].includes(log.status)) && (
                <TimelineStep 
                  title="Đã gửi qua SIM" 
                  time={log.sent_at || log.updated_at} 
                  active={true} 
                />
              )}

              {log.status === 'delivered' && (
                <TimelineStep 
                  title="Đã giao đến người nhận" 
                  time={log.delivered_at || log.updated_at} 
                  active={true} 
                />
              )}

              {['failed', 'delivery_failed'].includes(log.status) && (
                <TimelineStep 
                  title={`Lỗi: ${log.error_message || log.delivery_error || 'Gửi thất bại'}`} 
                  time={log.updated_at} 
                  active={true} 
                  isError={true}
                />
              )}
              
            </div>
          </div>

          {/* Admin Debug Panel */}
          {user?.role === 'admin' && (
            <div>
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center text-purple-600">
                Khu vực Debug (Chỉ Admin)
              </h3>
              <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl space-y-4">
                {log.gateway_response && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Gateway Response:</p>
                    <pre className="text-[10px] text-gray-700 bg-white border border-purple-100 p-3 rounded-xl overflow-x-auto">
                      {maskSensitiveInfo(log.gateway_response)}
                    </pre>
                  </div>
                )}
                {log.callback_payload && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Callback Payload:</p>
                    <pre className="text-[10px] text-gray-700 bg-white border border-purple-100 p-3 rounded-xl overflow-x-auto">
                      {maskSensitiveInfo(log.callback_payload)}
                    </pre>
                  </div>
                )}
                {(!log.gateway_response && !log.callback_payload) && (
                  <p className="text-xs text-gray-500">Không có dữ liệu debug thêm.</p>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default SmsDetailModal;
