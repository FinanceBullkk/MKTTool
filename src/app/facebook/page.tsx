import { ParkedScopeBanner } from "@/components/layout/parked-scope-banner";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Info, Link2, PanelsTopLeft, Share2 } from "lucide-react";
import { CheckTokensButton } from "@/components/facebook/facebook-connection-actions";
import { FacebookConnectionTable } from "@/components/facebook/facebook-connection-table";
import { FacebookPageTable } from "@/components/facebook/facebook-page-table";
import { Card, Disclosure, PageHeading, PageShell } from "@/components/ui/page-section";
import { prisma } from "@/lib/db/prisma-client";
import { isFacebookAppConfigured, redirectUri } from "@/lib/facebook/facebook-app-config";

export const dynamic = "force-dynamic";

const SETUP_STEPS = [
  "Create a Business app at developers.facebook.com.",
  "Add Facebook Login and enable pages_manage_posts, pages_read_engagement, and pages_show_list.",
  `Register the redirect URI exactly as "${redirectUri()}" because Facebook compares every character.`,
  "Copy the App ID and App Secret into FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env, then restart the development server.",
];

export default async function FacebookPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const configured = isFacebookAppConfigured();

  const [connections, pages, fbAccounts] = await Promise.all([
    prisma.facebookConnection.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { pages: true } } },
    }),
    prisma.facebookPage.findMany({
      orderBy: { name: "asc" },
      include: {
        connection: { select: { name: true, expiresAt: true } },
        target: { select: { id: true, name: true } },
      },
    }),
    prisma.account.findMany({
      where: { platform: "FACEBOOK" },
      orderBy: { username: "asc" },
      select: { id: true, username: true },
    }),
  ]);

  return (
    <PageShell>
      <ParkedScopeBanner what="Facebook" />
      <PageHeading
        title="Facebook"
        description="Connected administrator nicks, Pages, and token health"
        eyebrow="Parked publishing channel"
        icon={Share2}
      />

      {connected ? (
        <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          {connected}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200">
          <CircleAlert size={17} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      <Card
        title="Facebook connection"
        description={configured ? "Connect the personal nick that administers the required Pages." : "Meta App configuration is required before connecting a nick."}
        icon={Link2}
      >
        {configured ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="/api/facebook/oauth/start"
              className="brand-btn inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold"
            >
              Connect Facebook nick
            </a>
            <CheckTokensButton />
          </div>
        ) : (
          <Disclosure summary="View Meta App setup" icon={Info}>
            <ol className="grid gap-2 sm:grid-cols-2">
              {SETUP_STEPS.map((step, index) => (
                <li key={step} className="rounded-lg border border-white/[0.07] bg-black/10 p-3 text-xs leading-5">
                  <span className="mr-2 font-mono text-amber-300">0{index + 1}</span>{step}
                </li>
              ))}
            </ol>
          </Disclosure>
        )}
      </Card>

      {connections.length > 0 ? (
        <Card title="Connected nicks" icon={Link2}>
          <FacebookConnectionTable connections={connections} />
        </Card>
      ) : null}

      <Card title="Facebook Pages" icon={PanelsTopLeft}>
        <FacebookPageTable pages={pages} adminOptions={fbAccounts} />
      </Card>

      <Disclosure summary="Why Facebook Group posting is manual" icon={Info} className="mb-5">
        <p className="text-sm leading-6 text-neutral-400">
          Meta removed the <code>publish_to_groups</code> permission in April 2024. Tools such as
          Buffer, Hootsuite, and Make have removed this feature. Any service claiming otherwise
          must drive a browser as if it were a user, which is exactly the behavior that risks a ban.
        </p>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Facebook Group posts can still be scheduled in the{" "}
          <Link href="/queue" className="underline">
            posting queue
          </Link>{" "}
          and evaluated by nine of the ten posting rules, like Reddit except for the Reddit-only
          shadowban check. When the job is due, the{" "}
          <Link href="/" className="underline">
            Home page
          </Link>{" "}
          provides a reminder plus controls to open the browser profile and copy the content. The
          operator still pastes the content and performs the final posting action.
        </p>
      </Disclosure>
    </PageShell>
  );
}
