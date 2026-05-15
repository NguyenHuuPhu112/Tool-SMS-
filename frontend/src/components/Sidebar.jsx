import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Send, 
  List, 
  Smartphone, 
  Settings, 
  Shield,
  LogOut
} from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';

function Sidebar() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Tổng quan', path: '/', icon: LayoutDashboard },
    { name: 'Gửi tin nhắn', path: '/campaign', icon: Send },
    { name: 'Lịch sử SMS', path: '/logs', icon: List },
    { name: 'Thiết bị', path: '/devices', icon: Smartphone },
    { name: 'Cài đặt', path: '/settings', icon: Settings },
  ];

  if (user?.role === 'admin') {
    navItems.push({ name: 'Quản trị viên', path: '/admin', icon: Shield });
  }

  return (
    <div className="w-64 bg-[#09090b] border-r border-white/5 flex flex-col h-screen fixed top-0 left-0">
      <div className="p-6 flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
          <Smartphone className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
            TOOL SMS 
        </h1>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive 
                  ? 'bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20' 
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-white/5">
        <div className="px-4 py-3 bg-white/5 rounded-xl mb-4 border border-white/5">
          <p className="text-sm font-medium text-gray-200">{user?.username}</p>
          <p className="text-xs text-gray-500 mt-1 capitalize">{user?.role}</p>
        </div>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Đăng xuất
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
