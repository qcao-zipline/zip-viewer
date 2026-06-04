import * as THREE from "https://esm.sh/three@0.161.0";

export function disposeMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }

  material.dispose();
}

export function createMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.05,
    roughness: 0.78,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0,
  });
}

export function getMaterialList(mesh) {
  if (!mesh?.material) {
    return [];
  }

  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

export function resolveImportedColor(sourceColor) {
  if (Array.isArray(sourceColor) && sourceColor.length === 3) {
    const usesByteRange = sourceColor.some((channel) => channel > 1);
    const normalized = usesByteRange
      ? sourceColor.map((channel) => channel / 255)
      : sourceColor;

    return new THREE.Color().setRGB(
      normalized[0],
      normalized[1],
      normalized[2],
      THREE.SRGBColorSpace,
    );
  }

  return null;
}

export function getStablePartColor(name, index) {
  let hash = 0;
  const seed = `${name}:${index}`;

  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const hue = hash % 360;
  const saturation = 0.24 + ((hash >> 3) % 8) * 0.02;
  const lightness = 0.56 + ((hash >> 6) % 6) * 0.02;
  return new THREE.Color().setHSL(hue / 360, saturation, lightness);
}
