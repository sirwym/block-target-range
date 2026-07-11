import test from "node:test";
import assert from "node:assert/strict";
import { extractWeaponId, shouldThrottle, loadAudioClip } from "../src/audio.js";

test("extractWeaponId parses fire/reload/draw suffixes", () => {
  assert.equal(extractWeaponId("m4Fire"), "m4");
  assert.equal(extractWeaponId("p90Fire"), "p90");
  assert.equal(extractWeaponId("glock17Reload"), "glock17");
  assert.equal(extractWeaponId("p90Draw"), "p90");
  assert.equal(extractWeaponId("unknown"), null);
});

test("shouldThrottle skips non-fire sounds", () => {
  assert.equal(shouldThrottle("m4Reload", 10, 0, 5), false);
  assert.equal(shouldThrottle("p90Draw", 10, 0, 5), false);
});

test("shouldThrottle blocks rapid fire when enough sources are active", () => {
  const m4Interval = 60 / 700;
  const minInterval = m4Interval * 0.8;
  assert.equal(
    shouldThrottle("m4Fire", minInterval * 0.5, 0, 3),
    true,
    "rapid fire with 3 active sources is throttled"
  );
  assert.equal(
    shouldThrottle("m4Fire", minInterval * 2, 0, 3),
    false,
    "after enough time passes, fire is allowed"
  );
  assert.equal(
    shouldThrottle("m4Fire", 100, 0, 2),
    false,
    "few active sources allow fire even if rapid"
  );
});

test("shouldThrottle blocks when active source cap is reached", () => {
  assert.equal(
    shouldThrottle("m4Fire", 1000, 0, 8),
    true,
    "8 active sources blocks any fire"
  );
  assert.equal(
    shouldThrottle("p90Fire", 1000, 0, 9),
    true,
    "over cap blocks fire"
  );
});

test("loadAudioClip caches failure and does not re-fetch", async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = () => {
    fetchCount += 1;
    return Promise.reject(new Error("offline"));
  };
  try {
    await loadAudioClip("ak47Fire");
    await loadAudioClip("ak47Fire");
    assert.equal(fetchCount, 1, "a failed sound is fetched at most once");
  } finally {
    global.fetch = originalFetch;
  }
});
