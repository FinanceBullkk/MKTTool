/**
 * Tách một file SQL thành từng câu lệnh rời.
 *
 * Cần vì driver SQLite chỉ nhận một câu lệnh mỗi lần gọi, trong khi file migration của Prisma
 * chứa cả chục câu. Dùng để áp migration vào database tạm của test (vitest.global-setup.ts).
 *
 * Cắt thô theo dấu `;` thì hỏng ngay khi có một dấu chấm phẩy nằm trong chuỗi — ví dụ một cột
 * `DEFAULT 'a;b'`. Hàm này theo dõi trạng thái nháy đơn (chuỗi) và nháy kép (tên cột/bảng)
 * nên chỉ cắt ở dấu `;` thật sự kết thúc câu lệnh.
 *
 * Chưa xử lý chú thích khối kiểu C — Prisma không sinh ra loại đó. Nếu sau này có, câu lệnh
 * hỏng sẽ ném lỗi ngay lúc dựng database chứ không âm thầm bỏ qua.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  /** Đang nằm trong chuỗi (') hay tên có dấu nháy kép ("), null nghĩa là đang ở ngoài. */
  let quote: "'" | '"' | null = null;

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) statements.push(trimmed);
    current = "";
  };

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];

    if (quote) {
      current += char;
      if (char === quote) {
        // Nháy đôi liền nhau ('' hoặc "") là ký tự nháy được thoát, chưa đóng chuỗi.
        if (sql[index + 1] === quote) {
          current += sql[index + 1];
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    // Chú thích `--` chạy tới hết dòng.
    if (char === "-" && sql[index + 1] === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1;
      current += "\n";
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ";") {
      flush();
      continue;
    }

    current += char;
  }

  // Câu lệnh cuối có thể không có dấu `;` kết thúc.
  flush();

  return statements;
}
