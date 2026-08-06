/**
 * Đếm xem một bản dump SQL thật sự chứa bao nhiêu hàng dữ liệu.
 *
 * ## Vì sao đáng một bước riêng
 *
 * `pg_dump` chạy xong với mã 0 trên một database **rỗng** cũng cho ra một file `.sql` hoàn toàn
 * hợp lệ: đủ `CREATE TABLE`, đủ ràng buộc, đủ index — chỉ không có dòng dữ liệu nào. Nó trông y
 * hệt một bản sao lưu thật, và mọi câu thông báo kiểu *"✅ đã sao lưu"* đều đúng.
 *
 * Ca này không phải giả tưởng: `PRODUCTION_DATABASE_URL` trỏ nhầm sang một Postgres mới dựng
 * (Railway tạo sẵn khi thêm dịch vụ) là ra đúng cảnh đó. Và bản sao lưu là thứ chỉ được kiểm
 * chứng vào ngày mọi thứ khác đã hỏng — muộn nhất có thể.
 *
 * Nên: đếm hàng, in ra, và nói thẳng khi con số là 0.
 *
 * ## Cách đếm
 *
 * `--format=plain` xuất dữ liệu bằng khối `COPY ... FROM stdin;` kết thúc bằng một dòng `\.`
 * riêng. Đếm số dòng giữa hai mốc đó là đủ — không cần hiểu SQL, và cũng là lý do bản sao lưu
 * cố ý xuất dạng chữ chứ không dạng nén (xem `database-backup.ts`).
 */

export interface DumpContentSummary {
  /** Số bảng CÓ ÍT NHẤT MỘT HÀNG. Bảng rỗng không tính — chúng không nói gì về nội dung. */
  tablesWithRows: number;
  totalRows: number;
}

const COPY_START = /^COPY .* FROM stdin;$/;

export function summarizeDumpContents(sql: string): DumpContentSummary {
  let tablesWithRows = 0;
  let totalRows = 0;

  let rowsInBlock: number | null = null;
  for (const rawLine of sql.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    if (rowsInBlock === null) {
      if (COPY_START.test(line)) rowsInBlock = 0;
      continue;
    }

    // Dấu kết khối. Trong dữ liệu thật, một dòng chỉ gồm `\.` là không thể xuất hiện — `pg_dump`
    // luôn thoát dấu gạch chéo ngược thành `\\`.
    if (line === "\\.") {
      if (rowsInBlock > 0) tablesWithRows += 1;
      totalRows += rowsInBlock;
      rowsInBlock = null;
      continue;
    }

    rowsInBlock += 1;
  }

  return { tablesWithRows, totalRows };
}
