declare module "three/examples/jsm/controls/OrbitControls" {
  import { Camera, EventDispatcher, MOUSE, TOUCH, Vector2, Vector3, Vector4 } from "three";
  export class OrbitControls extends EventDispatcher {
    constructor(object: Camera, domElement?: HTMLElement);

    mouseButtons: { LEFT: MOUSE; MIDDLE: MOUSE; RIGHT: MOUSE };
    touches: { ONE: TOUCH; TWO: TOUCH };

    enabled: boolean;
    target: Vector3;
    minDistance: number;
    maxDistance: number;
    minPolarAngle: number;
    maxPolarAngle: number;
    minAzimuthAngle: number;
    maxAzimuthAngle: number;
    enableDamping: boolean;
    dampingFactor: number;
    enableZoom: boolean;
    zoomSpeed: number;
    enableRotate: boolean;
    rotateSpeed: number;
    enablePan: boolean;
    panSpeed: number;
    screenSpacePanning: boolean;
    keyPanSpeed: number;
    autoRotate: boolean;
    autoRotateSpeed: number;
    enableKeys: boolean;
    keys: { LEFT: number; UP: number; RIGHT: number; BOTTOM: number };
    mouseButtonsD: { LEFT: number; MIDDLE: number; RIGHT: number };

    update(): boolean;
    dispose(): void;
    saveState(): void;
    reset(): void;

    getPolarAngle(): number;
    getAzimuthalAngle(): number;
  }
}

declare module "three/examples/jsm/postprocessing/EffectComposer" {
  import { WebGLRenderer, Scene, Camera } from "three";
  export class EffectComposer {
    constructor(renderer: WebGLRenderer);

    addPass(pass: any): void;
    insertPass(pass: any, index: number): void;
    render(delta?: number): void;
    reset(): void;
    setSize(width: number, height: number): void;

    swapBuffers(): void;

    readBuffer: any;
    writeBuffer: any;
    passes: any[];
  }
}

declare module "three/examples/jsm/postprocessing/RenderPass" {
  import { Scene, Camera } from "three";
  export class RenderPass {
    constructor(scene: Scene, camera: Camera);

    clear: boolean;
    clearDepth: boolean;
  }
}

declare module "three/examples/jsm/postprocessing/UnrealBloomPass" {
  import { Vector2 } from "three";
  export class UnrealBloomPass {
    constructor(resolution: Vector2, strength?: number, radius?: number, threshold?: number);

    strength: number;
    radius: number;
    threshold: number;

    setSize(width: number, height: number): void;
  }
}

declare module "three/examples/jsm/postprocessing/FilmPass" {
  export class FilmPass {
    constructor(noiseIntensity: number, scanlinesIntensity: number, scanlinesCount: number, grayscale: boolean);

    uniforms: any;
    render(): void;
  }
}

declare module "three/examples/jsm/postprocessing/OutputPass" {
  export class OutputPass {
    constructor();

    render(): void;
  }
}
