'use client';

import Link from 'next/link';
import Image from 'next/image';
import { BRANDING } from '@/lib/branding';

const mobileLinks = [
  { href: '/', label: 'Summary' },
  { href: '/server', label: 'Server' },
  { href: '/network', label: 'Network' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/reports', label: 'Report' },
  { href: '/incidents', label: 'Incident' },
  { href: '/audit', label: 'Audit' },
  { href: '/panduan', label: 'Panduan' },
];

export function Topbar() {
  return (
    <header className="lg:hidden h-14 border-b border-slate-200 bg-white flex items-center px-4 fixed top-0 left-0 w-full z-50">
      <div className="flex items-center flex-1 min-w-0">
        <div className="mr-2 flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
          <Image
            src={BRANDING.logoSrc}
            alt={BRANDING.logoAlt}
            width={32}
            height={32}
            className="h-full w-full object-contain"
            unoptimized
          />
        </div>
        <span className="font-semibold text-sm text-slate-900 tracking-tight truncate">{BRANDING.shortName}</span>
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
