const converterElements = {
  viewerTabButton: document.querySelector("#viewerTabButton"),
  converterTabButton: document.querySelector("#converterTabButton"),
  viewerTab: document.querySelector("#viewerTab"),
  converterTab: document.querySelector("#converterTab"),
  form: document.querySelector("#converterForm"),
  urlInput: document.querySelector("#imageUrlInput"),
  widthInput: document.querySelector("#asciiWidthInput"),
  widthValue: document.querySelector("#asciiWidthValue"),
  convertButton: document.querySelector("#convertButton"),
  downloadButton: document.querySelector("#downloadButton"),
  status: document.querySelector("#converterStatus"),
  filename: document.querySelector("#converterFilename"),
  meta: document.querySelector("#converterMeta"),
  fontSizeInput: document.querySelector("#converterFontSizeInput"),
  lineHeightInput: document.querySelector("#converterLineHeightInput"),
  fitToggle: document.querySelector("#converterFitToggle"),
  wrapToggle: document.querySelector("#converterWrapToggle"),
  invertToggle: document.querySelector("#converterInvertToggle"),
  canvas: document.querySelector(".converter-canvas"),
  stage: document.querySelector("#converterStage"),
  output: document.querySelector("#converterOutput"),
};

let convertedFile = null;

function selectAppTab(tab) {
  const converterActive = tab === "converter";
  converterElements.viewerTab.hidden = converterActive;
  converterElements.converterTab.hidden = !converterActive;
  converterElements.viewerTabButton.setAttribute("aria-selected", String(!converterActive));
  converterElements.converterTabButton.setAttribute("aria-selected", String(converterActive));
  if (converterActive) converterElements.urlInput.focus({ preventScroll: true });
}

function setConversionPending(pending) {
  converterElements.convertButton.disabled = pending;
  converterElements.convertButton.textContent = pending ? "Converting..." : "Convert";
}

function resetDownload() {
  convertedFile = null;
  converterElements.downloadButton.disabled = true;
}

function applyConverterSettings() {
  const fontSize = Number(converterElements.fontSizeInput.value);
  const lineHeight = Number(converterElements.lineHeightInput.value) / 100;
  const fitted = converterElements.fitToggle.checked && !converterElements.wrapToggle.checked;
  converterElements.output.style.fontSize = `${fitted ? 11 : fontSize}px`;
  converterElements.output.style.lineHeight = String(lineHeight);
  converterElements.output.style.transform = "none";
  converterElements.output.style.width = converterElements.wrapToggle.checked ? "100%" : "max-content";
  converterElements.stage.style.height = "auto";
  converterElements.stage.style.overflow = "visible";
  converterElements.converterTab.classList.toggle("converter-wrap", converterElements.wrapToggle.checked);
  converterElements.converterTab.classList.toggle("converter-inverted", converterElements.invertToggle.checked);
  if (!fitted || !converterElements.output.textContent) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const availableWidth = Math.max(1, converterElements.stage.clientWidth - 40);
      const contentWidth = Math.max(1, converterElements.output.scrollWidth - 40);
      const fittedScale = Math.min(1, availableWidth / contentWidth);
      const scale = fittedScale * (fontSize / 11);
      converterElements.output.style.transform = `scale(${scale})`;
      converterElements.stage.style.height = `${Math.ceil(converterElements.output.scrollHeight * scale)}px`;
      converterElements.stage.style.overflow = scale > fittedScale ? "visible" : "hidden";
    });
  });
}

async function convertImageUrl(event) {
  event.preventDefault();
  resetDownload();
  setConversionPending(true);
  converterElements.status.textContent = "Downloading and converting image...";

  try {
    const response = await fetch("/api/convert-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: converterElements.urlInput.value.trim(),
        width: Number(converterElements.widthInput.value),
      }),
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error("URL conversion requires the local Python server.");
      const message = await response.text();
      throw new Error(message.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || "Conversion failed.");
    }

    const result = await response.json();
    convertedFile = { filename: result.filename, text: result.text };
    converterElements.filename.textContent = result.filename;
    converterElements.meta.textContent = `${result.sourceWidth} x ${result.sourceHeight} pixels · ${result.asciiWidth} x ${result.asciiHeight} characters`;
    converterElements.output.textContent = result.text;
    applyConverterSettings();
    converterElements.downloadButton.disabled = false;
    converterElements.status.textContent = "Conversion complete.";
  } catch (error) {
    converterElements.status.textContent = error.message;
  } finally {
    setConversionPending(false);
  }
}

function downloadConversion() {
  if (!convertedFile) return;
  const url = URL.createObjectURL(new Blob([convertedFile.text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = convertedFile.filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

converterElements.viewerTabButton.addEventListener("click", () => selectAppTab("viewer"));
converterElements.converterTabButton.addEventListener("click", () => selectAppTab("converter"));
converterElements.widthInput.addEventListener("input", () => {
  converterElements.widthValue.value = converterElements.widthInput.value;
});
converterElements.fontSizeInput.addEventListener("input", applyConverterSettings);
converterElements.lineHeightInput.addEventListener("input", applyConverterSettings);
converterElements.fitToggle.addEventListener("change", applyConverterSettings);
converterElements.wrapToggle.addEventListener("change", applyConverterSettings);
converterElements.invertToggle.addEventListener("change", applyConverterSettings);
converterElements.form.addEventListener("submit", convertImageUrl);
converterElements.downloadButton.addEventListener("click", downloadConversion);
window.addEventListener("resize", applyConverterSettings);
