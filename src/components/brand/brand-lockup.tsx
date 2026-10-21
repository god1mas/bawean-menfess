import Image from "next/image";

type BrandLockupProps = {
  priority?: boolean;
  compact?: boolean;
};

export function BrandLockup({
  priority = false,
  compact = false,
}: BrandLockupProps) {
  const logoSize = compact ? 48 : 53;

  return (
    <div
      className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}
      aria-label="Bawean Menfess"
    >
      <Image
        src="/bawean-menfess-logo.png"
        alt="Logo resmi Bawean Menfess"
        width={logoSize}
        height={logoSize}
        priority={priority}
        className="rounded-full object-contain"
      />
      <div className="text-left leading-none">
        <p
          className={`${compact ? "text-[13px]" : "text-base"} font-extrabold text-bm-brand`}
        >
          BAWEAN
        </p>
        <p
          className={`${compact ? "mt-0.5 text-[9px]" : "mt-1 text-[10px]"} font-bold text-bm-gold`}
        >
          MENFESS
        </p>
      </div>
    </div>
  );
}
