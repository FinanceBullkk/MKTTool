/** Run with tsx; uses an isolated browser fixture, never a live Relay or database. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";
import type { RelayBrowserHealth } from "@/lib/relay/relay-endpoints";
import { effectiveMinRelayVersion, TICKET_KINDS } from "@/lib/tickets/ticket-types";
const readyBrowser = {
    ready: true,
    provider: "mkt-browser",
    appVersion: "0.3.13",
    contractVersion: 4,
    contractCompatible: true,
    contractProblem: "",
    engine: { kind: "cft", version: "148", status: "ready" },
    capabilities: [
        "idempotent-create-v1", "atomic-launch-v1", "managed-profile-v1", "operation-diagnostics-v1",
    ],
};
const health = {
    status: "ok",
    relayVersion: 16,
    data: {
        ok: true, relayVersion: 16, configured: true, message: "Ready", publicKey: "fixture-public-key",
        deviceId: "fixture-device", antidetectReady: false,
        browser: { ...readyBrowser, ready: false, provider: null } as RelayBrowserHealth,
    },
};
const profiles = {
    status: "rejected", relayVersion: 16, message: "private runtime detail",
    data: { ok: false, relayVersion: 16, message: "private runtime detail" },
};
const readyProfiles = {
    status: "ok", relayVersion: 16,
    data: {
        ok: true, relayVersion: 16, message: "Ready",
        profiles: [{ id: "profile-fixture", name: "Existing profile" }],
        fingerprintOptions: {
            devices: [{ family: "windows-laptop", label: "Laptop", screens: [{ width: 1280, height: 720 }] }],
            locales: [{ id: "en-US", label: "English", country: "us", timezones: ["America/Denver"] }],
        },
    },
};
interface Fixture {
    health: typeof health;
    profiles: typeof profiles | typeof readyProfiles;
    calls: string[];
    hold: boolean;
    pending: (() => void)[];
    mutations: number;
    createArgs: unknown[];
    unmount: () => void;
}
type FixtureWindow = Window & typeof globalThis & {
    fixture: Fixture;
};
async function main() {
    const baselineRef = process.argv.find((argument) => argument.startsWith("--baseline-ref="))?.slice(15);
    const bundle = await build({
        absWorkingDir: process.cwd(),
        stdin: {
            contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { AntidetectProfileCard } from "./src/components/vault/antidetect-profile-card";
      window.fixture = {
        health: ${JSON.stringify(health)}, profiles: ${JSON.stringify(profiles)},
        calls: [], hold: false, pending: [], mutations: 0, createArgs: [],
        request(kind) {
          this.calls.push(kind);
          const outcome = structuredClone(this[kind]);
          return this.hold ? new Promise(resolve => this.pending.push(() => resolve(outcome)))
            : Promise.resolve(outcome);
        },
      };
      const root = createRoot(document.getElementById("root"));
      window.fixture.unmount = () => root.unmount();
      root.render(React.createElement(AntidetectProfileCard, {
        accountId: "fixture-account", username: "fixture-nick", platform: "TIKTOK",
        proxyCountry: "US", proxyLabel: "Fixture proxy",
      }));
    `,
            resolveDir: process.cwd(),
            loader: "tsx",
        },
        bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
        define: { "process.env.NODE_ENV": '"development"', "process.env": "{}" },
        plugins: [{
                name: "isolated-profile-card-fixture",
                setup(plugin) {
                    if (baselineRef)
                        plugin.onLoad({ filter: /antidetect-profile-card\.tsx$/ }, () => ({
                            contents: execFileSync("git", ["show", `${baselineRef}:src/components/vault/antidetect-profile-card.tsx`], { encoding: "utf8" }),
                            loader: "tsx", resolveDir: `${process.cwd()}/src/components/vault`,
                        }));
                    plugin.onResolve({ filter: /\/relay-browser-client$/ }, () => ({ path: "relay", namespace: "fixture" }));
                    plugin.onResolve({ filter: /\/account-profile-actions$/ }, () => ({ path: "actions", namespace: "fixture" }));
                    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
                        contents: path === "relay" ? `
          export const pingRelay = () => window.fixture.request("health");
          export const fetchRelayProfiles = () => window.fixture.request("profiles");
          export const refreshRelayLicenseCapacity = () => {
            window.fixture.calls.push("capacity");
            return Promise.resolve({ status: "ok", data: { ok: true, message: "Refreshed" } });
          };
          export const sendTicketToRelay = () => { window.fixture.mutations++; throw Error("Unexpected ticket"); };
          export const describeRelayFailure = () => "Safe fixture failure";
          export const describeSlowRelayFailure = () => "Safe fixture failure";
        ` : `
          export const requestCreateProfileTicket = (...args) => {
            window.fixture.mutations++;
            window.fixture.createArgs = args;
            return Promise.resolve({ ok: false, message: "Fixture stopped before ticket delivery" });
          };
          export const recordCreatedProfile = () => { window.fixture.mutations++; throw Error("Unexpected record"); };
        `,
                        loader: "js",
                    }));
                },
            }],
    });
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setContent('<main id="root"></main>');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.waitForFunction(() => /Relay update required|MKT Browser is not connected/.test(document.body.textContent ?? ""), undefined, { timeout: 5000 })
            .catch(async () => { throw new Error(JSON.stringify({ text: await page.locator("body").innerText(), errors })); });
        assert.match(await page.locator("body").innerText(), /MKT Browser is not connected/);
        assert.doesNotMatch(await page.locator("body").innerText(), /Relay update required|private runtime detail/);
        await page.evaluate((outdatedVersion) => {
            const fixture = (window as FixtureWindow).fixture;
            fixture.health.relayVersion = outdatedVersion;
            fixture.health.data.relayVersion = outdatedVersion;
            fixture.profiles.relayVersion = outdatedVersion;
            fixture.profiles.data.relayVersion = outdatedVersion;
        }, effectiveMinRelayVersion(TICKET_KINDS.CREATE_PROFILE) - 1);
        await page.getByRole("button", { name: "Check again", exact: true }).click();
        await page.getByText("Relay update required", { exact: true }).waitFor();
        assert.equal(await page.getByRole("link", { name: "Set up this Relay PC", exact: true }).getAttribute("href"), "/setup#download");
        assert.doesNotMatch(await page.locator("body").innerText(), /private runtime detail/);
        await page.evaluate(({ readyBrowser, readyProfiles }) => {
            const fixture = (window as FixtureWindow).fixture;
            fixture.health.relayVersion = 16;
            fixture.health.data.relayVersion = 16;
            fixture.health.data.browser = readyBrowser;
            fixture.profiles = { ...readyProfiles, data: {
                ...readyProfiles.data, fingerprintOptions: { devices: [], locales: [] },
            } };
            fixture.calls = [];
            fixture.hold = true;
        }, { readyBrowser, readyProfiles });
        await page.getByRole("button", { name: "Check again", exact: true }).click();
        const retry = page.getByRole("button", { name: "Checking...", exact: true });
        assert.equal(await retry.isDisabled(), true);
        await retry.dispatchEvent("click");
        assert.deepEqual(await page.evaluate(() => (window as FixtureWindow).fixture.calls), ["capacity", "health", "profiles"]);
        await page.evaluate(() => { for (const resolve of (window as FixtureWindow).fixture.pending.splice(0))
            resolve(); });
        await page.getByText("Browser profile setup needs attention", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Create browser profile on this Relay PC", exact: true }).count(), 0);
        await page.getByText("Use an existing browser profile (1)", { exact: true }).click();
        assert.match(await page.locator("body").innerText(), /profile-fixture/);
        await page.evaluate((readyProfiles) => { (window as FixtureWindow).fixture.profiles = readyProfiles; }, readyProfiles);
        await page.getByRole("button", { name: "Check again", exact: true }).click();
        await page.evaluate(() => { for (const resolve of (window as FixtureWindow).fixture.pending.splice(0)) resolve(); });
        await page.getByRole("button", { name: "Create browser profile on this Relay PC", exact: true }).waitFor();
        assert.match(await page.locator("body").innerText(), /America\/Denver|en-US/);
        assert.doesNotMatch(await page.locator("body").innerText(), /Relay update required|MKT Browser is not connected/);
        assert.equal(await page.evaluate(() => (window as FixtureWindow).fixture.mutations), 0);
        assert.deepEqual(errors, []);
        await page.getByRole("button", { name: "Create browser profile on this Relay PC", exact: true }).click();
        await page.getByText("Fixture stopped before ticket delivery", { exact: true }).waitFor();
        const createArgs = await page.evaluate(() => (window as FixtureWindow).fixture.createArgs);
        assert.equal(createArgs[0], "fixture-account");
        assert.equal(createArgs[2], "fixture-device");
        assert.equal(await page.evaluate(() => (window as FixtureWindow).fixture.mutations), 1);
        await page.evaluate(() => (window as FixtureWindow).fixture.unmount());
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.getByRole("button", { name: "Check again", exact: true }).waitFor();
        await page.evaluate(() => { (window as FixtureWindow).fixture.hold = true; });
        await page.getByRole("button", { name: "Check again", exact: true }).click();
        await page.evaluate(() => {
            (window as FixtureWindow).fixture.unmount();
            for (const resolve of (window as FixtureWindow).fixture.pending.splice(0))
                resolve();
        });
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        assert.equal(await page.locator("#root").innerText(), "");
        assert.equal(await page.evaluate(() => (window as FixtureWindow).fixture.mutations), 0);
        assert.deepEqual(errors, []);
        console.log("PASS: readiness, retry, catalog recovery, explicit local device ticket recipient, unmount safety.");
    }
    finally {
        await browser.close();
    }
}
void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
