import { getPreferredTheme, viewerState, writeStoredTheme } from "./state.js";

export function createUiController({ elements, applySceneTheme, callbacks }) {
  const {
    modelPicker,
    statusText,
    loadingScreen,
    loadingLabel,
    themeButton,
    transparencyButton,
  } = elements;

  function setStatus(message) {
    if (statusText) {
      statusText.textContent = message;
    }
  }

  function getIdleStatus() {
    return viewerState.currentObject ? "" : "Ready.";
  }

  function setLoadingState(isVisible, message = "Loading model...") {
    if (!loadingScreen || !loadingLabel) {
      return;
    }

    loadingLabel.textContent = message;

    if (isVisible) {
      loadingScreen.classList.remove("is-visible");
      void loadingScreen.offsetWidth;
      loadingScreen.classList.add("is-visible");
      return;
    }

    loadingScreen.classList.remove("is-visible");
  }

  async function completeLoadingState() {
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
    setLoadingState(false);
  }

  function waitForNextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  }

  function showModelPicker() {
    modelPicker.hidden = false;
    viewerState.bomOpen = false;
    setLoadingState(false);
    callbacks.clearModel();
    callbacks.applyBomPanelState();
    setStatus("Choose a model");
  }

  function hideModelPicker() {
    modelPicker.hidden = true;
    callbacks.applyBomPanelState();
  }

  function applyTheme(theme) {
    viewerState.theme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = viewerState.theme;

    if (themeButton) {
      const isDark = viewerState.theme === "dark";
      themeButton.setAttribute("aria-pressed", String(isDark));
      themeButton.textContent = isDark ? "Light" : "Dark";
      themeButton.setAttribute(
        "aria-label",
        isDark ? "Switch to light mode" : "Switch to dark mode",
      );
    }

    applySceneTheme(viewerState.theme);
  }

  function toggleTheme() {
    const nextTheme = viewerState.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    writeStoredTheme(nextTheme);
  }

  function applyTransparencyState() {
    transparencyButton?.setAttribute("aria-pressed", String(viewerState.transparentMode));
    callbacks.refreshPartStates();
  }

  function init() {
    applyTheme(getPreferredTheme());
  }

  return {
    setStatus,
    getIdleStatus,
    setLoadingState,
    completeLoadingState,
    waitForNextPaint,
    showModelPicker,
    hideModelPicker,
    applyTheme,
    toggleTheme,
    applyTransparencyState,
    init,
  };
}
