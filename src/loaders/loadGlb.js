import * as THREE from "https://esm.sh/three@0.161.0";
import { GLTFLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js";
import {
  fetchAssetBuffer,
  getAssetBaseUrl,
  getAssetDisplayName,
} from "../assets.js";

const gltfLoader = new GLTFLoader();

export async function loadGlbFromPath(modelPath, modelName, helpers) {
  const {
    setLoadingState,
    waitForNextPaint,
    clearModel,
    registerMesh,
    finalizeLoadedObject,
  } = helpers;

  const totalStart = performance.now();
  const fetchStart = performance.now();
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

  return {
    fetchMs,
    prepareMs: parseMs,
    renderMs: performance.now() - renderStart,
    totalMs: performance.now() - totalStart,
  };
}
