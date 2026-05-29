import React from 'react';
import { X, AlertTriangle, Send } from 'lucide-react';

function PreviewModal({ isOpen, onClose, onConfirm, validNumbers, message, isSending }) {
  if (!isOpen) return null;

  const previewCount = Math.min(5, validNumbers.length);
  const previewNumbers = validNumbers.slice(0, previewCount);
  
  // Find numbers that were padded with 0 (assuming network property or length can hint, or just general warning)
  // For now, we'll just display a static warning if some numbers are 9 digits and start with 3,5,7,8,9 (meaning 0 was added).
  // Assume `fileParser.js` already added the 0 and returned it in validNumbers[].phone.
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in-down">
      <div className="card p-6 md:p-8 w-full max-w-2xl relative flex flex-col max-h-[90vh]">
        <button 
          onClick={onClose}
          disabled={isSending}
          className="absolute top-5 right-5 p-2 text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-full transition disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>
        
        <h2 className="text-xl font-bold mb-6 text-gray-900 flex items-center">
          <Send className="w-5 h-5 mr-3 text-blue-600" /> Xác nhận gửi SMS hàng loạt
        </h2>
        
        <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
              <p className="text-sm text-gray-500">Tổng số tin nhắn</p>
              <p className="text-2xl font-bold text-gray-900">{validNumbers.length}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
              <p className="text-sm text-gray-500">Độ dài nội dung</p>
              <p className="text-2xl font-bold text-gray-900">{message.length} <span className="text-sm font-normal text-gray-500">ký tự</span></p>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl flex gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-bold text-yellow-900 mb-1">Lưu ý chuẩn hóa số điện thoại</p>
              <p>Hệ thống đã tự động loại bỏ các ký tự không hợp lệ. Các số bị thiếu số 0 ở đầu có thể đã được tự động thêm vào (tuỳ thuộc vào logic file parser của bạn).</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-3">Nội dung sẽ gửi:</h3>
            <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm text-gray-700 text-sm whitespace-pre-wrap">
              {message}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex justify-between">
              <span>Bản xem trước (Hiển thị {previewCount}/{validNumbers.length} số đầu tiên)</span>
            </h3>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-gray-500 font-medium uppercase tracking-wider text-xs">STT</th>
                    <th className="p-3 text-gray-500 font-medium uppercase tracking-wider text-xs">Số điện thoại</th>
                    <th className="p-3 text-gray-500 font-medium uppercase tracking-wider text-xs">Nhà mạng phát hiện</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {previewNumbers.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-600">{idx + 1}</td>
                      <td className="p-3 text-gray-900 font-semibold">{item.phone}</td>
                      <td className="p-3 text-gray-600">{item.network || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <div className="mt-6 flex gap-3 pt-6 border-t border-gray-200">
          <button 
            onClick={onClose}
            disabled={isSending}
            className="flex-1 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 py-3 rounded-xl font-medium transition disabled:opacity-50 shadow-sm"
          >
            Hủy bỏ
          </button>
          <button 
            onClick={onConfirm}
            disabled={isSending}
            className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
          >
            {isSending ? (
              <>Đang xử lý...</>
            ) : (
              <>Xác nhận gửi <Send className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PreviewModal;
