import type { Metadata } from "next";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";
import { SubmitForm } from "@/components/public/submit-form";

export const metadata: Metadata = {
  title: "Kirim Menfess",
  description: "Kirim cerita secara anonim untuk dimoderasi Bawean Menfess.",
};

export default function SubmitPage() {
  return (
    <>
      <PublicHeader active="/kirim" />
      <main className="mx-auto max-w-[1440px] px-[18px] pb-10 pt-9 md:px-[76px] md:pt-[47px]">
        <div className="mb-7 px-2 md:hidden">
          <h1 className="text-[30px] font-extrabold text-bm-brand">Kirim Menfess</h1>
          <p className="mt-2 text-sm text-bm-muted">Apa yang ingin kamu ceritakan hari ini?</p>
        </div>
        <div className="grid items-stretch gap-7 md:grid-cols-[minmax(330px,485px)_minmax(0,775px)]">
          <aside className="hidden rounded-[27px] bg-bm-deep px-10 py-14 text-white md:block">
            <p className="inline-flex rounded-full bg-[#2d6659] px-4 py-2.5 text-xs font-bold">TULIS TANPA TAKUT</p>
            <h2 className="mt-6 text-[45px] font-extrabold leading-[1.12]">Ada cerita?<br />Biar kami yang<br />sampaikan.</h2>
            <p className="mt-6 max-w-sm text-base leading-7 text-[#d4e8dc]">Tulis pesanmu dengan nyaman. Identitasmu tidak ditampilkan saat cerita dipublikasikan.</p>
            <ul className="mt-8 space-y-5 text-sm font-medium"><li>✦&nbsp; Tanpa perlu membuat akun</li><li>✦&nbsp; Setiap pesan melalui moderasi</li><li>✦&nbsp; Simpan kredensial pelacakan setelah kirim</li></ul>
          </aside>
          <section className="rounded-[20px] bg-white p-5 sm:p-8 md:rounded-[27px] md:p-[42px]">
            <div className="mb-8 hidden md:block"><h1 className="text-[35px] font-extrabold text-bm-brand">Kirim Menfess</h1><p className="mt-3 text-[15px] text-bm-muted">Apa yang ingin kamu ceritakan hari ini?</p></div>
            <SubmitForm />
          </section>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
