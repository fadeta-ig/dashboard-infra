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
    <div className="panel-surface rounded-2xl p-6 transition-all hover:scale-[1.01]">
      <div className="flex items-center gap-4 mb-4">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center shadow-sm ${bg} ${color}`}>
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="text-xl font-bold text-slate-800">{title}</h3>
      </div>
      
      <div className="space-y-4 text-sm text-slate-600">
        <div>
          <span className="font-bold text-slate-900 block mb-1">Apa itu?</span>
          <p>{what}</p>
        </div>
        <div>
          <span className="font-bold text-slate-900 block mb-1">Kenapa penting?</span>
          <p>{why}</p>
        </div>
        
        <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
            <span className="font-bold text-emerald-700 block mb-1">Kondisi Normal (Aman)</span>
            <p className="text-emerald-600 text-xs">{good}</p>
          </div>
          <div className="bg-red-50/50 p-3 rounded-lg border border-red-100">
            <span className="font-bold text-red-700 block mb-1">Kondisi Bahaya (Waspada)</span>
            <p className="text-red-600 text-xs">{bad}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PanduanDashboard() {
  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Panduan Membaca <span className="text-gradient">Dashboard</span>
        </h1>
        <p className="text-base font-medium text-slate-500">
          Penjelasan sederhana istilah-istilah teknis infrastruktur IT agar mudah dipahami oleh siapa saja.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex gap-4 items-start">
        <Info className="h-6 w-6 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800 leading-relaxed">
          <strong>Tips:</strong> Dashboard menggunakan kode warna untuk memudahkan Anda. Warna <strong className="text-emerald-600">Hijau</strong> berarti semua berjalan normal. Warna <strong className="text-amber-500">Kuning / Oranye</strong> berarti peringatan (warning) dan perlu diawasi. Warna <strong className="text-red-600">Merah</strong> berarti kritis dan butuh penanganan IT segera.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 mt-8">
        
        <TermCard 
          title="CPU Usage (Prosesor)"
          icon={Cpu}
          color="text-blue-600"
          bg="bg-blue-100"
          what="CPU adalah 'otak' dari server. CPU Usage menunjukkan seberapa keras otak ini sedang berpikir atau bekerja dalam bentuk persentase (%)."
          why="Jika CPU terlalu sibuk (usage tinggi), server akan mulai merespon dengan lambat, mirip seperti manusia yang terlalu banyak pikiran."
          good="Di bawah 70%. Server bekerja dengan santai dan responsif."
          bad="Di atas 85% secara terus-menerus. Aplikasi mungkin akan terasa sangat lambat (lag)."
        />

        <TermCard 
          title="RAM & Swap Usage (Memori)"
          icon={Database}
          color="text-violet-600"
          bg="bg-violet-100"
          what="RAM adalah 'meja kerja' server untuk memproses aplikasi aktif. Jika meja penuh, server akan menggunakan Swap (mengambil sebagian ruang dari Hardisk untuk dijadikan meja kerja sementara)."
          why="Tanpa RAM tersisa, aplikasi bisa mati mendadak (Crash). Jika server mulai menggunakan Swap terlalu banyak, kinerja akan menurun drastis karena hardisk jauh lebih lambat dari RAM."
          good="RAM Usage di bawah 75%. Swap Usage 0% atau sangat rendah."
          bad="RAM Usage menyentuh 90%+. Swap Usage tinggi berarti server kehabisan memori murni."
        />

        <TermCard 
          title="Disk Root & Inode (Penyimpanan)"
          icon={HardDrive}
          color="text-cyan-600"
          bg="bg-cyan-100"
          what="Disk (Hardisk/SSD) adalah 'gudang' penyimpanan data, file, dan database. Inode adalah jumlah maksimal file yang boleh disimpan di dalam gudang tersebut."
          why="Jika gudang (Disk) penuh 100%, sistem tidak bisa menyimpan data baru (database bisa error). Jika Inode 100%, Anda tidak bisa membuat file baru meskipun kapasitas GB masih tersisa banyak (karena kuota jumlah file habis)."
          good="Disk Usage & Inode Usage di bawah 80%. Masih banyak ruang untuk menyimpan data harian."
          bad="Mendekati 90%+. Jika sampai 100%, website atau aplikasi tidak akan bisa diakses dan error."
        />

        <TermCard 
          title="Load Average (Beban Antrian)"
          icon={Activity}
          color="text-amber-600"
          bg="bg-amber-100"
          what="Menunjukkan jumlah pekerjaan atau proses yang sedang 'mengantri' untuk diselesaikan oleh CPU. Angka 1m berarti rata-rata antrian dalam 1 menit terakhir."
          why="Membantu melihat apakah server sedang kelebihan beban (overload). Aturan umumnya: jika angka Load Average lebih besar dari jumlah Core CPU (misal CPU 4 core, Load di atas 4.00), berarti ada proses yang harus menunggu antrian."
          good="Angka di bawah jumlah CPU Core (misal di bawah 2.0 untuk server standar)."
          bad="Angka secara konsisten jauh lebih tinggi dari jumlah CPU Core. Server dipastikan lag."
        />

        <TermCard 
          title="Network RX / TX (Lalu Lintas Jaringan)"
          icon={Network}
          color="text-emerald-600"
          bg="bg-emerald-100"
          what="RX (Receive) adalah data yang masuk/diunduh (Download) ke server. TX (Transmit) adalah data yang keluar/diunggah (Upload) dari server. Dihitung dalam MB/s (Megabytes per second)."
          why="Membantu melihat seberapa padat lalu lintas internet atau jaringan lokal yang masuk dan keluar dari server. Angka yang tiba-tiba sangat tinggi tanpa sebab bisa menandakan adanya anomali jaringan atau serangan."
          good="Sesuai dengan kapasitas dan wajar untuk jam kerja normal."
          bad="Menyentuh batas maksimal kapasitas internet perusahaan, membuat koneksi pengguna lain menjadi lambat."
        />

      </div>
    </div>
  );
}
