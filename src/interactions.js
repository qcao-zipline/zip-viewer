import { viewerState } from "./state.js";

export function createInteractionsController({
  canvas,
  partTooltip,
  partContextMenu,
  partContextTitle,
  contextIsolateButton,
  contextHideButton,
  sceneRuntime,
  partsController,
  cameraController,
  uiController,
}) {
  const { raycaster, pointer, camera, controls, THREE } = sceneRuntime;
  let contextMenuMesh = null;
  let suppressPrimaryClickUntil = 0;

  function hideTooltip() {
    if (partTooltip) {
      partTooltip.hidden = true;
    }
  }

  function hideContextMenu() {
    if (partContextMenu) {
      partContextMenu.hidden = true;
      partContextMenu.style.left = "0px";
      partContextMenu.style.top = "0px";
    }
    contextMenuMesh = null;
  }

  function showContextMenu(mesh, clientX, clientY) {
    if (!partContextMenu || !partContextTitle || !mesh) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = Math.min(clientX - rect.left + 12, rect.width - 236);
    const y = Math.min(clientY - rect.top + 12, rect.height - 160);

    contextMenuMesh = mesh;
    partContextTitle.textContent = partsController.getPartName(mesh);
    partContextMenu.hidden = false;
    partContextMenu.style.left = `${Math.max(12, x)}px`;
    partContextMenu.style.top = `${Math.max(12, y)}px`;
  }

  function showTooltip(mesh, clientX, clientY, prefix = "") {
    if (!partTooltip || !mesh) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    partTooltip.textContent = prefix
      ? `${prefix}: ${partsController.getPartName(mesh)}`
      : partsController.getPartName(mesh);
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

  function setManipulatingCursor(isManipulating) {
    canvas.classList.toggle("is-manipulating", isManipulating);
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

  function isSecondaryTrigger(event) {
    return event.button === 2 || (event.button === 0 && event.ctrlKey);
  }

  function openPartContextMenu(event) {
    hideContextMenu();
    const intersectedMesh = getIntersectedMesh(event);
    if (!intersectedMesh) {
      hideTooltip();
      return false;
    }

    if (viewerState.isolatedAssemblyKey) {
      partsController.selectMeshWithinAssemblyIsolation(intersectedMesh);
    } else if (viewerState.isolatedPartKey) {
      partsController.selectMeshWithinPartIsolation(intersectedMesh);
    } else {
      partsController.selectMesh(intersectedMesh);
    }

    showTooltip(intersectedMesh, event.clientX, event.clientY, "Selected");
    showContextMenu(intersectedMesh, event.clientX, event.clientY);
    suppressPrimaryClickUntil = performance.now() + 250;
    return true;
  }

  function suppressNextPrimaryClick() {
    suppressPrimaryClickUntil = performance.now() + 250;
  }

  function bindEvents() {
    canvas.addEventListener("pointermove", (event) => {
      const intersectedMesh = getIntersectedMesh(event);

      if (viewerState.hoveredMesh !== intersectedMesh) {
        viewerState.hoveredMesh = intersectedMesh;
        partsController.refreshPartStates();
      }

      if (viewerState.selectedMesh) {
        if (viewerState.selectedMesh === intersectedMesh) {
          showTooltip(viewerState.selectedMesh, event.clientX, event.clientY, "Selected");
        } else {
          hideTooltip();
        }
        uiController.setStatus(`Selected: ${partsController.getPartName(viewerState.selectedMesh)}`);
        return;
      }

      hideTooltip();
      uiController.setStatus(uiController.getIdleStatus());
    });

    canvas.addEventListener("pointerleave", () => {
      viewerState.hoveredMesh = null;
      partsController.refreshPartStates();
      hideTooltip();
      setManipulatingCursor(false);

      if (viewerState.selectedMesh) {
        uiController.setStatus(`Selected: ${partsController.getPartName(viewerState.selectedMesh)}`);
        return;
      }

      uiController.setStatus(uiController.getIdleStatus());
    });

    canvas.addEventListener("click", (event) => {
      if (performance.now() < suppressPrimaryClickUntil) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      hideContextMenu();

      const intersectedMesh = getIntersectedMesh(event);
      if (viewerState.isolatedAssemblyKey) {
        partsController.selectMeshWithinAssemblyIsolation(intersectedMesh);
      } else if (viewerState.isolatedPartKey) {
        partsController.selectMeshWithinPartIsolation(intersectedMesh);
      } else {
        partsController.selectMesh(intersectedMesh);
      }

      if (intersectedMesh) {
        showTooltip(intersectedMesh, event.clientX, event.clientY, "Selected");
        return;
      }

      hideTooltip();
    });

    canvas.addEventListener("pointerdown", (event) => {
      if (!isSecondaryTrigger(event)) {
        return;
      }

      event.preventDefault();
      openPartContextMenu(event);
    });

    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openPartContextMenu(event);
    });

    canvas.addEventListener("pointercancel", () => {
      setManipulatingCursor(false);
      hideContextMenu();
    });

    contextIsolateButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!contextMenuMesh) {
        return;
      }

      suppressNextPrimaryClick();
      partsController.selectMesh(contextMenuMesh, { isolate: true });
      cameraController.focusMesh(contextMenuMesh);
      hideContextMenu();
    });

    contextHideButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!contextMenuMesh) {
        return;
      }

      suppressNextPrimaryClick();
      partsController.hidePart(contextMenuMesh);
      hideContextMenu();
    });

    controls.addEventListener("start", () => {
      hideContextMenu();
      setManipulatingCursor(true);
    });

    controls.addEventListener("end", () => {
      setManipulatingCursor(false);
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideContextMenu();
      }

      if (event.key === "Shift") {
        controls.mouseButtons = {
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: null,
        };
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.key === "Shift") {
        controls.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: null,
        };
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "q" || event.key === "Q") {
        cameraController.rollCamera(Math.PI / 18);
        uiController.setStatus("View rolled left");
      }

      if (event.key === "e" || event.key === "E") {
        cameraController.rollCamera(-Math.PI / 18);
        uiController.setStatus("View rolled right");
      }
    });

    window.addEventListener("resize", () => {
      hideContextMenu();
    });
  }

  return {
    hideTooltip,
    hideContextMenu,
    showTooltip,
    getIntersectedMesh,
    bindEvents,
  };
}
