import React, { useState, useContext } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';

function Layout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user } = useContext(AuthContext);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#09090b] text-gray-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Mobile Top Navbar */}
      <header className="lg:hidden flex items-center justify-between px-4 h-16 bg-[#09090b]/85 backdrop-blur-md border-b border-white/5 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl border border-white/10 transition-colors"
            aria-label="Mở menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
            TOOL SMS
          </span>
        </div>
        <div className="flex items-center">
          <span className="text-xs text-gray-400 font-medium px-3 py-1 bg-white/5 rounded-full border border-white/5 capitalize">
            {user?.username} ({user?.role})
          </span>
        </div>
      </header>

      {/* Backdrop overlay for mobile drawer */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar drawer */}
      <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      
      {/* Main Content Area */}
      <main className="flex-1 lg:ml-64 p-4 md:p-8 overflow-y-auto min-h-[calc(100vh-4rem)] lg:min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
