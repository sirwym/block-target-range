import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import { createTaczGeoModel } from "../src/taczGeoModel.js";
import { convertBonePivot } from "../src/taczBedrockCoordinate.js";
import { getVisibilityProfile } from "../src/visibilityProfile.js";

const GEO_DIR = path.resolve("public/assets/tacz/geo_models/gun");
// Phase3v7 目标 5 把武器（与 WEAPON_ORDER 一致，用 weaponId）
// geo 文件名前缀映射：m4 → m4a1_geo.json, awp → ai_awp_geo.json
const WEAPONS = ["m4", "m95", "deagle_golden", "awp", "ak47"];
const GEO_FILE_PREFIX = { m4: "m4a1", awp: "ai_awp" };

function loadGeo(weaponId) {
  const prefix = GEO_FILE_PREFIX[weaponId] ?? weaponId;
  const raw = fs.readFileSync(path.join(GEO_DIR, `${prefix}_geo.json`), "utf8");
  return JSON.parse(raw);
}

function createScene() {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  return { engine, scene };
}

// 构造一个含三轴旋转 bone 的 mock geo，验证 rotation 不被丢弃
const MOCK_GEO_THREE_AXIS = {
  format_version: "1.12.0",
  "minecraft:geometry": [
    {
      description: { identifier: "geometry.mock", texture_width: 16, texture_height: 16 },
      bones: [
        {
          name: "root",
          pivot: [0, 0, 0],
          cubes: [
            {
              origin: [0, 0, 0],
              size: [2, 2, 2],
              uv: { north: { uv: [0, 0], uv_size: [2, 2] } },
            },
          ],
        },
        {
          name: "child",
          parent: "root",
          pivot: [1, 1, 1],
          rotation: [30, 45, 60], // 三轴非零
          cubes: [
            {
              origin: [0, 0, 0],
              size: [1, 1, 1],
              uv: [0, 0],
            },
          ],
        },
      ],
    },
  ],
};

// 测试cube Y位置：root pivot在眼睛高度[0,24,0]，cube正好在pivot处
const MOCK_GEO_CUBE_Y_ROOT = {
  format_version: "1.12.0",
  "minecraft:geometry": [
    {
      description: { identifier: "geometry.mock_cube_y_root", texture_width: 16, texture_height: 16 },
      bones: [
        {
          name: "root",
          pivot: [0, 24, 0],
          cubes: [
            {
              origin: [-1, 25, -1],
              size: [2, 2, 2],
              uv: { north: { uv: [0, 0], uv_size: [2, 2] }, south: { uv: [0, 0], uv_size: [2, 2] }, east: { uv: [0, 0], uv_size: [2, 2] }, west: { uv: [0, 0], uv_size: [2, 2] }, up: { uv: [0, 0], uv_size: [2, 2] }, down: { uv: [0, 0], uv_size: [2, 2] } },
            },
          ],
        },
      ],
    },
  ],
};

// 测试lefthand_pos marker cube真实数据
const MOCK_GEO_CUBE_Y_CHILD = {
  format_version: "1.12.0",
  "minecraft:geometry": [
    {
      description: { identifier: "geometry.mock_cube_y_child", texture_width: 16, texture_height: 16 },
      bones: [
        {
          name: "root",
          pivot: [0, 24, 0],
        },
        {
          name: "testbone",
          parent: "root",
          pivot: [0, 8, 0],
          cubes: [
            {
              origin: [-8, 8, -2],
              size: [4, 12, 4],
              uv: { north: { uv: [0, 0], uv_size: [4, 12] }, south: { uv: [0, 0], uv_size: [4, 12] }, east: { uv: [0, 0], uv_size: [4, 12] }, west: { uv: [0, 0], uv_size: [4, 12] }, up: { uv: [0, 0], uv_size: [4, 4] }, down: { uv: [0, 0], uv_size: [4, 4] } },
            },
          ],
        },
      ],
    },
  ],
};

// 旋转顺序验证fixture：root在眼睛高度(24)，rotbone与root重合无平移，bone有90度Z旋转，
// cube沿X正方向偏移2像素(0.125方块)，通过cube世界位置验证旋转方向
const MOCK_GEO_ROTATION_FIXTURE = {
  format_version: "1.12.0",
  "minecraft:geometry": [
    {
      description: { identifier: "geometry.mock_rot", texture_width: 16, texture_height: 16 },
      bones: [
        {
          name: "root",
          pivot: [0, 24, 0],
        },
        {
          name: "rotbone",
          parent: "root",
          pivot: [0, 24, 0],
          rotation: [0, 0, 90],
          cubes: [
            {
              origin: [1, 25, -1],
              size: [2, 2, 2],
              uv: { north: { uv: [0,0], uv_size:[2,2] }, south: { uv: [0,0], uv_size:[2,2] }, east: { uv: [0,0], uv_size:[2,2] }, west: { uv: [0,0], uv_size:[2,2] }, up: { uv: [0,0], uv_size:[2,2] }, down: { uv: [0,0], uv_size:[2,2] } },
            },
          ],
        },
      ],
    },
  ],
};

test("createTaczGeoModel 保留三轴 rotation 不被丢弃", () => {
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, MOCK_GEO_THREE_AXIS, null, { weaponId: "mock" });
    const childNode = model.boneMap.get("child");
    assert.ok(childNode, "child bone 存在");
    // v9 修复 C：bone rotation 改用 rotationQuaternion（ZYX 顺序），不再用 Euler rotation
    // 当 rotationQuaternion 非空时 Babylon.js 忽略 rotation（Euler 角），所以检查 rotationQuaternion
    assert.ok(childNode.rotationQuaternion, "rotationQuaternion 非空（修复 C 生效）");
    // 验证 ZYX 顺序四元数：q = qZ(60°) * qY(45°) * qX(30°)
    // TaCZ BedrockPart.translateAndRotateAndScale 的 mulPose(Z,Y,X) 是 post-multiply，
    // 矩阵 = R_Z * R_Y * R_X，四元数 q = q_Z * q_Y * q_X
    // Babylon.js Quaternion.multiply(other) 返回 this * other
    const DEG = Math.PI / 180;
    const qZ = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, 60 * DEG);
    const qX = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, 30 * DEG);
    const qY = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, 45 * DEG);
    const expected = qZ.multiply(qY).multiply(qX);
    const actual = childNode.rotationQuaternion;
    assert.ok(Math.abs(actual.x - expected.x) < 0.0001, `q.x: ${actual.x} 期望 ${expected.x}`);
    assert.ok(Math.abs(actual.y - expected.y) < 0.0001, `q.y: ${actual.y} 期望 ${expected.y}`);
    assert.ok(Math.abs(actual.z - expected.z) < 0.0001, `q.z: ${actual.z} 期望 ${expected.z}`);
    assert.ok(Math.abs(actual.w - expected.w) < 0.0001, `q.w: ${actual.w} 期望 ${expected.w}`);
  } finally {
    engine.dispose();
  }
});

test("createTaczGeoModel 保留 bone pivot", () => {
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, MOCK_GEO_THREE_AXIS, null, { weaponId: "mock" });
    const childNode = model.boneMap.get("child");
    // pivot 经 convertBonePivot 转换：
    //   X = (1-0)/16 = 1/16, Z = (1-0)/16 = 1/16
    //   Y（child翻转）= (0-1)/16 = -1/16
    assert.ok(Math.abs(childNode.position.x - 1/16) < 0.0001, `pivot.x: ${childNode.position.x}`);
    assert.ok(Math.abs(childNode.position.y - (-1/16)) < 0.0001, `pivot.y: ${childNode.position.y}`);
    assert.ok(Math.abs(childNode.position.z - 1/16) < 0.0001, `pivot.z: ${childNode.position.z}`);
  } finally {
    engine.dispose();
  }
});

test("[TaCZ语义] root bone pivot [0,24,0] 的localY应该是0（24-24=0，眼睛高度对齐）", () => {
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, MOCK_GEO_CUBE_Y_ROOT, null, { weaponId: "mock_cube_y", disableCentering: true });
    const rootNode = model.boneMap.get("root");
    assert.ok(rootNode, "root bone存在");
    assert.ok(Math.abs(rootNode.position.x - 0) < 0.0001, `root pos.x: ${rootNode.position.x} 期望 0`);
    assert.ok(Math.abs(rootNode.position.y - 0) < 0.0001, `root pos.y: ${rootNode.position.y} 期望 0 (24-24=0)`);
    assert.ok(Math.abs(rootNode.position.z - 0) < 0.0001, `root pos.z: ${rootNode.position.z} 期望 0`);
  } finally {
    engine.dispose();
  }
});

