import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { createServer as createNetServer, type Server as NetServer } from "node:net";
import { readFileSync } from "node:fs";

export type CompatibilityFixtureArtifactKind =
  | "installer"
  | "relay"
  | "browser"
  | "controlContract"
  | "engine";
export type CompatibilityFixtureResponse =
  | "normal"
  | "redirect"
  | "httpRefusal"
  | "truncated"
  | "oversize"
  | "hashMismatch";
export type CompatibilityFixturePayloads = Record<CompatibilityFixtureArtifactKind, Buffer>;

export function createCompatibilityFixturePayloads(): CompatibilityFixturePayloads {
  const controlContract = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      type: "mktbrowser.windows-control-contract",
      appVersion: "1.0.0",
      contractVersion: 4,
      profileSchemaVersion: 3,
    }),
  );
  return {
    installer: Buffer.from("fixture-installer"),
    relay: Buffer.from("fixture-relay"),
    browser: Buffer.from("fixture-browser"),
    controlContract,
    engine: Buffer.from("fixture-engine"),
  };
}

export async function startCompatibilityFixtureServer(
  pfxPath: string,
  passphrase: string,
  payloads: CompatibilityFixturePayloads,
  response: CompatibilityFixtureResponse,
): Promise<HttpsServer> {
  const server = createHttpsServer({ pfx: readFileSync(pfxPath), passphrase }, (request, reply) => {
    if (response === "redirect") {
      reply.writeHead(302, { location: "/redirected" });
      reply.end();
      return;
    }
    if (response === "httpRefusal") {
      reply.writeHead(403);
      reply.end("refused");
      return;
    }
    const kind = request.url?.slice(1) as CompatibilityFixtureArtifactKind;
    const payload = payloads[kind];
    if (!payload) {
      reply.writeHead(404);
      reply.end("missing");
      return;
    }
    const body = responseBody(payload, response);
    reply.writeHead(200, { "content-length": body.byteLength, "content-type": "application/octet-stream" });
    reply.end(body);
  });
  await listenOnDualStackLoopback(server);
  return server;
}

export function fixtureServerOrigin(server: HttpsServer | NetServer): string {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("The TLS fixture did not bind a loopback port.");
  return `https://localhost:${address.port}`;
}

/** Keeps a known loopback listener until the SEA connects, then reliably makes that connection fail. */
export async function startConnectionResetFixtureServer(): Promise<NetServer> {
  const server = createNetServer((socket) => socket.destroy());
  await listenOnDualStackLoopback(server);
  return server;
}

export function closeFixtureServer(server: HttpsServer | NetServer): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function responseBody(payload: Buffer, response: CompatibilityFixtureResponse): Buffer {
  if (response === "truncated") return payload.subarray(0, payload.byteLength - 1);
  if (response === "oversize") return Buffer.concat([payload, Buffer.from("-extra")]);
  if (response === "hashMismatch") return Buffer.alloc(payload.byteLength, 120);
  return payload;
}

function listenOnDualStackLoopback(server: HttpsServer | NetServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "::", port: 0, ipv6Only: false }, () => {
      server.off("error", reject);
      resolve();
    });
  });
}
