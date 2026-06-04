import * as THREE from "https://esm.sh/three@0.161.0";
import { viewerState } from "../state.js";
import {
  createMaterial,
  getStablePartColor,
  resolveImportedColor,
} from "../materials.js";

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

async function getOcct() {
  if (!viewerState.occt) {
    viewerState.occt = window.occtimportjs();
  }
  return viewerState.occt;
}

export async function loadStepFile(file, helpers) {
  const {
    setStatus,
    clearModel,
    waitForNextPaint,
    registerMesh,
    finalizeLoadedObject,
  } = helpers;

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
    const mesh = new THREE.Mesh(geometry, createMaterial(partColor));
    mesh.name = partName;
    mesh.userData.partName = partName;
    registerMesh(mesh, meshIndex, "Body");
    modelGroup.add(mesh);
    bounds.expandByObject(mesh);
  }

  finalizeLoadedObject(modelGroup, bounds);
}
