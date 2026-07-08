'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  if (isLogin) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col md:pl-72 min-h-screen">
        <Topbar />
        <main className="flex-1 p-6 md:p-8 pt-20 md:pt-8 bg-background">
          {children}
        </main>
      </div>
    </>
  );
}
