"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GhostTipLogo } from "../ui/GhostTipLogo";
import { GhostWalletButton } from "../ui/GhostWalletButton";
import { ClusterPill } from "../ui/ClusterPill";

export function Header() {
  const pathname = usePathname();
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
      <Link href="/" className="group inline-flex items-center">
        <GhostTipLogo size={26} />
      </Link>
      <nav className="hidden items-center gap-1 md:flex">
        <NavLink href="/" active={pathname === "/"}>Send</NavLink>
        <NavLink href="/profile" active={pathname?.startsWith("/profile")}>
          History
        </NavLink>
      </nav>
      <div className="flex items-center gap-2">
        <ClusterPill />
        <GhostWalletButton />
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
