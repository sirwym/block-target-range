import test from "node:test";
import assert from "node:assert/strict";
import { nearestHit, resolveCircleCollision, wouldEnemyCollide } from "../src/collision.js";

test("player is pushed out of a solid box", () => {
  const resolved = resolveCircleCollision(
    { x: 0.2, y: 2.25, z: 0.2 },
    [{ box: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 2 } }],
    0.62,
    { x: 20.5, zMin: -25.5, zMax: 17.5 }
  );
  assert.ok(resolved.x < 0 || resolved.z < 0 || resolved.x > 2 || resolved.z > 2);
});

test("enemy next step detects solid collision", () => {
  const collides = wouldEnemyCollide(
    { x: 0, y: 0, z: 1 },
    [{ box: { minX: -1, minY: 0, minZ: 1, maxX: 1, maxY: 3, maxZ: 3 } }],
    0.72,
    2.8
  );
  assert.equal(collides, true);
});

test("nearestHit chooses closest object across groups", () => {
  const hit = nearestHit([
    [{ distance: 8, object: "enemy" }],
    [{ distance: 3, object: "block" }],
  ]);
  assert.equal(hit.object, "block");
});
