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
#
# ## Vì sao lấy từ kho PGDG chứ không dùng `postgresql-client` của Ubuntu
#
# Ubuntu Noble cho bản **16**, còn server thì cao hơn hẳn. Mà `pg_dump` **từ chối dump từ server
# có major cao hơn chính nó** — không phải cảnh báo, là từ chối thẳng:
#
#     pg_dump: error: server version: 18.x; pg_dump version: 16.x
#
# Nên bản Ubuntu mặc định trông như đã cài xong nhưng hỏng ở đúng ngày cần tới. Đã đo trong ảnh
# build ngày 05/08/2026, không phải suy đoán.
#
# ## QUY TẮC: `pg_dump` phải có major ≥ major của SERVER
#
# Không phải "bằng bản trên máy dev" — và ngày 06/08/2026 chỗ này vấp thật. Railway cấp
# `ghcr.io/railwayapp-templates/postgres-ssl:18` trong khi cả ảnh này lẫn máy dev đều ở bản 17,
# nên `db:backup` chạy trên máy chủ sẽ chết ngay dòng đầu. Đã đổi lên 18 để bám theo server.
#
# Đổi bản Postgres của hãng mà quên sửa dòng dưới đây thì **mọi bản sao lưu im lặng ngừng chạy** —
# kể cả bước tự sao lưu trước khi `vault:rekey` ghi đè credential. Cùng họ rủi ro với luật firewall
# WebRTC ở GĐ6: hỏng mà không ai thấy, cho tới đúng ngày cần tới bản sao.
ARG PG_CLIENT_MAJOR=18
RUN apt-get update \
  && apt-get install --no-install-recommends -y curl ca-certificates \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install --no-install-recommends -y "postgresql-client-${PG_CLIENT_MAJOR}" \
  && rm -rf /var/lib/apt/lists/*

# Playwright trong ảnh này chạy bằng user `pwuser` có sẵn — không chạy root.
#
# Đổi user NGAY ĐÂY, trước mọi lệnh chép, và mọi `COPY` đều mang `--chown`. Bản trước dọn quyền
# bằng một dòng `RUN chown -R pwuser:pwuser /app` ở cuối, và dòng đó **một mình nó nặng 998 MB**:
# `chown` đụng vào metadata của mọi file, nên Docker coi cả cây thư mục là đã đổi và chép lại
# nguyên `/app` thành một tầng mới. Ảnh mang hai bản của cùng một thứ.
RUN chown pwuser:pwuser /app
USER pwuser

# Chỉ `dependencies`, không lấy devDependencies. Cắt được tailwind/eslint/vitest/typescript
# — thứ chỉ cần lúc build. Còn `tsx`, `playwright`, `prisma` nằm ở `dependencies` vì chúng
# thật sự cần lúc chạy: xem khối chú thích đầu file.
#
# `npm ci` ở đây KHÔNG tải lại trình duyệt: ảnh nền đặt sẵn `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`
# và đã có Chromium ở đó, nên bước cài của gói `playwright` thấy đủ rồi thì bỏ qua. Đã đo.
COPY --chown=pwuser:pwuser package.json package-lock.json ./
COPY --chown=pwuser:pwuser prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

# `.next` là bản đã build. `src` và `scripts` là mã nguồn tiến trình dò chạy bằng tsx.
COPY --from=builder --chown=pwuser:pwuser /app/.next ./.next
COPY --chown=pwuser:pwuser next.config.ts tsconfig.json ./
COPY --chown=pwuser:pwuser src ./src
COPY --chown=pwuser:pwuser scripts ./scripts

# Thư mục dữ liệu vận hành: ảnh chụp màn hình của bộ dò và bản sao lưu.
#
# Trên Railway đây là ổ đĩa **tạm** — mất sau mỗi lần deploy. Ảnh chụp mất thì chỉ mất
# bằng chứng của lượt dò cũ (kết luận vẫn nằm trong database), nhưng BẢN SAO LƯU mất thì
# mất thật: `db:backup` phải tải bản sao về máy, đừng để nó ở đây.
RUN mkdir -p data/screenshots data/backups

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Không khai `-H 127.0.0.1` như thời chạy trên một máy: từ GĐ2 hàng rào là đăng nhập
# Google + ALLOWED_EMAILS, không phải chỗ app lắng nghe. Trong container mà nghe ở
# 127.0.0.1 thì không ai ngoài container gọi tới được.
CMD ["npm", "run", "start"]
