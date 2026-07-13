// 武器可见性配置：数据驱动的 bone/cube 可见性规则。
// 从 taczGeoModel.js 的硬编码 DEFAULT_HIDDEN_BONE_ROOTS/DEFAULT_HIDDEN_BONE_CUBES 迁移。
//
// 规则：
// - defaultHiddenBones：默认隐藏的 bone 子树（保留 bone 节点，动画仍可驱动）
// - hiddenBoneCubes：按 boneName 隐藏特定 cube 索引（M107/M95 远端透视碎片修复）
// - heldItemBones：换弹手持物 bone，默认隐藏，换弹时 setEnabled(true)
// - shellBones：弹壳/抛壳物 bone，默认隐藏
// - sightVariants：瞄具变体，folded 默认隐藏，raised 默认可见
// - magazineVariants：弹匣变体，extended 默认隐藏，standard 默认可见
// - animationControlledBones：动画驱动可见性的 bone，不在此列表则不受动画控制

// 通用默认 profile（全可见，无特殊隐藏）
export const DEFAULT_VISIBILITY_PROFILE = {
  defaultHiddenBones: [],
  hiddenBoneCubes: {},
  heldItemBones: [],
  shellBones: [],
  sightVariants: {},
  magazineVariants: {},
  animationControlledBones: [],
};

// 9 把武器的可见性配置
const VISIBILITY_PROFILES = {
  glock17: {
    defaultHiddenBones: [],
    hiddenBoneCubes: {},
    heldItemBones: ["additional_magazine", "mag_and_bullet"],
    shellBones: [],
    sightVariants: {},
    magazineVariants: {},
    animationControlledBones: ["slide", "additional_magazine"],
  },

  m4: {
    // m4 geo 同时包含扩展弹匣和折叠瞄具变体；静态展示只保留默认枪体。
    // oem_stock_tactical/group23 先按结构枪托保留，不能用隐藏规则掩盖潜在坐标问题。
    defaultHiddenBones: ["additional_magazine", "mag_extended_1", "mag_extended_2", "mag_extended_3", "sight_folded"],
    hiddenBoneCubes: {},
    heldItemBones: ["mag_and_lefthand"],
    shellBones: [],
    sightVariants: { folded: "sight_folded", raised: null },
    magazineVariants: { standard: ["mag_standard"], extended: ["mag_extended_1", "mag_extended_2", "mag_extended_3"] },
    animationControlledBones: ["m4a1_bolt", "m4a1_pull", "mag_and_lefthand"],
  },

  ak47: {
    // AK47 资源里带多套枪托/弹匣附件。Phase2 静态模式只显示默认 AKM + stock_default。
    defaultHiddenBones: [
      "additional_magazine",
      "mag_extended_1", "mag_extended_2", "mag_extended_3",
      "oem_stock_heavy", "oem_stock_tactical", "ar_stock_adapter",
    ],
    hiddenBoneCubes: {},
    heldItemBones: ["lefthand_and_mag"],
    shellBones: [],
    sightVariants: {},
    magazineVariants: { standard: ["mag_standard"], extended: ["mag_extended_1", "mag_extended_2", "mag_extended_3"] },
    animationControlledBones: ["bolt", "lefthand_and_mag"],
  },

  awp: {
    defaultHiddenBones: [],
    hiddenBoneCubes: {},
    heldItemBones: ["mag_and_lefthand"],
    shellBones: [],
    sightVariants: {},
    magazineVariants: {},
    animationControlledBones: ["bolt_group", "bolt_rotate", "mag_and_lefthand"],
  },

  p90: {
    defaultHiddenBones: [],
    hiddenBoneCubes: {},
    heldItemBones: ["p90_mag_standard"],
    shellBones: [],
    sightVariants: {},
    magazineVariants: {},
    animationControlledBones: ["pull", "ump45_bolt", "p90_mag_standard"],
  },

  deagle_golden: {
    // 从 taczGeoModel DEFAULT_HIDDEN_BONE_ROOTS.deagle_golden 迁移
    // mag_extended_* 是扩展弹匣变体，additional_magazine 是换弹手持物
    defaultHiddenBones: ["mag_extended_1", "mag_extended_2", "mag_extended_3", "additional_magazine"],
    hiddenBoneCubes: {},
    heldItemBones: ["additional_magazine", "mag_and_bullet"],
    shellBones: [],
    sightVariants: {},
    magazineVariants: { standard: [], extended: ["mag_extended_1", "mag_extended_2", "mag_extended_3"] },
    animationControlledBones: ["slide2", "additional_magazine"],
  },

  rpg7: {
    defaultHiddenBones: [],
    hiddenBoneCubes: {},
    // RPG7 手持物是火箭弹（mag_hand bone）
    heldItemBones: ["mag_hand"],
    shellBones: [],
    sightVariants: {},
    magazineVariants: {},
    animationControlledBones: ["rocket", "mag_hand"],
  },

  m107: {
    // 从 taczGeoModel DEFAULT_HIDDEN_BONE_ROOTS.m107 迁移
    // sight_folded 是折叠瞄具，mag_extended_* 是扩展弹匣，bullet_shell* 是弹壳
    defaultHiddenBones: [
      "sight_folded", "mag_extended_1", "mag_extended_2", "mag_extended_3",
      "bullet_shell", "bullet_shell2", "bullet_shell3",
    ],
    // 从 taczGeoModel DEFAULT_HIDDEN_BONE_CUBES.m107 迁移
    // upper 上的远端细斜片在第一人称透视下脱离枪体漂到屏幕上方
    hiddenBoneCubes: {
      upper: [18, 33, 35, 37, 40, 42, 44, 46],
      group12: true,
    },
    heldItemBones: ["mag_and_bullet"],
    shellBones: ["bullet_shell", "bullet_shell2", "bullet_shell3"],
    sightVariants: { folded: "sight_folded", raised: null },
    magazineVariants: { standard: [], extended: ["mag_extended_1", "mag_extended_2", "mag_extended_3"] },
    animationControlledBones: ["bolt", "gun_barrel", "mag_and_bullet"],
  },

  m95: {
    // 从 taczGeoModel DEFAULT_HIDDEN_BONE_ROOTS.m95 迁移
    // sight_folded 是折叠瞄具，mag_extended_* 是扩展弹匣，shell_ejection 是抛壳口
    defaultHiddenBones: [
      "sight_folded", "mag_extended_1", "mag_extended_2", "mag_extended_3", "shell_ejection",
    ],
    // 从 taczGeoModel DEFAULT_HIDDEN_BONE_CUBES.m95 迁移
    // M 制退器最前端的上缘细片在第一人称视角中过度透视，表现为天空中的黑色碎块
    hiddenBoneCubes: {
      M: [16, 17, 34, 35, 40, 41],
    },
    heldItemBones: ["mag_and_lefthand", "mag_and_bullet"],
    shellBones: ["shell_ejection"],
    sightVariants: { folded: "sight_folded", raised: null },
    magazineVariants: { standard: [], extended: ["mag_extended_1", "mag_extended_2", "mag_extended_3"] },
    animationControlledBones: ["bolt", "mag_and_lefthand", "mag_and_bullet"],
  },
};

