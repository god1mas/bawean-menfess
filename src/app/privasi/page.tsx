import type { Metadata } from "next";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

export const metadata: Metadata = { title: "Informasi Privasi", description: "Informasi privasi Bawean Menfess." };

export default function PrivacyPage() {
  return (
    <><PublicHeader /><main className="mx-auto max-w-[900px] px-[18px] py-10 md:px-8 md:py-16"><article className="rounded-[24px] bg-white p-6 shadow-sm md:p-10">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-bm-gold">Informasi sebelum peluncuran publik</p>
      <h1 className="mt-3 text-3xl font-extrabold text-bm-brand md:text-4xl">Informasi privasi</h1>
      <p className="mt-5 text-sm leading-7 text-bm-muted">Layanan ini ditampilkan dengan nama komunitas Bawean Menfess. Nama tersebut bukan pernyataan bahwa identitas operator hukum atau seluruh kewajiban regulasi telah diverifikasi.</p>
      <section className="mt-8 text-sm leading-7 text-bm-muted"><h2 className="text-xl font-bold text-bm-brand">Data yang diproses</h2><ul className="mt-3 list-disc space-y-2 pl-5">
        <li>Pengunjung tidak perlu membuat akun untuk mengirim menfess.</li>
        <li>Kategori, isi pesan, status, waktu, dan referensi publikasi bila ada disimpan untuk moderasi.</li>
        <li>Kode dan token pelacakan hanya disimpan sebagai digest HMAC berversi; simpan nilai asli karena layanan tidak dapat memulihkannya.</li>
        <li>Alamat jaringan diproses untuk menghasilkan digest HMAC pembatasan permintaan dan tidak disimpan sebagai alamat asli pada tabel pembatasan publik.</li>
        <li>Tindakan administrator dan catatan penghapusan publikasi disimpan untuk akuntabilitas.</li>
        <li>Akun dan sesi administrator dapat mencakup alamat jaringan serta user-agent untuk keamanan akses.</li>
      </ul></section>
      <section className="mt-8 text-sm leading-7 text-bm-muted"><h2 className="text-xl font-bold text-bm-brand">Retensi yang ditargetkan</h2><ul className="mt-3 list-disc space-y-2 pl-5">
        <li>PENDING: 90 hari setelah dikirim.</li><li>APPROVED yang belum terbit: 90 hari setelah disetujui.</li><li>REJECTED: 90 hari setelah ditolak.</li><li>PUBLISHED: 365 hari setelah publikasi.</li>
      </ul><p className="mt-3">Catatan audit terkait mengikuti masa simpan kiriman. Penahanan yang diwajibkan hukum dapat memperpanjangnya. Pelaksanaan bergantung pada pemeliharaan terjadwal; kegagalan infrastruktur dapat menunda penghapusan. Kredensial pelacakan berhenti berfungsi setelah kiriman dihapus.</p></section>
      <section className="mt-8 text-sm leading-7 text-bm-muted"><h2 className="text-xl font-bold text-bm-brand">Cadangan dan kontak</h2>
        <p className="mt-3">Penghapusan dari basis data aktif tidak selalu langsung menghapus salinan cadangan. Konfigurasi dan masa simpan cadangan proyek masih harus diverifikasi sebelum peluncuran. Setelah pemulihan cadangan, penghapusan yang terjadi setelah titik pemulihan harus diterapkan kembali.</p>
        <p className="mt-3">Pertanyaan privasi dan laporan dapat dikirim ke <a className="font-bold text-bm-brand underline" href="mailto:dimasabdussyukur@gmail.com">dimasabdussyukur@gmail.com</a>. Tidak ada tenggat respons operasional yang dijanjikan selain kewajiban hukum yang berlaku.</p>
      </section>
    </article></main><PublicFooter /></>
  );
}
