interface BootstrapAuthorizationState {
  isAuthorized(): boolean;
}

export function selectOperatorKeyBootstrapBroker<T extends BootstrapAuthorizationState>(
  hasOperatorKey: boolean,
  bootstrap: T,
): T | undefined {
  return !hasOperatorKey || bootstrap.isAuthorized() ? bootstrap : undefined;
}
