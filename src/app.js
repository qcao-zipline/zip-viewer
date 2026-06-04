import * as THREE from "https://esm.sh/three@0.161.0";
import { OrbitControls } from "https://esm.sh/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/STLLoader.js";

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
const bomPanel = document.getElementById("bom-panel");
const bomSearch = document.getElementById("bom-search");
const bomList = document.getElementById("bom-list");
const bomEmpty = document.getElementById("bom-empty");

const defaultCameraPosition = new THREE.Vector3(260, -260, 180);
const gltfLoader = new GLTFLoader();
const mtlLoader = new MTLLoader();
const objLoader = new OBJLoader();
const stlLoader = new STLLoader();
const assetBufferCache = new Map();
const assetRequestCache = new Map();
const LOAD_LOG_PREFIX = "[Zipline Viewer]";
const THEME_STORAGE_KEY = "zip-viewer-theme";

function readStoredTheme() {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === "dark" || savedTheme === "light" ? savedTheme : null;
  } catch (error) {
    console.warn(`${LOAD_LOG_PREFIX} Theme preference could not be read`, error);
    return null;
  }
}

function writeStoredTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn(`${LOAD_LOG_PREFIX} Theme preference could not be saved`, error);
  }
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe1e6ee);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200000);
camera.position.copy(defaultCameraPosition);
camera.up.set(0, 0, 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.target.set(0, 0, 0);
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.ROTATE,
  RIGHT: THREE.MOUSE.PAN,
};

const ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb7c0cb, 0.8);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(320, -240, 420);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xd9e1ea, 0.45);
fillLight.position.set(-280, 200, 180);
scene.add(fillLight);

const grid = new THREE.GridHelper(2000, 80, 0xcfd7df, 0xe2e8ef);
grid.rotation.x = Math.PI / 2;
const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
for (const material of gridMaterials) {
  material.transparent = true;
  material.opacity = 0.72;
  material.depthWrite = false;
}
scene.add(grid);

const rootGroup = new THREE.Group();
scene.add(rootGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const rightClickState = {
  active: false,
  startX: 0,
  startY: 0,
};

const viewerState = {
  currentObject: null,
  currentBounds: null,
  meshes: [],
  edgeLines: [],
  transparentMode: false,
  occt: null,
  hoveredMesh: null,
  selectedMesh: null,
  isolatedMesh: null,
  currentModelPath: null,
  currentFallbackModelPath: null,
  currentModelName: null,
  pendingBomRenderFrame: 0,
  theme: "light",
  bomOpen: false,
};

function applyBomPanelState() {
  if (!bomPanel || !bomMenuButton) {
    return;
  }

  bomPanel.hidden = !viewerState.currentObject;
  bomPanel.classList.toggle("is-hidden", !viewerState.bomOpen);
  bomMenuButton.hidden = !viewerState.currentObject;
  bomMenuButton.setAttribute("aria-pressed", String(viewerState.bomOpen));
  bomMenuButton.setAttribute(
    "aria-label",
    viewerState.bomOpen ? "Hide BOM sidebar" : "Show BOM sidebar",
  );
}

function toggleBomPanel() {
  if (!viewerState.currentObject) {
    return;
  }

  viewerState.bomOpen = !viewerState.bomOpen;
  applyBomPanelState();
}

function getPreferredTheme() {
  const savedTheme = readStoredTheme();
  if (savedTheme) {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  viewerState.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = viewerState.theme;

  if (themeButton) {
    const isDark = viewerState.theme === "dark";
    themeButton.setAttribute("aria-pressed", String(isDark));
    themeButton.textContent = isDark ? "Light" : "Dark";
    themeButton.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  }

  if (viewerState.theme === "dark") {
    scene.background = new THREE.Color(0x081018);
    const darkGridPalette = [0x304254, 0x1b2736];
    gridMaterials.forEach((material, index) => {
      material.color.setHex(darkGridPalette[index] ?? darkGridPalette[0]);
      material.opacity = 0.46;
    });
    hemiLight.color.setHex(0xc7dbff);
    hemiLight.groundColor.setHex(0x0d1724);
    ambientLight.intensity = 0.92;
    fillLight.intensity = 0.52;
    keyLight.intensity = 1.15;
    return;
  }

  scene.background = new THREE.Color(0xe1e6ee);
  const lightGridPalette = [0xcfd7df, 0xe2e8ef];
  gridMaterials.forEach((material, index) => {
    material.color.setHex(lightGridPalette[index] ?? lightGridPalette[0]);
    material.opacity = 0.72;
  });
  hemiLight.color.setHex(0xffffff);
  hemiLight.groundColor.setHex(0xb7c0cb);
  ambientLight.intensity = 1.15;
  fillLight.intensity = 0.45;
  keyLight.intensity = 1.2;
}

function toggleTheme() {
  const nextTheme = viewerState.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  writeStoredTheme(nextTheme);
}

function setStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
}

function getIdleStatus() {
  return viewerState.currentObject ? "" : "Ready.";
}

function showModelPicker() {
  modelPicker.hidden = false;
  viewerState.bomOpen = false;
  setLoadingState(false);
  clearModel();
  applyBomPanelState();
  setStatus("Choose a model");
}

function hideModelPicker() {
  modelPicker.hidden = true;
  applyBomPanelState();
}

function setLoadingState(isVisible, message = "Loading model...") {
  if (!loadingScreen || !loadingLabel) {
    return;
  }

  loadingLabel.textContent = message;

  if (isVisible) {
    loadingScreen.classList.remove("is-visible");
    void loadingScreen.offsetWidth;
    loadingScreen.classList.add("is-visible");
    return;
  }

  loadingScreen.classList.remove("is-visible");
}

async function completeLoadingState() {
  await new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
  setLoadingState(false);
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function updateRendererSize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  material.dispose();
}

function clearModel() {
  if (viewerState.pendingBomRenderFrame) {
    cancelAnimationFrame(viewerState.pendingBomRenderFrame);
    viewerState.pendingBomRenderFrame = 0;
  }

  clearInteractionState();

  if (!viewerState.currentObject) {
    viewerState.meshes = [];
    viewerState.edgeLines = [];
    viewerState.currentBounds = null;
    renderBomList();
    return;
  }

  rootGroup.remove(viewerState.currentObject);
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
  renderBomList();
}

function createMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.05,
    roughness: 0.78,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });
}

