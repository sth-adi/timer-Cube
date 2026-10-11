import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DirectionalLight,
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
  RepeatWrapping,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { FACELET_COLORS } from "@/lib/cube-engine/facelets";
import type { MoveSpec } from "@/lib/cube-engine/stickerTurns";
import { CUBE_BODY } from "@/components/scramble/cubeColors";
import { CUBIE_LAYOUT, blurTrail, cubieTurns, fillToHex, ghostOpacity, stickerJitter, toneColor, turnSpeedPerFrame } from "./layout";
import { layerTilt, rattleOffset, type CubeJiggle } from "./jiggle";
import { DEFAULT_LOOK, schemeColors, type CubeLook, type Emblem } from "./look";
import { BODY_SPECS, STICKER_SPECS, WEAR_SPECS, glyphIndex, hexToRgb, studioLight, styleColor, type PlateKind } from "./lookStyle";
import { arrowMesh, arrowSpec } from "./arrow";
import { PLATE_SPECS, buildPillow } from "./sticker";
import { fitDistance } from "./framing";

export type CubeQuality = "low" | "medium" | "high";

export interface CubeSceneState {
  /** the cube BEFORE `turning` */
  facelets: string;
  turning: { turn: MoveSpec; progress: number; /** how long this turn takes on screen (ms); sizes the motion blur, which assumes a mid-speed turn without it */ turnMs?: number } | null;
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
  /** how the cube is dressed (sticker style and body colour); changing it swaps materials without rebuilding the scene */
  look?: CubeLook;
  /** whole-cube alpha 0..1 (a ghost cube); materials only turn transparent below 1 */
  opacity?: number;
  /** the upcoming move ("R", "U'", "F2", "M"...): a curved arrow hovers over the layer it turns; null or a rotation hides it */
  nextMove?: string | null;
  /** facelet indices that glow, `strength` 0..1 (pieces lighting up as they are solved) */
  highlight?: { stickers: readonly number[]; strength: number } | null;
}

export interface CubeSceneOptions {
  quality?: CubeQuality;
  /** keep the drawing buffer so the canvas can be read back after the frame (headless use) */
  preserveDrawingBuffer?: boolean;
  /** degrees the fixed camera sits to the right of the cube's front (default 32; negative looks from the left) */
  cameraYaw?: number;
  /** "tight" (default) frames the cube close for a fixed or lightly tilted grip; "loose" leaves room for a cube spun to any grip (the gyro twin) */
  fit?: "tight" | "loose";
  /** draw the faint floor reflection where the tier allows it (default true); the reel video turns it off so it never reaches the text below the cube */
  reflection?: boolean;
}

/**
 * What each tier costs. A phone GPU cannot afford a soft shadow map, a clearcoat shader and extra motion-blur copies of
 * the cube every frame (that ran at a couple of frames a second), so only "high" (a desktop with room to spare) pays for
 * a shadow map and clearcoat; "low" and "medium" draw the cube with a flat contact shadow and no extra passes.
 * The scene also steps itself down at runtime if frames come slowly (see watchFrameRate).
 */
const QUALITY: Record<CubeQuality, { dpr: number; shadow: number; ghosts: number; clearcoat: boolean; fine: boolean; reflect: boolean; rim: boolean }> = {
  low: { dpr: 1.5, shadow: 0, ghosts: 0, clearcoat: false, fine: false, reflect: false, rim: false },
  medium: { dpr: 2, shadow: 0, ghosts: 1, clearcoat: false, fine: false, reflect: true, rim: true },
  high: { dpr: 2, shadow: 1024, ghosts: 2, clearcoat: true, fine: true, reflect: true, rim: true },
};

