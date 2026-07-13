#!/usr/bin/env node
// Bedrock 1.12 几何格式 → Blockbench Generic JSON 转换脚本
//
// ⚠️ 旧路径遗留（v9 起 4 把新武器已改走 Bedrock geo 原生路径）
// 此脚本生成的 Blockbench Generic JSON 不再被代码加载。4 把新武器现在由
// `taczWeaponLoader.js` 加载 `*_display.json` + `*_geo.json`，通过
// `createTaczGeoModel` 直接渲染 Bedrock geo，保留 bone 层级/pivot/三轴旋转/per-face UV。
// 旧 5 把枪（glock17/m4/ak47/awp/p90）仍走 Blockbench 路径（`buildFirstPersonBlockbenchMesh`）。
// 保留此脚本仅供历史参考和旧 5 把枪的 Blockbench 模型维护使用。
//
// 读取 V2 {weapon}_geo.json（Bedrock 格式），输出 Blockbench Generic JSON
// 到 public/assets/tac/models/{weapon}/{weapon}.json，同时输出 boneMap
// 到 {weapon}.bonemap.json 供 reloadParts 回填使用。
//
// 用法：node scripts/convertBedrockToBlockbench.mjs [weapon1 weapon2 ...]
// 默认转换 deagle_golden rpg7 m107 m95 四把武器。

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const V2_GEO_DIR = join(
  ROOT,
  "我的世界素材/tac-mod-resourcesV2/assets/tacz/custom/tacz_default_gun/assets/tacz/geo_models/gun",
);
const OUTPUT_BASE = join(ROOT, "public/assets/tac/models");

const DEFAULT_WEAPONS = ["deagle_golden", "rpg7", "m107", "m95"];

// 命令行参数：指定武器列表，不指定则用默认 4 把
const weapons = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_WEAPONS;

// 方向枚举：Bedrock per-face UV 用这些 key
const FACE_DIRECTIONS = ["north", "east", "south", "west", "up", "down"];

// 主流程：遍历指定武器，逐个转换
function main() {
  const summary = [];
  for (const weaponId of weapons) {
    const result = convertWeapon(weaponId);
    summary.push(result);
  }
  console.log("\n===== 转换汇总 =====");
  for (const r of summary) {
    console.log(
      `${r.weaponId}: ${r.elementCount} elements, ${r.boneCount} bones, ${r.warnings.length} warnings`,
    );
    for (const w of r.warnings.slice(0, 5)) {
      console.log(`  ⚠ ${w}`);
    }
    if (r.warnings.length > 5) console.log(`  ...还有 ${r.warnings.length - 5} 条 warning`);
  }
}

// 转换单把武器
function convertWeapon(weaponId) {
  const inputPath = join(V2_GEO_DIR, `${weaponId}_geo.json`);
  const outputPath = join(OUTPUT_BASE, weaponId, `${weaponId}.json`);
  const boneMapPath = join(OUTPUT_BASE, weaponId, `${weaponId}.bonemap.json`);

  const raw = readFileSync(inputPath, "utf8");
  const bedrock = JSON.parse(raw);
  const result = convertBedrockToBlockbench(bedrock, weaponId);

  // 确保 output 目录存在
  mkdirSync(dirname(outputPath), { recursive: true });

  // 输出 Blockbench JSON
  const blockbenchJson = {
    credit: "Converted from tac-mod-resourcesV2 Bedrock geo",
    textures: result.textures,
    elements: result.elements,
  };
  writeFileSync(outputPath, JSON.stringify(blockbenchJson, null, 2));
  console.log(`✓ ${weaponId}: ${result.elements.length} elements → ${outputPath}`);

  // 输出 boneMap（供 config.js reloadParts 回填）
  writeFileSync(boneMapPath, JSON.stringify(result.boneElementMap, null, 2));
  console.log(`✓ ${weaponId}: boneMap → ${boneMapPath}`);

  return {
    weaponId,
    elementCount: result.elements.length,
    boneCount: Object.keys(result.boneElementMap).length,
    warnings: result.warnings,
  };
}

