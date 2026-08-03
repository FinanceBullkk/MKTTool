import Link from "next/link";
import { CheckTokensButton } from "@/components/facebook/facebook-connection-actions";
import { FacebookConnectionTable } from "@/components/facebook/facebook-connection-table";
import { FacebookPageTable } from "@/components/facebook/facebook-page-table";
import { Card, PageHeading } from "@/components/ui/page-section";
import { prisma } from "@/lib/db/prisma-client";
import { isFacebookAppConfigured, redirectUri } from "@/lib/facebook/facebook-app-config";

export const dynamic = "force-dynamic";

const SETUP_STEPS = [
  "Tạo app loại Business ở developers.facebook.com.",
  "Thêm sản phẩm Facebook Login, bật quyền pages_manage_posts, pages_read_engagement, pages_show_list.",
  `Khai redirect URI đúng bằng "${redirectUri()}" (Facebook so từng ký tự).`,
  "Copy App ID và App Secret vào FACEBOOK_APP_ID / FACEBOOK_APP_SECRET trong .env rồi khởi động lại dev server.",
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
      <PageHeading
        title="Facebook"
        description="Fanpage đăng bằng Graph API chính thức — miễn phí và không vi phạm chính sách. Group phải đăng tay: Meta đã gỡ quyền tự đăng group từ 04/2024."
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

      <Card title="Kết nối">
        {configured ? (
          <div className="space-y-4">
            <a
              href="/api/facebook/oauth/start"
              className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              Kết nối nick Facebook
            </a>
            <p className="text-xs text-neutral-500">
              Đăng nhập bằng nick cá nhân đang quản trị Fanpage. Ở màn hình cấp quyền nhớ tick chọn
              từng Page — bỏ sót Page nào là Page đó không hiện ở đây.
            </p>
            <CheckTokensButton />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Chưa cấu hình Meta App. Phần còn lại của công cụ vẫn chạy bình thường — làm 4 bước
              này khi nào cần đăng Fanpage:
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {SETUP_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-xs text-neutral-500">
              Không cần App Review: chế độ Development đủ để đăng lên Page do chính mình quản trị.
            </p>
          </div>
        )}
      </Card>

      {connections.length > 0 ? (
        <Card title="Nick đã kết nối">
          <FacebookConnectionTable connections={connections} />
        </Card>
      ) : null}

      <Card title="Fanpage">
        <FacebookPageTable pages={pages} adminOptions={fbAccounts} />
      </Card>

      <Card title="Facebook Group — vì sao không tự động">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Meta gỡ quyền <code>publish_to_groups</code> tháng 04/2024. Không công cụ nào tự đăng
          group được nữa — Buffer, Hootsuite, Make đều đã bỏ tính năng này. Thứ tự nhận làm được
          chỉ có thể là lái trình duyệt giả người dùng, và đó đúng là hành vi khiến nick bị khóa.
        </p>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          Bài group vẫn xếp lịch bình thường ở{" "}
          <Link href="/queue" className="underline">
            hàng đợi
          </Link>{" "}
          với đích loại Facebook Group, vẫn được bộ luật chấm 9 trong 10 luật — đúng như Reddit,
          trừ luật dò shadowban vốn chỉ áp cho Reddit. Đến giờ,{" "}
          <Link href="/" className="underline">
            trang tổng quan
          </Link>{" "}
          nhắc việc kèm nút mở profile và copy nội dung — phần dán và bấm đăng là của người.
        </p>
      </Card>
    </>
  );
}
