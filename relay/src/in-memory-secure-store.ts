/**
 * Kho bí mật trong bộ nhớ — **chỉ dùng cho test**.
 *
 * `main.ts` không import file này, nên esbuild rung nó ra khỏi bundle; nó không đi vào `.exe`.
 *
 * ## Vì sao cần
 *
 * `WindowsSecureStore` gọi DPAPI qua PowerShell, và `runDpapi` ném ngay khi không phải Windows.
 * CI runs on self-hosted Linux, so tests that touch the real store fail there. This happened
 * ngày 12/08/2026, sau khi Phase 03 đổi ba file test sang gọi thẳng kho thật.
 *
 * Cách chữa **không** phải là cho ba file đó `skipIf` không-phải-Windows: chúng kiểm *logic
 * nghiệp vụ* (khóa đi vào kho chứ không vào JSON, hai đường ghi không đạp lên nhau, khóa hỏng thì
 * ném chứ không xoay danh tính máy), và bỏ qua chúng trên CI nghĩa là CI không còn canh gì cho
 * phần đó nữa — mất đúng thứ CI sinh ra để giữ.
 *
 * Thứ **thật sự** cần Windows là bản thân DPAPI, và nó có bộ test riêng ở
 * `windows-secure-store.test.ts` — file đó `skipIf` là đúng chỗ.
 */
import { RELAY_SECRET_NAMES, type RelaySecretName, type SecureStore } from "./secure-store";

export class InMemorySecureStore implements SecureStore {
  private readonly values = new Map<RelaySecretName, string>();

  constructor(seed: Partial<Record<RelaySecretName, string>> = {}) {
    for (const name of Object.values(RELAY_SECRET_NAMES)) {
      const value = seed[name];
      if (value !== undefined) this.values.set(name, value);
    }
  }

  read(name: RelaySecretName): string | null {
    return this.values.get(name) ?? null;
  }

  write(name: RelaySecretName, value: string): void {
    this.values.set(name, value);
  }

  /** Giữ đúng ngữ nghĩa tạo-nếu-chưa-có của bản thật: người thua KHÔNG ghi đè. */
  writeIfAbsent(name: RelaySecretName, value: string): boolean {
    if (this.values.has(name)) return false;
    this.values.set(name, value);
    return true;
  }

  remove(name: RelaySecretName): void {
    this.values.delete(name);
  }
}
