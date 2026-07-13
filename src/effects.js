import * as BABYLON from "@babylonjs/core";
import { colorMaterial } from "./assets.js";

export function flashMaterials(parts, color, duration = 95) {
  const originals = [];
  const nextColor = BABYLON.Color3.FromHexString(toHex(color));
  parts.forEach((part) => {
    collectMaterials(part.material).forEach((material) => {
      originals.push([material, material.diffuseColor?.clone(), material.emissiveColor?.clone()]);
      if (material.diffuseColor) material.diffuseColor = nextColor.clone();
      if (material.emissiveColor) material.emissiveColor = nextColor.scale(0.45);
    });
  });
  setTimeout(() => {
    originals.forEach(([material, diffuse, emissive]) => {
      if (diffuse) material.diffuseColor = diffuse;
      if (emissive) material.emissiveColor = emissive;
    });
  }, duration);
}

function collectMaterials(material) {
  if (!material) return [];
  if (material.subMaterials) return material.subMaterials.filter(Boolean);
  return [material];
}

export function flashBlock(mesh) {
  flashMaterials([mesh], 0xffffff, 80);
}

let tracerMaterial = null;
const tracerPool = [];
const TRACER_POOL_CAP = 6;

function getTracerMaterial(scene) {
  if (tracerMaterial) return tracerMaterial;
  tracerMaterial = colorMaterial(scene, "#ffdf80", { alpha: 0.95 });
  return tracerMaterial;
}

export function spawnProjectileTrail(scene, projectiles, camera) {
  const tracer = acquireTracer(scene);
  const direction = camera.getForwardRay().direction.normalize();
  tracer.position.copyFrom(camera.position);
  tracer.position.addInPlace(direction.scale(1.2));
  tracer.rotation.copyFrom(camera.rotation);
  tracer.scaling.setAll(1);
  tracer.metadata = {
    velocity: direction.scale(40),
    life: 0.14,
    maxLife: 0.14,
    pooled: true,
  };
  tracer.setEnabled(true);
  tracer.isPickable = false;
  projectiles.push(tracer);
}

function acquireTracer(scene) {
  for (let i = 0; i < tracerPool.length; i += 1) {
    const t = tracerPool[i];
    if (!t.isEnabled() && t.getScene() === scene) return t;
  }
  if (tracerPool.length >= TRACER_POOL_CAP) return tracerPool[0];
  const mesh = BABYLON.MeshBuilder.CreateBox("projectile-tracer", { width: 0.12, height: 0.12, depth: 0.5 }, scene);
  mesh.material = getTracerMaterial(scene);
  mesh.isPickable = false;
  mesh.setEnabled(false);
  tracerPool.push(mesh);
  return mesh;
}

export function getTracerPoolSize() {
  return tracerPool.length;
}

export function addHitSpark(scene, effects, position, critical = false) {
  const colors = critical ? ["#ffd45a", "#ffffff"] : ["#ffb02e", "#ffffff"];
  for (let i = 0; i < 12; i += 1) {
    const size = critical ? 0.15 : 0.12;
    const mesh = BABYLON.MeshBuilder.CreateBox("hit-spark", { size }, scene);
    mesh.material = colorMaterial(scene, colors[i % 2]);
    mesh.position = position.clone();
    mesh.isPickable = false;
    effects.push({
      mesh,
      velocity: new BABYLON.Vector3(randSpread(3), randFloat(1, 4.3), randSpread(3)),
      life: 0.42,
      kind: "particle",
      maxLife: 0.42,
    });
  }
}

export function addBlockChips(scene, effects, position, sourceMesh) {
  const color = sourceMesh.material?.diffuseColor?.toHexString?.() ?? "#b8b8b8";
  for (let i = 0; i < 11; i += 1) {
    const mesh = BABYLON.MeshBuilder.CreateBox("block-chip", { size: 0.1 }, scene);
    mesh.material = colorMaterial(scene, color);
    mesh.position = position.clone();
    mesh.isPickable = false;
    effects.push({
      mesh,
      velocity: new BABYLON.Vector3(randSpread(2.8), randFloat(0.8, 3.2), randSpread(2.8)),
      life: 0.46,
      kind: "particle",
      maxLife: 0.46,
    });
  }
}

// 弹孔贴图懒加载缓存：无现成弹孔 PNG 资源，用 DynamicTexture 程序生成黑色焦痕+裂纹
let bulletHoleTexture = null;

// 在命中点贴一个弹孔 Decal。
// targetMesh 是被命中的墙，pickedPoint 是世界坐标命中点，normal 是表面法线（来自 pickResult.getNormal(true)）。
// 用 zOffset=-2 防 z-fighting，renderingGroupId=2 让弹孔在墙之上渲染。
export function createBulletHoleDecal(scene, targetMesh, pickedPoint, normal, config) {
  if (!bulletHoleTexture) bulletHoleTexture = createBulletHoleTexture(scene);
  const decal = BABYLON.MeshBuilder.CreateDecal("bullet-hole", targetMesh, {
    position: pickedPoint,
    normal: normal ?? BABYLON.Vector3.Forward(),
    size: new BABYLON.Vector3(config.size, config.size, config.size),
    angle: Math.random() * Math.PI * 2,
  });
  const material = new BABYLON.StandardMaterial("bullet-hole-mat", scene);
  material.diffuseTexture = bulletHoleTexture;
  material.useAlphaFromDiffuseTexture = true;
  material.emissiveColor = new BABYLON.Color3(0.05, 0.05, 0.05);
  material.specularColor = BABYLON.Color3.Black();
  material.zOffset = config.zOffset;
  decal.material = material;
  decal.isPickable = false;
  decal.renderingGroupId = 2;
  return decal;
}

