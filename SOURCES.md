# Original castle data and acknowledgements

The Castles of Dr. Creep, its original castle designs, object data and tutorial text were created by **Ed Hobbs** and published by **Brøderbund in 1984**. They are credited to their original creators, not presented as new level designs. Blackthorn is the six-room bonus estate created for this remake.

## Data source

Room records were extracted from `The Castles of Dr Creep/d64/Castles of Doctor Creep.d64` in [Piddewitt/The-Castles-of-Dr-Creep](https://github.com/Piddewitt/The-Castles-of-Dr-Creep), pinned to commit **7bc5b5c3a9a2db1b99bb16e356b8c7e798c25ce0**. Its documented reverse assembly, notably `inc/CC_Items.asm`, `inc/CC_Var.asm` and `asm/object.asm`, describes the original room object records and control behavior.

The data format and mechanics were cross-checked against [Robert Crossfield’s DrCreep project](https://github.com/segrax/DrCreep), pinned to commit **5e678c1b0c80682ee113380c82ba4a8327da06f0**: castle/room readers, object headers, the original layout drawings and mechanism execution routines. That project is GPL-3.0; it is a research reference, not a linked or compiled dependency of this JavaScript remake. The JavaScript engine and importer were written for this project.

The shipped runtime contains decoded numeric level records and original tutorial text, rather than the C64 executable, disk image, original bitmap artwork or music. Each castle in `src/data/original-castles.json` contains a `sourceHash`: SHA-256 of its complete extracted PRG file, including its two-byte load address. The JSON retains the room-directory offsets, map geometry, raw object records and original room numbering.

## Reproduce the import

With a local copy of the referenced disk image:

```powershell
node scripts/read-d64.mjs "C:\path\to\Castles of Doctor Creep.d64"
node scripts/import-original.mjs
node scripts/audit-originals.mjs
node scripts/analyze-routes.mjs
npm test
```

The disk reader writes the original files and their hashes under `.reference/extracted/`. The importer reads the PRG room table and the terminated object lists, then generates `src/data/original-castles.json` and `src/data/original-castles.js`. Generated data is already included; no disk image is required to play. Research checkouts, extracted files and the pre-expansion backup are excluded by `.gitignore`.

## Remake assets

Scene geometry, stone textures, props, models, interface styling, particles, death choreography and Web Audio sounds are newly authored in code. Three.js r186 is copied from the user’s local `C:\three.js-master` distribution; its MIT license is retained in `vendor/LICENSE`. Optional typefaces load from Google Fonts, with local system-font fallbacks.
