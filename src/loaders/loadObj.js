import * as THREE from "https://esm.sh/three@0.161.0";
import { MTLLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/OBJLoader.js";
import {
  extractObjMaterialLibraryName,
  fetchAssetText,
  getAssetBaseUrl,
  getSiblingAssetPath,
} from "../assets.js";

const mtlLoader = new MTLLoader();
const objLoader = new OBJLoader();

async function loadObjMaterials(modelPath, objText, logViewerEvent) {
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

export async function loadObjFile(file, helpers) {
  const {
    assetPath = "",
    setStatus,
    clearModel,
    waitForNextPaint,
    registerMesh,
    splitObjectByMaterialGroups,
    finalizeLoadedObject,
    logViewerEvent,
  } = helpers;

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
    materials = await loadObjMaterials(assetPath, objText, logViewerEvent);
  }

  objLoader.setMaterials(materials || null);

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
