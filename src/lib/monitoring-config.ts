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

export interface NetworkPingTargetConfig {
  key: string;
  label: string;
  target: string;
  category: 'internet' | 'cctv' | 'fingerprint' | 'voice' | 'network';
  purpose: string;
}

export const MIKROTIK_GATEWAY = '192.168.20.1';

export const MIKROTIK_INTERFACES: MikrotikInterfaceConfig[] = [
  {
    name: 'ether1-INDIHOME',
    displayName: 'ISP 1 - Indihome Uplink',
    role: 'wan',
    comment: 'Uplink Indihome',
    isp: 'ISP 1',
    downloadCapacityMbps: 150,
    uploadCapacityMbps: 50,
    expectedUp: true,
    includeInWanTotal: true,
  },
  {
    name: 'pppoe-out1',
    displayName: 'ISP 2 - PPPoE Citranet',
    role: 'wan',
    comment: 'WAN logical PPPoE via ether2',
    isp: 'ISP 2',
    downloadCapacityMbps: 200,
    uploadCapacityMbps: 200,
    expectedUp: true,
    includeInWanTotal: true,
  },
  {
    name: 'ether2',
    displayName: 'ISP 2 - Citranet Physical',
    role: 'wan',
    comment: 'Physical link for PPPoE Citranet',
    isp: 'ISP 2',
    downloadCapacityMbps: 200,
    uploadCapacityMbps: 200,
    expectedUp: true,
    includeInWanTotal: false,
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

export const NETWORK_PING_TARGETS: NetworkPingTargetConfig[] = [
  {
    key: 'public_ip_202_152_141_27',
    label: 'Public IP 202.152.141.27',
    target: '202.152.141.27',
    category: 'internet',
    purpose: 'Latency ke IP publik tambahan.',
  },
  {
    key: 'cctv_mki_area_1',
    label: 'CCTV MKI Area 1',
    target: '192.168.40.253',
    category: 'cctv',
    purpose: 'Monitoring konektivitas CCTV MKI Area 1.',
  },
  {
    key: 'cctv_mki_area_2',
    label: 'CCTV MKI Area 2',
    target: '192.168.40.254',
    category: 'cctv',
    purpose: 'Monitoring konektivitas CCTV MKI Area 2.',
  },
  {
    key: 'cctv_wig_plant_ii',
    label: 'CCTV WIG Plant II',
    target: '10.10.77.2',
    category: 'cctv',
    purpose: 'Monitoring konektivitas CCTV WIG Plant II.',
  },
  {
    key: 'fingerprint_wig_plant_ii',
    label: 'Fingerprint WIG Plant II',
    target: '10.10.77.3',
    category: 'fingerprint',
    purpose: 'Monitoring mesin fingerprint WIG Plant II.',
  },
  {
    key: 'fingerprint_mki',
    label: 'Fingerprint MKI',
    target: '192.168.20.22',
    category: 'fingerprint',
    purpose: 'Monitoring mesin fingerprint MKI.',
  },
  {
    key: 'pbx_dinstar',
    label: 'PBX Dinstar',
    target: '192.168.30.253',
    category: 'voice',
    purpose: 'Monitoring PBX Dinstar.',
  },
  {
    key: 'base_station_grandstream',
    label: 'Base Station Grandstream',
    target: '192.168.30.254',
    category: 'voice',
    purpose: 'Monitoring base station Grandstream.',
  },
];
