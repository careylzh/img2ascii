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
converterElements.form.addEventListener("submit", convertImageUrl);
converterElements.downloadButton.addEventListener("click", downloadConversion);
