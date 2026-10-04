/**
 * Compile every skin's fragment shader in a real WebGL context (headless
 * Edge / SwiftShader) and report any compile failures, so GLSL type errors
 * surface outside the app.
 *
 *   node scripts/qa-shaders.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.QA_BASE ?? "http://127.0.0.1:1431";
const profile = await mkdtemp(join(tmpdir(), "atori-glsl-"));
const browser = await puppeteer.launch({
  executablePath: process.env.QA_EDGE ?? "C:\\Users\\user\\.cache\\puppeteer\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe",
  headless: "new",
  userDataDir: profile,
  args: ["--no-first-run", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

const results = await page.evaluate(async () => {
  const { buildFragment, VERT } = await import("/src/fx/shaders.ts");
  const { SKINS } = await import("/src/skins/registry.ts");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 4;
  // GLSL ES 1.0 context: matches three.js ShaderMaterial output style
  const gl = canvas.getContext("webgl") ?? canvas.getContext("webgl2");
  if (!gl) return [{ id: "GL", ok: false, log: "no webgl context" }];
  // three.js prepends these attribute declarations for ShaderMaterial
  const vertSrc = "attribute vec3 position;\nattribute vec2 uv;\n" + VERT;
  const out = [];
  for (const skin of SKINS) {
    const fs = buildFragment(skin.shader);
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      const ok = gl.getShaderParameter(sh, gl.COMPILE_STATUS);
      const log = ok ? "" : gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      return { ok, log };
    };
    const v = compile(gl.VERTEX_SHADER, vertSrc);
    const f = compile(gl.FRAGMENT_SHADER, fs);
    out.push({
      id: skin.id,
      ok: v.ok && f.ok,
      lines: fs.split("\n").length,
      log: (v.log + " " + f.log).trim().slice(0, 400),
    });
  }
  return out;
});

let bad = 0;
for (const r of results) {
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.id} (${r.lines} lines)${r.ok ? "" : `: ${r.log.split("\n")[0]}`}`);
  if (!r.ok) bad++;
}
console.log(bad === 0 ? "\nALL SKINS COMPILE" : `\n${bad} SKIN(S) FAILED`);
await browser.close();
process.exit(bad === 0 ? 0 : 1);
