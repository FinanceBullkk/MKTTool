/**
 * Khối "proxy quan sát viên" trên trang /proxies.
 *
 * Đặt cùng trang với proxy thường vì cùng là việc mua và nhập IP, nhưng tách hẳn thành một
 * khối riêng có lời cảnh báo riêng: đây là IP DUY NHẤT trong hệ thống không được phép chạm
 * vào bất kỳ nick nào. Nhầm một lần là bộ dò tự nối mình vào đàn nick — đúng thứ nó sinh ra
 * để phát hiện ở người khác.
 */
import { ProxyLastCheckCell } from "@/components/proxies/proxy-last-check-cell";
import { ActionForm, Field } from "@/components/ui/form-controls";
import { Card, DataTable, Disclosure, EmptyState, StatusBadge } from "@/components/ui/page-section";
import { Eye, Plus } from "lucide-react";
import { prisma } from "@/lib/db/prisma-client";
import { createObserverProxy } from "@/lib/health/observer-proxy-actions";
import { ObserverProxyRowActions } from "./observer-proxy-row-actions";

export async function ObserverProxySection() {
  const proxies = await prisma.observerProxy.findMany({ orderBy: { label: "asc" } });
  const activeCount = proxies.filter((proxy) => proxy.active).length;

  return (
    <Card
      title={`Observer proxies - ${proxies.length} IPs, ${activeCount} enabled`}
      description="Separate public-view IPs used only by Reddit visibility checks."
      icon={Eye}
    >
      <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-200">
        Never sign in to a nick through an observer IP. Use a residential provider separate from
        the nick proxies.
      </div>

      {proxies.length === 0 ? (
        <EmptyState>
          No observer proxy is configured, so shadowban checks stop before making any request. This
          is intentional: checking from a home IP is worse than not checking. Add one here, then
          click <strong>&quot;Check all nicks&quot;</strong> on the Nick health page; no terminal is
          required.
        </EmptyState>
      ) : (
        <DataTable
          headers={["Label", "Address", "Country", "Status", "Last check", "Notes", ""]}
        >
          {proxies.map((proxy) => (
            <tr key={proxy.id}>
              <td className="py-2 pr-4 font-medium">{proxy.label}</td>
              <td className="py-2 pr-4 font-mono text-xs text-neutral-400">
                {proxy.host}:{proxy.port}
              </td>
              <td className="py-2 pr-4">{proxy.country}</td>
              <td className="py-2 pr-4">
                <StatusBadge
                  label={proxy.active ? "enabled" : "disabled"}
                  className={
                    proxy.active
                      ? "bg-emerald-400/[0.1] text-emerald-300"
                      : "bg-white/[0.06] text-neutral-400"
                  }
                />
              </td>
              <td className="py-2 pr-4">
                <ProxyLastCheckCell
                  verdict={proxy.lastCheckVerdict}
                  checkedAt={proxy.lastCheckedAt}
                  exitIp={proxy.lastExitIp}
                />
              </td>
              <td className="py-2 pr-4 text-neutral-400">
                {proxy.notes ?? "—"}
              </td>
              <td className="py-2 pr-4">
                <ObserverProxyRowActions id={proxy.id} active={proxy.active} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Disclosure summary="Add observer proxy" icon={Plus} className="mt-4">
        <div>
          <ActionForm action={createObserverProxy} submitLabel="Add observer proxy">
            <Field label="Label" name="label" required placeholder="observer-01-de" />
            <Field label="Host" name="host" required placeholder="1.2.3.4" />
            <Field label="Port" name="port" type="number" required placeholder="8080" />
            <Field label="Username" name="username" required />
            <Field label="Password" name="password" type="password" required />
            <Field
              label="Country"
              name="country"
              required
              placeholder="DE"
              hint="It does not need to match the nick's country; this proxy represents an unrelated public viewer"
            />
            <Field
              label="Notes"
              name="notes"
              placeholder="Provider, expiration date..."
            />
            <p className="text-xs text-neutral-500">
              HTTP only. Chromium cannot authenticate SOCKS5 with a username and password; it may
              ignore the credentials and fail, or worse, connect through the home IP without anyone
              noticing.
            </p>
          </ActionForm>
        </div>
      </Disclosure>
    </Card>
  );
}
