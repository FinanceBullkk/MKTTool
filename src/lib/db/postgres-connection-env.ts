/**
 * Đổi `DATABASE_URL` thành bộ biến môi trường cho các công cụ dòng lệnh của Postgres
 * (`pg_dump`, `psql`).
 *
 * Vì sao không truyền thẳng connection string làm tham số dòng lệnh — cách ngắn hơn và
 * là cách hầu hết ví dụ trên mạng viết: **tham số dòng lệnh của một tiến trình thì ai đăng
 * nhập trên máy cũng đọc được** (Task Manager, `Get-CimInstance Win32_Process`, `ps` trên
 * Linux). Mà connection string có mật khẩu database — tức chìa vào kho ciphertext của toàn
 * bộ nick. Biến môi trường chỉ tiến trình con nhìn thấy.
 *
 * Danh sách tên biến là quy ước sẵn có của libpq, không phải bịa ra ở đây.
 */

/** Biến môi trường libpq đọc. Ghép vào `process.env` khi spawn công cụ dòng lệnh. */
export type PostgresToolEnv = Record<string, string>;

/**
 * Ném lỗi kèm chỉ dẫn sửa nếu URL không phải Postgres — thông báo mặc định của `new URL`
 * chỉ nói "Invalid URL", không giúp người đọc biết phải sửa ở đâu.
 */
export function postgresToolEnv(databaseUrl: string): PostgresToolEnv {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      `DATABASE_URL không phải một URL hợp lệ. Dạng đúng: ` +
        `postgresql://user:mật_khẩu@localhost:5432/mkttool_dev`,
    );
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(
      `DATABASE_URL phải bắt đầu bằng postgresql:// (đang là "${url.protocol}//"). ` +
        `Bản SQLite cũ dùng "file:" — nếu còn thấy nó thì .env chưa cập nhật.`,
    );
  }

  // Bỏ dấu "/" đầu. Tên database có thể chứa ký tự đã mã hóa URL nên phải giải mã.
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) {
    throw new Error(
      "DATABASE_URL thiếu tên database ở cuối. Ví dụ: .../mkttool_dev chứ không phải .../",
    );
  }

  const env: PostgresToolEnv = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: database,
  };

  // Username/password để trống là hợp lệ: libpq sẽ lấy user hệ điều hành và tra .pgpass.
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);

  // Railway bắt buộc TLS; máy dev thì thường không. Tôn trọng đúng thứ người dùng khai
  // trong URL thay vì tự đoán — đoán sai theo hướng lỏng là âm thầm gửi mật khẩu qua
  // kết nối không mã hóa.
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;

  return env;
}
