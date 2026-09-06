export interface RelayDeviceListItem {
  id: string;
  name: string;
  publicKey: string;
  createdAt: Date;
  relayVersion: number | null;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  operatorKeyGrant: string | null;
  operatorKeyReadyAt: Date | null;
  retirementId: string | null;
  retirementCompletedAt: Date | null;
  user: { email: string };
  _count: { accounts: number };
}
