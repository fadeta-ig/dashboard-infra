import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/app-shell';
import { BRANDING } from '@/lib/branding';

export const metadata: Metadata = {
  title: BRANDING.appName,
  description: 'Internal Ubuntu server, network, and MikroTik monitoring dashboard',
  icons: {
    icon: BRANDING.logoSrc,
    shortcut: BRANDING.logoSrc,
    apple: BRANDING.logoSrc,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