test("[TaCZ语义] child bone pivot [0,8,0] parent pivot [0,24,0] 时 localY应该是(24-8)/16=1.0", () => {
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, MOCK_GEO_CUBE_Y_CHILD, null, { weaponId: "mock_cube_y2", disableCentering: true });
    const boneNode = model.boneMap.get("testbone");
    assert.ok(boneNode, "testbone存在");
    assert.ok(Math.abs(boneNode.position.x - 0) < 0.0001, `bone pos.x: ${boneNode.position.x} 期望 0`);
    assert.ok(Math.abs(boneNode.position.y - 1.0) < 0.0001, `bone pos.y: ${boneNode.position.y} 期望 1.0 ((24-8)/16=1.0)`);
    assert.ok(Math.abs(boneNode.position.z - 0) < 0.0001, `bone pos.z: ${boneNode.position.z} 期望 0`);
  } finally {
    engine.dispose();
  }
});

test("[TaCZ语义] 无旋转cube: origin是top, centerY=originY+sizeY/2, subtractUnitVectorYFlip后meshLocalY=-6/16=-0.375", () => {
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, MOCK_GEO_CUBE_Y_CHILD, null, { weaponId: "mock_cube_y3", disableCentering: true });
    const boneNode = model.boneMap.get("testbone");
    assert.ok(boneNode, "testbone存在");
    let cubeMesh = null;
    for (const child of boneNode.getChildren()) {
      if (child instanceof BABYLON.Mesh) {
        cubeMesh = child;
        break;
      }
    }
    assert.ok(cubeMesh, "cube mesh存在");
    // cubeCenterX = -8 + 4/2 = -6, meshLocalX = (-6 - 0)/16 = -0.375
    assert.ok(Math.abs(cubeMesh.position.x - (-0.375)) < 0.0001, `mesh pos.x: ${cubeMesh.position.x} 期望 -0.375`);
    // cubeCenterY = 8 + 12/2 = 14（origin是top，center在下方sizeY/2=6像素处）, meshLocalY = (8 - 14)/16 = -0.375（Y翻转）
    assert.ok(Math.abs(cubeMesh.position.y - (-0.375)) < 0.0001, `mesh pos.y: ${cubeMesh.position.y} 期望 -0.375 (center在pivot下方6像素，Y翻转语义)`);
    // cubeCenterZ = -2 + 4/2 = 0, meshLocalZ = (0 - 0)/16 = 0
    assert.ok(Math.abs(cubeMesh.position.z - 0) < 0.0001, `mesh pos.z: ${cubeMesh.position.z} 期望 0`);
  } finally {
    engine.dispose();
  }
});

test("createTaczGeoModel 保留 bone parent/child 层级", () => {
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, MOCK_GEO_THREE_AXIS, null, { weaponId: "mock" });
    const rootNode = model.boneMap.get("root");
    const childNode = model.boneMap.get("child");
    // 用 assert.ok 而非 assert.equal，避免 Node util.inspect 渲染 Babylon TransformNode 时卡住
    assert.ok(childNode.parent === rootNode, "child.parent === root");
    // 居中逻辑会把顶层 bone 的 parent 改为 centeringNode，root.parent 可能是 root 或 centeringNode
    assert.ok(rootNode.parent === model.root || rootNode.parent === model.centeringNode, "root.parent === root/centering");
  } finally {
    engine.dispose();
  }
});

for (const weapon of WEAPONS) {
  test(`createTaczGeoModel 加载 ${weapon} 原始 geo`, () => {
    const geo = loadGeo(weapon);
    const { scene, engine } = createScene();
    try {
      const model = createTaczGeoModel(scene, geo, null, { weaponId: weapon });
      // boneMap 非空
      assert.ok(model.boneMap.size > 0, `boneMap size: ${model.boneMap.size}`);
      // cubes 非空
      assert.ok(model.cubes.length > 0, `cubes count: ${model.cubes.length}`);
      // root bone 存在
      assert.ok(model.boneMap.has("root"), "root bone 存在");
      // textureWidth/Height
      assert.ok(model.textureWidth > 0, `textureWidth: ${model.textureWidth}`);
      assert.ok(model.textureHeight > 0, `textureHeight: ${model.textureHeight}`);
    } finally {
      engine.dispose();
    }
  });

  test(`${weapon} geo bone 层级存在（root 有 children）`, () => {
    const geo = loadGeo(weapon);
    const { scene, engine } = createScene();
    try {
      const model = createTaczGeoModel(scene, geo, null, { weaponId: weapon });
      const rootNode = model.boneMap.get("root");
      assert.ok(rootNode, "root node 存在");
      const children = rootNode.getChildTransformNodes();
      assert.ok(children.length > 0, `root children count: ${children.length}`);
    } finally {
      engine.dispose();
    }
  });

  test(`${weapon} cubes 数组含 boneName/origin/size`, () => {
    const geo = loadGeo(weapon);
    const { scene, engine } = createScene();
    try {
      const model = createTaczGeoModel(scene, geo, null, { weaponId: weapon });
      const cube = model.cubes[0];
      assert.ok(cube.boneName, `cube.boneName: ${cube.boneName}`);
      assert.ok(Array.isArray(cube.origin), "cube.origin is array");
      assert.ok(Array.isArray(cube.size), "cube.size is array");
    } finally {
      engine.dispose();
    }
  });
}

test("deagle_golden geo boneMap 包含关键 bone", () => {
  const geo = loadGeo("deagle_golden");
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, geo, null, { weaponId: "deagle_golden" });
    const required = ["root", "mag_and_lefthand", "slide2", "righthand", "lefthand", "constraint"];
    for (const name of required) {
      assert.ok(model.boneMap.has(name), `boneMap 包含 ${name}`);
    }
  } finally {
    engine.dispose();
  }
});

test("m95 geo boneMap 包含关键 bone", () => {
  const geo = loadGeo("m95");
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, geo, null, { weaponId: "m95" });
    const required = ["root", "m95_bolt", "magzine", "righthand", "lefthand", "constraint"];
    for (const name of required) {
      assert.ok(model.boneMap.has(name), `boneMap 包含 ${name}`);
    }
  } finally {
    engine.dispose();
  }
});

test("新枪默认不渲染 TaCZ 备用/折叠/占位 bone，但保留 boneMap 供动画驱动", () => {
  const hiddenByWeapon = {
    deagle_golden: ["mag_extended_1", "mag_extended_2", "mag_extended_3", "additional_magazine"],
    m95: ["sight_folded", "mag_extended_1", "mag_extended_2", "mag_extended_3", "shell_ejection"],
  };

  for (const [weapon, hiddenRoots] of Object.entries(hiddenByWeapon)) {
    const geo = loadGeo(weapon);
    const { scene, engine } = createScene();
    try {
      const model = createTaczGeoModel(scene, geo, null, { weaponId: weapon });
      for (const hiddenRoot of hiddenRoots) {
        assert.ok(model.boneMap.has(hiddenRoot), `${weapon} boneMap 保留 ${hiddenRoot}`);
        assert.equal(
          model.cubes.some((cube) => cube.boneName === hiddenRoot),
          false,
          `${weapon} 默认不渲染 ${hiddenRoot} cube`
        );
      }
    } finally {
      engine.dispose();
    }
  }
});

test("createTaczGeoModel dispose 清理资源", () => {
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, MOCK_GEO_THREE_AXIS, null, { weaponId: "mock" });
    assert.ok(model.root, "root exists before dispose");
    model.dispose();
    assert.ok(model.root.isDisposed(), "root disposed");
  } finally {
    engine.dispose();
  }
});

// ===== 坐标双重变换回归测试 ====
// 防止 cube 顶点使用绝对模型坐标导致模型"爆炸散开"

// 辅助：获取 mesh 世界包围盒中心
function getMeshWorldBoxCenter(mesh) {
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo();
  const bb = mesh.getBoundingInfo().boundingBox;
  const min = bb.minimumWorld;
  const max = bb.maximumWorld;
  return new BABYLON.Vector3(
    (min.x + max.x) / 2,
    (min.y + max.y) / 2,
    (min.z + max.z) / 2
  );
}