/** The fixed camera: slightly above and to the right, three faces in view (the twin's rotateX(-24) rotateY(-32)). */
const CAM_PITCH = (24 * Math.PI) / 180;
const DEFAULT_CAM_YAW = 32;
/** A canvas this small (CSS px) costs next to nothing to draw at a high pixel ratio, so it gets one: stickers stay crisp in the compact live cube. */
const SMALL_CANVAS_PX = 260;
const SMALL_CANVAS_RATIO = 2.5;
const FLOOR_Y = -1.95;
const LOOK_Y = -0.3;
/** How the cube is framed: the lean, grips and layer sweep it must stay in frame for, and how far below the floor the reflection may reach. */
const FIT = {
  tight: { tiltDeg: 8, yawSpanDeg: 20, sweep: 0.8 },
  loose: { tiltDeg: 14, yawSpanDeg: 45, sweep: 1 },
} as const;
const FLOOR_MARGIN = 0.7;
/** The floor reflection: a squashed mirrored copy drawn faintly, fading out below the floor. */
const REFL_SQUASH = 0.55;
const REFL_ALPHA = 0.2;
const REFL_FADE = 0.9;
const FOV = 26;

const BODY = 0.982;
const HALF = BODY / 2;

const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];

function pillowGeometry(kind: PlateKind, fine: boolean): BufferGeometry {
  const m = buildPillow(PLATE_SPECS[kind][fine ? "fine" : "coarse"]);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(m.positions, 3));
  g.setAttribute("uv", new BufferAttribute(m.uvs, 2));
  g.setIndex(new BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  return g;
}

