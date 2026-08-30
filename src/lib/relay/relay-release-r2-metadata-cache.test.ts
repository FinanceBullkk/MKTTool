import { beforeEach, describe, expect, it } from "vitest";
import type { R2Config } from "../r2/r2-config";
import type { RelayRelease } from "./relay-release-file";
import {
  clearRelayReleaseR2MetadataCache,
  readCachedRelayRelease,
  writeCachedRelayRelease,
} from "./relay-release-r2-metadata-cache";

const CONFIG: R2Config = {
  accountId: "acct",
  bucket: "relay",
  accessKeyId: "key",
  secretAccessKey: "secret",
};

const AVAILABLE: RelayRelease = {
  available: true,
  source: "r2",
  sizeBytes: 33_342_752,
  builtAt: new Date("2026-08-30T00:00:00.000Z"),
  version: 16,
  checksum: "a".repeat(64),
};

describe("relay release R2 metadata cache", () => {
  beforeEach(() => {
    clearRelayReleaseR2MetadataCache();
  });

  it("trả lại bản đã nhớ trong hạn dùng", () => {
    writeCachedRelayRelease(CONFIG, 16, AVAILABLE, 1_000);

    expect(readCachedRelayRelease(CONFIG, 16, 2_000)).toEqual(AVAILABLE);
  });

  it("quên sau khi hết hạn, để tiến trình chạy lâu vẫn kiểm chứng lại R2", () => {
    writeCachedRelayRelease(CONFIG, 16, AVAILABLE, 0);

    expect(readCachedRelayRelease(CONFIG, 16, 5 * 60_000 - 1)).toEqual(AVAILABLE);
    expect(readCachedRelayRelease(CONFIG, 16, 5 * 60_000)).toBeNull();
  });

  // Nhớ "chưa có gói" sẽ khiến bản vừa phát hành trông như chưa tồn tại cho tới hết hạn.
  it("không nhớ câu trả lời phủ định", () => {
    writeCachedRelayRelease(CONFIG, 17, { available: false, expectedPath: "r2://relay/v17" }, 0);

    expect(readCachedRelayRelease(CONFIG, 17, 1)).toBeNull();
  });

  it("tách theo version", () => {
    writeCachedRelayRelease(CONFIG, 16, AVAILABLE, 0);

    expect(readCachedRelayRelease(CONFIG, 15, 1)).toBeNull();
  });

  // Đổi ngăn chứa là đổi nguồn sự thật; dùng lại câu trả lời cũ sẽ báo sai về một ngăn khác.
  it("tách theo ngăn chứa", () => {
    writeCachedRelayRelease(CONFIG, 16, AVAILABLE, 0);

    expect(readCachedRelayRelease({ ...CONFIG, bucket: "relay-staging" }, 16, 1)).toBeNull();
  });
});