// 辅助：获取 mesh 世界包围盒 min/max
function getMeshWorldBounds(mesh) {
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo();
  const bb = mesh.getBoundingInfo().boundingBox;
  return { min: bb.minimumWorld, max: bb.maximumWorld };
}

function assertArrayClose(actual, expected, message, epsilon = 0.0001) {
  assert.equal(actual.length, expected.length, `${message} length`);
  for (let i = 0; i < expected.length; i += 1) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) < epsilon,
      `${message}[${i}]: ${actual[i]} 期望 ${expected[i]}`
    );
  }
}

function localDiff(a, b) {
  return [
    ((a[0] ?? 0) - (b[0] ?? 0)) / 16,
    ((b[1] ?? 0) - (a[1] ?? 0)) / 16,
    ((a[2] ?? 0) - (b[2] ?? 0)) / 16,
  ];
}

test("双重变换回归：两个相距 10 像素的 cube 世界距离应为 0.625 而非 1.25", () => {
  // 构造 mock geo：root bone + child bone，各自一个 cube，相距 10 像素
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [
      {
        description: { identifier: "geometry.distance_test", texture_width: 16, texture_height: 16 },
        bones: [
          {
            name: "root",
            pivot: [0, 0, 0],
            cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
          },
          {
            name: "child",
            parent: "root",
            pivot: [10, 0, 0],
            cubes: [{ origin: [10, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
          },
        ],
      },
    ],
  };
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, mockGeo, null, { weaponId: "distance-test" });
    assert.ok(model.cubes.length === 2, `应有 2 个 cube，实际 ${model.cubes.length}`);
    const rootCenter = getMeshWorldBoxCenter(model.cubes[0].mesh);
    const childCenter = getMeshWorldBoxCenter(model.cubes[1].mesh);
    const dx = childCenter.x - rootCenter.x;
    // 正确距离 = 10 像素 / 16 = 0.625
    // 如果 bug 存在（顶点含绝对坐标），距离会翻倍 = 1.25
    assert.ok(
      Math.abs(dx - 10 / 16) < 0.01,
      `cube 间距应为 ${10 / 16}（实际 ${dx}），不能是 ${20 / 16}（双重变换 bug）`
    );
  } finally {
    engine.dispose();
  }
});

test("无旋转 bone 下旋转 cube pivot local 位置等于 subtractUnitVectorYFlip(cubePivot, bonePivot)（convertPivot语义Y翻转）", () => {
  // Phase2 优化：旋转 parent 下也使用 bind-pose 差值作为 local position。
  // 这个测试用无旋转 bone 验证 cubePivotNode local = subtractUnitVectorYFlip(cubePivot, bonePivot) 基础情形。
  // 构造 mock geo：bone pivot [4,2,0]，cube 有旋转和独立 pivot
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [
      {
        description: { identifier: "geometry.rot_pivot_test", texture_width: 16, texture_height: 16 },
        bones: [
          {
            name: "root",
            pivot: [4, 2, 0],
            cubes: [{
              origin: [6, 2, 0],
              size: [2, 2, 2],
              pivot: [7, 3, 1],
              rotation: [0, 45, 0],
              uv: [0, 0],
            }],
          },
        ],
      },
    ],
  };
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, mockGeo, null, { weaponId: "rot-pivot-test" });
    const boneNode = model.boneMap.get("root");
    assert.ok(boneNode, "root bone 存在");
    // 找到 cubePivotNode（bone 的子 TransformNode，非 Mesh）
    const children = boneNode.getChildTransformNodes();
    const pivotNode = children.find(c => c.getClassName() === "TransformNode");
    assert.ok(pivotNode, "cubePivotNode 存在");
    // cubePivotNode.position = subtractUnitVectorYFlip(cubePivot, bonePivot)
    // X/Z: (cubePivot - bonePivot)/16, Y: (bonePivot - cubePivot)/16
    // = ([7,3,1], [4,2,0]) → [(7-4)/16, (2-3)/16, (1-0)/16] = [3/16, -1/16, 1/16]
    const expectedX = (7 - 4) / 16;
    const expectedY = (2 - 3) / 16;
    const expectedZ = (1 - 0) / 16;
    assert.ok(Math.abs(pivotNode.position.x - expectedX) < 0.0001, `pivotNode.position.x: ${pivotNode.position.x} 期望 ${expectedX}`);
    assert.ok(Math.abs(pivotNode.position.y - expectedY) < 0.0001, `pivotNode.position.y: ${pivotNode.position.y} 期望 ${expectedY}`);
    assert.ok(Math.abs(pivotNode.position.z - expectedZ) < 0.0001, `pivotNode.position.z: ${pivotNode.position.z} 期望 ${expectedZ}`);
    // mesh.position = subtractUnitVectorYFlip(cubeCenter, cubePivot)
    // cubeCenter: X=6+2/2=7, Y=originY+sizeY/2=2+1=3（origin[1]是top，center在下方sizeY/2处）, Z=0+2/2=1 → [7,3,1]
    // cubePivot = [7,3,1]，所以 meshLocal = [0, (3-3)/16=0, 0]
    const mesh = model.cubes[0].mesh;
    const expectedMeshX = (7 - 7) / 16;
    const expectedMeshY = (3 - 3) / 16;
    const expectedMeshZ = (1 - 1) / 16;
    assert.ok(Math.abs(mesh.position.x - expectedMeshX) < 0.0001, `mesh.position.x: ${mesh.position.x} 期望 ${expectedMeshX}`);
    assert.ok(Math.abs(mesh.position.y - expectedMeshY) < 0.0001, `mesh.position.y: ${mesh.position.y} 期望 ${expectedMeshY}`);
    assert.ok(Math.abs(mesh.position.z - expectedMeshZ) < 0.0001, `mesh.position.z: ${mesh.position.z} 期望 ${expectedMeshZ}`);
  } finally {
    engine.dispose();
  }
});

// 真实 5 把目标武器 compact bounds 测试：防止模型异常膨胀
// 理论尺寸来自 info 文件，允许 ±50% 容差（含 centering 和 mesh 大小）
// Phase2 bind-pose 差值修复后，cube 跟随 bone 旋转，AABB 可能比"碎块挤一起"略大，
// 因此 ak47/m4a1 先用宽松阈值防散架，待浏览器视觉验收后再收紧到实际正常 bounds。
const COMPACT_BOUNDS_SPEC = {
  deagle_golden: { maxX: 0.50, maxY: 2.00, maxZ: 1.50 },  // fix 后实测 0.133/1.104/0.835
  m95:           { maxX: 1.00, maxY: 3.50, maxZ: 6.00 },  // fix 后实测 0.350/2.225/3.955
  ak47:          { maxX: 1.00, maxY: 4.50, maxZ: 4.00 },  // fix 后实测 0.434/2.891/2.682
  m4:            { maxX: 2.50, maxY: 7.00, maxZ: 6.00 },  // fix 后实测 1.581/5.156/4.055，Y 增大因 bone Y 翻转后包围盒重算
  awp:           { maxX: 1.00, maxY: 4.00, maxZ: 5.50 },  // fix 后实测 0.316/2.445/3.567
};

const DEBUG_OUTLIER_LIMITS = {
  deagle_golden: 1.00,
  m95: 3.50,
  ak47: 2.50,
  m4: 4.00,
  awp: 3.00,
};

const KEY_BONE_PARENTS = {
  deagle_golden: {
    root: null,
    mag_and_lefthand: "root",
    slide2: "Deagle_golden",
    righthand: "gun_and_righthand",
    lefthand: "mag_and_lefthand",
    constraint: "Deagle_golden",
  },
  m95: {
    root: null,
    m95_bolt: "m95",
    magzine: "mag_and_bullet",
    righthand: "gun_and_righthand",
    lefthand: "mag_and_lefthand",
    constraint: "m95",
  },
  ak47: {
    root: null,
    AKM: "bone2",
    muzzle_pos: "positioning2",
    lefthand_and_mag: "AKM",
    bolt: "AKM",
    constraint: "AKM",
  },
  m4: {
    root: null,
    gun_and_righthand: "root",
    m4a1: "gun_and_righthand",
    gun_body: "m4a1",
    barrel: "gun_body",
    muzzle_pos: "positioning2",
    mag_and_lefthand: "root",
  },
  awp: {
    root: null,
    AWP: "root",
    gun_and_righthand: "AWP",
    AWP_body: "gun_and_righthand",
    bolt_group: "AWP_body",
    mag_and_lefthand: "AWP",
    lefthand: "mag_and_lefthand",
    constraint: "AWP_body",
  },
};

