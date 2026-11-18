import * as THREE from 'three';

// The 3D view of a race: the scene, its camera, lights and the renderer drawing into the page
export class RaceScene {
  constructor(container, map) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(this.ambientLight);

    this.sunlight = new THREE.DirectionalLight(0xffffff, 2);
    this.sunlight.position.set(5, 10, 5);
    this.scene.add(this.sunlight);

    if (map.lighting) this.#applyMapLighting(map.lighting);
  }

  // A map with its own sky, fog and sun (shared/maps.js)
  #applyMapLighting(light) {
    const { scene, camera, renderer, sunlight } = this;
    scene.background = new THREE.Color(light.background);
    scene.fog = new THREE.Fog(light.fogColor, light.fogNear, light.fogFar);
    camera.far = 2200;
    camera.updateProjectionMatrix();
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = light.exposure;
    scene.remove(this.ambientLight);
    scene.add(new THREE.HemisphereLight(light.hemisphereSky, light.hemisphereGround, light.hemisphereIntensity));
    sunlight.color.set(light.sunColor);
    sunlight.intensity = light.sunIntensity;
    sunlight.position.fromArray(light.sunDirection).multiplyScalar(250);
  }

  // A generated world brings its own lights and sky: take the default ones away and see further
  removeDefaultLights() {
    this.scene.remove(this.ambientLight, this.sunlight);
    this.camera.far = 20000;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    const canvas = this.renderer.domElement;
    if (canvas.parentNode === this.container) this.container.removeChild(canvas);
    this.renderer.dispose();
  }
}
