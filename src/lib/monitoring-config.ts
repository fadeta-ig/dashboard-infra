export type InterfaceRole = 'wan' | 'lan' | 'trunk' | 'vlan' | 'vpn' | 'loopback' | 'unused' | 'unknown';

export interface MikrotikInterfaceConfig {
  name: string;
  displayName: string;
  role: InterfaceRole;
  comment?: string;
  isp?: 'ISP 1' | 'ISP 2';
  downloadCapacityMbps?: number;
  uploadCapacityMbps?: number;
  parent?: string;
  expectedUp: boolean;
  includeInWanTotal?: boolean;
}

export interface UbuntuServiceConfig {
  key: string;
  label: string;
  matcher: string;
  required: boolean;
}

export interface AdditionalTargetConfig {
  key: string;
  label: string;
  type: 'icmp' | 'dns' | 'http' | 'tcp';
  suggestedTarget: string;
  purpose: string;
}

export const MIKROTIK_GATEWAY = '192.168.20.1';

export const MIKROTIK_INTERFACES: MikrotikInterfaceConfig[] = [
  {
    name: 'ether1-INDIHOME',
    displayName: 'ISP 1 - Indihome Physical',
    role: 'wan',
    comment: 'Uplink Indihome',
    isp: 'ISP 1',
    downloadCapacityMbps: 150,
    uploadCapacityMbps: 50,
    expectedUp: true,
    includeInWanTotal: false,
  },
  {
    name: 'pppoe-out1',
    displayName: 'ISP 1 - PPPoE Indihome',
    role: 'wan',
    comment: 'WAN logical PPPoE',
    isp: 'ISP 1',
    downloadCapacityMbps: 150,
    uploadCapacityMbps: 50,
    expectedUp: true,
    includeInWanTotal: true,
  },
  {
    name: 'ether2',
    displayName: 'ISP 2 - Citranet',
    role: 'wan',
    comment: 'LINK CITRANET',
    isp: 'ISP 2',
    downloadCapacityMbps: 200,
    uploadCapacityMbps: 200,
    expectedUp: true,
    includeInWanTotal: true,
  },
  {
    name: 'ether3',
    displayName: 'LAN Trunk VLANs',
    role: 'trunk',
    comment: 'LAN TRUNK (VLANs)',
    expectedUp: true,
  },
  { name: 'ether4', displayName: 'Ether4', role: 'unused', expectedUp: false },
  { name: 'ether5', displayName: 'Ether5', role: 'unused', expectedUp: false },
  { name: 'ether6', displayName: 'Ether6', role: 'unused', expectedUp: false },
  { name: 'ether7', displayName: 'Ether7', role: 'unused', expectedUp: false },
  { name: 'ether8', displayName: 'Ether8', role: 'unused', expectedUp: false },
  { name: 'ether9', displayName: 'Ether9', role: 'unused', expectedUp: false },
  { name: 'ether10', displayName: 'Ether10', role: 'unused', expectedUp: false },
  { name: 'sfp-sfpplus1', displayName: 'SFP+ 1', role: 'unused', expectedUp: false },
  {
    name: '10-Jaringan',
    displayName: 'VLAN 10 - LAN User',
    role: 'vlan',
    comment: 'LAN-User',
    parent: 'ether3',
    expectedUp: true,
  },
  {
    name: '20-VoIP',
    displayName: 'VLAN 20 - VoIP',
    role: 'vlan',
    comment: 'LAN-VoIP',
    parent: 'ether3',
    expectedUp: true,
  },
  {
    name: '30-CCTV',
    displayName: 'VLAN 30 - CCTV',
    role: 'vlan',
    comment: 'LAN-CCTV',
    parent: 'ether3',
    expectedUp: true,
  },
  {
    name: '<l2tp-user-plant2>',
    displayName: 'L2TP Plant 2',
    role: 'vpn',
    comment: 'Remote L2TP user',
    expectedUp: true,
  },
  {
    name: 'lo',
    displayName: 'Loopback',
    role: 'loopback',
    expectedUp: true,
  },
];

export const UBUNTU_SERVICES: UbuntuServiceConfig[] = [
  { key: 'nginx', label: 'Nginx', matcher: 'nginx.*\\.service', required: true },
  { key: 'apache', label: 'Apache', matcher: 'apache2?\\.service|httpd\\.service', required: false },
  { key: 'php', label: 'PHP-FPM', matcher: 'php.*fpm.*\\.service', required: false },
  { key: 'mysql', label: 'MySQL', matcher: 'mysql.*\\.service', required: false },
  { key: 'mariadb', label: 'MariaDB', matcher: 'mariadb.*\\.service', required: false },
  { key: 'node', label: 'Node.js App', matcher: 'node.*\\.service', required: false },
  { key: 'pm2', label: 'PM2', matcher: 'pm2.*\\.service', required: false },
  { key: 'ssh', label: 'SSH', matcher: 'ssh\\.service|sshd\\.service', required: true },
];

export const ADDITIONAL_TARGET_SUGGESTIONS: AdditionalTargetConfig[] = [
  {
    key: 'gateway_icmp',
    label: 'MikroTik Gateway',
    type: 'icmp',
    suggestedTarget: MIKROTIK_GATEWAY,
    purpose: 'Validasi koneksi LAN ke router utama.',
  },
  {
    key: 'google_dns_icmp',
    label: 'Google DNS',
    type: 'icmp',
    suggestedTarget: '8.8.8.8',
    purpose: 'Validasi internet global via ICMP.',
  },
  {
    key: 'cloudflare_dns_icmp',
    label: 'Cloudflare DNS',
    type: 'icmp',
    suggestedTarget: '1.1.1.1',
    purpose: 'Pembanding internet global selain Google.',
  },
  {
    key: 'local_dns',
    label: 'DNS Resolver Lokal',
    type: 'dns',
    suggestedTarget: MIKROTIK_GATEWAY,
    purpose: 'Validasi DNS lokal jika router menjadi resolver.',
  },
  {
    key: 'public_http',
    label: 'Website Publik / Domain Kantor',
    type: 'http',
    suggestedTarget: 'https://example.com',
    purpose: 'Validasi akses aplikasi/website penting dari server monitoring.',
  },
  {
    key: 'switch_or_ap',
    label: 'Switch / Access Point Utama',
    type: 'icmp',
    suggestedTarget: 'isi-ip-switch-atau-ap',
    purpose: 'Validasi perangkat jaringan akses.',
  },
  {
    key: 'nvr_or_cctv',
    label: 'NVR / CCTV',
    type: 'icmp',
    suggestedTarget: 'isi-ip-nvr-cctv',
    purpose: 'Validasi perangkat CCTV penting.',
  },
];

export function getInterfaceConfig(name: string) {
  return MIKROTIK_INTERFACES.find((item) => item.name === name);
}

export function getWanInterfaces() {
  return MIKROTIK_INTERFACES.filter((item) => item.role === 'wan');
}