function getAssetDisplayName(assetPath) {
  if (!assetPath) {
    return "model";
  }

  const pathname = new URL(assetPath, window.location.href).pathname;
  const fileName = pathname.split("/").pop() || "model";
  return decodeURIComponent(fileName);
}

function getAssetBaseUrl(assetPath) {
  return new URL(".", new URL(assetPath, window.location.href)).href;
}

function getExtensionFromAssetPath(assetPath) {
  const pathname = new URL(assetPath, window.location.href).pathname;
  return getFileExtension(pathname);
}

function logLoadTimings(modelName, modelPath, timings) {
  const roundedEntries = Object.fromEntries(
    Object.entries(timings).map(([key, value]) => [key, `${value.toFixed(1)}ms`]),
  );
  console.info(`${LOAD_LOG_PREFIX} Loaded ${modelName || getAssetDisplayName(modelPath)}`, {
    path: modelPath,
    ...roundedEntries,
  });
}

function logViewerEvent(eventName, details = {}) {
  console.info(`${LOAD_LOG_PREFIX} ${eventName}`, details);
}

function scheduleBomRender() {
  if (viewerState.pendingBomRenderFrame) {
    cancelAnimationFrame(viewerState.pendingBomRenderFrame);
  }

  viewerState.pendingBomRenderFrame = requestAnimationFrame(() => {
    viewerState.pendingBomRenderFrame = 0;
    renderBomList();
  });
}

