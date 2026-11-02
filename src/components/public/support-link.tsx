import type { ReactNode } from "react";
import { siteConfig } from "@/config/site";

type SupportLinkProps = {
  children?: ReactNode;
  className?: string;
  showIcon?: boolean;
};

export function SupportLink({
  children = "Dukung Kami",
  className,
  showIcon = true,
}: SupportLinkProps) {
  return (
    <a
      href={siteConfig.supportUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {showIcon ? <span aria-hidden="true">💚 </span> : null}
      {children}
    </a>
  );
}
