import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import { Send, AlertTriangle, Clock, Activity, TrendingUp, Users } from 'lucide-react';

const COLORS = ['#10b981', '#ef4444', '#f59e0b']; // Success, Failed, Pending
const USER_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#f43f5e'];

function Overview() {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get('/api/gateway/stats');
        setStats(res.data);
      } catch (error) {
        console.error("Failed to fetch stats", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
    
    // Auto refresh every 5 seconds for real-time
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-blue-600">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="animate-pulse font-medium text-gray-600">Đang đồng bộ dữ liệu Real-time...</p>
      </div>
    );
  }

  const kpis = stats?.kpis || { total_sent: 0, today_sent: 0, pending: 0, failed_today: 0 };
  const chartData = stats?.chart_data || [];
  const userStats = stats?.user_stats || [];
  
  const pieData = [
    { name: 'Thành công', value: kpis.today_sent },
    { name: 'Thất bại', value: kpis.failed_today },
    { name: 'Đang chờ', value: kpis.pending }
  ];

  return (
    <div className="space-y-8 animate-fade-in-down">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Tổng quan Hệ thống
          </h1>
          <p className="text-gray-500 mt-1 flex items-center text-sm">
            <span className="relative flex h-2 w-2 mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Cập nhật Live (mỗi 5s)
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6 relative overflow-hidden group hover:border-blue-300 transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-500 text-sm font-medium">Tổng SMS đã gửi</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-2">{kpis.total_sent.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
              <Activity className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="card p-6 relative overflow-hidden group hover:border-emerald-300 transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-500 text-sm font-medium">Đã gửi hôm nay</p>
              <h3 className="text-3xl font-bold text-emerald-600 mt-2">{kpis.today_sent.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
              <Send className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="card p-6 relative overflow-hidden group hover:border-yellow-300 transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-500 text-sm font-medium">Đang chờ xử lý</p>
              <h3 className="text-3xl font-bold text-yellow-600 mt-2">{kpis.pending.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-yellow-50 rounded-xl text-yellow-600">
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="card p-6 relative overflow-hidden group hover:border-red-300 transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-gray-500 text-sm font-medium">Lỗi hôm nay</p>
              <h3 className="text-3xl font-bold text-red-600 mt-2">{kpis.failed_today.toLocaleString()}</h3>
            </div>
            <div className="p-3 bg-red-50 rounded-xl text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Primary Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Area Chart */}
        <div className="lg:col-span-2 card p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-blue-500" /> Lưu lượng SMS (24H)
            </h2>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#9ca3af" tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} />
                <YAxis stroke="#9ca3af" tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} />
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '8px', color: '#111827', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ fontWeight: 500 }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Area type="monotone" dataKey="sent" name="Thành công" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSent)" />
                <Area type="monotone" dataKey="failed" name="Thất bại" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorFailed)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart */}
        <div className="card p-6 flex flex-col">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Tỉ lệ trạng thái</h2>
          <p className="text-xs text-gray-500 mb-6">Phân bổ tin nhắn trong ngày hôm nay</p>
          
          <div className="flex-grow flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '8px', color: '#111827' }}
                  itemStyle={{ fontWeight: 500 }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-3xl font-bold text-gray-900">
                {(kpis.today_sent + kpis.failed_today + kpis.pending).toLocaleString()}
              </span>
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-1">Tổng cộng</span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {pieData.map((entry, index) => (
              <div key={index} className="flex justify-between items-center">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: COLORS[index] }}></div>
                  <span className="text-sm text-gray-700 font-medium">{entry.name}</span>
                </div>
                <span className="text-sm font-bold text-gray-900">{entry.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* User Statistics Section (Admin Only) */}
      {userStats && userStats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in-up">
          
          {/* User Bar Chart */}
          <div className="lg:col-span-2 card p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-900 flex items-center">
                <Users className="w-5 h-5 mr-2 text-blue-500" /> Top Users Gửi SMS
              </h2>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userStats} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" stroke="#9ca3af" tick={{fill: '#6b7280'}} />
                  <YAxis dataKey="name" type="category" stroke="#9ca3af" tick={{fill: '#4b5563', fontWeight: 500}} width={80} />
                  <Tooltip 
                    cursor={{fill: '#f3f4f6', opacity: 0.4}}
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '8px', color: '#111827' }}
                  />
                  <Bar dataKey="value" name="Số tin nhắn" radius={[0, 4, 4, 0]}>
                    {userStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={USER_COLORS[index % USER_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* User Pie Chart */}
          <div className="card p-6 flex flex-col">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Phân bổ theo User</h2>
            <p className="text-xs text-gray-500 mb-6">Tỷ trọng tin nhắn gửi thành công</p>
            
            <div className="flex-grow flex items-center justify-center">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={userStats}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="value"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    stroke="none"
                  >
                    {userStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={USER_COLORS[index % USER_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: '8px', color: '#111827' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}

export default Overview;
