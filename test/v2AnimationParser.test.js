import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  getV2Animation,
  samplePartDisplacement,
  _TEST_ONLY,
} from "../src/v2AnimationParser.js";

const { MAGAZINE_NODE_NAMES, SLIDE_NODE_NAMES, V2_FILE_PREFIX,
  extractTranslationChannel, extractChannel, normalizeDisplacement, decodeDataUri, samplePartTransform,
  setAnimationCache, clearAnimationCache } = _TEST_ONLY;

const ANIM_DIR = path.resolve("public/assets/tacz/animations");

function loadGltf(weaponId, reloadType) {
  const prefix = V2_FILE_PREFIX[weaponId];
  const filePath = path.join(ANIM_DIR, `${prefix}_${reloadType}.gltf`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("5 把枪的 V2 glTF 动画文件都存在", () => {
  for (const weaponId of Object.keys(V2_FILE_PREFIX)) {
    const prefix = V2_FILE_PREFIX[weaponId];
    for (const reloadType of ["reload_empty", "reload_norm"]) {
      const filePath = path.join(ANIM_DIR, `${prefix}_${reloadType}.gltf`);
      assert.equal(fs.existsSync(filePath), true, `${weaponId} ${reloadType}: ${filePath}`);
    }
  }
});

test("每把枪的弹匣节点名在 V2 glTF nodes 中存在", () => {
  for (const weaponId of Object.keys(MAGAZINE_NODE_NAMES)) {
    const gltf = loadGltf(weaponId, "reload_empty");
    const expectedName = MAGAZINE_NODE_NAMES[weaponId];
    const found = gltf.nodes.some((n) => n.name === expectedName);
    assert.equal(found, true, `${weaponId}: node "${expectedName}" not found in glTF nodes`);
  }
});

test("每把枪的弹匣节点有 translation 动画通道", () => {
  for (const weaponId of Object.keys(MAGAZINE_NODE_NAMES)) {
    const gltf = loadGltf(weaponId, "reload_empty");
    const channel = extractTranslationChannel(gltf, MAGAZINE_NODE_NAMES[weaponId]);
    assert.ok(channel, `${weaponId}: magazine translation channel exists`);
    assert.ok(channel.times.length > 0, `${weaponId}: magazine has keyframes`);
    assert.equal(channel.positions[0].length, 3, `${weaponId}: position is VEC3`);
  }
});

test("套筒/枪栓节点名映射正确（null 表示无该部件）", () => {
  // glock17/ak47/awp/p90 有 slide 节点，m4 无
  assert.equal(SLIDE_NODE_NAMES.m4, null, "m4 has no slide node");
  for (const weaponId of ["glock17", "ak47", "awp", "p90"]) {
    const gltf = loadGltf(weaponId, "reload_empty");
    const channel = extractTranslationChannel(gltf, SLIDE_NODE_NAMES[weaponId]);
    assert.ok(channel, `${weaponId}: slide translation channel exists`);
  }
});

test("AWP bolt_rotate2 rotation channel can be extracted", () => {
  const gltf = loadGltf("awp", "reload_empty");
  const channel = extractChannel(gltf, "bolt_rotate2", "rotation");
  assert.ok(channel, "AWP bolt_rotate2 rotation channel exists");
  assert.equal(channel.components, 4, "rotation is quaternion VEC4");
  assert.ok(channel.values.length > 0, "rotation has keyframes");
});

test("extractTranslationChannel 返回 null 当节点名不存在", () => {
  const gltf = loadGltf("glock17", "reload_empty");
  const result = extractTranslationChannel(gltf, "nonexistent_node");
  assert.equal(result, null);
});

test("extractTranslationChannel 返回 null 当节点名为 null", () => {
  const gltf = loadGltf("glock17", "reload_empty");
  const result = extractTranslationChannel(gltf, null);
  assert.equal(result, null);
});

test("normalizeDisplacement 相对第一帧归一化", () => {
  const partAnim = {
    times: [0, 0.5, 1.0],
    positions: [[1, 2, 3], [1, 4, 3], [1, 2, 5]],
  };
  const normalized = normalizeDisplacement(partAnim);
  assert.deepEqual(normalized.positions[0], [0, 0, 0], "first frame is zero");
  assert.deepEqual(normalized.positions[1], [0, 2, 0], "second frame relative to first");
  assert.deepEqual(normalized.positions[2], [0, 0, 2], "third frame relative to first");
});

test("normalizeDisplacement 返回 null 当无数据", () => {
  assert.equal(normalizeDisplacement(null), null);
  assert.equal(normalizeDisplacement({ times: [], positions: [] }), null);
});

test("samplePartDisplacement 返回 [0,0,0] 当无数据", () => {
  assert.deepEqual(samplePartDisplacement(null, 0.5, 1.0), [0, 0, 0]);
  assert.deepEqual(samplePartDisplacement({ times: [], positions: [] }, 0.5, 1.0), [0, 0, 0]);
});

test("samplePartDisplacement progress=0 返回零位移", () => {
  // progress=0 → targetTime=0，通常在第一帧之前，返回 [0,0,0]
  const partAnim = {
    times: [0.3, 0.5, 1.0],
    positions: [[0, 0, 0], [0, -0.1, 0], [0, 0, 0]],
  };
  const result = samplePartDisplacement(partAnim, 0, 1.0);
  assert.deepEqual(result, [0, 0, 0]);
});

test("samplePartDisplacement 中间帧 lerp 插值正确", () => {
  // 两帧之间线性插值
  const partAnim = {
    times: [0, 1.0],
    positions: [[0, 0, 0], [0, 1, 0]],
  };
  // progress=0.5 → targetTime=0.5，在 0 和 1.0 之间，lerp=0.5
  const result = samplePartDisplacement(partAnim, 0.5, 1.0);
  assert.ok(Math.abs(result[1] - 0.5) < 1e-6, `lerp y=${result[1]} should be 0.5`);
});

test("samplePartDisplacement scale 参数缩放位移", () => {
  const partAnim = {
    times: [0, 1.0],
    positions: [[0, 0, 0], [0, 1, 0]],
  };
  const result = samplePartDisplacement(partAnim, 1.0, 1.0, 2.0);
  assert.ok(Math.abs(result[1] - 2.0) < 1e-6, `scaled y=${result[1]} should be 2.0`);
});

test("samplePartTransform normalizes displacement to configured distance", () => {
  const partAnim = {
    translation: {
      times: [0, 1.0],
      values: [[0, 0, 0], [0, -2, 0]],
    },
  };
  const result = samplePartTransform(partAnim, 1.0, 1.0, {
    distance: 0.2,
    axisMap: ["x", "y", "z"],
    sign: [1, 1, 1],
  });
  assert.ok(Math.abs(result.position[1] + 0.2) < 1e-6, `normalized y=${result.position[1]}`);
});

test("decodeDataUri 正确解码 base64 data URI", () => {
  // "hello" 的 base64
  const dataUri = "data:application/octet-stream;base64,aGVsbG8=";
  const bytes = decodeDataUri(dataUri);
  assert.equal(bytes.length, 5);
  assert.deepEqual(Array.from(bytes), [104, 101, 108, 108, 111]); // "hello"
});

test("getV2Animation 从缓存返回动画数据", () => {
  clearAnimationCache();
  const mockData = {
    magazine: { times: [0, 1], positions: [[0, 0, 0], [0, -0.1, 0]] },
    slide: null,
  };
  setAnimationCache("glock17", { empty: mockData, tactical: null });

  const empty = getV2Animation("glock17", true);
  const tactical = getV2Animation("glock17", false);
  assert.equal(empty, mockData, "isEmpty=true returns empty data");
  assert.equal(tactical, null, "isEmpty=false returns tactical (null in mock)");

  clearAnimationCache();
});

test("getV2Animation 返回 null 当缓存为空", () => {
  clearAnimationCache();
  assert.equal(getV2Animation("glock17", true), null);
});

test("5 把枪的 V2 动画都有实际的弹匣位移（非全零）", () => {
  // 验证从实际 glTF 提取的弹匣动画确实有位移变化，不是全零帧
  for (const weaponId of Object.keys(MAGAZINE_NODE_NAMES)) {
    const gltf = loadGltf(weaponId, "reload_empty");
    const channel = extractTranslationChannel(gltf, MAGAZINE_NODE_NAMES[weaponId]);
    const normalized = normalizeDisplacement(channel);
    const maxDisp = Math.max(
      ...normalized.positions.flat().map(Math.abs)
    );
    assert.ok(maxDisp > 0.001, `${weaponId}: magazine displacement max=${maxDisp} should be non-zero`);
  }
});