/**
 * 获取武器的可见性配置。
 * @param {string} weaponId - 武器 ID
 * @returns {object} visibilityProfile（含 defaultHiddenBones/hiddenBoneCubes/heldItemBones/shellBones/sightVariants/magazineVariants/animationControlledBones）
 */
export function getVisibilityProfile(weaponId) {
  const profile = VISIBILITY_PROFILES[weaponId];
  if (!profile) return { ...DEFAULT_VISIBILITY_PROFILE };
  return { ...DEFAULT_VISIBILITY_PROFILE, ...profile };
}

/**
 * 把 visibilityProfile 应用到 boneMap：隐藏 defaultHiddenBones + heldItemBones + shellBones。
 * 只设置 setEnabled(false)，不删除 bone 节点，动画系统仍可驱动它们。
 * @param {Map<string, TransformNode>} boneMap - createTaczGeoModel 返回的 boneMap
 * @param {object} profile - visibilityProfile
 * @param {object} options - { includeHeldItems: true, includeShells: true } 控制是否隐藏手持物/弹壳
 */
export function applyVisibilityProfile(boneMap, profile, options = {}) {
  if (!boneMap || !profile) return;
  const includeHeldItems = options.includeHeldItems ?? true;
  const includeShells = options.includeShells ?? true;

  const bonesToHide = new Set([
    ...profile.defaultHiddenBones,
    ...(includeHeldItems ? profile.heldItemBones : []),
    ...(includeShells ? profile.shellBones : []),
  ]);

  for (const boneName of bonesToHide) {
    const node = boneMap.get(boneName);
    if (node) {
      node.setEnabled(false);
      // 递归隐藏子节点（bone 子树整体不渲染）
      for (const child of node.getChildTransformNodes()) {
        setEnabledRecursive(child, false);
      }
    }
  }
}

// 递归设置节点及其所有子节点的 setEnabled
function setEnabledRecursive(node, enabled) {
  node.setEnabled(enabled);
  for (const child of node.getChildTransformNodes()) {
    setEnabledRecursive(child, enabled);
  }
}

/**
 * 显示指定的 bone（用于换弹时显示手持物、检视时显示扩展弹匣等）。
 * @param {Map<string, TransformNode>} boneMap
 * @param {string[]} boneNames - 要显示的 bone 名
 */
export function showBones(boneMap, boneNames) {
  if (!boneMap || !boneNames) return;
  for (const boneName of boneNames) {
    const node = boneMap.get(boneName);
    if (node) {
      node.setEnabled(true);
      setEnabledRecursive(node, true);
    }
  }
}

/**
 * 隐藏指定的 bone。
 * @param {Map<string, TransformNode>} boneMap
 * @param {string[]} boneNames - 要隐藏的 bone 名
 */
export function hideBones(boneMap, boneNames) {
  if (!boneMap || !boneNames) return;
  for (const boneName of boneNames) {
    const node = boneMap.get(boneName);
    if (node) {
      node.setEnabled(false);
      setEnabledRecursive(node, false);
    }
  }
}

/**
 * 检查 bone 是否在 profile 的某个分类中。
 * @param {string} boneName
 * @param {object} profile
 * @param {string} category - "defaultHidden" | "heldItem" | "shell" | "animationControlled"
 * @returns {boolean}
 */
export function isBoneInCategory(boneName, profile, category) {
  if (!profile || !boneName) return false;
  switch (category) {
    case "defaultHidden":
      return profile.defaultHiddenBones?.includes(boneName) ?? false;
    case "heldItem":
      return profile.heldItemBones?.includes(boneName) ?? false;
    case "shell":
      return profile.shellBones?.includes(boneName) ?? false;
    case "animationControlled":
      return profile.animationControlledBones?.includes(boneName) ?? false;
    default:
      return false;
  }
}
