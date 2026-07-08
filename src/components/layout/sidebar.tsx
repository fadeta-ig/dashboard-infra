'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Server, Network, Target, RouterIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Summary Dashboard', href: '/', icon: Activity },
  { name: 'Server Status', href: '/server', icon: Server },
  { name: 'Network Health', href: '/network', icon: Network },
  { name: 'Target Jobs', href: '/targets', icon: Target },
  { name: 'MikroTik / SNMP', href: '/mikrotik', icon: RouterIcon },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border/60 h-screen fixed top-0 left-0">
      <div className="h-16 flex items-center px-6 border-b border-border/60">
        <Activity className="h-6 w-6 text-primary mr-2" />
        <span className="font-semibold text-lg tracking-tight">InfraDash</span>
      </div>
      <nav className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} IT Dashboard
      </div>
    </aside>
  );
}
