import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  VSMShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  Shape,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import type { MoveSpec } from "@/lib/cube-engine/stickerTurns";
import { CUBE_BODY } from "@/components/scramble/cubeColors";
import { ASSUMED_TURN_FRAMES, CUBIE_LAYOUT, blurTrail, cubieTurns, fillToHex, ghostOpacity, toneColor } from "./layout";
import { layerTilt, type CubeJiggle } from "./jiggle";

export type CubeQuality = "low" | "medium" | "high";

export interface CubeSceneState {
  /** the cube BEFORE `turning` */
  facelets: string;
  turning: { turn: MoveSpec; progress: number } | null;
  /** gyro tilt, a unit quaternion in the viewer frame (x right, y up, z toward the viewer) */
  orientation?: { x: number; y: number; z: number; w: number } | null;
  /** draw the trailing ghosts of a fast turn */
  motionBlur?: boolean;
  /** per sticker (54, facelet order) a CSS colour that replaces its facelet colour (TurnCube's `stickerFills`); undefined keeps the facelet colour */
  stickerFills?: readonly (string | undefined)[];
  /** secondary motion: a wobble of the whole cube (rotation vector, cube frame) and, being present, a slight tilt of the turning layer */
  jiggle?: CubeJiggle | null;
  /** U/F/R... on the six centre stickers */
  faceLetters?: boolean;
}

export interface CubeSceneOptions {
  quality?: CubeQuality;
  /** keep the drawing buffer so the canvas can be read back after the frame (headless use) */
  preserveDrawingBuffer?: boolean;
  /** degrees the fixed camera sits to the right of the cube's front (default 32; negative looks from the left) */
  cameraYaw?: number;
}

/**
 * What each tier costs. A phone GPU cannot afford a soft shadow map, a clearcoat shader and extra motion-blur copies of
 * the cube every frame (that ran at a couple of frames a second), so only "high" (a desktop with room to spare) pays for
 * a shadow map and clearcoat; "low" and "medium" draw the cube with a flat contact shadow and no extra passes.
 * The scene also steps itself down at runtime if frames come slowly (see watchFrameRate).
 */
const QUALITY: Record<CubeQuality, { dpr: number; shadow: number; ghosts: number; clearcoat: boolean }> = {
  low: { dpr: 1.5, shadow: 0, ghosts: 0, clearcoat: false },
  medium: { dpr: 2, shadow: 0, ghosts: 1, clearcoat: false },
  high: { dpr: 2, shadow: 1024, ghosts: 2, clearcoat: true },
};

/** The fixed camera: slightly above and to the right, three faces in view (the twin's rotateX(-24) rotateY(-32)). */
const CAM_PITCH = (24 * Math.PI) / 180;
const DEFAULT_CAM_YAW = 32;
const FIT_RADIUS = 2.7;
/** A canvas this small (CSS px) costs next to nothing to draw at a high pixel ratio, so it gets one: stickers stay crisp in the compact live cube. */
const SMALL_CANVAS_PX = 260;
const SMALL_CANVAS_RATIO = 2.5;
const FLOOR_Y = -2.45;
const FOV = 26;

const BODY = 0.982;
const HALF = BODY / 2;

const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];

function stickerGeometry(fine: boolean): ExtrudeGeometry {
  const size = 0.86;
  const bevel = 0.032;
  const r = 0.2;
  const w = size - bevel * 2;
  const h = w / 2;
  const s = new Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
  s.lineTo(h, h - r);
  s.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-h + r, h);
  s.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-h, -h + r);
  s.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return new ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: fine ? 3 : 2, curveSegments: fine ? 6 : 4 });
}

function contactTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.28)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface CubieObj {
  group: Group;
  stickers: { index: number; mesh: Mesh; material: MeshPhysicalMaterial }[];
  /** ghost copies, one group per trail sample, built on first use */
  ghosts: Group[];
  ghostStickers: { index: number; mesh: Mesh }[][];
}