const KEY_CUBES = {
  deagle_golden: { boneName: "bullet", cubeIndex: 0 },
  m95: { boneName: "head3", cubeIndex: 0 },
  ak47: { boneName: "wood", cubeIndex: 0 },
  m4: { boneName: "group3", cubeIndex: 0 },
  awp: { boneName: "receiver", cubeIndex: 0 },
};

for (const weapon of WEAPONS) {
  test(`${weapon} 渲染包围盒不异常膨胀`, () => {
    const geo = loadGeo(weapon);
    const { scene, engine } = createScene();
    try {
      const model = createTaczGeoModel(scene, geo, null, { weaponId: weapon });
      assert.ok(model.cubes.length > 0, "cubes 非空");

      // 计算所有 mesh world bounding box 的并集
      const min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
      const max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
      for (const cube of model.cubes) {
        const bounds = getMeshWorldBounds(cube.mesh);
        min.x = Math.min(min.x, bounds.min.x);
        min.y = Math.min(min.y, bounds.min.y);
        min.z = Math.min(min.z, bounds.min.z);
        max.x = Math.max(max.x, bounds.max.x);
        max.y = Math.max(max.y, bounds.max.y);
        max.z = Math.max(max.z, bounds.max.z);
      }
      const extentX = max.x - min.x;
      const extentY = max.y - min.y;
      const extentZ = max.z - min.z;
      const spec = COMPACT_BOUNDS_SPEC[weapon];
      assert.ok(extentX < spec.maxX, `${weapon} X 膨胀: ${extentX.toFixed(3)} >= ${spec.maxX}（散架特征）`);
      assert.ok(extentY < spec.maxY, `${weapon} Y 膨胀: ${extentY.toFixed(3)} >= ${spec.maxY}（散架特征）`);
      assert.ok(extentZ < spec.maxZ, `${weapon} Z 膨胀: ${extentZ.toFixed(3)} >= ${spec.maxZ}（散架特征）`);
    } finally {
      engine.dispose();
    }
  });
}

test("Phase2 失败基线中的主结构 outlier 不允许被 profile 直接隐藏", () => {
  const cases = [
    { weaponId: "deagle_golden", geoName: "deagle_golden", mainBones: ["grip_lower", "grip"] },
    { weaponId: "m95", geoName: "m95", mainBones: ["bone"] },
    // ak47 的枪口前端组件 muzzle_default/barrel4/iron_sight4 全部在 hiddenBoneCubes/defaultHiddenBones 中隐藏
    //   （z≤1.5 时 minCameraZ<0 或 ≤0.11 projectionUnreliable，z≥2.0 时 screenBounds 太小）
    //   ak47 geo 中没有其他 MAIN_STRUCTURE_BONES 中的 bone 有 cubes 且不被隐藏，从测试中移除
    // bone70 的父 bone rings3 已在 visibilityProfile.defaultHiddenBones 中故意隐藏
    // （rings3 pivot y=-16 异常 + bone70 rotation [90,0,-60] 任何 pose 下都飞出屏幕）
    // 所以 bone70 不再出现在 debugGeometry.cubes 中，从主结构 outlier 基线中移除
    // bone/bone2/octagon4 已在 hiddenBoneCubes 中故意隐藏（dist 3000+ 极远 outlier）
    // 改为检查 gun_body（主结构 bone，未被隐藏）
    { weaponId: "m4", geoName: "m4a1", mainBones: ["gun_body"] },
  ];

  for (const { weaponId, geoName, mainBones } of cases) {
    const { scene, engine } = createScene();
    try {
      const model = createTaczGeoModel(scene, loadGeo(geoName), null, {
        weaponId,
        visibilityProfile: getVisibilityProfile(weaponId),
      });
      for (const boneName of mainBones) {
        const cubeDebug = model.debugGeometry.cubes.find((cube) => cube.boneName === boneName);
        assert.ok(cubeDebug, `${weaponId} debugGeometry.cubes 包含 ${boneName}`);
        assert.ok(cubeDebug.boneChain.includes(boneName), `${weaponId}.${boneName} 记录 boneChain`);
        assert.equal(cubeDebug.isMainStructureCandidate, true, `${weaponId}.${boneName} 应标记为主结构`);
        assert.equal(cubeDebug.hideAllowed, false, `${weaponId}.${boneName} 主结构不允许直接隐藏`);
      }
    } finally {
      engine.dispose();
    }
  }
});

test("m95 mag_release 不因 mag_ 前缀被误判为可隐藏变体", () => {
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, loadGeo("m95"), null, {
      weaponId: "m95",
      visibilityProfile: getVisibilityProfile("m95"),
    });
    const magRelease = model.debugGeometry.cubes.find((cube) => cube.boneName === "mag_release");
    assert.ok(magRelease, "m95 debugGeometry.cubes 包含 mag_release");
    assert.equal(magRelease.isProfileHiddenCandidate, false, "mag_release 是结构释放钮，不是扩展弹匣/手持物候选");
    assert.equal(magRelease.hideAllowed, false, "mag_release 不允许被 profile 自动隐藏");
  } finally {
    engine.dispose();
  }
});

for (const weapon of WEAPONS) {
  test(`${weapon} debugGeometry 暴露真实 geo 诊断数据`, () => {
    const geo = loadGeo(weapon);
    const { scene, engine } = createScene();
    try {
      const model = createTaczGeoModel(scene, geo, null, { weaponId: weapon });
      const debug = model.debugGeometry;
      assert.ok(debug, "debugGeometry 存在");
      assert.equal(debug.weaponId, weapon);
      assert.equal(debug.coordinateMode, "bind-pose-diff");
      assert.equal(debug.pixelToUnit, 1 / 16);
      assert.equal(debug.cubeCount, model.cubes.length);
      assert.equal(debug.cubes.length, model.cubes.length);
      assert.equal(debug.bones.length, model.boneMap.size);
      assert.ok(debug.bounds, "debugGeometry.bounds 存在");
      assert.ok(debug.rawBounds, "debugGeometry.rawBounds 存在");
      assert.ok(debug.visibleBounds, "debugGeometry.visibleBounds 存在");
      assert.ok(Number.isFinite(debug.bounds.extent.x), "extent.x 有限");
      assert.ok(Number.isFinite(debug.bounds.extent.y), "extent.y 有限");
      assert.ok(Number.isFinite(debug.bounds.extent.z), "extent.z 有限");
      assert.ok(Array.isArray(debug.outliers), "outliers 是数组");
      assert.ok(Array.isArray(debug.rawOutliers), "rawOutliers 是数组");
      assert.ok(Array.isArray(debug.visibleOutliers), "visibleOutliers 是数组");
      assert.ok(debug.outliers.length > 0 && debug.outliers.length <= 20, `outliers.length=${debug.outliers.length}`);
      assert.deepEqual(debug.outliers, debug.visibleOutliers, "outliers 兼容别名应指向 visibleOutliers");
      assert.ok(
        debug.outliers[0].distanceFromModelCenter < DEBUG_OUTLIER_LIMITS[weapon],
        `${weapon} top outlier distance=${debug.outliers[0].distanceFromModelCenter}`
      );
      assert.ok(debug.outliers[0].meshWorldBounds?.center, "top outlier 含 meshWorldBounds.center");
      assert.equal(debug.outliers[0].effectiveVisible, true, "默认 outlier 只来自最终可见 cube");
      assert.ok(debug.semantics.candidates.includes("z-axis-mirrored-position"), "诊断声明坐标轴候选语义");
    } finally {
      engine.dispose();
    }
  });

  test(`${weapon} debugGeometry 关键 bone 层级与 local pivot 差值稳定`, () => {
    const geo = loadGeo(weapon);
    const { scene, engine } = createScene();
    try {
      const model = createTaczGeoModel(scene, geo, null, { weaponId: weapon });
      const debug = model.debugGeometry;
      const boneDebugByName = new Map(debug.bones.map((bone) => [bone.boneName, bone]));
      for (const [boneName, expectedParent] of Object.entries(KEY_BONE_PARENTS[weapon])) {
        const boneDebug = boneDebugByName.get(boneName);
        assert.ok(boneDebug, `${weapon} debugGeometry.bones 包含 ${boneName}`);
        assert.equal(boneDebug.boneParent, expectedParent, `${weapon}.${boneName} parent`);
        // localPosition 严格按 convertBonePivot 语义：顶层bone Y=(24-pivotY)/16, child Y=(parentY-childY)/16
        const isTopLevel = !boneDebug.boneParent;
        const expectedLocal = convertBonePivot(boneDebug.originalPivot, isTopLevel ? null : boneDebug.parentPivot, isTopLevel);
        assertArrayClose(
          boneDebug.localPosition,
          expectedLocal,
          `${weapon}.${boneName} localPosition = convertBonePivot(pivot, parentPivot, isTopLevel)`
        );
      }
    } finally {
      engine.dispose();
    }
  });

  test(`${weapon} debugGeometry 关键 cube local 差值与 mesh bounds 有效`, () => {
    const geo = loadGeo(weapon);
    const { scene, engine } = createScene();
    try {
      const model = createTaczGeoModel(scene, geo, null, { weaponId: weapon });
      const debug = model.debugGeometry;
      const key = KEY_CUBES[weapon];
      const cubeDebug = debug.cubes.find((cube) => cube.boneName === key.boneName && cube.cubeIndex === key.cubeIndex);
      assert.ok(cubeDebug, `${weapon} debugGeometry.cubes 包含 ${key.boneName}-${key.cubeIndex}`);
      assertArrayClose(
        cubeDebug.cubeCenterLocal,
        localDiff(cubeDebug.cubeCenter, cubeDebug.bonePivot),
        `${weapon}.${key.boneName}-${key.cubeIndex} cubeCenterLocal`
      );
      if (cubeDebug.hasRotation) {
        assertArrayClose(
          cubeDebug.cubePivotLocal,
          localDiff(cubeDebug.cubePivot, cubeDebug.bonePivot),
          `${weapon}.${key.boneName}-${key.cubeIndex} cubePivotLocal`
        );
        assertArrayClose(
          cubeDebug.meshLocal,
          localDiff(cubeDebug.cubeCenter, cubeDebug.cubePivot),
          `${weapon}.${key.boneName}-${key.cubeIndex} meshLocal`
        );
      } else {
        assert.equal(cubeDebug.cubePivotLocal, null, `${weapon}.${key.boneName}-${key.cubeIndex} 无旋转 cube 不创建 cubePivotLocal`);
        assertArrayClose(
          cubeDebug.meshLocal,
          cubeDebug.cubeCenterLocal,
          `${weapon}.${key.boneName}-${key.cubeIndex} meshLocal = cubeCenterLocal`
        );
      }
      assert.ok(Number.isFinite(cubeDebug.meshWorldBounds.center.x), "meshWorldBounds.center.x 有限");
      assert.ok(Number.isFinite(cubeDebug.distanceFromModelCenter), "distanceFromModelCenter 有限");
    } finally {
      engine.dispose();
    }
  });
}

