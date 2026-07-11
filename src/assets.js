import * as BABYLON from "@babylonjs/core";
import { ASSET_PATHS, ASSET_ROOT, WEAPON_CONFIG, WEAPON_ORDER } from "./config.js";

export function loadPixelTexture(scene, path) {
  const texture = new BABYLON.Texture(path, scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
  texture.hasAlpha = true;
  texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  return texture;
}

export function loadTextures(scene) {
  return {
    grassTop: loadPixelTexture(scene, `${ASSET_ROOT}/block/grass_block_top.png`),
    grassSide: loadPixelTexture(scene, `${ASSET_ROOT}/block/grass_block_side.png`),
    dirt: loadPixelTexture(scene, `${ASSET_ROOT}/block/dirt.png`),
    cobble: loadPixelTexture(scene, `${ASSET_ROOT}/block/cobblestone.png`),
    planks: loadPixelTexture(scene, `${ASSET_ROOT}/block/oak_planks.png`),
    stone: loadPixelTexture(scene, `${ASSET_ROOT}/block/stone.png`),
    glass: loadPixelTexture(scene, `${ASSET_ROOT}/block/glass.png`),
    tntTop: loadPixelTexture(scene, `${ASSET_ROOT}/block/tnt_top.png`),
    tntSide: loadPixelTexture(scene, `${ASSET_ROOT}/block/tnt_side.png`),
    lamp: loadPixelTexture(scene, `${ASSET_ROOT}/block/redstone_lamp_on.png`),
    diamond: loadPixelTexture(scene, `${ASSET_ROOT}/block/diamond_block.png`),
    emerald: loadPixelTexture(scene, `${ASSET_ROOT}/block/emerald_block.png`),
    magma: loadPixelTexture(scene, `${ASSET_ROOT}/block/magma.png`),
    pumpkin: loadPixelTexture(scene, `${ASSET_ROOT}/block/jack_o_lantern.png`),
    obsidian: loadPixelTexture(scene, `${ASSET_ROOT}/block/obsidian.png`),
    beacon: loadPixelTexture(scene, `${ASSET_ROOT}/block/beacon.png`),
    zombie: loadPixelTexture(scene, `${ASSET_ROOT}/entity/zombie/zombie.png`),
    creeper: loadPixelTexture(scene, `${ASSET_ROOT}/entity/creeper/creeper.png`),
    bow: loadPixelTexture(scene, `${ASSET_ROOT}/item/bow.png`),
    bowPulling0: loadPixelTexture(scene, `${ASSET_ROOT}/item/bow_pulling_0.png`),
    bowPulling1: loadPixelTexture(scene, `${ASSET_ROOT}/item/bow_pulling_1.png`),
    bowPulling2: loadPixelTexture(scene, `${ASSET_ROOT}/item/bow_pulling_2.png`),
    arrow: loadPixelTexture(scene, `${ASSET_ROOT}/item/arrow.png`),
    experienceBottle: loadPixelTexture(scene, `${ASSET_ROOT}/item/experience_bottle.png`),
    muzzleFlash: loadPixelTexture(scene, ASSET_PATHS.tacMuzzleFlash),
    hitMarker: loadPixelTexture(scene, ASSET_PATHS.tacHitMarker),
    weapons: Object.fromEntries(
      WEAPON_ORDER.map((id) => [id, loadPixelTexture(scene, WEAPON_CONFIG[id].iconPath)])
    ),
  };
}

export function createSkyTexture(scene) {
  const texture = new BABYLON.DynamicTexture("sky-gradient", { width: 16, height: 256 }, scene, false);
  const ctx = texture.getContext();
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#78baff");
  gradient.addColorStop(0.52, "#ffd18b");
  gradient.addColorStop(1, "#7fc96b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 16, 256);
  texture.update(false);
  return texture;
}

export function materialFromTexture(scene, texture, options = {}) {
  const material = new BABYLON.StandardMaterial(options.name ?? "pixel-material", scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = options.useAlpha ?? true;
  material.specularColor = BABYLON.Color3.Black();
  material.emissiveColor = options.emissiveColor ?? BABYLON.Color3.Black();
  material.alpha = options.alpha ?? 1;
  material.backFaceCulling = false;
  if (material.alpha < 1 || options.transparent) material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  return material;
}

export function colorMaterial(scene, color, options = {}) {
  const material = new BABYLON.StandardMaterial(options.name ?? "color-material", scene);
  material.diffuseColor = BABYLON.Color3.FromHexString(color);
  material.emissiveColor = options.emissive ?? BABYLON.Color3.Black();
  material.specularColor = BABYLON.Color3.Black();
  material.alpha = options.alpha ?? 1;
  if (material.alpha < 1) material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  return material;
}

export function cubeMaterialSpec(top, side = top, bottom = side) {
  return { top, side, bottom };
}

export function createBlockMaterial(scene, materialSpec) {
  if (materialSpec instanceof BABYLON.Material) return materialSpec.clone(`${materialSpec.name}-clone`);
  if (materialSpec?.side) return materialFromTexture(scene, materialSpec.side, { useAlpha: false });
  return materialFromTexture(scene, materialSpec, { useAlpha: false });
}

export function createBox(scene, name, width, height, depth, materialSpec) {
  return createFaceUVBox(scene, name, width, height, depth, materialSpec);
}

export function createFaceUVBox(scene, name, width, height, depth, materialSpec) {
  const mesh = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
  mesh.material = createBlockMaterial(scene, materialSpec);
  mesh.checkCollisions = true;
  mesh.isPickable = true;
  if (materialSpec?.side) addTopBottomFaces(scene, mesh, width, height, depth, materialSpec);
  return mesh;
}

export const SKIN_FACE_ORDER = ["front", "back", "right", "left", "top", "bottom"];

export const ZOMBIE_SKIN_UV = {
  sourceWidth: 64,
  sourceHeight: 64,
  parts: {
    head: {
      top: [8, 0, 8, 8], bottom: [16, 0, 8, 8], right: [0, 8, 8, 8],
      front: [8, 8, 8, 8], left: [16, 8, 8, 8], back: [24, 8, 8, 8],
    },
    body: {
      top: [20, 16, 8, 4], bottom: [28, 16, 8, 4], right: [16, 20, 4, 12],
      front: [20, 20, 8, 12], left: [28, 20, 4, 12], back: [32, 20, 8, 12],
    },
    rightArm: {
      top: [44, 16, 4, 4], bottom: [48, 16, 4, 4], right: [40, 20, 4, 12],
      front: [44, 20, 4, 12], left: [48, 20, 4, 12], back: [52, 20, 4, 12],
    },
    leftArm: {
      top: [44, 16, 4, 4], bottom: [48, 16, 4, 4], right: [40, 20, 4, 12],
      front: [44, 20, 4, 12], left: [48, 20, 4, 12], back: [52, 20, 4, 12],
    },
    rightLeg: {
      top: [4, 16, 4, 4], bottom: [8, 16, 4, 4], right: [0, 20, 4, 12],
      front: [4, 20, 4, 12], left: [8, 20, 4, 12], back: [12, 20, 4, 12],
    },
    leftLeg: {
      top: [4, 16, 4, 4], bottom: [8, 16, 4, 4], right: [0, 20, 4, 12],
      front: [4, 20, 4, 12], left: [8, 20, 4, 12], back: [12, 20, 4, 12],
    },
  },
};

export const CREEPER_SKIN_UV = {
  sourceWidth: 64,
  sourceHeight: 32,
  parts: {
    head: {
      top: [8, 0, 8, 8], bottom: [16, 0, 8, 8], right: [0, 8, 8, 8],
      front: [8, 8, 8, 8], left: [16, 8, 8, 8], back: [24, 8, 8, 8],
    },
    body: {
      top: [20, 16, 8, 4], bottom: [28, 16, 8, 4], right: [16, 20, 4, 12],
      front: [20, 20, 8, 12], left: [28, 20, 4, 12], back: [32, 20, 8, 12],
    },
    leg: {
      top: [4, 16, 4, 4], bottom: [8, 16, 4, 4], right: [0, 20, 4, 6],
      front: [4, 20, 4, 6], left: [8, 20, 4, 6], back: [12, 20, 4, 6],
    },
  },
};

export function validateSkinUvSet(skinUv) {
  return Object.values(skinUv.parts).every((faces) => (
    SKIN_FACE_ORDER.every((face) => {
      const rect = faces[face];
      return Array.isArray(rect)
        && rect.length === 4
        && rect[2] > 0
        && rect[3] > 0
        && rect[0] >= 0
        && rect[1] >= 0
        && rect[0] + rect[2] <= skinUv.sourceWidth
        && rect[1] + rect[3] <= skinUv.sourceHeight;
    })
  ));
}

export function createSkinCuboid(scene, {
  name = "skin-part",
  width,
  height,
  depth,
  texture,
  sourceWidth,
  sourceHeight,
  faces,
}) {
  const fullFaceUV = SKIN_FACE_ORDER.map(() => new BABYLON.Vector4(0, 0, 1, 1));
  const mesh = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth, faceUV: fullFaceUV }, scene);
  const material = new BABYLON.MultiMaterial(`${name}-skin-material`, scene);
  material.subMaterials = SKIN_FACE_ORDER.map((face) => (
    createSkinPatchMaterial(scene, texture, sourceWidth, sourceHeight, faces[face], `${name}-${face}`)
  ));
  mesh.material = material;
  mesh.subMeshes = [];
  SKIN_FACE_ORDER.forEach((_, index) => {
    new BABYLON.SubMesh(index, index * 4, 4, index * 6, 6, mesh);
  });
  mesh.isPickable = false;
  mesh.metadata = { ...(mesh.metadata ?? {}), skinFaces: faces };
  return mesh;
}

export function createSkinPatchTexture(scene, texture, sourceWidth, sourceHeight, rect, name = "skin-patch") {
  const [x, y, width, height] = rect;
  const sourcePixels = getTexturePixelData(texture, sourceWidth, sourceHeight);
  if (sourcePixels) {
    const cropped = cropRgbaPixels(sourcePixels.data, sourceWidth, sourceHeight, rect);
    const patch = BABYLON.RawTexture.CreateRGBATexture(
      cropped,
      width,
      height,
      scene,
      false,
      false,
      BABYLON.Texture.NEAREST_SAMPLINGMODE
    );
    configureSkinPatchTexture(patch, name, analyzeSkinPixels(cropped));
    return patch;
  }

  const patch = new BABYLON.DynamicTexture(
    name,
    { width, height },
    scene,
    false,
    BABYLON.Texture.NEAREST_SAMPLINGMODE,
    undefined,
    false
  );
  configureSkinPatchTexture(patch, name, null);
  const drawPatch = () => drawSkinPatchFromSource(texture, patch, x, y, width, height);
  if (!drawPatch()) {
    texture.onLoadObservable?.addOnce(drawPatch);
    loadPatchImageFromUrl(texture, patch, x, y, width, height);
  }
  return patch;
}

export function analyzeSkinPixels(rgba) {
  const total = rgba.length / 4;
  let opaque = 0;
  let visible = 0;
  let nearBlack = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3];
    if (alpha >= 250) opaque += 1;
    if (alpha > 0) {
      visible += 1;
      if (rgba[i] < 8 && rgba[i + 1] < 8 && rgba[i + 2] < 8) nearBlack += 1;
    }
  }
  const opaqueRatio = total > 0 ? opaque / total : 0;
  const visibleRatio = total > 0 ? visible / total : 0;
  const nearBlackRatio = visible > 0 ? nearBlack / visible : 0;
  return {
    opaque,
    visible,
    total,
    opaqueRatio,
    visibleRatio,
    nearBlackRatio,
    warning: opaqueRatio < 0.8 || visibleRatio < 0.8 || nearBlackRatio > 0.92,
  };
}

