'use client';

import { Activity } from 'lucide-react';
import Link from 'next/link';

const mobileLinks = [
  { href: '/', label: 'Summary' },
  { href: '/server', label: 'Server' },
  { href: '/network', label: 'Network' },
  { href: '/panduan', label: 'Panduan' },
];

export function Topbar() {
  return (
    <header className="md:hidden h-14 border-b border-slate-200 bg-white flex items-center px-4 fixed top-0 left-0 w-full z-50">
      <div className="flex items-center flex-1 min-w-0">
        <div className="h-7 w-7 rounded bg-black text-white flex items-center justify-center mr-2 flex-shrink-0">
          <Activity className="h-4 w-4" />
        </div>
        <span className="font-semibold text-sm text-slate-900 tracking-tight truncate">Ubuntu WIG</span>
      </div>
      <nav className="flex gap-4 text-xs font-medium overflow-x-auto px-2">
        {mobileLinks.map((item) => (
          <Link 
            key={item.href} 
            href={item.href} 
            className="whitespace-nowrap text-slate-500 hover:text-black transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
