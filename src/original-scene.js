import * as THREE from "three";
import {
  CastleScene,
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
} from "./scene.js";
import { KEY_INFO, PALETTE } from "./catalog.js";

export class RemakeScene extends CastleScene {
  build(room, index = 0) {
    if (!room.original) return super.build(room, index);
    this.clearRoom();
    this.original = true;
    this.room = room;
    this.player.scale.setScalar(0.72);
    this.camera.lookAt(0, 5.15, 0);
    const root = this.root,
      rand = seeded(700 + index * 31 + room.color * 83);
    const stoneColor = new THREE.Color(room.tint).lerp(
      new THREE.Color(0x70786d),
      0.78,
    );
    const stone = new THREE.MeshStandardMaterial({
      color: stoneColor,
      map: this.stoneMap,
      roughness: 0.94,
    });
    const trim = material(0x949881),
      dark = material(0x46534b),
      iron = material(0x353e36, 0.7, 0.5),
      brass = material(0xab945b, 0.6, 0.45);
    this.trim = trim;
    this.iron = iron;
    this.brass = brass;
    const blocks = [];
    for (let row = 0; row < 19; row++)
      for (let col = 0; col < 20; col++) {
        const x = -11.7 + col * 1.2 + (row % 2 ? 0.6 : 0);
        if (x > 11.8) continue;
        blocks.push({ x, y: -0.05 + row * 0.65, z: -1.9 + rand() * 0.06 });
      }
    const inst = new THREE.InstancedMesh(unitBox, stone, blocks.length),
      m = new THREE.Matrix4();
    inst.castShadow = inst.receiveShadow = true;
    blocks.forEach((b, i) => {
      m.compose(
        new THREE.Vector3(b.x, b.y, b.z),
        new THREE.Quaternion(),
        new THREE.Vector3(1.16, 0.6, 0.7),
      );
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, new THREE.Color().setScalar(0.79 + rand() * 0.35));
    });
    root.add(inst);
    box(root, 0, -0.85, -0.35, 24.3, 1.1, 3.35, dark);
    box(root, 0, -1.47, -0.3, 24.8, 0.22, 3.7, trim);
    for (let x = -11.5; x < 12; x += 1.1)
      box(root, x, -0.85, 1.39, 1.02, 0.85, 0.12, stone);
    box(root, 0, 12.25, -1.4, 24.3, 0.26, 1.6, trim);
    box(root, 0, 11.94, -1.5, 24, 0.26, 1.1, dark);
    for (let x = -11.4; x < 12; x += 1.27)
      box(root, x, 12.62, -1.7, 0.7, 0.48, 1, stone);
    for (const x of [-11.8, 11.8]) {
      box(root, x, 5.7, -0.8, 0.65, 12.7, 1.4, dark);
      for (let y = -0.2; y < 12.4; y += 0.58)
        box(root, x, y, -0.05, 0.83, 0.53, 0.35, stone);
      for (let y of [0, 4, 8, 12]) box(root, x, y, -0.4, 1.13, 0.23, 1.3, trim);
    }
    for (const y of [0, 3.85, 7.7])
      for (const x of [-7.9, 0, 7.9])
        this.window(x, y + 0.35, 2.5, 3, trim, index % 6);
    for (const x of [-4.1, 4.1]) {
      cylinder(root, x, 5.8, -1.03, 0.2, 0.25, 11.4, stone, 10);
      for (let y of [0.2, 4, 8, 11.5])
        box(root, x, y, -0.95, 0.56, 0.2, 0.45, trim);
    }
    // Walkways are the source segments, including their real gaps and intermediate heights.
    for (const p of room.platforms) {
      const traps = room.traps
        .filter(
          (t) =>
            Math.abs(t.y - p.y) < 0.01 &&
            t.x + t.width / 2 > p.min &&
            t.x - t.width / 2 < p.max,
        )
        .sort((a, b) => a.x - b.x);
      let start = p.min;
      for (const t of traps) {
        this.platform(
          start,
          Math.max(start, t.x - t.width / 2),
          p.y,
          trim,
          dark,
          brass,
        );
        start = Math.max(start, t.x + t.width / 2);
      }
      this.platform(start, p.max, p.y, trim, dark, brass);
      box(
        root,
        (p.min + p.max) / 2,
        p.y - 0.27,
        1.54,
        p.max - p.min,
        0.07,
        0.03,
        material(PALETTE[room.color], 0.1, 0.9, 0.1),
      );
    }
    const torchSites = [
      [-10, 2.2],
      [3.1, 3],
      [-3, 7],
      [10, 8.9],
      [-9, 11],
    ];
    for (const [x, y] of torchSites) this.torch(x, y, -0.7, rand());
    for (const l of room.ladders) this.ladder(l, material(0x605b3e), brass);
    for (const p of room.poles) {
      cylinder(
        root,
        p.x,
        (p.yTop + p.yBottom) / 2 + 0.12,
        0.3,
        0.045,
        0.045,
        p.yTop - p.yBottom + 0.36,
        brass,
      );
      sphere(root, p.x, p.yTop + 0.33, 0.3, 0.09, brass);
      for (const y of p.stops)
        box(root, p.x, y + 0.15, -0.2, 0.07, 0.075, 0.9, iron);
    }
    for (const k of room.keys) {
      this.key(k);
      this.keyMeshes.at(-1).group.scale.setScalar(0.72);
    }
    for (const s of room.switches) this.switch(s);
    for (const f of room.fields) this.field(f);
    for (const l of room.lightning) this.lightning(l);
    for (const t of room.traps) this.trap(t);
    for (const b of room.conveyors) this.conveyor(b);
    for (const t of room.teleporters) {
      this.teleporter(t);
      const record = this.teleportMeshes.at(-1);
      record.rings.forEach((r) => (r.material = r.material.clone()));
    }
    for (const r of room.receivers) {
      const marker = torus(
        root,
        r.x,
        r.y + 0.7,
        -0.16,
        0.25,
        0.025,
        material(r.color, 0.3, 0.4, 0.65),
      );
      marker.scale.y = 1.5;
      this.glow(root, r.x, r.y + 0.7, -0.1, r.color, 1.3, 0.2);
      this.label(r.name, r.x, r.y + 1.24, -0.2, 0.7, 0xcad7b4);
    }
    for (const d of room.doors) this.door(d);
    for (const g of room.guns) this.rayGun(g);
    for (const e of room.enemies) {
      const group = this.character(e.kind);
      group.scale.setScalar(0.72);
      root.add(group);
      this.enemyMeshes.push({ data: e, group });
      this.sarcophagus(e.x, e.y);
      if (e.kind === "mummy") {
        const tx = e.trigger.x,
          ty = e.trigger.y;
        torus(
          root,
          tx,
          ty + 0.92,
          -0.18,
          0.13,
          0.025,
          material(0x6dd9e5, 0.3, 0.5, 0.8),
        );
        box(
          root,
          tx,
          ty + 0.66,
          -0.17,
          0.04,
          0.32,
          0.04,
          material(0x6dd9e5, 0.3, 0.5, 0.6),
        );
        box(
          root,
          tx,
          ty + 0.73,
          -0.17,
          0.25,
          0.04,
          0.04,
          material(0x6dd9e5, 0.3, 0.5, 0.6),
        );
      }
    }
    if (room.notes.length) this.tutorialPlaque(room);
    this.cobweb(-10.8, 11.4);
    this.cobweb(10.9, 6.8, -1);
    this.dust(rand);
  }
  label(text, x, y, z, width = 1, color = 0xcbbb91) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d");
    ctx.font = "500 30px Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    (this.roomTextures ||= []).push(texture);
    const sign = mesh(
      new THREE.PlaneGeometry(width, width / 4),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      }),
      this.root,
      x,
      y,
      0.7,
    );
    sign.castShadow = false;
    return sign;
  }
  tutorialPlaque(room) {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#1b2720";
    ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = "#8e8051";
    ctx.lineWidth = 5;
    ctx.strokeRect(15, 15, 994, 482);
    ctx.textAlign = "center";
    ctx.fillStyle = "#dbcc9d";
    ctx.font = "44px Georgia";
    ctx.fillText(room.name, 512, 82);
    ctx.fillStyle = "#aebb9f";
    ctx.font = "25px Georgia";
    const words = room.description.split(" "),
      lines = [];
    let text = "";
    for (const word of words) {
      if (ctx.measureText(text + " " + word).width > 910) {
        lines.push(text);
        text = word;
      } else text += (text ? " " : "") + word;
    }
    if (text) lines.push(text);
    lines.slice(0, 9).forEach((l, i) => ctx.fillText(l, 512, 143 + i * 35));
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    (this.roomTextures ||= []).push(texture);
    mesh(
      new THREE.PlaneGeometry(10, 5),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }),
      this.root,
      0,
      8.8,
      -1.1,
    );
  }
  switch(s) {
    if (!this.original) return super.switch(s);
    const group = new THREE.Group();
    group.position.set(s.x, s.y + 0.72, -0.2);
    this.root.add(group);
    box(group, 0, 0, 0, 0.48, 0.57, 0.23, this.iron);
    box(group, 0, 0, 0.13, 0.38, 0.46, 0.03, material(0x969780, 0.4, 0.6));
    let handle;
    if (["bell", "field", "lock"].includes(s.kind)) {
      const color =
        s.kind === "lock"
          ? KEY_INFO[s.key].color
          : s.kind === "field"
            ? 0xda7861
            : 0xd7c394;
      handle = cylinder(
        group,
        0,
        0,
        0.2,
        0.12,
        0.12,
        0.08,
        material(color, 0.55, 0.35, 0.2),
        s.kind === "field" ? 6 : 16,
      );
      handle.rotation.x = Math.PI / 2;
      if (s.kind === "lock") {
        sphere(group, 0, 0.03, 0.26, 0.04, this.iron);
        box(group, 0, -0.03, 0.26, 0.032, 0.06, 0.01, this.iron);
      } else sphere(group, 0, 0, 0.27, 0.05, material(0xffe4b2, 0, 0.5, 0.6));
    } else {
      handle = new THREE.Group();
      group.add(handle);
      handle.position.z = 0.13;
      cylinder(handle, 0, 0.06, 0.08, 0.025, 0.025, 0.29, this.brass);
      sphere(
        handle,
        0,
        0.21,
        0.08,
        0.07,
        material(
          s.kind === "power"
            ? 0xe7c867
            : s.kind === "gun"
              ? 0x80bbce
              : 0xc09d72,
          0.3,
          0.5,
          0.3,
        ),
      );
    }
    if (s.kind === "trap") {
      group.position.y = s.y + 0.52;
      group.scale.setScalar(0.8);
    }
    this.switchMeshes.push({ data: s, group, handle });
    if (s.door !== undefined)
      this.label(String(s.door + 1), s.x, s.y + 1.14, -0.16, 0.45);
  }
  lightning(data) {
    if (!this.original) return super.lightning(data);
    const group = new THREE.Group();
    group.position.set(data.x, data.y, 0.23);
    this.root.add(group);
    const orb = data.orbY - data.y,
      mount = data.mountY - data.y;
    box(group, 0, mount, -0.23, 0.65, 0.15, 0.6, this.iron);
    cylinder(
      group,
      0,
      (mount + orb) / 2,
      -0.05,
      0.075,
      0.075,
      Math.max(0.1, mount - orb),
      this.brass,
    );
    sphere(group, 0, orb, -0.05, 0.22, material(0xbfcdd0, 0.9, 0.2));
    for (let y = orb + 0.2; y < mount; y += 0.14) {
      const ring = torus(group, 0, y, -0.05, 0.15, 0.021, this.brass);
      ring.rotation.x = Math.PI / 2;
    }
    const bolts = [];
    for (let i = 0; i < 3; i++)
      bolts.push(
        line(
          group,
          Array.from({ length: 18 }, (_, j) => [
            0,
            0.05 + (j * Math.max(0.1, orb - 0.12)) / 17,
            0.16 + i * 0.08,
          ]),
          0xb8d8ff,
        ),
      );
    const glow = this.glow(
      group,
      0,
      orb * 0.5,
      0.25,
      0x7497ff,
      Math.max(1, orb),
      0.25,
    );
    this.lightningMeshes.push({ data, group, bolts, glow });
  }
  door(data) {
    if (!this.original) return super.door(data);
    const root = this.root,
      x = data.x,
      y = data.y,
      w = 1.85,
      h = 1.9,
      r = w / 2,
      exit = data.target === "win";
    mesh(
      new THREE.ShapeGeometry(archShape(w, h)),
      material(exit ? 0x334741 : 0x152721, 0, 1, 0.12),
      root,
      x,
      y,
      -0.53,
    );
    const frame = material(exit ? 0xb7ab7b : 0x919480),
      gate = new THREE.Group();
    gate.position.set(x - r, y, -0.31);
    root.add(gate);
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++)
        box(
          root,
          x + side * (r + 0.1),
          y + 0.14 + (i * (h - r)) / 4,
          -0.28,
          0.2,
          (h - r) / 4 - 0.022,
          0.38,
          frame,
        );
    for (let i = 0; i < 9; i++) {
      const a = ((i + 0.5) / 9) * Math.PI;
      const b = box(
        root,
        x + Math.cos(a) * (r + 0.09),
        y + h - r + Math.sin(a) * (r + 0.09),
        -0.28,
        0.22,
        0.26,
        0.37,
        frame,
      );
      b.rotation.z = a - Math.PI / 2;
    }
    for (let dx = -r + 0.13; dx < r; dx += 0.19) {
      const top = h - r + Math.sqrt(r * r - dx * dx);
      box(gate, dx + r, top / 2, 0, 0.095, top, 0.1, this.iron);
    }
    box(gate, r, 0.6, 0, w, 0.055, 0.12, this.brass);
    box(gate, r, 1.25, 0, w, 0.055, 0.12, this.brass);
    box(root, x, y + 0.025, -0.02, w + 0.1, 0.05, 1.03, frame);
    this.label(
      exit ? "EXIT" : String(data.index + 1),
      x,
      y + h + 0.3,
      -0.15,
      exit ? 1 : 0.65,
    );
    const glow = this.glow(
      root,
      x,
      y + 0.85,
      -0.22,
      exit ? 0xdfc78b : 0x87b1ac,
      2,
      0.1,
    );
    this.doorMeshes.push({ data, gate, glow, open: 0 });
  }
  rayGun(data) {
    const root = this.root;
    box(
      root,
      data.x,
      (data.yBottom + data.yTop) / 2,
      -0.2,
      0.14,
      Math.max(0.18, data.yTop - data.yBottom),
      0.2,
      this.iron,
    );
    for (let y = data.yBottom; y < data.yTop; y += 0.25)
      box(root, data.x + 0.12, y, -0.13, 0.12, 0.055, 0.2, this.brass);
    const head = new THREE.Group();
    head.position.set(data.x, data.headY, 0.16);
    root.add(head);
    sphere(head, 0, 0, 0, 0.19, material(0x687f79, 0.8, 0.35));
    const barrel = cylinder(
      head,
      data.direction * 0.3,
      0,
      0,
      0.085,
      0.11,
      0.5,
      this.brass,
    );
    barrel.rotation.z = Math.PI / 2;
    const eye = sphere(
      head,
      data.direction * 0.52,
      0,
      0,
      0.073,
      material(0xff9276, 0.1, 0.3, 1.6),
    );
    const glow = this.glow(
      head,
      data.direction * 0.53,
      0,
      0.05,
      0xff7551,
      1,
      0.2,
    );
    this.gunMeshes.push({ data, head, eye, glow });
  }
  renderOriginal(game, dt) {
    if (!this.original) return;
    for (const d of this.doorMeshes) {
      d.open = THREE.MathUtils.lerp(
        d.open,
        game.doorOpen(d.data) ? 1 : 0,
        Math.min(1, dt * 7),
      );
      d.gate.rotation.y = -d.open * 1.42;
      d.glow.material.opacity = 0.07 + d.open * 0.14;
    }
    for (const g of this.gunMeshes) {
      const gun = game.guns.find((n) => n.id === g.data.id);
      g.head.position.y = gun.y;
      g.glow.material.opacity = 0.15 + Math.min(0.6, gun.charge);
    }
    for (const p of this.projectileMeshes) {
      this.root.remove(p);
      p.geometry.dispose();
      p.material.dispose();
    }
    this.projectileMeshes = [];
    for (const shot of game.projectiles) {
      const bolt = mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.65, 6),
        new THREE.MeshBasicMaterial({ color: 0xffb9a1 }),
        this.root,
        shot.x,
        shot.y,
        0.8,
      );
      bolt.rotation.z = Math.PI / 2;
      this.projectileMeshes.push(bolt);
    }
    for (const t of this.teleportMeshes) {
      const target = t.data.targets[game.state.teleports[t.data.id]];
      if (target) {
        t.rings.forEach((r) => r.material.color.setHex(target.color));
        t.glow.material.color.setHex(target.color);
      }
    }
  }
}
