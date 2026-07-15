import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import {
  DEFAULT_VISIBILITY_PROFILE,
  getVisibilityProfile,
  applyVisibilityProfile,
  showBones,
  hideBones,
  isBoneInCategory,
} from "../src/visibilityProfile.js";

const WEAPONS = ["m4", "m95", "deagle_golden", "awp", "ak47"];
const GEO_DIR = path.resolve("public/assets/tacz/geo_models/gun");
const GEO_FILE_BY_WEAPON = {
  m4: "m4a1_geo.json",
  ak47: "ak47_geo.json",
  awp: "ai_awp_geo.json",
  deagle_golden: "deagle_golden_geo.json",
  m95: "m95_geo.json",
};
// 少数动画 profile 使用历史别名，运行时由动画映射层处理；可见性隐藏规则不得依赖这些名字。
const ALLOWED_ANIMATION_ALIASES = {};

// 原始 taczGeoModel.js 硬编码值，用于验证迁移正确性
const ORIGINAL_DEFAULT_HIDDEN_BONE_ROOTS = {
  deagle_golden: ["mag_extended_1", "mag_extended_2", "mag_extended_3", "additional_magazine"],
  m95: ["sight_folded", "mag_extended_1", "mag_extended_2", "mag_extended_3", "shell_ejection"],
};

function createScene() {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  return { scene, engine };
}

// 构造 mock boneMap：每个 boneName 对应一个 TransformNode
function createMockBoneMap(scene, boneNames) {
  const boneMap = new Map();
  for (const name of boneNames) {
    const node = new BABYLON.TransformNode(`bone-${name}`, scene);
    // 给 bone 加子节点，验证递归隐藏
    const child = new BABYLON.TransformNode(`bone-${name}-child`, scene);
    child.parent = node;
    boneMap.set(name, node);
  }
  return boneMap;
}

test("DEFAULT_VISIBILITY_PROFILE 字段完整", () => {
  assert.ok(Array.isArray(DEFAULT_VISIBILITY_PROFILE.defaultHiddenBones));
  assert.ok(typeof DEFAULT_VISIBILITY_PROFILE.hiddenBoneCubes === "object");
  assert.ok(Array.isArray(DEFAULT_VISIBILITY_PROFILE.heldItemBones));
  assert.ok(Array.isArray(DEFAULT_VISIBILITY_PROFILE.shellBones));
  assert.ok(typeof DEFAULT_VISIBILITY_PROFILE.sightVariants === "object");
  assert.ok(typeof DEFAULT_VISIBILITY_PROFILE.magazineVariants === "object");
  assert.ok(Array.isArray(DEFAULT_VISIBILITY_PROFILE.animationControlledBones));
});

test("getVisibilityProfile 5 武器都返回有效 profile", () => {
  for (const weaponId of WEAPONS) {
    const profile = getVisibilityProfile(weaponId);
    assert.ok(profile, `${weaponId} 有 profile`);
    assert.ok(Array.isArray(profile.defaultHiddenBones), `${weaponId} defaultHiddenBones 是数组`);
    assert.ok(typeof profile.hiddenBoneCubes === "object", `${weaponId} hiddenBoneCubes 是对象`);
    assert.ok(Array.isArray(profile.heldItemBones), `${weaponId} heldItemBones 是数组`);
    assert.ok(Array.isArray(profile.shellBones), `${weaponId} shellBones 是数组`);
  }
});

test("getVisibilityProfile 未知武器返回 DEFAULT_VISIBILITY_PROFILE", () => {
  const profile = getVisibilityProfile("unknown_weapon");
  assert.deepEqual(profile.defaultHiddenBones, []);
  assert.deepEqual(profile.heldItemBones, []);
  assert.deepEqual(profile.shellBones, []);
});

test("迁移正确性：deagle_golden/m95 defaultHiddenBones 与原 DEFAULT_HIDDEN_BONE_ROOTS 一致", () => {
  for (const [weaponId, expectedHidden] of Object.entries(ORIGINAL_DEFAULT_HIDDEN_BONE_ROOTS)) {
    const profile = getVisibilityProfile(weaponId);
    for (const bone of expectedHidden) {
      assert.ok(
        profile.defaultHiddenBones.includes(bone),
        `${weaponId} defaultHiddenBones 应包含 ${bone}（迁移自原 DEFAULT_HIDDEN_BONE_ROOTS）`
      );
    }
  }
});

