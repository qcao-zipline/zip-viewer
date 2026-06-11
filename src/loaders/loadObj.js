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
mtlLoader.setMaterialOptions({ invertTrProperty: true });

const DEBUG_PART_PATH =
  "32909_005_A01_1_LID_KIT__DROID__P2 30606_001_C01_1_LID_FOAM__DROID__P2 Split_Body__110_";

function normalizeAssemblySegment(segment = "") {
  return segment.replace(/^_+/, "").trim();
}

function extractObjPartPaths(objText) {
  const lines = objText.split(/\r?\n/);
  const partPaths = [];
  let currentGroupName = "";
  let currentObjectName = "";

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    if (trimmedLine.startsWith("g ")) {
      currentGroupName = trimmedLine.slice(2).trim();
      continue;
    }

    if (trimmedLine.startsWith("o ")) {
      currentObjectName = trimmedLine.slice(2).trim();
      continue;
    }

    if (trimmedLine.startsWith("usemtl ")) {
      partPaths.push(currentGroupName || currentObjectName || "Unnamed body");
    }
  }

  return partPaths;
}

function splitObjPartPath(partPath = "") {
  return partPath
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && !/^droid_export_attempt_\d+$/i.test(segment));
}

function getAssemblyMatchForSegments(segments, assemblyOrderByKey) {
  const topLevelSegment = normalizeAssemblySegment(segments[0] || "");
  if (!topLevelSegment) {
    return null;
  }

  if (!assemblyOrderByKey.has(topLevelSegment)) {
    assemblyOrderByKey.set(topLevelSegment, assemblyOrderByKey.size);
  }

  return {
    assemblyKey: topLevelSegment,
    assemblyLabel: topLevelSegment,
    assemblyOrder: assemblyOrderByKey.get(topLevelSegment),
  };
}

function getJoinedPathSegments(mesh) {
  if (!Array.isArray(mesh?.userData?.partPathSegments) || mesh.userData.partPathSegments.length === 0) {
    return "";
  }

  return mesh.userData.partPathSegments.join(" ");
}

function collectDebugMeshRecord(mesh, meshIndex) {
  return {
    meshIndex,
    meshName: mesh?.name || "",
    partName: mesh?.userData?.partName || "",
    joinedPath: getJoinedPathSegments(mesh),
    assemblyKey: mesh?.userData?.assemblyKey || "",
    assemblyLabel: mesh?.userData?.assemblyLabel || "",
    materialNames: (Array.isArray(mesh?.material) ? mesh.material : [mesh?.material])
      .filter(Boolean)
      .map((material) => material.name || material.userData?.name || ""),
    geometryGroupCount: mesh?.geometry?.groups?.length || 0,
    visible: mesh?.visible ?? null,
  };
}

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
  const objPartPaths = extractObjPartPaths(objText);
  const assemblyOrderByKey = new Map();
  const debugSourceMatches = objPartPaths.reduce((matches, partPath, index) => {
    if (partPath === DEBUG_PART_PATH) {
      matches.push(index);
    }
    return matches;
  }, []);
  logViewerEvent("OBJ text ready", {
    fileName: file.name,
    characters: objText.length,
    mtllib: extractObjMaterialLibraryName(objText) || null,
    partPathCount: objPartPaths.length,
    debugTargetSourceMatchCount: debugSourceMatches.length,
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

  let sourceMeshIndex = 0;
  const debugAssignedMeshes = [];
  object.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const sourcePartPath = objPartPaths[sourceMeshIndex];
    if (sourcePartPath) {
      child.name = sourcePartPath;
      child.userData.partName = sourcePartPath;
      child.userData.partPathSegments = splitObjPartPath(sourcePartPath);
      const assemblyMatch = getAssemblyMatchForSegments(
        child.userData.partPathSegments,
        assemblyOrderByKey,
      );
      if (assemblyMatch) {
        child.userData.assemblyKey = assemblyMatch.assemblyKey;
        child.userData.assemblyLabel = assemblyMatch.assemblyLabel;
        child.userData.assemblyOrder = assemblyMatch.assemblyOrder;
      }
    }

    if (
      sourcePartPath === DEBUG_PART_PATH ||
      getJoinedPathSegments(child) === DEBUG_PART_PATH
    ) {
      debugAssignedMeshes.push(
        {
          sourceMeshIndex,
          sourcePartPath,
          ...collectDebugMeshRecord(child, sourceMeshIndex),
        },
      );
    }

    sourceMeshIndex += 1;
  });

  clearModel();
  await waitForNextPaint();

  let meshIndex = 0;
  const debugRegisteredMeshes = [];
  object.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    registerMesh(child, meshIndex, file.name || "Part");
    if (getJoinedPathSegments(child) === DEBUG_PART_PATH) {
      debugRegisteredMeshes.push(collectDebugMeshRecord(child, meshIndex));
    }
    meshIndex += 1;
  });

  logViewerEvent("OBJ mesh discovery finished", {
    fileName: file.name,
    meshCount: meshIndex,
  });

  logViewerEvent("OBJ debug target mapping", {
    fileName: file.name,
    debugTargetPath: DEBUG_PART_PATH,
    sourceMatchCount: debugSourceMatches.length,
    sourceMatchIndices: debugSourceMatches.slice(0, 24),
    assignedMeshCount: debugAssignedMeshes.length,
    assignedMeshes: debugAssignedMeshes.slice(0, 24),
    registeredMeshCount: debugRegisteredMeshes.length,
    registeredMeshes: debugRegisteredMeshes.slice(0, 24),
  });

  if (meshIndex === 0) {
    throw new Error(`The OBJ asset "${file.name || "model.obj"}" contains no meshes.`);
  }

  const bounds = new THREE.Box3().setFromObject(object);
  finalizeLoadedObject(object, bounds);
}