// 核心转换：Bedrock geo → Blockbench elements
function convertBedrockToBlockbench(bedrockGeo, weaponId) {
  const geom = bedrockGeo["minecraft:geometry"]?.[0];
  if (!geom) throw new Error(`${weaponId}: missing minecraft:geometry`);
  const desc = geom.description ?? {};
  const texW = desc.texture_width ?? 16;
  const texH = desc.texture_height ?? 16;
  const bones = geom.bones ?? [];

  // 构建 bone 名 → bone 对象索引
  const boneByName = new Map();
  for (const bone of bones) boneByName.set(bone.name, bone);

  // 找出每个 bone 的子 bone 列表
  const childrenByParent = new Map();
  for (const bone of bones) {
    const parent = bone.parent;
    if (!parent) continue;
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(bone.name);
  }

  const elements = [];
  const boneElementMap = {}; // { boneName: [elementIndex, ...] }
  const warnings = [];

  // 递归处理 bone：累加祖先 pivot，应用 bone rotation 到该 bone 的 cube
  function processBone(boneName, accumulatedPivot, accumulatedRotation) {
    const bone = boneByName.get(boneName);
    if (!bone) return;

    const bonePivot = bone.pivot ?? [0, 0, 0];
    const boneRotation = bone.rotation ?? [0, 0, 0];

    // 当前 bone 的世界 pivot = 祖先 pivot + 本 bone pivot
    const currentPivot = [
      accumulatedPivot[0] + bonePivot[0],
      accumulatedPivot[1] + bonePivot[1],
      accumulatedPivot[2] + bonePivot[2],
    ];

    // 当前累积 rotation（用于判断祖先是否有旋转）
    const currentRotation = [
      accumulatedRotation[0] + boneRotation[0],
      accumulatedRotation[1] + boneRotation[1],
      accumulatedRotation[2] + boneRotation[2],
    ];

    // 如果祖先 bone 有旋转，当前 bone 的 cube 位置可能不正确（未做矩阵变换）
    const ancestorHasRotation = accumulatedRotation.some((r) => Math.abs(r) > 0.001);
    const boneHasRotation = boneRotation.some((r) => Math.abs(r) > 0.001);
    if (ancestorHasRotation && boneHasRotation) {
      warnings.push(
        `${boneName}: 祖先 bone 有旋转，当前 bone 也有旋转 [${boneRotation}]，cube 位置可能偏移`,
      );
    }

    // 处理该 bone 的 cubes
    if (Array.isArray(bone.cubes)) {
      for (const cube of bone.cubes) {
        const elementIndex = elements.length;
        const element = convertCubeToElement(
          cube,
          currentPivot,
          boneRotation,
          boneName,
          texW,
          texH,
          warnings,
        );
        elements.push(element);
        if (!boneElementMap[boneName]) boneElementMap[boneName] = [];
        boneElementMap[boneName].push(elementIndex);
      }
    }

    // 递归处理子 bone
    const children = childrenByParent.get(boneName) ?? [];
    for (const childName of children) {
      processBone(childName, currentPivot, currentRotation);
    }
  }

  // 从根 bone 开始（没有 parent 的 bone）
  for (const bone of bones) {
    if (!bone.parent) processBone(bone.name, [0, 0, 0], [0, 0, 0]);
  }

  // textures 对象：V2 geo 没有显式 textures 字段，输出单一 texture key "#0"
  // weaponModel.js 非 P90 路径不解析 UV/texture key，按尺寸选 base/accent 材质
  const textures = { "0": `tac:items/${weaponId}/${weaponId}_uv` };

  // 归一化：V2 模型 bone pivot 累加后坐标范围远大于项目原 5 把武器（glock17 最大维度约 20）。
  // 把模型缩放到最大维度 20，并平移中心到 [8, 4, 10]（类似 glock17 中心），
  // 让 config.js 的 scaling/position 可以用和 glock17 相近的值。
  normalizeElements(elements);

  return { elements, boneElementMap, warnings, textures, texW, texH };
}

// 归一化元素坐标：缩放到最大维度 20，平移中心到 [8, 4, 10]
function normalizeElements(elements) {
  if (elements.length === 0) return;
  let min_x = Infinity, min_y = Infinity, min_z = Infinity;
  let max_x = -Infinity, max_y = -Infinity, max_z = -Infinity;
  for (const el of elements) {
    min_x = Math.min(min_x, el.from[0], el.to[0]);
    max_x = Math.max(max_x, el.from[0], el.to[0]);
    min_y = Math.min(min_y, el.from[1], el.to[1]);
    max_y = Math.max(max_y, el.from[1], el.to[1]);
    min_z = Math.min(min_z, el.from[2], el.to[2]);
    max_z = Math.max(max_z, el.from[2], el.to[2]);
  }
  const center = [(min_x + max_x) / 2, (min_y + max_y) / 2, (min_z + max_z) / 2];
  const size = Math.max(max_x - min_x, max_y - min_y, max_z - min_z);
  if (size < 0.001) return;
  const scale = 20 / size;
  const target = [8, 4, 10];
  for (const el of elements) {
    el.from = el.from.map((v, i) => (v - center[i]) * scale + target[i]);
    el.to = el.to.map((v, i) => (v - center[i]) * scale + target[i]);
    if (el.rotation && el.rotation.origin) {
      el.rotation.origin = el.rotation.origin.map((v, i) => (v - center[i]) * scale + target[i]);
    }
  }
}

