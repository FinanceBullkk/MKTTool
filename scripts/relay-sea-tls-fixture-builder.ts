import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const resolveFrom = createRequire(path.join(process.cwd(), "package.json"));

/** Builds a disposable SEA around the real staging module without changing release artifacts. */
export function buildRelayStageOnlyTlsFixture(outputDirectory: string): string {
  const entryPoint = path.join(
    process.cwd(),
    "relay",
    "src",
    "compatibility-artifact-staging-sea-fixture.ts",
  );
  if (!existsSync(entryPoint)) throw new Error("The Relay TLS fixture entrypoint is missing.");

  const bundleFile = path.join(outputDirectory, "relay-stage-only-tls-fixture.cjs");
  const blobFile = path.join(outputDirectory, "relay-stage-only-tls-fixture.blob");
  const configFile = path.join(outputDirectory, "relay-stage-only-tls-fixture.sea.json");
  const executableFile = path.join(outputDirectory, "MKTTool-Relay-TLS-Fixture.exe");

  execFileSync(
    process.execPath,
    [
      resolveFrom.resolve("esbuild/bin/esbuild"),
      entryPoint,
      "--bundle",
      "--platform=node",
      `--target=node${process.versions.node.split(".")[0]}`,
      "--format=cjs",
      `--outfile=${bundleFile}`,
    ],
    { stdio: "pipe" },
  );
  writeFileSync(
    configFile,
    `${JSON.stringify(
      { main: bundleFile, output: blobFile, disableExperimentalSEAWarning: true },
      null,
      2,
    )}\n`,
    "utf8",
  );
  execFileSync(process.execPath, ["--experimental-sea-config", configFile], { stdio: "pipe" });
  copyFileSync(process.execPath, executableFile);
  execFileSync(
    process.execPath,
    [
      resolveFrom.resolve("postject/dist/cli.js"),
      executableFile,
      "NODE_SEA_BLOB",
      blobFile,
      "--sentinel-fuse",
      SEA_FUSE,
    ],
    { stdio: "pipe" },
  );
  return executableFile;
}
