import * as BABYLON from "@babylonjs/core";

// TaCZ Bedrock 坐标转换独立模块
// 把坐标转换逻辑从 taczGeoModel.js 抽离，便于测试和复用（taczFirstPersonMarkers.js 也要用）
// 严格对照 TaCZ Java 源码（BedrockModel.java / FirstPersonRenderGunEvent.java），
// 但做了 Babylon 架构适配（不照搬 Minecraft 脚位置Y=0坐标系的眼睛高度T共轭）：
// - BedrockModel.convertPivot (L280-294)：顶层bone Y=(24-pivotY)/16（眼睛高度偏移已bake进position），
//   child Y=(parentPivotY-childPivotY)/16（Y翻转）
// - BedrockModel.convertOrigin (L314-329)：cube origin 是 Bedrock 格式顶点位置，当前项目顶点以 cube 中心为原点
// - BedrockPart.translateAndRotateAndScale (L82-96)：正向mulPose(Z,Y,X) → q_Z*q_Y*q_X
// - FirstPersonRenderGunEvent.getPositioningNodeInverse (L217-236)：逆矩阵计算，
//   本项目适配为所有节点统一ty=-py（不需要TaCZ原版的顶层ty=1.5-py和外层T共轭）
// - BedrockModel.getPath (L374-389)
//
// 注意：bone position 必须先经 convertBonePivot 转换（含顶层bone眼睛偏移 + child Y翻转），
// buildBonePath 读取的 node.position 已是转换后的值，getTaczPositioningNodeInverse 直接消费这些值。

const PIXEL_TO_UNIT = 1 / 16; // Bedrock 像素 → Babylon 单位
const DEG_TO_RAD = Math.PI / 180;

// ============ bone pivot 坐标转换 ============
// 严格实现 TaCZ BedrockModel.convertPivot (L280-294)：
// - Y轴翻转是Bedrock geo格式本身的pivot语义，与渲染引擎坐标系无关
// - Bedrock模型编辑坐标系以"脚在(0,0,0)，Y向上"，但pivot的Y值在父子关系中需要翻转（parent-child）
// - root需要24像素眼睛高度偏移（玩家眼睛高度为24像素）
//
// 转换规则：
//   顶层骨骼（无parent，包括root和view/positioning/camera等定位组）：
//     X = pivotX * PIXEL_TO_UNIT
//     Y = (24 - pivotY) * PIXEL_TO_UNIT （24像素眼睛高度偏移）
//     Z = pivotZ * PIXEL_TO_UNIT
//   子骨骼（有parent）：
//     X = (childX - parentX) * PIXEL_TO_UNIT
//     Y = (parentY - childY) * PIXEL_TO_UNIT （Y翻转！）
//     Z = (childZ - parentZ) * PIXEL_TO_UNIT
//
// 注意：所有顶层bone（包括定位组view/positioning）都需要眼睛高度偏移，
// 因为它们的pivot都是相对于脚位置Y=0的绝对坐标。只有root有cubes用于渲染，
// 但定位组的位置也必须在同一坐标系下，getPositioningNodeInverse才能正确计算。
export function convertBonePivot(pivot, parentPivot, isTopLevel) {
  if (isTopLevel) {
    return [
      (pivot?.[0] ?? 0) * PIXEL_TO_UNIT,
      (24 - (pivot?.[1] ?? 0)) * PIXEL_TO_UNIT,
      (pivot?.[2] ?? 0) * PIXEL_TO_UNIT,
    ];
  }
  return [
    ((pivot?.[0] ?? 0) - (parentPivot?.[0] ?? 0)) * PIXEL_TO_UNIT,
    ((parentPivot?.[1] ?? 0) - (pivot?.[1] ?? 0)) * PIXEL_TO_UNIT,
    ((pivot?.[2] ?? 0) - (parentPivot?.[2] ?? 0)) * PIXEL_TO_UNIT,
  ];
}

// ============ cube origin 坐标转换（备用函数）============
// 对照 TaCZ BedrockModel.convertOrigin (L314-329)：Y轴需特殊处理。
// 注意：此函数当前返回 cubeOrigin - refPivot（所有轴直接减法），
// 未实现 TaCZ 原版的 Y = bonePivot - origin - size 语义。
// 当前项目不使用此函数（cube 位置在 taczGeoModel.js 内通过 cubeCenter 计算）。
export function convertCubeOrigin(bonePivot, cubeOrigin, cubeSize, cubePivot) {
  const refPivot = cubePivot ?? bonePivot;
  return [
    ((cubeOrigin?.[0] ?? 0) - (refPivot?.[0] ?? 0)) * PIXEL_TO_UNIT,
    ((cubeOrigin?.[1] ?? 0) - (refPivot?.[1] ?? 0)) * PIXEL_TO_UNIT,
    ((cubeOrigin?.[2] ?? 0) - (refPivot?.[2] ?? 0)) * PIXEL_TO_UNIT,
  ];
}

