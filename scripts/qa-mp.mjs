/**
 * Multipart upload E2E: exercises the deployed worker's upload-mp endpoints
 * end to end with a throwaway QA account, then deletes the test object.
 * Run after deploying the worker (the endpoints exist only on the current
 * build).
 *
 *   node scripts/qa-mp.mjs
 */
const BASE = process.env.MP_BASE ?? "https://atori-cloud.atori-server.workers.dev";
const EMAIL = "qa-mp2@atori.test";
// deterministic so re-runs can log into the same throwaway account
const PASSWORD = "qa-mp-9f3k2l8d-throwaway";

const j = async (res, label) => {
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* not json */
  }
  if (res.status >= 400) throw new Error(`${label}: HTTP ${res.status} ${String(text).slice(0, 140)}`);
  return body;
};

// register (or log in if the throwaway account already exists from a prior run)
let token;
{
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "QA MP" }),
  });
  if (r.ok) {
    token = (await j(r, "register")).sessionToken;
    console.log("ok   register (new QA account)");
  } else {
    const l = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!l.ok) {
      console.log(`SKIP register failed (${r.status}) and login failed (${l.status})`);
      process.exit(2);
    }
    token = (await j(l, "login")).sessionToken;
    console.log("ok   login (existing QA account)");
  }
}
const auth = { Authorization: `Bearer ${token}` };

// a 5MiB + 1KiB object in two parts (R2 requires parts >= 5MiB except the last)
const KEY = "audio/QA/mp-test.mp4";
const part1 = new Uint8Array(5 * 1024 * 1024).fill(65);
const part2 = new Uint8Array(1024).fill(66);
const total = part1.length + part2.length;

let uploadId;
{
  const r = await fetch(`${BASE}/api/library/upload-mp/init`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ key: KEY, contentType: "video/mp4" }),
  });
  uploadId = (await j(r, "init")).uploadId;
  console.log("ok   init → uploadId", uploadId.slice(0, 12) + "…");
}

{
  const p1 = await j(
    await fetch(`${BASE}/api/library/upload-mp/part?key=${encodeURIComponent(KEY)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=1`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/octet-stream" },
      body: part1,
    }),
    "part 1",
  );
  const p2 = await j(
    await fetch(`${BASE}/api/library/upload-mp/part?key=${encodeURIComponent(KEY)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=2`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/octet-stream" },
      body: part2,
    }),
    "part 2",
  );
  console.log("ok   parts uploaded (etags received)");

  const done = await j(
    await fetch(`${BASE}/api/library/upload-mp/complete`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ key: KEY, uploadId, parts: [p2, p1] }), // deliberately unordered: worker must sort
    }),
    "complete",
  );
  if (done.size !== total) throw new Error(`assembled size ${done.size} ≠ ${total}`);
  console.log(`ok   complete → object assembled (${done.size} bytes, out-of-order parts sorted)`);
}

{
  const r = await fetch(`${BASE}/api/stream/${KEY}?token=${encodeURIComponent(token)}`);
  if (r.status !== 200) throw new Error(`stream verify: HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength !== total) throw new Error(`streamed ${buf.byteLength} ≠ ${total}`);
  const bytes = new Uint8Array(buf);
  if (bytes[0] !== 65 || bytes[part1.length] !== 66) throw new Error("content mismatch");
  console.log("ok   stream verify: content matches part order");
}

{
  // bulk delete = cleanup + endpoint test in one
  const r = await fetch(`${BASE}/api/library/delete`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ keys: [KEY] }),
  });
  const d = await j(r, "bulk delete");
  if (d.deleted !== 1) throw new Error(`bulk delete removed ${d.deleted}, expected 1`);
  const gone = await fetch(`${BASE}/api/stream/${KEY}?token=${encodeURIComponent(token)}`);
  if (gone.status === 200) throw new Error("object still streaming after delete");
  console.log("ok   bulk delete: object gone from the bucket");
}

console.log("\nMULTIPART E2E PASS");
