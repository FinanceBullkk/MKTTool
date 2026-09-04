import { CircleCheck, Monitor, Network, TriangleAlert, UserRound, type LucideIcon } from "lucide-react";
import { Flag } from "./Atoms";

export function ProfileOperationalSignals({
  ownerEmail,
  relayPcName,
  proxy,
}: {
  ownerEmail: string | null;
  relayPcName: string | null;
  proxy: { country: string; label: string; status: string; healthy: boolean } | null;
}) {
  return (
    <dl className="mt-5 grid overflow-hidden rounded-xl border border-white/[0.07] bg-black/10 sm:grid-cols-3 sm:divide-x sm:divide-white/[0.07]">
      <Signal icon={UserRound} label="Owner" value={ownerEmail ?? "Not assigned"} />
      <Signal icon={Monitor} label="Relay PC" value={relayPcName ?? "Not assigned"} />
      <div className="flex min-w-0 items-center gap-3 border-t border-white/[0.07] px-3 py-3 sm:border-t-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-neutral-400">
          <Network size={15} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-600">
            Proxy
          </dt>
          {proxy ? (
            <dd className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <Flag country={proxy.country} />
              <span className="truncate text-[13px] font-medium text-neutral-200" title={proxy.label}>
                {proxy.label}
              </span>
              {proxy.healthy ? (
                <CircleCheck
                  size={13}
                  className="shrink-0 text-emerald-400"
                  aria-label={proxy.status}
                />
              ) : (
                <TriangleAlert
                  size={13}
                  className="shrink-0 text-amber-400"
                  aria-label={proxy.status}
                />
              )}
            </dd>
          ) : (
            <dd className="mt-0.5 truncate text-[13px] font-medium text-amber-200">
              Not assigned
            </dd>
          )}
        </div>
      </div>
    </dl>
  );
}

function Signal({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-t border-white/[0.07] px-3 py-3 first:border-t-0 sm:border-t-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-neutral-400">
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-600">
          {label}
        </dt>
        <dd className="mt-0.5 truncate text-[13px] font-medium text-neutral-200" title={value}>
          {value}
        </dd>
      </div>
    </div>
  );
}
