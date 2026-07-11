import test from "node:test";
import assert from "node:assert/strict";
import { consumeJumpRequest, updateJumpState } from "../src/player.js";

const config = {
  playerGroundY: 2.25,
  playerJumpVelocity: 7.6,
  playerGravity: 22,
};

test("jump starts only when grounded", () => {
  const jumped = consumeJumpRequest({
    playerY: 2.25,
    verticalVelocity: 0,
    grounded: true,
    jumpRequested: true,
  }, config);
  assert.equal(jumped.grounded, false);
  assert.equal(jumped.verticalVelocity, 7.6);

  const ignored = consumeJumpRequest({
    playerY: 3,
    verticalVelocity: 2,
    grounded: false,
    jumpRequested: true,
  }, config);
  assert.equal(ignored.grounded, false);
  assert.equal(ignored.verticalVelocity, 2);
  assert.equal(ignored.jumpRequested, false);
});

test("jump rises, falls, and lands at ground height", () => {
  let state = consumeJumpRequest({
    playerY: 2.25,
    verticalVelocity: 0,
    grounded: true,
    jumpRequested: true,
  }, config);
  state = updateJumpState(state, 0.1, config);
  assert.ok(state.playerY > 2.25);
  assert.equal(state.grounded, false);

  for (let i = 0; i < 20; i += 1) state = updateJumpState(state, 0.1, config);
  assert.equal(state.playerY, 2.25);
  assert.equal(state.verticalVelocity, 0);
  assert.equal(state.grounded, true);
});
