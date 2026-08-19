"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Plug, MonitorSmartphone, Settings } from "lucide-react";

interface NavItem {
  href: string;
  icon: typeof Boxes;
  label: string;
  kbd: string;
}

const ITEMS: NavItem[] = [
  { href: "/", icon: Boxes, label: "Kênh / Profiles", kbd: "1" },
  { href: "/proxies", icon: Plug, label: "Proxy / IP", kbd: "2" },
  { href: "/relay-devices", icon: MonitorSmartphone, label: "Máy / Relay", kbd: "3" },
  { href: "/setup", icon: Settings, label: "Cài đặt / Setup", kbd: "," },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function LeftRail() {
  const pathname = usePathname();

  return (
    <div
      className="flex flex-col items-center pt-3.5 gap-2 flex-shrink-0 z-20"
      style={{
        width: 56,
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
            title={`${item.label} · Ctrl+${item.kbd}`}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              active
                ? "text-purple-300 bg-purple-500/15 shadow-[inset_0_0_0_1px_rgba(168,85,247,0.3)]"
                : "text-neutral-400 hover:text-white hover:bg-white/[0.05]"
            }`}
          >
            <Icon size={17} strokeWidth={active ? 2 : 1.5} />
          </Link>
        );
      })}

      <div className="flex-1" />

      {/* Bottom Command Palette shortcut */}
    </div>
  );
}
