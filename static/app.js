const state = {
  root: "",
  files: [],
  filtered: [],
  activePath: "",
  localTexts: new Map(),
  textCache: new Map(),
  viewMode: "single",
  lazyObserver: null,
  lazyRenderToken: 0,
  fontSize: 11,
  lineHeight: 100,
};

const elements = {
  rootPath: document.querySelector("#rootPath"),
  refreshButton: document.querySelector("#refreshButton"),
  folderForm: document.querySelector("#folderForm"),
  folderInput: document.querySelector("#folderInput"),
  browseFolderButton: document.querySelector("#browseFolderButton"),
  directoryInput: document.querySelector("#directoryInput"),
  folderStatus: document.querySelector("#folderStatus"),
  searchInput: document.querySelector("#searchInput"),
  sortSelect: document.querySelector("#sortSelect"),
  fileCount: document.querySelector("#fileCount"),
  fileList: document.querySelector("#fileList"),
  panelToggleButton: document.querySelector("#panelToggleButton"),
  gridToggleButton: document.querySelector("#gridToggleButton"),
  pageToggleButton: document.querySelector("#pageToggleButton"),
  floatingFileName: document.querySelector("#floatingFileName"),
  activeName: document.querySelector("#activeName"),
  activeMeta: document.querySelector("#activeMeta"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  fontSizeInput: document.querySelector("#fontSizeInput"),
  lineHeightInput: document.querySelector("#lineHeightInput"),
  fitToggle: document.querySelector("#fitToggle"),
  wrapToggle: document.querySelector("#wrapToggle"),
  invertToggle: document.querySelector("#invertToggle"),
  canvasWrap: document.querySelector("#canvasWrap"),
  singleStage: document.querySelector("#singleStage"),
  asciiCanvas: document.querySelector("#asciiCanvas"),
  gridView: document.querySelector("#gridView"),
  pageView: document.querySelector("#pageView"),
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp * 1000));
}

function fileLabel(file) {
  return file.folder ? `${file.folder}/${file.name}` : file.name;
}

function sortFiles(files) {
  const mode = elements.sortSelect.value;
  return [...files].sort((a, b) => {
    if (mode === "modified") return b.modified - a.modified || fileLabel(a).localeCompare(fileLabel(b));
    if (mode === "size") return b.size - a.size || fileLabel(a).localeCompare(fileLabel(b));
    if (mode === "dimensions") return b.rows * b.columns - a.rows * a.columns || fileLabel(a).localeCompare(fileLabel(b));
    return fileLabel(a).localeCompare(fileLabel(b), undefined, { sensitivity: "base" });
  });
}

function applyFilters() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const matched = query
    ? state.files.filter((file) => fileLabel(file).toLowerCase().includes(query))
    : state.files;
  state.filtered = sortFiles(matched);
  renderFileList();
  if (state.viewMode === "grid") renderGridView();
  if (state.viewMode === "page") renderPageView();
}

function renderFileList() {
  elements.fileList.replaceChildren();
  elements.fileCount.textContent = `${state.filtered.length} ${state.filtered.length === 1 ? "file" : "files"}`;

  if (state.filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No .txt files found.";
    elements.fileList.append(empty);
    return;
  }

  for (const file of state.filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-item";
    button.setAttribute("aria-current", file.path === state.activePath ? "true" : "false");
    button.innerHTML = `
      <strong></strong>
      <span></span>
    `;
    button.querySelector("strong").textContent = fileLabel(file);
    button.querySelector("span").textContent = `${file.rows} x ${file.columns} · ${formatBytes(file.size)}`;
    button.addEventListener("click", () => selectFile(file.path));
    elements.fileList.append(button);
  }
}

function activeIndex() {
  return state.filtered.findIndex((file) => file.path === state.activePath);
}

function updateButtons() {
  const index = activeIndex();
  elements.prevButton.disabled = index <= 0;
  elements.nextButton.disabled = index < 0 || index >= state.filtered.length - 1;
}

