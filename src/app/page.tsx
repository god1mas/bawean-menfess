import { BrandLockup } from "@/components/brand/brand-lockup";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-16">
      <section className="flex max-w-md flex-col items-center gap-5 text-center">
        <BrandLockup priority />
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-bm-brand">
            Ceritamu, Ruang Kita.
          </h1>
          <p className="text-sm leading-6 text-bm-muted">
            Fondasi proyek Bawean Menfess siap untuk tahap implementasi
            antarmuka berikutnya.
          </p>
        </div>
      </section>
    </main>
  );
}
