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

  const staticPage = await context.newPage();
  await staticPage.route("**/api/capabilities", async (route) => {
    await route.fulfill({ status: 404, body: "Not found" });
  });
  await staticPage.goto(APP_URL, { waitUntil: "networkidle" });
  const staticConverterHidden = await staticPage.locator("#converterTabButton").evaluate((button) => button.hidden);
  await staticPage.close();

  await page.route("**/api/capabilities", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ urlConversion: true }) });
  });
  await page.route("**/api/convert-url", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        filename: "mobile-80.txt",
        text: "Source file: mobile.png\nASCII resolution:  80 x 2 characters\n\n@%#*+=-:. ".repeat(16),
        sourceWidth: 320,
        sourceHeight: 180,
        asciiWidth: 80,
        asciiHeight: 24,
      }),
    });
  });
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#converterTabButton").hidden === false);
  await page.click("#converterTabButton");
  await page.fill("#imageUrlInput", "https://example.com/mobile.png");
  await page.click("#convertButton");
  await page.waitForFunction(() => document.querySelector("#downloadButton").disabled === false);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const converterDefaultWidth = await page.locator("#converterOutput")
    .evaluate((output) => output.getBoundingClientRect().width);
  await page.locator("#converterFontSizeInput").evaluate((input) => {
    input.value = "22";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const converterZoomedWidth = await page.locator("#converterOutput")
    .evaluate((output) => output.getBoundingClientRect().width);
  await page.check("#converterWrapToggle");
  await page.check("#converterInvertToggle");
  const converterControlState = await page.evaluate(() => ({
    whiteSpace: getComputedStyle(document.querySelector("#converterOutput")).whiteSpace,
    background: getComputedStyle(document.querySelector(".converter-canvas")).backgroundColor,
  }));
  await page.uncheck("#converterWrapToggle");
  await page.uncheck("#converterInvertToggle");
  await page.locator("#converterFontSizeInput").evaluate((input) => {
    input.value = "11";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#downloadButton"),
  ]);
  const downloadName = download.suggestedFilename();
  const converter = await page.evaluate(() => {
    const controls = document.querySelector(".converter-controls").getBoundingClientRect();
    const preview = document.querySelector(".converter-preview").getBoundingClientRect();
    return {
      bodyOverflow: document.documentElement.scrollWidth - innerWidth,
      outputLength: document.querySelector("#converterOutput").textContent.length,
      filename: document.querySelector("#converterFilename").textContent,
      downloadEnabled: !document.querySelector("#downloadButton").disabled,
      controlsBottom: controls.bottom,
      previewTop: preview.top,
      viewportHeight: innerHeight,
    };
  });
  converter.downloadName = downloadName;
  converter.defaultWidth = converterDefaultWidth;
  converter.zoomedWidth = converterZoomedWidth;
  converter.controlState = converterControlState;
  await page.screenshot({ path: `/private/tmp/asciivisualizer-${name}-converter-mobile.png`, fullPage: false });
  await page.click("#viewerTabButton");
  await page.evaluate(async () => {
    const build = (columns, rows, offset) => {
      const ramp = "@%#*+=-:. ";
      return Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => ramp[(row + column + offset) % ramp.length]).join("")
      ).join("\n");
    };
    const columnCounts = [640, 800, 1200, 640, 800, 1200, 640, 800, 1200];
    const files = columnCounts.map((columns, index) => ({
      path: `wide-${index}.txt`,
      name: `wide-${index}.txt`,
      folder: "",
      size: columns * 360,
      modified: 1,
      rows: 360,
      columns,
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
    const stage = document.querySelector("#singleStage");
    const toolbar = document.querySelector(".toolbar");
    return {
      bodyOverflow: document.documentElement.scrollWidth - innerWidth,
      contentOverflow: canvas.scrollWidth - canvas.clientWidth,
      wrapOverflow: wrap.scrollWidth - wrap.clientWidth,
      canvasClientWidth: canvas.clientWidth,
      canvasScrollWidth: canvas.scrollWidth,
      canvasFontSize: getComputedStyle(canvas).fontSize,
      canvasTextLength: canvas.textContent.length,
      canvasVisualWidth: canvas.getBoundingClientRect().width,
      stageWidth: stage.getBoundingClientRect().width,
      toolbarTop: toolbar.getBoundingClientRect().top,
      toolbarBottom: toolbar.getBoundingClientRect().bottom,
    };
  });
  await page.locator("#fontSizeInput").evaluate((input) => {
    input.value = "22";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const singleZoomedWidth = await page.locator("#asciiCanvas").evaluate((canvas) => canvas.getBoundingClientRect().width);
  await page.locator("#fontSizeInput").evaluate((input) => {
    input.value = "11";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: `/private/tmp/asciivisualizer-${name}-single-mobile.png`, fullPage: false });

  await page.click("#pageToggleButton");
  await page.waitForFunction(() => document.querySelectorAll(".page-item[data-loaded='true']").length > 0);
  const initialLoadedPaths = await page.locator(".page-item[data-loaded='true']")
    .evaluateAll((items) => items.map((item) => item.dataset.path));
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const wrap = document.querySelector("#canvasWrap");
    wrap.scrollTop = wrap.scrollHeight;
  });
  await page.waitForFunction((paths) => paths.some((path) => {
    const item = [...document.querySelectorAll(".page-item")]
      .find((candidate) => candidate.dataset.path === path);
    return item && item.dataset.loaded !== "true";
  }), initialLoadedPaths);
  await page.waitForFunction(() => {
    const items = [...document.querySelectorAll(".page-item")];
    return items.at(-1)?.dataset.loaded === "true";
  });

  const continuous = await page.evaluate(() => {
    const wrap = document.querySelector("#canvasWrap");
    const toolbar = document.querySelector(".toolbar");
    const loaded = [...document.querySelectorAll(".page-item[data-loaded='true'] pre")];
    return {
      bodyOverflow: document.documentElement.scrollWidth - innerWidth,
      wrapOverflow: wrap.scrollWidth - wrap.clientWidth,
      itemOverflows: loaded.map((pre) => pre.scrollWidth - pre.clientWidth),
      itemFontSizes: loaded.map((pre) => getComputedStyle(pre).fontSize),
      itemTextLengths: loaded.map((pre) => pre.textContent.length),
      itemVisualWidths: loaded.map((pre) => pre.getBoundingClientRect().width),
      itemStageWidths: loaded.map((pre) => pre.parentElement.getBoundingClientRect().width),
      toolbarTop: toolbar.getBoundingClientRect().top,
      toolbarBottom: toolbar.getBoundingClientRect().bottom,
      scrollTop: wrap.scrollTop,
      loadedItems: loaded.length,
      totalItems: document.querySelectorAll(".page-item").length,
      renderedCharacters: loaded.reduce((total, pre) => total + pre.textContent.length, 0),
    };
  });
  await page.locator("#fontSizeInput").evaluate((input) => {
    input.value = "6";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  const continuousZoomedWidth = await page.locator(".page-item[data-loaded='true'] pre").first()
    .evaluate((pre) => pre.getBoundingClientRect().width);
  await page.locator("#fontSizeInput").evaluate((input) => {
    input.value = "11";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

  await page.evaluate(() => {
    document.querySelector("#canvasWrap").scrollTop = 0;
  });
  await page.waitForFunction((path) => {
    const item = [...document.querySelectorAll(".page-item")]
      .find((candidate) => candidate.dataset.path === path);
    return item?.dataset.loaded === "true" && item.querySelector("pre").textContent.length > 0;
  }, initialLoadedPaths[0]);
  const restoredTopItem = await page.evaluate((path) => {
    const item = [...document.querySelectorAll(".page-item")]
      .find((candidate) => candidate.dataset.path === path);
    return item?.querySelector("pre").textContent.length || 0;
  }, initialLoadedPaths[0]);

  await page.screenshot({ path: `/private/tmp/asciivisualizer-${name}-continuous-mobile.png`, fullPage: false });
  await browser.close();

  const tolerance = 1;
  const failures = [];
  if (!staticConverterHidden) failures.push("converter tab was exposed without backend capability");
  if (single.bodyOverflow > tolerance || single.wrapOverflow > tolerance || single.contentOverflow > tolerance) {
    failures.push(`single overflow ${JSON.stringify(single)}`);
  }
  if (converter.bodyOverflow > tolerance || converter.outputLength === 0 || !converter.downloadEnabled
      || converter.filename !== "mobile-80.txt" || converter.previewTop < converter.controlsBottom - tolerance
      || converter.previewTop >= converter.viewportHeight || converter.downloadName !== "mobile-80.txt") {
    failures.push(`converter layout ${JSON.stringify(converter)}`);
  }
  if (converter.zoomedWidth < converter.defaultWidth * 1.8
      || converter.controlState.whiteSpace !== "pre-wrap"
      || converter.controlState.background !== "rgb(255, 253, 248)") {
    failures.push(`converter controls ${JSON.stringify(converter)}`);
  }
  if (single.canvasVisualWidth > single.stageWidth + tolerance || single.canvasTextLength === 0) {
    failures.push(`single render ${JSON.stringify(single)}`);
  }
  if (singleZoomedWidth < single.canvasVisualWidth * 1.8) {
    failures.push(`single font zoom did not respond ${JSON.stringify({ singleZoomedWidth, single })}`);
  }
  if (continuous.bodyOverflow > tolerance || continuous.wrapOverflow > tolerance || continuous.itemOverflows.some((value) => value > tolerance)) {
    failures.push(`continuous overflow ${JSON.stringify(continuous)}`);
  }
  if (continuous.itemTextLengths.some((value) => value === 0)
      || continuous.itemVisualWidths.some((value, index) => value > continuous.itemStageWidths[index] + tolerance)) {
    failures.push(`continuous render ${JSON.stringify(continuous)}`);
  }
  if (single.toolbarTop < -tolerance || continuous.toolbarTop < -tolerance || continuous.toolbarBottom > VIEWPORT.height + tolerance) {
    failures.push(`toolbar moved ${JSON.stringify({ single, continuous })}`);
  }
  if (continuous.scrollTop <= 0) failures.push(`continuous view did not scroll ${JSON.stringify(continuous)}`);
  if (continuous.loadedItems >= continuous.totalItems || continuous.renderedCharacters === 0) {
    failures.push(`continuous view was not virtualized ${JSON.stringify(continuous)}`);
  }
  if (continuousZoomedWidth > continuous.itemVisualWidths[0] * 0.65) {
    failures.push(`continuous font zoom did not respond ${JSON.stringify({ continuousZoomedWidth, continuous })}`);
  }
  if (restoredTopItem === 0) failures.push("virtualized item did not render again after scrolling back");
  if (consoleErrors.length > 0) failures.push(`console errors ${consoleErrors.join(" | ")}`);
  if (failures.length > 0) throw new Error(`${name}: ${failures.join("; ")}`);

  return { name, converter, single, singleZoomedWidth, continuous, continuousZoomedWidth, restoredTopItem };
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