test("Phase3v12：deagle_golden/awp hiddenBoneCubes 为空，m95/m4/ak47 保留 MCP 诊断最小规则集", () => {
  // deagle_golden/awp：MCP 诊断全部 projectionUnreliable（不可见），无需隐藏
  for (const weaponId of ["deagle_golden", "awp"]) {
    const profile = getVisibilityProfile(weaponId);
    assert.deepEqual(
      profile.hiddenBoneCubes,
      {},
      `${weaponId} hiddenBoneCubes 应为空对象（MCP 诊断无 visible outlier）`
    );
  }
  // m95：Phase3v12 MCP 诊断 top pose [0,π,π/2] 下 bone 子树 8 个 cube 飞到屏幕右侧外
  const m95 = getVisibilityProfile("m95");
  assert.deepEqual(
    m95.hiddenBoneCubes.bone,
    [2, 4, 5, 14, 15, 16, 17, 90],
    "m95 隐藏 bone cube 2/4/5/14/15/16/17/90（body 子树 main outlier）"
  );
  // m4：MCP 诊断发现 4 个 visible outlier + 多个 unreliable bone
  const m4 = getVisibilityProfile("m4");
  assert.equal(m4.hiddenBoneCubes.bone2, true, "m4 隐藏 bone2（visible outlier）");
  assert.equal(m4.hiddenBoneCubes.fore_sight3, true, "m4 隐藏 fore_sight3（unreliable）");
  assert.equal(m4.hiddenBoneCubes.grip2, true, "m4 隐藏 grip2（unreliable）");
  assert.deepEqual(m4.hiddenBoneCubes.upper2, [18, 25], "m4 隐藏 upper2 cube 18/25（大块 visible outlier）");
  assert.deepEqual(m4.hiddenBoneCubes.lower2, [12, 47, 51], "m4 隐藏 lower2 cube 12/47/51");
  assert.ok(m4.defaultHiddenBones.includes("rings3"), "m4 defaultHiddenBones 含 rings3（bone38/bone70 父节点）");

  // ak47：MCP 诊断全部 projectionUnreliable，但 steel/wood/muzzle_default 之前已确认需要隐藏
  const ak47 = getVisibilityProfile("ak47");
  assert.equal(ak47.hiddenBoneCubes.steel, true, "ak47 隐藏 steel");
  assert.equal(ak47.hiddenBoneCubes.wood, true, "ak47 隐藏 wood");
  assert.equal(ak47.hiddenBoneCubes.muzzle_default, true, "ak47 隐藏 muzzle_default");
});

test("applyVisibilityProfile 隐藏 defaultHiddenBones + heldItemBones + shellBones", () => {
  const { scene, engine } = createScene();
  try {
    const boneNames = ["root", "sight_folded", "additional_magazine", "bullet_shell", "muzzle"];
    const boneMap = createMockBoneMap(scene, boneNames);
    const profile = {
      defaultHiddenBones: ["sight_folded"],
      heldItemBones: ["additional_magazine"],
      shellBones: ["bullet_shell"],
      hiddenBoneCubes: {},
    };
    applyVisibilityProfile(boneMap, profile);

    assert.equal(boneMap.get("sight_folded").isEnabled(), false, "defaultHiddenBones 被隐藏");
    assert.equal(boneMap.get("additional_magazine").isEnabled(), false, "heldItemBones 被隐藏");
    assert.equal(boneMap.get("bullet_shell").isEnabled(), false, "shellBones 被隐藏");
    assert.equal(boneMap.get("root").isEnabled(), true, "root 保持可见");
    assert.equal(boneMap.get("muzzle").isEnabled(), true, "muzzle 保持可见");
  } finally {
    engine.dispose();
  }
});