export function analyzeSkinPixelRect(rgba, sourceWidth, sourceHeight, rect) {
  return analyzeSkinPixels(cropRgbaPixels(rgba, sourceWidth, sourceHeight, rect));
}

export function cropRgbaPixels(rgba, sourceWidth, sourceHeight, rect) {
  const [x, y, width, height] = rect;
  const cropped = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * sourceWidth + x) * 4;
    const targetStart = row * width * 4;
    cropped.set(rgba.subarray(sourceStart, sourceStart + width * 4), targetStart);
  }
  return cropped;
}

function configureSkinPatchTexture(patch, name, metrics) {
  patch.name = name;
  patch.hasAlpha = true;
  patch.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
  patch.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  patch.updateSamplingMode?.(BABYLON.Texture.NEAREST_SAMPLINGMODE);
  patch.metadata = {
    ...(patch.metadata ?? {}),
    skinPatchMetrics: metrics,
    skinPatchMetricListeners: [],
    onSkinPatchMetrics(listener) {
      if (this.skinPatchMetrics) listener(this.skinPatchMetrics);
      this.skinPatchMetricListeners.push(listener);
    },
  };
}

function getTexturePixelData(texture, expectedWidth, expectedHeight) {
  const data = texture?._texture?._bufferView;
  if (!data || data.length < expectedWidth * expectedHeight * 4) return null;
  return { data, width: expectedWidth, height: expectedHeight };
}

