import * as THREE from "https://esm.sh/three@0.161.0";
import { OrbitControls } from "https://esm.sh/three@0.161.0/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/STLLoader.js";

const canvas = document.getElementById("viewer-canvas");
const reloadModelButton = document.getElementById("reload-model-button");
const fitViewButton = document.getElementById("fit-view-button");
const resetViewButton = document.getElementById("reset-view-button");
const wireframeButton = document.getElementById("wireframe-button");
const edgesButton = document.getElementById("edges-button");
const statusText = document.getElementById("status-text");

const bundledModelPath = "./assets/F18.stl";
const defaultCameraPosition = new THREE.Vector3(260, -260, 180);
const stlLoader = new STLLoader();

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef2f6);
scene.fog = new THREE.Fog(0xeef2f6, 1800, 6000);

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
scene.add(grid);

const rootGroup = new THREE.Group();
scene.add(rootGroup);

const viewerState = {
  currentObject: null,
  currentBounds: null,
  meshes: [],
  edgeLines: [],
  wireframe: false,
  showEdges: false,
  occt: null,
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
    wireframe: viewerState.wireframe,
  });
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
  camera.far = Math.max(distance * 20, 5000);
  camera.updateProjectionMatrix();
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

function buildStepMesh(resultMesh) {
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

  const materials = [createMaterial(new THREE.Color(0x93a0af))];
  const mesh = new THREE.Mesh(geometry, materials[0]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
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

  for (const resultMesh of result.meshes) {
    const mesh = buildStepMesh(resultMesh);
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
  camera.position.copy(defaultCameraPosition);
  controls.target.set(0, 0, 0);
  controls.update();
}

reloadModelButton.addEventListener("click", () => {
  loadBundledModel();
});

fitViewButton.addEventListener("click", () => {
  fitCameraToBounds(viewerState.currentBounds);
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
