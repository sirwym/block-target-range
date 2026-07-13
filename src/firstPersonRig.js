import * as BABYLON from "@babylonjs/core";

// 第一人称持物 rig：统一 9 把武器（及未来冷兵器）的第一人称锚点层级。
// 不消费 TaCZ 资源，只接受校准数据 + pose 输入，由 taczFirstPersonAdapter 驱动。
//
// 层级：
//   camera (UniversalCamera)
//   └── cameraAnchor (TransformNode, 屏幕中心基准, position=screenOffset)
//       ├── weaponRoot (TransformNode, 应用 hipPose/adsPose/inspectPose)
//       │   ├── modelRoot (TransformNode, 模型挂载点, scaling=modelScale)
//       │   │   ├── aimAnchor (TransformNode, 瞄具锚点, ADS 时回中心)
//       │   │   ├── muzzleAnchor (TransformNode, 枪口锚点)
//       │   │   ├── rightGripAnchor (TransformNode, 右手握把)
//       │   │   └── leftGripAnchor (TransformNode, 左手托枪/换弹)
//       │   ├── rightHandRoot (TransformNode, 右手根, 独立于 modelRoot 避免缩放影响)
//       │   ├── leftHandRoot (TransformNode, 左手根)
//       │   └── heldItemRoot (TransformNode, 手持物: 弹匣/火箭弹)
//       └── adsRoot (TransformNode, ADS 偏移存储)

// 默认校准值（手枪类，其他武器在 config.js 的 WEAPON_CALIBRATION 覆盖）
const DEFAULT_CALIBRATION = {
  hipPose: { position: [0.25, -0.35, 0.5], rotation: [0, Math.PI, 0] },
  adsPose: null, // null 表示由 computeAdsPose 自动计算
  inspectPose: { position: [0.1, -0.25, 0.4], rotation: [0.2, Math.PI - 0.3, 0.1] },
  rightGrip: [0.25, -0.35, 0.2],
  leftGrip: [-0.1, -0.3, 0.35],
  muzzle: [0, 0, 0.5],
  aim: [0, 0, 0.5],
  screenOffset: [0, 0, 0.5],
  fovScale: 1,
  modelScale: 1.05,
  handScale: 1,
  rootMotionScale: 1,
};

// 归一化校准数据：补全缺失字段，返回完整对象
export function normalizeCalibration(raw) {
  const cal = { ...DEFAULT_CALIBRATION, ...raw };
  cal.hipPose = { ...DEFAULT_CALIBRATION.hipPose, ...(raw?.hipPose || {}) };
  cal.inspectPose = { ...DEFAULT_CALIBRATION.inspectPose, ...(raw?.inspectPose || {}) };
  cal.adsPose = raw?.adsPose || null; // null 触发自动计算
  for (const key of ["rightGrip", "leftGrip", "muzzle", "aim", "screenOffset"]) {
    if (!Array.isArray(cal[key]) || cal[key].length !== 3) {
      cal[key] = [...DEFAULT_CALIBRATION[key]];
    }
  }
  for (const key of ["fovScale", "modelScale", "handScale", "rootMotionScale"]) {
    if (typeof cal[key] !== "number" || !Number.isFinite(cal[key])) {
      cal[key] = DEFAULT_CALIBRATION[key];
    }
  }
  return cal;
}

// 从 hipPose + aim 计算使 aimAnchor 世界坐标 = cameraAnchor 世界坐标的 adsPose
// 数学：weaponRoot.position = -rotate(hipPose.rotation, aim * modelScale)
export function computeAdsPose(calibration) {
  const [rx, ry, rz] = calibration.hipPose.rotation;
  const matrix = BABYLON.Matrix.RotationYawPitchRoll(ry, rx, rz);
  const aimVec = new BABYLON.Vector3(
    calibration.aim[0] * calibration.modelScale,
    calibration.aim[1] * calibration.modelScale,
    calibration.aim[2] * calibration.modelScale
  );
  const rotated = BABYLON.Vector3.TransformNormal(aimVec, matrix);
  return {
    position: [-rotated.x, -rotated.y, -rotated.z],
    rotation: [...calibration.hipPose.rotation],
  };
}

