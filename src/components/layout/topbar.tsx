'use client';

import { Activity } from 'lucide-react';
import Link from 'next/link';

const mobileLinks = [
  { href: '/', label: 'Summary' },
  { href: '/server', label: 'Server' },
  { href: '/network', label: 'Network' },
  { href: '/targets', label: 'Targets' },
];

export function Topbar() {
  return (
    <header className="md:hidden h-16 border-b border-border bg-card flex items-center px-4 fixed top-0 left-0 w-full z-50">
      <div className="flex items-center flex-1 min-w-0">
        <Activity className="h-5 w-5 text-primary mr-2 flex-shrink-0" />
        <span className="font-bold tracking-tight truncate">InfraDash</span>
      </div>
      <nav className="flex gap-3 text-xs font-medium overflow-x-auto">
        {mobileLinks.map((item) => (
          <Link key={item.href} href={item.href} className="whitespace-nowrap text-muted-foreground hover:text-foreground">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
