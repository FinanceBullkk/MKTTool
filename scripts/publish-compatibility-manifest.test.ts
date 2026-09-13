import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPATIBILITY_PUBLISH_ARTIFACT_KINDS,
  parseCompatibilityPublishArgs,
  publishCompatibilityManifest,
} from "./publish-compatibility-manifest";
import { prepareCompatibilityPublication } from "./prepare-compatibility-publication";
import {
  createPublicationFixture,
  createPublicationStorage,
  PUBLICATION_TEST_NOW,
  publicationTestConfig,
} from "./publish-compatibility-manifest-test-fixture";

vi.mock("../src/lib/release/release-root-trust", async () => ({
  WINDOWS_RELEASE_ROOT_TRUST:
    (await import("./publish-compatibility-manifest-test-fixture")).publicationTestRootTrust,
}));

describe("compatibility publisher CLI", () => {
  it("requires and publishes the engine with the compatible app tuple", () => {
    const values = [
      "--manifest", "signed.json",
      "--revocations", "revocations.json",
      "--installer", "installer.exe",
      "--relay", "relay.zip",
      "--browser", "app.asar",
      "--control-contract", "control.json",
      "--engine", "engine.zip",
    ];

    expect(COMPATIBILITY_PUBLISH_ARTIFACT_KINDS).toEqual([
      "installer",
      "relay",
      "browser",
      "control-contract",
      "engine",
    ]);
    expect(parseCompatibilityPublishArgs(values).engine).toBe(path.resolve("engine.zip"));
    expect(() => parseCompatibilityPublishArgs(values.slice(0, -2))).toThrow(/--engine/);
  });
});

describe("complete compatibility publication preflight", () => {
  let fixture: ReturnType<typeof createPublicationFixture>;
  let remote: ReturnType<typeof createPublicationStorage>;
  const publish = () => publishCompatibilityManifest(fixture.args, {
    config: publicationTestConfig, storage: remote.storage, report: () => {},
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(PUBLICATION_TEST_NOW);
    fixture = createPublicationFixture();
    remote = createPublicationStorage();
  });
  afterEach(() => {
    rmSync(fixture.directory, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it("checks every remote key before the first PUT and publishes the manifest last", async () => {
    const { objects } = prepareCompatibilityPublication(fixture.args);
    await publish();
    expect(remote.events.slice(0, objects.length)).toEqual(objects.map(({ key }) => `HEAD ${key}`));
    expect(remote.storage.putObject.mock.calls.map(([input]) => input.key)).toEqual(objects.map(({ key }) => key));
    expect(remote.storage.getObject).toHaveBeenCalledTimes(7);
    expect(remote.objects.get(objects.at(-1)!.key)?.body).toEqual(readFileSync(fixture.args.manifest));
  });

  it("rejects a mismatch in the last local artifact without any remote operation", async () => {
    writeFileSync(fixture.args.engine, "wrong engine");
    await expect(publish()).rejects.toThrow("local engine artifact does not match");
    expect(remote.storage.putObject).not.toHaveBeenCalled();
    expect(remote.storage.headObject).not.toHaveBeenCalled();
  });

  it.each(["signature", "revocations", "control-contract", "URL"])(
    "rejects invalid local %s without a PUT", async (invalid) => {
      if (invalid === "signature") {
        const signed = fixture.sign();
        signed.manifest.artifacts.engine.sha256 = "f".repeat(64);
        writeFileSync(fixture.args.manifest, JSON.stringify(signed));
      } else if (invalid === "revocations") {
        writeFileSync(fixture.args.revocations, '[{"invalid":true}]');
      } else if (invalid === "control-contract") {
        fixture.manifest.artifacts.browser.version = "99.0.0";
        fixture.sign();
      } else {
        fixture.manifest.artifacts.engine.url = "https://releases.example/wrong-path";
        fixture.sign();
      }
      await expect(publish()).rejects.toThrow();
      expect(remote.storage.putObject).not.toHaveBeenCalled();
      expect(remote.storage.headObject).not.toHaveBeenCalled();
    },
  );

  it.each([5, 6])("rejects a conflict in remote object %i before writing earlier missing objects", async (index) => {
    const object = prepareCompatibilityPublication(fixture.args).objects[index];
    remote.objects.set(object.key, {
      body: object.body,
      info: { sizeBytes: object.body.length, lastModified: PUBLICATION_TEST_NOW, metadata: { sha256: "f".repeat(64) } },
    });
    await expect(publish()).rejects.toThrow("already exists with different bytes or metadata");
    expect(remote.storage.putObject).not.toHaveBeenCalled();
  });

  it("does a full GET before accepting a matching HEAD in preflight", async () => {
    const object = prepareCompatibilityPublication(fixture.args).objects.at(-1)!;
    remote.objects.set(object.key, {
      body: Buffer.alloc(object.body.length),
      info: { sizeBytes: object.body.length, lastModified: PUBLICATION_TEST_NOW, metadata: object.metadata },
    });
    await expect(publish()).rejects.toThrow("bytes do not match the local publication input");
    expect(remote.storage.getObject).toHaveBeenCalledOnce();
    expect(remote.storage.putObject).not.toHaveBeenCalled();
  });

  it("resumes only byte-identical objects and fully verifies them before any PUT", async () => {
    const objects = prepareCompatibilityPublication(fixture.args).objects;
    for (const object of [objects[0], objects[5]]) {
      remote.objects.set(object.key, {
        body: object.body,
        info: { sizeBytes: object.body.length, lastModified: PUBLICATION_TEST_NOW, metadata: object.metadata },
      });
    }
    await publish();
    expect(remote.storage.putObject).toHaveBeenCalledTimes(5);
    expect(remote.events.slice(0, 9).filter((event) => event.startsWith("GET ")))
      .toEqual([`GET ${objects[0].key}`, `GET ${objects[5].key}`]);
    await publish();
    expect(remote.storage.putObject).toHaveBeenCalledTimes(5);
  });

  it("accepts an R2 HEAD that reports zero content length after full byte verification", async () => {
    const objects = prepareCompatibilityPublication(fixture.args).objects;
    const manifest = objects.at(-1)!;
    remote.objects.set(manifest.key, {
      body: manifest.body,
      info: { sizeBytes: 0, lastModified: PUBLICATION_TEST_NOW, metadata: manifest.metadata },
    });
    await publish();
    expect(remote.storage.putObject).toHaveBeenCalledTimes(objects.length - 1);
    expect(remote.storage.getObject).toHaveBeenCalled();
  });

  it("publishes the verified bytes even if local files are replaced during remote preflight", async () => {
    const objects = prepareCompatibilityPublication(fixture.args).objects;
    remote.storage.headObject.mockImplementationOnce(async () => {
      for (const file of Object.values(fixture.args)) writeFileSync(file, "changed after validation");
      return null;
    });
    await publish();
    for (const object of objects) expect(remote.objects.get(object.key)?.body).toEqual(object.body);
  });

  it("fails closed on a conditional PUT race and never attempts later objects", async () => {
    remote.storage.putObject.mockRejectedValueOnce(new Error("PreconditionFailed"));
    await expect(publish()).rejects.toThrow("PreconditionFailed");
    expect(remote.storage.putObject).toHaveBeenCalledOnce();
    expect(remote.storage.putObject.mock.calls[0][0].ifNoneMatch).toBe("*");
    expect(remote.storage.getObject).not.toHaveBeenCalled();
  });
});
