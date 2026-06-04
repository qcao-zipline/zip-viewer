const LOAD_LOG_PREFIX = "[ZipView]";

const assetBufferCache = new Map();
const assetRequestCache = new Map();

export function getFileExtension(fileName) {
  const match = fileName.toLowerCase().match(/\.([^.]+)$/);
  return match ? match[1] : "";
}

export function getAssetDisplayName(assetPath) {
  if (!assetPath) {
    return "model";
  }

  const pathname = new URL(assetPath, window.location.href).pathname;
  const fileName = pathname.split("/").pop() || "model";
  return decodeURIComponent(fileName);
}

export function getAssetBaseUrl(assetPath) {
  return new URL(".", new URL(assetPath, window.location.href)).href;
}

export function getExtensionFromAssetPath(assetPath) {
  const pathname = new URL(assetPath, window.location.href).pathname;
  return getFileExtension(pathname);
}

export async function fetchAssetBuffer(assetPath) {
  if (!assetPath) {
    throw new Error("Missing model asset path.");
  }

  if (assetBufferCache.has(assetPath)) {
    return assetBufferCache.get(assetPath);
  }

  if (assetRequestCache.has(assetPath)) {
    return assetRequestCache.get(assetPath);
  }

  const request = (async () => {
    const response = await fetch(assetPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${assetPath} (${response.status}).`);
    }

    const buffer = await response.arrayBuffer();
    assetBufferCache.set(assetPath, buffer);
    return buffer;
  })();

  assetRequestCache.set(assetPath, request);

  try {
    return await request;
  } finally {
    assetRequestCache.delete(assetPath);
  }
}

export async function fetchAssetText(assetPath) {
  if (!assetPath) {
    throw new Error("Missing asset path.");
  }

  const response = await fetch(assetPath);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${assetPath} (${response.status}).`);
  }

  return response.text();
}

export function warmAssetBuffer(assetPath) {
  if (!assetPath) {
    return;
  }

  fetchAssetBuffer(assetPath).catch((error) => {
    console.warn(`${LOAD_LOG_PREFIX} Warm fetch failed for ${assetPath}`, error);
  });
}

export function getSiblingAssetPath(assetPath, extension) {
  const url = new URL(assetPath, window.location.href);
  url.pathname = url.pathname.replace(/\.[^.]+$/, `.${extension}`);
  return url.toString();
}

export function extractObjMaterialLibraryName(objText) {
  const match = objText.match(/^\s*mtllib\s+(.+)$/m);
  return match ? match[1].trim() : "";
}
