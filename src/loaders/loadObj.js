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
const ASSEMBLY_PART_NUMBER_LIST_PATH = "./assets/Part_Numbers_List.csv";
let cachedAssemblyPartNumbers = null;

function shouldUseDroidAssemblyGrouping(assetPath = "") {
  if (!assetPath) {
    return false;
  }

  const assetFileName = assetPath.split("/").pop() || "";
  return /^droid_export_attempt_\d+\.obj$/i.test(assetFileName);
}

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

function getSegmentLeadingPartNumber(segment = "") {
  const normalizedSegment = normalizeAssemblySegment(segment);
  const match = normalizedSegment.match(/^(\d+)_/);
  return match ? match[1] : "";
}

async function loadAssemblyPartNumbers(logViewerEvent) {
  if (cachedAssemblyPartNumbers) {
    return cachedAssemblyPartNumbers;
  }

  try {
    const csvText = await fetchAssetText(ASSEMBLY_PART_NUMBER_LIST_PATH);
    cachedAssemblyPartNumbers = csvText
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  } catch (error) {
    logViewerEvent("Assembly part number load failed", {
      path: ASSEMBLY_PART_NUMBER_LIST_PATH,
      message: error instanceof Error ? error.message : String(error),
    });
    cachedAssemblyPartNumbers = [];
  }

  return cachedAssemblyPartNumbers;
}

function getAssemblyMatchForSegments(segments, assemblyPartNumbers) {
  const assemblyOrderByPartNumber = new Map(
    assemblyPartNumbers.map((partNumber, index) => [partNumber, index]),
  );

  for (const segment of segments) {
    const normalizedSegment = normalizeAssemblySegment(segment);
    const leadingPartNumber = getSegmentLeadingPartNumber(normalizedSegment);

    if (assemblyOrderByPartNumber.has(leadingPartNumber)) {
      return {
        assemblyKey: normalizedSegment,
        assemblyLabel: normalizedSegment,
        assemblyPartNumber: leadingPartNumber,
        assemblyOrder: assemblyOrderByPartNumber.get(leadingPartNumber),
      };
    }
  }

  return null;
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
  const useAssemblyGrouping = shouldUseDroidAssemblyGrouping(assetPath);
  const assemblyPartNumbers = useAssemblyGrouping
    ? await loadAssemblyPartNumbers(logViewerEvent)
    : [];
  logViewerEvent("OBJ text ready", {
    fileName: file.name,
    characters: objText.length,
    mtllib: extractObjMaterialLibraryName(objText) || null,
    partPathCount: objPartPaths.length,
    assemblyPartNumberCount: assemblyPartNumbers.length,
    useAssemblyGrouping,
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

  let sourceMeshIndex = 0;
  object.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    const sourcePartPath = objPartPaths[sourceMeshIndex];
    if (sourcePartPath) {
      child.name = sourcePartPath;
      child.userData.partName = sourcePartPath;
      child.userData.partPathSegments = splitObjPartPath(sourcePartPath);
      const assemblyMatch = useAssemblyGrouping
        ? getAssemblyMatchForSegments(child.userData.partPathSegments, assemblyPartNumbers)
        : null;
      if (assemblyMatch) {
        child.userData.assemblyKey = assemblyMatch.assemblyKey;
        child.userData.assemblyLabel = assemblyMatch.assemblyLabel;
        child.userData.assemblyPartNumber = assemblyMatch.assemblyPartNumber;
        child.userData.assemblyOrder = assemblyMatch.assemblyOrder;
      }
    }

    sourceMeshIndex += 1;
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