async function loadFiles() {
  elements.rootPath.textContent = "Loading folder...";
  const response = await fetch("/api/files", { cache: "no-store" });
  if (!response.ok) throw new Error(`File list failed: ${response.status}`);
  const payload = await response.json();
  await applyFolderPayload(payload);
}

async function changeFolder(folder) {
  elements.folderStatus.textContent = "Loading folder...";
  const response = await fetch("/api/folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || `Folder load failed: ${response.status}`);
  }
  const payload = await response.json();
  await applyFolderPayload(payload);
}

async function applyFolderPayload(payload) {
  state.root = payload.root;
  state.files = payload.files;
  state.localTexts = new Map();
  state.textCache = new Map();
  state.activePath = "";
  elements.rootPath.textContent = state.root;
  elements.folderInput.value = state.root;
  elements.folderStatus.textContent = `${state.files.length} ${state.files.length === 1 ? "file" : "files"} loaded.`;
  elements.activeName.textContent = "No file selected";
  elements.floatingFileName.textContent = "No file selected";
  elements.activeMeta.textContent = "Choose a text file from the folder.";
  elements.asciiCanvas.textContent = state.files.length > 0 ? "Select a .txt file to visualize it here." : "No .txt files found in this folder.";
  applyFilters();
  updateButtons();
  if (state.filtered[0]) await selectFile(state.filtered[0].path);
}

async function chooseNativeFolder() {
  if ("showDirectoryPicker" in window) {
    await chooseWithDirectoryPicker();
    return;
  }
  elements.directoryInput.click();
}

async function chooseWithDirectoryPicker() {
  const rootHandle = await window.showDirectoryPicker({ mode: "read" });
  const files = [];
  const localTexts = new Map();
  await collectDirectoryHandleFiles(rootHandle, "", files, localTexts);
  await applyLocalFolder(rootHandle.name, files, localTexts);
}

async function collectDirectoryHandleFiles(handle, folder, files, localTexts) {
  for await (const [name, child] of handle.entries()) {
    const relative = folder ? `${folder}/${name}` : name;
    if (child.kind === "directory") {
      await collectDirectoryHandleFiles(child, relative, files, localTexts);
      continue;
    }
    if (child.kind !== "file" || !name.toLowerCase().endsWith(".txt")) continue;
    const file = await child.getFile();
    const text = await file.text();
    files.push(localFileRecord(relative, file, text));
    localTexts.set(relative, text);
  }
}

async function chooseWithDirectoryInput(fileList) {
  const txtFiles = [...fileList].filter((file) => file.name.toLowerCase().endsWith(".txt"));
  const files = [];
  const localTexts = new Map();
  const root = txtFiles[0]?.webkitRelativePath?.split("/")[0] || "Selected folder";
  for (const file of txtFiles) {
    const rawPath = file.webkitRelativePath || file.name;
    const relative = rawPath.startsWith(`${root}/`) ? rawPath.slice(root.length + 1) : rawPath;
    const text = await file.text();
    files.push(localFileRecord(relative, file, text));
    localTexts.set(relative, text);
  }
  await applyLocalFolder(root, files, localTexts);
}

function localFileRecord(relative, file, text) {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") lines.pop();
  return {
    path: relative,
    name: relative.split("/").at(-1) || relative,
    folder: relative.includes("/") ? relative.split("/").slice(0, -1).join("/") : "",
    size: file.size,
    modified: Math.floor(file.lastModified / 1000),
    rows: lines.length,
    columns: lines.reduce((width, line) => Math.max(width, line.length), 0),
    source: "local",
  };
}

async function applyLocalFolder(rootName, files, localTexts) {
  state.root = rootName;
  state.files = sortFiles(files);
  state.localTexts = localTexts;
  state.textCache = new Map(localTexts);
  state.activePath = "";
  elements.rootPath.textContent = rootName;
  elements.folderInput.value = "";
  elements.folderInput.placeholder = "Native folder selected";
  elements.folderStatus.textContent = `${state.files.length} ${state.files.length === 1 ? "file" : "files"} loaded from picker.`;
  elements.activeName.textContent = "No file selected";
  elements.floatingFileName.textContent = "No file selected";
  elements.activeMeta.textContent = "Choose a text file from the folder.";
  elements.asciiCanvas.textContent = state.files.length > 0 ? "Select a .txt file to visualize it here." : "No .txt files found in this folder.";
  applyFilters();
  updateButtons();
  if (state.filtered[0]) await selectFile(state.filtered[0].path);
}

