import type { Prisma } from "@prisma/client";

/** Keep the same device-before-account order as revocation and assignment flows. */
export async function lockRelayDeviceThenAccount(
  tx: Prisma.TransactionClient,
  deviceId: string,
  accountId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "RelayDevice" WHERE "id" = ${deviceId} FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${accountId} FOR NO KEY UPDATE`;
}

export async function lockProxyForTicket(
  tx: Prisma.TransactionClient,
  proxyId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Proxy" WHERE "id" = ${proxyId} FOR NO KEY UPDATE`;
}

export async function lockAccountForDeletion(
  tx: Prisma.TransactionClient,
  accountId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${accountId} FOR UPDATE`;
}
