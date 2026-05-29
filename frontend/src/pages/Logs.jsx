import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { RefreshCw, Search, XCircle, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { getSmsStatusLabel, getSmsStatusColor } from '../utils/smsStatus';
import SmsDetailModal from '../components/SmsDetailModal';
import { FileText, Eye, Download, FileSpreadsheet } from 'lucide-react';
import { downloadBlob } from '../utils/downloadFile';

function Logs() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const limit = 20;

  const { data: healthData } = useQuery({
    queryKey: ['deviceHealthLogs'],
    queryFn: async () => {
      const res = await axios.get('/api/gateway/device-health');
      return res.data;
    },
  });
  const devices = healthData?.devices || [];

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['logs', page, statusFilter, phoneSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit,
        offset: page * limit,
      });
      if (statusFilter) params.append('status_filter', statusFilter);
      if (phoneSearch) params.append('phone', phoneSearch);
      
      const res = await axios.get(`/api/gateway/logs?${params.toString()}`);
      return res.data;
    },
    refetchInterval: 10000, // Auto refresh every 10s
  });

  const retryMutation = useMutation({
    mutationFn: (id) => axios.post(`/api/gateway/logs/${id}/retry`),
    onSuccess: () => {
      toast.success('Đã xếp hàng gửi lại');
      queryClient.invalidateQueries(['logs']);
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Lỗi khi gửi lại')
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => axios.post(`/api/gateway/logs/${id}/cancel`),
    onSuccess: () => {
      toast.success('Đã hủy tin nhắn');
      queryClient.invalidateQueries(['logs']);
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Lỗi khi hủy')
  });

  const handleSearch = (e) => {
    setPhoneSearch(e.target.value);
    setPage(0);
  };

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (phoneSearch) params.append('keyword', phoneSearch);
      
      toast.loading('Đang xuất Excel...', { id: 'export-excel' });
      const res = await axios.get(`/api/gateway/customers/export-excel?${params.toString()}`, {
        responseType: 'blob'
      });
      downloadBlob(res, 'customers.xlsx');
      toast.success('Xuất Excel thành công', { id: 'export-excel' });
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi xuất Excel', { id: 'export-excel' });
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

  return (
    <div className="space-y-6 animate-fade-in-down h-full flex flex-col">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Lịch sử SMS</h1>
        <div className="flex gap-2 items-center">
          <button 
            onClick={handleExportTemplate} 
            className="btn-secondary"
            title="Tải file mẫu gửi SMS"
          >
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <span className="hidden sm:inline">Tải file mẫu</span>
          </button>
          <button 
            onClick={handleExportExcel} 
            className="btn-secondary"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Xuất Excel</span>
          </button>
          <button 
            onClick={() => refetch()} 
            className="btn-secondary"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="card p-4 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input 
            type="text" 
            placeholder="Tìm kiếm số điện thoại..."
            value={phoneSearch}
            onChange={handleSearch}
            className="input-field pl-10"
          />
        </div>
        <select 
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="input-field w-full md:w-auto"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Đang chờ gửi</option>
          <option value="queued">Đang xếp hàng</option>
          <option value="sending">Đang gửi</option>
          <option value="gateway_accepted">Gateway đã nhận</option>
          <option value="sent">Đã gửi</option>
          <option value="failed">Gửi thất bại</option>
          <option value="retrying">Đang thử lại</option>
          <option value="cancelled">Đã hủy</option>
        </select>
      </div>

      <div className="card overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 whitespace-nowrap">
                <th className="p-4 text-gray-500 font-medium text-xs uppercase tracking-wider">Thời gian tạo</th>
                <th className="p-4 text-gray-500 font-medium text-xs uppercase tracking-wider">SĐT</th>
                <th className="p-4 text-gray-500 font-medium text-xs uppercase tracking-wider">Nội dung</th>
                <th className="p-4 text-gray-500 font-medium text-xs uppercase tracking-wider">Trạng thái</th>
                <th className="p-4 text-gray-500 font-medium text-xs uppercase tracking-wider">Thiết bị</th>
                <th className="p-4 text-gray-500 font-medium text-xs uppercase tracking-wider">Nhà mạng</th>
                <th className="p-4 text-gray-500 font-medium text-xs uppercase tracking-wider text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-500">Đang tải...</td></tr>
              ) : data?.items?.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-500">Không tìm thấy dữ liệu.</td></tr>
              ) : (
                data?.items?.map(log => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="p-4 text-gray-600 text-sm whitespace-nowrap">
                      {format(new Date(log.created_at + 'Z'), 'dd/MM HH:mm')}
                    </td>
                    <td className="p-4 font-medium text-gray-900 whitespace-nowrap">{log.phone_number}</td>
                    <td className="p-4 text-gray-600 text-sm max-w-[200px]">
                      <div className="truncate mb-1">{log.message}</div>
                      <button 
                        onClick={() => { setSelectedLog(log); setIsDetailOpen(true); }}
                        className="text-blue-600 hover:text-blue-700 text-xs flex items-center mt-1"
                      >
                        <FileText className="w-3 h-3 mr-1" /> Xem đầy đủ
                      </button>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold border whitespace-nowrap ${getSmsStatusColor(log.status)}`}>
                        {getSmsStatusLabel(log.status)}
                      </span>
                      {log.error_message && (
                        <p className="text-red-500 text-[10px] mt-1 max-w-[150px] truncate" title={log.error_message}>
                          Lỗi: {log.error_message}
                        </p>
                      )}
                    </td>
                    <td className="p-4 text-gray-600 text-sm whitespace-nowrap">
                      {log.device_id ? (devices.find(d => d.device_id === log.device_id)?.device_name || `***${log.device_id.substring(log.device_id.length - 4)}`) : '-'}
                    </td>
                    <td className="p-4 text-gray-600 text-sm whitespace-nowrap">
                      {log.detected_provider || '-'}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap space-x-2">
                      <button 
                        onClick={() => { setSelectedLog(log); setIsDetailOpen(true); }}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition inline-flex"
                        title="Xem chi tiết"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {log.status === 'failed' && (
                        <button 
                          onClick={() => retryMutation.mutate(log.id)}
                          className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition inline-flex"
                          title="Gửi lại"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {['pending', 'queued', 'retrying'].includes(log.status) && (
                        <button 
                          onClick={() => cancelMutation.mutate(log.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition inline-flex"
                          title="Hủy"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="p-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
          <span className="text-sm text-gray-600">
            Tổng cộng: <strong className="text-gray-900">{data?.total || 0}</strong> tin nhắn
          </span>
          <div className="flex gap-2">
            <button 
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg disabled:opacity-50 text-sm shadow-sm"
            >
              Trang trước
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-600 font-medium">Trang {page + 1}</span>
            <button 
              onClick={() => setPage(p => p + 1)}
              disabled={!data?.items || data.items.length < limit}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg disabled:opacity-50 text-sm shadow-sm"
            >
              Trang sau
            </button>
          </div>
        </div>
      </div>

      <SmsDetailModal 
        isOpen={isDetailOpen}
        onClose={() => { setIsDetailOpen(false); setSelectedLog(null); }}
        log={selectedLog}
        devices={devices}
      />
    </div>
  );
}

export default Logs;
