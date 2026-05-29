import React, { useState, useRef, useEffect, useContext } from 'react';
import { 
  UploadCloud, MessageSquare, Send, CheckCircle2, AlertCircle, 
  FileText, X, Settings as SettingsIcon, Save, LogOut, Shield, 
  Smartphone, Activity, Clock
} from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import axios from 'axios';
import { parseFile } from '../utils/fileParser';
import { pollSmsStatus } from '../utils/smsPolling';
import { getSmsStatusColor, getSmsStatusLabel, SUCCESS_STATUSES, FAILED_STATUSES } from '../utils/smsStatus';
import { AuthContext } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import PreviewModal from '../components/PreviewModal';
import SmsDetailModal from '../components/SmsDetailModal';
import { downloadBlob } from '../utils/downloadFile';

function Dashboard() {
  const { user, logout, token } = useContext(AuthContext);
  const navigate = useNavigate();

  // ─── Input State ──────────────────────────────────────────────
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [validNumbers, setValidNumbers] = useState([]);
  const [invalidNumbers, setInvalidNumbers] = useState([]);
  const [isDragActive, setIsDragActive] = useState(false);
  
  // ─── Gateway Data State ────────────────────────────────────────
  const [devices, setDevices] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  
  // ─── Sending Progress State ────────────────────────────────────
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(null);
  // progress format: { total: 0, current: 0, success: 0, failed: 0 }

  // ─── Modal State ───────────────────────────────────────────────
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  // ─── Settings Modal State ──────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [gatewaySettings, setGatewaySettings] = useState({ android_api_url: '' });
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);

  // ─── Initial Fetch & Polling ───────────────────────────────────
  useEffect(() => {
    fetchGatewayData();
    
    // Poll for device health and logs every 10 seconds
    const intervalId = setInterval(fetchGatewayData, 10000);
    return () => clearInterval(intervalId);
  }, []);

  const fetchGatewayData = async () => {
    try {
      const [healthRes, logsRes] = await Promise.all([
        axios.get('/api/gateway/device-health'),
        axios.get('/api/gateway/logs?limit=5')
      ]);
      setDevices(healthRes.data.devices || []);
      setRecentLogs(logsRes.data.items || []);
    } catch (err) {
      console.error("Lỗi khi lấy dữ liệu gateway:", err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/gateway/settings');
      setGatewaySettings({ android_api_url: res.data.android_api_url });
    } catch (err) {
      console.error("Lỗi khi tải cài đặt:", err);
    }
  };

  const openSettings = () => {
    fetchSettings();
    setShowSettings(true);
  };

  const saveSettings = async () => {
    setIsSettingsLoading(true);
    try {
      await axios.post('/api/gateway/settings', gatewaySettings);
      toast.success('Đã lưu cài đặt Gateway!');
      fetchGatewayData();
      setShowSettings(false);
    } catch (error) {
      toast.error('Lỗi khi lưu cài đặt!');
    } finally {
      setIsSettingsLoading(false);
    }
  };

  const handleExportTemplate = async () => {
    try {
      const res = await axios.get(`/api/gateway/customers/export-template`, {
        responseType: 'blob'
      });
      downloadBlob(res, 'SMS_Template.xlsx');
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi tải mẫu');
    }
  };

  // ─── File Handling ─────────────────────────────────────────────
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = async (selectedFile) => {
    const allowedExtensions = ['.txt', '.csv', '.xlsx', '.xls'];
    const isAllowed = allowedExtensions.some(ext => selectedFile.name.toLowerCase().endsWith(ext));
    if (!isAllowed) {
      toast.error('Chỉ hỗ trợ file .txt, .csv, hoặc Excel (.xlsx, .xls)');
      return;
    }

    setFile(selectedFile);
    try {
      const result = await parseFile(selectedFile);
      setValidNumbers(result.valid);
      setInvalidNumbers(result.invalid);
      toast.success(`Đã quét được ${result.valid.length} số hợp lệ`);
    } catch (err) {
      toast.error(err.message || 'Lỗi khi đọc file');
      setFile(null);
    }
  };

  const removeFile = () => {
    setFile(null);
    setValidNumbers([]);
    setInvalidNumbers([]);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Batch Sending Logic ───────────────────────────────────────
  const handleSend = async () => {
    if (validNumbers.length === 0) {
      toast.error('Chưa có số điện thoại nào hợp lệ!');
      return;
    }
    if (!message.trim()) {
      toast.error('Vui lòng nhập nội dung tin nhắn!');
      return;
    }

    const isOnline = devices.some(d => d.online);
    if (!isOnline) {
      toast.error('Không có thiết bị Android nào đang online!');
      return;
    }

    setIsPreviewOpen(false);
    setIsSending(true);
    const total = validNumbers.length;
    setProgress({ total, current: 0, accepted: 0, success: 0, failed: 0 });
    
    let acceptedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    const batchId = Date.now();
    const logIdsToTrack = []; // Track log IDs for polling

    // Phase 1: Submit all SMS requests
    toast('Đang gửi yêu cầu SMS...', { icon: '📤', duration: 3000 });

    for (let i = 0; i < total; i++) {
      const phone = validNumbers[i].phone;
      const requestId = `batch-${batchId}-${phone}`;
      
      try {
        console.log(`[SMS Send] Submitting SMS ${i + 1}/${total} to ${phone}`, {
          phone_number: phone,
          message: message.trim(),
          request_id: requestId,
        });

        const res = await axios.post('/api/gateway/send-sms', {
          phone_number: phone,
          message: message.trim(),
          request_id: requestId
        });

        console.log(`[SMS Send] Response for ${phone}:`, res.data);

        // Backend returns { status: "accepted", log_id: "...", ... }
        if (res.data.log_id) {
          acceptedCount++;
          logIdsToTrack.push({
            logId: res.data.log_id,
            phone,
          });
        }
      } catch (err) {
        console.error(`[SMS Send] Error submitting to ${phone}:`, err.response?.data || err.message);
        failedCount++;
      }
      
      setProgress({
        total,
        current: i + 1,
        accepted: acceptedCount,
        success: successCount,
        failed: failedCount
      });
    }

    // Phase 2: Poll for real delivery status
    if (logIdsToTrack.length > 0) {
      toast(`Đã tiếp nhận ${acceptedCount}/${total} yêu cầu. Đang kiểm tra trạng thái gửi...`, {
        icon: '⏳',
        duration: 5000,
      });

      // Poll all submitted SMS logs in parallel
      const pollPromises = logIdsToTrack.map(async ({ logId, phone }) => {
        const result = await pollSmsStatus(logId, {
          maxAttempts: 10,
          interval: 2000,
          onStatusChange: (newStatus, log) => {
            console.log(`[SMS Poll] ${phone} (${logId}): ${newStatus}`);
          },
        });

        // Update counts based on real status
        if (SUCCESS_STATUSES.has(result.status)) {
          successCount++;
        } else if (FAILED_STATUSES.has(result.status)) {
          failedCount++;
          console.warn(`[SMS Poll] ${phone} failed: ${result.error_message}`);
        } else if (result.timedOut) {
          // Still processing, don't count as failed
          console.warn(`[SMS Poll] ${phone} still processing after timeout. Last: ${result.status}`);
        }

        setProgress({
          total,
          current: total,
          accepted: acceptedCount,
          success: successCount,
          failed: failedCount
        });

        return { phone, ...result };
      });

      const pollResults = await Promise.allSettled(pollPromises);

      // Count timed-out items
      const timedOutCount = pollResults.filter(
        r => r.status === 'fulfilled' && r.value.timedOut
      ).length;

      // Show final summary
      if (successCount > 0) {
        toast.success(`Gửi SMS thành công: ${successCount}/${total}`);
      }
      if (failedCount > 0) {
        toast.error(`Gửi SMS thất bại: ${failedCount}/${total}`);
      }
      if (timedOutCount > 0) {
        toast(`${timedOutCount} SMS vẫn đang được xử lý, vui lòng kiểm tra lại lịch sử gửi.`, {
          icon: '⏳',
          duration: 6000,
        });
      }
    } else {
      toast.error('Không có yêu cầu nào được tiếp nhận!');
    }

    setIsSending(false);
    fetchGatewayData(); // Refresh logs immediately
  };

  const networkCount = validNumbers.reduce((acc, curr) => {
    acc[curr.network] = (acc[curr.network] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto space-y-6">
        {/* HEADER */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in-down">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 rounded-xl shadow-sm">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
                Gửi SMS Hàng Loạt
              </h1>
              <p className="text-gray-500 mt-1 text-sm font-medium">Xin chào <span className="text-gray-900 font-bold">{user?.username}</span></p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {user?.role === 'admin' && (
              <button onClick={() => navigate('/admin')} className="btn-secondary px-3 py-2 text-purple-600" title="Trang quản trị">
                <Shield className="w-4 h-4" />
              </button>
            )}
            <button onClick={openSettings} className="btn-secondary px-3 py-2 text-gray-600" title="Cài đặt Gateway">
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button onClick={() => { logout(); navigate('/login'); }} className="btn-secondary px-3 py-2 text-red-600" title="Đăng xuất">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* CỘT TRÁI - Nhập dữ liệu & Tiến trình */}
          <div className="lg:col-span-7 space-y-6 flex flex-col">
            
            <div className="card p-6 relative overflow-hidden group">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-extrabold tracking-tight flex items-center text-gray-900">
                  <UploadCloud className="w-5 h-5 mr-2 text-blue-600" /> Nhập Danh Sách SĐT
                </h2>
                <button onClick={handleExportTemplate} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  + Tải file mẫu
                </button>
              </div>
              
              {!file ? (
                <div 
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer bg-gray-50
                    ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-100'}`}
                  onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                  onClick={() => fileInputRef.current.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".txt,.csv,.xlsx,.xls" className="hidden" onChange={handleChange} />
                  <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm mb-4">
                    <FileText className={`w-6 h-6 ${isDragActive ? 'text-blue-600' : 'text-gray-500'}`} />
                  </div>
                  <p className="text-sm font-medium text-gray-900">Kéo thả file Excel, CSV, TXT vào đây</p>
                  <p className="text-xs text-gray-500 mt-1">hoặc click để chọn tệp</p>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-white rounded-lg shadow-sm border border-blue-100">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{file.name}</p>
                      <div className="flex gap-3 text-xs mt-1">
                        <span className="text-gray-500">{(file.size / 1024).toFixed(2)} KB</span>
                        <span className="text-emerald-600 font-medium">{validNumbers.length} số hợp lệ</span>
                        {invalidNumbers.length > 0 && <span className="text-red-600 font-medium">{invalidNumbers.length} lỗi</span>}
                      </div>
                      {validNumbers.length > 0 && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {Object.entries(networkCount).map(([network, count]) => (
                            <span key={network} className="text-[10px] px-2 py-0.5 rounded bg-white text-gray-600 border border-gray-200 shadow-sm">
                              {network}: <b>{count}</b>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={removeFile} disabled={isSending} className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition disabled:opacity-50">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Box Nhập tin nhắn */}
            <div className="card p-6 flex-grow">
              <h2 className="text-lg font-extrabold tracking-tight flex items-center mb-4 text-gray-900">
                <MessageSquare className="w-5 h-5 mr-2 text-blue-600" /> Nội Dung Tin Nhắn
              </h2>
              <textarea 
                value={message}
                onChange={e => setMessage(e.target.value)}
                disabled={isSending}
                placeholder="Nhập nội dung quảng cáo, thông báo..."
                className="input-field h-40 resize-none bg-gray-50"
              ></textarea>
              <div className="flex justify-end mt-2">
                <p className={`text-xs font-medium px-2 py-1 rounded ${message.length > 160 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
                  {message.length} ký tự {message.length > 160 && '(Sẽ tách làm nhiều tin)'}
                </p>
              </div>
            </div>

          </div>

          {/* CỘT PHẢI - Device & Status */}
          <div className="lg:col-span-5 space-y-6 flex flex-col">
            
            {/* Action Card */}
            <div className="card p-6 bg-gradient-to-b from-white to-gray-50 border-blue-100">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-extrabold tracking-tight text-gray-900">Thiết bị Gateway</h2>
                <span className="flex h-2.5 w-2.5 relative">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${devices.some(d => d.online) ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${devices.some(d => d.online) ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                </span>
              </div>

              {/* Devices List */}
              <div className="space-y-2 mb-6">
                {devices.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-2">Đang kiểm tra thiết bị...</p>
                ) : (
                  devices.map((device, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white border border-gray-200 shadow-sm p-3 rounded-xl">
                      <div className="flex items-center gap-3">
                        <Smartphone className={`w-5 h-5 ${device.online ? 'text-emerald-600' : 'text-red-600'}`} />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{device.device_name}</p>
                          <p className="text-[10px] text-gray-500 truncate max-w-[150px]">{device.base_url}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md ${device.online ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {device.online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Progress Tracker (If active or completed) */}
              {progress && (
                <div className="mb-6 bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                  <div className="flex justify-between text-sm mb-2 font-medium">
                    <span className="text-gray-700">Tiến trình gửi</span>
                    <span className="text-blue-600">{progress.current} / {progress.total}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-4 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-blue-50 border border-blue-100 text-blue-700 py-1.5 px-1 rounded-lg">
                      Đã nhận: <b>{progress.accepted || 0}</b>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 py-1.5 px-1 rounded-lg">
                      Đã gửi: <b>{progress.success}</b>
                    </div>
                    <div className="bg-red-50 border border-red-100 text-red-700 py-1.5 px-1 rounded-lg">
                      Thất bại: <b>{progress.failed}</b>
                    </div>
                  </div>
                </div>
              )}

              {/* Gửi Button */}
              <button 
                onClick={() => setIsPreviewOpen(true)}
                disabled={isSending || validNumbers.length === 0 || !devices.some(d => d.online)}
                className="btn-primary w-full py-3 text-base shadow-md"
              >
                {isSending ? (
                  <>
                    <Activity className="w-5 h-5 animate-pulse" /> Đang xử lý...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" /> Bắt đầu gửi
                  </>
                )}
              </button>
            </div>

            {/* Recent Logs Box */}
            <div className="card p-6 flex-grow">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-extrabold tracking-tight flex items-center text-gray-900">
                  <Clock className="w-4 h-4 mr-2 text-blue-600" /> Log gửi gần đây
                </h2>
                <button onClick={fetchGatewayData} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Làm mới</button>
              </div>
              
              <div className="space-y-2">
                {recentLogs.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">Chưa có dữ liệu</p>
                ) : (
                  recentLogs.map((log) => (
                    <div 
                      key={log.id} 
                      onClick={() => { setSelectedLog(log); setIsDetailOpen(true); }}
                      className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-100 transition"
                    >
                      <div className="truncate pr-2">
                        <p className="text-sm text-gray-900 font-semibold">{log.phone_number}</p>
                        <p className="text-[10px] text-gray-500 truncate max-w-[180px] mt-0.5">{log.message}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${getSmsStatusColor(log.status)}`}>
                        {getSmsStatusLabel(log.status)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </main>


      {/* ─── Settings Modal ─── */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in-down">
          <div className="card p-6 md:p-8 w-full max-w-md relative">
            <button 
              onClick={() => setShowSettings(false)}
              className="absolute top-5 right-5 p-2 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-full transition"
            >
              <X className="w-4 h-4" />
            </button>
            <h2 className="text-xl font-extrabold tracking-tight mb-6 text-gray-900 flex items-center">
              <SettingsIcon className="w-5 h-5 mr-3 text-blue-600" /> Cài đặt SMS Gateway
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="label-text">Android API URL</label>
                <input 
                  type="text" 
                  value={gatewaySettings.android_api_url} 
                  onChange={e => setGatewaySettings({...gatewaySettings, android_api_url: e.target.value})}
                  className="input-field"
                  placeholder="http://192.168.1.100:8080/v1/sms"
                />
                <p className="text-xs text-gray-500 mt-2">Nhập địa chỉ IP hiển thị trên ứng dụng SMS Gateway trên điện thoại.</p>
              </div>
            </div>

            <button 
              onClick={saveSettings}
              disabled={isSettingsLoading}
              className="btn-primary w-full mt-8"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSettingsLoading ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Modals ─── */}
      <PreviewModal 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        onConfirm={handleSend}
        validNumbers={validNumbers}
        message={message}
        isSending={isSending}
      />

      <SmsDetailModal 
        isOpen={isDetailOpen}
        onClose={() => { setIsDetailOpen(false); setSelectedLog(null); }}
        log={selectedLog}
        devices={devices}
      />

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fade-in-down {
          0% { opacity: 0; transform: translateY(-10px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fade-in-down { animation: fade-in-down 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}} />
    </div>
  );
}

export default Dashboard;
