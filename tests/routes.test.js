import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { ClassicGame } from "../src/classic-game.js";
import { castleById } from "../src/catalog.js";
import { playAction } from "../scripts/play-route.mjs";

for (const file of readdirSync(new URL("./routes/", import.meta.url))) {
  const route = JSON.parse(
    readFileSync(new URL(`./routes/${file}`, import.meta.url)),
  );
  test(`${route.castle}: recorded inputs reach the exit with all hazards enabled`, () => {
    const g = new ClassicGame(castleById(route.castle));
    g.start();
    let deaths = 0;
    g.onEvent = (e) => {
      if (e.type === "death") deaths++;
    };
    for (const [i, a] of route.actions.entries())
      assert.ok(playAction(g, a), `Action ${i}: ${JSON.stringify(a)}`);
    assert.ok(g.won);
    assert.equal(deaths, route.deaths ?? 0);
  });
}
