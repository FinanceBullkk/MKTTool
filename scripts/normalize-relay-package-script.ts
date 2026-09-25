/** Keep delivered script bytes independent of checkout and editor line endings. */
export function normalizeRelayPackageScript(source: Buffer): Buffer {
  // Latin-1 is a reversible byte mapping, preserving the UTF-8 BOM and script text.
  return Buffer.from(source.toString("latin1").replace(/\r\n|\r|\n/g, "\r\n"), "latin1");
}
