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
      className="z-20 flex w-14 flex-shrink-0 flex-col items-stretch gap-2 px-1 pt-3.5"
      style={{
        background: "rgba(10, 11, 15, 0.95)",
        borderRight: "1px solid rgba(255, 255, 255, 0.05)",
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
            className={`flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center transition-all ${
              active
                ? "text-purple-300 bg-purple-500/15 shadow-[inset_0_0_0_1px_rgba(168,85,247,0.3)]"
                : "text-neutral-400 hover:text-white hover:bg-white/[0.05]"
            }`}
          >
            <Icon className="shrink-0" size={17} strokeWidth={active ? 2 : 1.5} />
            <span className="text-[10px] font-medium leading-[11px]">{item.label}</span>
          </Link>
        );
      })}

      <div className="flex-1" />
    </nav>
  );
}
