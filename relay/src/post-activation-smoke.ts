export interface PostActivationSmoke {
  run(testProfileId: string): Promise<void>;
}

export async function runPostActivationSmoke(
  smoke: PostActivationSmoke,
  testProfileId: string,
): Promise<void> {
  await smoke.run(testProfileId);
}