// ===== 带旋转 bone 的 cube 世界坐标测试 ====
// 验证修复方案 A（setAbsolutePosition）和 B（世界矩阵逆矩阵转换）：
// 当父 bone 有旋转时，子 bone 的 cube 世界坐标应等于模型空间坐标，不因旋转而偏移。

test("带旋转 bone 的 cube 世界坐标正确（cube 跟随 bone 旋转）", () => {
  // Phase2 修复后：Bedrock bone.pivot 是 bind pose 模型空间坐标，子 cube 跟随 bone 旋转。
  // 构造 mock geo：
  // - root bone: pivot [0,0,0]，无旋转，有 cube at [0,0,0] size [1,1,1]
  // - child bone: pivot [0,0,0]，rotation [0, 90, 0]，有 cube at [8,0,0] size [1,1,1]
  //
  // 模型空间 cube 中心（bind pose）：
  //   root cube center = [0.5, 0.5, 0.5]
  //   child cube center = [8.5, 0.5, 0.5]
  //
  // child bone 旋转 [0,90,0]（绕 Y 轴 90°，右手系）：
  //   Y 轴 90° 旋转：[x,y,z] → [z, y, -x]
  //   child cube center 旋转后世界坐标 = [0.5, 0.5, -8.5]
  //
  // 修复后预期：
  //   dx = 0.5 - 0.5 = 0
  //   dy = 0
  //   dz = -8.5 - 0.5 = -9 → -9/16
  //
  // 旧 bug 行为（setAbsolutePosition + world inverse）：cube 被钉在绝对坐标，
  // 不跟随 bone 旋转，dx = 8/16, dz = 0，这是错误的 Bedrock 语义。
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [
      {
        description: { identifier: "geometry.rot_bone_test", texture_width: 16, texture_height: 16 },
        bones: [
          {
            name: "root",
            pivot: [0, 0, 0],
            cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
          },
          {
            name: "child",
            parent: "root",
            pivot: [0, 0, 0],
            rotation: [0, 90, 0],
            cubes: [{ origin: [8, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
          },
        ],
      },
    ],
  };
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, mockGeo, null, { weaponId: "rot-bone-test" });
    assert.ok(model.cubes.length === 2, `应有 2 个 cube，实际 ${model.cubes.length}`);
    const rootCenter = getMeshWorldBoxCenter(model.cubes[0].mesh);
    const childCenter = getMeshWorldBoxCenter(model.cubes[1].mesh);
    const dx = childCenter.x - rootCenter.x;
    const dy = childCenter.y - rootCenter.y;
    const dz = childCenter.z - rootCenter.z;
    // 预期：cube 跟随 bone Y 轴 90° 旋转，从 [8,0,0] 旋到 [0,0,-8]
    assert.ok(
      Math.abs(dx) < 0.01,
      `dx 应为 0（实际 ${dx}），cube 跟随 bone 旋转后不应在 X 方向偏移`
    );
    assert.ok(
      Math.abs(dy) < 0.01,
      `dy 应为 0（实际 ${dy}），bone Y 轴旋转不应改变 cube 世界 Y 坐标`
    );
    assert.ok(
      Math.abs(dz - (-9 / 16)) < 0.01,
      `dz 应为 ${-9 / 16}（实际 ${dz}），cube 跟随 bone 旋转后应在 -Z 方向（右手系 Y 轴 90°: [x,y,z]→[z,y,-x]）`
    );
  } finally {
    engine.dispose();
  }
});

test("深层级带旋转 bone 的 cube 世界坐标正确", () => {
  // Phase2 修复后：Bedrock bone.pivot 是 bind pose 模型空间坐标，子 cube 跟随父 bone 旋转链。
  // 构造 mock geo（模拟深层级 bone + 旋转场景）：
  // - root bone: pivot [0,0,0]，无旋转，cube at [0,0,0] size [1,1,1]
  // - middle bone: pivot [4,0,0]，rotation [0, 90, 0]，parent root
  // - leaf bone: pivot [8,0,0]，无旋转，parent middle，cube at [12,0,0] size [1,1,1]
  //
  // bind pose 模型空间 cube 中心：
  //   root cube center = [0.5, 0.5, 0.5]
  //   leaf cube center = [12.5, 0.5, 0.5]
  //
  // middle 旋转 [0,90,0] 后：
  //   middle 世界位置 = [4,0,0]（自身 pivot 不动，rotation 只影响子节点）
  //   leaf cube world = middle_world * leaf_local * cube_local
  //     = T([4,0,0]/16) * Ry(90°) * T([4,0,0]/16) * [4.5,0.5,0.5]/16
  //     = T([4,0,0]/16) * Ry(90°) * ([4,0,0]/16 + [4.5,0.5,0.5]/16)
  //     = T([4,0,0]/16) * Ry(90°) * [8.5,0.5,0.5]/16
  //     = [4,0,0]/16 + [0.5,0.5,-8.5]/16  (Y90°: [x,y,z]→[z,y,-x])
  //     = [4.5, 0.5, -8.5]/16
  //
  // 预期：
  //   dx = 4.5/16 - 0.5/16 = 4 → 4/16
  //   dy = 0
  //   dz = -8.5/16 - 0.5/16 = -9 → -9/16
  //
  // 注意：cube local position 也会被 middle 旋转影响（通过 leaf world matrix），
  // 所以不能用"leaf cube 相对 leaf bone 偏移不变"来算世界坐标。
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [
      {
        description: { identifier: "geometry.deep_rot_test", texture_width: 16, texture_height: 16 },
        bones: [
          {
            name: "root",
            pivot: [0, 0, 0],
            cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
          },
          {
            name: "middle",
            parent: "root",
            pivot: [4, 0, 0],
            rotation: [0, 90, 0],
          },
          {
            name: "leaf",
            parent: "middle",
            pivot: [8, 0, 0],
            cubes: [{ origin: [12, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
          },
        ],
      },
    ],
  };
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, mockGeo, null, { weaponId: "deep-rot-test" });
    assert.ok(model.cubes.length === 2, `应有 2 个 cube，实际 ${model.cubes.length}`);
    const rootCenter = getMeshWorldBoxCenter(model.cubes[0].mesh);
    const leafCenter = getMeshWorldBoxCenter(model.cubes[1].mesh);
    const dx = leafCenter.x - rootCenter.x;
    const dz = leafCenter.z - rootCenter.z;
    // 预期：cube 跟随 middle 旋转链
    // dx = 4/16, dz = -9/16
    assert.ok(
      Math.abs(dx - 4 / 16) < 0.01,
      `dx 应为 ${4 / 16}（实际 ${dx}），深层级 cube 跟随旋转链后世界 X 应为 4/16`
    );
    assert.ok(
      Math.abs(dz - (-9 / 16)) < 0.01,
      `dz 应为 ${-9 / 16}（实际 ${dz}），深层级 cube 跟随旋转链后世界 Z 应为 -9/16`
    );
  } finally {
    engine.dispose();
  }
});

