import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

// Using Inter as the clean, modern font
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "InfraDash - Server Monitoring",
  description: "Internal IT Infrastructure Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex font-sans">
        <Sidebar />
        <div className="flex-1 flex flex-col md:pl-64 min-h-screen">
          <Topbar />
          <main className="flex-1 p-6 md:p-8 pt-20 md:pt-8 bg-background">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
