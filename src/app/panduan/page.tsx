'use client';

import { Activity, Cpu, Database, HardDrive, Info, Network } from 'lucide-react';

function TermCard({ title, icon: Icon, color, bg, what, why, good, bad }: {
  title: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  what: string;
  why: string;
  good: string;
  bad: string;
}) {
  return (
    <div className="panel-surface rounded p-5 transition-all">
      <div className="flex items-center gap-3 mb-4">
        <div className={`h-10 w-10 rounded flex items-center justify-center ${bg} ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      </div>
      
      <div className="space-y-4 text-sm text-slate-600">
        <div>
          <span className="font-medium text-slate-900 block mb-1">Apa itu?</span>
          <p>{what}</p>
        </div>
        <div>
          <span className="font-medium text-slate-900 block mb-1">Kenapa penting?</span>
          <p>{why}</p>
        </div>
        
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-emerald-50/50 p-3 rounded border border-emerald-100">
            <span className="font-semibold text-emerald-700 block mb-1">Kondisi Normal (Aman)</span>
            <p className="text-emerald-600 text-xs">{good}</p>
          </div>
          <div className="bg-red-50/50 p-3 rounded border border-red-100">
            <span className="font-semibold text-red-700 block mb-1">Kondisi Bahaya (Waspada)</span>
            <p className="text-red-600 text-xs">{bad}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PanduanDashboard() {
  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Panduan Membaca Dashboard
        </h1>
        <p className="text-sm font-medium text-slate-500">
          Penjelasan sederhana istilah teknis infrastruktur IT.
        </p>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded p-4 flex gap-3 items-start">
        <Info className="h-5 w-5 text-slate-600 shrink-0 mt-0.5" />
        <p className="text-sm text-slate-700 leading-relaxed">
          <strong>Tips:</strong> Dashboard menggunakan kode warna untuk memudahkan Anda. Warna <strong className="text-emerald-600">Hijau</strong> berarti semua berjalan normal. Warna <strong className="text-amber-500">Kuning</strong> berarti peringatan (warning). Warna <strong className="text-red-600">Merah</strong> berarti kritis dan butuh penanganan IT.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 mt-6">
        
        <TermCard 
          title="CPU Usage (Prosesor)"
          icon={Cpu}
          color="text-slate-700"
          bg="bg-slate-100"
          what="CPU adalah 'otak' dari server. CPU Usage menunjukkan seberapa keras otak ini sedang bekerja dalam persentase (%)."
          why="Jika CPU terlalu sibuk (usage tinggi), server akan mulai merespon dengan lambat."
          good="Di bawah 70%. Server bekerja responsif."
          bad="Di atas 85% secara terus-menerus. Aplikasi mungkin akan terasa lambat (lag)."
        />

        <TermCard 
          title="RAM & Swap Usage (Memori)"
          icon={Database}
          color="text-slate-700"
          bg="bg-slate-100"
          what="RAM adalah 'meja kerja' server. Jika penuh, server menggunakan Swap (mengambil sebagian Hardisk untuk meja kerja darurat)."
          why="Tanpa RAM tersisa, aplikasi bisa mati mendadak. Jika Swap tinggi, kinerja menurun drastis karena hardisk lebih lambat."
          good="RAM Usage di bawah 75%. Swap Usage sangat rendah."
          bad="RAM Usage 90%+. Swap Usage tinggi berarti kehabisan memori murni."
        />

        <TermCard 
          title="Disk Root & Inode (Penyimpanan)"
          icon={HardDrive}
          color="text-slate-700"
          bg="bg-slate-100"
          what="Disk adalah kapasitas penyimpanan. Inode adalah batas jumlah maksimal file yang boleh disimpan."
          why="Jika Disk penuh, sistem tidak bisa menyimpan data. Jika Inode penuh, Anda tidak bisa membuat file baru meski GB masih sisa."
          good="Keduanya di bawah 80%. Masih banyak ruang."
          bad="Mendekati 90%+. Jika 100%, sistem akan error."
        />

        <TermCard 
          title="Load Average (Beban Antrian)"
          icon={Activity}
          color="text-slate-700"
          bg="bg-slate-100"
          what="Menunjukkan jumlah pekerjaan yang sedang 'mengantri'. Angka 1m berarti rata-rata antrian dalam 1 menit."
          why="Membantu melihat apakah server overload. Jika Load lebih besar dari jumlah Core CPU, berarti sistem melambat."
          good="Angka di bawah jumlah CPU Core."
          bad="Secara konsisten lebih tinggi dari jumlah CPU Core."
        />

        <TermCard 
          title="Network RX / TX (Lalu Lintas Jaringan)"
          icon={Network}
          color="text-slate-700"
          bg="bg-slate-100"
          what="RX (Receive) adalah data masuk/download. TX (Transmit) adalah data keluar/upload. (MB/s)."
          why="Melihat kepadatan trafik internet. Angka tinggi tanpa sebab bisa menandakan anomali."
          good="Sesuai dengan kapasitas jam kerja normal."
          bad="Menyentuh batas maksimal kapasitas internet."
        />

      </div>
    </div>
  );
}
