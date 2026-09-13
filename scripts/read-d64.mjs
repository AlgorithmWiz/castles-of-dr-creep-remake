import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const path =
  process.argv[2] ||
  ".reference/original/The Castles of Dr Creep/d64/Castles of Doctor Creep.d64";
const disk = readFileSync(path);
function offset(track, sector) {
  let blocks = 0;
  for (let t = 1; t < track; t++)
    blocks += t <= 17 ? 21 : t <= 24 ? 19 : t <= 30 ? 18 : 17;
  return (blocks + sector) * 256;
}
mkdirSync(".reference/extracted", { recursive: true });
let track = 18,
  sector = 1;
const files = [];
while (track) {
  const directory = offset(track, sector);
  track = disk[directory];
  sector = disk[directory + 1];
  for (let slot = 0; slot < 8; slot++) {
    const entry = directory + 2 + slot * 32;
    if (!(disk[entry] & 7)) continue;
    let name = Array.from(disk.subarray(entry + 3, entry + 19))
      .filter((c) => c !== 160)
      .map((c) => String.fromCharCode(c >= 193 && c <= 218 ? c - 128 : c))
      .join("");
    let t = disk[entry + 1],
      s = disk[entry + 2],
      parts = [],
      seen = new Set();
    while (t) {
      const o = offset(t, s);
      if (seen.has(o)) throw Error("Cyclic file sectors");
      seen.add(o);
      const nt = disk[o],
        ns = disk[o + 1];
      parts.push(disk.subarray(o + 2, o + (nt ? 256 : ns + 1)));
      t = nt;
      s = ns;
    }
    const data = Buffer.concat(parts),
      safe = name.replace(/[^a-z0-9_-]/gi, "_");
    writeFileSync(`.reference/extracted/${safe}.prg`, data);
    files.push({
      name,
      file: `${safe}.prg`,
      size: data.length,
      loadAddress: data.readUInt16LE(0).toString(16),
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }
}
writeFileSync(
  ".reference/extracted/directory.json",
  JSON.stringify(files, null, 2),
);
console.log(files);
