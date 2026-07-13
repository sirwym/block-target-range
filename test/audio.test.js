import test from "node:test";
import assert from "node:assert/strict";
import { extractWeaponId, shouldThrottle, loadAudioClip, playSegmentedReload } from "../src/audio.js";

test("extractWeaponId parses fire/reload/draw suffixes", () => {
  assert.equal(extractWeaponId("m4Fire"), "m4");
  assert.equal(extractWeaponId("p90Fire"), "p90");
  assert.equal(extractWeaponId("glock17Reload"), "glock17");
  assert.equal(extractWeaponId("p90Draw"), "p90");
  assert.equal(extractWeaponId("unknown"), null);
});

test("extractWeaponId parses V2 Shoot/ReloadEmpty/ReloadTactical suffixes", () => {
  assert.equal(extractWeaponId("glock17Shoot"), "glock17");
  assert.equal(extractWeaponId("m4Shoot"), "m4");
  assert.equal(extractWeaponId("ak47Shoot"), "ak47");
  assert.equal(extractWeaponId("awpShoot"), "awp");
  assert.equal(extractWeaponId("p90Shoot"), "p90");
  assert.equal(extractWeaponId("glock17ReloadEmpty"), "glock17");
  assert.equal(extractWeaponId("m4ReloadTactical"), "m4");
  assert.equal(extractWeaponId("glock17Draw"), "glock17");
  assert.equal(extractWeaponId("awpDraw"), "awp");
});

test("extractWeaponId parses segmented reload magout/magin suffixes", () => {
  assert.equal(extractWeaponId("ak47ReloadEmptyMagout"), "ak47");
  assert.equal(extractWeaponId("ak47ReloadEmptyMagin"), "ak47");
  assert.equal(extractWeaponId("ak47ReloadTacticalMagout"), "ak47");
  assert.equal(extractWeaponId("ak47ReloadTacticalMagin"), "ak47");
  assert.equal(extractWeaponId("awpReloadEmptyMagout"), "awp");
  assert.equal(extractWeaponId("awpReloadTacticalMagin"), "awp");
  assert.equal(extractWeaponId("p90ReloadEmptyMagout"), "p90");
  assert.equal(extractWeaponId("p90ReloadTacticalMagin"), "p90");
});

test("shouldThrottle skips non-fire sounds", () => {
  assert.equal(shouldThrottle("m4Reload", 10, 0, 5), false);
  assert.equal(shouldThrottle("p90Draw", 10, 0, 5), false);
  assert.equal(shouldThrottle("ak47ReloadEmptyMagout", 10, 0, 5), false);
  assert.equal(shouldThrottle("glock17ReloadEmpty", 10, 0, 5), false);
});

test("shouldThrottle blocks rapid fire when enough sources are active", () => {
  const m4Interval = 60 / 810;
  const minInterval = m4Interval * 0.8;
  // 新 Shoot 后缀
  assert.equal(
    shouldThrottle("m4Shoot", minInterval * 0.5, 0, 3),
    true,
    "rapid fire with 3 active sources is throttled (Shoot suffix)"
  );
  assert.equal(
    shouldThrottle("m4Shoot", minInterval * 2, 0, 3),
    false,
    "after enough time passes, fire is allowed (Shoot suffix)"
  );
  // 旧 Fire 后缀兼容
  assert.equal(
    shouldThrottle("m4Fire", minInterval * 2, 0, 2),
    false,
    "few active sources allow fire even if rapid (Fire suffix compat)"
  );
});

test("shouldThrottle blocks when active source cap is reached", () => {
  assert.equal(
    shouldThrottle("m4Shoot", 1000, 0, 8),
    true,
    "8 active sources blocks any fire"
  );
  assert.equal(
    shouldThrottle("p90Shoot", 1000, 0, 9),
    true,
    "over cap blocks"
  );
});

test("playSegmentedReload does not throw without audio context", () => {
  // 无 audioContext 时应安全返回，不报错
  assert.doesNotThrow(() => playSegmentedReload("ak47ReloadEmptyMagout", "ak47ReloadEmptyMagin", 0.1));
});

test("loadAudioClip caches failure and does not re-fetch", async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = () => {
    fetchCount += 1;
    return Promise.reject(new Error("offline"));
  };
  try {
    await loadAudioClip("ak47Shoot");
    await loadAudioClip("ak47Shoot");
    assert.equal(fetchCount, 1, "a failed sound is fetched at most once");
  } finally {
    global.fetch = originalFetch;
  }
});
