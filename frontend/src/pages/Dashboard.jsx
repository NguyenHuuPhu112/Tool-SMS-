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
import { getStatusLabel, SUCCESS_STATUSES, FAILED_STATUSES } from '../utils/constants';
import { AuthContext } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

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

  // ─── Helpers ───────────────────────────────────────────────────
  const getStatusColor = (status) => {
    switch (status) {
      case 'sent': case 'gateway_accepted': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      case 'failed': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'retrying': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'pending': case 'queued': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
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
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-[0_0_20px_rgba(99,102,241,0.4)]">
              <Smartphone className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                Android SMS Gateway
              </h1>
              <p className="text-gray-400 mt-1">Xin chào <span className="text-white font-bold">{user?.username}</span></p>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-white/5 border border-white/10 p-2 rounded-full">
            {user?.role === 'admin' && (
              <button onClick={() => navigate('/admin')} className="p-2.5 bg-purple-500/10 hover:bg-purple-500/20 rounded-full transition-all text-purple-400">
                <Shield className="w-5 h-5" />
              </button>
            )}
            <button onClick={openSettings} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full transition-all text-gray-300">
              <SettingsIcon className="w-5 h-5" />
            </button>
            <button onClick={() => { logout(); navigate('/login'); }} className="p-2.5 bg-red-500/10 hover:bg-red-500/20 rounded-full transition-all text-red-400">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* CỘT TRÁI - Nhập dữ liệu & Tiến trình */}
          <div className="lg:col-span-7 space-y-6 flex flex-col">
            
            {/* Box Tải File */}
            <div className="bg-[#121214] border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
              <h2 className="text-lg font-semibold flex items-center mb-4 text-white">
                <UploadCloud className="w-5 h-5 mr-2 text-indigo-400" /> Nhập Danh Sách SĐT
              </h2>
              
              {!file ? (
                <div 
                  className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer 
                    ${isDragActive ? 'border-indigo-400 bg-indigo-500/10 scale-[1.02]' : 'border-gray-700 hover:border-indigo-500/50 hover:bg-white/[0.02]'}`}
                  onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                  onClick={() => fileInputRef.current.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".txt,.csv,.xlsx,.xls" className="hidden" onChange={handleChange} />
                  <div className="p-4 bg-gray-800/50 rounded-full mb-4">
                    <FileText className={`w-8 h-8 ${isDragActive ? 'text-indigo-400' : 'text-gray-400'}`} />
                  </div>
                  <p className="text-base font-medium text-gray-200">Kéo thả file Excel, CSV, TXT vào đây</p>
                  <p className="text-sm text-gray-500 mt-1">hoặc click để chọn tệp</p>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-500/20 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="p-3 bg-indigo-500/20 rounded-xl">
                      <FileText className="w-6 h-6 text-indigo-300" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">{file.name}</p>
                      <div className="flex gap-3 text-xs mt-1">
                        <span className="text-gray-400">{(file.size / 1024).toFixed(2)} KB</span>
                        <span className="text-emerald-400 font-medium">{validNumbers.length} số hợp lệ</span>
                        {invalidNumbers.length > 0 && <span className="text-red-400 font-medium">{invalidNumbers.length} lỗi</span>}
                      </div>
                      {validNumbers.length > 0 && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {Object.entries(networkCount).map(([network, count]) => (
                            <span key={network} className="text-[10px] px-2 py-1 rounded-md bg-white/10 text-gray-300 border border-white/5">
                              {network}: <b>{count}</b>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={removeFile} disabled={isSending} className="p-2 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition disabled:opacity-50">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Box Nhập tin nhắn */}
            <div className="bg-[#121214] border border-white/5 rounded-3xl p-6 shadow-xl flex-grow">
              <h2 className="text-lg font-semibold flex items-center mb-4 text-white">
                <MessageSquare className="w-5 h-5 mr-2 text-indigo-400" /> Nội Dung Tin Nhắn
              </h2>
              <textarea 
                value={message}
                onChange={e => setMessage(e.target.value)}
                disabled={isSending}
                placeholder="Nhập nội dung quảng cáo, thông báo..."
                className="w-full bg-[#09090b] border border-gray-800 rounded-2xl p-4 text-gray-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-none h-40 transition disabled:opacity-50"
              ></textarea>
              <div className="flex justify-end mt-2">
                <p className={`text-xs font-medium px-2 py-1 rounded-md ${message.length > 160 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-gray-800 text-gray-400'}`}>
                  {message.length} ký tự {message.length > 160 && '(Sẽ tách làm nhiều tin)'}
                </p>
              </div>
            </div>

          </div>

          {/* CỘT PHẢI - Device & Status */}
          <div className="lg:col-span-5 space-y-6 flex flex-col">
            
            {/* Action Card */}
            <div className="bg-gradient-to-b from-[#121214] to-[#0f111a] border border-indigo-500/20 rounded-3xl p-6 shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-white">Thiết bị Gateway</h2>
                <span className="flex h-3 w-3 relative">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${devices.some(d => d.online) ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-3 w-3 ${devices.some(d => d.online) ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                </span>
              </div>

              {/* Devices List */}
              <div className="space-y-3 mb-6">
                {devices.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-2">Đang kiểm tra thiết bị...</p>
                ) : (
                  devices.map((device, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-black/40 border border-white/5 p-3 rounded-xl">
                      <div className="flex items-center gap-3">
                        <Smartphone className={`w-5 h-5 ${device.online ? 'text-emerald-400' : 'text-red-400'}`} />
                        <div>
                          <p className="text-sm font-medium text-gray-200">{device.device_name}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[150px]">{device.base_url}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md ${device.online ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {device.online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Progress Tracker (If active or completed) */}
              {progress && (
                <div className="mb-6 bg-black/40 rounded-2xl p-4 border border-white/5">
                  <div className="flex justify-between text-sm mb-2 font-medium">
                    <span className="text-gray-300">Tiến trình gửi</span>
                    <span className="text-indigo-400">{progress.current} / {progress.total}</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2 mb-4 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-2 rounded-xl">
                      Đã tiếp nhận: <b>{progress.accepted || 0}</b>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-2 rounded-xl">
                      Đã gửi: <b>{progress.success}</b>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-2 rounded-xl">
                      Thất bại: <b>{progress.failed}</b>
                    </div>
                  </div>
                </div>
              )}

              {/* Gửi Button */}
              <button 
                onClick={handleSend}
                disabled={isSending || validNumbers.length === 0 || !devices.some(d => d.online)}
                className="w-full relative group overflow-hidden bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg rounded-2xl py-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_10px_20px_-10px_rgba(99,102,241,0.5)]"
              >
                <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out"></div>
                <span className="relative flex items-center justify-center gap-2">
                  {isSending ? (
                    <>
                      <Activity className="w-5 h-5 animate-pulse" /> Đang xử lý...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" /> Bắt đầu gửi
                    </>
                  )}
                </span>
              </button>
            </div>

            {/* Recent Logs Box */}
            <div className="bg-[#121214] border border-white/5 rounded-3xl p-6 shadow-xl flex-grow">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold flex items-center text-gray-300">
                  <Clock className="w-4 h-4 mr-2 text-indigo-400" /> Log gửi gần đây
                </h2>
                <button onClick={fetchGatewayData} className="text-xs text-indigo-400 hover:text-indigo-300">Làm mới</button>
              </div>
              
              <div className="space-y-2">
                {recentLogs.length === 0 ? (
                  <p className="text-xs text-gray-600 text-center py-4">Chưa có dữ liệu</p>
                ) : (
                  recentLogs.map((log) => (
                    <div key={log.id} className="flex justify-between items-center bg-black/30 p-2.5 rounded-xl border border-white/5">
                      <div className="truncate pr-2">
                        <p className="text-sm text-gray-200 font-medium">{log.phone_number}</p>
                        <p className="text-[10px] text-gray-500 truncate max-w-[180px]">{log.message}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md border whitespace-nowrap ${getStatusColor(log.status)}`}>
                        {getStatusLabel(log.status)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in-down">
          <div className="bg-[#121214] border border-white/10 rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowSettings(false)}
              className="absolute top-5 right-5 p-2 text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition"
            >
              <X className="w-4 h-4" />
            </button>
            <h2 className="text-xl font-bold mb-6 text-white flex items-center">
              <SettingsIcon className="w-5 h-5 mr-3 text-indigo-400" /> Cài đặt SMS Gateway
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Android API URL</label>
                <input 
                  type="text" 
                  value={gatewaySettings.android_api_url} 
                  onChange={e => setGatewaySettings({...gatewaySettings, android_api_url: e.target.value})}
                  className="w-full bg-black/50 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="http://192.168.1.100:8080/v1/sms"
                />
                <p className="text-xs text-gray-600 mt-2">Nhập địa chỉ IP hiển thị trên ứng dụng SMS Gateway trên điện thoại.</p>
              </div>
            </div>

            <button 
              onClick={saveSettings}
              disabled={isSettingsLoading}
              className="w-full mt-8 bg-white text-black hover:bg-gray-200 font-bold rounded-xl py-3 flex justify-center items-center transition disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSettingsLoading ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
        </div>
      )}

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
