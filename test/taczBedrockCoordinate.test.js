import test from "node:test";
import assert from "node:assert/strict";
import * as BABYLON from "@babylonjs/core";
import {
  convertBonePivot,
  convertCubeOrigin,
  cubeCenterRelativeToBone,
  bedrockRotationQuaternionZYX,
  getTaczPositioningNodeInverse,
  computeTaczFirstPersonRenderMatrix,
  extractPositionFromMatrix,
  extractRotationFromMatrix,
  buildBonePath,
} from "../src/taczBedrockCoordinate.js";

const PIXEL_TO_UNIT = 1 / 16;

// ============ convertBonePivot ============
// 严格实现 TaCZ BedrockModel.convertPivot (L280-294):
// - Y轴翻转是Bedrock geo格式本身的pivot语义，与渲染引擎坐标系无关
// - 子骨骼: X/Z = child - parent, Y = parent - child
// - 根骨骼: X/Z = pivot, Y = 24 - pivot（24像素眼睛高度偏移）

test("convertBonePivot 子骨骼 Y 轴 = parent - child（Y翻转，严格按TaCZ实现）", () => {
  // parent pivot [10, 20, 30], child pivot [5, 8, 25]
  // 期望: X = 5-10 = -5, Y = 20-8 = 12, Z = 25-30 = -5
  const result = convertBonePivot([5, 8, 25], [10, 20, 30], false);
  assert.deepEqual(result, [-5 * PIXEL_TO_UNIT, 12 * PIXEL_TO_UNIT, -5 * PIXEL_TO_UNIT]);
});

test("convertBonePivot 根骨骼 Y = (24 - pivotY)（24像素眼睛高度偏移）", () => {
  // root pivot [10, 20, 30], 无父骨骼
  // 期望: X = 10, Y = 24-20 = 4, Z = 30
  const result = convertBonePivot([10, 20, 30], null, true);
  assert.deepEqual(result, [10 * PIXEL_TO_UNIT, 4 * PIXEL_TO_UNIT, 30 * PIXEL_TO_UNIT]);
});

test("convertBonePivot 根骨骼 pivotY=24 时 Y=0（眼睛高度对齐）", () => {
  // root pivot [0, 24, 0]
  // 期望: Y = 24-24 = 0
  const result = convertBonePivot([0, 24, 0], null, true);
  assert.deepEqual(result, [0, 0, 0]);
});

test("convertBonePivot 缺省值处理 null/undefined", () => {
  // pivot 和 parentPivot 都缺失，root
  // 期望: X = 0, Y = 24-0 = 24, Z = 0 → Y = 24/16 = 1.5
  const result = convertBonePivot(null, null, true);
  assert.deepEqual(result, [0, 24 * PIXEL_TO_UNIT, 0]);
});

test("convertBonePivot [TaCZ语义] root pivot [0,7,-1.425] Y=(24-7)/16=1.0625", () => {
  const result = convertBonePivot([0, 7, -1.425], null, true);
  assert.deepEqual(result, [0 / 16, (24 - 7) / 16, -1.425 / 16]);
});

test("convertBonePivot [TaCZ语义] 子bone Y=parent-child 而非 child-parent", () => {
  const result = convertBonePivot([0, 5, -6], [0, 7, -1.425], false);
  assert.deepEqual(result, [(0 - 0) / 16, (7 - 5) / 16, (-6 - (-1.425)) / 16]);
});

test("convertBonePivot [TaCZ语义] root pivotY=24时 Y=0（眼睛高度对齐）", () => {
  const result = convertBonePivot([0, 24, 0], null, true);
  assert.deepEqual(result, [0, 0, 0]);
});

test("convertBonePivot [TaCZ语义] root pivotY=8时 Y=(24-8)/16=1.0", () => {
  const result = convertBonePivot([0, 8, 0], null, true);
  assert.deepEqual(result, [0, 1.0, 0]);
});

