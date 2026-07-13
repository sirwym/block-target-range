// V2 glTF 动画解析器：从 V2 的 *_reload_empty.gltf / *_reload_norm.gltf 提取
// 弹匣（magazine）、套筒/枪栓（slide/bolt）节点的关键帧时间轴和位移数据。
//
// V2 glTF 动画文件包含命名骨骼节点（magazine/slide/bolt/LeftHand/RightHand），
// 每个节点有 translation/rotation/scale 动画通道。我们只提取部件的 translation。
//
// 解析后的数据用于驱动 Blockbench 模型中对应部件的 TransformNode 位移，
// 实现"弹匣/枪栓真正移动"的部件级动画。

// 每把枪在 V2 glTF 中的弹匣/套筒节点名（从 nodes 字段确认）
const MAGAZINE_NODE_NAMES = {
  glock17: "magazine",
  m4: "mb",
  ak47: "megazing_default",
  awp: "magazine2",
  p90: "p90_mag_standard",
};

const SLIDE_NODE_NAMES = {
  glock17: "slide",
  m4: null,
  ak47: "bolt",
  awp: "bolt_fix2",
  p90: "pull",
};

const PART_NODE_CHANNELS = {
  glock17: {
    magazine: { translation: "magazine" },
    slide: { translation: "slide" },
  },
  m4: {
    magazine: { translation: "mb" },
  },
  ak47: {
    magazine: { translation: "megazing_default" },
    slide: { translation: "bolt" },
  },
  awp: {
    magazine: { translation: "magazine2" },
    slide: { translation: "bolt_fix2", rotation: "bolt_rotate2" },
  },
  p90: {
    magazine: { translation: "p90_mag_standard" },
    slide: { translation: "pull" },
  },
};

// V2 glTF 文件名前缀映射（weaponId → V2 文件名前缀）
const V2_FILE_PREFIX = {
  glock17: "glock_17",
  m4: "m4",
  ak47: "ak47",
  awp: "ai_awp",
  p90: "p90",
};

const ANIMATION_PATH = "assets/tacz/animations";

// 解析 base64 data URI 为 Uint8Array
function decodeDataUri(uri) {
  const base64 = uri.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// 从 accessor + bufferView 读取 Float32Array。当前 V2 glTF 全部为内嵌 FLOAT 数据；
// 若未来出现 byteStride 或外部 .bin，需要在这里扩展。
function readAccessorData(gltf, accessor, bufferBytes) {
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const offset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (accessor.componentType !== 5126) return null;
  const componentSize = 4;
  const numComponents = {
    SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4,
  }[accessor.type] ?? 1;
  const totalBytes = accessor.count * numComponents * componentSize;
  const slice = bufferBytes.subarray(offset, offset + totalBytes);
  return new Float32Array(slice.buffer, slice.byteOffset, accessor.count * numComponents);
}

function extractChannel(gltf, nodeName, targetPath) {
  if (!nodeName) return null;
  const nodeIndex = gltf.nodes.findIndex((n) => n.name === nodeName);
  if (nodeIndex < 0) return null;

  const anim = gltf.animations[0];
  if (!anim?.channels) return null;

  const channel = anim.channels.find(
    (ch) => ch.target.node === nodeIndex && ch.target.path === targetPath
  );
  if (!channel) return null;

  const sampler = anim.samplers[channel.sampler];
  const bufferBytes = decodeDataUri(gltf.buffers[0].uri);

  const times = readAccessorData(gltf, gltf.accessors[sampler.input], bufferBytes);
  const values = readAccessorData(gltf, gltf.accessors[sampler.output], bufferBytes);
  if (!times || !values) return null;

  // 转为数组形式
  const numFrames = times.length;
  const timeArray = Array.from(times);
  const accessor = gltf.accessors[sampler.output];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type] ?? 1;
  const valueArray = [];
  for (let i = 0; i < numFrames; i += 1) {
    const start = i * components;
    valueArray.push(Array.from(values.slice(start, start + components)));
  }

  return { times: timeArray, values: valueArray, components, path: targetPath };
}

