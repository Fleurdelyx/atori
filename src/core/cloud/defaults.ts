/**
 * Default cloud server: the distribution default for where libraries live.
 *
 * Paste the deployed atori-cloud worker URL here (e.g. after
 * `cd worker && npx wrangler deploy`) and every fresh install gets it
 * pre-seeded as the default connection: the first-run chooser offers it as
 * "ATORI CLOUD (default)", and signing in targets it. Empty string = the
 * default option is hidden and users self-host or stay offline.
 */
export const DEFAULT_SERVER_URL = "https://atori-cloud.atori-server.workers.dev";

export const DEFAULT_SERVER_NAME = "ATORI Cloud";

export function defaultServerConfigured(): boolean {
  return DEFAULT_SERVER_URL.trim() !== "";
}