// 创建第一人称 rig，挂到 camera 下
export function createFirstPersonRig(scene, camera, weaponId, rawCalibration) {
  const calibration = normalizeCalibration(rawCalibration);
  const adsPose = calibration.adsPose || computeAdsPose(calibration);

  // cameraAnchor：屏幕中心基准，位于相机正前方 screenOffset 处
  const cameraAnchor = new BABYLON.TransformNode(`${weaponId}-camera-anchor`, scene);
  cameraAnchor.parent = camera;
  cameraAnchor.position.set(...calibration.screenOffset);

  // weaponRoot：武器整体根，应用 hipPose/adsPose
  const weaponRoot = new BABYLON.TransformNode(`${weaponId}-weapon-root`, scene);
  weaponRoot.parent = cameraAnchor;
  weaponRoot.position.set(...calibration.hipPose.position);
  weaponRoot.rotation.set(...calibration.hipPose.rotation);

  // modelRoot：模型挂载点，应用 modelScale
  const modelRoot = new BABYLON.TransformNode(`${weaponId}-model-root`, scene);
  modelRoot.parent = weaponRoot;
  modelRoot.scaling.setAll(calibration.modelScale);

  // 各锚点（parent=modelRoot，随模型缩放）
  const aimAnchor = new BABYLON.TransformNode(`${weaponId}-aim-anchor`, scene);
  aimAnchor.parent = modelRoot;
  aimAnchor.position.set(...calibration.aim);

  const muzzleAnchor = new BABYLON.TransformNode(`${weaponId}-muzzle-anchor`, scene);
  muzzleAnchor.parent = modelRoot;
  muzzleAnchor.position.set(...calibration.muzzle);

  const rightGripAnchor = new BABYLON.TransformNode(`${weaponId}-right-grip`, scene);
  rightGripAnchor.parent = modelRoot;
  rightGripAnchor.position.set(...calibration.rightGrip);

  const leftGripAnchor = new BABYLON.TransformNode(`${weaponId}-left-grip`, scene);
  leftGripAnchor.parent = modelRoot;
  leftGripAnchor.position.set(...calibration.leftGrip);

  // 双手根（parent=weaponRoot，独立于 modelRoot 避免模型缩放影响手部）
  const rightHandRoot = new BABYLON.TransformNode(`${weaponId}-right-hand-root`, scene);
  rightHandRoot.parent = weaponRoot;
  rightHandRoot.position.set(...calibration.rightGrip);

  const leftHandRoot = new BABYLON.TransformNode(`${weaponId}-left-hand-root`, scene);
  leftHandRoot.parent = weaponRoot;
  leftHandRoot.position.set(...calibration.leftGrip);

  // 手持物根（换弹时的弹匣/火箭弹）
  const heldItemRoot = new BABYLON.TransformNode(`${weaponId}-held-item-root`, scene);
  heldItemRoot.parent = weaponRoot;
  heldItemRoot.position.set(0, 0, 0);
  heldItemRoot.setEnabled(false); // 默认隐藏，换弹/检视时显示

  // adsRoot：ADS 偏移存储（parent=cameraAnchor）
  const adsRoot = new BABYLON.TransformNode(`${weaponId}-ads-root`, scene);
  adsRoot.parent = cameraAnchor;
  adsRoot.position.set(0, 0, 0);

  // 默认隐藏整个 rig（由 updateWeaponModel 按当前武器激活）
  cameraAnchor.setEnabled(false);

  const rig = {
    weaponId,
    calibration,
    adsPose,
    cameraAnchor,
    weaponRoot,
    modelRoot,
    aimAnchor,
    muzzleAnchor,
    rightGripAnchor,
    leftGripAnchor,
    rightHandRoot,
    leftHandRoot,
    heldItemRoot,
    adsRoot,
    currentPose: "hip",
    setEnabled(visible) {
      cameraAnchor.setEnabled(visible);
    },
    applyHipPose() {
      weaponRoot.position.set(...calibration.hipPose.position);
      weaponRoot.rotation.set(...calibration.hipPose.rotation);
      rig.currentPose = "hip";
    },
    applyAdsPose() {
      weaponRoot.position.set(...adsPose.position);
      weaponRoot.rotation.set(...adsPose.rotation);
      rig.currentPose = "ads";
    },
    applyInspectPose() {
      weaponRoot.position.set(...calibration.inspectPose.position);
      weaponRoot.rotation.set(...calibration.inspectPose.rotation);
      rig.currentPose = "inspect";
    },
    // 在两个 pose 之间插值（weight 0=poseA, 1=poseB）
    blendPose(poseA, poseB, weight) {
      const w = Math.max(0, Math.min(1, weight));
      const posA = poseA === "ads" ? adsPose.position : calibration[`${poseA}Pose`]?.position || calibration.hipPose.position;
      const rotA = poseA === "ads" ? adsPose.rotation : calibration[`${poseA}Pose`]?.rotation || calibration.hipPose.rotation;
      const posB = poseB === "ads" ? adsPose.position : calibration[`${poseB}Pose`]?.position || calibration.hipPose.position;
      const rotB = poseB === "ads" ? adsPose.rotation : calibration[`${poseB}Pose`]?.rotation || calibration.hipPose.rotation;
      weaponRoot.position.set(
        posA[0] + (posB[0] - posA[0]) * w,
        posA[1] + (posB[1] - posA[1]) * w,
        posA[2] + (posB[2] - posA[2]) * w
      );
      weaponRoot.rotation.set(
        rotA[0] + (rotB[0] - rotA[0]) * w,
        rotA[1] + (rotB[1] - rotA[1]) * w,
        rotA[2] + (rotB[2] - rotA[2]) * w
      );
      rig.currentPose = w < 0.5 ? poseA : poseB;
    },
    // 获取 aimAnchor 世界坐标（用于 ADS 回中心验证）
    getAimWorldPosition() {
      aimAnchor.computeWorldMatrix(true);
      return aimAnchor.getAbsolutePosition().clone();
    },
    // 获取 cameraAnchor 世界坐标（屏幕中心基准）
    getCameraAnchorWorldPosition() {
      cameraAnchor.computeWorldMatrix(true);
      return cameraAnchor.getAbsolutePosition().clone();
    },
    // ===== Phase 7: 冷兵器 pose 预留接口（空实现，仅设置 currentPose 和默认 transform） =====
    // 冷兵器挥砍 pose：武器举到右上方
    applyMeleePose() {
      weaponRoot.position.set(0.35, -0.20, 0.55);
      weaponRoot.rotation.set(-0.3, Math.PI - 0.4, 0.2);
      rig.currentPose = "melee";
    },
    // 双手握持 pose（长柄武器）：左手前伸
    applyTwoHandHoldPose() {
      weaponRoot.position.set(0.20, -0.35, 0.60);
      weaponRoot.rotation.set(0, Math.PI, 0);
      rig.currentPose = "two_hand_hold";
      leftHandRoot.position.set(0.30, -0.30, 0.20);
    },
    // 盾牌格挡 pose：左手抬高到胸前
    applyShieldBlockPose() {
      weaponRoot.position.set(0.25, -0.30, 0.55);
      weaponRoot.rotation.set(0, Math.PI, 0);
      rig.currentPose = "shield_block";
      leftHandRoot.position.set(0.10, -0.15, 0.35);
    },
    // 从冷兵器 pose 切回枪械时恢复双手 root 到 calibration 位置
    restoreHandRoots() {
      rightHandRoot.position.set(...calibration.rightGrip);
      leftHandRoot.position.set(...calibration.leftGrip);
    },
    dispose() {
      cameraAnchor.dispose();
    },
  };

  return rig;
}