async function selectFile(path) {
  const file = state.files.find((candidate) => candidate.path === path);
  if (!file) return;

  setViewMode("single");
  state.activePath = path;
  elements.activeName.textContent = fileLabel(file);
  elements.floatingFileName.textContent = fileLabel(file);
  elements.activeMeta.textContent = `${file.rows} rows x ${file.columns} columns · ${formatBytes(file.size)} · ${formatDate(file.modified)}`;
  elements.asciiCanvas.textContent = "Loading...";
  renderFileList();
  updateButtons();

  if (file.source === "local") {
    elements.asciiCanvas.textContent = state.localTexts.get(path) || "";
    state.textCache.set(path, elements.asciiCanvas.textContent);
    applyCanvasSettings();
    return;
  }

  try {
    elements.asciiCanvas.textContent = await loadFileText(file);
  } catch {
    elements.asciiCanvas.textContent = `Unable to load ${fileLabel(file)}.`;
  }
  applyCanvasSettings();
}

async function loadFileText(file) {
  if (state.textCache.has(file.path)) return state.textCache.get(file.path);
  if (file.source === "local") {
    const text = state.localTexts.get(file.path) || "";
    state.textCache.set(file.path, text);
    return text;
  }

  const response = await fetch(`/api/file?path=${encodeURIComponent(file.path)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${fileLabel(file)}.`);
  const text = await response.text();
  state.textCache.set(file.path, text);
  return text;
}

function setViewMode(mode) {
  if (state.viewMode === mode) return;
  state.viewMode = mode;
  state.lazyRenderToken += 1;
  disconnectLazyObserver();
  elements.gridView.replaceChildren();
  elements.pageView.replaceChildren();
  document.body.classList.toggle("grid-mode", mode === "grid");
  document.body.classList.toggle("page-mode", mode === "page");
  updateViewButtons();

  if (mode === "grid") {
    elements.floatingFileName.textContent = "Grid view";
    renderGridView();
    return;
  }

  if (mode === "page") {
    elements.floatingFileName.textContent = "Continuous view";
    renderPageView();
    return;
  }

  if (mode === "single") {
    elements.floatingFileName.textContent = state.activePath
      ? fileLabel(state.files.find((file) => file.path === state.activePath) || { name: state.activePath, folder: "" })
      : "No file selected";
    requestAnimationFrame(applyCanvasSettings);
  }
}

function updateViewButtons() {
  const gridActive = state.viewMode === "grid";
  const pageActive = state.viewMode === "page";
  elements.gridToggleButton.setAttribute("aria-pressed", String(gridActive));
  elements.gridToggleButton.setAttribute("aria-label", gridActive ? "Show single view" : "Show grid view");
  elements.gridToggleButton.title = gridActive ? "Show single view" : "Show grid view";
  elements.pageToggleButton.setAttribute("aria-pressed", String(pageActive));
  elements.pageToggleButton.setAttribute("aria-label", pageActive ? "Show single view" : "Show continuous view");
  elements.pageToggleButton.title = pageActive ? "Show single view" : "Show continuous view";
}

function renderGridView() {
  const files = state.filtered;
  const token = state.lazyRenderToken + 1;
  state.lazyRenderToken = token;
  disconnectLazyObserver();
  elements.gridView.replaceChildren();
  if (files.length === 0) {
    const empty = document.createElement("p");
    empty.className = "grid-empty";
    empty.textContent = "No .txt files found.";
    elements.gridView.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const file of files) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "grid-tile";
    tile.dataset.path = file.path;
    tile.setAttribute("aria-label", `Open ${fileLabel(file)}`);
    tile.innerHTML = `
      <pre></pre>
      <span></span>
    `;
    tile.querySelector("span").textContent = fileLabel(file);
    tile.addEventListener("click", () => selectFile(file.path));
    fragment.append(tile);
  }
  elements.gridView.append(fragment);
  observeLazyItems(elements.gridView.querySelectorAll(".grid-tile"), token, loadGridTile);
}

