import * as THREE from "https://esm.sh/three@0.161.0";
import { viewerState } from "./state.js";
import {
  createMaterial,
  disposeMaterial,
  getMaterialList,
  getStablePartColor,
} from "./materials.js";

export function createPartsController(callbacks) {
  const DEBUG_PART_PATH =
    "32909_005_A01_1_LID_KIT__DROID__P2 30606_001_C01_1_LID_FOAM__DROID__P2 Split_Body__110_";

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

  function getPartGroupSegments(mesh) {
    if (Array.isArray(mesh?.userData?.partPathSegments) && mesh.userData.partPathSegments.length > 1) {
      return mesh.userData.partPathSegments.slice(0, -1);
    }

    if (Array.isArray(mesh?.userData?.partPathSegments) && mesh.userData.partPathSegments.length === 1) {
      return mesh.userData.partPathSegments;
    }

    return getPartName(mesh)
      .split(/\s+/)
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  function getPartIsolationKey(mesh) {
    return getPartGroupSegments(mesh).join(" ");
  }

  function getAssemblyKey(mesh) {
    return mesh?.userData?.assemblyKey || "";
  }

  function meshBelongsToAssembly(mesh, assemblyKey) {
    if (!mesh || !assemblyKey) {
      return false;
    }

    return getAssemblyKey(mesh) === assemblyKey;
  }

  function meshBelongsToPart(mesh, partKey) {
    if (!mesh || !partKey) {
      return false;
    }

    return getPartIsolationKey(mesh) === partKey;
  }

  function setPartVisibility(mesh, isVisible) {
    if (!mesh) {
      return;
    }

    mesh.visible = isVisible;
    mesh.userData.isHidden = !isVisible;
  }

  function applyMaterialVisibilityMode(material, { opacity, useXray }) {
    const nextTransparent = useXray && opacity < 1;
    const nextOpacity = opacity;
    const nextDepthWrite = !nextTransparent;
    const nextDepthTest = true;
    const nextForceSinglePass = false;

    if (material.transparent !== nextTransparent) {
      material.transparent = nextTransparent;
      material.needsUpdate = true;
    }

    if (material.alphaHash !== false) {
      material.alphaHash = false;
      material.needsUpdate = true;
    }

    if (material.forceSinglePass !== nextForceSinglePass) {
      material.forceSinglePass = nextForceSinglePass;
      material.needsUpdate = true;
    }

    material.opacity = nextOpacity;
    material.depthWrite = nextDepthWrite;
    material.depthTest = nextDepthTest;
  }

  function applyPartState(mesh) {
    if (!mesh) {
      return;
    }

    const isHovered = viewerState.hoveredMesh === mesh;
    const isSelected = viewerState.selectedMesh === mesh;
    const isolatedAssemblyKey = viewerState.isolatedAssemblyKey;
    const isolatedPartKey = viewerState.isolatedPartKey;
    const meshIsolationKey = isolatedAssemblyKey || getPartIsolationKey(mesh);
    const currentIsolationKey = isolatedAssemblyKey || isolatedPartKey;
    const meshGroupKey = isolatedAssemblyKey ? getAssemblyKey(mesh) : meshIsolationKey;
    const isIsolatedSelection = Boolean(currentIsolationKey);
    const isIsolatedMesh = isIsolatedSelection && meshGroupKey === currentIsolationKey;
    const isDimmed = isIsolatedSelection && !isIsolatedMesh;
    const baseOpacity = viewerState.transparentMode ? 0.34 : 1;
    const joinedPath = Array.isArray(mesh?.userData?.partPathSegments)
      ? mesh.userData.partPathSegments.join(" ")
      : "";

    mesh.visible = !mesh.userData.isHidden && (!isIsolatedSelection || isIsolatedMesh);

    if (joinedPath === DEBUG_PART_PATH) {
      console.info("[ZipView] Debug applyPartState", {
        joinedPath,
        selectedMeshName: viewerState.selectedMesh?.name || "",
        isolatedAssemblyKey,
        isolatedPartKey,
        meshIsolationKey,
        currentIsolationKey,
        meshGroupKey,
        isIsolatedSelection,
        isIsolatedMesh,
        isDimmed,
        visible: mesh.visible,
        transparentMode: viewerState.transparentMode,
      });
    }

    for (const material of getMaterialList(mesh)) {
      const baseColor = material.userData?.baseColor;
      if (baseColor) {
        material.color.copy(baseColor);
      }

      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
      applyMaterialVisibilityMode(material, {
        opacity: isDimmed ? 0.12 : baseOpacity,
        useXray: viewerState.transparentMode || isDimmed,
      });

      if (isIsolatedMesh) {
        applyMaterialVisibilityMode(material, {
          opacity: viewerState.transparentMode ? 0.58 : 1,
          useXray: viewerState.transparentMode,
        });
        if (joinedPath === DEBUG_PART_PATH) {
          console.info("[ZipView] Debug isolated material state", {
            joinedPath,
            materialName: material.name || material.userData?.name || "",
            transparent: material.transparent,
            opacity: material.opacity,
            depthWrite: material.depthWrite,
            depthTest: material.depthTest,
            renderOrder: mesh.renderOrder ?? 0,
            side: material.side ?? null,
          });
        }
      }

      if (isSelected) {
        if (baseColor) {
          material.color.copy(baseColor).lerp(new THREE.Color(0x8b5cf6), 0.26);
        }
        material.emissive.setHex(0x8b5cf6);
        material.emissiveIntensity = 0.22;
        applyMaterialVisibilityMode(material, {
          opacity: viewerState.transparentMode ? 0.58 : 1,
          useXray: viewerState.transparentMode,
        });
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
    viewerState.isolatedPartKey = null;
    viewerState.isolatedAssemblyKey = null;
    refreshPartStates();
    callbacks.hideTooltip();
  }

  function registerMesh(mesh, meshIndex, fallbackName = "Part") {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.name = mesh.name?.trim() || `${fallbackName} ${meshIndex + 1}`;
    mesh.userData.partName = mesh.userData.partName || mesh.name;
    if (!Array.isArray(mesh.userData.partPathSegments) || mesh.userData.partPathSegments.length === 0) {
      mesh.userData.partPathSegments = cleanPartName(mesh.userData.partName)
        .split(/\s+/)
        .map((segment) => segment.trim())
        .filter(Boolean);
    }
    mesh.userData.partGroupKey = getPartIsolationKey(mesh);
    mesh.userData.bomIndex = meshIndex + 1;
    mesh.userData.isHidden = false;
    mesh.userData.edgesBuilt = false;

    if (!mesh.material) {
      mesh.material = createMaterial(getStablePartColor(mesh.userData.partName, meshIndex));
    } else if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) => material?.clone?.() ?? material);
    } else if (mesh.material?.clone) {
      mesh.material = mesh.material.clone();
    }

    for (const material of getMaterialList(mesh)) {
      if (!material.userData.baseColor && material.color) {
        material.userData.baseColor = material.color.clone();
      }

      material.alphaHash = false;
      material.forceSinglePass = false;
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
    const hadIsolation = Boolean(viewerState.isolatedMesh || viewerState.isolatedPartKey || viewerState.isolatedAssemblyKey);

    for (const mesh of viewerState.meshes) {
      if (mesh.userData.isHidden) {
        setPartVisibility(mesh, true);
        restoredCount += 1;
      }
    }

    viewerState.hoveredMesh = null;
    viewerState.selectedMesh = null;
    viewerState.isolatedMesh = null;
    viewerState.isolatedPartKey = null;
    viewerState.isolatedAssemblyKey = null;

    refreshPartStates();
    callbacks.renderBomList();
    callbacks.hideTooltip();
    callbacks.setStatus(
      restoredCount > 0 || hadIsolation
        ? `Showed all${restoredCount > 0 ? ` and restored ${restoredCount} part${restoredCount === 1 ? "" : "s"}` : ""}`
        : "No hidden parts",
    );
  }

  function selectMesh(mesh, { isolate = false } = {}) {
    const activeAssemblyKey = viewerState.isolatedAssemblyKey;
    const activePartKey = viewerState.isolatedPartKey;

    if (
      activeAssemblyKey &&
      !isolate &&
      (mesh === null || meshBelongsToAssembly(mesh, activeAssemblyKey))
    ) {
      selectMeshWithinAssemblyIsolation(mesh);
      return;
    }

    if (
      activePartKey &&
      !isolate &&
      (mesh === null || meshBelongsToPart(mesh, activePartKey))
    ) {
      selectMeshWithinPartIsolation(mesh);
      return;
    }

    viewerState.selectedMesh = mesh;
    viewerState.isolatedMesh = isolate ? mesh : null;
    viewerState.isolatedPartKey = isolate && mesh ? getPartIsolationKey(mesh) : null;
    viewerState.isolatedAssemblyKey = null;
    refreshPartStates();
    callbacks.renderBomList();

    if (mesh) {
      callbacks.setStatus(`${isolate ? "Isolated" : "Selected"}: ${getPartName(mesh)}`);
      return;
    }

    callbacks.setStatus(callbacks.getIdleStatus());
  }

  function selectMeshWithinPartIsolation(mesh) {
    const activePartKey = viewerState.isolatedPartKey;

    if (!activePartKey) {
      selectMesh(mesh);
      return;
    }

    if (!mesh) {
      viewerState.selectedMesh = null;
      viewerState.isolatedMesh = null;
      viewerState.isolatedAssemblyKey = null;
      refreshPartStates();
      callbacks.renderBomList();
      callbacks.hideTooltip();
      callbacks.setStatus(callbacks.getIdleStatus());
      return;
    }

    if (!meshBelongsToPart(mesh, activePartKey)) {
      refreshPartStates();
      callbacks.renderBomList();
      return;
    }

    viewerState.selectedMesh = mesh;
    viewerState.isolatedMesh = mesh;
    viewerState.isolatedAssemblyKey = null;
    refreshPartStates();
    callbacks.renderBomList();
    callbacks.setStatus(`Selected: ${getPartName(mesh)}`);
  }

  function selectMeshWithinAssemblyIsolation(mesh) {
    const activeAssemblyKey = viewerState.isolatedAssemblyKey;

    if (!activeAssemblyKey) {
      selectMesh(mesh);
      return;
    }

    if (!mesh) {
      viewerState.selectedMesh = null;
      viewerState.isolatedMesh = null;
      viewerState.isolatedPartKey = null;
      refreshPartStates();
      callbacks.renderBomList();
      callbacks.hideTooltip();
      callbacks.setStatus(callbacks.getIdleStatus());
      return;
    }

    if (!meshBelongsToAssembly(mesh, activeAssemblyKey)) {
      refreshPartStates();
      callbacks.renderBomList();
      return;
    }

    viewerState.selectedMesh = mesh;
    viewerState.isolatedMesh = mesh;
    viewerState.isolatedPartKey = null;
    refreshPartStates();
    callbacks.renderBomList();
    callbacks.setStatus(`Selected: ${getPartName(mesh)}`);
  }

  function clearIsolation() {
    viewerState.selectedMesh = null;
    viewerState.isolatedMesh = null;
    viewerState.isolatedPartKey = null;
    viewerState.isolatedAssemblyKey = null;
    refreshPartStates();
    callbacks.renderBomList();
    callbacks.hideTooltip();
    callbacks.setStatus(callbacks.getIdleStatus());
  }

  function selectAssembly(assemblyKey) {
    if (!assemblyKey) {
      clearIsolation();
      return;
    }

    const assemblyMeshes = viewerState.meshes.filter(
      (mesh) => !mesh.userData.isHidden && getAssemblyKey(mesh) === assemblyKey,
    );
    const leadMesh = assemblyMeshes[0] || null;

    viewerState.selectedMesh = leadMesh;
    viewerState.isolatedMesh = leadMesh;
    viewerState.isolatedPartKey = null;
    viewerState.isolatedAssemblyKey = assemblyKey;
    refreshPartStates();
    callbacks.renderBomList();
    callbacks.hideTooltip();
    callbacks.setStatus(
      leadMesh?.userData?.assemblyLabel
        ? `Isolated: ${leadMesh.userData.assemblyLabel}`
        : callbacks.getIdleStatus(),
    );
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
    const sourcePartName = mesh.userData?.partName?.trim() || mesh.name?.trim() || "";
    if (sourcePartName) {
      return sourcePartName;
    }

    const rawName =
      material?.name?.trim() ||
      material?.userData?.name?.trim() ||
      material?.userData?.materialName?.trim() ||
      material?.userData?.sourceMaterial?.name?.trim() ||
      "";

    if (rawName) {
      return rawName;
    }

    return `Part Material ${groupIndex + 1}`;
  }

  function isOverlayLikeSplit(material, mesh, splitPartName) {
    const overlayPattern = /\b(PSA|VHB|STICKER|TAPE|LABEL|ADHESIVE)\b/i;
    const geometryPattern = /\b(Thicken|Offset_Surface|Mirror_Geometry|Pattern_Geometry)\b/i;
    const searchText = [
      splitPartName,
      mesh?.userData?.partName,
      ...(Array.isArray(mesh?.userData?.partPathSegments) ? mesh.userData.partPathSegments : []),
      material?.name,
      material?.userData?.name,
      material?.userData?.materialName,
    ]
      .filter(Boolean)
      .join(" ");

    return overlayPattern.test(searchText) || geometryPattern.test(searchText);
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

      const splitPartName = getObjSplitPartName(groupMaterial, mesh, groupIndex);
      const splitMaterial = groupMaterial.clone();
      if (isOverlayLikeSplit(groupMaterial, mesh, splitPartName)) {
        splitMaterial.polygonOffset = true;
        splitMaterial.polygonOffsetFactor = -1;
        splitMaterial.polygonOffsetUnits = -(groupIndex + 1);
        splitMaterial.depthWrite = false;
      }

      const splitMesh = new THREE.Mesh(slicedGeometry, splitMaterial);
      splitMesh.name = splitPartName;
      splitMesh.userData.partName = splitPartName;
      splitMesh.userData.sourceSplitName = splitPartName;
      if (Array.isArray(mesh.userData?.partPathSegments)) {
        splitMesh.userData.partPathSegments = [...mesh.userData.partPathSegments];
      }
      if (mesh.userData?.assemblyKey) {
        splitMesh.userData.assemblyKey = mesh.userData.assemblyKey;
        splitMesh.userData.assemblyLabel = mesh.userData.assemblyLabel;
        splitMesh.userData.assemblyPartNumber = mesh.userData.assemblyPartNumber;
        splitMesh.userData.assemblyOrder = mesh.userData.assemblyOrder;
      }
      if (mesh.userData?.partGroupKey) {
        splitMesh.userData.partGroupKey = mesh.userData.partGroupKey;
      }
      splitMesh.position.copy(mesh.position);
      splitMesh.rotation.copy(mesh.rotation);
      splitMesh.scale.copy(mesh.scale);
      splitMesh.castShadow = mesh.castShadow;
      splitMesh.receiveShadow = mesh.receiveShadow;
      splitMesh.frustumCulled = mesh.frustumCulled;
      if (isOverlayLikeSplit(groupMaterial, mesh, splitPartName)) {
        splitMesh.renderOrder = 10 + groupIndex;
      }
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
    meshBelongsToAssembly,
    applyPartState,
    refreshPartStates,
    clearInteractionState,
    registerMesh,
    hidePart,
    showAllParts,
    selectMesh,
    selectMeshWithinPartIsolation,
    selectMeshWithinAssemblyIsolation,
    selectAssembly,
    clearIsolation,
    splitObjectByMaterialGroups,
  };
}
