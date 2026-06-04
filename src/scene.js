import * as THREE from "https://esm.sh/three@0.161.0";
import { OrbitControls } from "https://esm.sh/three@0.161.0/examples/jsm/controls/OrbitControls.js";

export function createSceneRuntime(canvas) {
  const defaultCameraPosition = new THREE.Vector3(260, -260, 180);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe1e6ee);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200000);
  camera.position.copy(defaultCameraPosition);
  camera.up.set(0, 0, 1);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.target.set(0, 0, 0);
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN,
  };

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb7c0cb, 0.8);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(320, -240, 420);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xd9e1ea, 0.45);
  fillLight.position.set(-280, 200, 180);
  scene.add(fillLight);

  const grid = new THREE.GridHelper(2000, 80, 0xcfd7df, 0xe2e8ef);
  grid.rotation.x = Math.PI / 2;
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  for (const material of gridMaterials) {
    material.transparent = true;
    material.opacity = 0.72;
    material.depthWrite = false;
  }
  scene.add(grid);

  const rootGroup = new THREE.Group();
  scene.add(rootGroup);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function updateRendererSize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function renderFrame() {
    controls.update();
    renderer.render(scene, camera);
  }

  return {
    THREE,
    defaultCameraPosition,
    renderer,
    scene,
    camera,
    controls,
    ambientLight,
    hemiLight,
    keyLight,
    fillLight,
    gridMaterials,
    rootGroup,
    raycaster,
    pointer,
    updateRendererSize,
    renderFrame,
  };
}

export function applySceneTheme(runtime, theme) {
  const {
    scene,
    ambientLight,
    hemiLight,
    fillLight,
    keyLight,
    gridMaterials,
    THREE,
  } = runtime;

  if (theme === "dark") {
    scene.background = new THREE.Color(0x081018);
    const darkGridPalette = [0x304254, 0x1b2736];
    gridMaterials.forEach((material, index) => {
      material.color.setHex(darkGridPalette[index] ?? darkGridPalette[0]);
      material.opacity = 0.46;
    });
    hemiLight.color.setHex(0xc7dbff);
    hemiLight.groundColor.setHex(0x0d1724);
    ambientLight.intensity = 0.92;
    fillLight.intensity = 0.52;
    keyLight.intensity = 1.15;
    return;
  }

  scene.background = new THREE.Color(0xe1e6ee);
  const lightGridPalette = [0xcfd7df, 0xe2e8ef];
  gridMaterials.forEach((material, index) => {
    material.color.setHex(lightGridPalette[index] ?? lightGridPalette[0]);
    material.opacity = 0.72;
  });
  hemiLight.color.setHex(0xffffff);
  hemiLight.groundColor.setHex(0xb7c0cb);
  ambientLight.intensity = 1.15;
  fillLight.intensity = 0.45;
  keyLight.intensity = 1.2;
}