async function fetchAssetBuffer(assetPath) {
  if (!assetPath) {
    throw new Error("Missing model asset path.");
  }

  if (assetBufferCache.has(assetPath)) {
    return assetBufferCache.get(assetPath);
  }

  if (assetRequestCache.has(assetPath)) {
    return assetRequestCache.get(assetPath);
  }

  const request = (async () => {
    const response = await fetch(assetPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${assetPath} (${response.status}).`);
    }

    const buffer = await response.arrayBuffer();
    assetBufferCache.set(assetPath, buffer);
    return buffer;
  })();

  assetRequestCache.set(assetPath, request);

  try {
    return await request;
  } finally {
    assetRequestCache.delete(assetPath);
  }
}

async function fetchAssetText(assetPath) {
  if (!assetPath) {
    throw new Error("Missing asset path.");
  }

  const response = await fetch(assetPath);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${assetPath} (${response.status}).`);
  }

  return response.text();
}

function warmAssetBuffer(assetPath) {
  if (!assetPath) {
    return;
  }

  fetchAssetBuffer(assetPath).catch((error) => {
    console.warn(`${LOAD_LOG_PREFIX} Warm fetch failed for ${assetPath}`, error);
  });
}

function getSiblingAssetPath(assetPath, extension) {
  const url = new URL(assetPath, window.location.href);
  url.pathname = url.pathname.replace(/\.[^.]+$/, `.${extension}`);
  return url.toString();
}

function extractObjMaterialLibraryName(objText) {
  const match = objText.match(/^\s*mtllib\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

async function loadObjMaterials(modelPath, objText) {
  const baseUrl = getAssetBaseUrl(modelPath);
  const mtllibName = extractObjMaterialLibraryName(objText);
  const candidatePaths = [];

  if (mtllibName) {
    candidatePaths.push(new URL(mtllibName, baseUrl).toString());
  }

  const siblingMtlPath = getSiblingAssetPath(modelPath, "mtl");
  if (!candidatePaths.includes(siblingMtlPath)) {
    candidatePaths.push(siblingMtlPath);
  }

  for (const candidatePath of candidatePaths) {
    try {
      logViewerEvent("OBJ material fetch started", { candidatePath });
      const mtlText = await fetchAssetText(candidatePath);
      const materials = mtlLoader.parse(mtlText, baseUrl);
      materials.preload();
      logViewerEvent("OBJ material fetch succeeded", { candidatePath });
      return materials;
    } catch (error) {
      logViewerEvent("OBJ material fetch failed", {
        candidatePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return null;
}

function getMaterialList(mesh) {
  if (!mesh?.material) {
    return [];
  }

  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function resolveImportedColor(sourceColor) {
  if (Array.isArray(sourceColor) && sourceColor.length === 3) {
    const usesByteRange = sourceColor.some((channel) => channel > 1);
    const normalized = usesByteRange
      ? sourceColor.map((channel) => channel / 255)
      : sourceColor;

    return new THREE.Color().setRGB(
      normalized[0],
      normalized[1],
      normalized[2],
      THREE.SRGBColorSpace,
    );
  }

  return null;
}

function getStepSchema(headerText) {
  const schemaMatch = headerText.match(/FILE_SCHEMA\s*\(\('\s*([^']+)/i);
  return schemaMatch ? schemaMatch[1].trim() : null;
}

function analyzeStepText(stepText) {
  const normalizedText = stepText.toUpperCase();

  return {
    schema: getStepSchema(normalizedText),
    isAliasHybridModel:
      normalizedText.includes("SHAPE_REPRESENTATION('HYBRID MODEL'") &&
      normalizedText.includes("MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION"),
  };
}

function describeStepReadError(error, file, analysis) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  const fileSizeMb = (file.size / (1024 * 1024)).toFixed(2);

  if (analysis?.isAliasHybridModel) {
    return [
      `The STEP parser rejected "${file.name}".`,
      `File size: ${fileSizeMb} MB.`,
      "This file is an Autodesk Alias-style hybrid/presentation STEP export, not a standard solid B-rep STEP this browser importer can triangulate reliably.",
    ].join(" ");
  }

  return [
    `The STEP parser rejected "${file.name}".`,
    `File size: ${fileSizeMb} MB.`,
    "This usually means the file uses unsupported STEP entities or is not a triangulatable solid/surface STEP export.",
  ].join(" ");
}

function getStablePartColor(name, index) {
  let hash = 0;
  const seed = `${name}:${index}`;

  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const hue = hash % 360;
  const saturation = 0.24 + ((hash >> 3) % 8) * 0.02;
  const lightness = 0.56 + ((hash >> 6) % 6) * 0.02;
  return new THREE.Color().setHSL(hue / 360, saturation, lightness);
}

function cleanPartName(name) {
  if (!name) {
    return "Unnamed body";
  }

  return name
    .replace(/^droid_export_attempt_\d+/i, "")
    .replace(/^droid_export_attemp_\d+/i, "")
    .replace(/^droid_export_attempt/i, "")
    .replace(/^droid_export_attemp/i, "")
    .replace(/^[_\-\s.]+/, "")
    .trim() || "Unnamed body";
}

function getPartName(mesh) {
  return cleanPartName(mesh?.userData?.partName || mesh?.name || "Unnamed body");
}

function setPartVisibility(mesh, isVisible) {
  if (!mesh) {
    return;
  }

  mesh.visible = isVisible;
  mesh.userData.isHidden = !isVisible;
}

function hidePart(mesh) {
  if (!mesh || !mesh.visible) {
    setStatus("Select a part to hide.");
    return;
  }

  const partName = getPartName(mesh);
  setPartVisibility(mesh, false);

  if (viewerState.hoveredMesh === mesh) {
    viewerState.hoveredMesh = null;
  }

  if (viewerState.selectedMesh === mesh) {
    viewerState.selectedMesh = null;
  }

  refreshPartStates();
  renderBomList();
  hideTooltip();
  setStatus(`Hidden ${partName}`);
}

function showAllParts() {
  let restoredCount = 0;

  for (const mesh of viewerState.meshes) {
    if (mesh.userData.isHidden) {
      setPartVisibility(mesh, true);
      restoredCount += 1;
    }
  }

  refreshPartStates();
  renderBomList();
  setStatus(
    restoredCount > 0
      ? `Restored ${restoredCount} part${restoredCount === 1 ? "" : "s"}`
      : "No hidden parts",
  );
}

function applyPartState(mesh) {
  if (!mesh) {
    return;
  }

  const isHovered = viewerState.hoveredMesh === mesh;
  const isSelected = viewerState.selectedMesh === mesh;
  const isIsolatedSelection = Boolean(viewerState.isolatedMesh);
  const isDimmed = isIsolatedSelection && viewerState.isolatedMesh !== mesh;
  const baseOpacity = viewerState.transparentMode ? 0.34 : 1;

  for (const material of getMaterialList(mesh)) {
    const baseColor = material.userData?.baseColor;
    if (baseColor) {
      material.color.copy(baseColor);
    }

    material.emissive.setHex(0x000000);
    material.emissiveIntensity = 0;
    material.transparent = viewerState.transparentMode || isDimmed;
    material.opacity = isDimmed ? 0.12 : baseOpacity;
    material.depthWrite = !(viewerState.transparentMode || isDimmed);

    if (isSelected) {
      if (baseColor) {
        material.color.copy(baseColor).lerp(new THREE.Color(0x0a84ff), 0.26);
      }
      material.emissive.setHex(0x0a84ff);
      material.emissiveIntensity = 0.22;
      material.transparent = viewerState.transparentMode;
      material.opacity = viewerState.transparentMode ? 0.58 : 1;
      material.depthWrite = !viewerState.transparentMode;
      continue;
    }

    if (isHovered) {
      if (baseColor) {
        material.color.copy(baseColor).lerp(new THREE.Color(0xffffff), 0.16);
      }
      material.emissive.setHex(0xffffff);
      material.emissiveIntensity = 0.08;
      material.opacity = viewerState.transparentMode ? 0.52 : 1;
    }
  }
}

function refreshPartStates() {
  for (const mesh of viewerState.meshes) {
    applyPartState(mesh);
  }
}

function hideTooltip() {
  if (partTooltip) {
    partTooltip.hidden = true;
  }
}

function showTooltip(mesh, clientX, clientY, prefix = "") {
  if (!partTooltip || !mesh) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  partTooltip.textContent = prefix ? `${prefix}: ${getPartName(mesh)}` : getPartName(mesh);
  partTooltip.hidden = false;

  const x = Math.min(clientX - rect.left + 14, rect.width - 220);
  const y = Math.min(clientY - rect.top + 14, rect.height - 48);
  partTooltip.style.transform = `translate(${Math.max(12, x)}px, ${Math.max(12, y)}px)`;
}

function updatePointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getIntersectedMesh(event) {
  if (viewerState.meshes.length === 0) {
    return null;
  }

  updatePointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(viewerState.meshes, false);
  return hits[0]?.object || null;
}

function clearInteractionState() {
  viewerState.hoveredMesh = null;
  viewerState.selectedMesh = null;
  viewerState.isolatedMesh = null;
  refreshPartStates();
  hideTooltip();
}

function registerMesh(mesh, meshIndex, fallbackName = "Part") {
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.name = mesh.name?.trim() || `${fallbackName} ${meshIndex + 1}`;
  mesh.userData.partName = mesh.userData.partName || mesh.name;
  mesh.userData.bomIndex = meshIndex + 1;
  mesh.userData.isHidden = false;
  mesh.userData.edgesBuilt = false;

  if (!mesh.material) {
    mesh.material = createMaterial(getStablePartColor(mesh.userData.partName, meshIndex));
  }

  for (const material of getMaterialList(mesh)) {
    if (!material.userData.baseColor && material.color) {
      material.userData.baseColor = material.color.clone();
    }
  }

  viewerState.meshes.push(mesh);
}

function selectMesh(mesh, { isolate = false } = {}) {
  viewerState.selectedMesh = mesh;
  viewerState.isolatedMesh = isolate ? mesh : null;
  refreshPartStates();
  renderBomList();

  if (mesh) {
    setStatus(`${isolate ? "Isolated" : "Selected"}: ${getPartName(mesh)}`);
    return;
  }

  setStatus(getIdleStatus());
}

function clearIsolation() {
  viewerState.selectedMesh = null;
  viewerState.isolatedMesh = null;
  refreshPartStates();
  renderBomList();
  hideTooltip();
  setStatus(getIdleStatus());
}

function fitCameraToBounds(bounds) {
  if (!bounds || bounds.isEmpty()) {
    return;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const fitHeightDistance = maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = 1.4 * Math.max(fitHeightDistance, fitWidthDistance);
  const direction = new THREE.Vector3(1, -1, 0.75).normalize();

  controls.target.copy(center);
  camera.position.copy(center).add(direction.multiplyScalar(distance));
  camera.near = Math.max(distance / 2000, 0.1);
  camera.far = Math.max(distance * 40, 20000);
  camera.updateProjectionMatrix();
  controls.update();
}

function focusMesh(mesh) {
  if (!mesh) {
    return;
  }

  const bounds = new THREE.Box3().setFromObject(mesh);
  if (!bounds.isEmpty()) {
    fitCameraToBounds(bounds);
  }
}

function rollCamera(angleRadians) {
  const viewDirection = new THREE.Vector3()
    .subVectors(controls.target, camera.position)
    .normalize();

  if (viewDirection.lengthSq() === 0) {
    return;
  }

  const rotation = new THREE.Quaternion().setFromAxisAngle(viewDirection, angleRadians);
  camera.up.applyQuaternion(rotation).normalize();
  controls.update();
}

function groundObjectToGrid(object, bounds) {
  if (!object || !bounds || bounds.isEmpty()) {
    return bounds;
  }

  if (bounds.min.z <= 0) {
    return bounds;
  }

  const zOffset = -bounds.min.z;
  object.position.z += zOffset;
  return bounds.clone().translate(new THREE.Vector3(0, 0, zOffset));
}

function finalizeLoadedObject(object, bounds) {
  const groundedBounds = groundObjectToGrid(object, bounds);
  viewerState.currentObject = object;
  viewerState.currentBounds = groundedBounds;
  rootGroup.add(object);
  fitCameraToBounds(groundedBounds);
  setStatus("");
  if (bomPanel) {
    viewerState.bomOpen = false;
    applyBomPanelState();
  }
  scheduleBomRender();
}

function applyTransparencyState() {
  transparencyButton?.setAttribute("aria-pressed", String(viewerState.transparentMode));
  refreshPartStates();
}

async function getOcct() {
  if (!viewerState.occt) {
    viewerState.occt = window.occtimportjs();
  }
  return viewerState.occt;
}

function buildStepMesh(resultMesh, meshIndex) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(resultMesh.attributes.position.array, 3),
  );
  geometry.setIndex(Array.from(resultMesh.index.array));

  if (resultMesh.attributes.normal) {
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(resultMesh.attributes.normal.array, 3),
    );
  } else {
    geometry.computeVertexNormals();
  }

  const partName = resultMesh.name?.trim() || `Body ${meshIndex + 1}`;
  const partColor =
    resolveImportedColor(resultMesh.color) || getStablePartColor(partName, meshIndex);
  const materials = [createMaterial(partColor)];
  for (const material of materials) {
    material.userData.baseColor = partColor.clone();
  }
  const mesh = new THREE.Mesh(geometry, materials[0]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.name = partName;
  mesh.userData.partName = partName;
  mesh.userData.bomIndex = meshIndex + 1;
  mesh.userData.isHidden = false;
  mesh.userData.edgesBuilt = false;
  viewerState.meshes.push(mesh);
  return mesh;
}

function sliceGeometryByGroup(geometry, group) {
  const slicedGeometry = new THREE.BufferGeometry();
  const sourceIndex = geometry.getIndex();
  const sourcePosition = geometry.getAttribute("position");

  if (!sourcePosition) {
    return null;
  }

  if (sourceIndex) {
    const sourceIndices = sourceIndex.array;
    const groupIndices = sourceIndices.slice(group.start, group.start + group.count);
    const uniqueIndexMap = new Map();
    const remappedIndices = new Array(groupIndices.length);
    let nextIndex = 0;

    for (let i = 0; i < groupIndices.length; i += 1) {
      const originalIndex = groupIndices[i];
      if (!uniqueIndexMap.has(originalIndex)) {
        uniqueIndexMap.set(originalIndex, nextIndex);
        nextIndex += 1;
      }
      remappedIndices[i] = uniqueIndexMap.get(originalIndex);
    }

    for (const [attributeName, attribute] of Object.entries(geometry.attributes)) {
      const itemSize = attribute.itemSize;
      const targetArray = new attribute.array.constructor(uniqueIndexMap.size * itemSize);

      for (const [originalIndex, mappedIndex] of uniqueIndexMap.entries()) {
        const sourceOffset = originalIndex * itemSize;
        const targetOffset = mappedIndex * itemSize;
        for (let componentIndex = 0; componentIndex < itemSize; componentIndex += 1) {
          targetArray[targetOffset + componentIndex] = attribute.array[sourceOffset + componentIndex];
        }
      }

      slicedGeometry.setAttribute(
        attributeName,
        new THREE.BufferAttribute(targetArray, itemSize, attribute.normalized),
      );
    }

    slicedGeometry.setIndex(remappedIndices);
    return slicedGeometry;
  }

  for (const [attributeName, attribute] of Object.entries(geometry.attributes)) {
    const itemSize = attribute.itemSize;
    const start = group.start * itemSize;
    const end = (group.start + group.count) * itemSize;
    const targetArray = attribute.array.slice(start, end);
    slicedGeometry.setAttribute(
      attributeName,
      new THREE.BufferAttribute(targetArray, itemSize, attribute.normalized),
    );
  }

  return slicedGeometry;
}

function getObjSplitPartName(material, mesh, groupIndex) {
  const rawName =
    material?.name?.trim() ||
    material?.userData?.name?.trim() ||
    material?.userData?.materialName?.trim() ||
    material?.userData?.sourceMaterial?.name?.trim() ||
    "";

  if (rawName) {
    return rawName;
  }

  const meshName = mesh.name?.trim() || "Part";
  return `${meshName} Material ${groupIndex + 1}`;
}

function splitMeshByMaterialGroups(mesh) {
  const geometryGroups = mesh.geometry?.groups || [];
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  if (materials.length <= 1 || geometryGroups.length <= 1) {
    return [mesh];
  }

  const parent = mesh.parent;
  if (!parent) {
    return [mesh];
  }

  const splitMeshes = [];

  geometryGroups.forEach((group, groupIndex) => {
    const groupMaterial = materials[group.materialIndex] || materials[0];
    const slicedGeometry = sliceGeometryByGroup(mesh.geometry, group);

    if (!slicedGeometry) {
      return;
    }

    if (!slicedGeometry.getAttribute("normal")) {
      slicedGeometry.computeVertexNormals();
    }

    slicedGeometry.computeBoundingBox();
    slicedGeometry.computeBoundingSphere();

    const splitMesh = new THREE.Mesh(slicedGeometry, groupMaterial.clone());
    const splitPartName = getObjSplitPartName(groupMaterial, mesh, groupIndex);
    splitMesh.name = splitPartName;
    splitMesh.userData.partName = splitPartName;
    splitMesh.position.copy(mesh.position);
    splitMesh.rotation.copy(mesh.rotation);
    splitMesh.scale.copy(mesh.scale);
    splitMesh.castShadow = mesh.castShadow;
    splitMesh.receiveShadow = mesh.receiveShadow;
    splitMesh.frustumCulled = mesh.frustumCulled;
    splitMeshes.push(splitMesh);
  });

  if (splitMeshes.length <= 1) {
    splitMeshes.forEach((splitMesh) => {
      splitMesh.geometry.dispose();
      disposeMaterial(splitMesh.material);
    });
    return [mesh];
  }

  const insertionIndex = parent.children.indexOf(mesh);
  parent.remove(mesh);
  mesh.geometry.dispose();
  disposeMaterial(mesh.material);

  splitMeshes.forEach((splitMesh, splitIndex) => {
    parent.children.splice(insertionIndex + splitIndex, 0, splitMesh);
    splitMesh.parent = parent;
  });

  return splitMeshes;
}

function splitObjectByMaterialGroups(rootObject) {
  const sourceMeshes = [];
  rootObject.traverse((child) => {
    if (child.isMesh) {
      sourceMeshes.push(child);
    }
  });

  let splitMeshCount = 0;
  for (const mesh of sourceMeshes) {
    splitMeshCount += splitMeshByMaterialGroups(mesh).length;
  }

  return splitMeshCount;
}

async function loadStepFile(file) {
  setStatus("Loading STEP model...");
  clearModel();
  await waitForNextPaint();

  const occt = await getOcct();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  const stepText = new TextDecoder("utf-8", { fatal: false })
    .decode(buffer)
    .replace(/\0/g, " ");
  const analysis = analyzeStepText(stepText);
  const header = stepText.slice(0, 1024).toUpperCase();

  if (!header.includes("ISO-10303-21")) {
    throw new Error(
      "This file does not look like a standard STEP exchange file. Try a text-based .step/.stp export.",
    );
  }

  if (analysis.isAliasHybridModel) {
    throw new Error(describeStepReadError(new Error(""), file, analysis));
  }

  let result;
  try {
    result = occt.ReadStepFile(buffer, null);
  } catch (error) {
    throw new Error(describeStepReadError(error, file, analysis));
  }

  if (!result.meshes || result.meshes.length === 0) {
    const schemaDetails = analysis.schema ? ` Schema: ${analysis.schema}.` : "";
    throw new Error(`The STEP file was read but produced no renderable meshes.${schemaDetails}`);
  }

  const modelGroup = new THREE.Group();
  const bounds = new THREE.Box3();

  for (const [meshIndex, resultMesh] of result.meshes.entries()) {
    const mesh = buildStepMesh(resultMesh, meshIndex);
    modelGroup.add(mesh);
    bounds.expandByObject(mesh);
  }

  finalizeLoadedObject(modelGroup, bounds);
}

async function loadStlFile(file) {
  setStatus("Loading STL model...");
  clearModel();
  await waitForNextPaint();

  const arrayBuffer = await file.arrayBuffer();
  const geometry = stlLoader.parse(arrayBuffer);
  geometry.computeBoundingBox();

  const bounds = geometry.boundingBox?.clone();
  if (bounds && !bounds.isEmpty()) {
    const center = bounds.getCenter(new THREE.Vector3());
    const translation = new THREE.Vector3(-center.x, -center.y, -bounds.min.z);
    geometry.translate(translation.x, translation.y, translation.z);
    bounds.translate(translation);
    geometry.boundingBox = bounds.clone();
  }

  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, createMaterial(new THREE.Color(0x8693a3)));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.name = file.name || "STL Model";
  mesh.userData.partName = mesh.name;
  mesh.userData.bomIndex = 1;
  mesh.userData.isHidden = false;
  mesh.userData.edgesBuilt = false;
  for (const material of getMaterialList(mesh)) {
    material.userData.baseColor = material.color.clone();
  }
  viewerState.meshes.push(mesh);

  const modelGroup = new THREE.Group();
  modelGroup.add(mesh);
  const modelBounds = new THREE.Box3().setFromObject(modelGroup);
  finalizeLoadedObject(modelGroup, modelBounds);
}

async function loadObjFile(file, assetPath = "") {
  setStatus("Loading OBJ model...");
  clearModel();
  await waitForNextPaint();

  logViewerEvent("OBJ load started", {
    fileName: file.name,
    fileSizeBytes: file.size,
    assetPath,
  });

  const objText = await file.text();
  logViewerEvent("OBJ text ready", {
    fileName: file.name,
    characters: objText.length,
    mtllib: extractObjMaterialLibraryName(objText) || null,
  });

  let materials = null;
  if (assetPath) {
    materials = await loadObjMaterials(assetPath, objText);
  }

  objLoader.setMaterials(materials);

  logViewerEvent("OBJ parse started", {
    fileName: file.name,
    hasMaterials: Boolean(materials),
  });
  const object = objLoader.parse(objText);
  logViewerEvent("OBJ parse finished", {
    fileName: file.name,
  });

  const splitMeshCount = splitObjectByMaterialGroups(object);
  logViewerEvent("OBJ material split finished", {
    fileName: file.name,
    splitMeshCount,
  });

  clearModel();
  await waitForNextPaint();

  let meshIndex = 0;
  object.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    registerMesh(child, meshIndex, file.name || "Part");
    meshIndex += 1;
  });

  logViewerEvent("OBJ mesh discovery finished", {
    fileName: file.name,
    meshCount: meshIndex,
  });

  if (meshIndex === 0) {
    throw new Error(`The OBJ asset "${file.name || "model.obj"}" contains no meshes.`);
  }

  const bounds = new THREE.Box3().setFromObject(object);
  finalizeLoadedObject(object, bounds);
}

function getFileExtension(fileName) {
  const match = fileName.toLowerCase().match(/\.([^.]+)$/);
  return match ? match[1] : "";
}

async function loadModelFile(file) {
  const extension = getFileExtension(file.name);

  if (extension === "stl") {
    await loadStlFile(file);
    return;
  }

  if (extension === "obj") {
    await loadObjFile(file);
    return;
  }

  if (extension === "stp" || extension === "step") {
    await loadStepFile(file);
    return;
  }

  throw new Error(`Unsupported file type ".${extension || "unknown"}".`);
}

async function loadBundledModel() {
  if (!viewerState.currentModelPath) {
    showModelPicker();
    return;
  }

  setStatus("Fetching model...");
  setLoadingState(true, "Fetching model...");
  await waitForNextPaint();

  try {
    await loadPreferredModel({
      modelPath: viewerState.currentModelPath,
      fallbackModelPath: viewerState.currentFallbackModelPath,
      modelName: viewerState.currentModelName,
    });
    await completeLoadingState();
  } catch (error) {
    console.error(error);
    clearModel();
    setLoadingState(false);
    setStatus(error.message || "Failed to load model.");
  }
}

function resetCamera() {
  if (viewerState.currentBounds) {
    fitCameraToBounds(viewerState.currentBounds);
    return;
  }

  camera.position.copy(defaultCameraPosition);
  controls.target.set(0, 0, 0);
  controls.update();
}

async function loadPreferredModel({ modelPath, fallbackModelPath, modelName }) {
  try {
    await loadModelFromPath(modelPath, modelName);
  } catch (error) {
    if (!fallbackModelPath || fallbackModelPath === modelPath) {
      throw error;
    }

    console.warn(
      `${LOAD_LOG_PREFIX} Falling back from optimized asset to source model`,
      { modelPath, fallbackModelPath, error }
    );
    setLoadingState(true, "Falling back to source model...");
    await waitForNextPaint();
    await loadModelFromPath(fallbackModelPath, modelName);
  }
}

async function loadModelFromPath(modelPath, modelName = "") {
  const extension = getExtensionFromAssetPath(modelPath);
  const totalStart = performance.now();
  const fetchStart = performance.now();

  if (extension === "glb") {
    const buffer = await fetchAssetBuffer(modelPath);
    const fetchMs = performance.now() - fetchStart;
    setLoadingState(true, "Preparing model...");
    await waitForNextPaint();

    const parseStart = performance.now();
    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.parse(buffer, getAssetBaseUrl(modelPath), resolve, reject);
    });
    const parseMs = performance.now() - parseStart;

    setLoadingState(true, "Rendering model...");
    await waitForNextPaint();

    const renderStart = performance.now();
    const object = gltf.scene || gltf.scenes?.[0];
    if (!object) {
      throw new Error(`The GLB asset "${getAssetDisplayName(modelPath)}" contains no renderable scene.`);
    }

    clearModel();
    await waitForNextPaint();

    let meshIndex = 0;
    object.traverse((child) => {
      if (child.isMesh) {
        registerMesh(child, meshIndex, modelName || "Part");
        meshIndex += 1;
      }
    });

    if (meshIndex === 0) {
      throw new Error(`The GLB asset "${getAssetDisplayName(modelPath)}" contains no meshes.`);
    }

    const bounds = new THREE.Box3().setFromObject(object);
    finalizeLoadedObject(object, bounds);
    const renderMs = performance.now() - renderStart;
    logLoadTimings(modelName, modelPath, {
      fetchMs,
      prepareMs: parseMs,
      renderMs,
      totalMs: performance.now() - totalStart,
    });
    return;
  }

  if (extension === "obj") {
    const objText = await fetchAssetText(modelPath);
    const fetchMs = performance.now() - fetchStart;
    setLoadingState(true, "Preparing model...");
    await waitForNextPaint();

    const parseStart = performance.now();
    const file = new File([objText], getAssetDisplayName(modelPath), {
      type: "text/plain",
    });
    await loadObjFile(file, modelPath);
    const parseMs = performance.now() - parseStart;

    setLoadingState(true, "Rendering model...");
    await waitForNextPaint();
    logLoadTimings(modelName, modelPath, {
      fetchMs,
      prepareMs: parseMs,
      renderMs: 0,
      totalMs: performance.now() - totalStart,
    });
    return;
  }

  const modelBuffer = await fetchAssetBuffer(modelPath);
  const fetchMs = performance.now() - fetchStart;
  setLoadingState(true, "Preparing model...");
  await waitForNextPaint();

  const parseStart = performance.now();
  const file = new File([modelBuffer], getAssetDisplayName(modelPath), {
    type: "application/octet-stream",
  });
  await loadModelFile(file);
  const parseMs = performance.now() - parseStart;

  setLoadingState(true, "Rendering model...");
  await waitForNextPaint();
  logLoadTimings(modelName, modelPath, {
    fetchMs,
    prepareMs: parseMs,
    renderMs: 0,
    totalMs: performance.now() - totalStart,
  });
}

function openSelectedModel(modelPath, modelName, fallbackModelPath = "") {
  viewerState.currentModelPath = modelPath;
  viewerState.currentFallbackModelPath = fallbackModelPath || null;
  viewerState.currentModelName = modelName;
  hideModelPicker();
  setStatus(`Opening ${modelName}...`);
  loadBundledModel();
}

function createBomItem(mesh) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "bom-item";
  button.setAttribute("role", "option");
  button.classList.toggle("is-active", viewerState.isolatedMesh === mesh);

  const index = document.createElement("span");
  index.className = "bom-item-index";
  index.textContent = String(mesh.userData.bomIndex || "");

  const name = document.createElement("span");
  name.className = "bom-item-name";
  name.textContent = getPartName(mesh);

  button.appendChild(index);
  button.appendChild(name);

  button.addEventListener("click", () => {
    selectMesh(mesh, { isolate: true });
    focusMesh(mesh);
  });

  return button;
}

