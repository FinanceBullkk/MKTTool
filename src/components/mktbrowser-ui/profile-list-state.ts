import type { ProfileItemData } from "./ProfileTile";

export type ProfileListFilter = "all" | "running" | "warmup" | "error" | "idle";

export function isProfileRunning(
  profile: ProfileItemData,
  runningProfileIds: ReadonlySet<string>,
): boolean {
  return Boolean(
    profile.antidetectProfileId && runningProfileIds.has(profile.antidetectProfileId),
  );
}

export function profileListCounts(
  profiles: readonly ProfileItemData[],
  runningProfileIds: ReadonlySet<string>,
): Record<ProfileListFilter, number> {
  return {
    all: profiles.length,
    running: profiles.filter((profile) => isProfileRunning(profile, runningProfileIds)).length,
    warmup: profiles.filter((profile) => profile.coldStartDaysRemaining > 0).length,
    error: profiles.filter(
      (profile) =>
        profile.status === "CHECKPOINT" || profile.status === "DEAD" || !profile.proxy,
    ).length,
    idle: profiles.filter(
      (profile) =>
        profile.status === "ALIVE" &&
        profile.coldStartDaysRemaining === 0 &&
        !isProfileRunning(profile, runningProfileIds),
    ).length,
  };
}

export function profileMatchesListFilter(
  profile: ProfileItemData,
  filter: ProfileListFilter,
  runningProfileIds: ReadonlySet<string>,
): boolean {
  if (filter === "running") return isProfileRunning(profile, runningProfileIds);
  if (filter === "warmup") return profile.coldStartDaysRemaining > 0;
  if (filter === "error") {
    return profile.status === "CHECKPOINT" || profile.status === "DEAD" || !profile.proxy;
  }
  if (filter === "idle") {
    return (
      profile.status === "ALIVE" &&
      profile.coldStartDaysRemaining === 0 &&
      !isProfileRunning(profile, runningProfileIds)
    );
  }
  return true;
}
