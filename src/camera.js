import * as THREE from "https://esm.sh/three@0.161.0";

export function createCameraController(runtime, { getCurrentBounds }) {
  const { camera, controls, defaultCameraPosition } = runtime;

  function fitCameraToBounds(bounds) {
    if (!bounds || bounds.isEmpty()) {
      return;
    }

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    const fitHeightDistance = maxSize / (2 * Math.tan((Math.PI * camera.fov) / 360));
    const fitWidthDistance = fitHeightDistance / camera.aspect;
    const distance = 1.4 * Math.max(fitHeightDistance, fitWidthDistance);
    const direction = new THREE.Vector3(1, -1, 0.75).normalize();

    controls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    camera.near = Math.max(distance / 2000, 0.1);
    camera.far = Math.max(distance * 40, 20000);
    camera.updateProjectionMatrix();
    controls.update();
  }

  function focusMesh(mesh) {
    if (!mesh) {
      return;
    }

    const bounds = new THREE.Box3().setFromObject(mesh);
    if (!bounds.isEmpty()) {
      fitCameraToBounds(bounds);
    }
  }

  function rollCamera(angleRadians) {
    const viewDirection = new THREE.Vector3()
      .subVectors(controls.target, camera.position)
      .normalize();

    if (viewDirection.lengthSq() === 0) {
      return;
    }

    const rotation = new THREE.Quaternion().setFromAxisAngle(viewDirection, angleRadians);
    camera.up.applyQuaternion(rotation).normalize();
    controls.update();
  }

  function groundObjectToGrid(object, bounds) {
    if (!object || !bounds || bounds.isEmpty()) {
      return bounds;
    }

    if (bounds.min.z <= 0) {
      return bounds;
    }

    const zOffset = -bounds.min.z;
    object.position.z += zOffset;
    return bounds.clone().translate(new THREE.Vector3(0, 0, zOffset));
  }

  function resetCamera() {
    const currentBounds = getCurrentBounds();
    if (currentBounds) {
      fitCameraToBounds(currentBounds);
      return;
    }

    camera.position.copy(defaultCameraPosition);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  return {
    fitCameraToBounds,
    focusMesh,
    rollCamera,
    groundObjectToGrid,
    resetCamera,
  };
}
