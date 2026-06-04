import { viewerState } from "./state.js";

export function createInteractionsController({
  canvas,
  partTooltip,
  sceneRuntime,
  partsController,
  cameraController,
  uiController,
}) {
  const { raycaster, pointer, camera, controls, THREE } = sceneRuntime;
  const rightClickState = {
    active: false,
    startX: 0,
    startY: 0,
  };

  function hideTooltip() {
    if (partTooltip) {
      partTooltip.hidden = true;
    }
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
      if (event.button !== 0) {
        return;
      }

      const intersectedMesh = getIntersectedMesh(event);
      partsController.selectMesh(intersectedMesh);

      if (intersectedMesh) {
        showTooltip(intersectedMesh, event.clientX, event.clientY, "Selected");
        return;
      }

      hideTooltip();
    });

    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 2) {
        return;
      }

      rightClickState.active = true;
      rightClickState.startX = event.clientX;
      rightClickState.startY = event.clientY;
    });

    canvas.addEventListener("pointerup", (event) => {
      if (event.button !== 2 || !rightClickState.active) {
        return;
      }

      const movement = Math.hypot(
        event.clientX - rightClickState.startX,
        event.clientY - rightClickState.startY,
      );
      rightClickState.active = false;

      if (movement > 6) {
        return;
      }

      const intersectedMesh = getIntersectedMesh(event);
      if (intersectedMesh) {
        partsController.hidePart(intersectedMesh);
        return;
      }

      partsController.showAllParts();
    });

    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    canvas.addEventListener("pointercancel", () => {
      setManipulatingCursor(false);
    });

    controls.addEventListener("start", () => {
      setManipulatingCursor(true);
    });

    controls.addEventListener("end", () => {
      setManipulatingCursor(false);
    });

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
  }

  return {
    hideTooltip,
    showTooltip,
    getIntersectedMesh,
    bindEvents,
  };
}
