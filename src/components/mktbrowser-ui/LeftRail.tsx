"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, MonitorSmartphone, Plug, Settings, Users } from "lucide-react";

interface NavItem {
  href: string;
  icon: typeof Boxes;
  label: string;
}

const ITEMS: NavItem[] = [
  { href: "/", icon: Boxes, label: "Home" },
  { href: "/accounts", icon: Users, label: "Nick vault" },
  { href: "/proxies", icon: Plug, label: "Proxies" },
  { href: "/relay-devices", icon: MonitorSmartphone, label: "Relay PCs" },
  { href: "/setup", icon: Settings, label: "Setup" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function LeftRail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-20 flex h-16 flex-row items-stretch gap-1 px-2 py-1.5 md:static md:h-auto md:w-[4.75rem] md:flex-shrink-0 md:flex-col md:gap-1.5 md:px-2 md:py-3 lg:w-52"
      style={{
        background: "rgba(13, 15, 18, 0.97)",
        borderRight: "1px solid var(--mkt-border)",
        borderTop: "1px solid var(--mkt-border)",
      }}
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-center transition-colors md:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-left ${
              active
                ? "bg-amber-400/10 text-amber-200 shadow-[inset_0_0_0_1px_rgba(231,173,87,0.28)]"
                : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            <Icon className="shrink-0" size={18} strokeWidth={active ? 2 : 1.6} />
            <span className="text-[10px] font-medium leading-tight md:hidden lg:inline lg:text-[13px]">
              {item.label}
            </span>
          </Link>
        );
      })}

      <div className="hidden flex-1 md:block" />
    </nav>
  );
}