test("applyVisibilityProfile 递归隐藏子节点", () => {
  const { scene, engine } = createScene();
  try {
    const boneMap = createMockBoneMap(scene, ["parent_bone", "visible_bone"]);
    const profile = {
      defaultHiddenBones: ["parent_bone"],
      heldItemBones: [],
      shellBones: [],
      hiddenBoneCubes: {},
    };
    applyVisibilityProfile(boneMap, profile);

    const parentNode = boneMap.get("parent_bone");
    assert.equal(parentNode.isEnabled(), false, "parent_bone 被隐藏");
    const children = parentNode.getChildTransformNodes();
    assert.ok(children.length > 0, "parent_bone 有子节点");
    for (const child of children) {
      assert.equal(child.isEnabled(), false, "子节点也被隐藏");
    }
  } finally {
    engine.dispose();
  }
});

test("applyVisibilityProfile 保留 boneMap 节点（只 setEnabled 不删除）", () => {
  const { scene, engine } = createScene();
  try {
    const boneMap = createMockBoneMap(scene, ["hidden_bone"]);
    const profile = {
      defaultHiddenBones: ["hidden_bone"],
      heldItemBones: [],
      shellBones: [],
      hiddenBoneCubes: {},
    };
    applyVisibilityProfile(boneMap, profile);
    assert.ok(boneMap.has("hidden_bone"), "boneMap 仍保留 hidden_bone 节点");
    assert.ok(boneMap.get("hidden_bone") !== null, "节点非 null");
  } finally {
    engine.dispose();
  }
});

test("applyVisibilityProfile options.includeHeldItems=false 不隐藏 heldItemBones", () => {
  const { scene, engine } = createScene();
  try {
    const boneMap = createMockBoneMap(scene, ["magazine", "root"]);
    const profile = {
      defaultHiddenBones: [],
      heldItemBones: ["magazine"],
      shellBones: [],
      hiddenBoneCubes: {},
    };
    applyVisibilityProfile(boneMap, profile, { includeHeldItems: false });
    assert.equal(boneMap.get("magazine").isEnabled(), true, "includeHeldItems=false 时不隐藏 heldItemBones");
  } finally {
    engine.dispose();
  }
});

test("applyVisibilityProfile options.includeShells=false 不隐藏 shellBones", () => {
  const { scene, engine } = createScene();
  try {
    const boneMap = createMockBoneMap(scene, ["shell", "root"]);
    const profile = {
      defaultHiddenBones: [],
      heldItemBones: [],
      shellBones: ["shell"],
      hiddenBoneCubes: {},
    };
    applyVisibilityProfile(boneMap, profile, { includeShells: false });
    assert.equal(boneMap.get("shell").isEnabled(), true, "includeShells=false 时不隐藏 shellBones");
  } finally {
    engine.dispose();
  }
});

test("showBones 显示指定 bone", () => {
  const { scene, engine } = createScene();
  try {
    const boneMap = createMockBoneMap(scene, ["magazine"]);
    const profile = {
      defaultHiddenBones: [],
      heldItemBones: ["magazine"],
      shellBones: [],
      hiddenBoneCubes: {},
    };
    applyVisibilityProfile(boneMap, profile);
    assert.equal(boneMap.get("magazine").isEnabled(), false, "先隐藏");

    showBones(boneMap, ["magazine"]);
    assert.equal(boneMap.get("magazine").isEnabled(), true, "showBones 后显示");
    // 子节点也应递归显示
    const children = boneMap.get("magazine").getChildTransformNodes();
    for (const child of children) {
      assert.equal(child.isEnabled(), true, "子节点也显示");
    }
  } finally {
    engine.dispose();
  }
});

test("hideBones 隐藏指定 bone", () => {
  const { scene, engine } = createScene();
  try {
    const boneMap = createMockBoneMap(scene, ["root", "extra"]);
    hideBones(boneMap, ["extra"]);
    assert.equal(boneMap.get("extra").isEnabled(), false, "hideBones 后隐藏");
    assert.equal(boneMap.get("root").isEnabled(), true, "root 不受影响");
  } finally {
    engine.dispose();
  }
});

