# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Ảnh chạy MKTTool — xem plans/260804-1752-web-chung-cho-team-phan-tan/phase-05
#
# Dockerfile chứ không phải cấu hình riêng của Railway (QĐ 9): cùng file này chạy
# được ở Render, Fly, hay một VPS. Khóa vào một hãng là thứ chỉ phát hiện ra vào
# ngày muốn rời hãng đó.
#
# ## Vì sao ảnh này KHÔNG mỏng như ảnh Next.js thường thấy
#
# Cách thường gặp là `output: "standalone"` rồi chép mỗi `.next/standalone`. Ở đây
# không làm được, và lý do nằm trong thiết kế chứ không phải ở sự lười:
#
#   `health-check-process-launcher.ts` sinh một TIẾN TRÌNH RIÊNG bằng
#   `tsx scripts/run-health-check.ts` — vì một lượt dò mất gần mười phút, dài hơn
#   mọi giới hạn chờ hợp lý của request HTTP.
#
# Nên lúc chạy thật, ảnh phải có: `tsx`, cả thư mục `scripts/`, và cả `src/` (script
# đó import thẳng từ `../src/...`). Cắt bất kỳ thứ nào cũng làm nút "Dò cả đàn" sinh
# ra một tiến trình chết ngay dòng đầu — và `stdio: "ignore"` nuốt sạch câu lỗi.
#
# Playwright cũng vậy: nó chạy ở tiến trình con đó, nên Chromium phải nằm trong ảnh.
# ─────────────────────────────────────────────────────────────────────────────

# Ghim theo bản Playwright trong package.json. Ảnh này đã có sẵn Chromium và toàn bộ
# thư viện hệ thống của nó — tự cài `playwright install --with-deps` trên ảnh trần thì
# lệ thuộc vào một danh sách gói apt đổi theo từng bản Debian, và nó hỏng vào ngày nâng
# cấp chứ không hỏng lúc viết.
#
# ĐỔI BẢN PLAYWRIGHT LÀ PHẢI ĐỔI CẢ DÒNG NÀY. Lệch bản thì Playwright từ chối chạy kèm
# câu "Executable doesn't exist" — may là nó nói thẳng, không đoán mò.
FROM mcr.microsoft.com/playwright:v1.62.1-noble AS base

WORKDIR /app

# ── Tầng phụ thuộc ───────────────────────────────────────────────────────────
# Tách riêng để Docker dùng lại cache: chỉ đổi mã nguồn thì không phải cài lại từ đầu.
FROM base AS deps

COPY package.json package-lock.json ./
COPY prisma ./prisma

# `npm ci` cần cả devDependencies vì `next build` dùng tailwind và typescript.
# `postinstall` tự chạy `prisma generate`, nên phải chép `prisma/` vào TRƯỚC.
RUN npm ci

# ── Tầng build ───────────────────────────────────────────────────────────────
FROM base AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# TEAM_TIMEZONE được nhúng THẲNG VÀO BUNDLE lúc build (xem `env` trong next.config.ts),
# vì ô chọn giờ ở trang xếp lịch là component client và phải hiện đúng múi giờ team.
#
# Hệ quả phải nhớ: đổi múi giờ team thì phải BUILD LẠI, khởi động lại không đủ. Và nếu
# quên truyền biến này lúc build thì trang xếp lịch ném lỗi ngay lần đầu chạm tới ngày
# giờ — cố ý như vậy, hơn là lặng lẽ lùi về giờ máy người dùng.
ARG TEAM_TIMEZONE=Asia/Ho_Chi_Minh
ENV TEAM_TIMEZONE=$TEAM_TIMEZONE

# Không có secret nào lúc build, và đó là chủ ý: `auth-server.ts` khởi tạo Better Auth
# TRỄ (lần đầu phục vụ request) đúng để build chạy được trong môi trường không có secret.
RUN npm run build

# ── Tầng chạy ────────────────────────────────────────────────────────────────
FROM base AS runner

WORKDIR /app
ENV NODE_ENV=production

# `pg_dump` cho `npm run db:backup` và cho bước tự sao lưu của `vault:rekey`. Thiếu nó
# thì xoay khóa dừng ngay ở bước sao lưu — đúng hướng an toàn, nhưng đúng lúc phiền nhất.
RUN apt-get update \
  && apt-get install --no-install-recommends -y postgresql-client \
  && rm -rf /var/lib/apt/lists/*

# Chỉ `dependencies`, không lấy devDependencies. Cắt được tailwind/eslint/vitest/typescript
# — thứ chỉ cần lúc build. Còn `tsx`, `playwright`, `prisma` nằm ở `dependencies` vì chúng
# thật sự cần lúc chạy: xem khối chú thích đầu file.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

# `.next` là bản đã build. `src` và `scripts` là mã nguồn tiến trình dò chạy bằng tsx.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY src ./src
COPY scripts ./scripts

# Thư mục dữ liệu vận hành: ảnh chụp màn hình của bộ dò và bản sao lưu.
#
# Trên Railway đây là ổ đĩa **tạm** — mất sau mỗi lần deploy. Ảnh chụp mất thì chỉ mất
# bằng chứng của lượt dò cũ (kết luận vẫn nằm trong database), nhưng BẢN SAO LƯU mất thì
# mất thật: `db:backup` phải tải bản sao về máy, đừng để nó ở đây.
RUN mkdir -p data/screenshots data/backups

# Playwright trong ảnh này chạy bằng user `pwuser` có sẵn — không chạy root.
RUN chown -R pwuser:pwuser /app
USER pwuser

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Không khai `-H 127.0.0.1` như thời chạy trên một máy: từ GĐ2 hàng rào là đăng nhập
# Google + ALLOWED_EMAILS, không phải chỗ app lắng nghe. Trong container mà nghe ở
# 127.0.0.1 thì không ai ngoài container gọi tới được.
CMD ["npm", "run", "start"]