// 程序生成 64×64 弹孔贴图：外圈焦痕 + 内圈深孔 + 放射裂纹，hasAlpha 让边缘自然过渡
function createBulletHoleTexture(scene) {
  const tex = new BABYLON.DynamicTexture("bullet-hole-tex", { width: 64, height: 64 }, scene, false);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = "rgba(20,20,20,0.95)";
  ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(8,8,8,1)";
  ctx.beginPath(); ctx.arc(32, 32, 12, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(15,15,15,0.7)"; ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(32, 32);
    ctx.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28); ctx.stroke();
  }
  tex.hasAlpha = true;
  tex.update();
  return tex;
}

export function createBreakParticles(scene, effects, position, kind) {
  const color = kind === "creeper" ? "#65d85d" : "#5176b7";
  for (let i = 0; i < 18; i += 1) {
    const mesh = BABYLON.MeshBuilder.CreateBox("break-particle", {
      width: randFloat(0.14, 0.28),
      height: randFloat(0.14, 0.28),
      depth: randFloat(0.14, 0.28),
    }, scene);
    mesh.material = colorMaterial(scene, color);
    mesh.position = position.clone().add(new BABYLON.Vector3(0, randFloat(0.4, 2.4), 0));
    mesh.isPickable = false;
    effects.push({
      mesh,
      velocity: new BABYLON.Vector3(randSpread(5.5), randFloat(2, 6), randSpread(5.5)),
      life: 0.9,
      kind: "particle",
      maxLife: 0.9,
    });
  }
}

// RPG7 爆炸视觉：中心闪光平面 + 24 个橙黄粒子球面扩散 + 8 个深灰烟雾
// 三层叠加营造爆炸观感，全部 push 到 effects[] 由 updateTemporaryMeshes 统一更新
export function createExplosionEffect(scene, effects, position) {
  // 中心闪光：平面 billboard 朝向相机，短生命周期高亮
  const flash = BABYLON.MeshBuilder.CreatePlane("explosion-flash", { size: 0.8 }, scene);
  const flashMat = colorMaterial(scene, "#ffcc44", { alpha: 0.9, emissive: BABYLON.Color3.FromHexString("#ffcc44") });
  flash.material = flashMat;
  flash.position = position.clone();
  flash.isPickable = false;
  flash.renderingGroupId = 2;
  effects.push({
    mesh: flash,
    velocity: new BABYLON.Vector3(0, 0, 0),
    life: 0.18,
    kind: "particle",
    maxLife: 0.18,
  });

  // 粒子扩散：24 个方块球面向外飞溅，橙黄白交替
  const sparkColors = ["#ff8c1a", "#ffd24a", "#ffffff"];
  for (let i = 0; i < 24; i += 1) {
    const size = randFloat(0.15, 0.3);
    const mesh = BABYLON.MeshBuilder.CreateBox("explosion-spark", { size }, scene);
    mesh.material = colorMaterial(scene, sparkColors[i % 3]);
    mesh.position = position.clone();
    mesh.isPickable = false;
    mesh.renderingGroupId = 2;
    // 球面均匀分布方向
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const speed = randFloat(3, 6);
    effects.push({
      mesh,
      velocity: new BABYLON.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.sin(phi) * Math.sin(theta) * speed + 1,
        Math.cos(phi) * speed,
      ),
      life: 0.6,
      kind: "particle",
      maxLife: 0.6,
    });
  }

  // 烟雾：8 个深灰方块向上+向外飘，重力减半模拟浮力
  for (let i = 0; i < 8; i += 1) {
    const size = randFloat(0.2, 0.35);
    const mesh = BABYLON.MeshBuilder.CreateBox("explosion-smoke", { size }, scene);
    mesh.material = colorMaterial(scene, "#3a3a3a", { alpha: 0.7 });
    mesh.position = position.clone();
    mesh.isPickable = false;
    mesh.renderingGroupId = 2;
    effects.push({
      mesh,
      velocity: new BABYLON.Vector3(randSpread(2), randFloat(1.5, 3.5), randSpread(2)),
      life: 0.9,
      kind: "smoke",
      maxLife: 0.9,
    });
  }
}

export function createFloatingText(ui, scene, text, position, critical = false) {
  if (typeof ui.addFloatingText !== "function") return null;
  return ui.addFloatingText(text, position, critical, scene);
}

export function updateTemporaryMeshes(projectiles, effects, camera, scene, delta) {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = projectiles[i];
    projectile.position.addInPlace(projectile.metadata.velocity.scale(delta));
    projectile.metadata.life -= delta;
    const meta = projectile.metadata;
    if (projectile.material) projectile.material.alpha = Math.max(0, meta.life / meta.maxLife);
    if (meta.life <= 0) {
      if (meta.pooled) {
        projectile.setEnabled(false);
      } else {
        projectile.dispose();
      }
      projectiles.splice(i, 1);
    }
  }

  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const effect = effects[i];
    if (!effect) { effects.splice(i, 1); continue; }
    effect.mesh.position.addInPlace(effect.velocity.scale(delta));
    if (effect.kind === "particle") effect.velocity.y -= 7.8 * delta;
    if (effect.kind === "text") effect.mesh.lookAt(camera.position);
    effect.life -= delta;
    const opacity = Math.max(0, effect.life / effect.maxLife);
    if (effect.mesh.material) effect.mesh.material.alpha = Math.min(1, opacity);
    if (effect.life <= 0) {
      effect.control?.dispose();
      effect.mesh.dispose();
      effects.splice(i, 1);
    }
  }
}

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

function randSpread(range) {
  return (Math.random() - 0.5) * range;
}

function toHex(color) {
  return typeof color === "number" ? `#${color.toString(16).padStart(6, "0")}` : color;
}
