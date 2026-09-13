import { Game, validateSave } from "./game.js";
import { ClassicGame, validateClassicSave } from "./classic-game.js";
import { RemakeScene } from "./original-scene.js";
import { CastleAudio } from "./audio.js";
import { ALL_CASTLES, castleById, KEY_INFO } from "./catalog.js";
import { castleMap } from "./castle-map.js";

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = "dr-creep-settings-v1",
  LAST_CASTLE_KEY = "dr-creep-selected-castle",
  COMPLETED_KEY = "dr-creep-conquered-v2";
let castle = castleById(readStorage(LAST_CASTLE_KEY)) || castleById("sylvania");
const savedKey = () =>
  castle.original ? `dr-creep-${castle.id}-v2` : "dr-creep-blackthorn-v1";
const completedValue = readStorage(COMPLETED_KEY);
const completed =
  completedValue &&
  typeof completedValue === "object" &&
  !Array.isArray(completedValue)
    ? completedValue
    : {};
const input = new Set(),
  taps = new Map(),
  audio = new CastleAudio();
let view,
  game,
  saved,
  toastTimer,
  modalType = "",
  previousFocus,
  lastSave = 0,
  uiTick = 0;
let settings = { sound: false, volume: 0.3, quality: "high" };
function clearInput() {
  input.clear();
  taps.clear();
}
function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}
function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Play remains available when browser storage is disabled. */
  }
}
function save() {
  if (game.started && !game.won) {
    saved = game.snapshot();
    writeStorage(savedKey(), saved);
  }
}
function readSave(c = castle) {
  return c.original
    ? validateClassicSave(readStorage(`dr-creep-${c.id}-v2`))
    : validateSave(readStorage("dr-creep-blackthorn-v1"));
}
saved = readSave();
const storedSettings = readStorage(SETTINGS_KEY);
if (storedSettings)
  settings = {
    sound: storedSettings.sound === true,
    volume: Number.isFinite(storedSettings.volume)
      ? Math.max(0, Math.min(1, storedSettings.volume))
      : 0.3,
    quality: storedSettings.quality === "low" ? "low" : "high",
  };
audio.setVolume(settings.volume);
if (
  saved &&
  (saved.keys.length || saved.visited.length > 1 || saved.elapsed > 10)
)
  $("continue-btn").classList.remove("hidden");

try {
  view = new RemakeScene($("canvas-host"));
  game = castle.original ? new ClassicGame(castle) : new Game();
  view.build(game.room, game.roomIndex);
  view.setQuality(settings.quality);
} catch (error) {
  console.error("Unable to initialize the castle:", error);
  $("start-overlay").innerHTML =
    '<div class="intro-card"><div class="eyebrow">THE DRAWBRIDGE IS STUCK</div><h2>A little technical trouble.</h2><p>This game needs WebGL. Enable hardware acceleration in your browser, then reload the page.</p><button class="primary-button" onclick="location.reload()">Try again ↗</button></div>';
  throw error;
}