test("isBoneInCategory 4 个分类", () => {
  const profile = {
    defaultHiddenBones: ["sight_folded"],
    heldItemBones: ["magazine"],
    shellBones: ["shell"],
    animationControlledBones: ["bolt"],
  };
  assert.equal(isBoneInCategory("sight_folded", profile, "defaultHidden"), true);
  assert.equal(isBoneInCategory("magazine", profile, "heldItem"), true);
  assert.equal(isBoneInCategory("shell", profile, "shell"), true);
  assert.equal(isBoneInCategory("bolt", profile, "animationControlled"), true);
  assert.equal(isBoneInCategory("root", profile, "defaultHidden"), false);
  assert.equal(isBoneInCategory("root", profile, "unknown"), false);
});

test("m95 profile 含 sight_folded + shell_ejection", () => {
  const profile = getVisibilityProfile("m95");
  assert.ok(profile.defaultHiddenBones.includes("sight_folded"), "m95 隐藏 sight_folded");
  assert.ok(profile.defaultHiddenBones.includes("shell_ejection"), "m95 隐藏 shell_ejection");
  assert.ok(profile.shellBones.includes("shell_ejection"), "m95 shellBones 含 shell_ejection");
  assert.ok(profile.heldItemBones.includes("mag_and_lefthand"), "m95 heldItemBones 使用真实 geo bone");
  assert.equal(profile.heldItemBones.includes("mags"), false, "m95 不再引用不存在的 mags");
});

test("deagle_golden profile 含扩展弹匣变体", () => {
  const profile = getVisibilityProfile("deagle_golden");
  assert.ok(profile.defaultHiddenBones.includes("mag_extended_1"), "deagle_golden 隐藏 mag_extended_1");
  assert.ok(profile.heldItemBones.includes("additional_magazine"), "deagle_golden heldItemBones 含 additional_magazine");
});

test("m4/ak47 profile 含静态默认隐藏的附件变体", () => {
  const m4 = getVisibilityProfile("m4");
  for (const bone of ["additional_magazine", "mag_extended_1", "mag_extended_2", "mag_extended_3", "sight_folded"]) {
    assert.ok(m4.defaultHiddenBones.includes(bone), `m4 默认隐藏 ${bone}`);
  }
  const ak47 = getVisibilityProfile("ak47");
  for (const bone of ["additional_magazine", "mag_extended_1", "mag_extended_2", "mag_extended_3", "oem_stock_heavy", "oem_stock_tactical", "ar_stock_adapter"]) {
    assert.ok(ak47.defaultHiddenBones.includes(bone), `ak47 默认隐藏 ${bone}`);
  }
});

test("visibilityProfile 引用的 bone 必须存在或显式列入动画别名白名单", () => {
  for (const weaponId of WEAPONS) {
    const raw = fs.readFileSync(path.join(GEO_DIR, GEO_FILE_BY_WEAPON[weaponId]), "utf8");
    const geo = JSON.parse(raw)["minecraft:geometry"][0];
    const boneNames = new Set((geo.bones ?? []).map((bone) => bone.name));
    const profile = getVisibilityProfile(weaponId);
    const refs = new Set([
      ...profile.defaultHiddenBones,
      ...profile.heldItemBones,
      ...profile.shellBones,
      ...profile.animationControlledBones,
      ...Object.keys(profile.hiddenBoneCubes ?? {}),
    ]);
    for (const value of Object.values(profile.sightVariants ?? {})) {
      if (value) refs.add(value);
    }
    for (const values of Object.values(profile.magazineVariants ?? {})) {
      for (const value of values ?? []) refs.add(value);
    }
    const allowedAliases = new Set(ALLOWED_ANIMATION_ALIASES[weaponId] ?? []);
    for (const ref of refs) {
      assert.ok(
        boneNames.has(ref) || allowedAliases.has(ref),
        `${weaponId} visibilityProfile 引用不存在 bone: ${ref}`
      );
    }
  }
});

test("applyVisibilityProfile 传 null boneMap 不报错", () => {
  assert.doesNotThrow(() => applyVisibilityProfile(null, DEFAULT_VISIBILITY_PROFILE));
});

test("applyVisibilityProfile 传 null profile 不报错", () => {
  const { scene, engine } = createScene();
  try {
    const boneMap = createMockBoneMap(scene, ["root"]);
    assert.doesNotThrow(() => applyVisibilityProfile(boneMap, null));
  } finally {
    engine.dispose();
  }
});
