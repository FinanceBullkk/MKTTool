import type { SecureStore } from "./secure-store";
import { RELAY_SECRET_NAMES } from "./secure-store";
import { COMPATIBILITY_INSTALLER_FLOOR_SEQUENCE } from "./compatibility-installer-floor";
import { localCompatibilityIdentityDataExists } from "./compatibility-local-identity";
import {
  assertNoCompatibilityActivationInProgress,
  reconcileCompatibilityUpdateMarker,
} from "./compatibility-update-marker";
import { coordinateCompatibilityUpdateHelper } from "./compatibility-update-helper";
import { convergeCompatibilityUpdate } from "./local-updater";
import {
  initializeCompatibilityUpdateState,
  readCompatibilityUpdateState,
} from "./update-state";
import { resolveWindowsCompatibilityInstallation } from "./windows-compatibility-installation";
import { WindowsCompatibilityUpdatePlatform } from "./windows-compatibility-update-platform";
import { WindowsPostActivationSmoke } from "./windows-post-activation-smoke";
import type { CompatibilityUpdatePlatform } from "./local-updater";
import type { PostActivationSmoke } from "./post-activation-smoke";
import type { WindowsCompatibilityInstallation } from "./windows-compatibility-installation";

interface WindowsCompatibilityStartupDependencies {
  argv?: string[];
  executablePath?: string;
  resolveInstallation?: () => WindowsCompatibilityInstallation;
  createPlatform?: (installation: WindowsCompatibilityInstallation) => CompatibilityUpdatePlatform;
  createSmoke?: (
    home: string,
    installation: WindowsCompatibilityInstallation,
  ) => PostActivationSmoke;
  coordinate?: typeof coordinateCompatibilityUpdateHelper;
  converge?: typeof convergeCompatibilityUpdate;
  installerFloorSequence?: number;
  localIdentityDataExists?: () => boolean;
}

export async function handleWindowsCompatibilityStartup(
  home: string,
  secureStore: SecureStore,
  dependencies: WindowsCompatibilityStartupDependencies = {},
): Promise<boolean> {
  let updateState = readCompatibilityUpdateState(secureStore);
  if (!updateState) {
    assertNoCompatibilityActivationInProgress(home);
    const identityDataExists = dependencies.localIdentityDataExists?.() ??
      localCompatibilityIdentityDataExists({ home, store: secureStore });
    if (identityDataExists) return false;
    const initialized = initializeCompatibilityUpdateState({
      installerFloorSequence:
        dependencies.installerFloorSequence ?? COMPATIBILITY_INSTALLER_FLOOR_SEQUENCE,
      localIdentityDataExists: false,
    });
    secureStore.writeIfAbsent(
      RELAY_SECRET_NAMES.compatibilityUpdateState,
      JSON.stringify(initialized),
    );
    updateState = readCompatibilityUpdateState(secureStore);
    if (!updateState) {
      throw new Error("Protected compatibility update state could not be initialized.");
    }
  }
  reconcileCompatibilityUpdateMarker(home, updateState);
  if (!updateState.pending) return false;

  const installation = (dependencies.resolveInstallation ?? resolveWindowsCompatibilityInstallation)();
  const platform = dependencies.createPlatform?.(installation) ??
    new WindowsCompatibilityUpdatePlatform({
      installation,
      hasOpenProfiles: async () => {
        throw new Error("Profile-open checks belong to update preparation, not startup convergence.");
      },
    });
  const smoke = dependencies.createSmoke?.(home, installation) ??
    new WindowsPostActivationSmoke({
      home,
      browserExecutable: installation.browserExecutable,
    });
  await (dependencies.coordinate ?? coordinateCompatibilityUpdateHelper)({
    home,
    argv: dependencies.argv ?? process.argv,
    executablePath: dependencies.executablePath ?? process.execPath,
    converge: () =>
      (dependencies.converge ?? convergeCompatibilityUpdate)({
        home,
        store: secureStore,
        platform,
        smoke,
        testProfileId: updateState.pending!.smokeProfileId,
      }),
  });
  return true;
}
