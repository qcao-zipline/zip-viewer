import { viewerState } from "./state.js";

export function createBomController({ elements, getPartName, onSelectMesh, onFocusMesh }) {
  const { bomPanel, bomMenuButton, bomSearch, bomList, bomEmpty } = elements;

  function applyBomPanelState() {
    if (!bomPanel || !bomMenuButton) {
      return;
    }

    bomPanel.hidden = !viewerState.currentObject;
    bomPanel.classList.toggle("is-hidden", !viewerState.bomOpen);
    bomMenuButton.hidden = !viewerState.currentObject;
    bomMenuButton.setAttribute("aria-pressed", String(viewerState.bomOpen));
    bomMenuButton.setAttribute(
      "aria-label",
      viewerState.bomOpen ? "Hide BOM sidebar" : "Show BOM sidebar",
    );
  }

  function toggleBomPanel() {
    if (!viewerState.currentObject) {
      return;
    }

    viewerState.bomOpen = !viewerState.bomOpen;
    applyBomPanelState();
  }

  function createBomItem(mesh) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bom-item";
    button.setAttribute("role", "option");
    button.classList.toggle("is-active", viewerState.isolatedMesh === mesh);

    const index = document.createElement("span");
    index.className = "bom-item-index";
    index.textContent = String(mesh.userData.bomIndex || "");

    const name = document.createElement("span");
    name.className = "bom-item-name";
    name.textContent = getPartName(mesh);

    button.appendChild(index);
    button.appendChild(name);

    button.addEventListener("click", () => {
      onSelectMesh(mesh, { isolate: true });
      onFocusMesh(mesh);
    });

    return button;
  }

  function renderBomList() {
    if (!bomList || !bomEmpty) {
      return;
    }

    const query = (bomSearch?.value || "").trim().toLowerCase();
    const visibleMeshes = viewerState.meshes.filter((mesh) => !mesh.userData.isHidden);
    const filteredMeshes = visibleMeshes.filter((mesh) =>
      getPartName(mesh).toLowerCase().includes(query),
    );

    bomList.innerHTML = "";
    bomEmpty.hidden = filteredMeshes.length > 0;

    for (const mesh of filteredMeshes) {
      bomList.appendChild(createBomItem(mesh));
    }
  }

  function scheduleBomRender() {
    if (viewerState.pendingBomRenderFrame) {
      cancelAnimationFrame(viewerState.pendingBomRenderFrame);
    }

    viewerState.pendingBomRenderFrame = requestAnimationFrame(() => {
      viewerState.pendingBomRenderFrame = 0;
      renderBomList();
    });
  }

  function bindEvents() {
    bomSearch?.addEventListener("input", () => {
      renderBomList();
    });

    bomMenuButton?.addEventListener("click", () => {
      toggleBomPanel();
    });
  }

  return {
    applyBomPanelState,
    toggleBomPanel,
    renderBomList,
    scheduleBomRender,
    bindEvents,
  };
}
