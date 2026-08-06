import { describe, expect, it } from "vitest";
import {
  collectOpsAlerts,
  dailyHealthCheckScheduleAlert,
  vaultKeySeparationAlert,
} from "./collect-ops-alerts";

/** Hai khóa hex hợp lệ, khác nhau. Nội dung không quan trọng — chỉ so bằng nhau hay không. */
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

function env(server?: string, operator?: string): Partial<Record<string, string>> {
  return {
    ...(server === undefined ? {} : { VAULT_KEY_SERVER: server }),
    ...(operator === undefined ? {} : { VAULT_KEY_OPERATOR: operator }),
  };
}

describe("vaultKeySeparationAlert", () => {
  it("im lặng khi máy chủ chỉ có khóa vùng server — đó là đích của GĐ3", () => {
    expect(vaultKeySeparationAlert(env(KEY_A))).toBeNull();
  });

  it("báo ĐỎ khi hai vùng dùng chung một khóa", () => {
    const alert = vaultKeySeparationAlert(env(KEY_A, KEY_A));

    expect(alert?.id).toBe("vault-key-shared");
    expect(alert?.tone).toBe("red");
    // Câu phải nói ra hậu quả, không chỉ nói ra hiện tượng "hai biến giống nhau".
    expect(alert?.message).toContain("chưa thật sự tách");
    expect(alert?.action).toContain("vault:rekey");
  });

  it("so khóa không phân biệt hoa thường và khoảng trắng thừa", () => {
    // Cùng một khóa dán vào hai chỗ với cách viết khác nhau vẫn là CÙNG một khóa. Bỏ sót ca
    // này là bỏ sót đúng lúc cảnh báo cần kêu nhất.
    expect(vaultKeySeparationAlert(env(` ${KEY_A.toUpperCase()} `, KEY_A))?.tone).toBe("red");
  });

  it("báo VÀNG khi đã tách khóa nhưng máy chủ còn giữ khóa vùng operator", () => {
    const alert = vaultKeySeparationAlert(env(KEY_A, KEY_B));

    expect(alert?.id).toBe("vault-key-operator-on-server");
    expect(alert?.tone).toBe("amber");
    expect(alert?.action).toContain("Gỡ VAULT_KEY_OPERATOR");
  });

  it("KHÔNG báo khi thiếu khóa vùng server — chỗ đó đã hỏng ồn ào bằng lỗi", () => {
    expect(vaultKeySeparationAlert(env(undefined, KEY_B))).toBeNull();
    expect(vaultKeySeparationAlert(env())).toBeNull();
  });

  it("chuỗi rỗng tính là chưa đặt, không tính là hai khóa bằng nhau", () => {
    expect(vaultKeySeparationAlert(env("   ", "   "))).toBeNull();
  });
});

describe("dailyHealthCheckScheduleAlert", () => {
  const prod = (at?: string) => ({
    NODE_ENV: "production",
    ...(at === undefined ? {} : { HEALTH_CHECK_DAILY_AT: at }),
  });

  it("im lặng ở máy dev — máy dev cố ý không bật lịch", () => {
    expect(dailyHealthCheckScheduleAlert({})).toBeNull();
    expect(dailyHealthCheckScheduleAlert({ NODE_ENV: "development" })).toBeNull();
  });

  it("im lặng khi lịch đã bật", () => {
    expect(dailyHealthCheckScheduleAlert(prod("09:00"))).toBeNull();
  });

  it("báo VÀNG khi máy chủ chạy mà chưa bật lịch", () => {
    const alert = dailyHealthCheckScheduleAlert(prod());

    expect(alert?.id).toBe("health-check-schedule-off");
    expect(alert?.tone).toBe("amber");
    expect(alert?.audience).toBe("ADMIN");
    expect(alert?.action).toContain("HEALTH_CHECK_DAILY_AT");
  });

  /**
   * Khai sai nặng hơn chưa khai: người gõ `9h00` vào biến này ĐANG TIN là lịch đã bật, nên câu
   * cảnh báo phải nói ra đúng chỗ sai chứ không chỉ nói "chưa bật".
   */
  it("báo ĐỎ khi khai sai dạng, kèm chỗ sai", () => {
    const alert = dailyHealthCheckScheduleAlert(prod("9h00"));

    expect(alert?.id).toBe("health-check-schedule-invalid");
    expect(alert?.tone).toBe("red");
    expect(alert?.message).toContain("9h00");
  });
});

describe("collectOpsAlerts", () => {
  it("OPERATOR không thấy cảnh báo chỉ ADMIN sửa được", () => {
    expect(collectOpsAlerts("OPERATOR", env(KEY_A, KEY_A))).toEqual([]);
  });

  it("ADMIN thấy cảnh báo cấu hình", () => {
    const alerts = collectOpsAlerts("ADMIN", env(KEY_A, KEY_A));

    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe("vault-key-shared");
  });

  it("không ai thấy gì khi cấu hình đã đúng đích", () => {
    expect(collectOpsAlerts("ADMIN", env(KEY_A))).toEqual([]);
    expect(collectOpsAlerts("OPERATOR", env(KEY_A))).toEqual([]);
  });

  it("mỗi mục có id, câu mô tả và việc phải làm — không mục nào thiếu đường đi tiếp", () => {
    for (const alert of collectOpsAlerts("ADMIN", env(KEY_A, KEY_B))) {
      expect(alert.id).not.toBe("");
      expect(alert.message.length).toBeGreaterThan(0);
      expect(alert.action.length).toBeGreaterThan(0);
    }
  });
});
