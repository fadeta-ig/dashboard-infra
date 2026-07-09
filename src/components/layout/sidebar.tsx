'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, BookOpen, ChevronLeft, ChevronRight, LogOut, Network, RouterIcon, Server, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/layout/sidebar-context';

const navItems = [
  { name: 'Summary Dashboard', href: '/', icon: Activity },
  { name: 'Server Status', href: '/server', icon: Server },
  { name: 'Network Health', href: '/network', icon: Network },
  { name: 'Target Jobs', href: '/targets', icon: Target },
  { name: 'MikroTik / SNMP', href: '/mikrotik', icon: RouterIcon },
  { name: 'Panduan Dashboard', href: '/panduan', icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, toggleSidebar } = useSidebar();

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <aside 
      className={cn(
        "hidden md:flex flex-col bg-white/80 backdrop-blur-xl text-slate-700 h-screen fixed top-0 left-0 border-r border-slate-200 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] transition-all duration-300 ease-in-out z-40",
        isCollapsed ? "w-20" : "w-72"
      )}
    >
      {/* Toggle Button */}
      <button 
        onClick={toggleSidebar}
        className="absolute -right-3 top-8 bg-white border border-slate-200 text-slate-500 hover:text-primary rounded-full p-1 shadow-sm transition-colors z-50"
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {/* Brand Header */}
      <div className="h-20 flex items-center px-5 border-b border-slate-100 shrink-0">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white flex items-center justify-center shadow-inner">
          <Activity className="h-5 w-5" />
        </div>
        <div 
          className={cn(
            "ml-3 min-w-0 transition-all duration-300 overflow-hidden whitespace-nowrap",
            isCollapsed ? "w-0 opacity-0" : "w-full opacity-100"
          )}
        >
          <span className="block font-bold text-sm text-slate-900 leading-tight">Monitoring Server</span>
          <span className="block text-xs font-medium text-slate-500">Ubuntu WIG</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-6 flex flex-col gap-1.5 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.name : undefined}
              className={cn(
                'group flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 relative overflow-hidden',
                isActive
                  ? 'bg-blue-50/80 text-blue-700 shadow-sm border border-blue-100/50'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                isCollapsed ? 'justify-center' : 'gap-3'
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0 transition-colors", isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600")} />
              
              <span 
                className={cn(
                  "transition-all duration-300 whitespace-nowrap",
                  isCollapsed ? "w-0 opacity-0 hidden" : "opacity-100"
                )}
              >
                {item.name}
              </span>
              
              {/* Active Indicator Line */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-blue-600 rounded-r-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Area */}
      <div className="p-4 border-t border-slate-100 space-y-3 shrink-0">
        <div 
          className={cn(
            "rounded-lg border border-slate-100 bg-slate-50 p-3 transition-all duration-300 overflow-hidden whitespace-nowrap",
            isCollapsed ? "h-0 w-0 p-0 opacity-0 border-0" : "opacity-100"
          )}
        >
          <p className="text-xs font-semibold text-slate-700">Server Info</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            server-wig / Ubuntu 22.04
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          title={isCollapsed ? "Logout" : undefined}
          className={cn(
            "flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-red-50 hover:text-red-700 group",
            isCollapsed ? "justify-center" : "gap-3"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-red-600 transition-colors" />
          <span 
            className={cn(
              "transition-all duration-300 whitespace-nowrap",
              isCollapsed ? "w-0 opacity-0 hidden" : "opacity-100"
            )}
          >
            Logout
          </span>
        </button>
      </div>
    </aside>
  );
}
