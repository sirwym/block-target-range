import test from "node:test";
import assert from "node:assert/strict";
import { getWaveProfile } from "../src/config.js";

test("warmup wave does not allow creepers", () => {
  assert.equal(getWaveProfile(10).allowCreeper, false);
});

test("middle and rush waves allow creepers", () => {
  assert.equal(getWaveProfile(30).allowCreeper, true);
  assert.equal(getWaveProfile(60).allowCreeper, true);
  assert.ok(getWaveProfile(60).spawnMax < getWaveProfile(30).spawnMax);
});
