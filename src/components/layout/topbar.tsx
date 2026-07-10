'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { BRANDING } from '@/lib/branding';
import { cn } from '@/lib/utils';
import { getCurrentNavItem, navSections } from '@/components/layout/navigation';

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const currentItem = getCurrentNavItem(pathname);

  const logout = async () => {
    setIsOpen(false);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      <header className="fixed left-0 top-0 z-50 flex h-16 w-full items-center border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="rounded-md border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
              <Image
                src={BRANDING.logoSrc}
                alt={BRANDING.logoAlt}
                width={36}
                height={36}
                className="h-full w-full object-contain"
                unoptimized
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{currentItem.name}</p>
              <p className="truncate text-[11px] text-slate-500">{currentItem.description}</p>
            </div>
          </div>
        </div>
      </header>

      <div
        className={cn(
          'fixed inset-0 z-[60] lg:hidden',
          isOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
      >
        <div
          className={cn(
            'absolute inset-0 bg-slate-950/30 transition-opacity duration-200',
            isOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setIsOpen(false)}
        />

        <div
          className={cn(
            'absolute inset-y-0 left-0 flex w-[88vw] max-w-[360px] flex-col border-r border-slate-200 bg-white transition-transform duration-200',
            isOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
                <Image
                  src={BRANDING.logoSrc}
                  alt={BRANDING.logoAlt}
                  width={40}
                  height={40}
                  className="h-full w-full object-contain"
                  unoptimized
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{BRANDING.appName}</p>
                <p className="truncate text-[11px] text-slate-500">{BRANDING.shortName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-5">
              {navSections.map((section) => (
                <div key={section.title} className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {section.title}
                  </p>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsOpen(false)}
                          className={cn(
                            'flex items-start gap-3 rounded-lg px-3 py-3 transition-colors',
                            isActive ? 'bg-slate-100 text-slate-950' : 'text-slate-700 hover:bg-slate-50'
                          )}
                        >
                          <item.icon className={cn('mt-0.5 h-4 w-4 shrink-0', isActive ? 'text-slate-900' : 'text-slate-400')} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{item.name}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          <div className="border-t border-slate-100 px-4 py-4">
            <button
              type="button"
              onClick={() => void logout()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
