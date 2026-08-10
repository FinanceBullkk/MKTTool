export const MKT_BROWSER_PROVIDER_NAME = "MKT Browser";
export const MKT_BROWSER_PROVIDER_SLUG = "mkt-browser";
export const MKT_BROWSER_DEFAULT_MCP_PORT = 47_822;
export const MKT_BROWSER_DEFAULT_MCP_URL = `http://127.0.0.1:${MKT_BROWSER_DEFAULT_MCP_PORT}`;
export const MKT_BROWSER_MCP_URL_ENV = "MKT_BROWSER_MCP_URL";
export const MKT_BROWSER_MCP_TOKEN_ENV = "MKT_BROWSER_MCP_TOKEN";

export function resolveMktBrowserMcpUrl(raw: string | undefined): string {
  const value = raw?.trim() || MKT_BROWSER_DEFAULT_MCP_URL;
  let url: URL;

  try {
    url = new URL(value);
  } catch (cause) {
    throw new Error(`${MKT_BROWSER_MCP_URL_ENV} must be a valid loopback HTTP origin.`, {
      cause,
    });
  }

  const loopbackHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (
    url.protocol !== "http:" ||
    !loopbackHost ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      `${MKT_BROWSER_MCP_URL_ENV} must be an HTTP loopback origin such as ${MKT_BROWSER_DEFAULT_MCP_URL}.`,
    );
  }

  return url.origin;
}
