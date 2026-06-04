import { warmAssetBuffer } from "./assets.js";
import { createBomController } from "./bom.js";
import { createCameraController } from "./camera.js";
import { createInteractionsController } from "./interactions.js";
import { createLoaderController } from "./loaders/index.js";
import { disposeMaterial } from "./materials.js";
import { createPartsController } from "./parts.js";
import { applySceneTheme, createSceneRuntime } from "./scene.js";
import { viewerState } from "./state.js";
import { createUiController } from "./ui.js";

const LOAD_LOG_PREFIX = "[ZipView]";

const canvas = document.getElementById("viewer-canvas");
const modelPicker = document.getElementById("model-picker");
const modelCardButtons = Array.from(document.querySelectorAll(".model-card"));
const homeButton = document.getElementById("home-button");
const reloadModelButton = document.getElementById("reload-model-button");
const resetViewButton = document.getElementById("reset-view-button");
const transparencyButton = document.getElementById("transparency-button");
const themeButton = document.getElementById("theme-button");
const bomMenuButton = document.getElementById("bom-menu-button");
const statusText = document.getElementById("status-text");
const loadingScreen = document.getElementById("loading-screen");
const loadingLabel = document.getElementById("loading-label");
const partTooltip = document.getElementById("part-tooltip");
const partContextMenu = document.getElementById("part-context-menu");
const partContextTitle = document.getElementById("part-context-title");
const contextIsolateButton = document.getElementById("context-isolate-button");
const contextHideButton = document.getElementById("context-hide-button");
const bomPanel = document.getElementById("bom-panel");
const bomResizeHandle = document.getElementById("bom-resize-handle");
const bomSearch = document.getElementById("bom-search");
const bomList = document.getElementById("bom-list");
const bomEmpty = document.getElementById("bom-empty");

const BOM_PANEL_MIN_WIDTH = 280;
const BOM_PANEL_MAX_WIDTH = 720;

const sceneRuntime = createSceneRuntime(canvas);
const cameraController = createCameraController(sceneRuntime, {
  getCurrentBounds: () => viewerState.currentBounds,
});

let bomController;

const uiCallbacks = {
  clearModel: () => {},
  applyBomPanelState: () => {},
  refreshPartStates: () => {},
};

const uiController = createUiController({
  elements: {
    modelPicker,
    statusText,
    loadingScreen,
    loadingLabel,
    themeButton,
    transparencyButton,
  },
  applySceneTheme: (theme) => applySceneTheme(sceneRuntime, theme),
  callbacks: uiCallbacks,
});

const partCallbacks = {
  renderBomList: () => {},
  hideTooltip: () => {},
  setStatus: uiController.setStatus,
  getIdleStatus: uiController.getIdleStatus,
};

const partsController = createPartsController(partCallbacks);

bomController = createBomController({
  elements: {
    bomPanel,
    bomMenuButton,
    bomSearch,
    bomList,
    bomEmpty,
  },
  getPartName: partsController.getPartName,
  onSelectMesh: partsController.selectMesh,
  onFocusMesh: cameraController.focusMesh,
});

partCallbacks.renderBomList = bomController.renderBomList;
uiCallbacks.applyBomPanelState = bomController.applyBomPanelState;
uiCallbacks.refreshPartStates = partsController.refreshPartStates;

const interactionsController = createInteractionsController({
  canvas,
  partTooltip,
  partContextMenu,
  partContextTitle,
  contextIsolateButton,
  contextHideButton,
  sceneRuntime,
  partsController,
  cameraController,
  uiController,
});

partCallbacks.hideTooltip = interactionsController.hideTooltip;

function logLoadTimings(modelName, modelPath, timings) {
  const roundedEntries = Object.fromEntries(
    Object.entries(timings).map(([key, value]) => [key, `${value.toFixed(1)}ms`]),
  );
  console.info(`${LOAD_LOG_PREFIX} Loaded ${modelName || "model"}`, {
    path: modelPath,
    ...roundedEntries,
  });
}

function logViewerEvent(eventName, details = {}) {
  console.info(`${LOAD_LOG_PREFIX} ${eventName}`, details);
}

function clearModel() {
  if (viewerState.pendingBomRenderFrame) {
    cancelAnimationFrame(viewerState.pendingBomRenderFrame);
    viewerState.pendingBomRenderFrame = 0;
  }

  partsController.clearInteractionState();

  if (!viewerState.currentObject) {
    viewerState.meshes = [];
    viewerState.edgeLines = [];
    viewerState.currentBounds = null;
    viewerState.bomExpandedPaths = new Set();
    bomController.renderBomList();
    return;
  }

  sceneRuntime.rootGroup.remove(viewerState.currentObject);
  viewerState.currentObject.traverse((child) => {
    if (child.isMesh) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    }

    if (child.isLineSegments) {
      child.geometry.dispose();
      child.material.dispose();
    }
  });

  viewerState.currentObject = null;
  viewerState.currentBounds = null;
  viewerState.meshes = [];
  viewerState.edgeLines = [];
  viewerState.bomExpandedPaths = new Set();
  bomController.renderBomList();
}

uiCallbacks.clearModel = clearModel;

