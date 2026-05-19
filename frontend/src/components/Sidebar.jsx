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

import { X as CloseIcon } from 'lucide-react';

function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    if (onClose) onClose();
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

  const handleLinkClick = () => {
    if (onClose) onClose();
  };

  return (
    <aside className={`w-64 bg-[#09090b] border-r border-white/5 flex flex-col h-screen fixed top-0 left-0 z-50 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="p-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
              TOOL SMS 
          </h1>
        </div>
        {onClose && (
          <button 
            onClick={onClose} 
            className="lg:hidden p-2 text-gray-400 hover:text-white bg-white/5 rounded-xl border border-white/10"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-4 py-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={handleLinkClick}
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
    </aside>
  );
}

export default Sidebar;