// 从 glTF 提取指定节点的 translation 动画通道
function extractTranslationChannel(gltf, nodeName) {
  const channel = extractChannel(gltf, nodeName, "translation");
  return channel ? { times: channel.times, positions: channel.values } : null;
}

function extractPartChannels(gltf, nodeConfig) {
  if (!nodeConfig) return null;
  const translation = nodeConfig.translation
    ? extractChannel(gltf, nodeConfig.translation, "translation")
    : null;
  const rotation = nodeConfig.rotation
    ? extractChannel(gltf, nodeConfig.rotation, "rotation")
    : null;
  if (!translation && !rotation) return null;
  return { translation, rotation };
}

// 解析单把枪的换弹动画数据
// reloadType: "reload_empty" | "reload_norm"
export async function parseV2ReloadAnimation(weaponId, reloadType) {
  const prefix = V2_FILE_PREFIX[weaponId];
  if (!prefix) return null;

  const url = `${ANIMATION_PATH}/${prefix}_${reloadType}.gltf`;
  const response = await fetch(url);
  if (!response.ok) {
    console.warn(`[V2 anim] ${weaponId} ${reloadType} not found: ${url}`);
    return null;
  }
  const gltf = await response.json();

  const partChannels = PART_NODE_CHANNELS[weaponId] ?? {};

  return {
    magazine: extractPartChannels(gltf, partChannels.magazine),
    slide: extractPartChannels(gltf, partChannels.slide),
  };
}

// 归一化位移数据：返回相对位移（相对于第一帧的偏移）
function normalizeDisplacement(partAnim) {
  if (!partAnim || partAnim.positions.length === 0) return null;
  const base = partAnim.positions[0];
  const normalized = partAnim.positions.map((pos) => [
    pos[0] - base[0],
    pos[1] - base[1],
    pos[2] - base[2],
  ]);
  return { times: partAnim.times, positions: normalized };
}

function normalizeChannelValues(channel) {
  if (!channel?.values?.length) return null;
  const base = channel.values[0];
  const values = channel.values.map((value) => value.map((component, index) => component - (base[index] ?? 0)));
  return { times: channel.times, values };
}

function maxAbsValue(values) {
  return Math.max(0, ...values.flat().map((value) => Math.abs(value)));
}

function sampleChannel(channel, progress, duration) {
  if (!channel?.times?.length || !channel.values?.length) return null;
  const targetTime = progress * duration;
  const { times, values } = channel;
  if (targetTime <= times[0]) return values[0];
  if (targetTime >= times[times.length - 1]) return values[values.length - 1];
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (times[mid] <= targetTime) lo = mid;
    else hi = mid;
  }
  const t = (targetTime - times[lo]) / (times[hi] - times[lo]);
  return values[lo].map((value, index) => value + ((values[hi][index] ?? value) - value) * t);
}

function mapVector(vector, axisMap = ["x", "y", "z"], sign = [1, 1, 1]) {
  const sourceIndex = { x: 0, y: 1, z: 2 };
  return axisMap.map((axis, index) => (vector[sourceIndex[axis]] ?? 0) * (sign[index] ?? 1));
}

function quaternionInverse(q) {
  const [x, y, z, w] = q;
  const lenSq = x * x + y * y + z * z + w * w || 1;
  return [-x / lenSq, -y / lenSq, -z / lenSq, w / lenSq];
}

function multiplyQuaternion(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function quaternionToEuler(q) {
  const [x, y, z, w] = q;
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);
  return [roll, pitch, yaw];
}

function sampleRotationEuler(channel, progress, duration, rotationScale = 1) {
  if (!channel?.values?.length) return [0, 0, 0];
  const sampled = sampleChannel(channel, progress, duration);
  if (!sampled) return [0, 0, 0];
  const baseInv = quaternionInverse(channel.values[0]);
  const delta = multiplyQuaternion(sampled, baseInv);
  return quaternionToEuler(delta).map((value) => value * rotationScale);
}

