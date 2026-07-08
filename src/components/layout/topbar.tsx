'use client';

import { Menu, Activity } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

export function Topbar() {
  return (
    <header className="md:hidden h-16 border-b border-border bg-card flex items-center px-4 fixed top-0 left-0 w-full z-50">
      <div className="flex items-center flex-1">
        <Activity className="h-5 w-5 text-primary mr-2" />
        <span className="font-bold tracking-tight">InfraDash</span>
      </div>
      {/* For MVP we keep mobile nav simple, users can use desktop for full experience */}
      <nav className="flex gap-4 text-sm font-medium">
        <Link href="/">Summary</Link>
        <Link href="/server">Server</Link>
      </nav>
    </header>
  );
}
