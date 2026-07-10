'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, BookOpen, ChevronLeft, ChevronRight, LogOut, Network, RouterIcon, Server, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/layout/sidebar-context';
import { BRANDING } from '@/lib/branding';

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
        "hidden md:flex flex-col bg-white text-slate-800 h-screen fixed top-0 left-0 border-r border-slate-200 transition-all duration-300 ease-in-out z-40",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      {/* Toggle Button */}
      <button 
        onClick={toggleSidebar}
        className="absolute -right-3 top-6 bg-white border border-slate-200 text-slate-400 hover:text-slate-800 rounded p-1 transition-colors z-50 flex items-center justify-center h-6 w-6"
      >
        {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {/* Brand Header */}
      <div className="h-16 flex items-center px-5 border-b border-slate-100 shrink-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
          <Image
            src={BRANDING.logoSrc}
            alt={BRANDING.logoAlt}
            width={32}
            height={32}
            className="h-full w-full object-contain"
            priority
          />
        </div>
        <div 
          className={cn(
            "ml-3 min-w-0 transition-all duration-300 overflow-hidden whitespace-nowrap",
            isCollapsed ? "w-0 opacity-0" : "w-full opacity-100"
          )}
        >
          <span className="block font-semibold text-sm text-slate-900 leading-tight">Monitoring</span>
          <span className="block text-[11px] font-medium text-slate-500">{BRANDING.shortName}</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.name : undefined}
              className={cn(
                'group flex items-center px-3 py-2 rounded text-sm transition-all duration-150 relative overflow-hidden',
                isActive
                  ? 'bg-slate-100 text-black font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                isCollapsed ? 'justify-center' : 'gap-3'
              )}
            >
              <item.icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-black" : "text-slate-400 group-hover:text-slate-600")} />
              
              <span 
                className={cn(
                  "transition-all duration-300 whitespace-nowrap",
                  isCollapsed ? "w-0 opacity-0 hidden" : "opacity-100"
                )}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Area */}
      <div className="p-4 border-t border-slate-100 space-y-2 shrink-0">
        <div 
          className={cn(
            "rounded bg-slate-50 p-2.5 transition-all duration-300 overflow-hidden whitespace-nowrap border border-slate-100",
            isCollapsed ? "h-0 w-0 p-0 opacity-0 border-0" : "opacity-100"
          )}
        >
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Server Target</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            server-wig
          </p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          title={isCollapsed ? "Logout" : undefined}
          className={cn(
            "flex w-full items-center rounded px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-red-50 hover:text-red-700 group",
            isCollapsed ? "justify-center" : "gap-3"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-red-600 transition-colors" />
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
