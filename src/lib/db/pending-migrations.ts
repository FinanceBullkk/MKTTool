/**
 * Đối chiếu migration có trên đĩa với migration đã áp vào database.
 *
 * Tách thành hàm thuần vì sai ở đây là kiểu hỏng im lặng đắt nhất: bỏ sót một migration thì
 * app chạy trên schema thiếu cột, và lỗi chỉ nổ ra ở đúng câu truy vấn chạm cột đó — có thể
 * nhiều ngày sau, trên máy người khác.
 *
 * Prisma tự giữ sổ ở bảng `_prisma_migrations`; ở đây KHÔNG dựng sổ riêng, chỉ đọc lại sổ đó
 * để biết có việc phải làm không (và có đáng sao lưu trước không). Việc áp migration vẫn để
 * `prisma migrate deploy` làm.
 */

/** Một dòng trong bảng `_prisma_migrations` của Prisma. */
export interface MigrationLedgerRow {
  migration_name: string;
  /** null = migration chạy dở hoặc hỏng giữa chừng. */
  finished_at: Date | string | null;
  /** khác null = đã bị đánh dấu quay lui. */
  rolled_back_at: Date | string | null;
}

/**
 * Migration coi là ĐÃ ÁP khi chạy xong và chưa bị quay lui.
 *
 * Dòng dở dang cố ý bị coi là chưa áp: `prisma migrate deploy` sẽ dừng lại và nói rõ database
 * đang ở trạng thái hỏng, tốt hơn nhiều so với việc mình lặng lẽ bỏ qua rồi chạy tiếp.
 */
export function appliedMigrationNames(rows: MigrationLedgerRow[]): Set<string> {
  return new Set(
    rows
      .filter((row) => row.finished_at !== null && row.rolled_back_at === null)
      .map((row) => row.migration_name),
  );
}

/**
 * Migration có trên đĩa nhưng chưa vào database, giữ nguyên thứ tự áp.
 *
 * Tên thư mục migration bắt đầu bằng mốc thời gian nên xếp theo tên là xếp đúng thứ tự.
 */
export function findPendingMigrations(
  onDiskNames: string[],
  applied: Set<string>,
): string[] {
  return [...onDiskNames].sort().filter((name) => !applied.has(name));
}