export function samplePartTransform(partAnim, progress, duration, mapping = {}) {
  const result = { position: [0, 0, 0], rotation: [0, 0, 0] };
  if (partAnim?.translation) {
    const normalized = normalizeChannelValues(partAnim.translation);
    const max = normalized ? maxAbsValue(normalized.values) : 0;
    const sampled = normalized && max > 0 ? sampleChannel(normalized, progress, duration) : null;
    if (sampled) {
      let amount = (mapping.distance ?? 0.16) / max;
      if (mapping.returnToBaseAtEnd && progress > 0.92) {
        amount *= Math.max(0, (1 - progress) / 0.08);
      }
      result.position = mapVector(sampled.map((value) => value * amount), mapping.axisMap, mapping.sign);
    }
  }
  if (partAnim?.rotation) {
    result.rotation = sampleRotationEuler(partAnim.rotation, progress, duration, mapping.rotationScale ?? 1);
  }
  return result;
}

// 采样：给定 progress(0-1) 和 duration，返回部件相对位移 [x, y, z]
// progress 是换弹进度 0-1，duration 是换弹总时长（秒）
export function samplePartDisplacement(partAnim, progress, duration, scale = 1) {
  if (!partAnim?.times || partAnim.times.length === 0) return [0, 0, 0];

  const normalized = normalizeDisplacement(partAnim);
  if (!normalized) return [0, 0, 0];

  // progress(0-1) → 实际时间（秒）
  const targetTime = progress * duration;

  // 找到 targetTime 所在的关键帧区间
  const times = normalized.times;
  const positions = normalized.positions;

  // 如果目标时间在第一帧之前，返回零位移
  if (targetTime <= times[0]) return [0, 0, 0];
  // 如果目标时间在最后一帧之后，返回最后一帧的位移
  if (targetTime >= times[times.length - 1]) return positions[positions.length - 1].map((v) => v * scale);

  // 二分查找关键帧区间
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (times[mid] <= targetTime) lo = mid;
    else hi = mid;
  }

  // lerp 插值
  const t = (targetTime - times[lo]) / (times[hi] - times[lo]);
  const p0 = positions[lo];
  const p1 = positions[hi];
  return [
    (p0[0] + (p1[0] - p0[0]) * t) * scale,
    (p0[1] + (p1[1] - p0[1]) * t) * scale,
    (p0[2] + (p1[2] - p0[2]) * t) * scale,
  ];
}

// 缓存：weaponId → { empty: animData, tactical: animData }
const animationCache = new Map();

// 预解析并缓存所有武器的换弹动画
export async function preloadV2Animations(weaponIds) {
  const results = {};
  for (const weaponId of weaponIds) {
    try {
      const [empty, tactical] = await Promise.all([
        parseV2ReloadAnimation(weaponId, "reload_empty"),
        parseV2ReloadAnimation(weaponId, "reload_norm"),
      ]);
      results[weaponId] = { empty, tactical };
      animationCache.set(weaponId, { empty, tactical });
    } catch (e) {
      console.warn(`[V2 anim] preload failed for ${weaponId}:`, e);
      results[weaponId] = { empty: null, tactical: null };
    }
  }
  return results;
}

// 从缓存获取动画数据
export function getV2Animation(weaponId, isEmpty) {
  const cached = animationCache.get(weaponId);
  if (!cached) return null;
  return isEmpty ? cached.empty : cached.tactical;
}

export const _TEST_ONLY = {
  MAGAZINE_NODE_NAMES, SLIDE_NODE_NAMES, PART_NODE_CHANNELS, V2_FILE_PREFIX,
  extractTranslationChannel, extractChannel, normalizeDisplacement, decodeDataUri,
  normalizeChannelValues, samplePartTransform,
  // 测试注入点：直接设置缓存，绕过 fetch（Node.js 测试环境无 fetch）
  setAnimationCache: (weaponId, data) => animationCache.set(weaponId, data),
  clearAnimationCache: () => animationCache.clear(),
};
