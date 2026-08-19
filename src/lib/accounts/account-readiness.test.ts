/**
 * "Nick này dùng được chưa" — tám điều kiện, và chúng KHÁC nhau theo nền tảng.
 *
 * Phần đáng canh nhất không phải danh sách chặn mà là **ranh giới Reddit / Facebook**: nới ra thì
 * nick Facebook mang ba lỗi vĩnh viễn không sửa được và người đọc học cách phớt lờ cả cột; siết
 * vào thì nick Reddit thiếu proxy vẫn hiện "Sẵn sàng", tức là nói dối đúng chỗ tốn tiền nhất.
 */
import { describe, expect, it } from "vitest";
import { describeAccountReadiness, type ReadinessInput } from "./account-readiness";

const NOW = new Date("2026-08-07T00:00:00.000Z");

/** Nick Reddit đủ điều kiện. Mỗi bài chỉ ghi đè đúng thứ nó muốn hỏng. */
function redditNick(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    platform: "REDDIT",
    status: "ALIVE",
    coldStartUntil: null,
    voice: "điềm đạm",
    antidetectProfileId: "profile-1",
    firstLoginAt: new Date("2026-08-01T00:00:00.000Z"),
    ownerId: "user-ha",
    proxy: { lastCheckVerdict: "ALIVE" },
    device: { userId: "user-ha", revokedAt: null },
    now: NOW,
    ...overrides,
  };
}

const codesOf = (input: ReadinessInput) =>
  describeAccountReadiness(input).blockers.map((blocker) => blocker.code);

describe("nick Reddit đủ điều kiện", () => {
  it("không còn chặn nào", () => {
    const result = describeAccountReadiness(redditNick());

    expect(result.ready).toBe(true);
    expect(result.waiting).toBe(false);
    expect(result.blockers).toEqual([]);
    expect(result.summary).toBe("Sẵn sàng");
  });
});

describe("từng điều kiện thiếu một cái", () => {
  it.each([
    ["chưa ghi giọng viết", { voice: null }, "NO_VOICE"],
    ["chưa gắn proxy", { proxy: null }, "NO_PROXY"],
    ["proxy hỏng", { proxy: { lastCheckVerdict: "DEAD" } }, "PROXY_BROKEN"],
    ["chưa có profile", { antidetectProfileId: null }, "NO_PROFILE"],
    ["có profile nhưng chưa đăng nhập lần nào", { firstLoginAt: null }, "NOT_LOGGED_IN"],
    ["chưa có chủ", { ownerId: null }, "NO_OWNER"],
    ["chưa ghim máy", { device: null }, "NO_DEVICE"],
  ] as [string, Partial<ReadinessInput>, string][])("%s", (_name, overrides, code) => {
    const result = describeAccountReadiness(redditNick(overrides));

    expect(result.ready).toBe(false);
    expect(result.blockers.map((blocker) => blocker.code)).toContain(code);
    // Mọi chặn đều phải nói được việc phải làm tiếp — cảnh báo không kèm đường đi tiếp là
    // cảnh báo bị phớt lờ.
    expect(result.blockers.every((blocker) => blocker.fix.length > 20)).toBe(true);
  });

  /**
   * Chưa có profile thì chưa có chỗ nào để đăng nhập vào — hai dòng cùng lúc là bắt người đọc tự
   * suy ra thứ tự giữa chúng. Đây là lý do hai nhánh nối bằng `else if` chứ không rời nhau.
   */
  it("chưa có profile thì KHÔNG báo kèm 'chưa đăng nhập'", () => {
    const codes = codesOf(redditNick({ antidetectProfileId: null, firstLoginAt: null }));

    expect(codes).toContain("NO_PROFILE");
    expect(codes).not.toContain("NOT_LOGGED_IN");
  });

  it("proxy 'chưa kiểm lần nào' KHÔNG bị coi là hỏng", () => {
    // Cùng nguyên tắc với /proxies: chưa kiểm ≠ hỏng, và cũng ≠ khỏe. Ở đây nó không chặn, vì
    // thứ chặn thật là lần kiểm nói proxy chết — chưa kiểm thì `launch/route.ts` vẫn kiểm lúc bấm.
    expect(codesOf(redditNick({ proxy: { lastCheckVerdict: null } }))).toEqual([]);
  });
});

describe("máy và chủ phải khớp", () => {
  it("máy đã thu hồi là chặn riêng, không lẫn với chưa ghim", () => {
    const result = describeAccountReadiness(
      redditNick({ device: { userId: "user-ha", revokedAt: NOW } }),
    );

    expect(result.blockers.map((blocker) => blocker.code)).toEqual(["DEVICE_REVOKED"]);
  });

  it("máy của người khác là cụm lệch", () => {
    const result = describeAccountReadiness(
      redditNick({ device: { userId: "user-nam", revokedAt: null } }),
    );

    expect(result.blockers.map((blocker) => blocker.code)).toEqual(["CLUSTER_DRIFT"]);
  });

  /** Nick không chủ mà có máy: đã bị `assignAccountCluster` chặn, nhưng cột vẫn phải đọc được. */
  it("không chủ thì báo thiếu chủ, không báo lệch", () => {
    const codes = codesOf(redditNick({ ownerId: null }));

    expect(codes).toContain("NO_OWNER");
    expect(codes).not.toContain("CLUSTER_DRIFT");
  });
});

