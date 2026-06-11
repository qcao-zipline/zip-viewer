const LOAD_LOG_PREFIX = "[ZipView]";
const THEME_STORAGE_KEY = "zip-viewer-theme";

export const viewerState = {
  currentObject: null,
  currentBounds: null,
  meshes: [],
  edgeLines: [],
  transparentMode: false,
  occt: null,
  hoveredMesh: null,
  selectedMesh: null,
  isolatedMesh: null,
  isolatedPartKey: null,
  isolatedAssemblyKey: null,
  currentModelPath: null,
  currentFallbackModelPath: null,
  currentModelName: null,
  currentView: "home",
  pendingBomRenderFrame: 0,
  theme: "dark",
  bomOpen: false,
  bomExpandedPaths: new Set(),
};

export function readStoredTheme() {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === "dark" || savedTheme === "light" ? savedTheme : null;
  } catch (error) {
    console.warn(`${LOAD_LOG_PREFIX} Theme preference could not be read`, error);
    return null;
  }
}

export function writeStoredTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn(`${LOAD_LOG_PREFIX} Theme preference could not be saved`, error);
  }
}

export function getPreferredTheme() {
  const savedTheme = readStoredTheme();
  if (savedTheme) {
    return savedTheme;
  }

  return "dark";
}
