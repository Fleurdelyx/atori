import { lookup } from "node:dns/promises";

/**
 * SSRF guard for user-supplied media URLs that the companion will fetch.
 * http/https only, public hosts only — localhost, loopback, private,
 * link-local (incl. cloud metadata) and reserved ranges are rejected,
 * both as literals and after DNS resolution.
 */

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];
const BLOCKED_NAMES = new Set(["localhost"]);

function isPrivateV4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 203 && b === 113) return true; // documentation
  return a >= 224; // multicast + reserved
}

function isPrivateV6(ip) {
  const addr = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (addr === "::" || addr === "::1") return true;
  const mappedDotted = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedDotted) return isPrivateV4(mappedDotted[1]);
  // WHATWG URL normalizes v4-mapped addresses to hex groups — e.g. ::ffff:a00:1
  const mappedHex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique local fc00::/7
  if (/^fe[89ab]/.test(addr)) return true; // link-local fe80::/10
  if (addr.startsWith("ff")) return true; // multicast
  return false;
}

export function isPrivateAddress(ip) {
  return ip.includes(":") ? isPrivateV6(ip) : isPrivateV4(ip);
}

function isIpLiteral(host) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

/**
 * Validate a media URL. Returns `{ url, hostname }` when safe to fetch,
 * otherwise `{ error }` — one of: invalid_url, bad_scheme, credentials,
 * bad_host, private_host, dns_failed, dns_empty.
 */
export async function validateMediaUrl(raw, lookupFn = lookup) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { error: "bad_scheme" };
  if (url.username || url.password) return { error: "credentials" };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return { error: "bad_host" };
  if (BLOCKED_NAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { error: "private_host" };
  }
  if (isIpLiteral(host)) {
    return isPrivateAddress(host) ? { error: "private_host" } : { url, hostname: host };
  }
  let addrs;
  try {
    addrs = await lookupFn(host, { all: true, verbatim: true });
  } catch {
    return { error: "dns_failed" };
  }
  if (!addrs || addrs.length === 0) return { error: "dns_empty" };
  if (addrs.some((a) => isPrivateAddress(a.address))) return { error: "private_host" };
  return { url, hostname: host };
}
