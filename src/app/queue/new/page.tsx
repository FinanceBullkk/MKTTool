import Link from "next/link";
import { PostJobComposer } from "@/components/queue/post-job-composer";
import { Card, EmptyState, PageHeading } from "@/components/ui/page-section";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function NewPostJobPage() {
  const [contents, accounts, targets] = await Promise.all([
    prisma.contentItem.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, type: true, authorName: true },
    }),
    // Nick chết/dính checkpoint vẫn hiện: bộ luật sẽ nói rõ vì sao không đăng được,
    // im lặng giấu đi thì người dùng chỉ thắc mắc "nick đâu mất rồi".
    prisma.account.findMany({
      orderBy: [{ platform: "asc" }, { username: "asc" }],
      select: { id: true, username: true, platform: true },
    }),
    prisma.platformTarget.findMany({
      where: { active: true },
      orderBy: [{ platform: "asc" }, { name: "asc" }],
      select: { id: true, name: true, platform: true },
    }),
  ]);

  // Kho content trống KHÔNG còn chặn: tab "Viết mới" gõ được bài ngay tại đây, và bài đó vẫn
  // vào kho lúc lưu. Thiếu nick hoặc đích thì mới thật sự không xếp lịch được.
  const missing = [
    accounts.length === 0 ? { label: "nick", href: "/accounts" } : null,
    targets.length === 0 ? { label: "đích đăng", href: "/targets" } : null,
  ].filter((item) => item !== null);

  return (
    <>
      <PageHeading
        title="Xếp lịch đăng"
        description="Viết bài mới ngay tại đây hoặc lấy từ kho. Bộ luật chạy khi đủ content, nick, đích và giờ — thấy đèn trước khi bấm, không phải sau."
      />

      <Card>
        {missing.length > 0 ? (
          <EmptyState>
            Còn thiếu {missing.map((item) => item.label).join(", ")}. Thêm ở{" "}
            {missing.map((item, index) => (
              <span key={item.href}>
                {index > 0 ? ", " : ""}
                <Link href={item.href} className="underline">
                  {item.label}
                </Link>
              </span>
            ))}
            .
          </EmptyState>
        ) : (
          <PostJobComposer
            contents={contents}
            accounts={accounts}
            targets={targets}
            // Người viết bài trước thường là người viết bài này — đỡ gõ lại tên mỗi lần.
            defaultAuthorName={contents[0]?.authorName}
          />
        )}
      </Card>

      <p className="text-sm text-neutral-500">
        <Link href="/queue" className="underline">
          ← Về hàng đợi
        </Link>
      </p>
    </>
  );
}
