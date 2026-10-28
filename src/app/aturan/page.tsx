import type { Metadata } from "next";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

export const metadata: Metadata = {
  title: "Aturan Komunitas",
  description: "Aturan komunitas dan moderasi Bawean Menfess.",
};

export default function CommunityRulesPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-[900px] px-[18px] py-10 md:px-8 md:py-16">
        <article className="rounded-[24px] bg-white p-6 shadow-sm md:p-10">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-bm-gold">Berlaku sebelum peluncuran publik</p>
          <h1 className="mt-3 text-3xl font-extrabold text-bm-brand md:text-4xl">Aturan komunitas</h1>
          <p className="mt-5 text-sm leading-7 text-bm-muted">Bawean Menfess adalah ruang komunitas yang dimoderasi. Mengirim pesan tidak menjamin persetujuan atau publikasi di Instagram.</p>
          <section className="mt-8 text-sm leading-7 text-bm-muted">
            <h2 className="text-xl font-bold text-bm-brand">Konten yang ditolak</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Doxxing atau pengungkapan informasi pribadi tanpa izin.</li>
              <li>Ancaman, hasutan, perundungan, pelecehan terarah, atau kebencian berbasis identitas.</li>
              <li>Eksploitasi, materi intim tanpa persetujuan, dan konten yang membahayakan anak.</li>
              <li>Penipuan, penyamaran, spam, perdagangan terlarang, atau petunjuk tindakan berbahaya serius.</li>
              <li>Pelanggaran hak cipta.</li>
              <li>Tuduhan merugikan yang mengidentifikasi atau mengekspos individu privat.</li>
            </ul>
            <p className="mt-3">Pengalaman pribadi yang cukup dianonimkan dan kritik yang disampaikan dengan hormat dapat dipertimbangkan jika tidak mengekspos atau menargetkan orang yang dapat dikenali. Perlindungan lebih ketat diterapkan untuk anak dan informasi pribadi sensitif.</p>
          </section>
          <section className="mt-8 text-sm leading-7 text-bm-muted">
            <h2 className="text-xl font-bold text-bm-brand">Moderasi dan publikasi</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Semua kiriman ditinjau sebelum publikasi manual.</li>
              <li>Status PUBLISHED dicatat hanya setelah publikasi Instagram berhasil.</li>
              <li>Alasan penolakan internal tidak ditampilkan melalui pelacakan publik.</li>
              <li>Tidak ada proses banding anonim atau penyuntingan setelah pengiriman untuk MVP.</li>
              <li>Koreksi dapat dikirim sebagai kiriman baru dengan kredensial pelacakan baru.</li>
            </ul>
          </section>
          <section className="mt-8 text-sm leading-7 text-bm-muted">
            <h2 className="text-xl font-bold text-bm-brand">Laporan konten terbit</h2>
            <p className="mt-3">Pihak yang terdampak dapat melapor ke <a className="font-bold text-bm-brand underline" href="mailto:dimasabdussyukur@gmail.com">dimasabdussyukur@gmail.com</a> tanpa kode pelacakan. Bawean Menfess meninjau permintaan secara manual. Kami tidak menjanjikan penghapusan atau waktu respons tertentu di luar kewajiban hukum yang berlaku.</p>
          </section>
        </article>
      </main>
      <PublicFooter />
    </>
  );
}