function drawSkinPatchFromSource(sourceTexture, patch, x, y, width, height) {
  const source = getDrawableTextureSource(sourceTexture);
  if (!source) return false;
  const ctx = patch.getContext();
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
  const metrics = analyzeSkinPixels(ctx.getImageData(0, 0, width, height).data);
  setSkinPatchMetrics(patch, metrics);
  patch.update(false);
  return true;
}

function getDrawableTextureSource(texture) {
  const source = texture?._texture?._buffer;
  if (!source) return null;
  if ("complete" in source && !source.complete) return null;
  if ((source.naturalWidth ?? source.width ?? 0) <= 0) return null;
  return source;
}

function loadPatchImageFromUrl(sourceTexture, patch, x, y, width, height) {
  if (typeof Image === "undefined" || !sourceTexture?.url) return;
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => drawSkinPatchFromImage(image, patch, x, y, width, height);
  image.src = sourceTexture.url;
}

function drawSkinPatchFromImage(image, patch, x, y, width, height) {
  const ctx = patch.getContext();
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
  const metrics = analyzeSkinPixels(ctx.getImageData(0, 0, width, height).data);
  setSkinPatchMetrics(patch, metrics);
  patch.update(false);
}

function setSkinPatchMetrics(patch, metrics) {
  patch.metadata.skinPatchMetrics = metrics;
  patch.metadata.skinPatchMetricListeners.forEach((listener) => listener(metrics));
}

