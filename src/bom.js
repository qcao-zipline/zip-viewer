import { viewerState } from "./state.js";

export function createBomController({ elements, getPartName, onSelectMesh, onFocusMesh }) {
  const { bomPanel, bomMenuButton, bomSearch, bomList, bomEmpty } = elements;

  function getMeshPathSegments(mesh) {
    if (Array.isArray(mesh?.userData?.partPathSegments) && mesh.userData.partPathSegments.length > 0) {
      return mesh.userData.partPathSegments;
    }

    return getPartName(mesh)
      .split(/\s+/)
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  function createFolderNode(label = "", key = "") {
    return {
      type: "folder",
      label,
      key,
      children: new Map(),
      meshCount: 0,
    };
  }

  function createLeafNode(label, key, mesh) {
    return {
      type: "leaf",
      label,
      key,
      meshes: [mesh],
      meshCount: 1,
    };
  }

  function insertMeshIntoTree(rootNode, mesh) {
    const segments = getMeshPathSegments(mesh);
    if (segments.length === 0) {
      return;
    }

    let currentNode = rootNode;
    currentNode.meshCount += 1;

    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      const key = segments.slice(0, index + 1).join(" ");

      if (!currentNode.children.has(segment)) {
        currentNode.children.set(segment, createFolderNode(segment, key));
      }

      currentNode = currentNode.children.get(segment);
      currentNode.meshCount += 1;
    }

    const leafLabel = segments.at(-1);
    const leafKey = segments.join(" ");
    const existingLeaf = currentNode.children.get(leafLabel);

    if (existingLeaf?.type === "leaf") {
      existingLeaf.meshes.push(mesh);
      existingLeaf.meshCount += 1;
      return;
    }

    currentNode.children.set(leafLabel, createLeafNode(leafLabel, leafKey, mesh));
  }

  function buildBomTree(meshes) {
    const rootNode = createFolderNode();

    for (const mesh of meshes) {
      insertMeshIntoTree(rootNode, mesh);
    }

    return rootNode;
  }

  function treeContainsMatch(node, query) {
    if (!query) {
      return true;
    }

    if (node.label.toLowerCase().includes(query)) {
      return true;
    }

    if (node.type === "leaf") {
      return node.meshes.some((mesh) => getPartName(mesh).toLowerCase().includes(query));
    }

    for (const childNode of node.children.values()) {
      if (treeContainsMatch(childNode, query)) {
        return true;
      }
    }

    return false;
  }

  function nodeContainsSelectedMesh(node) {
    const targetMesh = viewerState.selectedMesh || viewerState.isolatedMesh;
    if (!targetMesh) {
      return false;
    }

    if (node.type === "leaf") {
      return node.meshes.includes(targetMesh);
    }

    for (const childNode of node.children.values()) {
      if (nodeContainsSelectedMesh(childNode)) {
        return true;
      }
    }

    return false;
  }

  function createCountBadge(value) {
    const badge = document.createElement("span");
    badge.className = "bom-node-count";
    badge.textContent = String(value);
    return badge;
  }

  function createLeafItem(node, depth) {
    const mesh = node.meshes[0];
    if (!mesh) {
      return null;
    }

    const item = document.createElement("li");
    item.className = "bom-tree-item bom-tree-leaf";
    item.style.setProperty("--bom-depth", String(depth));

    const button = document.createElement("button");
    button.type = "button";
    button.className = "bom-leaf-button";
    button.classList.toggle(
      "is-active",
      viewerState.selectedMesh === mesh || viewerState.isolatedMesh === mesh,
    );

    const fileIcon = document.createElement("span");
    fileIcon.className = "bom-file-icon";
    fileIcon.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "bom-leaf-name";
    name.textContent = node.label;

    button.appendChild(fileIcon);
    button.appendChild(name);

    if (node.meshCount > 1) {
      button.appendChild(createCountBadge(node.meshCount));
    }

    button.addEventListener("click", () => {
      onSelectMesh(mesh, { isolate: true });
      onFocusMesh(mesh);
    });

    item.appendChild(button);
    return item;
  }

  function createFolderItem(node, depth, query) {
    const item = document.createElement("li");
    item.className = "bom-tree-item bom-tree-folder";
    item.style.setProperty("--bom-depth", String(depth));

    const details = document.createElement("details");
    details.className = "bom-folder";

    const shouldOpen = query
      ? true
      : viewerState.bomExpandedPaths.has(node.key) || nodeContainsSelectedMesh(node);
    details.open = shouldOpen;

    const summary = document.createElement("summary");
    summary.className = "bom-folder-summary";
    summary.classList.toggle("is-active", nodeContainsSelectedMesh(node));
    summary.setAttribute("aria-expanded", String(shouldOpen));

    const chevron = document.createElement("span");
    chevron.className = "bom-folder-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = ">";

    const folderIcon = document.createElement("span");
    folderIcon.className = "bom-folder-icon";
    folderIcon.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "bom-folder-name";
    name.textContent = node.label;

    summary.appendChild(chevron);
    summary.appendChild(folderIcon);
    summary.appendChild(name);
    summary.appendChild(createCountBadge(node.meshCount));

    details.addEventListener("toggle", () => {
      if (details.open) {
        viewerState.bomExpandedPaths.add(node.key);
      } else {
        viewerState.bomExpandedPaths.delete(node.key);
      }

      summary.setAttribute("aria-expanded", String(details.open));
    });

    const children = document.createElement("ul");
    children.className = "bom-tree-children";

    for (const childNode of node.children.values()) {
      if (!treeContainsMatch(childNode, query)) {
        continue;
      }

      const childItem = childNode.type === "folder"
        ? createFolderItem(childNode, depth + 1, query)
        : createLeafItem(childNode, depth + 1);

      if (childItem) {
        children.appendChild(childItem);
      }
    }

    details.appendChild(summary);
    details.appendChild(children);
    item.appendChild(details);
    return item;
  }

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

  function renderBomList() {
    if (!bomList || !bomEmpty) {
      return;
    }

    const query = (bomSearch?.value || "").trim().toLowerCase();
    const visibleMeshes = viewerState.meshes.filter((mesh) => !mesh.userData.isHidden);
    const treeRoot = buildBomTree(visibleMeshes);

    bomList.innerHTML = "";
    const hasVisibleMatches = Array.from(treeRoot.children.values()).some((childNode) =>
      treeContainsMatch(childNode, query),
    );
    bomEmpty.hidden = hasVisibleMatches;

    if (!hasVisibleMatches) {
      return;
    }

    const rootList = document.createElement("ul");
    rootList.className = "bom-tree-root";
    rootList.setAttribute("role", "tree");

    for (const childNode of treeRoot.children.values()) {
      if (!treeContainsMatch(childNode, query)) {
        continue;
      }

      const childItem = childNode.type === "folder"
        ? createFolderItem(childNode, 0, query)
        : createLeafItem(childNode, 0);

      if (childItem) {
        rootList.appendChild(childItem);
      }
    }

    bomList.appendChild(rootList);
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
