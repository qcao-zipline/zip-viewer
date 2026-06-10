import { viewerState } from "./state.js";

export function createBomController({ elements, getPartName, onSelectMesh, onFocusMesh }) {
  const { bomPanel, bomMenuButton, bomCollapseButton, bomSearch, bomList, bomEmpty } = elements;

  function getAssemblyGroups(meshes) {
    const groups = new Map();

    for (const mesh of meshes) {
      const assemblyKey = mesh.userData?.assemblyKey;
      const assemblyLabel = mesh.userData?.assemblyLabel;
      const assemblyPartNumber = mesh.userData?.assemblyPartNumber;
      const assemblyOrder = mesh.userData?.assemblyOrder ?? Number.MAX_SAFE_INTEGER;
      if (!assemblyKey || !assemblyLabel) {
        continue;
      }

      if (!groups.has(assemblyKey)) {
        groups.set(assemblyKey, {
          assemblyKey,
          assemblyLabel,
          assemblyPartNumber,
          assemblyOrder,
          meshes: [],
        });
      }

      groups.get(assemblyKey).meshes.push(mesh);
    }

    return Array.from(groups.values()).sort((left, right) => {
      if (left.assemblyOrder !== right.assemblyOrder) {
        return left.assemblyOrder - right.assemblyOrder;
      }

      return left.assemblyLabel.localeCompare(right.assemblyLabel);
    });
  }

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

  function getRelativeAssemblySegments(mesh, assemblyKey) {
    const segments = getMeshPathSegments(mesh);
    if (segments.length === 0) {
      return [];
    }

    if (segments[0] === assemblyKey) {
      return segments.slice(1);
    }

    return segments;
  }

  function buildAssemblyTree(meshes, assemblyKey) {
    const rootNode = createFolderNode();

    for (const mesh of meshes) {
      const segments = getRelativeAssemblySegments(mesh, assemblyKey);
      if (segments.length === 0) {
        const fallbackLabel = getPartName(mesh);
        const existingLeaf = rootNode.children.get(fallbackLabel);
        rootNode.meshCount += 1;

        if (existingLeaf?.type === "leaf") {
          existingLeaf.meshes.push(mesh);
          existingLeaf.meshCount += 1;
          continue;
        }

        rootNode.children.set(fallbackLabel, createLeafNode(fallbackLabel, fallbackLabel, mesh));
        continue;
      }

      let currentNode = rootNode;
      currentNode.meshCount += 1;

      for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        const key = `${assemblyKey} ${segments.slice(0, index + 1).join(" ")}`;

        if (!currentNode.children.has(segment)) {
          currentNode.children.set(segment, createFolderNode(segment, key));
        }

        currentNode = currentNode.children.get(segment);
        currentNode.meshCount += 1;
      }

      const leafLabel = segments.at(-1);
      const leafKey = `${assemblyKey} ${segments.join(" ")}`;
      const existingLeaf = currentNode.children.get(leafLabel);

      if (existingLeaf?.type === "leaf") {
        existingLeaf.meshes.push(mesh);
        existingLeaf.meshCount += 1;
        continue;
      }

      currentNode.children.set(leafLabel, createLeafNode(leafLabel, leafKey, mesh));
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

  function createAssemblyItem(group, query) {
    const item = document.createElement("li");
    item.className = "bom-tree-item bom-tree-assembly";

    const assemblyTree = buildAssemblyTree(group.meshes, group.assemblyKey);
    const hasVisibleChildren = Array.from(assemblyTree.children.values()).some((childNode) =>
      treeContainsMatch(childNode, query),
    );

    const shouldOpen = query
      ? true
      : viewerState.bomExpandedPaths.has(group.assemblyKey);
    const isActive = viewerState.isolatedAssemblyKey === group.assemblyKey;

    const row = document.createElement("div");
    row.className = "bom-assembly-row";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "bom-assembly-toggle";
    toggleButton.classList.toggle("is-open", shouldOpen);
    toggleButton.disabled = !hasVisibleChildren;
    toggleButton.setAttribute("aria-label", shouldOpen ? "Collapse assembly" : "Expand assembly");
    toggleButton.setAttribute("aria-expanded", String(shouldOpen));

    const chevron = document.createElement("span");
    chevron.className = "bom-folder-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = ">";
    toggleButton.appendChild(chevron);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "bom-leaf-button bom-assembly-button";
    button.classList.toggle("is-active", isActive);

    const folderIcon = document.createElement("span");
    folderIcon.className = "bom-folder-icon";
    folderIcon.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "bom-leaf-name bom-assembly-name";
    name.textContent = group.assemblyLabel;

    toggleButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!hasVisibleChildren) {
        return;
      }
      if (viewerState.bomExpandedPaths.has(group.assemblyKey)) {
        viewerState.bomExpandedPaths.delete(group.assemblyKey);
      } else {
        viewerState.bomExpandedPaths.add(group.assemblyKey);
      }
      renderBomList();
    });

    button.appendChild(folderIcon);
    button.appendChild(name);
    button.appendChild(createCountBadge(group.meshes.length));
    button.addEventListener("click", () => {
      onSelectMesh(group.assemblyKey, { isolate: true, mode: "assembly" });
      onFocusMesh(group.meshes);
    });

    row.appendChild(toggleButton);
    row.appendChild(button);
    item.appendChild(row);

    if (hasVisibleChildren) {
      const children = document.createElement("ul");
      children.className = "bom-tree-children bom-assembly-children";
      children.hidden = !shouldOpen;

      for (const childNode of assemblyTree.children.values()) {
        if (!treeContainsMatch(childNode, query)) {
          continue;
        }

        const childItem = childNode.type === "folder"
          ? createFolderItem(childNode, 1, query)
          : createLeafItem(childNode, 1);

        if (childItem) {
          children.appendChild(childItem);
        }
      }

      item.appendChild(children);
    }
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

  function collapseAll() {
    viewerState.bomExpandedPaths = new Set();
    renderBomList();
  }

  function renderBomList() {
    if (!bomList || !bomEmpty) {
      return;
    }

    const query = (bomSearch?.value || "").trim().toLowerCase();
    const visibleMeshes = viewerState.meshes.filter((mesh) => !mesh.userData.isHidden);
    const assemblyGroups = getAssemblyGroups(visibleMeshes);

    bomList.innerHTML = "";

    if (assemblyGroups.length > 0) {
      const filteredAssemblies = assemblyGroups.filter((group) =>
        group.assemblyLabel.toLowerCase().includes(query) ||
        group.assemblyKey.toLowerCase().includes(query) ||
        group.assemblyPartNumber?.toLowerCase().includes(query) ||
        Array.from(buildAssemblyTree(group.meshes, group.assemblyKey).children.values()).some((childNode) =>
          treeContainsMatch(childNode, query),
        ),
      );
      bomEmpty.hidden = filteredAssemblies.length > 0;

      const assemblyList = document.createElement("ul");
      assemblyList.className = "bom-tree-root";

      for (const group of filteredAssemblies) {
        const item = createAssemblyItem(group, query);
        assemblyList.appendChild(item);
      }

      bomList.appendChild(assemblyList);

      return;
    }

    const treeRoot = buildBomTree(visibleMeshes);
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

    bomCollapseButton?.addEventListener("click", () => {
      collapseAll();
    });
  }

  return {
    applyBomPanelState,
    toggleBomPanel,
    collapseAll,
    renderBomList,
    scheduleBomRender,
    bindEvents,
  };
}