function createSkinPatchMaterial(scene, texture, sourceWidth, sourceHeight, rect, name) {
  const material = new BABYLON.StandardMaterial(`${name}-material`, scene);
  material.diffuseTexture = createSkinPatchTexture(scene, texture, sourceWidth, sourceHeight, rect, `${name}-texture`);
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = BABYLON.Material.MATERIAL_ALPHATESTANDBLEND;
  material.alphaCutOff = 0.08;
  material.specularColor = BABYLON.Color3.Black();
  material.backFaceCulling = false;
  return material;
}

function addTopBottomFaces(scene, mesh, width, height, depth, materialSpec) {
  const top = BABYLON.MeshBuilder.CreatePlane(`${mesh.name}-top-face`, { width, height: depth, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
  top.material = materialFromTexture(scene, materialSpec.top, { useAlpha: false });
  top.material.backFaceCulling = false;
  top.rotation.x = Math.PI / 2;
  top.position.y = height / 2 + 0.002;
  top.parent = mesh;
  top.isPickable = false;

  const bottom = BABYLON.MeshBuilder.CreatePlane(`${mesh.name}-bottom-face`, { width, height: depth, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
  bottom.material = materialFromTexture(scene, materialSpec.bottom, { useAlpha: false });
  bottom.material.backFaceCulling = false;
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -height / 2 - 0.002;
  bottom.parent = mesh;
  bottom.isPickable = false;
}

function uvRect([x, y, width, height], sourceWidth, sourceHeight) {
  return new BABYLON.Vector4(
    x / sourceWidth,
    1 - (y + height) / sourceHeight,
    (x + width) / sourceWidth,
    1 - y / sourceHeight
  );
}