function notify(text, duration = 4100) {
  clearTimeout(toastTimer);
  $("toast").textContent = text;
  $("toast").classList.remove("hidden");
  toastTimer = setTimeout(() => $("toast").classList.add("hidden"), duration);
}
function formatTime(time) {
  const seconds = Math.floor(time);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function updateUI() {
  $("time-value").textContent = formatTime(game.elapsed);
  $("returns-value").textContent = game.returns;
  $("explored-value").textContent =
    `${game.visited.size} / ${castle.rooms.length}`;
  $("explored-bar").style.width =
    `${(game.visited.size / castle.rooms.length) * 100}%`;
  $("key-count").textContent = `${game.keys.size} / ${castle.keyIds.length}`;
  for (const key of castle.keyIds) {
    $(`key-${key}`).classList.toggle("collected", game.keys.has(key));
    $(`key-${key}`).setAttribute(
      "aria-label",
      `${key === "bronze" ? "Brass" : key} key: ${game.keys.has(key) ? "collected" : "missing"}`,
    );
  }
  $("mini-map").innerHTML = castle.rooms
    .map(
      (room, i) =>
        `<div class="mini-node ${game.visited.has(i) ? "visited" : ""} ${game.started && game.roomIndex === i ? "current" : ""}" title="${room.name}"></div>`,
    )
    .join("");
  $("stage-status").textContent = game.won
    ? "THE CASTLE HAS BEEN CONQUERED"
    : game.started
      ? game.paused
        ? "EXPEDITION PAUSED"
        : `EXPLORING ${castle.name.toUpperCase()}`
      : "AWAITING EXPLORER";
  $("pause-btn").disabled = !game.started || game.won;
}
function castleUI() {
  $("castle-heading").textContent =
    `${castle.name.toUpperCase()}${castle.id === "tutorial" ? "" : " CASTLE"}`;
  $("edition-heading").textContent = castle.original
    ? "THE ORIGINAL ESTATES"
    : "BONUS ESTATE";
  $("castle-title").textContent = castle.name;
  $("castle-description").textContent = castle.description;
  $("castle-watermark").textContent =
    `${castle.name.toUpperCase()} · EST. MCMLXXXIV`;
  $("room-total").textContent = String(castle.rooms.length).padStart(2, "0");
  $("key-inventory").innerHTML = castle.keyIds
    .map(
      (key) =>
        `<div class="key-slot" id="key-${key}" style="--key-color:#${KEY_INFO[key].color.toString(16).padStart(6, "0")}" title="${KEY_INFO[key].name} key"><svg><use href="#i-key"/></svg><span>${KEY_INFO[key].name.toUpperCase()}</span><i></i></div>`,
    )
    .join("");
  $("inventory-copy").textContent = castle.original
    ? castle.keyIds.length
      ? "Match each key to its coloured lock. Ring bells to open other doors."
      : "Ring the doorbells. Watch the machinery. Find the exit."
    : "Find the three keys to unlock the castle’s final gate.";
  $("intro-copy").innerHTML =
    `${castle.name}. ${castle.rooms.length} rooms. ${castle.keyIds.length} ${castle.keyIds.length === 1 ? "key" : "keys"}.<br/>The doctor has been expecting you.`;
  $("continue-btn").classList.toggle("hidden", !saved);
}
function roomUI() {
  $("tutorial-lesson").classList.toggle("hidden", castle.id !== "tutorial");
  $("lesson-number").textContent =
    `LESSON ${game.roomIndex + 1} OF ${castle.rooms.length}`;
  $("lesson-title").textContent = game.room.name;
  $("lesson-copy").textContent = game.room.description;
  $("room-name").textContent = game.room.name;
  $("room-number").textContent = String(game.roomIndex + 1).padStart(2, "0");
  $("objective-title").textContent = game.room.objective;
  $("objective-copy").textContent = game.room.description;
  $("stage-hint").textContent = game.room.subtitle;
  updateUI();
}
function onGameEvent(event) {
  if (event.type === "room") {
    view.build(game.room, game.roomIndex);
    roomUI();
    if (game.started) {
      audio.play("room");
      save();
    }
  }
  if (event.type === "start") {
    roomUI();
    save();
  }
  if (event.text) notify(event.text);
  if (event.type === "key") {
    updateUI();
    save();
  }
  if (event.type === "death") {
    $("death-flash").classList.add("hit");
    setTimeout(() => $("death-flash").classList.remove("hit"), 230);
  }
  if (event.type === "win") {
    try {
      localStorage.removeItem(savedKey());
    } catch {}
    saved = null;
    completed[castle.id] = { time: game.elapsed, returns: game.returns };
    writeStorage(COMPLETED_KEY, completed);
    $("continue-btn").classList.add("hidden");
    setTimeout(showWin, 450);
  }
  audio.play(event.type, event.cause);
}
game.onEvent = onGameEvent;
function selectCastle(id, resume = true) {
  save();
  castle = castleById(id);
  writeStorage(LAST_CASTLE_KEY, castle.id);
  saved = readSave();
  game = castle.original ? new ClassicGame(castle) : new Game();
  game.onEvent = onGameEvent;
  castleUI();
  start(resume && !!saved);
}
function start(continueSaved = false) {
  closeModal();
  audio.enable(settings.sound);
  updateSoundButton();
  $("start-overlay").classList.add("hidden");
  $("stage").classList.add("playing");
  game.start(continueSaved ? saved : null);
  focusStage();
  notify(
    continueSaved
      ? "Welcome back. The doctor kept your room."
      : `Welcome to ${castle.name}. Move with WASD or arrows. Press E beside bells, keys, and doors.`,
    6000,
  );
}
function focusStage() {
  $("canvas-host").focus({ preventScroll: true });
}
function setSound(enabled) {
  settings.sound = enabled;
  audio.enable(enabled);
  updateSoundButton();
  writeStorage(SETTINGS_KEY, settings);
}
function updateSoundButton() {
  $("sound-btn").setAttribute(
    "aria-label",
    settings.sound ? "Mute sound" : "Enable sound",
  );
  $("sound-btn")
    .querySelector(".sound-slash")
    .classList.toggle("hidden", settings.sound);
}
function openModal(type, content) {
  previousFocus = document.activeElement;
  modalType = type;
  game.paused = true;
  clearInput();
  if (document.fullscreenElement)
    document.fullscreenElement.appendChild($("modal-backdrop"));
  $("modal-content").innerHTML = content;
  $("modal-backdrop").classList.remove("hidden");
  document.querySelector(".modal").focus({ preventScroll: true });
  updateUI();
}
function closeModal() {
  modalType = "";
  $("modal-backdrop").classList.add("hidden");
  game.paused = false;
  clearInput();
  updateUI();
  if ($("modal-backdrop").parentElement !== document.body)
    document.body.appendChild($("modal-backdrop"));
  if (game.started) focusStage();
  else previousFocus?.focus({ preventScroll: true });
}
function showMap() {
  if (modalType === "map") return closeModal();
  openModal(
    "map",
    `<div class="eyebrow">AN EXPLORER’S BEST FRIEND</div><h2 id="modal-title">The ${castle.name} estate</h2><p>${castle.original ? "The original castle plan. Lines connect rooms through their doors. Open a passage with its bell, its coloured lock, or from the other side." : "Follow the six rooms to the Last Watch. The three keys unlock the final gate."}</p>${castleMap(castle, game)}<div class="map-legend"><span>◇ You are here</span><span>▣ Explored</span><span>□ Unexplored</span></div><p class="map-caption">${game.visited.size} of ${castle.rooms.length} rooms explored · ${game.keys.size} of ${castle.keyIds.length} keys recovered</p><button class="primary-button" id="modal-resume">Back to the castle <span>↗</span></button>`,
  );
  $("modal-resume").onclick = closeModal;
}
function showCastles() {
  save();
  openModal(
    "castles",
    `<div class="eyebrow">THE COMPLETE ORIGINAL COLLECTION</div><h2 id="modal-title">Choose your nightmare.</h2><p>All thirteen 1984 castles and the thirteen-room tutorial, rebuilt from their original layouts. Your expedition is saved separately in every estate.</p><div class="castle-library">${ALL_CASTLES.map(
      (c) => {
        const progress = readSave(c),
          won = completed[c.id];
        return `<button class="castle-option ${c.id === castle.id ? "selected" : ""}" data-castle="${c.id}"><span class="castle-option-top">${c.id === "tutorial" ? "START HERE" : c.original ? `ESTATE ${String(c.order).padStart(2, "0")}` : "BONUS ESTATE"} <span>${won ? "◆ CONQUERED" : progress ? "↗ CONTINUE" : ""}</span></span><strong>${c.name}</strong><small>${c.rooms.length} rooms · ${c.keyIds.length} ${c.keyIds.length === 1 ? "key" : "keys"}</small><p>${c.description}</p></button>`;
      },
    ).join(
      "",
    )}</div><p class="map-caption">204 original castle rooms + 13 tutorial rooms · Blackthorn retained as a six-room bonus</p>`,
  );
  document
    .querySelectorAll("[data-castle]")
    .forEach(
      (button) => (button.onclick = () => selectCastle(button.dataset.castle)),
    );
}
function showGuide() {
  openModal(
    "guide",
    `<div class="eyebrow">A FEW WORDS TO THE WISE</div><h2 id="modal-title">The explorer’s field guide</h2><p>You cannot jump. Survival is a matter of observation, timing, and using the doctor’s inventions against him. Begin with Tutorial in All castles for the original lessons.</p><div class="guide-grid"><div class="guide-item"><h3>Find your footing</h3><p>A / D or ← / → moves. W / S or ↑ / ↓ climbs ladders. Brass poles only go down. Hold a sideways direction to leave a ladder or pole at an intermediate walkway.</p></div><div class="guide-item"><h3>Open a passage</h3><p>E or Space operates nearby objects. Numbered bells open matching doors, sometimes on a distant walkway. Coloured locks need matching keys. Some doors open only from the other side.</p></div><div class="guide-item"><h3>Mind the machinery</h3><p>Red buttons lower blue force fields for eight seconds. Lightning switches toggle their connected machines. Conveyor controls cycle movement and direction.</p></div><div class="guide-item"><h3>Outwit the residents</h3><p>Ankhs awaken mummies. Coffins awaken monsters that can climb. Lure them into lightning, a ray gun, or an open trapdoor. Passing a trap’s pressure control toggles its opening.</p></div><div class="guide-item"><h3>Operate the inventions</h3><p>At a teleporter, use ↑ / ↓ to select a coloured receiver, then E to transmit. At a ray-gun control, use ↑ / ↓ to aim and E to fire. Unattended guns track you.</p></div><div class="guide-item"><h3>Keep your discoveries</h3><p>Every castle saves separately. Death returns you to the room entrance with your keys and opened doors. R resets the current room’s machinery and residents if a puzzle gets stuck.</p></div></div><div class="guide-controls"><span><kbd>M</kbd> Castle map</span><span><kbd>Esc</kbd> Pause</span><span><kbd>R</kbd> Reset room</span></div><button class="primary-button" id="modal-resume">I’ll keep my wits about me <span>↗</span></button>`,
  );
  $("modal-resume").onclick = closeModal;
}
function showSettings() {
  openModal(
    "settings",
    `<div class="eyebrow">MAKE YOURSELF COMFORTABLE</div><h2 id="modal-title">A few adjustments</h2><div class="settings-row"><label for="setting-sound">Castle sounds<small>A quiet drone and sounds for your discoveries</small></label><input id="setting-sound" type="checkbox" ${settings.sound ? "checked" : ""}/></div><div class="settings-row"><label for="setting-volume">Volume<small>Keep the doctor’s neighbours happy</small></label><input id="setting-volume" type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}"/></div><div class="settings-row"><label for="setting-quality">Graphics<small>Balanced reduces bloom and disables shadows</small></label><select id="setting-quality"><option value="high" ${settings.quality === "high" ? "selected" : ""}>Atmospheric</option><option value="low" ${settings.quality === "low" ? "selected" : ""}>Balanced</option></select></div><p>Settings and expedition progress are saved in this browser.</p><button class="primary-button" id="modal-resume">Back to the castle <span>↗</span></button>`,
  );
  $("setting-sound").onchange = (e) => setSound(e.target.checked);
  $("setting-volume").oninput = (e) => {
    settings.volume = Number(e.target.value) / 100;
    audio.setVolume(settings.volume);
    writeStorage(SETTINGS_KEY, settings);
  };
  $("setting-quality").onchange = (e) => {
    settings.quality = e.target.value;
    view.setQuality(settings.quality);
    writeStorage(SETTINGS_KEY, settings);
  };
  $("modal-resume").onclick = closeModal;
}
function showPause() {
  if (!game.started || game.won) return;
  save();
  openModal(
    "pause",
    `<div class="eyebrow">THE DOCTOR CAN WAIT</div><h2 id="modal-title">A moment’s respite.</h2><p>Your ${castle.name} expedition is paused and saved. Take a breath. The castle will still be here.</p><div class="win-stats"><div><strong>${formatTime(game.elapsed)}</strong><span>TIME INSIDE</span></div><div><strong>${game.keys.size} / ${castle.keyIds.length}</strong><span>KEYS FOUND</span></div></div><div class="button-row"><button class="primary-button" id="modal-resume">Continue exploring ↗</button></div><button class="text-button" id="pause-castles">Choose another castle</button><button class="text-button" id="pause-settings">Sound & graphics settings</button><button class="text-button" id="retry-btn">Reset this room and return to its entrance</button><button class="text-button" id="new-btn">Restart this castle</button>`,
  );
  $("modal-resume").onclick = closeModal;
  $("pause-settings").onclick = showSettings;
  $("pause-castles").onclick = showCastles;
  $("retry-btn").onclick = () => {
    closeModal();
    game.retry();
  };
  if (castle.original) {
    $("retry-btn").insertAdjacentHTML(
      "beforebegin",
      '<button class="text-button" id="return-btn">Return to this room’s entrance · keep machinery</button><button class="text-button" id="recall-btn">Return to castle entrance · keep discoveries</button>',
    );
    $("return-btn").onclick = () => {
      closeModal();
      game.retry(false);
    };
    $("recall-btn").onclick = () => {
      closeModal();
      game.recall();
    };
  }
  $("new-btn").onclick = () => {
    openModal(
      "new",
      `<div class="eyebrow">A FRESH START</div><h2 id="modal-title">Back to the beginning?</h2><p>This replaces your saved expedition. Your settings will be kept.</p><button id="confirm-new" class="primary-button">Begin a new expedition ↗</button><button class="text-button" id="cancel-new">Keep exploring</button>`,
    );
    $("confirm-new").onclick = () => start();
    $("cancel-new").onclick = closeModal;
  };
}
function showWin() {
  openModal(
    "win",
    `<div class="eyebrow">${castle.name.toUpperCase()} · CONQUERED</div><h2 id="modal-title">Some guests do leave.</h2><p>The final gate opens. Cool night air replaces the dust of the castle. Somewhere behind you, a very disappointed doctor crosses a name out of his guest book.</p><div class="win-stats"><div><strong>${formatTime(game.elapsed)}</strong><span>ESCAPE TIME</span></div><div><strong>${game.returns}</strong><span>RETURNS</span></div><div><strong>${game.visited.size} / ${castle.rooms.length}</strong><span>ROOMS EXPLORED</span></div></div><button class="primary-button" id="next-castle">Discover another castle <span>↗</span></button><button class="text-button" id="play-again">Tempt fate here again</button>`,
  );
  $("play-again").onclick = () => start();
  $("next-castle").onclick = showCastles;
}
function showCredits() {
  openModal(
    "credits",
    `<div class="eyebrow">FROM 8 BITS TO A NEW DIMENSION</div><h2 id="modal-title">An old nightmare,<br/>fondly remembered.</h2><p>The Castles of Dr. Creep was created by Ed Hobbs and published by Brøderbund in 1984 for the Commodore 64.</p><p>This single-player remake includes all thirteen original castles and the tutorial: 217 rooms imported from the C64 room data, with their platform layouts, passages, and inventions. Blackthorn remains an original six-room bonus.</p><p>New geometry, textures, character animation, and audio are generated in code with Three.js r186. The original room-data format was researched using Piddewitt’s reverse assembly and Robert Crossfield’s DrCreep project. This is a modern adaptation, with new movement timing and forgiving retries.</p><p><a class="credits-link" href="https://github.com/Piddewitt/The-Castles-of-Dr-Creep" target="_blank" rel="noopener noreferrer">Original data research ↗</a> · <a class="credits-link" href="https://github.com/segrax/DrCreep" target="_blank" rel="noopener noreferrer">DrCreep project ↗</a></p><button class="primary-button" id="modal-resume">Return to the castle <span>↗</span></button>`,
  );
  $("modal-resume").onclick = closeModal;
}

$("start-btn").onclick = () => start();
$("continue-btn").onclick = () => start(true);
$("nav-map").onclick = showMap;
$("nav-castles").onclick = showCastles;
$("choose-castle-btn").onclick = showCastles;
$("map-card").onclick = showMap;
$("nav-guide").onclick = showGuide;
$("help-btn").onclick = showGuide;
$("settings-btn").onclick = showSettings;
$("credits-btn").onclick = showCredits;
$("pause-btn").onclick = showPause;
$("nav-play").onclick = () => {
  closeModal();
  focusStage();
};
$("hint-btn").onclick = () => {
  if (!game.started) {
    showGuide();
    return;
  }
  notify(game.room.hint, 10500);
};
$("sound-btn").onclick = () => {
  setSound(!settings.sound);
  if (settings.sound) audio.tone(293.66, 0.3);
};
$("fullscreen-btn").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("game-column").requestFullscreen();
  } catch {
    notify("Fullscreen is unavailable in this browser window.");
  }
};
document.querySelector(".modal-close").onclick = closeModal;
$("modal-backdrop").onclick = (e) => {
  if (e.target === $("modal-backdrop")) closeModal();
};
$("canvas-host").addEventListener("pointerdown", focusStage);

