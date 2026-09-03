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
  it("stays silent when the server holds only the server-domain key", () => {
    expect(vaultKeySeparationAlert(env(KEY_A))).toBeNull();
  });

  it("returns a RED alert when both domains share one key", () => {
    const alert = vaultKeySeparationAlert(env(KEY_A, KEY_A));

    expect(alert?.id).toBe("vault-key-shared");
    expect(alert?.tone).toBe("red");
    // Câu phải nói ra hậu quả, không chỉ nói ra hiện tượng "hai biến giống nhau".
    expect(alert?.message).toContain("not actually separated");
    expect(alert?.action).toContain("vault:rekey");
  });

  it("compares keys without case or surrounding whitespace", () => {
    // Cùng một khóa dán vào hai chỗ với cách viết khác nhau vẫn là CÙNG một khóa. Bỏ sót ca
    // này là bỏ sót đúng lúc cảnh báo cần kêu nhất.
    expect(vaultKeySeparationAlert(env(` ${KEY_A.toUpperCase()} `, KEY_A))?.tone).toBe("red");
  });

  it("returns an AMBER alert when the server still holds the separated operator key", () => {
    const alert = vaultKeySeparationAlert(env(KEY_A, KEY_B));

    expect(alert?.id).toBe("vault-key-operator-on-server");
    expect(alert?.tone).toBe("amber");
    expect(alert?.action).toContain("Remove VAULT_KEY_OPERATOR");
  });

  it("does NOT alert when the server-domain key is missing because that already fails loudly", () => {
    expect(vaultKeySeparationAlert(env(undefined, KEY_B))).toBeNull();
    expect(vaultKeySeparationAlert(env())).toBeNull();
  });

  it("treats empty strings as unset rather than equal keys", () => {
    expect(vaultKeySeparationAlert(env("   ", "   "))).toBeNull();
  });
});

describe("dailyHealthCheckScheduleAlert", () => {
  const prod = (at?: string) => ({
    NODE_ENV: "production",
    ...(at === undefined ? {} : { HEALTH_CHECK_DAILY_AT: at }),
  });

  it("stays silent in development where the schedule is intentionally disabled", () => {
    expect(dailyHealthCheckScheduleAlert({})).toBeNull();
    expect(dailyHealthCheckScheduleAlert({ NODE_ENV: "development" })).toBeNull();
  });

  it("stays silent when the schedule is enabled", () => {
    expect(dailyHealthCheckScheduleAlert(prod("09:00"))).toBeNull();
  });

  it("returns an AMBER alert when production runs without the schedule", () => {
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
  it("returns a RED alert for invalid format and includes the bad value", () => {
    const alert = dailyHealthCheckScheduleAlert(prod("9h00"));

    expect(alert?.id).toBe("health-check-schedule-invalid");
    expect(alert?.tone).toBe("red");
    expect(alert?.message).toContain("9h00");
  });
});

describe("collectOpsAlerts", () => {
  it("hides administrator-only alerts from operators", () => {
    expect(collectOpsAlerts("OPERATOR", env(KEY_A, KEY_A))).toEqual([]);
  });

  it("shows configuration alerts to administrators", () => {
    const alerts = collectOpsAlerts("ADMIN", env(KEY_A, KEY_A));

    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe("vault-key-shared");
  });

  it("shows no alerts when configuration matches the target posture", () => {
    expect(collectOpsAlerts("ADMIN", env(KEY_A))).toEqual([]);
    expect(collectOpsAlerts("OPERATOR", env(KEY_A))).toEqual([]);
  });

  it("gives every alert an id, explanation, and next action", () => {
    for (const alert of collectOpsAlerts("ADMIN", env(KEY_A, KEY_B))) {
      expect(alert.id).not.toBe("");
      expect(alert.message.length).toBeGreaterThan(0);
      expect(alert.action.length).toBeGreaterThan(0);
    }
  });
});