// ============ cube 中心相对 bone 的位置（备用函数）============
// 当前项目 cubeFaceVertices 顶点以 cube 中心为原点（±size/2 * PIXEL_TO_UNIT），
// 所以 meshLocal 应指向 cube 中心相对 boneNode 的位置。
// 注意：cubeCenter[1] 必须用 origin[1] - size[1]/2 计算（Bedrock 中 origin[1] 是 cube 顶部），
// X/Z 用 origin + size/2。meshLocal 所有轴直接减法 (cubeCenter - bonePivot) * PIXEL_TO_UNIT。
export function cubeCenterRelativeToBone(cubeCenter, bonePivot) {
  return [
    ((cubeCenter?.[0] ?? 0) - (bonePivot?.[0] ?? 0)) * PIXEL_TO_UNIT,
    ((cubeCenter?.[1] ?? 0) - (bonePivot?.[1] ?? 0)) * PIXEL_TO_UNIT,
    ((cubeCenter?.[2] ?? 0) - (bonePivot?.[2] ?? 0)) * PIXEL_TO_UNIT,
  ];
}

// ============ 旋转顺序 ZYX ============
// 对照 TaCZ BedrockPart.translateAndRotateAndScale (L82-96):
// mulPose 调用顺序: ZP → YP → XP
// PoseStack.mulPose 是 post-multiply (this = this * M)，
// 最终矩阵 = T * T * R_Z * R_Y * R_X * Q * S
// 顶点变换 v' = R_Z * R_Y * R_X * v（先 X 再 Y 再 Z）
//
// 矩阵乘法顺序 R_Z * R_Y * R_X 对应四元数 q = q_Z * q_Y * q_X
// （矩阵乘法顺序 = 四元数乘法顺序，这是标准 Hamilton 积的性质）
//
// Babylon.js Quaternion.multiply(other) 返回 this * other：
// qZ.multiply(qY) = q_Z * q_Y
// (q_Z * q_Y).multiply(qX) = q_Z * q_Y * q_X ✓
//
// 数值fixture验证（taczGeoModel.test.js "Z轴90度旋转下cube世界位置"）：
// bone Z旋转90°，cube沿X+偏移0.125，世界位置为(0,0.125,0)，
// 即X+方向被转到Y+方向，符合右手Y-up坐标系绕Z+逆时针旋转的标准行为。
// 确认 qZ*qY*qX 顺序正确，Y轴翻转不影响旋转方向。
export function bedrockRotationQuaternionZYX(rotationDeg) {
  const x = (rotationDeg?.[0] ?? 0) * DEG_TO_RAD;
  const y = (rotationDeg?.[1] ?? 0) * DEG_TO_RAD;
  const z = (rotationDeg?.[2] ?? 0) * DEG_TO_RAD;
  const qZ = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, z);
  const qY = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, y);
  const qX = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, x);
  return qZ.multiply(qY).multiply(qX); // q_Z * q_Y * q_X → R_Z * R_Y * R_X
}

// ============ TaCZ 原生 path inverse matrix ============
// 对照 TaCZ FirstPersonRenderGunEvent.getPositioningNodeInverse (L217-236)，
// 但做了 Babylon 架构适配（不直接照搬 Java 版的眼睛高度偏移）：
//
// 矩阵契约（经数值fixture验证，见 taczBedrockCoordinate.test.js）：
// - Babylon TransformNode localMatrix = R × T（Compose 生成，行向量约定）
// - childWorld = childLocal × parentLocal（Babylon 层级矩阵乘法）
// - 正向路径（geo-root → view → idle_view）：M_fwd = R_idle×T_idle × R_view×T_view
// - 逆矩阵：M_inv = T_view^-1 × R_view^-1 × T_idle^-1 × R_idle^-1
//
// 位移：所有节点（含顶层）统一 tx=-px, ty=-py, tz=-pz。
// TaCZ 原版对顶层节点用 ty=1.5-py + 外层 T(0,±1.5) 共轭，是因为 Minecraft PoseStack
// 原点在脚位置(Y=0)；本项目 convertBonePivot 已对顶层 bone 做了 Y=(24-pivotY)/16
// 的眼睛高度偏移（view pivotY=0 → py=1.5），bone.position 已是 Babylon 空间正确值，
// 逆变换直接取负即可，不需要额外 1.5 补偿。
//
// 路径终止条件：bone.parent 为 null（顶层bone），不强制追溯到 name==="root"。
// idle_view 路径通常终止于 view/views（顶层定位bone），root不在路径中。
//
// 旋转：正向 Z→Y→X（bedrockRotationQuaternionZYX = qZ*qY*qX），
// 逆旋转顺序 X^-1→Y^-1→Z^-1，四元数 qX(-rx)*qY(-ry)*qZ(-rz)。
//
// 遍历方向：从 marker（path末尾）向顶层（path开头）遍历，
// 每个节点 pre-multiply（nodeInv × matrix）：
//   nodeInv = T_inv × R_inv = Translation(tx,ty,tz).multiply(RotMatrix)
//   但代码中分步写为 rotMatrix.multiply(matrix); transMatrix.multiply(matrix);
//   等价于 T × R × old_matrix，正确构建 T^-1 × R^-1 × ...
//
// Babylon.js Matrix.multiply(other) = this × other（标准矩阵乘法，行向量从左到右应用）。
export function getTaczPositioningNodeInverse(nodePath) {
  if (!nodePath || nodePath.length === 0) {
    return BABYLON.Matrix.Identity();
  }
  let matrix = BABYLON.Matrix.Identity();
  for (let i = nodePath.length - 1; i >= 0; i--) {
    const part = nodePath[i];
    const rx = part.rotation?.[0] ?? 0;
    const ry = part.rotation?.[1] ?? 0;
    const rz = part.rotation?.[2] ?? 0;
    const qX = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, -rx);
    const qY = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, -ry);
    const qZ = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, -rz);
    const invRotQuat = qX.multiply(qY).multiply(qZ);
    const rotMatrix = BABYLON.Matrix.Zero();
    invRotQuat.toRotationMatrix(rotMatrix);

    const px = part.position?.[0] ?? 0;
    const py = part.position?.[1] ?? 0;
    const pz = part.position?.[2] ?? 0;
    const tx = -px;
    const ty = -py;
    const tz = -pz;
    const transMatrix = BABYLON.Matrix.Translation(tx, ty, tz);

    matrix = rotMatrix.multiply(matrix);
    matrix = transMatrix.multiply(matrix);
  }
  return matrix;
}

