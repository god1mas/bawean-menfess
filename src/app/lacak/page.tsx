import type { Metadata } from "next";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";
import { TrackingForm } from "@/components/public/tracking-form";

export const metadata: Metadata = {
  title: "Lacak Menfess",
  description: "Periksa status menfess dengan kredensial pelacakan privat.",
  referrer: "no-referrer",
};

export default function TrackingPage() {
  return (
    <>
      <PublicHeader active="/lacak" />
      <main className="mx-auto max-w-[1280px] px-[18px] pb-12 pt-9 md:px-6 md:pt-16">
        <header className="px-1 md:px-0"><h1 className="text-[29px] font-extrabold text-bm-brand md:text-[36px]">Lacak status ceritamu.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-bm-muted md:text-[15px]">Masukkan kode yang kamu terima setelah mengirim menfess atau buka tautan pelacakan privatmu.</p></header>
        <div className="mt-10 md:mt-16"><TrackingForm /></div>
      </main>
      <PublicFooter />
    </>
  );
}
