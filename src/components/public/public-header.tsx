import Link from "next/link";
import type { Route } from "next";
import { BrandLockup } from "@/components/brand/brand-lockup";

const navigation = [
  { href: "/", label: "Beranda" },
  { href: "/kirim", label: "Kirim Menfess" },
  { href: "/lacak", label: "Lacak Menfess" },
  { href: "/tentang", label: "Tentang" },
] as const;

type PublicHeaderProps = {
  active?: (typeof navigation)[number]["href"];
};

export function PublicHeader({ active }: PublicHeaderProps) {
  return (
    <header className="h-[76px] bg-white md:h-[92px]">
      <div className="mx-auto flex h-full max-w-[1250px] items-center justify-between px-5 md:px-6">
        <Link
          href={"/" as Route}
          aria-label="Bawean Menfess — Beranda"
          className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bm-brand"
        >
          <span className="md:hidden">
            <BrandLockup compact priority />
          </span>
          <span className="hidden md:block">
            <BrandLockup priority />
          </span>
        </Link>

        <nav aria-label="Navigasi utama" className="hidden items-center gap-9 md:flex">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              aria-current={active === item.href ? "page" : undefined}
              className={`rounded-md text-sm transition-colors hover:text-bm-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bm-brand ${
                active === item.href
                  ? "font-bold text-bm-brand"
                  : "font-medium text-bm-text"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href={"/kirim" as Route}
          className="hidden rounded-[14px] bg-bm-brand px-6 py-4 text-sm font-bold text-white transition-colors hover:bg-bm-deep focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bm-brand md:block"
        >
          Kirim Sekarang ↗
        </Link>

        <details className="group relative md:hidden">
          <summary className="flex h-[38px] w-[46px] cursor-pointer list-none items-center justify-center rounded-[11px] bg-bm-page text-lg font-bold text-bm-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bm-brand">
            <span aria-hidden="true">☰</span>
            <span className="sr-only">Buka navigasi</span>
          </summary>
          <nav
            aria-label="Navigasi seluler"
            className="absolute right-0 z-50 mt-3 flex w-52 flex-col rounded-2xl border border-bm-border bg-white p-2 shadow-xl"
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                aria-current={active === item.href ? "page" : undefined}
                className={`rounded-xl px-4 py-3 text-sm ${
                  active === item.href
                    ? "bg-bm-mint font-bold text-bm-brand"
                    : "font-medium text-bm-text"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