// ============ TaCZ 第一人称渲染矩阵（Babylon 适配）============
// TaCZ 原版有 T(0,1.5) × M_inv × T(0,-1.5) 共轭（Minecraft PoseStack 原点在脚位置）。
// 本项目 convertBonePivot 已把顶层 bone 位置转换到 Babylon camera 空间
// （camera Y=0 即眼睛高度），不需要额外 T 共轭，直接返回 inverseMatrix。
// getTaczPositioningNodeInverse 返回的矩阵将 marker 原点映射到 geo-root 空间原点，
// 经 extractPositionFromMatrix/extractRotationFromMatrix 分解为 weaponRoot 的 TR。
export function computeTaczFirstPersonRenderMatrix(inverseMatrix) {
  return inverseMatrix;
}

// 从 4x4 矩阵提取 translation（m[12], m[13], m[14]）
// Babylon.js Matrix.m 是行优先 4x4，translation 在最后一列前三个元素
export function extractPositionFromMatrix(matrix) {
  const m = matrix.m;
  return [m[12], m[13], m[14]];
}

// 从 4x4 矩阵提取 rotation（Euler 角）
export function extractRotationFromMatrix(matrix) {
  const quat = BABYLON.Quaternion.FromRotationMatrix(matrix);
  const euler = quat.toEulerAngles();
  return [euler.x, euler.y, euler.z];
}

// ============ 构建 marker → 顶层 bone 的 path ============
// 对照 TaCZ BedrockModel.getPath (L374-389):
// 从 marker push 到 stack，向上遍历 parent 链直到 bone.parent 为 null（顶层 bone），
// 返回从顶层 bone 到 marker 的路径。
//
// 重要：顶层 bone 包括 root、view、positioning、camera 等所有无 parent 的 bone。
// 路径在第一个无 parent 的 bone 处终止（TaCZ 原版逻辑），不强制追溯到 name==="root"。
// 这样 idle_view 的路径是 [view, idle_view]（终止于view），不包含root；
// getPositioningNodeInverse 只反转定位组链的变换，root作为geo-root的子节点保持其原始位置。
//
// 输入: boneMap (Map<name, TransformNode>), boneDataMap (Map<name, raw bone data>), markerName
// 输出: [{name, position, rotation, isTopLevel}, ...] 从顶层bone到marker
// position/rotation 是 bone 的 local transform（已应用 convertBonePivot 和 ZYX 旋转）
export function buildBonePath(boneMap, boneDataMap, markerName) {
  const path = [];
  let currentName = markerName;
  const visited = new Set();
  while (currentName && !visited.has(currentName)) {
    visited.add(currentName);
    const node = boneMap?.get(currentName);
    const boneData = boneDataMap?.get(currentName);
    if (!node || !boneData) break;
    const rotationQuaternion = node.rotationQuaternion
      || BABYLON.Quaternion.FromEulerAngles(node.rotation.x, node.rotation.y, node.rotation.z);
    // 顶层 bone：bone.parent 为 null（geo 中无 parent 且未被强制链接到其他 bone）
    const isTopLevel = !boneData.parent;
    path.push({
      name: currentName,
      position: [node.position.x, node.position.y, node.position.z],
      rotation: quaternionToEulerArray(rotationQuaternion),
      isTopLevel,
    });
    currentName = boneData.parent;
  }
  return path.reverse(); // 顶层bone → marker
}

function quaternionToEulerArray(quaternion) {
  const euler = quaternion.toEulerAngles();
  return [euler.x, euler.y, euler.z];
}
