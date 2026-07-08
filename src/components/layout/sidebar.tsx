'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, Compass, LogOut, Network, RouterIcon, Server, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Summary Dashboard', href: '/', icon: Activity },
  { name: 'Server Status', href: '/server', icon: Server },
  { name: 'Network Health', href: '/network', icon: Network },
  { name: 'Target Jobs', href: '/targets', icon: Target },
  { name: 'MikroTik / SNMP', href: '/mikrotik', icon: RouterIcon },
  { name: 'Development Plan', href: '/roadmap', icon: Compass },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <aside className="hidden md:flex flex-col w-72 bg-[#0d1422] text-white h-screen fixed top-0 left-0 border-r border-slate-900">
      <div className="h-20 flex items-center px-6 border-b border-white/10">
        <div className="h-10 w-10 rounded-lg bg-white text-[#0d1422] flex items-center justify-center mr-3">
          <Activity className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <span className="block font-semibold text-sm leading-tight">Monitoring Server</span>
          <span className="block text-xs text-slate-400">Ubuntu WIG</span>
        </div>
      </div>
      <nav className="flex-1 py-5 flex flex-col gap-1 px-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white text-[#0d1422]'
                  : 'text-slate-300 hover:bg-white/8 hover:text-white',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-white/10 space-y-3">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs font-medium text-slate-200">Server</p>
          <p className="mt-1 text-xs text-slate-400">server-wig / Ubuntu 22.04</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/8 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}

