import { ParkedScopeBanner } from "@/components/layout/parked-scope-banner";
import Link from "next/link";
import { CheckTokensButton } from "@/components/facebook/facebook-connection-actions";
import { FacebookConnectionTable } from "@/components/facebook/facebook-connection-table";
import { FacebookPageTable } from "@/components/facebook/facebook-page-table";
import { Card, PageHeading } from "@/components/ui/page-section";
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
    <>
      <ParkedScopeBanner what="Facebook" />
      <PageHeading
        title="Facebook"
        description="Facebook Pages use the official Graph API. Facebook Groups require manual posting because Meta removed group publishing access in April 2024."
      />

      {connected ? (
        <div className="mb-6 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          {connected}
        </div>
      ) : null}
      {error ? (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <Card title="Connect">
        {configured ? (
          <div className="space-y-4">
            <a
              href="/api/facebook/oauth/start"
              className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              Connect Facebook nick
            </a>
            <p className="text-xs text-neutral-500">
              Sign in with the personal nick that administers the Facebook Pages. Select every Page
              on the permission screen; any omitted Page will not appear here.
            </p>
            <CheckTokensButton />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Meta App is not configured. The rest of the tool continues to work. Complete these
              four steps when Facebook Page publishing is needed:
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {SETUP_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-xs text-neutral-500">
              App Review is not required. Development mode can publish to Pages you administer.
            </p>
          </div>
        )}
      </Card>

      {connections.length > 0 ? (
        <Card title="Connected nicks">
          <FacebookConnectionTable connections={connections} />
        </Card>
      ) : null}

      <Card title="Facebook Pages">
        <FacebookPageTable pages={pages} adminOptions={fbAccounts} />
      </Card>

      <Card title="Facebook Groups - why posting is manual">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Meta removed the <code>publish_to_groups</code> permission in April 2024. Tools such as
          Buffer, Hootsuite, and Make have removed this feature. Any service claiming otherwise
          must drive a browser as if it were a user, which is exactly the behavior that risks a ban.
        </p>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
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
      </Card>
    </>
  );
}
