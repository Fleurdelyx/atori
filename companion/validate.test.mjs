import { describe, expect, it } from "vitest";
import { isPrivateAddress, validateMediaUrl } from "./validate.mjs";

const pub = async () => [{ address: "142.250.185.78", family: 4 }];
const priv = async () => [{ address: "192.168.1.10", family: 4 }];

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local and reserved ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.15",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "224.0.0.1",
      "::1",
      "::",
      "::ffff:10.0.0.1",
      "fd12:3456::1",
      "fe80::1",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["142.250.185.78", "1.1.1.1", "2606:4700:4700::1111"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("validateMediaUrl", () => {
  it("accepts public http(s) urls", async () => {
    const a = await validateMediaUrl("https://www.youtube.com/watch?v=x", pub);
    expect(a.url?.hostname).toBe("www.youtube.com");
    const b = await validateMediaUrl("http://soundcloud.com/artist/track", pub);
    expect(b.url?.hostname).toBe("soundcloud.com");
  });

  it("rejects non-http schemes", async () => {
    expect((await validateMediaUrl("file:///C:/music/a.mp3", pub)).error).toBe("bad_scheme");
    expect((await validateMediaUrl("ftp://example.com/a.mp3", pub)).error).toBe("bad_scheme");
  });

  it("rejects embedded credentials", async () => {
    expect((await validateMediaUrl("https://user:pass@example.com/a", pub)).error).toBe("credentials");
  });

  it("rejects private ip literals", async () => {
    for (const raw of [
      "http://127.0.0.1/x",
      "http://10.0.0.1/x",
      "http://192.168.1.1/x",
      "http://172.16.0.1/x",
      "http://169.254.169.254/latest/meta-data/",
      "http://0.0.0.0/x",
      "http://[::1]/x",
      "http://[::ffff:10.0.0.1]/x",
    ]) {
      expect((await validateMediaUrl(raw, pub)).error, raw).toBe("private_host");
    }
  });

  it("rejects localhost-style hostnames", async () => {
    for (const raw of ["http://localhost:8790/x", "http://box.local/x", "http://svc.internal/x"]) {
      expect((await validateMediaUrl(raw, pub)).error, raw).toBe("private_host");
    }
  });

  it("rejects hostnames that resolve into private space", async () => {
    expect((await validateMediaUrl("https://evil.example.com/x", priv)).error).toBe("private_host");
  });

  it("rejects dns failures and garbage", async () => {
    expect((await validateMediaUrl("https://nope.invalid/x", async () => [])).error).toBe("dns_empty");
    expect(
      (await validateMediaUrl("https://nope.invalid/x", async () => {
        throw new Error("ENOENT");
      })).error,
    ).toBe("dns_failed");
    expect((await validateMediaUrl("not a url", pub)).error).toBe("invalid_url");
  });
});
