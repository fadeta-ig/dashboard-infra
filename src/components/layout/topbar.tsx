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
    <header className="md:hidden h-16 border-b border-slate-200 bg-white/85 backdrop-blur-md flex items-center px-4 fixed top-0 left-0 w-full z-50 shadow-sm">
      <div className="flex items-center flex-1 min-w-0">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 text-white flex items-center justify-center mr-2 flex-shrink-0 shadow-sm">
          <Activity className="h-4 w-4" />
        </div>
        <span className="font-bold text-slate-800 tracking-tight truncate">Ubuntu WIG</span>
      </div>
      <nav className="flex gap-4 text-xs font-semibold overflow-x-auto px-2">
        {mobileLinks.map((item) => (
          <Link 
            key={item.href} 
            href={item.href} 
            className="whitespace-nowrap text-slate-500 hover:text-blue-600 transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
