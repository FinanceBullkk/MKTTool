export interface AccountFormDefaults {
  username: string;
  emailAddress: string;
  antidetectProfileId: string | null;
  voice: string | null;
  contentAngle: string | null;
  proxyId: string | null;
  status: string;
  karma: number;
  quarantineReason: string | null;
  coldStartUntil: Date | null;
  platformCreatedAt: Date | null;
  purchasedAt: Date | null;
  purchaseNote: string | null;
}

export function selectAccountFormDefaults<T extends AccountFormDefaults>(
  account: T,
): AccountFormDefaults {
  return {
    username: account.username,
    emailAddress: account.emailAddress,
    antidetectProfileId: account.antidetectProfileId,
    voice: account.voice,
    contentAngle: account.contentAngle,
    proxyId: account.proxyId,
    status: account.status,
    karma: account.karma,
    quarantineReason: account.quarantineReason,
    coldStartUntil: account.coldStartUntil,
    platformCreatedAt: account.platformCreatedAt,
    purchasedAt: account.purchasedAt,
    purchaseNote: account.purchaseNote,
  };
}