describe("nick Facebook — ranh giới quan trọng nhất", () => {
  const fbNick = (overrides: Partial<ReadinessInput> = {}): ReadinessInput =>
    redditNick({
      platform: "FACEBOOK",
      proxy: null,
      antidetectProfileId: null,
      device: null,
      ...overrides,
    });

  /**
   * Fanpage đăng bằng Graph API: không mở trình duyệt, không proxy, không profile, nên không có
   * máy nào để ghim. Đòi đủ là bịa ra ba lỗi vĩnh viễn không sửa được.
   */
  it("không proxy, không profile, không máy vẫn là SẴN SÀNG", () => {
    const result = describeAccountReadiness(fbNick());

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("vẫn phải có chủ — bí mật nick nào cũng cần người phụ trách", () => {
    expect(codesOf(fbNick({ ownerId: null }))).toEqual(["NO_OWNER"]);
  });

  /**
   * Khai một nửa là trạng thái tệ nhất: có id profile mà kho không biết nó nằm ở máy nào. Lúc đó
   * ranh giới "Facebook thì miễn" phải tắt.
   */
  it("nhưng KHAI profile antidetect rồi thì phải ghim máy", () => {
    expect(codesOf(fbNick({ antidetectProfileId: "profile-fb" }))).toEqual(["NO_DEVICE"]);
  });

  it("proxy đã khai mà hỏng thì vẫn báo hỏng", () => {
    expect(codesOf(fbNick({ proxy: { lastCheckVerdict: "DEAD" } }))).toEqual(["PROXY_BROKEN"]);
  });

  /**
   * Fanpage đăng bằng Graph API với token chính thức — không ai "đăng nhập vào profile" cả, nên
   * mốc đó vĩnh viễn rỗng. Đòi nó là dựng thêm một lỗi thứ tư không bao giờ sửa được.
   */
  it("KHÔNG đòi mốc đăng nhập lần đầu, kể cả khi đã khai profile", () => {
    const codes = codesOf(fbNick({ antidetectProfileId: "profile-fb", firstLoginAt: null }));

    expect(codes).toEqual(["NO_DEVICE"]);
  });
});

describe("chờ khác với thiếu", () => {
  /**
   * Cold-start là ca duy nhất "chưa trọn vẹn nhưng không ai phải làm gì". Gộp nó với "chưa có
   * proxy" là nói sai: một cái cần người hành động, một cái chỉ cần thời gian trôi.
   */
  it("cold-start là chặn loại CHỜ, không phải thiếu", () => {
    const result = describeAccountReadiness(
      redditNick({
        status: "COLD_START",
        coldStartUntil: new Date("2026-08-14T00:00:00.000Z"),
      }),
    );

    expect(result.ready).toBe(false);
    expect(result.waiting).toBe(true);
    expect(result.summary).toContain("cold-start còn 7 ngày");
  });

  it("cold-start CỘNG thiếu proxy thì không còn là chờ nữa", () => {
    const result = describeAccountReadiness(
      redditNick({
        status: "COLD_START",
        coldStartUntil: new Date("2026-08-14T00:00:00.000Z"),
        proxy: null,
      }),
    );

    expect(result.waiting).toBe(false);
    // Câu tóm tắt nêu thứ phải LÀM, không nêu thứ phải chờ.
    expect(result.summary).toBe("chưa gắn proxy");
  });

  it("nick đã chết thì chặn ngay từ trạng thái", () => {
    expect(codesOf(redditNick({ status: "DEAD" }))).toContain("STATUS");
  });
});

/**
 * TikTok (19/08/2026) — nền tảng thứ ba, và là ca canh chính xác cái bẫy của `needsBrowserStack()`.
 *
 * Hàm đó từng hỏi `platformFamily(platform) === "REDDIT"`, nên nền tảng mới thêm vào rơi thẳng
 * vào nhánh "không cần trình duyệt": nick TikTok không proxy, không profile, không máy vẫn được
 * chấm là SẴN SÀNG. Đó là kiểu nói dối tệ nhất mà cột này có thể mắc — nó bảo mở được đúng cái
 * nick sẽ chạy bằng IP nhà.
 */
describe("nick TikTok — mở bằng trình duyệt, đòi đủ như Reddit", () => {
  const tiktokNick = (overrides: Partial<ReadinessInput> = {}): ReadinessInput =>
    redditNick({ platform: "TIKTOK", ...overrides });

  it("đủ điều kiện thì sẵn sàng", () => {
    const result = describeAccountReadiness(tiktokNick());

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("thiếu proxy KHÔNG được chấm là sẵn sàng", () => {
    const codes = codesOf(tiktokNick({ proxy: null }));

    expect(codes).toContain("NO_PROXY");
  });

  it("thiếu profile antidetect thì chặn", () => {
    expect(codesOf(tiktokNick({ antidetectProfileId: null }))).toContain("NO_PROFILE");
  });

  it("chưa ghim máy thì chặn — id profile chỉ có nghĩa trên đúng máy tạo ra nó", () => {
    expect(codesOf(tiktokNick({ device: null }))).toContain("NO_DEVICE");
  });

  it("có profile nhưng chưa đăng nhập lần nào thì chặn", () => {
    expect(codesOf(tiktokNick({ firstLoginAt: null }))).toContain("NOT_LOGGED_IN");
  });

  it("proxy hỏng thì chặn, không phải chỉ cảnh báo", () => {
    expect(codesOf(tiktokNick({ proxy: { lastCheckVerdict: "DEAD" } }))).toContain("PROXY_BROKEN");
  });
});
