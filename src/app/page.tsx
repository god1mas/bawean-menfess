import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

const categories = [
  ["01", "CONFESS", "Ungkapkan yang selama ini kamu simpan."],
  ["02", "CURHAT", "Bagikan hari yang berat maupun cerita bahagia."],
  ["03", "ASK BM", "Cari jawaban dari komunitas Bawean."],
  ["04", "CONNECT", "Temukan ruang untuk saling terhubung."],
  ["05", "DISCUSS", "Mulai percakapan yang berarti."],
] as const;

const steps = [
  ["01", "Tulis", "Isi pesan dan pilih kategorinya."],
  ["02", "Kirim", "Terima kredensial pelacakan privat."],
  ["03", "Moderasi", "Kiriman ditinjau oleh tim."],
  ["04", "Posting", "Cerita terpilih dipublikasikan manual."],
] as const;

export default function Home() {
  return (
    <>
      <PublicHeader active="/" />
      <main className="mx-auto max-w-[1440px] px-[18px] pb-10 pt-5 md:px-[70px] md:pt-[38px]">
        <section className="relative min-h-[618px] overflow-hidden rounded-[24px] bg-bm-deep px-6 py-8 text-white md:min-h-[620px] md:rounded-[30px] md:px-[70px] md:py-[92px]">
          <Image aria-hidden="true" alt="" src="/decor/warm-gold-accent.svg" width={440} height={440} className="pointer-events-none absolute -right-28 -top-40 hidden md:block" />
          <Image aria-hidden="true" alt="" src="/decor/warm-cream-glow.svg" width={520} height={520} className="pointer-events-none absolute -right-16 top-40 hidden md:block" />
          <Image aria-hidden="true" alt="" src="/decor/coastal-halo.svg" width={450} height={450} className="pointer-events-none absolute right-12 top-14 hidden md:block" />

          <div className="relative z-10 max-w-[650px]">
            <p className="inline-flex rounded-full bg-[#2a6558] px-4 py-2.5 text-[10px] font-bold md:text-[13px]">🌿&nbsp; RUANG CERITA ANONIM</p>
            <h1 className="mt-6 text-[41px] font-extrabold leading-[1.08] tracking-[-0.03em] md:text-[66px]">Ceritamu,<br />Ruang Kita.</h1>
            <p className="mt-5 max-w-[570px] text-sm leading-6 text-[#d7e7dd] md:text-lg md:leading-8">Punya cerita, pertanyaan, atau perasaan yang ingin disampaikan? Bagikan secara anonim melalui Bawean Menfess.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={"/kirim" as Route} className="rounded-[13px] bg-bm-accent px-6 py-4 text-center text-sm font-bold text-bm-brand focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white">Kirim Menfess ↗</Link>
              <Link href={"/lacak" as Route} className="rounded-[13px] bg-[#275b4f] px-6 py-4 text-center text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white md:bg-[#e8eee8] md:text-bm-brand">Lacak Menfess →</Link>
            </div>
            <p className="mt-5 hidden text-xs font-medium text-[#c5ddcf] md:block">Tanpa akun&nbsp; • &nbsp;Identitas dirahasiakan&nbsp; • &nbsp;Dimoderasi</p>
          </div>

          <div className="relative z-10 mx-auto mt-7 flex size-[126px] items-center justify-center rounded-full border-4 border-bm-accent bg-bm-page md:absolute md:right-[110px] md:top-[90px] md:mt-0 md:size-[330px]">
            <Image src="/bawean-menfess-logo.png" alt="Logo resmi Bawean Menfess" width={320} height={320} priority className="size-[118px] rounded-full object-contain md:size-[320px]" />
          </div>
        </section>

        <section className="px-2 pb-4 pt-14 md:px-[50px] md:pt-[72px]">
          <p className="text-xs font-bold text-bm-gold">APA ITU BAWEAN MENFESS?</p>
          <h2 className="mt-3 max-w-3xl text-[29px] font-extrabold leading-tight text-bm-brand md:text-[41px]">Ruang kecil untuk cerita yang berarti.</h2>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-bm-muted md:text-[17px] md:leading-7">Tempat berbagi cerita, bertanya, dan saling terhubung—tanpa perlu menampilkan identitas pengirim.</p>
          <p className="mt-14 text-xs font-bold text-bm-gold">PILIH CERITAMU</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {categories.map(([number, label, copy], index) => (
              <article key={label} className={`rounded-[20px] border border-bm-border p-6 ${index % 2 === 1 ? "bg-bm-mint" : "bg-white"}`}>
                <p className="text-xs font-bold text-bm-gold">{number} / {label}</p>
                <h3 className="mt-7 text-lg font-bold leading-7 text-bm-brand md:text-xl">{copy}</h3>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-[27px] bg-white px-6 py-10 md:px-[58px] md:py-[52px]">
          <p className="text-xs font-bold text-bm-gold">CARA KERJANYA</p>
          <h2 className="mt-3 text-[26px] font-extrabold text-bm-brand md:text-[32px]">Empat langkah, satu ruang cerita.</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-4 md:gap-6">
            {steps.map(([number, title, copy]) => (
              <li key={number} className="flex gap-4 md:flex-col">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-bm-mint text-xs font-bold text-bm-brand">{number}</span>
                <div><h3 className="text-lg font-bold text-bm-brand md:text-xl">{title}</h3><p className="mt-2 text-sm leading-6 text-bm-muted">{copy}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 rounded-[27px] bg-bm-mint px-6 py-10 md:flex md:items-center md:justify-between md:px-[58px] md:py-[62px]">
          <div><p className="text-xs font-bold text-bm-gold">IDENTITASMU TETAP MILIKMU</p><h2 className="mt-4 text-2xl font-extrabold text-bm-brand md:text-[31px]">Bebas bercerita. Tetap saling menjaga.</h2><p className="mt-4 max-w-3xl text-sm leading-6 text-bm-muted md:text-[15px]">Tidak perlu login untuk mengirim cerita. Setiap kiriman ditinjau sebelum dipublikasikan agar ruang ini tetap nyaman untuk semua.</p></div>
          <div className="mt-8 flex size-24 shrink-0 items-center justify-center rounded-full bg-bm-brand text-4xl text-bm-gold md:mt-0 md:size-[170px] md:text-7xl">✦</div>
        </section>

        <section className="mt-8 rounded-[24px] bg-bm-deep px-6 py-10 text-white md:flex md:items-center md:justify-between md:rounded-[28px] md:px-[58px] md:py-12">
          <div><h2 className="text-2xl font-bold md:text-[31px]">Ada cerita yang masih kamu simpan?</h2><p className="mt-3 text-sm text-[#dfebe4] md:text-base">Mungkin sekarang waktunya berbagi.</p></div>
          <Link href={"/kirim" as Route} className="mt-7 inline-block rounded-[14px] bg-bm-accent px-6 py-4 text-sm font-bold text-bm-brand md:mt-0">Mulai Bercerita ↗</Link>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
