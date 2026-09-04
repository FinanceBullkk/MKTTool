import Link from "next/link";
import { notFound } from "next/navigation";
import { Gauge, Network, PencilLine, PlugZap, Trash2 } from "lucide-react";
import { ProxyLastCheckCell } from "@/components/proxies/proxy-last-check-cell";
import { ProxySpeedCell } from "@/components/proxies/proxy-speed-cell";
import { DeleteEntityButton } from "@/components/ui/delete-entity-button";
import { ActionForm } from "@/components/ui/form-controls";
import { BackLink, Card, PageHeading, PageShell, StatusBadge } from "@/components/ui/page-section";
import { ProxyFormFields } from "@/components/vault/proxy-form-fields";
import { deleteProxy } from "@/lib/accounts/vault-delete-actions";
import { updateProxy } from "@/lib/accounts/vault-update-actions";
import { readActor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function ProxyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [proxy, viewer] = await Promise.all([
    prisma.proxy.findUnique({
      where: { id },
      include: { account: { select: { id: true, username: true, platform: true } } },
    }),
    readActor(),
  ]);

  if (!proxy) notFound();

  const isAdmin = viewer?.role === "ADMIN";

  return (
    <PageShell>
      <BackLink href="/proxies">Proxy vault</BackLink>

      <PageHeading
        title={proxy.label}
        eyebrow={`${proxy.protocol.toUpperCase()} · ${proxy.country}`}
        description={`${proxy.host}:${proxy.port}`}
        icon={Network}
        action={
          <StatusBadge
            label={proxy.account ? "Assigned" : "Unassigned"}
            className={
              proxy.account
                ? "bg-emerald-400/10 text-emerald-300"
                : "bg-amber-400/10 text-amber-300"
            }
          />
        }
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        <div className="app-surface rounded-xl p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">
            <PlugZap size={14} /> Assignment
          </div>
          {proxy.account ? (
            <Link href={`/accounts/${proxy.account.id}`} className="text-sm font-semibold text-white hover:text-amber-200">
              {proxy.account.username} <span className="text-xs font-normal text-neutral-500">· {proxy.account.platform}</span>
            </Link>
          ) : (
            <p className="text-sm font-semibold text-amber-200">Available</p>
          )}
        </div>
        <div className="app-surface rounded-xl p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">
            <Network size={14} /> Health
          </div>
          <ProxyLastCheckCell
            verdict={proxy.lastCheckVerdict}
            checkedAt={proxy.lastCheckedAt}
            exitIp={proxy.lastExitIp}
          />
        </div>
        <div className="app-surface rounded-xl p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">
            <Gauge size={14} /> Speed
          </div>
          <ProxySpeedCell
            measuredAt={proxy.lastSpeedAt}
            mbps={proxy.lastSpeedMbps}
            detail={proxy.lastSpeedDetail}
          />
        </div>
      </div>

      {/* Chỉ quản trị viên sửa/xóa được kho proxy — mật khẩu proxy không có bản thứ hai ở đâu
          cả, nên xóa nhầm là mất tiền thật. Ẩn thẻ chỉ để dọn màn hình; chặn THẬT nằm ở
          `adminAction` bọc ngoài hai server action, nên gọi thẳng endpoint vẫn bị từ chối. */}
      {isAdmin ? (
        <>
          <Card
            title="Edit proxy"
            description={proxy.account ? "Changes apply the next time the assigned browser profile opens." : "Update this available endpoint before assigning it to a nick."}
            icon={PencilLine}
          >
            <ActionForm action={updateProxy} submitLabel="Save">
              <input type="hidden" name="id" value={proxy.id} />
              <ProxyFormFields defaults={proxy} />
            </ActionForm>
          </Card>

          <Card
            title="Delete proxy"
            description="Permanent deletion is blocked while this endpoint is assigned to a nick."
            icon={Trash2}
            tone="danger"
          >
            <DeleteEntityButton
              action={deleteProxy.bind(null, proxy.id)}
              label={`proxy "${proxy.label}"`}
              redirectTo="/proxies"
            />
          </Card>
        </>
      ) : (
        <Card title="Administrator-owned settings" icon={PencilLine} tone="muted">
          <p className="text-sm leading-6 text-neutral-400">
            Only administrators can edit or delete proxy records. You can still check this endpoint
            from the{" "}
            <Link href="/proxies" className="underline">
              proxy vault
            </Link>
            .
          </p>
        </Card>
      )}
    </PageShell>
  );
}