function renderBomList() {
  if (!bomList || !bomEmpty) {
    return;
  }

  const query = (bomSearch?.value || "").trim().toLowerCase();
  const visibleMeshes = viewerState.meshes.filter((mesh) => !mesh.userData.isHidden);
  const filteredMeshes = visibleMeshes.filter((mesh) =>
    getPartName(mesh).toLowerCase().includes(query),
  );

  bomList.innerHTML = "";
  bomEmpty.hidden = filteredMeshes.length > 0;

  for (const mesh of filteredMeshes) {
    bomList.appendChild(createBomItem(mesh));
  }
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
  showModelPicker();
});

reloadModelButton.addEventListener("click", () => {
  loadBundledModel();
});

resetViewButton?.addEventListener("click", () => {
  resetCamera();
});

bomSearch?.addEventListener("input", () => {
  renderBomList();
});

bomMenuButton?.addEventListener("click", () => {
  toggleBomPanel();
});

transparencyButton?.addEventListener("click", () => {
  viewerState.transparentMode = !viewerState.transparentMode;
  applyTransparencyState();
});

themeButton?.addEventListener("click", () => {
  toggleTheme();
});

canvas.addEventListener("pointermove", (event) => {
  const intersectedMesh = getIntersectedMesh(event);

  if (viewerState.hoveredMesh !== intersectedMesh) {
    viewerState.hoveredMesh = intersectedMesh;
    refreshPartStates();
  }

  if (intersectedMesh) {
    const prefix = viewerState.selectedMesh === intersectedMesh ? "Selected" : "";
    showTooltip(intersectedMesh, event.clientX, event.clientY, prefix);
    setStatus(getPartName(intersectedMesh));
    return;
  }

  if (viewerState.selectedMesh) {
    showTooltip(viewerState.selectedMesh, event.clientX, event.clientY, "Selected");
    setStatus(`Selected: ${getPartName(viewerState.selectedMesh)}`);
    return;
  }

  hideTooltip();
  setStatus(getIdleStatus());
});