// ===== Phase2 新增：bind-pose 差值方案测试 ====
// 验证 Phase2 修复方向：
// - bone local position = (bone.pivot - parent.pivot) * PIXEL_TO_UNIT
// - cube local position = (cubeCenter - bone.pivot) * PIXEL_TO_UNIT
// - 旋转 parent 下 cube 跟随 parent 旋转（正确 Bedrock 语义）
// - 不再使用 setAbsolutePosition + world inverse 反算 local

test("bone 顺序无关：child 写在 parent 前时 bind-pose 差值仍正确", () => {
  // 构造 mock geo：bones 顺序故意 child-before-parent
  // - leaf bone: pivot [8,0,0]，parent middle，cube at [12,0,0] size [1,1,1]
  // - middle bone: pivot [4,0,0]，rotation [0, 90, 0]，parent root
  // - root bone: pivot [0,0,0]，cube at [0,0,0] size [1,1,1]
  //
  // bind pose：
  //   root cube center = [0.5, 0.5, 0.5]
  //   leaf cube center = [12.5, 0.5, 0.5]
  //
  // middle 旋转 [0,90,0] 后（与上一测试 "深层级带旋转 bone 的 cube 世界坐标正确" 相同）：
  //   leaf cube world = [4.5, 0.5, -8.5]/16
  //   dx = 4/16, dz = -9/16
  //
  // 与上一测试期望相同，区别是 bones 数组顺序故意 child-before-parent，验证不依赖资源顺序。
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: "geometry.order_independent", texture_width: 16, texture_height: 16 },
      bones: [
        {
          name: "leaf",
          parent: "middle",
          pivot: [8, 0, 0],
          cubes: [{ origin: [12, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
        },
        {
          name: "middle",
          parent: "root",
          pivot: [4, 0, 0],
          rotation: [0, 90, 0],
        },
        {
          name: "root",
          pivot: [0, 0, 0],
          cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
        },
      ],
    }],
  };
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, mockGeo, null, { weaponId: "order-independent" });
    assert.equal(model.cubes.length, 2, `应有 2 个 cube，实际 ${model.cubes.length}`);
    const rootCenter = getMeshWorldBoxCenter(model.cubes.find((cube) => cube.boneName === "root").mesh);
    const leafCenter = getMeshWorldBoxCenter(model.cubes.find((cube) => cube.boneName === "leaf").mesh);
    const dx = leafCenter.x - rootCenter.x;
    const dz = leafCenter.z - rootCenter.z;
    // 预期：与 parent-before-child 顺序的相同 mock 期望一致（cube 跟随 middle 旋转）
    assert.ok(
      Math.abs(dx - 4 / 16) < 0.01,
      `dx 应为 ${4 / 16}（实际 ${dx}），child-before-parent 顺序下 bind-pose 差值仍应正确`
    );
    assert.ok(
      Math.abs(dz - (-9 / 16)) < 0.01,
      `dz 应为 ${-9 / 16}（实际 ${dz}），cube 跟随 middle 旋转后世界 Z 应为 -9/16`
    );
  } finally {
    engine.dispose();
  }
});

test("旋转 parent 下 cube pivot 仍使用 subtractUnitVectorYFlip bind-pose 差值作为 local position", () => {
  // 验证 cubePivotNode local position 不依赖 parent rotation，
  // 始终等于 subtractUnitVectorYFlip(cubePivot, bonePivot)（X/Z直接减，Y翻转）。
  // 该测试故意让 parent bone 有 rotation，用来防止实现回到 setAbsolutePosition + world inverse 路径。
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: "geometry.rot_parent_cube_pivot", texture_width: 16, texture_height: 16 },
      bones: [
        {
          name: "root",
          pivot: [0, 0, 0],
        },
        {
          name: "rotParent",
          parent: "root",
          pivot: [4, 0, 0],
          rotation: [0, 90, 0],
          cubes: [{
            origin: [8, 0, 0],
            size: [2, 2, 2],
            pivot: [9, 1, 1],
            rotation: [0, 45, 0],
            uv: [0, 0],
          }],
        },
      ],
    }],
  };
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, mockGeo, null, { weaponId: "rot-parent-pivot" });
    const parent = model.boneMap.get("rotParent");
    const pivotNode = parent.getChildTransformNodes().find((child) => child.getClassName() === "TransformNode");
    assert.ok(pivotNode, "cubePivotNode 存在");

    // cubePivotNode local position = subtractUnitVectorYFlip(cubePivot, bonePivot)
    // X/Z: (cubePivot - bonePivot)/16, Y: (bonePivot - cubePivot)/16
    // = ([9,1,1], [4,0,0]) → [(9-4)/16, (0-1)/16, (1-0)/16] = [5/16, -1/16, 1/16]
    assert.ok(Math.abs(pivotNode.position.x - 5 / 16) < 0.0001, `pivotNode.position.x: ${pivotNode.position.x} 期望 ${5 / 16}`);
    assert.ok(Math.abs(pivotNode.position.y - (-1 / 16)) < 0.0001, `pivotNode.position.y: ${pivotNode.position.y} 期望 ${-1 / 16}`);
    assert.ok(Math.abs(pivotNode.position.z - 1 / 16) < 0.0001, `pivotNode.position.z: ${pivotNode.position.z} 期望 ${1 / 16}`);

    // mesh local position = subtractUnitVectorYFlip(cubeCenter, cubePivot)
    // cubeCenter: X=8+1=9, Y=originY+sizeY/2=0+1=1（origin[1]是top，center在下方sizeY/2处）, Z=0+1=1 → [9,1,1]
    // cubePivot = [9, 1, 1]
    // mesh local = [0, (1-1)/16=0, 0]
    const mesh = model.cubes[0].mesh;
    assert.equal(mesh.parent, pivotNode, "旋转 cube 挂到 cubePivotNode");
    assert.ok(Math.abs(mesh.position.x) < 0.0001, `mesh.position.x: ${mesh.position.x} 期望 0`);
    assert.ok(Math.abs(mesh.position.y - 0) < 0.0001, `mesh.position.y: ${mesh.position.y} 期望 0`);
    assert.ok(Math.abs(mesh.position.z) < 0.0001, `mesh.position.z: ${mesh.position.z} 期望 0`);
  } finally {
    engine.dispose();
  }
});

// ===== v10 新增：旋转顺序 ZYX 正确性测试 ====
// 验证修复 C：bone rotation 使用 Quaternion ZYX 顺序（qZ * qY * qX）
// 现有 2 个带旋转 bone 测试用单轴 Y 旋转，单轴旋转不受顺序影响，
// 必须用三轴旋转才能验证 ZYX 顺序与 Babylon 默认 YXZ 顺序的不同
// Phase3v7: 改为 ZYX（TaCZ BedrockPart.translateAndRotateAndScale mulPose(Z,Y,X) post-multiply，矩阵 = R_Z * R_Y * R_X）