const movementCodes = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
];
window.addEventListener("keydown", (e) => {
  if (modalType) {
    if (e.code === "Escape") {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.code === "KeyM" && modalType === "map") {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.code === "Tab") {
      const focusable = [
        ...document
          .querySelector(".modal")
          .querySelectorAll('button,a,input,select,[tabindex="0"]'),
      ].filter((el) => !el.disabled);
      const first = focusable[0],
        last = focusable.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === document.querySelector(".modal"))
      ) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    return;
  }
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (movementCodes.includes(e.code)) {
    e.preventDefault();
    input.add(e.code);
    taps.set(e.code, performance.now() + 85);
  }
  if (e.repeat) return;
  if (e.code === "KeyM") {
    e.preventDefault();
    showMap();
  }
  if (e.code === "Escape") {
    e.preventDefault();
    showPause();
  }
  if (e.code === "KeyR" && game.started && !game.won) {
    e.preventDefault();
    game.retry();
  }
  if (
    e.code === "KeyE" ||
    (e.code === "Space" && e.target.tagName !== "BUTTON")
  ) {
    e.preventDefault();
    if (game.started) game.interact();
    else start();
  }
});
window.addEventListener("keyup", (e) => input.delete(e.code));
window.addEventListener("blur", () => {
  clearInput();
  if (game.started && !game.won && !modalType) showPause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInput();
    save();
    if (game.started && !game.won && !modalType) showPause();
  }
});
window.addEventListener("beforeunload", save);
for (const button of document.querySelectorAll("[data-hold]")) {
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    input.add(button.dataset.hold);
    taps.set(button.dataset.hold, performance.now() + 85);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(event, () => input.delete(button.dataset.hold));
}
document.querySelector('[data-action="interact"]').onclick = () =>
  game.interact();
castleUI();
roomUI();
updateSoundButton();
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const pressed = (code) => input.has(code) || (taps.get(code) || 0) > now;
  game.update(dt, {
    left: pressed("KeyA") || pressed("ArrowLeft"),
    right: pressed("KeyD") || pressed("ArrowRight"),
    up: pressed("KeyW") || pressed("ArrowUp"),
    down: pressed("KeyS") || pressed("ArrowDown"),
  });
  view.render(game, dt);
  const nearby = game.paused ? null : game.nearby();
  $("interact-prompt").classList.toggle("hidden", !nearby);
  if (nearby) {
    const pos = view.screenPosition(game.player.x, game.player.y + 2.05);
    $("interact-prompt").style.left =
      `${Math.max(95, Math.min(view.host.clientWidth - 95, pos.x))}px`;
    $("interact-prompt").style.top = `${pos.y}px`;
    $("interact-prompt").querySelector("span").textContent = nearby.label;
  }
  if (now - uiTick > 350) {
    updateUI();
    uiTick = now;
  }
  if (now - lastSave > 3000) {
    save();
    lastSave = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
