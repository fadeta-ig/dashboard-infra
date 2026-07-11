import {
  Activity,
  BookOpen,
  ClipboardList,
  FileText,
  Gauge,
  Network,
  RouterIcon,
  Server,
  Settings2,
  ShieldAlert,
  Target,
  Tv,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { name: 'Summary Dashboard', href: '/', icon: Activity, description: 'Ringkasan kondisi utama' },
      { name: 'NOC Dashboard', href: '/noc', icon: Tv, description: 'View operator dan SLA kategori' },
      { name: 'Health & Capacity', href: '/analytics', icon: Gauge, description: 'Tren performa dan kapasitas' },
      { name: 'Monthly Report', href: '/reports', icon: FileText, description: 'Laporan bulanan dan PDF' },
    ],
  },
  {
    title: 'Monitoring',
    items: [
      { name: 'Server Status', href: '/server', icon: Server, description: 'Kondisi server Ubuntu' },
      { name: 'Network Health', href: '/network', icon: Network, description: 'Kualitas jaringan dan internet' },
      { name: 'MikroTik / SNMP', href: '/mikrotik', icon: RouterIcon, description: 'Gateway, uplink, dan port' },
      { name: 'Target Jobs', href: '/targets', icon: Target, description: 'Status target scrape dan job' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { name: 'Incident History', href: '/incidents', icon: ShieldAlert, description: 'Riwayat down/up dan insiden' },
      { name: 'Audit Log', href: '/audit', icon: ClipboardList, description: 'Audit operasional sistem' },
      { name: 'Monitoring Settings', href: '/settings', icon: Settings2, description: 'Target, SLA, dan maintenance' },
      { name: 'Panduan Dashboard', href: '/panduan', icon: BookOpen, description: 'Panduan pembacaan dashboard' },
    ],
  },
];

export const flatNavItems = navSections.flatMap((section) => section.items);

export function getCurrentNavItem(pathname: string) {
  return flatNavItems.find((item) => pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))) || flatNavItems[0];
}
