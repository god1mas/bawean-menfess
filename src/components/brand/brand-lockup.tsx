import Image from "next/image";

type BrandLockupProps = {
  priority?: boolean;
};

export function BrandLockup({ priority = false }: BrandLockupProps) {
  return (
    <div className="flex items-center gap-3" aria-label="Bawean Menfess">
      <Image
        src="/bawean-menfess-logo.png"
        alt="Logo resmi Bawean Menfess"
        width={53}
        height={53}
        priority={priority}
        className="rounded-full object-contain"
      />
      <div className="text-left leading-none">
        <p className="text-base font-extrabold text-bm-brand">BAWEAN</p>
        <p className="mt-1 text-[10px] font-bold text-bm-gold">MENFESS</p>
      </div>
    </div>
  );
}
