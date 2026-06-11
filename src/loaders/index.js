import * as THREE from "https://esm.sh/three@0.161.0";
import {
  fetchAssetBuffer,
  fetchAssetText,
  getAssetDisplayName,
  getExtensionFromAssetPath,
  getFileExtension,
} from "../assets.js";
import { loadGlbFromPath } from "./loadGlb.js";
import { loadObjFile } from "./loadObj.js?v=apple-44";
import { loadStepFile } from "./loadStep.js";
import { loadStlFile } from "./loadStl.js";

export function createLoaderController(helpers) {
  async function loadModelFile(file) {
    const extension = getFileExtension(file.name);

    if (extension === "stl") {
      await loadStlFile(file, helpers);
      return;
    }

    if (extension === "obj") {
      await loadObjFile(file, helpers);
      return;
    }

    if (extension === "stp" || extension === "step") {
      await loadStepFile(file, helpers);
      return;
    }

    throw new Error(`Unsupported file type ".${extension || "unknown"}".`);
  }

  async function loadPreferredModel({ modelPath, fallbackModelPath, modelName }) {
    try {
      await loadModelFromPath(modelPath, modelName);
    } catch (error) {
      if (!fallbackModelPath || fallbackModelPath === modelPath) {
        throw error;
      }

      console.warn(
        `${helpers.loadLogPrefix} Falling back from optimized asset to source model`,
        { modelPath, fallbackModelPath, error },
      );
      helpers.setLoadingState(true, "Falling back to source model...");
      await helpers.waitForNextPaint();
      await loadModelFromPath(fallbackModelPath, modelName);
    }
  }

  async function loadModelFromPath(modelPath, modelName = "") {
    const extension = getExtensionFromAssetPath(modelPath);
    const totalStart = performance.now();
    const fetchStart = performance.now();

    if (extension === "glb") {
      const timings = await loadGlbFromPath(modelPath, modelName, helpers);
      helpers.logLoadTimings(modelName, modelPath, timings);
      return;
    }

    if (extension === "obj") {
      const objText = await fetchAssetText(modelPath);
      const fetchMs = performance.now() - fetchStart;
      helpers.setLoadingState(true, "Preparing model...");
      await helpers.waitForNextPaint();

      const parseStart = performance.now();
      const file = new File([objText], getAssetDisplayName(modelPath), {
        type: "text/plain",
      });
      await loadObjFile(file, {
        ...helpers,
        assetPath: modelPath,
      });
      const parseMs = performance.now() - parseStart;

      helpers.setLoadingState(true, "Rendering model...");
      await helpers.waitForNextPaint();
      helpers.logLoadTimings(modelName, modelPath, {
        fetchMs,
        prepareMs: parseMs,
        renderMs: 0,
        totalMs: performance.now() - totalStart,
      });
      return;
    }

    const modelBuffer = await fetchAssetBuffer(modelPath);
    const fetchMs = performance.now() - fetchStart;
    helpers.setLoadingState(true, "Preparing model...");
    await helpers.waitForNextPaint();

    const parseStart = performance.now();
    const file = new File([modelBuffer], getAssetDisplayName(modelPath), {
      type: "application/octet-stream",
    });
    await loadModelFile(file);
    const parseMs = performance.now() - parseStart;

    helpers.setLoadingState(true, "Rendering model...");
    await helpers.waitForNextPaint();
    helpers.logLoadTimings(modelName, modelPath, {
      fetchMs,
      prepareMs: parseMs,
      renderMs: 0,
      totalMs: performance.now() - totalStart,
    });
  }

  return {
    loadModelFile,
    loadModelFromPath,
    loadPreferredModel,
  };
}
