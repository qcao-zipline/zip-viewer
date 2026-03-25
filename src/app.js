import * as THREE from "https://esm.sh/three@0.161.0";
import { OrbitControls } from "https://esm.sh/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/STLLoader.js";

const canvas = document.getElementById("viewer-canvas");
const reloadModelButton = document.getElementById("reload-model-button");
const resetViewButton = document.getElementById("reset-view-button");
const wireframeButton = document.getElementById("wireframe-button");
const edgesButton = document.getElementById("edges-button");
const statusText = document.getElementById("status-text");
const partTooltip = document.getElementById("part-tooltip");

const bundledModelPath = "./assets/DRONE.stp";
const defaultCameraPosition = new THREE.Vector3(260, -260, 180);
const stlLoader = new STLLoader();

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
  wireframe: false,
  showEdges: false,
  occt: null,
  hoveredMesh: null,
  selectedMesh: null,
};

function setStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
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
  clearInteractionState();

  if (!viewerState.currentObject) {
    viewerState.meshes = [];
    viewerState.edgeLines = [];
    viewerState.currentBounds = null;
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
}

function createMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.05,
    roughness: 0.78,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
    wireframe: viewerState.wireframe,
  });
}

function getMaterialList(mesh) {
  if (!mesh?.material) {
    return [];
  }

  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function resolveImportedColor(sourceColor) {
  if (Array.isArray(sourceColor) && sourceColor.length === 3) {
    return new THREE.Color(sourceColor[0], sourceColor[1], sourceColor[2]);
  }

  return null;
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

function getPartName(mesh) {
  return mesh?.userData?.partName || mesh?.name || "Unnamed body";
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

  for (const material of getMaterialList(mesh)) {
    const baseColor = material.userData?.baseColor;
    if (baseColor) {
      material.color.copy(baseColor);
    }

    material.emissive.setHex(0x000000);
    material.emissiveIntensity = 0;

    if (isSelected) {
      if (baseColor) {
        material.color.copy(baseColor).lerp(new THREE.Color(0x0a84ff), 0.26);
      }
      material.emissive.setHex(0x0a84ff);
      material.emissiveIntensity = 0.22;
      continue;
    }

    if (isHovered) {
      if (baseColor) {
        material.color.copy(baseColor).lerp(new THREE.Color(0xffffff), 0.16);
      }
      material.emissive.setHex(0xffffff);
      material.emissiveIntensity = 0.08;
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
  refreshPartStates();
  hideTooltip();
}

function addEdgeLines(mesh) {
  const edgeGeometry = new THREE.EdgesGeometry(mesh.geometry, 30);
  const edgeLines = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color: 0x1f2937,
      transparent: true,
      opacity: 0.26,
    }),
  );
  edgeLines.visible = viewerState.showEdges;
  mesh.add(edgeLines);
  viewerState.edgeLines.push(edgeLines);
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

function finalizeLoadedObject(object, bounds) {
  viewerState.currentObject = object;
  viewerState.currentBounds = bounds;
  rootGroup.add(object);
  fitCameraToBounds(bounds);
  setStatus("Model loaded.");
}

function applyWireframeState() {
  wireframeButton.setAttribute("aria-pressed", String(viewerState.wireframe));
  for (const mesh of viewerState.meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material.wireframe = viewerState.wireframe;
    }
  }
}

function applyEdgesState() {
  edgesButton.setAttribute("aria-pressed", String(viewerState.showEdges));
  for (const edgeLine of viewerState.edgeLines) {
    edgeLine.visible = viewerState.showEdges;
  }
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
  mesh.userData.isHidden = false;
  addEdgeLines(mesh);
  viewerState.meshes.push(mesh);
  return mesh;
}

async function loadStepFile(file) {
  setStatus("Loading STEP model...");
  clearModel();

  const occt = await getOcct();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  const result = occt.ReadStepFile(buffer, null);

  if (!result.meshes || result.meshes.length === 0) {
    throw new Error("The STEP file did not produce any renderable meshes.");
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

  const arrayBuffer = await file.arrayBuffer();
  const geometry = stlLoader.parse(arrayBuffer);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const bounds = geometry.boundingBox?.clone();
  if (bounds && !bounds.isEmpty()) {
    const center = bounds.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -bounds.min.z);
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, createMaterial(new THREE.Color(0x8693a3)));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.name = file.name || "STL Model";
  mesh.userData.partName = mesh.name;
  mesh.userData.isHidden = false;
  for (const material of getMaterialList(mesh)) {
    material.userData.baseColor = material.color.clone();
  }
  addEdgeLines(mesh);
  viewerState.meshes.push(mesh);

  const modelGroup = new THREE.Group();
  modelGroup.add(mesh);
  const modelBounds = new THREE.Box3().setFromObject(modelGroup);
  finalizeLoadedObject(modelGroup, modelBounds);
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

  if (extension === "stp" || extension === "step") {
    await loadStepFile(file);
    return;
  }

  throw new Error(`Unsupported file type ".${extension || "unknown"}".`);
}

async function loadBundledModel() {
  setStatus("Fetching model...");

  try {
    const response = await fetch(bundledModelPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${bundledModelPath} (${response.status}).`);
    }

    const fileName = bundledModelPath.split("/").pop() || "model";
    const file = new File([await response.arrayBuffer()], fileName, {
      type: "application/octet-stream",
    });
    await loadModelFile(file);
  } catch (error) {
    console.error(error);
    clearModel();
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

reloadModelButton.addEventListener("click", () => {
  loadBundledModel();
});

resetViewButton.addEventListener("click", () => {
  resetCamera();
});

wireframeButton.addEventListener("click", () => {
  viewerState.wireframe = !viewerState.wireframe;
  applyWireframeState();
});

edgesButton.addEventListener("click", () => {
  viewerState.showEdges = !viewerState.showEdges;
  applyEdgesState();
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
  setStatus(viewerState.currentObject ? "Model loaded." : "Ready.");
});

canvas.addEventListener("pointerleave", () => {
  viewerState.hoveredMesh = null;
  refreshPartStates();

  if (viewerState.selectedMesh) {
    setStatus(`Selected: ${getPartName(viewerState.selectedMesh)}`);
    return;
  }

  hideTooltip();
  setStatus(viewerState.currentObject ? "Model loaded." : "Ready.");
});

canvas.addEventListener("click", (event) => {
  viewerState.selectedMesh = getIntersectedMesh(event);
  refreshPartStates();

  if (viewerState.selectedMesh) {
    showTooltip(viewerState.selectedMesh, event.clientX, event.clientY, "Selected");
    setStatus(`Selected: ${getPartName(viewerState.selectedMesh)}`);
    return;
  }

  hideTooltip();
  setStatus(viewerState.currentObject ? "Model loaded." : "Ready.");
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
applyWireframeState();
applyEdgesState();
resetCamera();
animate();
loadBundledModel();
