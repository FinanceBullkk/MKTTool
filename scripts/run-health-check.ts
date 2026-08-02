/**
 * Chạy một lượt dò sức khỏe cho mọi nick Reddit chưa chết.
 *
 * Đây là lệnh để đặt lịch chạy hằng ngày (Task Scheduler trên Windows). Một lần/ngày là đủ:
 * dò mỗi giờ không cho thêm thông tin gì mà lại biến chính bộ dò thành thứ đáng ngờ.
 *
 * Chạy: npm run health
 *   --account <username>   chỉ dò một nick (bỏ luôn phần nghỉ giữa các nick)
 *   --no-spacing           chạy liền mạch, không nghỉ 30-90 giây. CHỈ dùng khi thử nghiệm.
 */
import { prisma } from "../src/lib/db/prisma-client";
import { HealthCheckBusyError } from "../src/lib/health/health-check-lock";
import {
  HealthCheckSetupError,
  runHealthCheck,
} from "../src/lib/health/health-check-runner";
import { ObserverSessionError } from "../src/lib/health/observer-browser-session";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function resolveAccountIds(): Promise<string[] | undefined> {
  const username = flag("account");
  if (!username) return undefined;

  const account = await prisma.account.findFirst({
    where: { platform: "REDDIT", username },
    select: { id: true },
  });

  if (!account) {
    console.error(`Không tìm thấy nick Reddit tên "${username}".`);
    process.exit(1);
  }

  return [account.id];
}

async function main() {
  const accountIds = await resolveAccountIds();
  // Dò đúng một nick thì không có "nick tiếp theo" để giãn cách với.
  const noSpacing = process.argv.includes("--no-spacing") || accountIds !== undefined;

  const result = await runHealthCheck({
    accountIds,
    ...(noSpacing ? { spacing: { minMs: 0, maxMs: 0 } } : {}),
    onProgress: (line) => console.log(line),
  });

  console.log(`\nXong ${result.checked} nick trong ${Math.round(result.durationMs / 1000)} giây.`);

  const summary = Object.entries(result.byVerdict)
    .map(([verdict, count]) => `${verdict}: ${count}`)
    .join(", ");
  if (summary) console.log(`Kết quả — ${summary}`);

  if (result.statusChanges.length > 0) {
    console.log("\nNick vừa bị cách ly (bộ luật sẽ chặn mọi job của chúng):");
    for (const change of result.statusChanges) {
      console.log(`  ${change.username} → ${change.to}`);
    }
  }

  // Có nick nào không dò được thì báo bằng mã thoát, để lịch chạy tự động phát hiện được.
  const errors = result.byVerdict.ERROR ?? 0;
  if (errors > 0) {
    console.log(`\n${errors} nick không dò được — xem lý do ở trên. Đây KHÔNG phải tin tốt.`);
  }
  process.exit(errors > 0 ? 1 : 0);
}

main()
  .catch((error) => {
    if (
      error instanceof HealthCheckBusyError ||
      error instanceof HealthCheckSetupError ||
      error instanceof ObserverSessionError
    ) {
      console.error(`\n${error.message}`);
    } else {
      console.error("\nLượt dò hỏng giữa chừng:", error);
    }
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