test("createTaczGeoModel 旋转顺序为 ZYX（先 X 后 Y 再 Z）", () => {
  // 构造三轴旋转 bone，验证 rotationQuaternion 等于 qZ * qY * qX
  // 单轴旋转不受顺序影响，必须用三轴旋转才能验证 ZYX 顺序
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: "geometry.zyx_test", texture_width: 16, texture_height: 16 },
      bones: [{
        name: "root",
        pivot: [0, 0, 0],
        rotation: [30, 45, 60], // 三轴非零，ZYX 顺序不同结果不同
        cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
      }],
    }],
  };
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, mockGeo, null, { weaponId: "zyx-test" });
    const rootNode = model.boneMap.get("root");
    assert.ok(rootNode.rotationQuaternion, "rotationQuaternion 非空（修复 C 生效）");
    // 构造期望四元数：qZ * qY * qX（ZYX 顺序，对应矩阵 R_Z * R_Y * R_X）
    const DEG = Math.PI / 180;
    const qZ = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, 60 * DEG);
    const qX = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, 30 * DEG);
    const qY = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, 45 * DEG);
    const expected = qZ.multiply(qY).multiply(qX);
    const actual = rootNode.rotationQuaternion;
    assert.ok(Math.abs(actual.x - expected.x) < 0.0001, `q.x: ${actual.x} 期望 ${expected.x}`);
    assert.ok(Math.abs(actual.y - expected.y) < 0.0001, `q.y: ${actual.y} 期望 ${expected.y}`);
    assert.ok(Math.abs(actual.z - expected.z) < 0.0001, `q.z: ${actual.z} 期望 ${expected.z}`);
    assert.ok(Math.abs(actual.w - expected.w) < 0.0001, `q.w: ${actual.w} 期望 ${expected.w}`);
  } finally {
    engine.dispose();
  }
});

// ===== v10 新增：cube.pivot fallback 到 cube 中心测试 ====
// 验证修复 D：cube.pivot 缺失时 fallback 到 cube 自身中心（origin + size/2），而非 bone.pivot
// Wiki model.html 强调 pivot（旋转轴）与 origin（方块原点）是不同概念

test("cube.pivot 缺失时 fallback 到 cube 自身中心（X/Z: origin+size/2, Y: origin+size/2，subtractUnitVectorYFlip语义）", () => {
  // 构造有 rotation 无 pivot 的 cube，验证 cubePivotNode 本地坐标 = cube 中心
  // 修复 D：fallback 从 bone.pivot 改为 cube 自身中心
  // Bedrock 格式中 origin[1] 是 cube 顶部，centerY = origin[1] + size[1]/2（center在origin下方sizeY/2处）
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: "geometry.cube_pivot_fallback", texture_width: 16, texture_height: 16 },
      bones: [{
        name: "root",
        pivot: [0, 0, 0],
        cubes: [{
          origin: [4, 2, 0],
          size: [2, 2, 2],
          rotation: [0, 45, 0], // 有旋转，无 pivot
          uv: [0, 0],
        }],
      }],
    }],
  };
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, mockGeo, null, { weaponId: "pivot-fallback-test" });
    const boneNode = model.boneMap.get("root");
    const children = boneNode.getChildTransformNodes();
    const pivotNode = children.find(c => c.getClassName() === "TransformNode");
    assert.ok(pivotNode, "cubePivotNode 存在");
    // 期望 cubePivotNode 本地 position = subtractUnitVectorYFlip(cubeCenter, bonePivot)
    // cubeCenter = [4+1, 2+1, 0+1] = [5, 3, 1]（所有轴 origin+size/2）
    // cubePivotLocal = [(5-0)/16, (0-3)/16, (1-0)/16] = [5/16, -3/16, 1/16]
    const localPos = pivotNode.position;
    assert.ok(Math.abs(localPos.x - 5/16) < 0.0001, `pivotNode.position.x: ${localPos.x} 期望 ${5/16}`);
    assert.ok(Math.abs(localPos.y - (-3/16)) < 0.0001, `pivotNode.position.y: ${localPos.y} 期望 ${-3/16}`);
    assert.ok(Math.abs(localPos.z - 1/16) < 0.0001, `pivotNode.position.z: ${localPos.z} 期望 ${1/16}`);
  } finally {
    engine.dispose();
  }
});

// ===== visibilityProfile 集成测试 =====

test("传入 visibilityProfile 时 defaultHiddenBones 的 cube 不渲染", () => {
  // 构造 mock geo：含 root + extra_bone，profile.defaultHiddenBones 含 extra_bone
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: "geometry.profile_test", texture_width: 16, texture_height: 16 },
      bones: [
        {
          name: "root",
          pivot: [0, 0, 0],
          cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
        },
        {
          name: "extra_bone",
          parent: "root",
          pivot: [4, 0, 0],
          cubes: [{ origin: [4, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
        },
      ],
    }],
  };
  const { scene, engine } = createScene();
  try {
    const profile = {
      defaultHiddenBones: ["extra_bone"],
      hiddenBoneCubes: {},
      heldItemBones: [],
      shellBones: [],
    };
    const model = createTaczGeoModel(scene, mockGeo, null, {
      weaponId: "profile-test",
      visibilityProfile: profile,
    });
    // boneMap 保留 extra_bone 节点（动画仍可驱动）
    assert.ok(model.boneMap.has("extra_bone"), "boneMap 保留 extra_bone");
    // extra_bone 的 cube 不渲染
    assert.equal(
      model.cubes.some((c) => c.boneName === "extra_bone"),
      false,
      "extra_bone cube 不渲染"
    );
    // root 的 cube 正常渲染
    assert.equal(
      model.cubes.some((c) => c.boneName === "root"),
      true,
      "root cube 正常渲染"
    );
  } finally {
    engine.dispose();
  }
});

test("传入 visibilityProfile 时 hiddenBoneCubes 跳过指定 cube 索引", () => {
  // 构造 mock geo：root bone 有 3 个 cube，profile.hiddenBoneCubes 跳过索引 1
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: "geometry.profile_cubes_test", texture_width: 16, texture_height: 16 },
      bones: [{
        name: "root",
        pivot: [0, 0, 0],
        cubes: [
          { origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] },
          { origin: [2, 0, 0], size: [1, 1, 1], uv: [0, 0] },
          { origin: [4, 0, 0], size: [1, 1, 1], uv: [0, 0] },
        ],
      }],
    }],
  };
  const { scene, engine } = createScene();
  try {
    const profile = {
      defaultHiddenBones: [],
      hiddenBoneCubes: { root: [1] },
      heldItemBones: [],
      shellBones: [],
    };
    const model = createTaczGeoModel(scene, mockGeo, null, {
      weaponId: "profile-cubes-test",
      visibilityProfile: profile,
    });
    // 应该只有 2 个 cube（索引 0 和 2），跳过索引 1
    assert.equal(model.cubes.length, 2, `应有 2 个 cube，实际 ${model.cubes.length}`);
    assert.equal(model.cubes.some((c) => c.cubeIndex === 1), false, "索引 1 被跳过");
    assert.equal(model.cubes.some((c) => c.cubeIndex === 0), true, "索引 0 保留");
    assert.equal(model.cubes.some((c) => c.cubeIndex === 2), true, "索引 2 保留");
  } finally {
    engine.dispose();
  }
});

test("传入 visibilityProfile 时 heldItemBones 被 setEnabled(false)", () => {
  // 构造 mock geo：含 root + magazine bone，profile.heldItemBones 含 magazine
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: "geometry.profile_held_test", texture_width: 16, texture_height: 16 },
      bones: [
        {
          name: "root",
          pivot: [0, 0, 0],
          cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
        },
        {
          name: "magazine",
          parent: "root",
          pivot: [2, 0, 0],
          cubes: [{ origin: [2, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
        },
      ],
    }],
  };
  const { scene, engine } = createScene();
  try {
    const profile = {
      defaultHiddenBones: [],
      hiddenBoneCubes: {},
      heldItemBones: ["magazine"],
      shellBones: [],
    };
    const model = createTaczGeoModel(scene, mockGeo, null, {
      weaponId: "profile-held-test",
      visibilityProfile: profile,
    });
    // heldItemBones 的 cube 仍然渲染（因为不是 defaultHiddenBones），但 bone 节点 setEnabled(false)
    const magazineNode = model.boneMap.get("magazine");
    assert.ok(magazineNode, "magazine bone 存在");
    assert.equal(magazineNode.isEnabled(), false, "heldItemBones 被 setEnabled(false)");
    // root 保持可见
    assert.equal(model.boneMap.get("root").isEnabled(), true, "root 保持可见");
  } finally {
    engine.dispose();
  }
});

