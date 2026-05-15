import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

function Layout() {
  return (
    <div className="flex min-h-screen bg-[#09090b] text-gray-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Sidebar - fixed width */}
      <Sidebar />
      
      {/* Main Content Area - margin left to offset fixed sidebar */}
      <div className="flex-1 ml-64 p-8 overflow-y-auto h-screen">
        <Outlet />
      </div>
    </div>
  );
}

export default Layout;