// ============ convertCubeOrigin ============
// 对照 TaCZ BedrockModel.convertOrigin (L314-329):
// TaCZ 在 Minecraft Y-down 系统中翻转 Y，Babylon.js Y-up 不翻转。
// 所有轴 = cubeOrigin - refPivot

test("convertCubeOrigin 无 cubePivot: Y = cubeOrigin.y - bonePivot.y（Y-up 直通）", () => {
  // bonePivot [10, 20, 30], cubeOrigin [2, 4, 6], cubeSize [4, 4, 4]
  // 期望: X = 2-10 = -8, Y = 4-20 = -16, Z = 6-30 = -24
  const result = convertCubeOrigin([10, 20, 30], [2, 4, 6], [4, 4, 4]);
  assert.deepEqual(result, [-8 * PIXEL_TO_UNIT, -16 * PIXEL_TO_UNIT, -24 * PIXEL_TO_UNIT]);
});

test("convertCubeOrigin 有 cubePivot: Y = cubeOrigin.y - cubePivot.y（Y-up 直通）", () => {
  // cubePivot [5, 10, 15], cubeOrigin [2, 4, 6], cubeSize [4, 4, 4]
  // 期望: X = 2-5 = -3, Y = 4-10 = -6, Z = 6-15 = -9
  const result = convertCubeOrigin([10, 20, 30], [2, 4, 6], [4, 4, 4], [5, 10, 15]);
  assert.deepEqual(result, [-3 * PIXEL_TO_UNIT, -6 * PIXEL_TO_UNIT, -9 * PIXEL_TO_UNIT]);
});

// ============ cubeCenterRelativeToBone ============
// 当前项目顶点以 cube 中心为原点（±size/2），meshLocal 指向 cube 中心
// cubeCenter = cubeOrigin + cubeSize/2
// Y-up 直通: cubeCenter.y - bonePivot.y

test("cubeCenterRelativeToBone Y 直通: cubeCenter.y - bonePivot.y", () => {
  // bonePivot [10, 20, 30], cubeCenter = origin[2,4,6] + size[4,4,4]/2 = [4, 6, 8]
  // 期望: X = 4-10 = -6, Y = 6-20 = -14, Z = 8-30 = -22
  const cubeCenter = [4, 6, 8];
  const result = cubeCenterRelativeToBone(cubeCenter, [10, 20, 30]);
  assert.deepEqual(result, [-6 * PIXEL_TO_UNIT, -14 * PIXEL_TO_UNIT, -22 * PIXEL_TO_UNIT]);
});

// ============ bedrockRotationQuaternionZYX ============
// 对照 TaCZ BedrockPart.translateAndRotateAndScale (L82-96):
// mulPose 顺序 Z→Y→X（post-multiply），矩阵 = R_Z * R_Y * R_X
// 四元数 q = q_Z * q_Y * q_X（矩阵乘法顺序 = 四元数乘法顺序）
// Babylon.js Quaternion.multiply(other) 返回 this * other：
// qZ.multiply(qY).multiply(qX) = q_Z * q_Y * q_X ✓

