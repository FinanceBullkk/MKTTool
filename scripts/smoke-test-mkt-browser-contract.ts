/**
 * Disposable end-to-end verification of the MKT Browser contract consumed by MKTTool.
 *
 * Run only against an isolated MKT Browser data root. The script refuses a non-empty
 * profile store and never prints the bearer token. Remove the disposable data root after the run.
 */
import { MktBrowserAdapter } from "../src/lib/antidetect/mkt-browser-adapter";
import {
  MKT_BROWSER_MCP_TOKEN_ENV,
  MKT_BROWSER_MCP_URL_ENV,
  resolveMktBrowserMcpUrl,
} from "../src/lib/antidetect/mkt-browser-contract";
import { MktBrowserMcpClient } from "../src/lib/antidetect/mkt-browser-mcp-client";

const REQUIRED_TOOLS = [
  "list_profiles",
  "list_fingerprint_options",
  "create_profile",
  "update_profile",
  "launch_managed_profile",
  "launch_profile",
  "close_profile",
] as const;

const DISPOSABLE_PROXY_PASSWORD = "w02-disposable-proxy-password";

async function waitForRunningState(
  adapter: MktBrowserAdapter,
  profileId: string,
  expected: boolean,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if ((await adapter.isRunning(profileId)) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The disposable profile did not reach running=${expected}.`);
}

async function main(): Promise<void> {
  const token = process.env[MKT_BROWSER_MCP_TOKEN_ENV]?.trim();
  if (!token) {
    throw new Error(`${MKT_BROWSER_MCP_TOKEN_ENV} is required for the disposable smoke test.`);
  }

  const baseUrl = resolveMktBrowserMcpUrl(process.env[MKT_BROWSER_MCP_URL_ENV]);
  const client = new MktBrowserMcpClient(baseUrl, token);
  const adapter = new MktBrowserAdapter(baseUrl, token);
  let profileId: string | null = null;

  await client.initialize();
  const tools = await client.listTools();
  const missingTools = REQUIRED_TOOLS.filter((tool) => !tools.includes(tool));
  if (missingTools.length > 0) {
    throw new Error(`MKT Browser is missing required tools: ${missingTools.join(", ")}.`);
  }
  console.log(`MCP initialize and tools/list passed (${tools.length} tools).`);

  const runtime = await adapter.runtimeInfo();
  if (!runtime?.capabilities.includes("atomic-launch-v1")) {
    throw new Error("MKT Browser does not advertise atomic-launch-v1.");
  }
  console.log(`Runtime contract ${runtime.contractVersion} advertises atomic-launch-v1.`);

  const initialProfiles = await adapter.listProfiles();
  if (initialProfiles.length !== 0) {
    throw new Error(
      `The smoke test requires an empty disposable data root; found ${initialProfiles.length} profile(s).`,
    );
  }
  console.log("Initial disposable profile count: 0.");

  const fingerprintOptions = await adapter.fingerprintOptions();
  if (fingerprintOptions.devices.length === 0 || fingerprintOptions.locales.length === 0) {
    throw new Error("MKT Browser returned an empty fingerprint option catalog.");
  }
  console.log(
    `Fingerprint options passed (${fingerprintOptions.devices.length} devices, ${fingerprintOptions.locales.length} locales).`,
  );

  try {
    profileId = (await adapter.createProfile({
      name: `MKT Browser W02 disposable ${Date.now()}`,
      notes: "Disposable MKB-W02 verification profile. Safe to delete.",
      tags: ["mkb-w02", "disposable"],
    })).profileId;
    console.log("Disposable profile creation passed.");

    let invalidProxyRejected = false;
    try {
      await adapter.applyProxy(profileId, {
        protocol: "http",
        host: "127.0.0.1",
        port: 0,
        username: "disposable",
        password: DISPOSABLE_PROXY_PASSWORD,
      });
    } catch (error) {
      invalidProxyRejected = true;
      if (error instanceof Error && error.message.includes(DISPOSABLE_PROXY_PASSWORD)) {
        throw new Error("The invalid-proxy error exposed the disposable proxy password.");
      }
    }
    if (!invalidProxyRejected) {
      throw new Error("MKT Browser accepted an invalid proxy port.");
    }
    if (await adapter.isRunning(profileId)) {
      throw new Error("The invalid proxy path launched the disposable profile.");
    }
    console.log("Invalid proxy application failed closed without launching a profile.");

    await adapter.launchProfileWithProxy(profileId, {
      protocol: "http",
      host: "127.0.0.1",
      port: 9,
    });
    await waitForRunningState(adapter, profileId, true);
    console.log("Atomic proxy verification and profile launch passed.");

    await adapter.closeProfile(profileId);
    await waitForRunningState(adapter, profileId, false);
    console.log("Profile close passed.");

    const finalProfiles = await adapter.listProfiles();
    if (finalProfiles.length !== 1 || finalProfiles[0]?.id !== profileId) {
      throw new Error("The disposable profile changed unexpectedly after close.");
    }
    console.log("Profile close passed. Profile deletion remains available only inside MKT Browser.");
    profileId = null;
  } finally {
    if (profileId) {
      try {
        if (await adapter.isRunning(profileId)) await adapter.closeProfile(profileId);
      } catch {
        // Preserve the original failure.
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(`MKT Browser smoke test failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
