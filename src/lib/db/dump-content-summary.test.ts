import { describe, expect, it } from "vitest";
import { summarizeDumpContents } from "./dump-content-summary";

/** Cắt từ một bản dump thật của `pg_dump --format=plain`. */
const DUMP_WITH_DATA = `--
-- PostgreSQL database dump
--

CREATE TABLE public."Proxy" (
    id text NOT NULL,
    host text NOT NULL
);

COPY public."Proxy" (id, host) FROM stdin;
cm1	1.2.3.4
cm2	5.6.7.8
\\.


COPY public."Account" (id, username) FROM stdin;
cm9	nick_one
\\.


COPY public."HealthCheckLock" (key, token) FROM stdin;
\\.


ALTER TABLE ONLY public."Proxy" ADD CONSTRAINT "Proxy_pkey" PRIMARY KEY (id);
`;

describe("summarizeDumpContents", () => {
  it("counts rows and includes only tables WITH data", () => {
    // Ba khối COPY nhưng chỉ hai bảng có hàng — bảng rỗng không nói gì về nội dung bản sao.
    expect(summarizeDumpContents(DUMP_WITH_DATA)).toEqual({ tablesWithRows: 2, totalRows: 3 });
  });

  /**
   * Nhánh cả module sinh ra để bắt: `pg_dump` chạy trên database rỗng vẫn cho ra file .sql hợp
   * lệ, đủ cấu trúc bảng, và mọi phép kiểm khác đều xanh.
   */
  it("returns zero counts for an empty database dump instead of an error", () => {
    const structureOnly = DUMP_WITH_DATA.replace(/COPY[\s\S]*?\\\.\n/g, "");

    expect(summarizeDumpContents(structureOnly)).toEqual({ tablesWithRows: 0, totalRows: 0 });
  });

  it("reads Windows-style line endings", () => {
    expect(summarizeDumpContents(DUMP_WITH_DATA.replace(/\n/g, "\r\n"))).toEqual({
      tablesWithRows: 2,
      totalRows: 3,
    });
  });

  it("returns zero counts for an empty string", () => {
    expect(summarizeDumpContents("")).toEqual({ tablesWithRows: 0, totalRows: 0 });
  });

  /**
   * Dữ liệu có thể chứa chuỗi trông giống câu lệnh SQL — `pg_dump` không đóng khung gì cả, nên
   * chỉ dòng `\.` đứng một mình mới là dấu kết. Đếm nhầm ở đây là báo sai số hàng.
   */
  it("counts data rows that resemble SQL statements", () => {
    const tricky = [
      "COPY public.\"Content\" (id, body) FROM stdin;",
      "cm1\tCOPY public.\"X\" (a) FROM stdin;",
      "cm2\tALTER TABLE something",
      "\\.",
      "",
    ].join("\n");

    expect(summarizeDumpContents(tricky)).toEqual({ tablesWithRows: 1, totalRows: 2 });
  });
});