test("bedrockRotationQuaternionZYX 顺序为 q_Z * q_Y * q_X", () => {
  const DEG = Math.PI / 180;
  const rotationDeg = [30, 45, 60]; // X=30, Y=45, Z=60
  const qZ = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, 60 * DEG);
  const qY = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, 45 * DEG);
  const qX = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, 30 * DEG);
  const expected = qZ.multiply(qY).multiply(qX); // ZYX 顺序
  const actual = bedrockRotationQuaternionZYX(rotationDeg);
  assert.ok(Math.abs(actual.x - expected.x) < 1e-6, `q.x: ${actual.x} 期望 ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-6, `q.y: ${actual.y} 期望 ${expected.y}`);
  assert.ok(Math.abs(actual.z - expected.z) < 1e-6, `q.z: ${actual.z} 期望 ${expected.z}`);
  assert.ok(Math.abs(actual.w - expected.w) < 1e-6, `q.w: ${actual.w} 期望 ${expected.w}`);
});

test("bedrockRotationQuaternionZYX 零旋转 = Identity", () => {
  const result = bedrockRotationQuaternionZYX([0, 0, 0]);
  assert.ok(Math.abs(result.x) < 1e-6);
  assert.ok(Math.abs(result.y) < 1e-6);
  assert.ok(Math.abs(result.z) < 1e-6);
  assert.ok(Math.abs(result.w - 1) < 1e-6);
});

// ============ getTaczPositioningNodeInverse ============
// 对照 TaCZ FirstPersonRenderGunEvent.getPositioningNodeInverse (L217-236)：
// joml rotate/translate 都是 post-multiply (this = this * M)
// 对每个 part（marker→root 反向）:
//   matrix = matrix * RotXN * RotYN * RotZN * Trans
// 所有节点（包括root）统一 ty=-py，反向平移撤销各bone的local position。
// 不做T(0,±1.5)眼睛共轭——因为Babylon相机空间Y=0就是眼睛高度，
// weaponRoot直接挂在cameraAnchor下，不需要Minecraft PoseStack的眼睛补偿。
// computeTaczFirstPersonRenderMatrix 直接返回 inverseMatrix.clone()

test("getTaczPositioningNodeInverse 空路径返回 Identity", () => {
  const matrix = getTaczPositioningNodeInverse([]);
  assert.ok(matrix.isIdentity());
});

test("getTaczPositioningNodeInverse 单个 root 节点 py=0 无旋转: translation = [0, 0, 0]", () => {
  // path: [root(pos=[0,0,0] rot=[0,0,0] isRoot=true)]
  // root ty = -py = -0 = 0（所有节点统一 ty=-py，不做1.5眼睛共轭）
  const path = [
    { position: [0, 0, 0], rotation: [0, 0, 0], isRoot: true },
  ];
  const matrix = getTaczPositioningNodeInverse(path);
  const pos = extractPositionFromMatrix(matrix);
  assert.deepEqual(pos, [0, 0, 0]);
});

test("getTaczPositioningNodeInverse root+marker 都无旋转: translation = [-1, -2, -3]", () => {
  // path: [root(pos=[0,0,0]), marker(pos=[1,2,3])]
  // 计算：
  // i=1 (marker): ty=-py=-2, transMatrix=Trans(-1,-2,-3), matrix = Trans(-1, -2, -3)
  // i=0 (root): ty=-py=0, transMatrix=Trans(0,0,0)
  //   matrix = Trans(0,0,0) * Trans(-1,-2,-3) = Trans(-1, -2, -3)
  // (纯平移矩阵相乘，translation 部分相加；所有节点统一 ty=-py)
  const path = [
    { position: [0, 0, 0], rotation: [0, 0, 0], isRoot: true },
    { position: [1, 2, 3], rotation: [0, 0, 0], isRoot: false },
  ];
  const matrix = getTaczPositioningNodeInverse(path);
  const pos = extractPositionFromMatrix(matrix);
  assert.deepEqual(pos, [-1, -2, -3]);
});

test("getTaczPositioningNodeInverse root+marker 位移不同: translation = [-5, -7, -9]", () => {
  // path: [root(pos=[4,5,6]), marker(pos=[1,2,3])]
  // 计算：
  // i=1 (marker): ty=-py=-2, matrix = Trans(-1, -2, -3)
  // i=0 (root): ty=-py=-5, transMatrix = Trans(-4, -5, -6)
  //   matrix = Trans(-4,-5,-6) * Trans(-1,-2,-3) = Trans(-5, -7, -9)
  const path = [
    { position: [4, 5, 6], rotation: [0, 0, 0], isRoot: true },
    { position: [1, 2, 3], rotation: [0, 0, 0], isRoot: false },
  ];
  const matrix = getTaczPositioningNodeInverse(path);
  const pos = extractPositionFromMatrix(matrix);
  assert.deepEqual(pos, [-5, -7, -9]);
});

test("getTaczPositioningNodeInverse marker 有 Z 旋转 90°: 验证反向旋转+位移耦合", () => {
  // path: [root(pos=[0,0,0] rot=[0,0,0]), marker(pos=[1,0,0] rot=[0,0,π/2])]
  // rotation 单位为弧度（buildBonePath 返回弧度）
  // 计算：
  //
  // i=1 (marker):
  //   rotMatrix = RotZ(-π/2), transMatrix = Trans(-1, 0, 0)
  //   matrix = RotZ(-π/2) * Trans(-1, 0, 0)
  // i=0 (root):
  //   rotMatrix = Identity, transMatrix = Trans(0, 0, 0)（root ty=-py=0，无眼睛共轭）
  //   matrix = RotZ(-π/2) * Trans(-1,0,0)
  //   旋转+位移耦合：marker平移经Z反向旋转后，Y分量产生偏移
  //   RotZ(-π/2) * (-1,0,0) = (0, 1, 0)，translation = [0, 1, 0]
  const path = [
    { position: [0, 0, 0], rotation: [0, 0, 0], isRoot: true },
    { position: [1, 0, 0], rotation: [0, 0, Math.PI / 2], isRoot: false },
  ];
  const matrix = getTaczPositioningNodeInverse(path);
  const pos = extractPositionFromMatrix(matrix);
  assert.ok(Math.abs(pos[0] - 0) < 1e-6, `pos.x: ${pos[0]} 期望 ≈0`);
  assert.ok(Math.abs(pos[1] - 1) < 1e-6, `pos.y: ${pos[1]} 期望 ≈1`);
  assert.ok(Math.abs(pos[2] - 0) < 1e-6, `pos.z: ${pos[2]} 期望 ≈0`);
});

test("getTaczPositioningNodeInverse root py=0.5 时 ty=-0.5: translation = [0, -0.5, 0]", () => {
  // root ty = -py = -0.5（所有节点统一 ty=-py，不做1.5眼睛共轭）
  // path: [root(pos=[0, 0.5, 0] isRoot=true)]
  // transMatrix = Trans(0, -0.5, 0)
  // matrix = Trans(0, -0.5, 0)，translation = [0, -0.5, 0]
  const path = [
    { position: [0, 0.5, 0], rotation: [0, 0, 0], isRoot: true },
  ];
  const matrix = getTaczPositioningNodeInverse(path);
  const pos = extractPositionFromMatrix(matrix);
  assert.deepEqual(pos, [0, -0.5, 0]);
});

// ============ computeTaczFirstPersonRenderMatrix ============
// 当前 Babylon 架构中直接返回 inverseMatrix.clone()，不再做 T(0,±1.5) 眼睛共轭
// （原因：weaponRoot 直接挂在 camera 下，相机空间 Y=0 即眼睛高度）

test("computeTaczFirstPersonRenderMatrix 纯平移 inverse: translation 不变", () => {
  // inverse = Trans(1, 2, 3)，无旋转
  // M = inverse.clone() = Trans(1, 2, 3)
  const inverse = BABYLON.Matrix.Translation(1, 2, 3);
  const m = computeTaczFirstPersonRenderMatrix(inverse);
  const pos = extractPositionFromMatrix(m);
  assert.deepEqual(pos, [1, 2, 3]);
});

test("computeTaczFirstPersonRenderMatrix 含旋转+位移: 直接返回 inverse", () => {
  // 使用 getTaczPositioningNodeInverse 的已知测试数据：
  // path: [root(pos=[0,0,0] rot=[0,0,0]), marker(pos=[1,0,0] rot=[0,0,π/2])]
  // inverse.translation = [0, 1, 0]（旋转耦合效应），inverse.rotation = Z 旋转 -π/2
  //
  // M = inverse.clone()，直接返回
  // 验证点：旋转会改变位移方向（耦合效应仍然存在于 inverse 矩阵本身）
  const path = [
    { position: [0, 0, 0], rotation: [0, 0, 0], isRoot: true },
    { position: [1, 0, 0], rotation: [0, 0, Math.PI / 2], isRoot: false },
  ];
  const inverse = getTaczPositioningNodeInverse(path);
  const m = computeTaczFirstPersonRenderMatrix(inverse);
  const pos = extractPositionFromMatrix(m);
  assert.ok(Math.abs(pos[0] - 0) < 1e-6, `pos.x: ${pos[0]} 期望 ≈0`);
  assert.ok(Math.abs(pos[1] - 1) < 1e-6, `pos.y: ${pos[1]} 期望 ≈1`);
  assert.ok(Math.abs(pos[2] - 0) < 1e-6, `pos.z: ${pos[2]} 期望 ≈0`);
});

test("computeTaczFirstPersonRenderMatrix Identity 输入返回 Identity", () => {
  const m = computeTaczFirstPersonRenderMatrix(BABYLON.Matrix.Identity());
  const pos = extractPositionFromMatrix(m);
  assert.deepEqual(pos, [0, 0, 0]);
});

// ============ buildBonePath ============
// 对照 TaCZ BedrockModel.getPath (L374-389):
// 从 marker push 到 stack，向上遍历 parent 到顶层 bone（parent=null），pop 出 顶层→marker 列表

test("buildBonePath 构建 顶层bone → marker 路径", () => {
  // 构造 mock boneMap 和 boneDataMap
  // 层级: root(top-level) → middle → marker
  const root = { position: { x: 0, y: 0, z: 0 }, rotationQuaternion: BABYLON.Quaternion.Identity() };
  const middle = { position: { x: 1, y: 2, z: 3 }, rotationQuaternion: BABYLON.Quaternion.Identity() };
  const marker = { position: { x: 4, y: 5, z: 6 }, rotationQuaternion: BABYLON.Quaternion.Identity() };

  const boneMap = new Map([
    ["root", root],
    ["middle", middle],
    ["marker", marker],
  ]);
  const boneDataMap = new Map([
    ["root", { parent: null }],
    ["middle", { parent: "root" }],
    ["marker", { parent: "middle" }],
  ]);

  const path = buildBonePath(boneMap, boneDataMap, "marker");
  assert.equal(path.length, 3);
  assert.equal(path[0].name, "root");
  assert.equal(path[1].name, "middle");
  assert.equal(path[2].name, "marker");
  assert.equal(path[0].isTopLevel, true);
  assert.equal(path[1].isTopLevel, false);
  assert.equal(path[2].isTopLevel, false);
});

test("buildBonePath marker 不存在时返回空数组", () => {
  const boneMap = new Map();
  const boneDataMap = new Map();
  const path = buildBonePath(boneMap, boneDataMap, "nonexistent");
  assert.deepEqual(path, []);
});

test("buildBonePath 处理循环引用（防死循环）", () => {
  // a → b → a（循环）
  const nodeA = { position: { x: 0, y: 0, z: 0 }, rotationQuaternion: BABYLON.Quaternion.Identity() };
  const nodeB = { position: { x: 1, y: 0, z: 0 }, rotationQuaternion: BABYLON.Quaternion.Identity() };
  const boneMap = new Map([
    ["a", nodeA],
    ["b", nodeB],
  ]);
  const boneDataMap = new Map([
    ["a", { parent: "b" }],
    ["b", { parent: "a" }],
  ]);
  const path = buildBonePath(boneMap, boneDataMap, "a");
  // 循环引用时应终止，不会死循环
  assert.ok(path.length <= 2);
});
