/** Các khối bố cục dùng lại ở mọi trang. Thuần trình bày, không có logic. */

/** Nút nhỏ trong bảng và thẻ nhắc việc — khai một chỗ để hàng đợi và trang Hôm nay không lệch nhau. */
export const SMALL_BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-2 py-1 text-xs transition hover:bg-neutral-100 " +
  "disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="app-page">{children}</div>;
}

export function PageHeading({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-7 max-w-3xl">
      <h1 className="text-pretty text-3xl font-semibold leading-tight tracking-[-0.025em] text-white">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 text-pretty text-[15px] leading-6 text-neutral-400">{description}</p>
      ) : null}
    </header>
  );
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="app-surface mb-6 rounded-2xl p-5 sm:p-6">
      {title ? <h2 className="mb-4 text-base font-semibold text-white">{title}</h2> : null}
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
      {children}
    </p>
  );
}

export function StatusBadge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="border-b border-white/[0.08] text-xs text-neutral-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="pb-3 pr-4 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.07]">{children}</tbody>
      </table>
    </div>
  );
}
