import test from "node:test";
import assert from "node:assert/strict";
import { getRating } from "../src/config.js";

test("rating returns S for strong victory", () => {
  assert.equal(getRating({ victory: true, score: 240, baseHealth: 4 }), "S");
});

test("rating returns C for weak defeat", () => {
  assert.equal(getRating({ victory: false, score: 60, baseHealth: 0 }), "C");
});
