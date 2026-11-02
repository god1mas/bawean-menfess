import type { Metadata, Route } from "next";
import Link from "next/link";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";
import { SupportLink } from "@/components/public/support-link";

export const metadata: Metadata = {
  title: "Tentang",
  description: "Tentang ruang cerita anonim Bawean Menfess.",
};

export default function AboutPage() {
  return (
    <>
      <PublicHeader active="/tentang" />
      <main className="mx-auto max-w-[1100px] px-[18px] py-10 md:px-8 md:py-16">
        <section className="rounded-[24px] bg-bm-deep px-6 py-12 text-white md:rounded-[30px] md:px-14 md:py-16">
          <p className="text-xs font-bold text-bm-gold">TENTANG KAMI</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight md:text-5xl">Ruang aman untuk suara dari Bawean.</h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-[#d7e7dd]">Bawean Menfess membantu masyarakat Bawean dan perantauan berbagi cerita, pertanyaan, dan perasaan tanpa akun publik. Setiap kiriman melewati moderasi sebelum dapat dipublikasikan.</p>
        </section>
        <section className="grid gap-5 py-10 md:grid-cols-3">
          {[["Privat", "Kredensial pelacakan hanya ditampilkan sekali dan tidak disimpan dalam bentuk asli."], ["Saling menghormati", "Jangan memasukkan informasi pribadi atau konten yang menyakiti orang lain."], ["Dimoderasi", "Publikasi dilakukan manual setelah peninjauan oleh administrator."]].map(([title, description]) => (
            <article key={title} className="rounded-[20px] bg-white p-6"><h2 className="text-xl font-bold text-bm-brand">{title}</h2><p className="mt-3 text-sm leading-6 text-bm-muted">{description}</p></article>
          ))}
        </section>
        <section className="mb-8 rounded-[24px] bg-bm-mint px-6 py-8 md:flex md:items-center md:justify-between md:gap-10 md:px-10 md:py-10">
          <div className="max-w-2xl">
            <p className="text-xs font-bold text-bm-gold">DUKUNG RUANG INI</p>
            <h2 className="mt-3 text-2xl font-extrabold text-bm-brand">Dukung Bawean Menfess</h2>
            <p className="mt-3 text-sm leading-6 text-bm-muted">Bantu kami menjaga dan mengembangkan ruang cerita anonim anak muda Bawean. Dukunganmu sangat berarti!</p>
            <p className="mt-3 text-xs leading-5 text-bm-muted">Donasi sepenuhnya sukarela dan tidak memengaruhi moderasi, persetujuan, atau prioritas publikasi menfess.</p>
          </div>
          <SupportLink className="mt-6 inline-flex shrink-0 items-center justify-center rounded-[14px] bg-bm-brand px-6 py-4 text-sm font-bold text-white transition-colors hover:bg-bm-deep focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bm-brand md:mt-0" />
        </section>
        <Link href={"/kirim" as Route} className="inline-block rounded-[14px] bg-bm-brand px-6 py-4 text-sm font-bold text-white">Mulai bercerita →</Link>
      </main>
      <PublicFooter />
    </>
  );
}
