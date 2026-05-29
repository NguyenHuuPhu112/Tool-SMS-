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
    <aside className={`w-64 bg-white border-r border-gray-200 flex flex-col h-screen fixed top-0 left-0 z-50 transition-transform duration-300 ease-in-out lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="p-6 flex items-center justify-between gap-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-sm">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">
              TOOL SMS 
          </h1>
        </div>
        {onClose && (
          <button 
            onClick={onClose} 
            className="lg:hidden p-2 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-lg border border-gray-200"
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
              `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm font-medium ${
                isActive 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="px-4 py-3 bg-gray-50 rounded-lg mb-3 border border-gray-200">
          <p className="text-sm font-semibold text-gray-900">{user?.username}</p>
          <p className="text-xs text-gray-500 mt-0.5 capitalize">{user?.role}</p>
        </div>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