function renderPageView() {
  const files = state.filtered;
  const token = state.lazyRenderToken + 1;
  state.lazyRenderToken = token;
  disconnectLazyObserver();
  elements.pageView.replaceChildren();
  if (files.length === 0) {
    const empty = document.createElement("p");
    empty.className = "grid-empty";
    empty.textContent = "No .txt files found.";
    elements.pageView.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const file of files) {
    const section = document.createElement("article");
    section.className = "page-item";
    section.dataset.path = file.path;
    section.innerHTML = `
      <header>
        <strong></strong>
        <span></span>
      </header>
      <div class="page-stage"><pre></pre></div>
    `;
    section.querySelector("strong").textContent = fileLabel(file);
    section.querySelector("span").textContent = `${file.rows} rows x ${file.columns} columns`;
    fragment.append(section);
  }
  elements.pageView.append(fragment);
  layoutPagePlaceholders();
  observePageItems(elements.pageView.querySelectorAll(".page-item"), token);
}

function observePageItems(items, token) {
  const itemList = [...items];
  if (!("IntersectionObserver" in window)) {
    for (const item of itemList) {
      item.dataset.virtualVisible = "true";
      loadPageItem(item, token);
    }
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      entry.target.dataset.virtualVisible = String(entry.isIntersecting);
      if (entry.isIntersecting) loadPageItem(entry.target, token);
      else unloadPageItem(entry.target);
    }
  }, {
    root: elements.canvasWrap,
    rootMargin: "400px 0px",
  });

  state.lazyObserver = observer;
  for (const item of itemList) observer.observe(item);
}

function observeLazyItems(items, token, loadItem) {
  const itemList = [...items];
  if (!("IntersectionObserver" in window)) {
    for (const item of itemList) loadItem(item, token);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      loadItem(entry.target, token);
    }
  }, {
    root: elements.canvasWrap,
    rootMargin: "700px",
  });

  state.lazyObserver = observer;
  for (const item of itemList) state.lazyObserver.observe(item);
}

function disconnectLazyObserver() {
  if (!state.lazyObserver) return;
  state.lazyObserver.disconnect();
  state.lazyObserver = null;
}

function loadGridTile(tile, token) {
  const file = state.files.find((candidate) => candidate.path === tile.dataset.path);
  const pre = tile.querySelector("pre");
  if (!file || !pre || tile.dataset.loaded === "true") return;
  tile.dataset.loaded = "true";
  fillGridTile(pre, file, token);
}

function loadPageItem(item, token) {
  const file = state.files.find((candidate) => candidate.path === item.dataset.path);
  const pre = item.querySelector("pre");
  if (!file || !pre || item.dataset.loaded === "true" || item.dataset.loading === "true") return;
  item.dataset.loading = "true";
  fillPageItem(item, pre, file, token).finally(() => {
    item.dataset.loading = "false";
  });
}

function unloadPageItem(item) {
  const pre = item.querySelector("pre");
  if (!pre) return;
  pre.textContent = "";
  pre.style.transform = "none";
  item.dataset.loaded = "false";
}

async function fillGridTile(pre, file, token) {
  pre.textContent = "Loading...";
  try {
    const text = await loadFileText(file);
    if (token !== state.lazyRenderToken) return;
    requestAnimationFrame(() => {
      if (token !== state.lazyRenderToken) return;
      const fontSize = fitGridTileText(pre, file);
      pre.textContent = thumbnailText(text, pre, fontSize);
    });
  } catch {
    pre.textContent = "Unable to load";
  }
}