/** The centre cap's emblem, a shade darker than the cap, on white (the texture multiplies the cap colour). "none" is plain white. */
function emblemTexture(size: number, kind: Emblem | "blank"): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, size, size);
  g.strokeStyle = g.fillStyle = "#c4c4c4";
  g.lineWidth = size * 0.045;
  const m = size / 2;
  if (kind === "ring" || kind === "dot") {
    if (kind === "ring") {
      g.beginPath();
      g.arc(m, m, size * 0.2, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.arc(m, m, size * (kind === "dot" ? 0.12 : 0.065), 0, Math.PI * 2);
    g.fill();
  } else if (kind === "star") {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = size * (i % 2 ? 0.1 : 0.24);
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** One strip of six colour-blind glyphs (dot, bar, triangle, square, cross, ring), a dark mark on white in each 64 px cell. */
function glyphAtlas(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const cell = 64;
  const c = document.createElement("canvas");
  c.width = cell * 6;
  c.height = cell;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = g.strokeStyle = "#2c2c2c";
  g.lineWidth = 7;
  g.lineJoin = "round";
  for (let i = 0; i < 6; i++) {
    const x = i * cell + cell / 2;
    const y = cell / 2;
    g.beginPath();
    if (i === 0) g.arc(x, y, 11, 0, Math.PI * 2);
    else if (i === 1) g.rect(x - 17, y - 5, 34, 10);
    else if (i === 2) {
      g.moveTo(x, y - 14);
      g.lineTo(x + 15, y + 11);
      g.lineTo(x - 15, y + 11);
      g.closePath();
    } else if (i === 3) g.rect(x - 11, y - 11, 22, 22);
    else if (i === 4) {
      g.rect(x - 4, y - 16, 8, 32);
      g.rect(x - 16, y - 4, 32, 8);
    } else {
      g.arc(x, y, 13, 0, Math.PI * 2);
      g.fill("evenodd");
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
    }
    g.fill();
    g.fillStyle = "#2c2c2c";
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Roughness for worn plastic: smoother in the middle of a face, rougher toward the edges (the green channel multiplies the material's roughness). */
function edgeWearTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const n = 32;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.min(x + 0.5, n - x - 0.5, y + 0.5, n - y - 0.5) / (n / 2);
      const t = Math.min(1, d / 0.35);
      const v = Math.round(255 * (1 - 0.45 * t * t * (3 - 2 * t)));
      img.data.set([v, v, v, 255], (y * n + x) * 4);
    }
  g.putImageData(img, 0, 0);
  return new CanvasTexture(c);
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
  body: Mesh;
  stickers: { index: number; mesh: Mesh; material: MeshPhysicalMaterial; centre: boolean }[];
  /** this piece's own body material while the cube is worn (a slightly different tone and roughness each) */
  wearMat?: MeshPhysicalMaterial;
  /** stickerless: this cubie's own body geometry with per-vertex colours, and which sticker (slot in `stickers`) each vertex takes its colour from; built on first use */
  paint?: { geo: BufferGeometry; slot: Int8Array };
  /** ghost copies, one group per trail sample, built on first use */
  ghosts: Group[];
  ghostStickers: { index: number; mesh: Mesh }[][];
}

/** The floor reflection: the cubies again, under a root that mirrors and squashes them. Only built on the tiers that can afford it. */
interface Reflection {
  root: Group;
  cube: Group;
  cubies: { group: Group; body: Mesh; stickers: Mesh[] }[];
  mats: Map<string, MeshBasicMaterial>;
  bodyMat: MeshBasicMaterial;
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
  private plates = new Map<PlateKind, BufferGeometry>();
  private bodyMat: MeshPhysicalMaterial;
  private paintMat: MeshPhysicalMaterial;
  private core: Mesh;
  private key: DirectionalLight;
  private fill: DirectionalLight;
  private rim: DirectionalLight | null = null;
  private refl: Reflection | null = null;
  private reflFloor = { value: FLOOR_Y };
  private look: CubeLook = DEFAULT_LOOK;
  private colorsDirty = true;
  private emblems = new Map<Emblem | "blank", Texture | null>();
  private glyphs: Texture[] = [];
  private edgeTex: Texture | null = null;
  private palette: Record<string, string> = FACELET_COLORS;
  private byIndex: (CubieObj["stickers"][number] | undefined)[] = [];
  private opacity = 1;
  private opacityDirty = true;
  private reflDegraded = false;
  private arrow: { group: Group; mesh: Mesh; geos: Map<number, BufferGeometry>; mat: MeshBasicMaterial } | null = null;
  private arrowKey = "";
  private accentHex = "#ffffff";
  private lit: number[] = [];
  private arrowNormal = new Vector3();
  private fitMode: "tight" | "loose";
  private contact: Mesh | null = null;
  private lastFacelets = "";
  private lastFills: readonly (string | undefined)[] | undefined;
  private letters: Group | null = null;
  private lettersOn = false;
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
    this.fitMode = opts.fit ?? "tight";
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
    this.fill = fill;
    this.scene.add(fill);
    this.scene.add(key);
    if (q.rim) {
      // a soft rim from behind and above, so the far edges pick up a thin highlight against the stage
      const rim = new DirectionalLight(0xffffff, 0.8);
      rim.position.set(-5, 3.5, -6);
      this.rim = rim;
      this.scene.add(rim);
    }
    this.applyTheme();

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
    this.stickerGeo = this.plateGeo("dome");
    this.disposables.push(this.bodyGeo);
    // the centre caps carry a small emblem (a shared texture; a plain white one stands in while the face letters are on)
    // (the emblem textures are built on first use, see emblemFor)
    this.bodyMat = new MeshPhysicalMaterial({ color: new Color(CUBE_BODY).multiplyScalar(1.3), roughness: q.clearcoat ? 0.38 : 0.3, metalness: 0, clearcoat: q.clearcoat ? 0.7 : 0, clearcoatRoughness: 0.18, envMapIntensity: 0.8 });
    this.paintMat = new MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.38, metalness: 0, specularIntensity: 0.5, envMapIntensity: 0.9 });
    this.disposables.push(this.bodyMat, this.paintMat);
    const core = new Mesh(new BoxGeometry(2, 2, 2), new MeshPhysicalMaterial({ color: 0x050507, roughness: 0.8 }));
    this.core = core;
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
        const centre = s.index % 9 === 4;
        const material = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, specularIntensity: 0.3, clearcoat: 0, ...(q.clearcoat ? { sheen: 0.08, sheenRoughness: 0.6, sheenColor: new Color(0xffffff) } : {}), envMapIntensity: 1 });
        const mesh = new Mesh(this.stickerGeo, material);
        const n = new Vector3(...s.normal);
        mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
        mesh.position.copy(n).multiplyScalar(HALF - 0.004);
        mesh.receiveShadow = q.shadow > 0;
        group.add(mesh);
        const entry = { index: s.index, mesh, material, centre };
        stickers.push(entry);
        this.byIndex[s.index] = entry;
        this.disposables.push(material);
      }
      this.cube.add(group);
      this.cubies.push({ group, body, stickers, ghosts: [], ghostStickers: [] });
    }
    this.scene.add(this.cube);
    if (q.reflect && opts.reflection !== false) this.buildReflection();
    this.applyLook();
  }

  /** Sticker plate geometry by shape, built the first time a look asks for it. */
  private plateGeo(kind: PlateKind): BufferGeometry {
    let g = this.plates.get(kind);
    if (!g) {
      g = pillowGeometry(kind, QUALITY[this.quality].fine);
      this.plates.set(kind, g);
      this.disposables.push(g);
    }
    return g;
  }

  /** The studio light for the current theme, read from its CSS variables (key warmer or cooler, fill and rim carry a little of the accent). Call again if the theme changes. */
  applyTheme(): void {
    if (typeof document === "undefined") return;
    const css = getComputedStyle(document.documentElement);
    const light = studioLight(css.getPropertyValue("--accent").trim(), css.getPropertyValue("--background").trim());
    this.key.color.setRGB(...light.key, SRGBColorSpace);
    this.fill.color.setRGB(...light.fill, SRGBColorSpace);
    this.rim?.color.setRGB(...light.rim, SRGBColorSpace);
    this.accentHex = fillToHex(css.getPropertyValue("--accent").trim()) ?? "#ffffff";
    this.arrow?.mat.color.set(this.accentHex);
  }

  /**
   * The faint mirrored copy of the cube under it. Opaque unlit meshes whose fragments are faded (and premultiplied) by their
   * height below the floor, so no blending or sorting is needed and the copy occludes itself properly.
   */
  private buildReflection(): void {
    const root = new Group();
    root.scale.set(1, -REFL_SQUASH, 1);
    root.position.y = FLOOR_Y * (1 + REFL_SQUASH);
    const cube = new Group();
    root.add(cube);
    const bodyMat = this.reflMaterial(new Color(0x08080a));
    const cubies: Reflection["cubies"] = [];
    for (const c of this.cubies) {
      const group = new Group();
      const body = new Mesh(this.bodyGeo, bodyMat);
      group.add(body);
      const stickers = c.stickers.map((s) => {
        const mesh = new Mesh(this.stickerGeo, bodyMat);
        mesh.position.copy(s.mesh.position);
        mesh.quaternion.copy(s.mesh.quaternion);
        group.add(mesh);
        return mesh;
      });
      cube.add(group);
      cubies.push({ group, body, stickers });
    }
    this.scene.add(root);
    this.refl = { root, cube, cubies, mats: new Map(), bodyMat };
  }

  private reflMaterial(color: Color): MeshBasicMaterial {
    const m = new MeshBasicMaterial({ color, toneMapped: false });
    const floor = this.reflFloor;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uFloor = floor;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vWorldY;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vWorldY;\nuniform float uFloor;")
        .replace("#include <dithering_fragment>", `#include <dithering_fragment>\n{ float rf = ${REFL_ALPHA.toFixed(3)} * clamp(1.0 - (uFloor - vWorldY) / ${REFL_FADE.toFixed(3)}, 0.0, 1.0); gl_FragColor = vec4(gl_FragColor.rgb * rf, rf); }`);
    };
    m.customProgramCacheKey = () => "cube-reflection";
    this.disposables.push(m);
    return m;
  }

  /** The reflection's material for a sticker colour (shared between stickers of about the same colour). */
  private reflSticker(color: Color): MeshBasicMaterial {
    const refl = this.refl;
    if (!refl) return this.ghostMaterial("body", 0);
    const key = `${Math.round(color.r * 24)},${Math.round(color.g * 24)},${Math.round(color.b * 24)}`;
    let m = refl.mats.get(key);
    if (!m) {
      m = this.reflMaterial(color.clone());
      refl.mats.set(key, m);
    }
    return m;
  }

  /** Dress the cube in `look`: swap the sticker plates, their materials and the body colour. No rebuild: geometry and materials are shared and reassigned. */
  setLook(look: CubeLook): void {
    const p = this.look;
    if (look.stickerStyle === p.stickerStyle && look.body === p.body && look.wear === p.wear && look.scheme === p.scheme && look.emblem === p.emblem && look.symbols === p.symbols && look.customColors.join() === p.customColors.join()) return;
    this.look = { stickerStyle: look.stickerStyle, body: look.body, wear: look.wear, scheme: look.scheme, customColors: [...look.customColors], emblem: look.emblem, symbols: look.symbols };
    this.applyLook();
  }

  /** The emblem texture for a kind, built the first time it is asked for. */
  private emblemFor(kind: Emblem | "blank"): Texture | null {
    if (!this.emblems.has(kind)) {
      const t = emblemTexture(kind === "blank" ? 4 : QUALITY[this.quality].fine ? 128 : 64, kind);
      if (t) this.disposables.push(t);
      this.emblems.set(kind, t);
    }
    return this.emblems.get(kind) ?? null;
  }

  /** One texture per glyph, all views of a single shared strip (same image, different offset). */
  private glyphFor(letter: string): Texture | null {
    const i = glyphIndex(letter);
    if (i < 0) return null;
    if (!this.glyphs.length) {
      const atlas = glyphAtlas();
      if (!atlas) return null;
      for (let k = 0; k < 6; k++) {
        const t = k === 0 ? atlas : atlas.clone();
        t.wrapS = RepeatWrapping;
        t.repeat.set(1 / 6, 1);
        t.offset.set(k / 6, 0);
        t.needsUpdate = true;
        this.glyphs.push(t);
        this.disposables.push(t);
      }
    }
    return this.glyphs[i] ?? null;
  }

  /** The map a sticker shows: the face letter's blank, else a colour-blind glyph, else (centres) the emblem. */
  private stickerMap(s: CubieObj["stickers"][number], letter: string): Texture | null {
    if (s.centre && this.lettersOn) return this.emblemFor("blank");
    if (this.look.symbols) return this.glyphFor(letter);
    return s.centre ? this.emblemFor(this.look.emblem === "none" ? "blank" : this.look.emblem) : null;
  }

  private setMap(m: MeshPhysicalMaterial, t: Texture | null): void {
    if (m.map === t) return;
    // a material compiled with no map needs a new program to take one (and the reverse)
    if (!m.map || !t) m.needsUpdate = true;
    m.map = t;
  }

  private applyLook(): void {
    const { stickerStyle, body, wear } = this.look;
    const st = STICKER_SPECS[stickerStyle];
    const bd = BODY_SPECS[body];
    const ws = WEAR_SPECS[wear];
    this.palette = schemeColors(this.look, FACELET_COLORS);
    const plate = this.plateGeo(st.plate);
    this.stickerGeo = plate;
    if (bd.hex) this.bodyMat.color.setRGB(...hexToRgb(bd.hex), SRGBColorSpace);
    else this.bodyMat.color.set(CUBE_BODY).multiplyScalar(1.3);
    const baseRough = QUALITY[this.quality].clearcoat ? bd.roughness + 0.08 : bd.roughness;
    this.bodyMat.roughness = baseRough;
    if (ws.edge > 0 && !this.edgeTex) {
      this.edgeTex = edgeWearTexture();
      if (this.edgeTex) this.disposables.push(this.edgeTex);
    }
    this.cubies.forEach((c, ci) => {
      for (const s of c.stickers) {
        s.mesh.geometry = plate;
        const base = s.centre ? st.roughness - 0.08 : st.roughness;
        s.material.roughness = Math.min(1, Math.max(0.05, base + stickerJitter(s.index + 77) * ws.rough));
        s.material.specularIntensity = s.centre ? st.specular + 0.15 : st.specular;
      }
      for (const g of c.ghostStickers) for (const s of g) s.mesh.geometry = plate;
      if (st.paintedBody) {
        this.ensurePaint(c);
        c.body.geometry = c.paint?.geo ?? this.bodyGeo;
        c.body.material = c.paint ? this.paintMat : this.bodyMat;
      } else {
        c.body.geometry = this.bodyGeo;
        if (wear === "none") c.body.material = this.bodyMat;
        else {
          // worn: each piece its own tone and roughness, and rougher plastic toward its edges
          const m = (c.wearMat ??= this.bodyMat.clone());
          m.color.copy(this.bodyMat.color).multiplyScalar(1 + stickerJitter(ci + 301) * ws.body);
          m.roughness = Math.min(1, (baseRough + stickerJitter(ci + 509) * ws.rough) * (1 + ws.edge));
          m.roughnessMap = this.edgeTex;
          m.needsUpdate = true;
          c.body.material = m;
          this.opacityDirty = true;
        }
      }
    });
    if (this.refl) for (const rc of this.refl.cubies) for (const m of rc.stickers) m.geometry = plate;
    ((this.core.material as MeshPhysicalMaterial).color as Color).set(bd.core);
    this.ghostMats.forEach((m, k) => {
      if (k.startsWith("body")) m.color.setRGB(...bd.ghost, SRGBColorSpace);
      else {
        const [r, g, b] = styleColor(toneColor(this.palette[k[0]] ?? "#888888", 0), stickerStyle);
        m.color.setRGB(r, g, b, SRGBColorSpace);
      }
    });
    const rb = bd.hex ? hexToRgb(bd.hex) : ([0.03, 0.03, 0.035] as const);
    this.refl?.bodyMat.color.setRGB(rb[0], rb[1], rb[2], SRGBColorSpace);
    this.refreshMaps();
    this.colorsDirty = true;
  }

  /** Sticker maps (emblem, glyphs) from the facelet letters now shown. */
  private refreshMaps(): void {
    const f = this.lastFacelets;
    for (const c of this.cubies) for (const s of c.stickers) this.setMap(s.material, this.stickerMap(s, f[s.index] ?? ""));
  }

  /** Build a cubie's own painted body: its vertices tagged with the sticker on the side they face. */
  private ensurePaint(c: CubieObj): void {
    if (c.paint) return;
    const geo = this.bodyGeo.clone();
    const n = geo.getAttribute("normal");
    const slot = new Int8Array(n.count).fill(-1);
    c.stickers.forEach((s, i) => {
      const dir = new Vector3(0, 0, 1).applyQuaternion(s.mesh.quaternion);
      for (let v = 0; v < n.count; v++) {
        const nx = n.getX(v);
        const ny = n.getY(v);
        const nz = n.getZ(v);
        const m = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
        // the dominant axis of the vertex normal decides which face it belongs to
        if (Math.abs(nx * dir.x + ny * dir.y + nz * dir.z) >= m - 1e-4 && nx * dir.x + ny * dir.y + nz * dir.z > 0.45) slot[v] = i;
      }
    });
    geo.setAttribute("color", new BufferAttribute(new Float32Array(n.count * 3).fill(0.02), 3));
    this.disposables.push(geo);
    c.paint = { geo, slot };
  }

  /** Stickerless: colour each body vertex like the sticker on its side, so the whole facelet reads as solid plastic. */
  private paintBody(c: CubieObj): void {
    const p = c.paint;
    if (!p) return;
    const attr = p.geo.getAttribute("color") as BufferAttribute;
    for (let v = 0; v < p.slot.length; v++) {
      const s = c.stickers[p.slot[v]];
      if (s) attr.setXYZ(v, s.material.color.r, s.material.color.g, s.material.color.b);
      else attr.setXYZ(v, 0.02, 0.02, 0.025);
    }
    attr.needsUpdate = true;
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
    // fit the cube's real silhouette (over the lean and layer sweep it is shown with) and its contact shadow, not its bounding sphere
    const dist = fitDistance({ aspect, fovDeg: FOV, camYawDeg: (this.camYaw * 180) / Math.PI, camPitchDeg: (CAM_PITCH * 180) / Math.PI, lookY: LOOK_Y, floorY: FLOOR_Y, floorMargin: FLOOR_MARGIN, margin: 1.02, ...FIT[this.fitMode] });
    this.camera.position.set(Math.sin(this.camYaw) * Math.cos(CAM_PITCH), Math.sin(CAM_PITCH), Math.cos(this.camYaw) * Math.cos(CAM_PITCH)).multiplyScalar(dist);
    this.camera.lookAt(0, LOOK_Y, 0);
    this.camera.updateProjectionMatrix();
  }

  private ghostMaterial(letter: string, level: number): MeshBasicMaterial {
    const k = `${letter}${level}`;
    let m = this.ghostMats.get(k);
    if (!m) {
      const [r, g, b] = letter === "body" ? BODY_SPECS[this.look.body].ghost : styleColor(toneColor(this.palette[letter] ?? "#888888", 0), this.look.stickerStyle);
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
    if (facelets === this.lastFacelets && fills === this.lastFills && !this.colorsDirty) return;
    this.lastFacelets = facelets;
    this.lastFills = fills;
    this.colorsDirty = false;
    const style = this.look.stickerStyle;
    const painted = STICKER_SPECS[style].paintedBody;
    const tone = 0.035 + WEAR_SPECS[this.look.wear].tone;
    this.cubies.forEach((c, ci) => {
      c.stickers.forEach((s, si) => {
        const [r, g, b] = styleColor(toneColor(fillToHex(fills?.[s.index]) ?? this.palette[facelets[s.index]] ?? "#555555", s.index, tone), style);
        if (this.look.symbols) this.setMap(s.material, this.stickerMap(s, facelets[s.index]));
        s.material.color.setRGB(r, g, b, SRGBColorSpace);
        if (this.refl) this.refl.cubies[ci].stickers[si].material = this.reflSticker(s.material.color);
      });
      if (painted) this.paintBody(c);
      c.ghostStickers.forEach((sts, level) => {
        for (const s of sts) s.mesh.material = this.ghostMaterial(facelets[s.index], level);
      });
    });
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
        mesh.position.copy(nv).multiplyScalar(1 + HALF + 0.07);
        mesh.renderOrder = 2;
        group.add(mesh);
        this.disposables.push(tex, mat);
      }
      this.letters = group;
      this.cube.add(group);
    }
    this.letters.visible = on;
    // the emblem would sit under the letter: a plain white map (same shader) takes its place while letters are on
    if (on !== this.lettersOn) {
      this.lettersOn = on;
      this.refreshMaps();
    }
  }

  /**
   * Watches how often frames really arrive while a turn is playing and steps the cost down if they are slow: first the
   * motion-blur copies and the floor reflection, then the pixel ratio (never below 1). A phone that cannot keep up gets a cheaper picture
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
    if (this.ghostBudget > 0 || this.refl?.root.visible) {
      this.ghostBudget = 0;
      this.reflDegraded = true;
      if (this.refl) this.refl.root.visible = false;
    } else if (this.ratioCap > 1) {
      this.ratioCap = Math.max(1, this.ratioCap * 0.75);
      this.applyRatio();
    }
  }

  /** Whole-cube alpha. Materials only go transparent below 1, so an opaque cube costs what it always did. */
  private applyOpacity(o: number): void {
    const v = Math.min(1, Math.max(0, o));
    if (v === this.opacity && !this.opacityDirty) return;
    const ghost = v < 1;
    this.opacity = v;
    this.opacityDirty = false;
    const set = (m: Material) => {
      if (m.transparent !== ghost) {
        m.transparent = ghost;
        m.needsUpdate = true;
      }
      m.opacity = v;
    };
    set(this.bodyMat);
    set(this.paintMat);
    this.core.visible = !ghost;
    for (const c of this.cubies) {
      if (c.wearMat) set(c.wearMat);
      for (const s of c.stickers) set(s.material);
    }
    if (this.contact) (this.contact.material as MeshBasicMaterial).opacity = v;
    if (this.refl) this.refl.root.visible = !ghost && !this.reflDegraded;
  }

  /** The curved arrow over the layer the next move turns; hidden for null or a rotation. Built the first time it is asked for. */
  private setNextMove(token: string | null | undefined): void {
    const key = token ?? "";
    if (key !== this.arrowKey) {
      this.arrowKey = key;
      const spec = arrowSpec(token);
      if (!spec) {
        if (this.arrow) this.arrow.group.visible = false;
      } else {
        if (!this.arrow) {
          const mat = new MeshBasicMaterial({ color: new Color(this.accentHex), side: DoubleSide, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
          const mesh = new Mesh(new BufferGeometry(), mat);
          mesh.renderOrder = 4;
          const group = new Group();
          group.add(mesh);
          this.cube.add(group);
          this.disposables.push(mat);
          this.arrow = { group, mesh, geos: new Map(), mat };
        }
        const a = this.arrow;
        const span = spec.double ? 250 : 120;
        const gk = (spec.slice ? 1000 : 0) + span;
        let geo = a.geos.get(gk);
        if (!geo) {
          const m = spec.slice ? arrowMesh(0.5, 0.14, span) : arrowMesh(1.02, 0.2, span);
          geo = new BufferGeometry();
          geo.setAttribute("position", new BufferAttribute(new Float32Array(m.positions), 3));
          geo.setIndex(m.indices);
          a.geos.set(gk, geo);
          this.disposables.push(geo);
        }
        a.mesh.geometry = geo;
        // mirrored in x for a counter-clockwise turn
        a.mesh.scale.set(spec.prime ? -1 : 1, 1, 1);
        const n = new Vector3(...spec.normal);
        a.group.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
        a.group.position.copy(n).multiplyScalar(HALF + 1 + 0.1);
        a.group.visible = true;
        this.arrowNormal.copy(n);
      }
    }
    // an arrow on a face turned away from the camera shows through the cube, fainter
    if (this.arrow?.group.visible) {
      const facing = this.arrowNormal.clone().applyQuaternion(this.cube.quaternion).dot(this.camera.position) > 0;
      this.arrow.mat.opacity = (facing ? 0.95 : 0.4) * this.opacity;
    }
  }

  /** Facelets that glow: their emissive follows their colour, scaled by strength, with a slight swell. Reset when cleared. */
  private setHighlight(h: CubeSceneState["highlight"]): void {
    const next = h && h.strength > 0.001 ? h.stickers : [];
    for (const i of this.lit) {
      if (next.includes(i)) continue;
      const s = this.byIndex[i];
      if (!s) continue;
      s.material.emissive.setRGB(0, 0, 0);
      s.material.emissiveIntensity = 1;
      s.mesh.scale.setScalar(1);
    }
    this.lit = [...next];
    if (!h) return;
    const k = Math.min(1, Math.max(0, h.strength));
    for (const i of next) {
      const s = this.byIndex[i];
      if (!s) continue;
      s.material.emissive.copy(s.material.color);
      s.material.emissiveIntensity = 0.85 * k;
      s.mesh.scale.setScalar(1 + 0.07 * k);
    }
  }

  /** Apply a state and draw one frame. */
  render(state: CubeSceneState): void {
    if (this.disposed || !this.width) return;
    if (state.look) this.setLook(state.look);
    this.setFacelets(state.facelets.length === 54 ? state.facelets : this.lastFacelets || state.facelets, state.stickerFills);
    this.setFaceLetters(!!state.faceLetters);
    this.applyOpacity(state.opacity ?? 1);
    this.setHighlight(state.highlight);
    const o = state.orientation;
    if (o) this.cube.quaternion.set(o.x, o.y, o.z, o.w).normalize();
    else this.cube.quaternion.identity();
    this.setNextMove(state.nextMove);
    // Secondary motion: the whole cube rocks a little after a turn lands (a rotation vector in the cube's own frame).
    const jig = state.jiggle ?? null;
    if (jig) {
      const [wx, wy, wz] = jig.wobble;
      const mag = Math.hypot(wx, wy, wz);
      if (mag > 1e-7) this.cube.quaternion.multiply(this.wobbleQ.setFromAxisAngle(this.wobbleAxis.set(wx / mag, wy / mag, wz / mag), mag));
    }
    const rat = jig?.rattle && !state.turning ? jig.rattle : null;
    const rattling = rat ? cubieTurns(rat.turn, 1) : null;
    const rq = this.wobbleQ;
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
        // the loose cubies of the layer that has just stopped rattle a fraction of a degree
        if (rat && rattling?.[ci]) {
          const [rx, ry, rz] = rattleOffset(rat.ageMs, ci, rat.strength);
          const mag = Math.hypot(rx, ry, rz);
          if (mag > 1e-8) c.group.quaternion.copy(rq.setFromAxisAngle(this.wobbleAxis.set(rx / mag, ry / mag, rz / mag), mag));
        }
      }
      // Speed in radians per frame from the eased slope and how long the turn really takes on screen (a mid-speed turn when that is unknown).
      const speed = t ? turnSpeedPerFrame(t.slope, state.turning?.turnMs) : 0;
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
    if (this.refl?.root.visible) {
      this.refl.cube.quaternion.copy(this.cube.quaternion);
      this.cubies.forEach((c, ci) => {
        const g = this.refl!.cubies[ci].group;
        g.position.copy(c.group.position);
        g.quaternion.copy(c.group.quaternion);
      });
    }
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