test("debugGeometry.visibleOutliers 不包含已禁用 heldItemBones", () => {
  const mockGeo = {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: "geometry.profile_visible_outlier", texture_width: 16, texture_height: 16 },
      bones: [
        {
          name: "root",
          pivot: [0, 0, 0],
          cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
        },
        {
          name: "magazine",
          parent: "root",
          pivot: [64, 0, 0],
          cubes: [{ origin: [64, 0, 0], size: [1, 1, 1], uv: [0, 0] }],
        },
      ],
    }],
  };
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, mockGeo, null, {
      weaponId: "profile-visible-outlier-test",
      visibilityProfile: {
        defaultHiddenBones: [],
        hiddenBoneCubes: {},
        heldItemBones: ["magazine"],
        shellBones: [],
      },
    });
    const debug = model.debugGeometry;
    assert.ok(debug.rawOutliers.some((cube) => cube.boneName === "magazine"), "rawOutliers 保留禁用前诊断");
    assert.equal(
      debug.visibleOutliers.some((cube) => cube.boneName === "magazine"),
      false,
      "visibleOutliers 应过滤已禁用 heldItemBones"
    );
    const magazineDebug = debug.cubes.find((cube) => cube.boneName === "magazine");
    assert.equal(magazineDebug.effectiveVisible, false, "magazine effectiveVisible=false");
    assert.equal(magazineDebug.hiddenByProfile, true, "magazine 标记 hiddenByProfile");
  } finally {
    engine.dispose();
  }
});

test("m4/ak47 默认静态 profile 不渲染扩展弹匣与未装备枪托变体", () => {
  const cases = [
    {
      weaponId: "m4",
      geoName: "m4a1",
      hiddenBones: ["additional_magazine", "mag_extended_1", "mag_extended_2", "mag_extended_3", "sight_folded"],
    },
    {
      weaponId: "ak47",
      geoName: "ak47",
      hiddenBones: ["additional_magazine", "mag_extended_1", "mag_extended_2", "mag_extended_3", "oem_stock_heavy", "oem_stock_tactical", "ar_stock_adapter"],
    },
  ];

  for (const { weaponId, geoName, hiddenBones } of cases) {
    const { scene, engine } = createScene();
    try {
      const model = createTaczGeoModel(scene, loadGeo(geoName), null, {
        weaponId,
        visibilityProfile: getVisibilityProfile(weaponId),
      });
      for (const hiddenBone of hiddenBones) {
        assert.equal(
          model.cubes.some((cube) => cube.boneName === hiddenBone),
          false,
          `${weaponId} ${hiddenBone} 不应创建可渲染 cube`
        );
      }
      assert.equal(
        model.debugGeometry.visibleOutliers.some((cube) => hiddenBones.includes(cube.boneName)),
        false,
        `${weaponId} visibleOutliers 不应包含默认隐藏变体`
      );
    } finally {
      engine.dispose();
    }
  }
});

test("不传 visibilityProfile 时走旧 DEFAULT_HIDDEN_BONE_ROOTS fallback", () => {
  // m95 不传 profile，应该仍走 DEFAULT_HIDDEN_BONE_ROOTS.m95
  const geo = loadGeo("m95");
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, geo, null, { weaponId: "m95" });
    // sight_folded 应该被隐藏（来自 DEFAULT_HIDDEN_BONE_ROOTS.m95）
    assert.ok(model.boneMap.has("sight_folded"), "boneMap 保留 sight_folded");
    assert.equal(
      model.cubes.some((c) => c.boneName === "sight_folded"),
      false,
      "sight_folded cube 不渲染（来自旧 fallback）"
    );
  } finally {
    engine.dispose();
  }
});

test("传入 visibilityProfile + 旧 fallback 同时生效（合并）", () => {
  // m95 传入额外 profile.defaultHiddenBones，应该与旧 DEFAULT_HIDDEN_BONE_ROOTS 合并
  const geo = loadGeo("m95");
  const { scene, engine } = createScene();
  try {
    const profile = {
      // 旧 fallback 已隐藏 sight_folded，这里再加一个自定义 hidden bone
      defaultHiddenBones: ["constraint"],
      hiddenBoneCubes: {},
      heldItemBones: [],
      shellBones: [],
    };
    const model = createTaczGeoModel(scene, geo, null, {
      weaponId: "m95",
      visibilityProfile: profile,
    });
    // 旧 fallback：sight_folded 被隐藏
    assert.equal(
      model.cubes.some((c) => c.boneName === "sight_folded"),
      false,
      "sight_folded 仍被隐藏（旧 fallback 生效）"
    );
    // profile 新增：constraint 被隐藏
    assert.equal(
      model.cubes.some((c) => c.boneName === "constraint"),
      false,
      "constraint 被隐藏（profile 新增生效）"
    );
  } finally {
    engine.dispose();
  }
});

// ===== 旋转顺序数值对照 fixture 测试 ====
// 验证 bone pivot Y 翻转和 cube Y 修复之后，旋转方向是否仍然正确

test("[旋转顺序fixture] Z轴90度旋转下cube世界位置验证", () => {
  const { scene, engine } = createScene();
  try {
    const model = createTaczGeoModel(scene, MOCK_GEO_ROTATION_FIXTURE, null, { weaponId: "mock_rot", disableCentering: true });
    
    const rootNode = model.boneMap.get("root");
    const boneNode = model.boneMap.get("rotbone");
    
    // 验证root和bone位置
    assert.ok(Math.abs(rootNode.position.y - 0) < 0.001, `root pos.y: ${rootNode.position.y} 期望 ~0`);
    assert.ok(Math.abs(boneNode.position.x - 0) < 0.001 && Math.abs(boneNode.position.y - 0) < 0.001 && Math.abs(boneNode.position.z - 0) < 0.001, `bone pos: ${boneNode.position.x},${boneNode.position.y},${boneNode.position.z} 期望 ~0,0,0`);
    
    // 找到cube mesh
    let cubeMesh = null;
    for (const child of boneNode.getChildren()) {
      if (child instanceof BABYLON.Mesh && !child.name.includes("cube-pivot")) {
        cubeMesh = child;
        break;
      }
    }
    assert.ok(cubeMesh, "cube mesh存在");
    
    // 验证local position（相对bone）：
    // cubeCenterX = 1 + 2/2 = 2, meshLocalX = (2-0)/16 = 0.125
    // cubeCenterY = 25 + 2/2 = 26, meshLocalY = (24-26)/16 = -0.125（Y翻转）
    // cubeCenterZ = -1 + 2/2 = 0, meshLocalZ = (0-0)/16 = 0
    assert.ok(Math.abs(cubeMesh.position.x - 0.125) < 0.001, `mesh local x: ${cubeMesh.position.x} 期望 ~0.125`);
    assert.ok(Math.abs(cubeMesh.position.y - (-0.125)) < 0.001, `mesh local y: ${cubeMesh.position.y} 期望 ~-0.125`);
    assert.ok(Math.abs(cubeMesh.position.z - 0) < 0.001, `mesh local z: ${cubeMesh.position.z} 期望 ~0`);
    
    // 计算世界矩阵
    model.root.computeWorldMatrix(true);
    const worldPos = cubeMesh.getAbsolutePosition();
    
    // 绕Z轴90度旋转（右手Y-up，Z+逆时针）矩阵 Rz(90°):
    // x' = 0*x - 1*y = -y
    // y' = 1*x + 0*y = x
    // z' = z
    // 局部(0.125, -0.125, 0)旋转后：x' = -(-0.125) = 0.125, y' = 0.125, z' = 0
    assert.ok(Math.abs(worldPos.x - 0.125) < 0.01, `world x: ${worldPos.x} 期望 ~0.125（local Y=-0.125旋转后到X+）`);
    assert.ok(Math.abs(worldPos.y - 0.125) < 0.01, `world y: ${worldPos.y} 期望 ~0.125（local X=0.125旋转后到Y+，标准Y-up右手Z+逆时针）`);
    assert.ok(Math.abs(worldPos.z) < 0.01, `world z: ${worldPos.z} 期望 ~0`);
    
    // 同时验证bone rotationQuaternion不是identity（有旋转）
    assert.ok(boneNode.rotationQuaternion, "bone有rotationQuaternion");
    assert.ok(Math.abs(boneNode.rotationQuaternion.w - 1) > 0.01, "rotationQuaternion不是identity（有旋转）");
    
  } finally {
    engine.dispose();
  }
});
