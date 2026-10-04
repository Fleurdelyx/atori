import puppeteer from "puppeteer-core";
const exe = "C:" + String.fromCharCode(92) + "Program Files (x86)" + String.fromCharCode(92) + "Microsoft" + String.fromCharCode(92) + "Edge" + String.fromCharCode(92) + "Application" + String.fromCharCode(92) + "msedge.exe";
for (const opts of [{label:"new", o:{headless:"new"}}, {label:"true", o:{headless:true}}]) {
  try {
    const b = await p.launch({ executablePath: exe, userDataDir: await (await import("node:fs/promises")).mkdtemp(join(tmpdir(),"probe-")), args: ["--no-first-run","--mute-audio"], defaultViewport:{width:800,height:600}, ...opts.o });
    console.log(opts.label + " OK");
    await b.close();
  } catch (e) { console.log(opts.label + " FAIL: " + String(e).slice(0,120)); }
}