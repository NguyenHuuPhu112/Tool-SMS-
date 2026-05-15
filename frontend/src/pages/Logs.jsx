import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { RefreshCw, Search, XCircle, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { getStatusLabel } from '../utils/constants';

function Logs() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const limit = 20;

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

  const getStatusColor = (status) => {
    switch (status) {
      case 'sent': case 'gateway_accepted': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'failed': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'retrying': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'cancelled': return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  const handleSearch = (e) => {
    setPhoneSearch(e.target.value);
    setPage(0);
  };

  return (
    <div className="space-y-6 animate-fade-in-down h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Lịch sử SMS</h1>
        <button 
          onClick={() => refetch()} 
          className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/5"
        >
          <RefreshCw className={`w-5 h-5 text-gray-300 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-[#121214] border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center shadow-lg">
        <div className="relative flex-1 w-full">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input 
            type="text" 
            placeholder="Tìm kiếm số điện thoại..."
            value={phoneSearch}
            onChange={handleSearch}
            className="w-full bg-black/50 border border-gray-800 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <select 
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="bg-black/50 border border-gray-800 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500 w-full md:w-auto"
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

      <div className="bg-[#121214] border border-white/5 rounded-2xl overflow-hidden shadow-lg flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/5">
                <th className="p-4 text-gray-400 font-semibold text-sm">Thời gian</th>
                <th className="p-4 text-gray-400 font-semibold text-sm">SĐT</th>
                <th className="p-4 text-gray-400 font-semibold text-sm">Nội dung</th>
                <th className="p-4 text-gray-400 font-semibold text-sm">Trạng thái</th>
                <th className="p-4 text-gray-400 font-semibold text-sm">Lỗi</th>
                <th className="p-4 text-gray-400 font-semibold text-sm text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-500">Đang tải...</td></tr>
              ) : data?.items?.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-gray-500">Không tìm thấy dữ liệu.</td></tr>
              ) : (
                data?.items?.map(log => (
                  <tr key={log.id} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                    <td className="p-4 text-gray-300 text-sm whitespace-nowrap">
                      {format(new Date(log.created_at + 'Z'), 'dd/MM HH:mm:ss')}
                    </td>
                    <td className="p-4 font-medium text-white whitespace-nowrap">{log.phone_number}</td>
                    <td className="p-4 text-gray-400 text-sm max-w-xs truncate" title={log.message}>
                      {log.message}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold border ${getStatusColor(log.status)}`}>
                        {getStatusLabel(log.status)}
                      </span>
                    </td>
                    <td className="p-4 text-red-400 text-xs max-w-[150px] truncate" title={log.error_message}>
                      {log.error_message || '-'}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      {log.status === 'failed' && (
                        <button 
                          onClick={() => retryMutation.mutate(log.id)}
                          className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition mr-2"
                          title="Gửi lại"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {['pending', 'queued', 'retrying'].includes(log.status) && (
                        <button 
                          onClick={() => cancelMutation.mutate(log.id)}
                          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
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
        <div className="p-4 border-t border-white/5 flex justify-between items-center bg-black/20">
          <span className="text-sm text-gray-500">
            Tổng cộng: <strong className="text-white">{data?.total || 0}</strong> tin nhắn
          </span>
          <div className="flex gap-2">
            <button 
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg disabled:opacity-50 text-sm"
            >
              Trang trước
            </button>
            <span className="px-3 py-1 text-sm text-gray-400">Trang {page + 1}</span>
            <button 
              onClick={() => setPage(p => p + 1)}
              disabled={!data?.items || data.items.length < limit}
              className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg disabled:opacity-50 text-sm"
            >
              Trang sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Logs;