function clampBomPanelWidth(width) {
  const viewportMax = Math.max(BOM_PANEL_MIN_WIDTH, window.innerWidth - 32);
  return Math.min(Math.max(width, BOM_PANEL_MIN_WIDTH), Math.min(BOM_PANEL_MAX_WIDTH, viewportMax));
}

function setBomPanelWidth(width) {
  if (!bomPanel) {
    return;
  }

  bomPanel.style.setProperty("--bom-panel-width", `${clampBomPanelWidth(width)}px`);
}

function bindBomResizeHandle() {
  if (!bomPanel || !bomResizeHandle) {
    return;
  }

  let isResizing = false;

  const stopResizing = () => {
    if (!isResizing) {
      return;
    }

    isResizing = false;
    bomPanel.classList.remove("is-resizing");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  const updateWidthFromClientX = (clientX) => {
    const panelRect = bomPanel.getBoundingClientRect();
    const nextWidth = clientX - panelRect.left;
    setBomPanelWidth(nextWidth);
  };

  bomResizeHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    isResizing = true;
    bomPanel.classList.add("is-resizing");
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    bomResizeHandle.setPointerCapture(event.pointerId);
    updateWidthFromClientX(event.clientX);
  });

  bomResizeHandle.addEventListener("pointermove", (event) => {
    if (!isResizing) {
      return;
    }

    updateWidthFromClientX(event.clientX);
  });

  bomResizeHandle.addEventListener("pointerup", () => {
    stopResizing();
  });

  bomResizeHandle.addEventListener("pointercancel", () => {
    stopResizing();
  });

  window.addEventListener("resize", () => {
    const panelRect = bomPanel.getBoundingClientRect();
    if (panelRect.width > 0) {
      setBomPanelWidth(panelRect.width);
    }
  });
}

function finalizeLoadedObject(object, bounds) {
  const placedBounds = cameraController.placeObjectOnGrid(object, bounds);
  viewerState.currentObject = object;
  viewerState.currentBounds = placedBounds;
  sceneRuntime.rootGroup.add(object);
  cameraController.fitCameraToBounds(placedBounds);
  uiController.setStatus("");
  viewerState.bomOpen = false;
  bomController.applyBomPanelState();
  bomController.scheduleBomRender();
}

const loaderController = createLoaderController({
  setStatus: uiController.setStatus,
  setLoadingState: uiController.setLoadingState,
  waitForNextPaint: uiController.waitForNextPaint,
  clearModel,
  registerMesh: partsController.registerMesh,
  splitObjectByMaterialGroups: partsController.splitObjectByMaterialGroups,
  finalizeLoadedObject,
  logLoadTimings,
  logViewerEvent,
  loadLogPrefix: LOAD_LOG_PREFIX,
});

async function loadBundledModel() {
  if (!viewerState.currentModelPath) {
    uiController.showModelPicker();
    return;
  }

  uiController.setStatus("Fetching model...");
  uiController.setLoadingState(true, "Fetching model...");
  await uiController.waitForNextPaint();

  try {
    await loaderController.loadPreferredModel({
      modelPath: viewerState.currentModelPath,
      fallbackModelPath: viewerState.currentFallbackModelPath,
      modelName: viewerState.currentModelName,
    });
    await uiController.completeLoadingState();
  } catch (error) {
    console.error(error);
    clearModel();
    uiController.setLoadingState(false);
    uiController.setStatus(error.message || "Failed to load model.");
  }
}

function openSelectedModel(modelPath, modelName, fallbackModelPath = "") {
  viewerState.currentModelPath = modelPath;
  viewerState.currentFallbackModelPath = fallbackModelPath || null;
  viewerState.currentModelName = modelName;
  uiController.hideModelPicker();
  uiController.setStatus(`Opening ${modelName}...`);
  loadBundledModel();
}

for (const cardButton of modelCardButtons) {
  cardButton.addEventListener("click", () => {
    openSelectedModel(
      cardButton.dataset.modelPath,
      cardButton.dataset.modelName,
      cardButton.dataset.fallbackModelPath,
    );
  });
}

homeButton?.addEventListener("click", () => {
  viewerState.currentModelPath = null;
  viewerState.currentFallbackModelPath = null;
  viewerState.currentModelName = null;
  uiController.showModelPicker();
});

reloadModelButton?.addEventListener("click", () => {
  loadBundledModel();
});

resetViewButton?.addEventListener("click", () => {
  cameraController.resetCamera();
});

transparencyButton?.addEventListener("click", () => {
  viewerState.transparentMode = !viewerState.transparentMode;
  uiController.applyTransparencyState();
});

themeButton?.addEventListener("click", () => {
  uiController.toggleTheme();
});

bomController.bindEvents();
interactionsController.bindEvents();
bindBomResizeHandle();
window.addEventListener("resize", sceneRuntime.updateRendererSize);

function animate() {
  requestAnimationFrame(animate);
  sceneRuntime.renderFrame();
}

sceneRuntime.updateRendererSize();
uiController.init();
bomController.applyBomPanelState();
uiController.applyTransparencyState();
cameraController.resetCamera();
animate();
uiController.showModelPicker();
bomController.renderBomList();
warmAssetBuffer(modelCardButtons[0]?.dataset.modelPath);
