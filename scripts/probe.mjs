import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const exe = process.env.QA_EDGE;
try {
  const b = await puppeteer.launch({ dumpio: true, executablePath: exe, headless: true, userDataDir: await mkdtemp(join(tmpdir(), "probe-")), args: ["--no-first-run", "--mute-audio", "--headless=old"] });
  console.log("LAUNCH OK");
  await b.close();
} catch (e) {
  console.log("LAUNCH FAIL:", String(e).slice(0, 200));
}
