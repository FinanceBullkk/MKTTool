import { redirect } from "next/navigation";

/**
 * Keep the historical human-facing URL as a redirect to the real Relay download section. This does
 * not change the authenticated `/api/relay/download` release route or its versioned target.
 */
export default function RelayDownloadPage() {
  redirect("/setup#download");
}