/** The renderer, scene and 26 cubies for one canvas. Create it in the browser only; call `dispose()` when done. */
export class CubeScene {
  readonly renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.1, 60);
  private cube = new Group();
  private cubies: CubieObj[] = [];
  private disposables: { dispose(): void }[] = [];
  private ghostMats = new Map<string, MeshBasicMaterial>();
  private ghostLevel = new Map<MeshBasicMaterial, number>();
  private bodyGeo: BufferGeometry;
  private stickerGeo: BufferGeometry;
  private bodyMat: MeshPhysicalMaterial;
  private key: DirectionalLight;
  private contact: Mesh | null = null;
  private lastFacelets = "";
  private lastFills: readonly (string | undefined)[] | undefined;
  private letters: Group | null = null;
  private camYaw: number;
  private tiltQ = new Quaternion();
  private wobbleQ = new Quaternion();
  private wobbleAxis = new Vector3();
  private width = 0;
  private height = 0;
  private quality: CubeQuality;
  private disposed = false;
  /** adaptive quality: the pixel-ratio cap and ghost budget now in force, stepped down if frames arrive slowly */
  private ratioCap: number;
  private ghostBudget: number;
  private lastDpr = 1;
  private lastFrameAt = 0;
  private frameEma = 0;
  private frameSamples = 0;

  constructor(canvas: HTMLCanvasElement, opts: CubeSceneOptions = {}) {
    this.quality = opts.quality ?? "high";
    const q = QUALITY[this.quality];
    this.ratioCap = q.dpr;
    this.ghostBudget = q.ghosts;
    this.camYaw = ((opts.cameraYaw ?? DEFAULT_CAM_YAW) * Math.PI) / 180;
    const renderer = new WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
    this.renderer = renderer;
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = q.shadow > 0;
    renderer.shadowMap.type = VSMShadowMap;

    // Studio: a procedural room for reflections and soft fill, one key light for the shadows.
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envTarget = pmrem.fromScene(room, 0.03);
    this.scene.environment = envTarget.texture;
    this.scene.environmentIntensity = 0.38;
    room.dispose();
    pmrem.dispose();
    this.disposables.push(envTarget);

    this.scene.add(new AmbientLight(0xffffff, 0.12));
    const key = new DirectionalLight(0xfff6ea, 2.6);
    key.position.set(-1.5, 14, 3);
    key.castShadow = q.shadow > 0;
    if (q.shadow > 0) key.shadow.mapSize.set(q.shadow, q.shadow);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -9;
    sc.right = sc.top = 9;
    sc.near = 1;
    sc.far = 30;
    key.shadow.radius = 5;
    key.shadow.blurSamples = 8;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    this.key = key;
    const fill = new DirectionalLight(0xeaf2ff, 1.0);
    fill.position.set(6, 2.5, 5);
    this.scene.add(fill);
    this.scene.add(key);

    // Shadow-only ground, so the stage behind the canvas shows through (only when there is a shadow map to receive).
    if (q.shadow > 0) {
      const ground = new Mesh(new PlaneGeometry(30, 30), new ShadowMaterial({ opacity: 0.18 }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = FLOOR_Y;
      ground.receiveShadow = true;
      this.scene.add(ground);
      this.disposables.push(ground.geometry, ground.material as ShadowMaterial);
    }
    const tex = contactTexture();
    if (tex) {
      const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
      const blob = new Mesh(new PlaneGeometry(4.8, 4.8), mat);
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = FLOOR_Y + 0.004;
      blob.renderOrder = -1;
      this.contact = blob;
      this.scene.add(blob);
      this.disposables.push(tex, mat, blob.geometry);
    }

    // Cubies.
    this.bodyGeo = new RoundedBoxGeometry(BODY, BODY, BODY, q.clearcoat ? 4 : 3, 0.11);
    this.stickerGeo = stickerGeometry(q.clearcoat);
    this.disposables.push(this.bodyGeo, this.stickerGeo);
    this.bodyMat = new MeshPhysicalMaterial({ color: new Color(CUBE_BODY).multiplyScalar(1.3), roughness: q.clearcoat ? 0.38 : 0.3, metalness: 0, clearcoat: q.clearcoat ? 0.7 : 0, clearcoatRoughness: 0.18, envMapIntensity: 0.8 });
    this.disposables.push(this.bodyMat);
    const core = new Mesh(new BoxGeometry(2, 2, 2), new MeshPhysicalMaterial({ color: 0x050507, roughness: 0.8 }));
    this.cube.add(core);
    this.disposables.push(core.geometry, core.material as MeshPhysicalMaterial);
    for (const c of CUBIE_LAYOUT) {
      const group = new Group();
      group.position.set(...c.pos);
      const body = new Mesh(this.bodyGeo, this.bodyMat);
      body.castShadow = q.shadow > 0;
      body.receiveShadow = q.shadow > 0;
      group.add(body);
      const stickers: CubieObj["stickers"] = [];
      for (const s of c.stickers) {
        const material = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, specularIntensity: 0.3, clearcoat: 0, ...(q.clearcoat ? { sheen: 0.08, sheenRoughness: 0.6, sheenColor: new Color(0xffffff) } : {}), envMapIntensity: 1 });
        const mesh = new Mesh(this.stickerGeo, material);
        const n = new Vector3(...s.normal);
        mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
        mesh.position.copy(n).multiplyScalar(HALF - 0.004);
        mesh.receiveShadow = q.shadow > 0;
        group.add(mesh);
        stickers.push({ index: s.index, mesh, material });
        this.disposables.push(material);
      }
      this.cube.add(group);
      this.cubies.push({ group, stickers, ghosts: [], ghostStickers: [] });
    }
    this.scene.add(this.cube);
  }

  /** Size in CSS pixels; the drawing buffer is that times the device pixel ratio (capped by quality). */
  resize(w: number, h: number, dpr: number): void {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    this.lastDpr = dpr;
    this.width = w;
    this.height = h;
    this.applyRatio();
    this.placeCamera();
  }

  /** Move the fixed camera to the other side of the cube (degrees to the right of the front; negative is left). */
  setCameraYaw(deg: number): void {
    const next = (deg * Math.PI) / 180;
    if (next === this.camYaw) return;
    this.camYaw = next;
    if (this.width) this.placeCamera();
  }

  private applyRatio(): void {
    const small = Math.max(this.width, this.height) <= SMALL_CANVAS_PX;
    const cap = small ? Math.max(this.ratioCap, SMALL_CANVAS_RATIO) : this.ratioCap;
    this.renderer.setPixelRatio(Math.max(1, Math.min(this.lastDpr, cap)));
    this.renderer.setSize(this.width, this.height, false);
  }

  private placeCamera(): void {
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;
    // fit the cube's bounding sphere in the narrower dimension
    const half = (FOV * Math.PI) / 360;
    const fitHalf = aspect >= 1 ? half : Math.atan(Math.tan(half) * aspect);
    const dist = (FIT_RADIUS * 1.06) / Math.sin(fitHalf);
    this.camera.position.set(Math.sin(this.camYaw) * Math.cos(CAM_PITCH), Math.sin(CAM_PITCH), Math.cos(this.camYaw) * Math.cos(CAM_PITCH)).multiplyScalar(dist);
    this.camera.lookAt(0, -0.3, 0);
    this.camera.updateProjectionMatrix();
  }

  private ghostMaterial(letter: string, level: number): MeshBasicMaterial {
    const k = `${letter}${level}`;
    let m = this.ghostMats.get(k);
    if (!m) {
      const [r, g, b] = letter === "body" ? [0.04, 0.04, 0.05] : toneColor(FACELET_COLORS[letter] ?? "#888888", 0);
      m = new MeshBasicMaterial({ color: new Color().setRGB(r, g, b, SRGBColorSpace), transparent: true, opacity: 0, depthWrite: false });
      this.ghostMats.set(k, m);
      this.ghostLevel.set(m, level);
      this.disposables.push(m);
    }
    return m;
  }

  private ensureGhosts(ci: number, count: number, facelets: string): void {
    const c = this.cubies[ci];
    while (c.ghosts.length < count) {
      const level = c.ghosts.length;
      const g = new Group();
      g.visible = false;
      const body = new Mesh(this.bodyGeo, this.ghostMaterial("body", level));
      g.add(body);
      const sts: { index: number; mesh: Mesh }[] = [];
      for (const s of c.stickers) {
        const mesh = new Mesh(this.stickerGeo, this.ghostMaterial(facelets[s.index], level));
        mesh.position.copy(s.mesh.position);
        mesh.quaternion.copy(s.mesh.quaternion);
        g.add(mesh);
        sts.push({ index: s.index, mesh });
      }
      c.ghostStickers.push(sts);
      c.ghosts.push(g);
      this.cube.add(g);
    }
  }

  private setFacelets(facelets: string, fills?: readonly (string | undefined)[]): void {
    if (facelets === this.lastFacelets && fills === this.lastFills) return;
    this.lastFacelets = facelets;
    this.lastFills = fills;
    for (const c of this.cubies) {
      for (const s of c.stickers) {
        const [r, g, b] = toneColor(fillToHex(fills?.[s.index]) ?? FACELET_COLORS[facelets[s.index]] ?? "#555555", s.index);
        s.material.color.setRGB(r, g, b, SRGBColorSpace);
      }
      c.ghostStickers.forEach((sts, level) => {
        for (const s of sts) s.mesh.material = this.ghostMaterial(facelets[s.index], level);
      });
    }
  }

  /** The six face letters on the centre stickers, built the first time they are asked for. Part of the cube group, so they tilt and wobble with it. */
  private setFaceLetters(on: boolean): void {
    if (!on && !this.letters) return;
    if (!this.letters) {
      const group = new Group();
      const basis = new Matrix4();
      // face: outward normal and the direction the letter's top points in the yellow-up grip the cube is shown in (so it reads upright there)
      const FACES: [string, [number, number, number], [number, number, number], "dark" | "light"][] = [
        ["F", [0, 0, 1], [0, -1, 0], "light"],
        ["B", [0, 0, -1], [0, -1, 0], "light"],
        ["R", [1, 0, 0], [0, -1, 0], "light"],
        ["L", [-1, 0, 0], [0, -1, 0], "dark"],
        ["U", [0, 1, 0], [0, 0, 1], "dark"],
        ["D", [0, -1, 0], [0, 0, -1], "dark"],
      ];
      const geo = new PlaneGeometry(0.62, 0.62);
      this.disposables.push(geo);
      for (const [letter, n, up, ink] of FACES) {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const g = c.getContext("2d");
        if (!g) continue;
        g.font = "700 84px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = ink === "dark" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.85)";
        g.fillText(letter, 64, 68);
        const tex = new CanvasTexture(c);
        tex.colorSpace = SRGBColorSpace;
        const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
        const mesh = new Mesh(geo, mat);
        const nv = new Vector3(...n);
        const uv = new Vector3(...up);
        basis.makeBasis(new Vector3().crossVectors(uv, nv), uv, nv);
        mesh.quaternion.setFromRotationMatrix(basis);
        mesh.position.copy(nv).multiplyScalar(HALF + 0.03);
        mesh.renderOrder = 2;
        group.add(mesh);
        this.disposables.push(tex, mat);
      }
      this.letters = group;
      this.cube.add(group);
    }
    this.letters.visible = on;
  }

  /**
   * Watches how often frames really arrive while a turn is playing and steps the cost down if they are slow: first the
   * motion-blur copies, then the pixel ratio (never below 1). A phone that cannot keep up gets a cheaper picture
   * instead of a slideshow. Never steps back up, so it does not flap.
   */
  private watchFrameRate(turning: boolean): void {
    const now = performance.now();
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (!turning || dt > 250 || dt <= 0) return;
    this.frameEma = this.frameSamples === 0 ? dt : this.frameEma * 0.85 + dt * 0.15;
    if (++this.frameSamples < 8 || this.frameEma < 26) return;
    this.frameSamples = 0;
    if (this.ghostBudget > 0) this.ghostBudget = 0;
    else if (this.ratioCap > 1) {
      this.ratioCap = Math.max(1, this.ratioCap * 0.75);
      this.applyRatio();
    }
  }

  /** Apply a state and draw one frame. */
  render(state: CubeSceneState): void {
    if (this.disposed || !this.width) return;
    this.setFacelets(state.facelets.length === 54 ? state.facelets : this.lastFacelets || state.facelets, state.stickerFills);
    this.setFaceLetters(!!state.faceLetters);
    const o = state.orientation;
    if (o) this.cube.quaternion.set(o.x, o.y, o.z, o.w).normalize();
    else this.cube.quaternion.identity();
    // Secondary motion: the whole cube rocks a little after a turn lands (a rotation vector in the cube's own frame).
    const jig = state.jiggle ?? null;
    if (jig) {
      const [wx, wy, wz] = jig.wobble;
      const mag = Math.hypot(wx, wy, wz);
      if (mag > 1e-7) this.cube.quaternion.multiply(this.wobbleQ.setFromAxisAngle(this.wobbleAxis.set(wx / mag, wy / mag, wz / mag), mag));
    }
    const tilt = jig && state.turning ? layerTilt(state.turning.turn, state.turning.progress) : null;
    if (tilt) this.tiltQ.setFromAxisAngle(AXES[tilt.axis], tilt.angle);

    const turns = cubieTurns(state.turning?.turn ?? null, state.turning?.progress ?? 0);
    const ghosts = state.motionBlur ? this.ghostBudget : 0;
    this.watchFrameRate(!!state.turning);
    const q = new Quaternion();
    const axes = AXES;
    const place = (g: Group, ci: number, angle: number, axis: 0 | 1 | 2, tilted = false) => {
      q.setFromAxisAngle(axes[axis], angle);
      if (tilted && tilt) q.premultiply(this.tiltQ);
      g.position.set(...CUBIE_LAYOUT[ci].pos).applyQuaternion(q);
      g.quaternion.copy(q);
    };
    let ghostOp: number[] = [];
    this.cubies.forEach((c, ci) => {
      const t = turns[ci];
      if (t) place(c.group, ci, t.angle, t.axis, true);
      else {
        c.group.position.set(...CUBIE_LAYOUT[ci].pos);
        c.group.quaternion.identity();
      }
      // Speed in radians per frame, estimated from the eased slope (a turn takes about ASSUMED_TURN_FRAMES frames).
      const speed = t ? t.slope / ASSUMED_TURN_FRAMES : 0;
      const trail = t && ghosts ? blurTrail(t.angle, speed, ghosts) : [];
      if (trail.length) this.ensureGhosts(ci, ghosts, this.lastFacelets);
      c.ghosts.forEach((g, i) => {
        const a = trail[i];
        g.visible = a !== undefined;
        if (a === undefined || !t) return;
        place(g, ci, a, t.axis);
      });
      if (trail.length) ghostOp = trail.map((_, i) => ghostOpacity(i, ghosts, speed));
    });
    this.ghostLevel.forEach((level, m) => (m.opacity = ghostOp[level] ?? 0));
    this.key.target.position.set(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /** The renderer's canvas lost its context; nothing to do here, three.js restores its own state on `webglcontextrestored`. */
  forceRestore(): void {
    this.lastFacelets = "";
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        // already gone
      }
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
