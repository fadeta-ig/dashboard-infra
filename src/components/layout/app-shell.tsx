'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { SidebarProvider, useSidebar } from '@/components/layout/sidebar-context';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

function ShellContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed, setCollapsed } = useSidebar();

  // Auto collapse sidebar on smaller screens, expand on larger screens initially
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
      }
    };
    
    // Initial check
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setCollapsed]);

  return (
    <>
      <Sidebar />
      <div 
        className={cn(
          "flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out",
          isCollapsed ? "lg:pl-20" : "lg:pl-72"
        )}
      >
        <Topbar />
        <main className="min-w-0 flex-1 bg-background/50 p-4 pt-20 sm:p-6 lg:p-8 lg:pt-8">
          <div className="mx-auto w-full min-w-0 max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  if (isLogin) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return (
    <SidebarProvider>
      <ShellContent>{children}</ShellContent>
    </SidebarProvider>
  );
}
