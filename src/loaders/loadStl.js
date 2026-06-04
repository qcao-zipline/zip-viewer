import * as THREE from "https://esm.sh/three@0.161.0";
import { STLLoader } from "https://esm.sh/three@0.161.0/examples/jsm/loaders/STLLoader.js";
import { createMaterial } from "../materials.js";

const stlLoader = new STLLoader();

export async function loadStlFile(file, helpers) {
  const {
    setStatus,
    clearModel,
    waitForNextPaint,
    registerMesh,
    finalizeLoadedObject,
  } = helpers;

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
  mesh.name = file.name || "STL Model";
  mesh.userData.partName = mesh.name;
  registerMesh(mesh, 0, mesh.name);

  const modelGroup = new THREE.Group();
  modelGroup.add(mesh);
  const modelBounds = new THREE.Box3().setFromObject(modelGroup);
  finalizeLoadedObject(modelGroup, modelBounds);
}
