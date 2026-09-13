import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FLOORS } from "./levels.js";
import { KEY_INFO } from "./catalog.js";
import { deathPose } from "./enemy-death.js";
import { climbingOpenings } from "./walkway.js";

const TAU = Math.PI * 2;
const KEY_COLORS = { bronze: 0xf2b95f, silver: 0x9deaff, gold: 0xffdb6f };
const floorY = (data) => data.y ?? FLOORS[data.floor];
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const materialCache = new Map();
function material(color, metalness = 0, roughness = 0.85, emissive = 0) {
  const key = `${color}-${metalness}-${roughness}-${emissive}`;
  if (!materialCache.has(key))
    materialCache.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        metalness,
        roughness,
        emissive: color,
        emissiveIntensity: emissive,
      }),
    );
  return materialCache.get(key);
}
function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function box(parent, x, y, z, w, h, d, mat) {
  const m = mesh(unitBox, mat, parent, x, y, z);
  m.scale.set(w, h, d);
  return m;
}
function cylinder(parent, x, y, z, r1, r2, h, mat, n = 12) {
  return mesh(new THREE.CylinderGeometry(r1, r2, h, n), mat, parent, x, y, z);
}
function sphere(parent, x, y, z, r, mat) {
  return mesh(new THREE.SphereGeometry(r, 12, 8), mat, parent, x, y, z);
}
function torus(parent, x, y, z, r, tube, mat, arc = TAU) {
  return mesh(
    new THREE.TorusGeometry(r, tube, 5, 28, arc),
    mat,
    parent,
    x,
    y,
    z,
  );
}
function line(parent, points, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((p) => new THREE.Vector3(...p)),
  );
  const m = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
  parent.add(m);
  return m;
}
function seeded(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function stoneTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d"),
    rand = seeded(83);
  ctx.fillStyle = "#adb09f";
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 9000; i++) {
    const shade = 50 + rand() * 120;
    ctx.fillStyle = `rgba(${shade},${shade},${shade - 9},${rand() * 0.19})`;
    const size = 1 + rand() * 4;
    ctx.fillRect(rand() * 128, rand() * 128, size, size);
  }
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = "#31362f14";
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    const x = rand() * 128,
      y = rand() * 128;
    ctx.moveTo(x, y);
    ctx.lineTo(x + rand() * 15, y + 10);
    ctx.lineTo(x + rand() * 23, y + 14);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.12, "rgba(255,255,255,.65)");
  g.addColorStop(0.4, "rgba(255,255,255,.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function archShape(width, height) {
  const r = width / 2,
    s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, height - r);
  s.absarc(0, height - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}

