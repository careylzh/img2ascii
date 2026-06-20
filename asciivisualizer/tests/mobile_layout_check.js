const playwrightPath = process.argv[2];
if (!playwrightPath) throw new Error("Pass the Playwright module path as the first argument.");

const { chromium, webkit } = require(playwrightPath);

const APP_URL = "http://127.0.0.1:8765";
const VIEWPORT = { width: 390, height: 844 };

function makeAscii(columns, rows, offset) {
  const ramp = "@%#*+=-:. ";
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => ramp[(row + column + offset) % ramp.length]).join("")
  ).join("\n");
}

async function runTarget(name, browserType) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const build = (columns, rows, offset) => {
      const ramp = "@%#*+=-:. ";
      return Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => ramp[(row + column + offset) % ramp.length]).join("")
      ).join("\n");
    };
    const files = [0, 1, 2].map((index) => ({
      path: `wide-${index}.txt`,
      name: `wide-${index}.txt`,
      folder: "",
      size: 240 * 90,
      modified: 1,
      rows: 90,
      columns: 240,
      source: "local",
    }));
    const texts = new Map(files.map((file, index) => [file.path, build(file.columns, file.rows, index)]));
    await applyLocalFolder("Mobile fixture", files, texts);
    if (!document.body.classList.contains("panel-hidden")) toggleFilePanel();
  });

  await page.waitForTimeout(100);
  const single = await page.evaluate(() => {
    const wrap = document.querySelector("#canvasWrap");
    const canvas = document.querySelector("#asciiCanvas");
    const toolbar = document.querySelector(".toolbar");
    return {
      bodyOverflow: document.documentElement.scrollWidth - innerWidth,
      contentOverflow: canvas.scrollWidth - canvas.clientWidth,
      wrapOverflow: wrap.scrollWidth - wrap.clientWidth,
      canvasClientWidth: canvas.clientWidth,
      canvasScrollWidth: canvas.scrollWidth,
      canvasFontSize: getComputedStyle(canvas).fontSize,
      toolbarTop: toolbar.getBoundingClientRect().top,
      toolbarBottom: toolbar.getBoundingClientRect().bottom,
    };
  });
  await page.screenshot({ path: `/private/tmp/asciivisualizer-${name}-single-mobile.png`, fullPage: false });

  await page.click("#pageToggleButton");
  await page.waitForFunction(() => document.querySelectorAll(".page-item[data-loaded='true']").length > 0);
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const wrap = document.querySelector("#canvasWrap");
    wrap.scrollTop = wrap.scrollHeight;
  });
  await page.waitForTimeout(100);

  const continuous = await page.evaluate(() => {
    const wrap = document.querySelector("#canvasWrap");
    const toolbar = document.querySelector(".toolbar");
    const loaded = [...document.querySelectorAll(".page-item[data-loaded='true'] pre")];
    return {
      bodyOverflow: document.documentElement.scrollWidth - innerWidth,
      wrapOverflow: wrap.scrollWidth - wrap.clientWidth,
      itemOverflows: loaded.map((pre) => pre.scrollWidth - pre.clientWidth),
      toolbarTop: toolbar.getBoundingClientRect().top,
      toolbarBottom: toolbar.getBoundingClientRect().bottom,
      scrollTop: wrap.scrollTop,
    };
  });

  await page.screenshot({ path: `/private/tmp/asciivisualizer-${name}-continuous-mobile.png`, fullPage: false });
  await browser.close();

  const tolerance = 1;
  const failures = [];
  if (single.bodyOverflow > tolerance || single.wrapOverflow > tolerance || single.contentOverflow > tolerance) {
    failures.push(`single overflow ${JSON.stringify(single)}`);
  }
  if (continuous.bodyOverflow > tolerance || continuous.wrapOverflow > tolerance || continuous.itemOverflows.some((value) => value > tolerance)) {
    failures.push(`continuous overflow ${JSON.stringify(continuous)}`);
  }
  if (single.toolbarTop < -tolerance || continuous.toolbarTop < -tolerance || continuous.toolbarBottom > VIEWPORT.height + tolerance) {
    failures.push(`toolbar moved ${JSON.stringify({ single, continuous })}`);
  }
  if (continuous.scrollTop <= 0) failures.push("continuous view did not scroll");
  if (consoleErrors.length > 0) failures.push(`console errors ${consoleErrors.join(" | ")}`);
  if (failures.length > 0) throw new Error(`${name}: ${failures.join("; ")}`);

  return { name, single, continuous };
}

(async () => {
  const results = [];
  results.push(await runTarget("chromium", chromium));
  results.push(await runTarget("webkit", webkit));
  console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