async function fillPageItem(item, pre, file, token) {
  pre.textContent = "Loading...";
  try {
    const text = await loadFileText(file);
    if (token !== state.lazyRenderToken || item.dataset.virtualVisible !== "true") return;
    pre.textContent = text;
    fitPageItemText(pre, file);
    item.dataset.loaded = "true";
  } catch {
    if (item.dataset.virtualVisible === "true") pre.textContent = "Unable to load";
  }
}

function fitPageItemText(pre, file) {
  fitTextToWidth(pre, 8);
}

function thumbnailText(text, pre, fontSize) {
  const lines = text.split(/\r\n|\r|\n/).filter((line, index, all) => index < all.length - 1 || line !== "");
  const visibleLines = Math.max(1, Math.floor(pre.clientHeight / (fontSize * 0.82)));
  return lines.slice(0, visibleLines).join("\n");
}

function fitGridTileText(pre, file) {
  const availableWidth = pre.clientWidth;
  const columns = Math.max(file.columns || 1, 1);
  const widthFit = availableWidth / (columns * 0.62);
  const fontSize = Math.max(0.65, Math.min(5, widthFit));
  pre.style.fontSize = `${fontSize}px`;
  return fontSize;
}

function fitVisibleGridTiles() {
  if (state.viewMode !== "grid") return;
  for (const tile of elements.gridView.querySelectorAll(".grid-tile")) {
    const file = state.files.find((candidate) => candidate.path === tile.dataset.path);
    const pre = tile.querySelector("pre");
    if (!file || !pre || !state.textCache.has(file.path)) continue;
    const fontSize = fitGridTileText(pre, file);
    pre.textContent = thumbnailText(state.textCache.get(file.path), pre, fontSize);
  }
}

function fitVisiblePageItems() {
  if (state.viewMode !== "page") return;
  for (const item of elements.pageView.querySelectorAll(".page-item")) {
    const file = state.files.find((candidate) => candidate.path === item.dataset.path);
    const pre = item.querySelector("pre");
    if (file && pre && item.dataset.loaded === "true") fitPageItemText(pre, file);
  }
}

function layoutPagePlaceholders() {
  if (state.viewMode !== "page") return;
  for (const item of elements.pageView.querySelectorAll(".page-item")) {
    if (item.dataset.loaded === "true") continue;
    const file = state.files.find((candidate) => candidate.path === item.dataset.path);
    const stage = item.querySelector(".page-stage");
    if (!file || !stage) continue;
    const fontSize = 8;
    const lineHeight = fontSize * 0.9;
    const characterWidth = fontSize * 0.602;
    const contentWidth = Math.max(1, file.columns * characterWidth);
    const availableWidth = Math.max(1, stage.clientWidth);
    const scale = Math.min(1, availableWidth / contentWidth);
    stage.style.height = `${Math.max(1, Math.ceil(file.rows * lineHeight * scale))}px`;
  }
}

function moveSelection(direction) {
  if (state.viewMode !== "single") return;
  const index = activeIndex();
  const next = state.filtered[index + direction];
  if (next) selectFile(next.path);
}

function applyCanvasSettings() {
  state.fontSize = Number(elements.fontSizeInput.value);
  state.lineHeight = Number(elements.lineHeightInput.value);
  elements.asciiCanvas.style.fontSize = `${state.fontSize}px`;
  elements.asciiCanvas.style.lineHeight = `${state.lineHeight / 100}`;
  document.body.classList.toggle("wrap-enabled", elements.wrapToggle.checked);
  document.body.classList.toggle("inverted", elements.invertToggle.checked);

  elements.asciiCanvas.style.transform = "none";
  elements.asciiCanvas.style.zoom = "1";
  elements.asciiCanvas.style.marginBottom = "0";
  elements.asciiCanvas.style.width = elements.wrapToggle.checked ? "100%" : "max-content";
  elements.singleStage.style.height = "auto";
  elements.singleStage.style.overflow = "visible";
  if (!elements.fitToggle.checked || elements.wrapToggle.checked) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fitTextToWidth(elements.asciiCanvas, state.fontSize, 40);
    });
  });
}

