/**
 * `GET /profiles` — và cái đáng canh là **cách nó hỏng**, không phải cách nó chạy.
 *
 * Trả mảng rỗng khi MultiZen chưa nối được là nói *"máy này chưa có profile nào"* — một câu khác
 * hẳn sự thật, và nó dẫn người đọc đi tạo profile mới trong khi kho của họ đang đầy. Đây đúng
 * họ hỏng mà cả dự án tránh ở chỗ khác: "chưa kiểm" không được hiện như "còn sống", "không dò
 * được" không được báo thành "khỏe".
 */
import { describe, expect, it } from "vitest";
import type { AntidetectAdapter } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { AntidetectError } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { handleProfilesRequest } from "./handle-profiles";
import { AntidetectNotConfiguredError, type RelayAntidetect } from "./relay-antidetect";

const OPTIONS = {
  devices: [{ family: "windows-laptop-amd", label: "Windows laptop", screens: [{ width: 1680, height: 1050 }] }],
  locales: [{ id: "en-US", label: "English (US)", country: "us", timezones: ["America/Denver"] }],
};

function fakeAdapter(overrides: Partial<AntidetectAdapter> = {}): AntidetectAdapter {
  return {
    providerName: "Giả",
    isAvailable: async () => true,
    applyProxy: async () => {},
    launchProfile: async (profileId: string) => ({ profileId }),
    closeProfile: async () => {},
    isRunning: async () => true,
    listProfiles: async () => [{ id: "p1", name: "REDDIT — anna", proxyCountry: "us" }],
    fingerprintOptions: async () => OPTIONS,
    createProfile: async () => "p-moi",
    ...overrides,
  };
}

function fakeAntidetect(adapter: AntidetectAdapter | null) {
  const forgotten: boolean[] = [];
  const antidetect = {
    getAdapter: () => {
      if (!adapter) throw new AntidetectNotConfiguredError();
      return adapter;
    },
    isReady: async () => adapter !== null,
    forgetProbe: () => forgotten.push(true),
  } as unknown as RelayAntidetect;
  return { antidetect, forgotten };
}

describe("đường thuận", () => {
  it("trả cả danh sách lẫn danh mục trong một lượt gọi", async () => {
    const { antidetect } = fakeAntidetect(fakeAdapter());

    const result = await handleProfilesRequest(antidetect);

    expect(result.ok).toBe(true);
    expect(result.profiles).toHaveLength(1);
    // Giao diện luôn cần cả hai — tách đôi chỉ để "sạch khái niệm" là thêm một vòng gọi mỗi lần
    // mở trang, đổi lấy không gì cả.
    expect(result.fingerprintOptions).toEqual(OPTIONS);
  });

  it("kho rỗng thì nói rõ là NỐI ĐƯỢC mà chưa có profile", async () => {
    const { antidetect } = fakeAntidetect(fakeAdapter({ listProfiles: async () => [] }));

    const result = await handleProfilesRequest(antidetect);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("nối được");
    expect(result.profiles).toEqual([]);
  });
});

describe("cách nó hỏng", () => {
  it("chưa cấu hình MultiZen: ok=false kèm câu chỉ chỗ lấy token, KHÔNG phải mảng rỗng", async () => {
    const { antidetect } = fakeAntidetect(null);

    const result = await handleProfilesRequest(antidetect);

    expect(result.ok).toBe(false);
    expect(result.profiles).toBeUndefined();
    expect(result.message).toContain("token");
  });

  it("MultiZen tắt giữa chừng: báo hỏng và QUÊN kết quả dò đã nhớ", async () => {
    const { antidetect, forgotten } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async () => {
          throw new AntidetectError("Không kết nối được tới MultiZen.", "MultiZen");
        },
      }),
    );

    const result = await handleProfilesRequest(antidetect);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("MultiZen");
    // Không quên thì `/health` còn trả lời bằng tin cũ tới 30 giây — đủ lâu để người dùng bấm
    // tiếp một nút nữa rồi nhận một câu lỗi khác hẳn cho cùng một nguyên nhân.
    expect(forgotten).toHaveLength(1);
  });

  it("danh mục hỏng cũng là hỏng cả lượt, không trả danh sách nửa vời", async () => {
    const { antidetect } = fakeAntidetect(
      fakeAdapter({
        fingerprintOptions: async () => {
          throw new AntidetectError("Tool lạ.", "MultiZen");
        },
      }),
    );

    const result = await handleProfilesRequest(antidetect);

    expect(result.ok).toBe(false);
    expect(result.profiles).toBeUndefined();
  });
});

describe("không ném ra ngoài", () => {
  /** Chỗ gọi là một nút bấm trên web; một promise reject ở đây chỉ làm nút chết lặng. */
  it("lỗi lạ vẫn thành ok=false chứ không ném", async () => {
    const { antidetect } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async () => {
          throw new Error("lỗi không ai lường");
        },
      }),
    );

    await expect(handleProfilesRequest(antidetect)).resolves.toMatchObject({ ok: false });
  });
});
