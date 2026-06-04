import * as THREE from "https://esm.sh/three@0.161.0";
import { viewerState } from "./state.js";
import {
  createMaterial,
  disposeMaterial,
  getMaterialList,
  getStablePartColor,
} from "./materials.js";

export function createPartsController(callbacks) {
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

  function clearInteractionState() {
    viewerState.hoveredMesh = null;
    viewerState.selectedMesh = null;
    viewerState.isolatedMesh = null;
    refreshPartStates();
    callbacks.hideTooltip();
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

  function hidePart(mesh) {
    if (!mesh || !mesh.visible) {
      callbacks.setStatus("Select a part to hide.");
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
    callbacks.renderBomList();
    callbacks.hideTooltip();
    callbacks.setStatus(`Hidden ${partName}`);
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
    callbacks.renderBomList();
    callbacks.setStatus(
      restoredCount > 0
        ? `Restored ${restoredCount} part${restoredCount === 1 ? "" : "s"}`
        : "No hidden parts",
    );
  }

  function selectMesh(mesh, { isolate = false } = {}) {
    viewerState.selectedMesh = mesh;
    viewerState.isolatedMesh = isolate ? mesh : null;
    refreshPartStates();
    callbacks.renderBomList();

    if (mesh) {
      callbacks.setStatus(`${isolate ? "Isolated" : "Selected"}: ${getPartName(mesh)}`);
      return;
    }

    callbacks.setStatus(callbacks.getIdleStatus());
  }

  function clearIsolation() {
    viewerState.selectedMesh = null;
    viewerState.isolatedMesh = null;
    refreshPartStates();
    callbacks.renderBomList();
    callbacks.hideTooltip();
    callbacks.setStatus(callbacks.getIdleStatus());
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

  return {
    cleanPartName,
    getPartName,
    setPartVisibility,
    applyPartState,
    refreshPartStates,
    clearInteractionState,
    registerMesh,
    hidePart,
    showAllParts,
    selectMesh,
    clearIsolation,
    splitObjectByMaterialGroups,
  };
}
