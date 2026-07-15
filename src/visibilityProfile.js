// 武器可见性配置：数据驱动的 bone/cube 可见性规则。
// 从 taczGeoModel.js 的硬编码 DEFAULT_HIDDEN_BONE_ROOTS/DEFAULT_HIDDEN_BONE_CUBES 迁移。
//
// 规则：
// - defaultHiddenBones：默认隐藏的 bone 子树（保留 bone 节点，动画仍可驱动）
// - hiddenBoneCubes：按 boneName 隐藏特定 cube 索引（M95 远端透视碎片修复）
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

// 5 把目标武器的可见性配置（m4/m95/deagle_golden/awp/ak47）
// Phase3v9：hiddenBoneCubes 全部清空，等待 MCP 重新诊断后添加最小规则集
// defaultHiddenBones 只保留结构性变体隐藏（弹匣扩展/瞄具折叠/枪托附件/抛壳口），
// 移除所有基于 MCP 诊断的 outlier 隐藏条目
const VISIBILITY_PROFILES = {
  m4: {
    // m4 geo 同时包含扩展弹匣和折叠瞄具变体；静态展示只保留默认枪体。
    // oem_stock_tactical 是战术枪托附件变体（ak47 已隐藏同类附件）
    // rings3: pivot y=-16 异常低，子 bone bone38/bone70 rotation [90,0,-30/-60] 任何 pose 下飞出屏幕
    defaultHiddenBones: ["additional_magazine", "mag_extended_1", "mag_extended_2", "mag_extended_3", "sight_folded", "oem_stock_tactical", "rings3"],
    // Phase3v9 MCP 诊断最小规则集（pose [0,π/2,π/2] z=1.15）：
    // bone2: 1 cube visible outlier (area 1980)
    // fore_sight3/grip2: 全部 cube projectionUnreliable，枪管附件/握把变体
    // upper2 [18,25]: 大块 visible outlier (area 5.2M/3.3M)，近裁面放大碎片
    // lower2 [12,47,51]: cube 51 visible outlier (area 3.3M) + 12/47 unreliable
    hiddenBoneCubes: {
      bone2: true,
      fore_sight3: true,
      grip2: true,
      upper2: [18, 25],
      lower2: [12, 47, 51],
    },
    heldItemBones: ["mag_and_lefthand"],
    shellBones: [],
    sightVariants: { folded: "sight_folded", raised: null },
    magazineVariants: { standard: ["mag_standard"], extended: ["mag_extended_1", "mag_extended_2", "mag_extended_3"] },
    animationControlledBones: ["m4a1_bolt", "m4a1_pull", "mag_and_lefthand"],
  },

  ak47: {
    // AK47 资源里带多套枪托/弹匣附件。静态模式只显示默认 AKM + stock_default。
    defaultHiddenBones: [
      "additional_magazine",
      "mag_extended_1", "mag_extended_2", "mag_extended_3",
      "oem_stock_heavy", "oem_stock_tactical", "ar_stock_adapter",
    ],
    // Phase3v9 MCP 诊断最小规则集：
    // steel: 7 cube projectionUnreliable，stock_default 下枪托金属部件
    // wood: 12 cube projectionUnreliable，stock_default 下枪托木质部件
    // muzzle_default: 1 cube projectionUnreliable，枪口制退器最前端
    hiddenBoneCubes: {
      steel: true,
      wood: true,
      muzzle_default: true,
    },
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

  deagle_golden: {
    // mag_extended_* 是扩展弹匣变体，additional_magazine 是换弹手持物
    defaultHiddenBones: ["mag_extended_1", "mag_extended_2", "mag_extended_3", "additional_magazine"],
    hiddenBoneCubes: {},
    heldItemBones: ["additional_magazine", "mag_and_bullet"],
    shellBones: [],
    sightVariants: {},
    magazineVariants: { standard: [], extended: ["mag_extended_1", "mag_extended_2", "mag_extended_3"] },
    animationControlledBones: ["slide2", "additional_magazine"],
  },

  m95: {
    // sight_folded 是折叠瞄具，mag_extended_* 是扩展弹匣，shell_ejection 是抛壳口
    defaultHiddenBones: [
      "sight_folded", "mag_extended_1", "mag_extended_2", "mag_extended_3", "shell_ejection",
    ],
    // Phase3v12 MCP 诊断最小规则集（top pose [0,π,π/2] position [-0.2,-0.3,2.2]）：
    // bone 子树（boneChain: bone > body > m95_body）的 8 个 cube 在当前 pose 下飞到屏幕右侧外
    // （screenBounds.maxX=822，这些 cube 的 minX=846-935），属于 body 子树的合理 cube，
    // 但 pose [0,π,π/2] 会让它们甩出主屏幕。隐藏后 mainOutlierCount=0 ≤ 4，distance=0 ≤ 50。
    hiddenBoneCubes: {
      bone: [2, 4, 5, 14, 15, 16, 17, 90],
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