// 单个 cube → Blockbench element 转换
function convertCubeToElement(cube, bonePivot, boneRotation, boneName, texW, texH, warnings) {
  const origin = cube.origin ?? [0, 0, 0];
  const size = cube.size ?? [1, 1, 1];

  // 累加 bone pivot 到 cube origin（展平 bone 层级）
  const from = [
    origin[0] + bonePivot[0],
    origin[1] + bonePivot[1],
    origin[2] + bonePivot[2],
  ];
  const to = [from[0] + size[0], from[1] + size[1], from[2] + size[2]];

  // UV 转换（非 P90 路径不解析 UV，但正确转换以备未来 P90 化）
  const faces = convertCubeUV(cube, texW, texH, warnings, boneName);

  // rotation 转换：cube 自己的 rotation 优先，否则用 bone rotation
  const rotation = convertRotation(cube, bonePivot, boneRotation, boneName, warnings);

  return { from, to, faces, rotation };
}

// UV 转换：支持 per-face 模式、new auto 模式、旧 auto 模式
function convertCubeUV(cube, texW, texH, warnings, boneName) {
  const faces = {};
  const uv = cube.uv;
  if (!uv) return faces;

  // 旧 auto 模式：uv = [u, v]（Bedrock 1.12 auto UV，各面由 engine 推导）
  if (Array.isArray(uv)) {
    const u = uv[0];
    const v = uv[1];
    const [w, h, d] = cube.size ?? [1, 1, 1];
    // 简化：north/south 用宽×高，east/west 用深×高，up/down 用宽×深
    const facesUV = {
      north: [u, v, u + w, v + h],
      south: [u, v, u + w, v + h],
      east: [u, v, u + d, v + h],
      west: [u, v, u + d, v + h],
      up: [u, v, u + w, v + d],
      down: [u, v, u + w, v + d],
    };
    for (const dir of FACE_DIRECTIONS) {
      faces[dir] = { uv: facesUV[dir].map(scaleUv(texW, texH)), texture: "#0" };
    }
    return faces;
  }

  // new auto 模式：{ uv: [u,v], uv_size: [w,h] }（所有面用同一 UV）
  if (uv.uv && uv.uv_size) {
    const u = uv.uv[0];
    const v = uv.uv[1];
    const w = uv.uv_size[0];
    const h = uv.uv_size[1];
    const scaled = [u, v, u + w, v + h].map(scaleUv(texW, texH));
    for (const dir of FACE_DIRECTIONS) {
      faces[dir] = { uv: scaled, texture: "#0" };
    }
    return faces;
  }

  // per-face 模式：{ north: {uv, uv_size}, east: {...}, ... }
  for (const dir of FACE_DIRECTIONS) {
    const faceUV = uv[dir];
    if (!faceUV) continue;
    const u = faceUV.uv[0];
    const v = faceUV.uv[1];
    const w = faceUV.uv_size[0];
    const h = faceUV.uv_size[1];
    // down 面的 uv_size 第二个值可能是负数（翻转），处理时取绝对值
    const absH = Math.abs(h);
    const scaled = [u, v, u + w, v + absH].map(scaleUv(texW, texH));
    faces[dir] = { uv: scaled, texture: "#0" };
  }
  return faces;
}

// UV 像素坐标 → 0-16 范围
function scaleUv(texW, texH) {
  return (value, index) => (index % 2 === 0 ? (value * 16) / texW : (value * 16) / texH);
}

// rotation 转换：Bedrock 三轴 → Blockbench 单轴
// cube 自己的 rotation 优先（用 cube.pivot），否则用 bone rotation（用 bonePivot）
function convertRotation(cube, bonePivot, boneRotation, boneName, warnings) {
  let rotation;
  let pivot;

  if (cube.rotation) {
    rotation = cube.rotation;
    pivot = cube.pivot ?? bonePivot;
  } else if (boneRotation.some((r) => Math.abs(r) > 0.001)) {
    rotation = boneRotation;
    pivot = bonePivot;
  } else {
    return { angle: 0, axis: "x", origin: [0, 0, 0] };
  }

  // 取绝对值最大的轴（Blockbench element 只支持单轴旋转）
  const absX = Math.abs(rotation[0]);
  const absY = Math.abs(rotation[1]);
  const absZ = Math.abs(rotation[2]);
  let axis;
  let angle;
  if (absX >= absY && absX >= absZ) {
    axis = "x";
    angle = rotation[0];
  } else if (absY >= absX && absY >= absZ) {
    axis = "y";
    angle = rotation[1];
  } else {
    axis = "z";
    angle = rotation[2];
  }

  // 如果三轴都有非零值，记录 warning（信息会丢失）
  const nonZeroAxes = [absX > 0.001, absY > 0.001, absZ > 0.001].filter(Boolean).length;
  if (nonZeroAxes > 1) {
    warnings.push(
      `${boneName}: rotation [${rotation}] 有 ${nonZeroAxes} 轴非零，取 ${axis}=${angle}，其他轴丢失`,
    );
  }

  return { angle, axis, origin: pivot };
}

main();