canvas.addEventListener("pointerleave", () => {
  viewerState.hoveredMesh = null;
  refreshPartStates();

  if (viewerState.selectedMesh) {
    setStatus(`Selected: ${getPartName(viewerState.selectedMesh)}`);
    return;
  }

  hideTooltip();
  setStatus(getIdleStatus());
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 2) {
    return;
  }

  rightClickState.active = true;
  rightClickState.startX = event.clientX;
  rightClickState.startY = event.clientY;
});

canvas.addEventListener("pointerup", (event) => {
  if (event.button !== 2 || !rightClickState.active) {
    return;
  }

  const movement = Math.hypot(
    event.clientX - rightClickState.startX,
    event.clientY - rightClickState.startY,
  );
  rightClickState.active = false;

  if (movement > 6) {
    return;
  }

  const intersectedMesh = getIntersectedMesh(event);
  if (intersectedMesh) {
    hidePart(intersectedMesh);
    return;
  }

  showAllParts();
});

window.addEventListener("resize", updateRendererSize);
window.addEventListener("keydown", (event) => {
  if (event.key === "Shift") {
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
  }
});
window.addEventListener("keyup", (event) => {
  if (event.key === "Shift") {
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    };
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "q" || event.key === "Q") {
    rollCamera(Math.PI / 18);
    setStatus("View rolled left");
  }

  if (event.key === "e" || event.key === "E") {
    rollCamera(-Math.PI / 18);
    setStatus("View rolled right");
  }
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

updateRendererSize();
applyTheme(getPreferredTheme());
applyBomPanelState();
applyTransparencyState();
resetCamera();
animate();
showModelPicker();
renderBomList();
warmAssetBuffer(modelCardButtons[0]?.dataset.modelPath);
