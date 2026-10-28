import Link from "next/link";
import type { Route } from "next";

export function PublicFooter() {
  return (
    <footer className="mx-auto flex max-w-[1300px] flex-col gap-4 px-6 py-10 text-[11px] text-bm-muted sm:flex-row sm:items-center sm:justify-between md:text-xs">
      <p className="font-bold text-bm-brand">
        BAWEAN MENFESS <span aria-hidden="true">•</span> Ceritamu, Ruang Kita.
      </p>
      <nav aria-label="Navigasi footer" className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href={"/tentang" as Route} className="hover:text-bm-brand">
          Tentang
        </Link>
        <Link href={"/aturan" as Route} className="hover:text-bm-brand">
          Aturan komunitas
        </Link>
        <Link href={"/privasi" as Route} className="hover:text-bm-brand">
          Privasi
        </Link>
      </nav>
    </footer>
  );
}