export class CastleScene {
  constructor(host) {
    this.host = host;
    this.time = 0;
    this.quality = "high";
    this.glowMap = glowTexture();
    this.stoneMap = stoneTexture();
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101a19);
    this.scene.fog = new THREE.FogExp2(0x142322, 0.012);
    this.camera = new THREE.OrthographicCamera(-15, 15, 9, -9, 0.1, 100);
    this.camera.position.set(4.3, 9.1, 33);
    this.camera.lookAt(0, 4.55, 0);
    this.scene.add(new THREE.HemisphereLight(0xb9d7d9, 0x4f4831, 2.1));
    const moon = new THREE.DirectionalLight(0xa9d5ed, 2.7);
    moon.position.set(-8, 18, 12);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, {
      left: -17,
      right: 17,
      top: 17,
      bottom: -10,
      near: 0.5,
      far: 60,
    });
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.06;
    this.scene.add(moon);
    this.moon = moon;
    const fill = new THREE.DirectionalLight(0xdca66c, 1.1);
    fill.position.set(8, 3, 8);
    this.scene.add(fill);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.player = this.character("explorer");
    this.scene.add(this.player);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(800, 600),
      0.32,
      0.55,
      1.2,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    const aspect = w / h,
      width = Math.max(26.8, 16.2 * aspect),
      height = width / aspect;
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }
  setQuality(value) {
    this.quality = value;
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, value === "high" ? 1.6 : 1),
    );
    this.bloom.enabled = value === "high";
    this.renderer.shadowMap.enabled = value === "high";
    this.resize();
  }
  glow(parent, x, y, z, color, size, opacity = 0.55) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowMap,
        color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity,
      }),
    );
    s.position.set(x, y, z);
    s.scale.set(size, size, 1);
    parent.add(s);
    return s;
  }
  clearRoom() {
    for (const texture of this.roomTextures || []) texture.dispose();
    this.roomTextures = [];
    // Dispose room-specific resources; shared box geometry, materials and textures stay cached.
    const geometries = new Set(),
      materials = new Set();
    this.root.traverse((o) => {
      if (o.geometry && o.geometry !== unitBox) geometries.add(o.geometry);
      if (o.material && ![...materialCache.values()].includes(o.material))
        materials.add(o.material);
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    this.root.clear();
    this.torches = [];
    this.keyMeshes = [];
    this.switchMeshes = [];
    this.fieldMeshes = [];
    this.lightningMeshes = [];
    this.trapMeshes = [];
    this.enemyMeshes = [];
    this.teleportMeshes = [];
    this.beltMeshes = [];
    this.gears = [];
    this.doorMeshes = [];
    this.gunMeshes = [];
    this.projectileMeshes = [];
  }
  build(room, index = 0) {
    this.clearRoom();
    this.original = false;
    this.room = room;
    this.player.scale.setScalar(1);
    this.camera.lookAt(0, 4.55, 0);
    const rand = seeded(210 + index * 17),
      root = this.root;
    const stone = new THREE.MeshStandardMaterial({
      color: room.tint,
      roughness: 0.96,
      map: this.stoneMap,
    });
    const trim = material(0x969781),
      darkStone = material(0x47574b),
      iron = material(0x303a35, 0.7, 0.5),
      brass = material(0xa18b51, 0.65, 0.45),
      wood = material(0x574b35);
    this.trim = trim;
    this.iron = iron;
    this.brass = brass;
    // Individual, slightly irregular ashlar blocks give the cutaway a sculpted silhouette.
    const blocks = [],
      matrix = new THREE.Matrix4(),
      quat = new THREE.Quaternion();
    for (let row = 0; row < 17; row++)
      for (let col = 0; col < 19; col++) {
        const x = -11.3 + col * 1.23 + (row % 2 ? 0.61 : 0);
        if (x > 11.6) continue;
        blocks.push({
          x,
          y: -0.1 + row * 0.66,
          z: -1.83 + rand() * 0.09,
          w: 1.18,
          h: 0.61 + rand() * 0.025,
          d: 0.62 + rand() * 0.13,
        });
      }
    const stones = new THREE.InstancedMesh(unitBox, stone, blocks.length);
    stones.castShadow = true;
    stones.receiveShadow = true;
    blocks.forEach((b, i) => {
      matrix.compose(
        new THREE.Vector3(b.x, b.y, b.z),
        quat,
        new THREE.Vector3(b.w, b.h, b.d),
      );
      stones.setMatrixAt(i, matrix);
      stones.setColorAt(i, new THREE.Color().setScalar(0.77 + rand() * 0.34));
    });
    root.add(stones);
    // Foundation, ledges, and cap stones.
    box(root, 0, -1.05, -0.4, 24.2, 1.1, 3.5, darkStone);
    box(root, 0, -1.61, -0.25, 24.8, 0.24, 3.8, trim);
    for (let x = -11.5; x < 12; x += 1.1)
      box(root, x, -1.13, 1.39, 1.02, 0.75, 0.13, stone);
    for (const y of FLOORS) {
      const traps = room.traps
        .filter((t) => FLOORS[t.floor] === y)
        .sort((a, b) => a.x - b.x);
      let start = -11.65;
      for (const trap of traps) {
        this.platform(
          start,
          trap.x - trap.width / 2,
          y,
          trim,
          darkStone,
          brass,
        );
        start = trap.x + trap.width / 2;
      }
      this.platform(start, 11.65, y, trim, darkStone, brass);
    }
    box(root, 0, 10.95, -1.7, 23.8, 0.24, 1.1, trim);
    box(root, 0, 10.63, -1.58, 23.7, 0.28, 0.9, darkStone);
    for (let x = -11.3; x < 12; x += 1.28)
      box(root, x, 11.3, -1.8, 0.75, 0.48, 0.87, stone);
    for (const x of [-11.65, 11.65]) {
      box(root, x, 4.95, -0.9, 0.72, 11.25, 1.35, darkStone);
      for (let y = -0.2; y < 11; y += 0.59)
        box(root, x, y, -0.08, 0.83, 0.53, 0.39, stone);
      for (const y of [0, 3.6, 7.2, 10.5]) {
        box(root, x, y + 0.2, -0.65, 1.13, 0.24, 1.55, trim);
        box(root, x, y + 0.44, -0.7, 0.94, 0.15, 1.4, trim);
      }
      box(root, x, 11, -0.9, 1.35, 0.34, 1.75, trim);
    }
    for (const floor of [0, 1, 2]) {
      const y = FLOORS[floor];
      for (const x of [-7.7, -0.15, 7.5])
        this.window(
          x,
          y + 0.35,
          index === 3 ? 2.7 : 2.4,
          2.55,
          trim,
          index,
          floor === 2 && x === 7.5,
        );
      for (const x of [-4, 3.9]) {
        box(root, x, y + 1.55, -1.09, 0.34, 2.9, darkStone);
        box(root, x, y + 0.16, -0.97, 0.65, 0.3, trim);
        box(root, x, y + 2.98, -1.02, 0.66, 0.24, trim);
        cylinder(root, x, y + 1.57, -1.04, 0.21, 0.24, 2.55, stone, 8);
      }
      for (const x of [-9.75, 2.15]) this.torch(x, y + 1.75, -0.58, rand());
    }
    // Hanging banners, chains, and small signs of abandonment.
    for (const x of [-5.75, 5.6]) {
      const banner = new THREE.Shape();
      banner.moveTo(-0.42, 0);
      banner.lineTo(0.42, 0);
      banner.lineTo(0.42, -1.85);
      banner.lineTo(0, -2.1);
      banner.lineTo(-0.42, -1.85);
      banner.closePath();
      mesh(
        new THREE.ShapeGeometry(banner),
        material(index === 3 ? 0x434361 : 0x633e38),
        root,
        x,
        10.2,
        -0.94,
      );
      box(root, x, 10.24, -0.84, 1.03, 0.08, 0.1, brass);
      const symbol = torus(root, x, 9.46, -0.89, 0.19, 0.018, brass);
      symbol.rotation.z = Math.PI / 4;
      line(
        root,
        [
          [x, 9.1, -0.9],
          [x, 9.85, -0.9],
        ],
        0xb3a36d,
        0.7,
      );
    }
    for (const x of [-10.3, 4.8])
      for (let y = 8.6; y < 10.65; y += 0.15) {
        const ring = torus(root, x, y, -0.25, 0.075, 0.018, iron);
        ring.rotation.y = Math.round(y / 0.15) % 2 ? Math.PI / 2 : 0;
      }
    this.chandelier(4.8, 8.65);
    for (let i = 0; i < 28; i++) {
      const floor = Math.floor(rand() * 3),
        x = -10.5 + rand() * 21;
      box(
        root,
        x,
        FLOORS[floor] + 0.035,
        0.1 + rand() * 0.8,
        0.07 + rand() * 0.14,
        0.06 + rand() * 0.05,
        0.08 + rand() * 0.1,
        darkStone,
      ).rotation.y = rand() * 3;
    }
    for (const l of room.ladders) this.ladder(l, wood, brass);
    for (const p of room.poles) {
      cylinder(
        root,
        p.x,
        (FLOORS[p.from] + FLOORS[p.to]) / 2 + 0.325,
        0.25,
        0.053,
        0.053,
        FLOORS[p.from] - FLOORS[p.to] + 0.65,
        brass,
      );
      sphere(root, p.x, FLOORS[p.from] + 0.62, 0.25, 0.11, brass);
      for (const f of [p.from, p.to])
        box(root, p.x, FLOORS[f] + 0.35, -0.35, 0.09, 0.08, 1.1, iron);
    }
    for (const key of room.keys) this.key(key);
    for (const s of room.switches) this.switch(s);
    for (const field of room.fields) this.field(field);
    for (const machine of room.lightning) this.lightning(machine);
    for (const trap of room.traps) this.trap(trap);
    for (const belt of room.conveyors) this.conveyor(belt);
    for (const t of room.teleporters) this.teleporter(t);
    for (const door of room.doors) this.door(door);
    for (const enemy of room.enemies) {
      const group = this.character(enemy.kind);
      root.add(group);
      this.enemyMeshes.push({ data: enemy, group });
    }
    if (index === 1) {
      this.sarcophagus(6.5, 3.6);
      this.crates(5, 0);
    } else if (index === 2) {
      this.workbench(3, 0);
      this.gear(-2, 9, 0.7);
    } else if (index === 4) {
      this.gear(-1.3, 9, 0.8);
      this.gear(-2.7, 8.65, 0.58);
      this.boiler(4, 0);
    } else {
      this.crates(index === 3 ? -5 : 4.7, 0);
      this.barrel(-1.1, 3.6);
    }
    this.cobweb(-10.9, 10.4);
    this.cobweb(10.8, 6.8, -1);
    this.dust(rand);
  }
  platform(from, to, y, trim, dark, brass) {
    let start = from;
    for (const hole of climbingOpenings(this.room, from, to, y)) {
      this.solidPlatform(start, hole.min, y, trim, dark, brass);
      const width = hole.max - hole.min,
        x = (hole.min + hole.max) / 2;
      // Recessed rear walkway and metal jambs make the shaft visibly open.
      box(this.root, x, y - 0.17, -1.16, width, 0.34, 0.55, dark);
      box(this.root, x, y + 0.015, -0.87, width, 0.055, 0.06, brass);
      for (const edge of [hole.min, hole.max])
        box(this.root, edge, y - 0.14, 0.3, 0.055, 0.28, 2.35, brass);
      start = hole.max;
    }
    this.solidPlatform(start, to, y, trim, dark, brass);
  }
  solidPlatform(from, to, y, trim, dark, brass) {
    if (to <= from) return;
    const w = to - from,
      x = (to + from) / 2;
    box(this.root, x, y - 0.17, 0.02, w, 0.34, 2.9, trim);
    box(this.root, x, y - 0.4, -0.06, w, 0.15, 2.78, dark);
    box(this.root, x, y - 0.29, 1.5, w, 0.055, 0.065, brass);
    for (let edge = from; edge < to; edge += 1.05) {
      const width = Math.min(1, to - edge),
        tx = edge + width / 2;
      box(
        this.root,
        tx,
        y + 0.012,
        0.01,
        width,
        0.032,
        2.78,
        material(0x858d77),
      );
      if (tx + 0.26 < to)
        box(this.root, tx, y - 0.57, 1.04, 0.19, 0.2, 0.48, dark);
    }
  }
  window(x, y, w, h, trim, index, showMoon = false) {
    const root = this.root,
      z = -1.36;
    const shape = new THREE.ShapeGeometry(archShape(w, h));
    mesh(shape, material(0x132b35, 0.1, 0.75, 0.23), root, x, y, z);
    const pane = mesh(
      new THREE.ShapeGeometry(archShape(w - 0.22, h - 0.13)),
      new THREE.MeshBasicMaterial({
        color: index === 3 ? 0x557789 : 0x385966,
        transparent: true,
        opacity: 0.55,
      }),
      root,
      x,
      y + 0.06,
      z + 0.03,
    );
    pane.castShadow = false;
    for (let side of [-1, 1])
      for (let i = 0; i < 4; i++)
        box(
          root,
          x + side * (w / 2 + 0.14),
          y + 0.18 + (i * (h - w / 2)) / 4,
          z + 0.12,
          0.28,
          (h - w / 2) / 4 - 0.035,
          0.32,
          trim,
        );
    const radius = w / 2 + 0.13,
      centerY = y + h - w / 2;
    for (let i = 0; i < 11; i++) {
      const a = ((i + 0.5) / 11) * Math.PI;
      const b = box(
        root,
        x + Math.cos(a) * radius,
        centerY + Math.sin(a) * radius,
        z + 0.13,
        0.26,
        0.38,
        0.34,
        trim,
      );
      b.rotation.z = a - Math.PI / 2;
    }
    for (const dx of [-w * 0.22, 0, w * 0.22]) {
      const top = h - w / 2 + Math.sqrt((w / 2) ** 2 - dx ** 2);
      box(root, x + dx, y + top / 2, z + 0.17, 0.045, top, 0.055, this.iron);
    }
    box(root, x, y + h * 0.43, z + 0.17, w, 0.05, 0.055, this.iron);
    box(root, x, y - 0.07, z + 0.18, w + 0.65, 0.16, 0.62, trim);
    if (showMoon)
      sphere(
        root,
        x - 0.25,
        y + h - 0.8,
        z + 0.05,
        0.19,
        material(0xc2d5c1, 0, 1, 0.6),
      ).name = "exterior-moon";
    // Soft diagonal shafts, kept behind the play plane.
    const rayGeo = new THREE.BufferGeometry();
    rayGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          x - 0.45,
          y + h - 0.5,
          -1.1,
          x + 0.1,
          y + h - 0.5,
          -1.1,
          x + 2.3,
          y - 0.05,
          -0.6,
          x + 1,
          y - 0.05,
          -0.6,
        ],
        3,
      ),
    );
    rayGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const ray = mesh(
      rayGeo,
      new THREE.MeshBasicMaterial({
        color: 0xb0d3d6,
        transparent: true,
        opacity: 0.045,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      root,
    );
    ray.castShadow = false;
  }
  torch(x, y, z, phase = 0) {
    const root = this.root,
      iron = material(0x373c31, 0.65, 0.6);
    box(root, x, y - 0.3, z - 0.13, 0.2, 0.52, 0.16, iron);
    const stem = cylinder(
      root,
      x,
      y - 0.22,
      z + 0.18,
      0.045,
      0.065,
      0.65,
      material(0x6a5434),
    );
    stem.rotation.x = -0.4;
    cylinder(root, x, y + 0.02, z + 0.3, 0.16, 0.1, 0.15, iron);
    const fire = mesh(
      new THREE.IcosahedronGeometry(0.17, 1),
      material(0xffac35, 0, 1, 4),
      root,
      x,
      y + 0.23,
      z + 0.3,
    );
    fire.scale.set(0.65, 1.8, 0.65);
    const core = mesh(
      new THREE.IcosahedronGeometry(0.11, 0),
      material(0xffe5a5, 0, 1, 5),
      root,
      x,
      y + 0.19,
      z + 0.36,
    );
    core.scale.y = 1.8;
    const glow = this.glow(root, x, y + 0.21, z + 0.5, 0xffa53d, 2.1, 0.42);
    const light = new THREE.PointLight(0xffa650, 11, 5.3, 1.8);
    light.position.set(x, y + 0.4, z + 1);
    root.add(light);
    this.torches.push({ fire, core, glow, light, phase: phase * 10 });
  }
  chandelier(x, y) {
    const iron = material(0x46483a, 0.7, 0.6);
    const ring = torus(this.root, x, y, -0.25, 0.46, 0.05, iron);
    ring.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      const cx = x + Math.cos(a) * 0.42,
        cz = -0.25 + Math.sin(a) * 0.42;
      cylinder(
        this.root,
        cx,
        y + 0.18,
        cz,
        0.044,
        0.052,
        0.33,
        material(0xd2c293),
      );
      this.glow(this.root, cx, y + 0.42, cz, 0xffbe65, 0.5, 0.4);
      sphere(this.root, cx, y + 0.4, cz, 0.035, material(0xffce6e, 0, 1, 4));
      line(
        this.root,
        [
          [cx, y, cz],
          [x, y + 0.6, -0.25],
        ],
        0x6d7159,
      );
    }
  }
  ladder(l, wood, brass) {
    const y1 = l.yBottom ?? FLOORS[l.from],
      y2 = l.yTop ?? FLOORS[l.to];
    for (const side of [-1, 1]) {
      box(
        this.root,
        l.x + side * 0.36,
        (y1 + y2) / 2 + 0.22,
        0.38,
        0.095,
        y2 - y1 + 0.44,
        0.15,
        wood,
      );
      for (const y of [y1 + 0.4, y2 - 0.3])
        box(this.root, l.x + side * 0.36, y, 0.42, 0.13, 0.19, 0.19, brass);
    }
    for (let y = y1 + 0.23; y < y2 + 0.25; y += 0.31) {
      cylinder(
        this.root,
        l.x,
        y,
        0.42,
        0.046,
        0.046,
        0.77,
        brass,
        8,
      ).rotation.z = Math.PI / 2;
    }
  }
  key(data) {
    const group = new THREE.Group();
    group.position.set(data.x, floorY(data) + 1.05, 0.8);
    this.root.add(group);
    const color = KEY_INFO[data.id]?.color ?? KEY_COLORS[data.id];
    const mat = material(color, 0.72, 0.25, 0.65);
    torus(group, 0, 0.18, 0, 0.2, 0.055, mat);
    box(group, 0, -0.19, 0, 0.075, 0.46, 0.09, mat);
    box(group, 0.1, -0.35, 0, 0.24, 0.07, 0.09, mat);
    box(group, 0.1, -0.23, 0, 0.22, 0.07, 0.09, mat);
    this.glow(group, 0, 0, -0.08, color, 1.6, 0.4);
    this.keyMeshes.push({ data, group });
    cylinder(
      this.root,
      data.x,
      floorY(data) + 0.09,
      0.62,
      0.39,
      0.45,
      0.18,
      material(0x536352),
      12,
    );
  }
  switch(data) {
    const group = new THREE.Group();
    group.position.set(data.x, floorY(data) + 0.97, -0.36);
    this.root.add(group);
    box(group, 0, 0, 0, 0.56, 0.73, 0.28, this.iron);
    box(group, 0, 0, 0.16, 0.45, 0.6, 0.04, material(0x96937b, 0.35, 0.5));
    for (const x of [-0.18, 0.18])
      for (const y of [-0.24, 0.24])
        sphere(group, x, y, 0.21, 0.024, this.iron);
    let handle;
    if (data.kind === "field") {
      handle = cylinder(
        group,
        0,
        0,
        0.26,
        0.15,
        0.15,
        0.1,
        material(0xd46f53, 0.4, 0.4, 0.3),
        6,
      );
      handle.rotation.x = Math.PI / 2;
      sphere(group, 0, 0, 0.34, 0.065, material(0xffd9a1, 0, 0.3, 1));
    } else {
      box(group, 0, 0, 0.22, 0.1, 0.41, 0.05, this.iron);
      handle = new THREE.Group();
      group.add(handle);
      handle.position.z = 0.23;
      cylinder(handle, 0, 0.15, 0.08, 0.035, 0.035, 0.36, this.brass);
      sphere(
        handle,
        0,
        0.32,
        0.08,
        0.1,
        material(data.kind === "power" ? 0xe6bc50 : 0xd87351, 0.3, 0.4, 0.2),
      );
      handle.rotation.x = 0.35;
    }
    this.switchMeshes.push({ data, group, handle });
  }
  field(data) {
    const group = new THREE.Group();
    group.position.set(data.x, floorY(data), 0.13);
    if (data.height) group.scale.y = data.height / 2.72;
    this.root.add(group);
    for (const y of [0.12, 2.6]) {
      box(group, 0, y, 0, 0.4, 0.2, 1.3, this.iron);
      box(
        group,
        0,
        y + 0.12,
        0,
        0.14,
        0.035,
        0.9,
        material(0x77daef, 0.4, 0.3, 2),
      );
    }
    const plane = mesh(
      new THREE.PlaneGeometry(0.09, 2.35),
      new THREE.MeshBasicMaterial({
        color: 0x81ddff,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      group,
      0,
      1.35,
      0.35,
    );
    const glow = this.glow(group, 0, 1.35, 0.38, 0x63dbff, 2.6, 0.24);
    const threads = [];
    for (let i = 0; i < 5; i++) {
      const pts = [];
      for (let y = 0.25; y <= 2.5; y += 0.14)
        pts.push([Math.sin(y * 15 + i) * 0.08, y, -0.4 + i * 0.22]);
      threads.push(line(group, pts, 0x94e9ff, 0.7));
    }
    this.fieldMeshes.push({ data, group, plane, glow, threads });
  }
  lightning(data) {
    const group = new THREE.Group();
    group.position.set(data.x, floorY(data), 0.23);
    this.root.add(group);
    box(group, 0, 2.82, -0.3, 0.92, 0.25, 0.8, this.iron);
    cylinder(group, 0, 2.46, -0.05, 0.1, 0.17, 0.7, this.brass);
    sphere(group, 0, 2.09, -0.05, 0.27, material(0xb4cacc, 0.92, 0.2));
    for (let y = 2.26; y < 2.7; y += 0.1) {
      const ring = torus(group, 0, y, -0.05, 0.21, 0.025, this.brass);
      ring.rotation.x = Math.PI / 2;
    }
    const bolts = [];
    for (let i = 0; i < 3; i++)
      bolts.push(
        line(
          group,
          Array.from({ length: 18 }, (_, j) => [
            0,
            0.08 + j * 0.108,
            0.18 + i * 0.15,
          ]),
          0xc2e6ff,
          1,
        ),
      );
    const glow = this.glow(group, 0, 1.2, 0.3, 0x7eaaff, 2.4, 0.32);
    this.lightningMeshes.push({ data, group, bolts, glow });
  }
  trap(data) {
    const pivot = new THREE.Group();
    pivot.position.set(data.x - data.width / 2, floorY(data) - 0.08, 0.1);
    this.root.add(pivot);
    box(pivot, data.width / 2, -0.06, 0, data.width, 0.15, 2.7, this.iron);
    for (let x = 0.12; x < data.width; x += 0.25)
      box(pivot, x, 0.035, 0, 0.1, 0.04, 2.55, material(0x777662, 0.6, 0.7));
    this.trapMeshes.push({ data, pivot });
  }
  conveyor(data) {
    const slats = [];
    for (let x = data.min; x < data.max; x += 0.32)
      slats.push(
        box(
          this.root,
          x,
          floorY(data) + 0.055,
          0.15,
          0.23,
          0.1,
          2.05,
          material(0x6f6c54, 0.4, 0.7),
        ),
      );
    for (let x of [data.min, data.max]) {
      const roll = cylinder(
        this.root,
        x,
        floorY(data) + 0.02,
        0.15,
        0.14,
        0.14,
        2.1,
        this.iron,
      );
      roll.rotation.x = Math.PI / 2;
    }
    this.beltMeshes.push({ data, slats });
  }
  teleporter(data) {
    const group = new THREE.Group();
    group.position.set(data.x, floorY(data), -0.15);
    if (this.original) group.scale.set(0.8, 0.72, 1);
    this.root.add(group);
    cylinder(group, 0, 0.09, 0.5, 0.55, 0.65, 0.18, this.iron);
    cylinder(group, 0, 2.1, 0.5, 0.57, 0.57, 0.15, this.iron);
    for (const side of [-1, 1])
      box(group, side * 0.52, 1.1, 0.1, 0.07, 2, 0.1, this.brass);
    const rings = [];
    for (let y = 0.3; y < 2; y += 0.3) {
      const r = torus(
        group,
        0,
        y,
        0.5,
        0.44,
        0.013,
        material(0x69cbdc, 0.1, 0.5, 1.5),
      );
      r.rotation.x = Math.PI / 2;
      rings.push(r);
    }
    const glow = this.glow(group, 0, 1, 0.5, 0x68c8ec, 2.2, 0.24);
    this.teleportMeshes.push({ data, group, rings, glow });
  }
  door(data) {
    const root = this.root,
      y = floorY(data),
      x = data.x,
      exit = data.target === "win",
      w = exit ? 2.35 : 1.3,
      h = exit ? 2.8 : 2.25;
    const mat = material(0x131c17);
    mesh(new THREE.ShapeGeometry(archShape(w, h)), mat, root, x, y, -0.66);
    const frame = material(exit ? 0xb0a17b : 0x8f9380);
    const radius = w / 2 + 0.11;
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++)
        box(
          root,
          x + side * (w / 2 + 0.13),
          y + 0.18 + (i * (h - w / 2)) / 5,
          -0.43,
          0.26,
          (h - w / 2) / 5 - 0.025,
          0.46,
          frame,
        );
    for (let i = 0; i < 9; i++) {
      const a = ((i + 0.5) / 9) * Math.PI;
      const b = box(
        root,
        x + Math.cos(a) * radius,
        y + h - w / 2 + Math.sin(a) * radius,
        -0.43,
        0.25,
        0.32,
        0.46,
        frame,
      );
      b.rotation.z = a - Math.PI / 2;
    }
    for (let dx = -w / 2 + 0.13; dx < w / 2; dx += 0.19) {
      const top = h - w / 2 + Math.sqrt((w / 2) ** 2 - dx ** 2);
      box(
        root,
        x + dx,
        y + top / 2,
        -0.51,
        0.14,
        top,
        0.14,
        material(0x514c38),
      );
    }
    for (const dy of [0.52, 1.42])
      box(root, x, y + dy, -0.35, w - 0.1, 0.08, 0.08, this.iron);
    const lockColor =
      data.key === "all" ? 0xe7ce84 : KEY_COLORS[data.key] || 0xb3be9a;
    torus(
      root,
      x + (exit ? 0.5 : 0.31),
      y + 1,
      -0.24,
      0.08,
      0.023,
      material(lockColor, 0.8, 0.35, 0.25),
    );
    box(root, x, y + 0.06, -0.01, w + 0.22, 0.12, 1.08, frame);
    this.glow(
      root,
      x,
      y + 1.2,
      -0.15,
      exit ? 0xd8c386 : 0xa6bc87,
      exit ? 2.4 : 1.2,
      0.12,
    );
    if (exit) {
      for (let i = 0; i < 3; i++)
        sphere(
          root,
          x + (i - 1) * 0.4,
          y + 2.15,
          -0.26,
          0.07,
          material(Object.values(KEY_COLORS)[i], 0.7, 0.3, 1),
        );
    } else {
      cylinder(
        root,
        x + (x > 8 ? -1 : 1) * 0.9,
        y + 1,
        -0.32,
        0.09,
        0.11,
        0.15,
        this.brass,
      ).rotation.x = Math.PI / 2;
    }
  }
  character(kind) {
    const g = new THREE.Group(),
      explorer = kind === "explorer",
      mummy = kind === "mummy";
    const coat = material(explorer ? 0x94513c : mummy ? 0xc3b58e : 0x3f4b3e),
      skin = material(explorer ? 0xd8b88e : mummy ? 0xc5bc96 : 0x879365),
      pants = material(explorer ? 0x6b644d : mummy ? 0xb8aa85 : 0x3b3d34),
      boot = material(0x282d27);
    const torso = box(g, 0, 0.9, 0, explorer ? 0.44 : 0.56, 0.53, 0.33, coat);
    const hips = box(g, 0, 0.58, 0, 0.37, 0.18, 0.28, pants);
    const head = box(g, 0, 1.37, 0, 0.33, 0.36, 0.32, skin);
    sphere(g, -0.18, 1.36, 0, 0.045, skin);
    sphere(g, 0.18, 1.36, 0, 0.045, skin);
    box(
      g,
      -0.09,
      1.4,
      0.17,
      0.037,
      0.038,
      0.015,
      material(mummy ? 0x68cdd2 : 0x222720, 0, 0.6, mummy ? 1 : 0),
    );
    box(
      g,
      0.09,
      1.4,
      0.17,
      0.037,
      0.038,
      0.015,
      material(mummy ? 0x68cdd2 : 0x222720, 0, 0.6, mummy ? 1 : 0),
    );
    box(g, 0, 1.33, 0.19, 0.067, 0.055, 0.07, skin);
    const legs = [];
    for (const x of [-0.13, 0.13]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.58, 0);
      g.add(pivot);
      box(pivot, 0, -0.21, 0, 0.15, 0.42, 0.19, pants);
      box(pivot, 0, -0.5, 0.06, 0.19, 0.15, 0.32, boot);
      legs.push(pivot);
    }
    const arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (explorer ? 0.29 : 0.35), 1.12, 0);
      g.add(pivot);
      box(pivot, 0, -0.18, 0, 0.14, 0.38, 0.2, coat);
      box(pivot, 0, -0.4, 0.015, 0.14, 0.12, 0.16, skin);
      arms.push(pivot);
    }
    if (explorer) {
      cylinder(g, 0, 1.57, 0, 0.31, 0.32, 0.07, material(0x464a35));
      cylinder(g, 0, 1.69, 0, 0.19, 0.22, 0.22, material(0x5d6144));
      cylinder(g, 0, 1.61, 0, 0.219, 0.224, 0.05, material(0x362f27));
      box(g, 0, 0.71, 0.185, 0.46, 0.085, 0.035, material(0x4a3c2b));
      box(g, 0, 0.71, 0.215, 0.09, 0.095, 0.028, material(0xc4a45c, 0.6));
      box(g, -0.17, 0.94, 0.19, 0.09, 0.39, 0.035, material(0xb2a37b));
      box(g, 0, 0.98, -0.23, 0.32, 0.38, 0.17, material(0x666046));
      const lamp = new THREE.Group();
      lamp.position.set(0, -0.61, 0.16);
      arms[1].add(lamp);
      box(lamp, 0, 0, 0, 0.17, 0.23, 0.17, material(0xffce83, 0.1, 0.3, 2));
      for (const x of [-0.105, 0.105])
        box(lamp, x, 0, 0, 0.027, 0.3, 0.22, material(0x544a32, 0.6));
      box(lamp, 0, -0.14, 0, 0.23, 0.05, 0.23, material(0x605037, 0.5));
      box(lamp, 0, 0.14, 0, 0.23, 0.055, 0.23, material(0x605037, 0.5));
      torus(lamp, 0, 0.23, 0, 0.09, 0.013, material(0x756240, 0.7));
      this.glow(lamp, 0, 0, 0.13, 0xffbc60, 0.85, 0.33);
    } else if (mummy) {
      for (let y = 0.68; y < 1.16; y += 0.09)
        box(g, 0, y, 0.176, 0.56, 0.025, 0.03, material(0x8e866a));
      for (let y = 1.24; y < 1.58; y += 0.075)
        box(g, 0, y, 0.164, 0.34, 0.018, 0.02, material(0x928a71));
      arms.forEach((a) => (a.rotation.x = -0.95));
    } else {
      box(g, 0, 1.58, -0.01, 0.39, 0.12, 0.35, material(0x222a22));
      for (const x of [-0.25, 0.25])
        cylinder(
          g,
          x,
          1.24,
          0,
          0.055,
          0.055,
          0.16,
          material(0x89978b, 0.8),
        ).rotation.z = Math.PI / 2;
      box(g, 0, 0.83, 0.18, 0.025, 0.44, 0.02, material(0x222b22));
    }
    g.userData = { legs, arms, head, torso, hips, kind };
    return g;
  }
  animateCharacter(group, p, time) {
    group.position.set(p.x, p.y + 0.035, 0.63);
    group.rotation.y = THREE.MathUtils.lerp(
      group.rotation.y,
      p.climbing ? Math.PI : p.facing * 0.3,
      0.16,
    );
    const stride = p.walking
      ? Math.sin(time * (p.climbing ? 11 : 10)) * 0.55
      : 0;
    group.userData.legs[0].rotation.x = stride;
    group.userData.legs[1].rotation.x = -stride;
    if (group.userData.kind === "explorer") {
      group.userData.arms[0].rotation.x = p.climbing
        ? -2 + stride
        : -stride * 0.7;
      group.userData.arms[1].rotation.x = p.climbing
        ? -2 - stride
        : stride * 0.4;
    }
    group.userData.torso.position.y =
      0.9 +
      (p.walking
        ? Math.abs(Math.sin(time * 10)) * 0.024
        : Math.sin(time * 2) * 0.01);
  }
  barrel(x, y) {
    const wood = material(0x61583e),
      root = this.root;
    cylinder(root, x, y + 0.45, -0.55, 0.35, 0.32, 0.85, wood);
    for (let dy of [0.13, 0.71]) {
      const r = torus(root, x, y + dy, -0.55, 0.343, 0.035, this.iron);
      r.rotation.x = Math.PI / 2;
    }
    cylinder(root, x, y + 0.89, -0.55, 0.31, 0.31, 0.04, material(0x72634b));
  }
  crates(x, y) {
    const wood = material(0x665d45);
    for (const [dx, dy, s] of [
      [0, 0.38, 0.72],
      [0.7, 0.28, 0.53],
      [0.1, 1, 0.52],
    ]) {
      box(this.root, x + dx, y + dy, -0.61, s, s, 0.65, wood);
      for (const side of [-1, 1]) {
        box(
          this.root,
          x + dx + side * s * 0.39,
          y + dy,
          -0.26,
          0.06,
          s,
          0.05,
          this.iron,
        );
        box(
          this.root,
          x + dx,
          y + dy + side * s * 0.39,
          -0.25,
          s,
          0.05,
          0.05,
          this.iron,
        );
      }
      const diag = box(
        this.root,
        x + dx,
        y + dy,
        -0.22,
        0.055,
        s * 1.22,
        0.045,
        material(0x9a8760),
      );
      diag.rotation.z = 0.65;
    }
  }
  sarcophagus(x, y) {
    box(this.root, x, y + 1, -0.8, 0.9, 1.95, 0.58, material(0x657261));
    box(this.root, x, y + 1, -0.44, 0.76, 1.8, 0.18, material(0x8e9379));
    torus(this.root, x, y + 1.29, -0.33, 0.14, 0.028, this.brass);
    line(
      this.root,
      [
        [x, y + 1.2, -0.3],
        [x, y + 0.75, -0.3],
      ],
      0xb9ac72,
    );
    line(
      this.root,
      [
        [x - 0.17, y + 1.04, -0.3],
        [x + 0.17, y + 1.04, -0.3],
      ],
      0xb9ac72,
    );
  }
  workbench(x, y) {
    box(this.root, x, y + 0.74, -0.6, 2.5, 0.16, 0.8, material(0x62553d));
    for (const dx of [-1, 1])
      box(this.root, x + dx, y + 0.35, -0.6, 0.13, 0.7, 0.6, this.iron);
    for (let i = 0; i < 5; i++) {
      const color = [0x72b7b4, 0x8dbd6e, 0xae7656][i % 3];
      cylinder(
        this.root,
        x - 0.9 + i * 0.43,
        y + 0.98,
        -0.58,
        0.06,
        0.15,
        0.32,
        material(color, 0.15, 0.3, 0.3),
      );
    }
    line(
      this.root,
      [
        [x - 0.6, y + 1.2, -0.5],
        [x - 0.6, y + 1.7, -0.5],
        [x + 0.4, y + 1.7, -0.5],
        [x + 0.4, y + 1.1, -0.5],
      ],
      0xa6b2a0,
    );
  }
  gear(x, y, r) {
    const g = new THREE.Group();
    g.position.set(x, y, -0.6);
    this.root.add(g);
    torus(g, 0, 0, 0, r * 0.75, r * 0.13, this.brass);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const b = box(
        g,
        Math.cos(a) * r,
        Math.sin(a) * r,
        0,
        0.22,
        r * 0.3,
        0.16,
        this.brass,
      );
      b.rotation.z = a - Math.PI / 2;
    }
    for (let i = 0; i < 4; i++) {
      box(g, 0, 0, 0.01, r * 1.5, 0.07, 0.11, this.iron).rotation.z =
        (i / 4) * Math.PI;
    }
    sphere(g, 0, 0, 0.1, r * 0.15, this.brass);
    this.gears.push(g);
  }
  boiler(x, y) {
    cylinder(this.root, x, y + 0.9, -0.5, 0.6, 0.6, 1.8, this.iron);
    sphere(this.root, x, y + 1.8, -0.5, 0.6, this.iron).scale.y = 0.45;
    for (const dy of [0.25, 1.55]) {
      const r = torus(this.root, x, y + dy, -0.5, 0.61, 0.04, this.brass);
      r.rotation.x = Math.PI / 2;
    }
    cylinder(this.root, x + 0.35, y + 2.3, -0.6, 0.09, 0.09, 1.05, this.brass);
    this.glow(this.root, x, y + 0.7, 0.13, 0xef9356, 1, 0.2);
    box(
      this.root,
      x,
      y + 0.7,
      0.13,
      0.39,
      0.32,
      0.04,
      material(0xdd884e, 0.3, 0.5, 0.8),
    );
  }
  cobweb(x, y, dir = 1) {
    for (let i = 0; i < 7; i++) {
      const a = ((i / 6) * Math.PI) / 2;
      line(
        this.root,
        [
          [x, y, -0.88],
          [x + Math.cos(a) * 1.1 * dir, y - Math.sin(a) * 1.1, -0.88],
        ],
        0xabb2a1,
        0.18,
      );
    }
    for (let r of [0.3, 0.55, 0.85, 1.1])
      line(
        this.root,
        Array.from({ length: 7 }, (_, i) => [
          x + Math.cos(((i / 6) * Math.PI) / 2) * r * dir,
          y - Math.sin(((i / 6) * Math.PI) / 2) * r,
          -0.88,
        ]),
        0xabb2a1,
        0.18,
      );
  }
  dust(rand) {
    const count = 160,
      positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 25;
      positions[i * 3 + 1] = rand() * 13 - 1;
      positions[i * 3 + 2] = rand() * 5 - 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.dustPoints = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xd1bd88,
        size: 0.035,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.root.add(this.dustPoints);
  }
  render(game, dt) {
    this.time += dt;
    const t = this.time;
    this.animateCharacter(this.player, game.player, t);
    this.player.visible = !game.deathTimer || Math.floor(t * 15) % 2 === 0;
    if (game.deathTimer) this.player.rotation.z = -0.5;
    else this.player.rotation.z = 0;
    for (const torch of this.torches) {
      const f =
        1 +
        Math.sin(t * 13 + torch.phase) * 0.1 +
        Math.sin(t * 21 + torch.phase) * 0.06;
      torch.fire.scale.y = 1.8 * f;
      torch.fire.rotation.y = t * 1.8;
      torch.fire.position.x += Math.sin(t * 17 + torch.phase) * 0.0007;
      torch.light.intensity = 10 * f;
      torch.glow.material.opacity = 0.38 * f;
    }
    for (const k of this.keyMeshes) {
      k.group.visible = !game.keys.has(k.data.id);
      k.group.position.y =
        floorY(k.data) +
        (this.original ? 0.74 : 1.08) +
        Math.sin(t * 2.2) * 0.1;
      k.group.rotation.y = t * 0.65;
    }
    for (const s of this.switchMeshes) {
      if (s.data.kind !== "field")
        s.handle.rotation.z = game.switches[s.data.id] ? -0.65 : 0.65;
    }
    for (const f of this.fieldMeshes) {
      const active = game.fieldActive(f.data);
      f.plane.visible = f.glow.visible = active;
      f.threads.forEach((l, i) => {
        l.visible = active;
        l.position.x = Math.sin(t * 14 + i) * 0.045;
      });
      f.plane.material.opacity = 0.35 + Math.sin(t * 18) * 0.12;
    }
    for (const l of this.lightningMeshes) {
      const active = game.lightningActive(l.data);
      l.glow.visible = active;
      l.bolts.forEach((b, i) => {
        b.visible = active;
        const p = b.geometry.attributes.position;
        for (let j = 0; j < p.count; j++)
          p.setX(
            j,
            j === 0 || j === p.count - 1
              ? 0
              : Math.sin(t * 53 + j * 21 + i * 4) * 0.16,
          );
        p.needsUpdate = true;
      });
    }
    for (const trap of this.trapMeshes)
      trap.pivot.rotation.z = THREE.MathUtils.lerp(
        trap.pivot.rotation.z,
        game.switches[trap.data.switch] ? -1.4 : 0,
        0.16,
      );
    for (const belt of this.beltMeshes) {
      belt.phase =
        (belt.phase || 0) +
        dt * (game.beltSpeed ? game.beltSpeed(belt.data) : belt.data.speed);
      belt.slats.forEach((s, i) => {
        const width = belt.data.max - belt.data.min;
        s.position.x =
          belt.data.min + ((((i * 0.32 + belt.phase) % width) + width) % width);
      });
    }
    for (const e of this.enemyMeshes) {
      const enemy = game.enemies.find((n) => n.id === e.data.id);
      e.group.visible = enemy.alive && enemy.active !== false;
      if (enemy.alive && enemy.active !== false)
        this.animateCharacter(
          e.group,
          {
            x: enemy.x,
            y: floorY(enemy),
            facing: enemy.facing,
            walking:
              enemy.walking ?? Math.abs(game.player.y - floorY(enemy)) < 1,
            climbing: enemy.climbing,
          },
          t * 0.75,
        );
      else if (enemy.death) this.animateEnemyDeath(e, enemy);
    }
    for (const p of this.teleportMeshes)
      p.rings.forEach((r, i) => {
        r.position.y = 0.3 + ((i * 0.3 + t * 0.42) % 1.6);
        r.scale.setScalar(0.9 + Math.sin(t * 3 + i) * 0.1);
      });
    this.gears.forEach((g, i) => (g.rotation.z = t * 0.15 * (i % 2 ? -1 : 1)));
    if (this.dustPoints) {
      const p = this.dustPoints.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.array[i * 3] += 0.008 * dt * Math.sin(t + i);
        p.array[i * 3 + 1] += 0.06 * dt;
        if (p.array[i * 3 + 1] > 12) p.array[i * 3 + 1] = -1;
      }
      p.needsUpdate = true;
    }
    this.renderOriginal?.(game, dt);
    this.composer.render(dt);
  }
  animateEnemyDeath(record, enemy) {
    const death = enemy.death,
      pose = deathPose(death),
      group = record.group;
    group.visible = !pose.finished;
    if (!record.deathMaterials) {
      record.deathMaterials = [];
      group.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          record.deathMaterials.push(o.material);
        }
      });
      const fx = new THREE.Group();
      this.root.add(fx);
      record.deathFX = fx;
      record.fragments = [];
      const color = enemy.kind === "mummy" ? 0xb9aa82 : 0x90ad78;
      const dustMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
      for (let i = 0; i < 22; i++) {
        const shard = box(
          fx,
          0,
          0,
          0,
          enemy.kind === "mummy" ? 0.16 : 0.07,
          enemy.kind === "mummy" ? 0.025 : 0.07,
          0.035,
          dustMat,
        );
        record.fragments.push(shard);
      }
      record.deathGlow = this.glow(
        fx,
        0,
        0,
        0,
        death.cause === "lightning"
          ? 0x9bbfff
          : death.cause === "ray"
            ? 0xff9978
            : 0xc8b78a,
        2.4,
        0.6,
      );
      record.deathSparks = [];
      if (death.cause !== "fall")
        for (let i = 0; i < 7; i++) {
          const spark = line(
            fx,
            Array.from({ length: 7 }, () => [0, 0, 0]),
            death.cause === "lightning" ? 0xb8deff : 0xffae76,
          );
          spark.material.transparent = true;
          spark.material.depthWrite = false;
          record.deathSparks.push(spark);
        }
    }
    group.position.set(pose.x, pose.y + 0.05, 0.7);
    group.rotation.set(0, 0.2 * enemy.facing, pose.rotation);
    const u = group.userData,
      t = death.time;
    u.arms[0].rotation.z = -0.8 - Math.sin(t * 14) * 0.5;
    u.arms[1].rotation.z = 0.8 + Math.sin(t * 13) * 0.5;
    u.arms.forEach(
      (a) => (a.rotation.x = pose.shock ? Math.sin(t * 80) * 0.7 : -0.5),
    );
    u.legs[0].rotation.x = 0.9 * Math.sin(t * 8);
    u.legs[1].rotation.x = -0.65 * Math.sin(t * 8 + 0.7);
    for (const m of record.deathMaterials) {
      m.opacity = pose.opacity;
      if (m.emissive) {
        m.emissive.setHex(pose.shock ? 0x8dafff : 0x000000);
        m.emissiveIntensity = pose.shock ? 1.8 : 0;
      }
    }
    record.deathFX.visible = !pose.finished;
    record.deathGlow.position.set(pose.x, pose.y + 0.6, 1);
    record.deathGlow.material.opacity = pose.shock
      ? 0.65
      : death.cause === "ray"
        ? Math.max(0, 0.8 - t * 2)
        : pose.impact * 0.25;
    record.deathSparks.forEach((spark, i) => {
      spark.visible = t < 0.85;
      const positions = spark.geometry.attributes.position,
        angle = (i * Math.PI * 2) / 7;
      for (let j = 0; j < positions.count; j++) {
        const r = j * 0.14 * (1 + t),
          jitter = Math.sin(t * 95 + i * 9 + j * 13) * 0.09;
        positions.setXYZ(
          j,
          death.x + Math.cos(angle) * r + jitter,
          death.y + 0.65 + Math.sin(angle) * r + jitter,
          0.95,
        );
      }
      positions.needsUpdate = true;
      spark.material.opacity = Math.max(0, 1 - t / 0.85);
    });
    record.fragments.forEach((s, i) => {
      const a = i * 2.39996,
        age = Math.max(0, t - (death.cause === "lightning" ? 0.3 : 0.13));
      s.position.set(
        death.x + Math.cos(a) * age * (0.4 + (i % 4) * 0.2),
        Math.max(
          death.impactY + 0.04,
          death.y + 0.7 + Math.sin(a) * age - 2.1 * age * age,
        ),
        0.8 + Math.sin(a) * age * 0.4,
      );
      s.rotation.set(age * ((i % 3) + 1), a + age * 4, age * 3);
      s.material.opacity = pose.opacity * 0.7;
    });
  }
  screenPosition(x, y) {
    const p = new THREE.Vector3(x, y, 0.7).project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.host.clientWidth,
      y: (-p.y * 0.5 + 0.5) * this.host.clientHeight,
    };
  }
}
export {
  material,
  mesh,
  box,
  cylinder,
  sphere,
  torus,
  line,
  seeded,
  archShape,
  unitBox,
  floorY,
};