function fitTextToWidth(pre, baseFontSize, horizontalPadding = 0) {
  const stage = pre.parentElement;
  pre.style.transform = "none";
  pre.style.transformOrigin = "top left";
  pre.style.width = "max-content";
  pre.style.fontSize = `${baseFontSize}px`;
  const availableWidth = Math.max(1, stage.clientWidth - horizontalPadding);
  const contentWidth = Math.max(1, pre.scrollWidth - horizontalPadding);
  const scale = Math.min(1, availableWidth / contentWidth);
  pre.style.transform = `scale(${scale})`;
  stage.style.height = `${Math.ceil(pre.scrollHeight * scale)}px`;
  stage.style.overflow = "hidden";
}

function toggleFilePanel() {
  const collapsed = !document.body.classList.contains("panel-hidden");
  document.body.classList.toggle("panel-hidden", collapsed);
  elements.panelToggleButton.setAttribute("aria-pressed", String(collapsed));
  elements.panelToggleButton.setAttribute("aria-label", collapsed ? "Show file panel" : "Hide file panel");
  elements.panelToggleButton.title = collapsed ? "Show file panel" : "Hide file panel";
  requestAnimationFrame(applyCanvasSettings);
}

elements.folderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const folder = elements.folderInput.value.trim();
  if (!folder) {
    elements.folderStatus.textContent = "Enter a folder path.";
    return;
  }
  changeFolder(folder).catch((error) => {
    elements.folderStatus.textContent = error.message;
  });
});
elements.browseFolderButton.addEventListener("click", () => {
  chooseNativeFolder().catch((error) => {
    if (error.name === "AbortError") return;
    elements.folderStatus.textContent = error.message;
  });
});
elements.directoryInput.addEventListener("change", () => {
  chooseWithDirectoryInput(elements.directoryInput.files).catch((error) => {
    elements.folderStatus.textContent = error.message;
  });
  elements.directoryInput.value = "";
});
elements.panelToggleButton.addEventListener("click", toggleFilePanel);
elements.gridToggleButton.addEventListener("click", () => setViewMode(state.viewMode === "grid" ? "single" : "grid"));
elements.pageToggleButton.addEventListener("click", () => setViewMode(state.viewMode === "page" ? "single" : "page"));
elements.refreshButton.addEventListener("click", () => {
  if (state.localTexts.size > 0) {
    elements.folderStatus.textContent = "Use Browse to reopen a native-picked folder.";
    return;
  }
  changeFolder(state.root || elements.folderInput.value).catch((error) => {
    elements.folderStatus.textContent = error.message;
  });
});
elements.searchInput.addEventListener("input", applyFilters);
elements.sortSelect.addEventListener("change", applyFilters);
elements.prevButton.addEventListener("click", () => moveSelection(-1));
elements.nextButton.addEventListener("click", () => moveSelection(1));
elements.fontSizeInput.addEventListener("input", applyCanvasSettings);
elements.lineHeightInput.addEventListener("input", applyCanvasSettings);
elements.fitToggle.addEventListener("change", applyCanvasSettings);
elements.wrapToggle.addEventListener("change", applyCanvasSettings);
elements.invertToggle.addEventListener("change", applyCanvasSettings);
window.addEventListener("resize", () => {
  applyCanvasSettings();
  fitVisibleGridTiles();
  fitVisiblePageItems();
  layoutPagePlaceholders();
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    event.preventDefault();
    moveSelection(-1);
  }
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    event.preventDefault();
    moveSelection(1);
  }
});

loadFiles().catch((error) => {
  state.root = "Browser folder picker";
  state.files = [];
  state.filtered = [];
  elements.rootPath.textContent = "Browser folder picker";
  elements.folderInput.value = "";
  elements.folderInput.placeholder = "Local server required for path loading";
  elements.folderStatus.textContent = "Use Browse to choose a folder.";
  elements.activeName.textContent = "No file selected";
  elements.floatingFileName.textContent = "No file selected";
  elements.activeMeta.textContent = "Choose a folder with Browse.";
  elements.asciiCanvas.textContent = "Use Browse to choose a folder of .txt ASCII files.";
  applyFilters();
  updateButtons();
  console.warn(error);
});
