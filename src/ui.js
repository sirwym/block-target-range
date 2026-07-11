import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui";
import { ASSET_PATHS, GAME_CONFIG, WEAPON_CONFIG, WEAPON_ORDER } from "./config.js";
import { getCurrentWeapon, getReloadProgress } from "./weapon.js";

const FONT_TITLE = "MinecraftTitle, PingFang SC, Microsoft YaHei, system-ui";
const FONT_UI = "MinecraftUI, PingFang SC, Microsoft YaHei, system-ui";

export function createGameUi(scene, { onStart, onRestart, weaponLabMode = false }) {
  const texture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("game-ui", true, scene);
  texture.idealWidth = 1280;
  texture.idealHeight = 720;
  const resultPanel = buildResultPanel(onRestart);

  const ui = {
    texture,
    startPanel: buildStartPanel(onStart),
    resultPanel,
    resultBadge: resultPanel.resultBadge,
    resultTitle: resultPanel.resultTitle,
    resultCopy: resultPanel.resultCopy,
    resultScore: resultPanel.resultScore,
    resultHits: resultPanel.resultHits,
    resultCombo: resultPanel.resultCombo,
    resultBase: resultPanel.resultBase,
    scoreEl: text("0", 34, "#ffffff"),
    timeEl: text("75s", 36, "#ffffa0", FONT_TITLE),
    comboEl: text("x0", 24, "#80ff54", FONT_TITLE),
    comboTimerEl: text("经验充能", 18, "#d8ffd0"),
    comboFillEl: new GUI.Rectangle("combo-fill"),
    weaponCooldownFillEl: new GUI.Rectangle("weapon-cooldown-fill"),
    reloadFillEl: new GUI.Rectangle("reload-fill"),
    weaponNameEl: text("Glock 17", 18, "#ffffff", FONT_TITLE),
    weaponAmmoEl: text("17 / 17", 24, "#ffffa0", FONT_TITLE),
    baseHealthEl: text("♥♥♥♥♥", 26, "#ff5555"),
    countdownEl: text("3", 92, "#ffffa0", FONT_TITLE),
    comboPopEl: text("COMBO x3", 46, "#ffe36a", FONT_TITLE),
    crosshairControls: [],
    weaponSlots: [],
    floatingControls: [],
    debugControls: [],
  };
  ui.addDebugLabel = (textValue, mesh, options = {}) => addDebugLabel(ui, textValue, mesh, options);
  ui.addDebugSkinSample = (sample) => addDebugSkinSample(ui, sample);
  ui.addFloatingText = (textValue, position, critical, scene) => addFloatingText(ui, textValue, position, critical, scene);

  texture.addControl(ui.startPanel);
  texture.addControl(ui.resultPanel);
  buildHud(texture, ui);
  buildCrosshair(texture, ui);
  buildScopeOverlay(texture, ui);
  buildTip(texture, ui, weaponLabMode);

  ui.resultPanel.isVisible = false;
  ui.countdownEl.isVisible = false;
  ui.comboPopEl.isVisible = false;
  setCrosshair(ui, "normal", true);
  return ui;
}

export function updateHud(ui, state) {
  ui.scoreEl.text = String(state.score);
  ui.comboEl.text = `x${state.combo}`;
  ui.comboTimerEl.text = state.combo >= 3 ? `COMBO x${state.combo}` : "经验充能";
  ui.timeEl.text = `${Math.ceil(state.timeLeft)}s`;
  ui.baseHealthEl.text = "♥".repeat(state.baseHealth) + "♡".repeat(GAME_CONFIG.baseHealth - state.baseHealth);
  const weapon = state.weapons ? getCurrentWeapon(state.weapons, WEAPON_CONFIG) : WEAPON_CONFIG.glock17;
  const ammo = state.weapons?.ammo?.[weapon.id] ?? weapon.magazineSize;
  ui.weaponNameEl.text = weapon.label;
  ui.weaponAmmoEl.text = state.weapons?.reloading
    ? `换弹 ${Math.round(getReloadProgress(state.weapons) * 100)}%`
    : `${ammo} / ${weapon.magazineSize}`;
  const weaponReady = 1 - Math.min(1, (state.weapons?.fireTimer ?? 0) / weapon.fireInterval);
  ui.weaponCooldownFillEl.width = `${Math.round(52 * weaponReady)}px`;
  ui.weaponCooldownFillEl.background = weaponReady >= 1 ? "#72e857" : "#ffe36a";
  ui.reloadFillEl.width = `${Math.round(210 * getReloadProgress(state.weapons ?? {}))}px`;
  ui.reloadFillEl.background = state.weapons?.reloading ? "#ffe36a" : "#72e857";
  ui.weaponSlots.forEach((slot) => {
    const selected = slot.metadata?.weaponId === weapon.id;
    slot.thickness = selected ? 4 : 0;
    slot.color = selected ? "#ffffff" : "transparent";
    slot.background = selected ? "rgba(255, 255, 255, 0.1)" : "transparent";
  });
  const fill = state.combo > 0 ? Math.max(4, Math.round((state.comboTimer / GAME_CONFIG.comboWindow) * 100)) : 0;
  ui.comboFillEl.width = `${fill}%`;
}

export function showCombo(ui, combo) {
  if (combo >= 3) {
    ui.comboPopEl.text = `COMBO x${combo}`;
    ui.comboPopEl.isVisible = true;
  }
}

export function setCrosshair(ui, state, enabled) {
  if (!enabled && state !== "normal") return;
  const colors = {
    normal: "#ffffff",
    aiming: "#5ecbff",
    hit: "#ffae38",
    "block-hit": "#dff7ff",
    "critical-hit": "#ffe36a",
  };
  const color = colors[state] ?? colors.normal;
  ui.crosshairControls.forEach((control) => {
    control.color = color;
  });
  if (ui.hitMarkerEl) {
    const showMarker = state === "hit" || state === "critical-hit";
    ui.hitMarkerEl.isVisible = showMarker;
    if (showMarker) ui.hitMarkerTimer = 0.15;
  }
}

export function clearCrosshair(ui) {
  setCrosshair(ui, "normal", true);
}

// 按当前武器切换准星贴图（每把武器配不同 crosshair.image）
export function setCrosshairForWeapon(ui, weaponId) {
  const weapon = WEAPON_CONFIG[weaponId];
  if (!weapon?.crosshair?.image || !ui.crosshairImage) return;
  ui.crosshairImage.source = weapon.crosshair.image;
}

// 命中标记淡出：命中后 0.15s 自动隐藏 hitMarker，避免常亮
export function updateHitMarker(ui, delta) {
  if (ui.hitMarkerTimer > 0) {
    ui.hitMarkerTimer -= delta;
    if (ui.hitMarkerTimer <= 0) {
      ui.hitMarkerEl.isVisible = false;
      ui.hitMarkerTimer = 0;
    }
  }
}

export function showResult(ui, { victory, rating, score, hits, bestCombo, baseHealth }) {
  ui.resultBadge.text = rating;
  ui.resultTitle.text = victory ? "守卫成功" : "基地失守";
  ui.resultCopy.text = victory
    ? "训练场水晶还在发光，漂亮的一轮防守。"
    : "怪物冲进了基地，再调整节奏守一局。";
  ui.resultScore.text = String(score);
  ui.resultHits.text = String(hits);
  ui.resultCombo.text = String(bestCombo);
  ui.resultBase.text = String(baseHealth);
  ui.resultPanel.isVisible = true;
  ui.startPanel.isVisible = false;
  ui.countdownEl.isVisible = false;
}

export function showStart(ui, visible) {
  ui.startPanel.isVisible = visible;
}

export function hideArenaHud(ui) {
  // weaponLab 模式隐藏靶场专属 HUD（Score/Time/基地血量/经验条/tip），保留准星+热栏
  (ui.arenaHudControls ?? []).forEach((control) => { control.isVisible = false; });
}

export function hideResult(ui) {
  ui.resultPanel.isVisible = false;
}

export function addFloatingText(ui, textValue, position, critical, scene) {
  const anchor = BABYLON.MeshBuilder.CreateBox("floating-text-anchor", { size: 0.01 }, scene);
  anchor.position = position.clone();
  anchor.isPickable = false;
  anchor.visibility = 0;

  const label = text(textValue, critical ? 38 : 30, critical ? "#ffe36a" : "#ffca5f", FONT_TITLE);
  label.outlineWidth = 6;
  label.outlineColor = "#251500";
  label.width = critical ? "260px" : "180px";
  label.height = "70px";
  ui.texture.addControl(label);
  label.linkWithMesh(anchor);
  label.linkOffsetY = -26;
  ui.floatingControls.push(label);
  return {
    mesh: anchor,
    control: label,
    velocity: new BABYLON.Vector3(0, 1.1, 0),
    life: 0.9,
    maxLife: 0.9,
    kind: "text",
  };
}

function addDebugLabel(ui, textValue, target, options = {}) {
  const label = text(textValue, options.size ?? 18, "#ffffa0", FONT_TITLE);
  label.outlineWidth = 4;
  label.outlineColor = "#000000";
  label.background = "#111111";
  label.width = options.width ?? "190px";
  label.height = options.height ?? "34px";
  ui.texture.addControl(label);

  const mesh = getDebugLabelMesh(target, options);
  label.linkWithMesh(mesh);
  label.linkOffsetY = options.offsetY ?? -42;
  ui.debugControls.push(label);
  return label;
}

function addDebugSkinSample(ui, { label, index, metrics = null }) {
  const row = new GUI.Rectangle(`skin-sample-row-${index}`);
  row.width = "286px";
  row.height = "54px";
  row.thickness = 3;
  row.cornerRadius = 0;
  row.background = "rgba(17, 17, 17, 0.78)";
  row.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  row.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  row.left = 18;
  row.top = 112 + index * 60;

  const nameEl = text(label, 15, "#ffffff", FONT_UI);
  nameEl.width = "178px";
  nameEl.height = "28px";
  nameEl.left = 72;
  nameEl.top = -10;
  nameEl.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  nameEl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  row.addControl(nameEl);

  const statusEl = text("loading", 13, "#d8ffd0", FONT_UI);
  statusEl.width = "178px";
  statusEl.height = "22px";
  statusEl.left = 72;
  statusEl.top = 14;
  statusEl.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  statusEl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  row.addControl(statusEl);

  row.updateMetrics = (nextMetrics) => {
    const warning = Boolean(nextMetrics?.warning);
    row.color = warning ? "#ff4b4b" : "#ffffa0";
    statusEl.color = warning ? "#ffb0a8" : "#d8ffd0";
    statusEl.text = nextMetrics
      ? `opaque ${Math.round(nextMetrics.opaqueRatio * 100)}% / black ${Math.round(nextMetrics.nearBlackRatio * 100)}%`
      : "loading";
  };
  row.updateMetrics(metrics);
  ui.texture.addControl(row);
  ui.debugControls.push(row);
  return row;
}

function getDebugLabelMesh(target, options) {
  if (target?.getTotalVertices) return target;
  const scene = target.getScene();
  const anchor = BABYLON.MeshBuilder.CreateBox(`${target.name}-debug-label-anchor`, { size: 0.01 }, scene);
  anchor.visibility = 0;
  anchor.isPickable = false;
  anchor.parent = target;
  anchor.position.set(0, options.anchorY ?? 3.45, 0);
  return anchor;
}

function buildHud(texture, ui) {
  // 收集靶场专属 HUD 控件，供 weaponLab 模式整体隐藏（保留准星+热栏）
  ui.arenaHudControls = [];

  const scoreBoard = pixelPanel("score-board", 174, 72);
  scoreBoard.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  scoreBoard.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  scoreBoard.left = 24;
  scoreBoard.top = -116;
  scoreBoard.addControl(labelStack("Score", ui.scoreEl));
  texture.addControl(scoreBoard);
  ui.arenaHudControls.push(scoreBoard);

  const timeBoard = pixelPanel("time-board", 156, 72);
  timeBoard.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  timeBoard.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  timeBoard.top = 18;
  timeBoard.addControl(labelStack("Time", ui.timeEl));
  texture.addControl(timeBoard);
  ui.arenaHudControls.push(timeBoard);

  ui.baseHealthEl.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  ui.baseHealthEl.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  ui.baseHealthEl.left = 28;
  ui.baseHealthEl.top = -210;
  ui.baseHealthEl.width = "220px";
  ui.baseHealthEl.height = "36px";
  texture.addControl(ui.baseHealthEl);
  ui.arenaHudControls.push(ui.baseHealthEl);

  const comboWrap = new GUI.StackPanel("combo-wrap");
  comboWrap.width = "430px";
  comboWrap.height = "82px";
  comboWrap.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  comboWrap.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  comboWrap.top = -88;
  ui.comboTimerEl.height = "24px";
  ui.comboEl.height = "32px";
  comboWrap.addControl(ui.comboTimerEl);
  comboWrap.addControl(ui.comboEl);

  const xpBack = pixelPanel("xp-back", 430, 18);
  xpBack.thickness = 2;
  xpBack.background = "#1d3019";
  ui.comboFillEl.height = "10px";
  ui.comboFillEl.width = "0%";
  ui.comboFillEl.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  ui.comboFillEl.background = "#72e857";
  ui.comboFillEl.thickness = 0;
  xpBack.addControl(ui.comboFillEl);
  comboWrap.addControl(xpBack);
  texture.addControl(comboWrap);
  ui.arenaHudControls.push(comboWrap);

  buildHotbar(texture, ui);

  ui.countdownEl.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  ui.countdownEl.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  texture.addControl(ui.countdownEl);

  ui.comboPopEl.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  ui.comboPopEl.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  ui.comboPopEl.top = -120;
  ui.comboPopEl.width = "360px";
  ui.comboPopEl.height = "80px";
  texture.addControl(ui.comboPopEl);
}

function buildHotbar(texture, ui) {
  const wrap = new GUI.Rectangle("hotbar-wrap");
  wrap.width = "540px";
  wrap.height = "112px";
  wrap.thickness = 0;
  wrap.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  wrap.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  wrap.top = -8;

  const weaponInfo = new GUI.StackPanel("weapon-info");
  weaponInfo.width = "250px";
  weaponInfo.height = "44px";
  weaponInfo.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  weaponInfo.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  weaponInfo.left = -6;
  weaponInfo.top = 0;
  ui.weaponNameEl.height = "20px";
  ui.weaponNameEl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  ui.weaponAmmoEl.height = "24px";
  ui.weaponAmmoEl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  weaponInfo.addControl(ui.weaponNameEl);
  weaponInfo.addControl(ui.weaponAmmoEl);
  wrap.addControl(weaponInfo);

  const background = new GUI.Image("inventory-hotbar", ASSET_PATHS.inventory);
  background.stretch = GUI.Image.STRETCH_FILL;
  background.sourceLeft = 7;
  background.sourceTop = 141;
  background.sourceWidth = 162;
  background.sourceHeight = 18;
  background.alpha = 0.92;
  background.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  wrap.addControl(background);

  const hotbar = new GUI.Grid("hotbar");
  hotbar.width = "522px";
  hotbar.height = "58px";
  hotbar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  hotbar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  hotbar.top = -8;
  hotbar.addRowDefinition(1);
  for (let i = 0; i < 9; i += 1) hotbar.addColumnDefinition(1 / 9);
  for (let i = 0; i < 9; i += 1) {
    const slot = pixelPanel(`slot-${i}`, 56, 56);
    const weaponId = WEAPON_ORDER[i];
    slot.metadata = { weaponId };
    slot.thickness = i === 0 ? 4 : 0;
    slot.color = i === 0 ? "#ffffff" : "transparent";
    slot.background = i === 0 ? "rgba(255, 255, 255, 0.08)" : "transparent";
    if (weaponId) {
      const image = new GUI.Image(`slot-icon-${i}`, WEAPON_CONFIG[weaponId].iconPath);
      image.stretch = GUI.Image.STRETCH_UNIFORM;
      image.paddingTop = "8px";
      image.paddingBottom = "8px";
      image.paddingLeft = "8px";
      image.paddingRight = "8px";
      slot.addControl(image);
      ui.weaponSlots.push(slot);
    }
    hotbar.addControl(slot, 0, i);
  }

  const cooldownBack = new GUI.Rectangle("weapon-cooldown-back");
  cooldownBack.width = "52px";
  cooldownBack.height = "6px";
  cooldownBack.left = -232;
  cooldownBack.top = 27;
  cooldownBack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  cooldownBack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  cooldownBack.background = "#162315";
  cooldownBack.color = "#0b120a";
  cooldownBack.thickness = 1;
  ui.weaponCooldownFillEl.height = "4px";
  ui.weaponCooldownFillEl.width = "52px";
  ui.weaponCooldownFillEl.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  ui.weaponCooldownFillEl.background = "#72e857";
  ui.weaponCooldownFillEl.thickness = 0;
  cooldownBack.addControl(ui.weaponCooldownFillEl);

  wrap.addControl(hotbar);
  wrap.addControl(cooldownBack);
  const reloadBack = new GUI.Rectangle("reload-back");
  reloadBack.width = "214px";
  reloadBack.height = "8px";
  reloadBack.left = 154;
  reloadBack.top = -35;
  reloadBack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  reloadBack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  reloadBack.background = "#162315";
  reloadBack.color = "#0b120a";
  reloadBack.thickness = 1;
  ui.reloadFillEl.height = "6px";
  ui.reloadFillEl.width = "0px";
  ui.reloadFillEl.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  ui.reloadFillEl.background = "#72e857";
  ui.reloadFillEl.thickness = 0;
  reloadBack.addControl(ui.reloadFillEl);
  wrap.addControl(reloadBack);
  texture.addControl(wrap);
}

function buildCrosshair(texture, ui) {
  // 像素准星：用 GUI.Image 加载当前武器的 crosshair 贴图，取代旧的横+竖+中心点 Rectangle。
  // setCrosshairForWeapon 在武器切换时切换 source；setCrosshair 在命中时用 color 染色。
  const crosshair = new GUI.Image("crosshair", ASSET_PATHS.crosshair.dot);
  crosshair.width = "32px";
  crosshair.height = "32px";
  crosshair.stretch = GUI.Image.STRETCH_UNIFORM;
  crosshair.color = "#ffffff";
  texture.addControl(crosshair);
  ui.crosshairImage = crosshair;
  ui.crosshairControls = [crosshair];

  const hitMarker = new GUI.Image("hit-marker", ASSET_PATHS.tacHitMarker);
  hitMarker.width = "34px";
  hitMarker.height = "34px";
  hitMarker.alpha = 0.95;
  hitMarker.isVisible = false;
  texture.addControl(hitMarker);
  ui.hitMarkerEl = hitMarker;
  ui.hitMarkerTimer = 0;
}

// AWP 开镜瞄准镜蒙版：外圈半透明黑色遮罩 + 中心 circle.png 镜框 + 红色十字线
// 开镜时 main.js 设 ui.scopeOverlay.isVisible = true，关镜时 false
function buildScopeOverlay(texture, ui) {
  const overlay = new GUI.Container("scope-overlay");
  overlay.isVisible = false;
  overlay.width = "100%";
  overlay.height = "100%";

  // 外圈半透明黑色遮罩，让视野外缘变暗
  const dim = new GUI.Rectangle("scope-dim");
  dim.width = "100%";
  dim.height = "100%";
  dim.thickness = 0;
  dim.background = "rgba(0, 0, 0, 0.55)";
  overlay.addControl(dim);

  // 中心圆形镜框：circle.png 放大到 500px，保持像素风
  const scope = new GUI.Image("scope-circle", ASSET_PATHS.crosshair.circle);
  scope.width = "500px";
  scope.height = "500px";
  scope.stretch = GUI.Image.STRETCH_UNIFORM;
  scope.color = "#1a1a1a";
  overlay.addControl(scope);

  // 红色十字线（狙击镜准星）
  const hLine = new GUI.Rectangle("scope-h-line");
  hLine.width = "2px";
  hLine.height = "500px";
  hLine.thickness = 0;
  hLine.background = "#ff3333";
  hLine.alpha = 0.5;
  overlay.addControl(hLine);

  const vLine = new GUI.Rectangle("scope-v-line");
  vLine.width = "500px";
  vLine.height = "2px";
  vLine.thickness = 0;
  vLine.background = "#ff3333";
  vLine.alpha = 0.5;
  overlay.addControl(vLine);

  texture.addControl(overlay);
  ui.scopeOverlay = overlay;
}

function buildTip(texture, ui, weaponLabMode = false) {
  const tip = pixelPanel("tip", weaponLabMode ? 720 : 500, 38);
  tip.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  tip.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  tip.top = -170;
  // weaponLab 模式显示专属操作提示（含 Tab 锁定相机、T 清弹孔、G 放死靶、H 清死靶、B 敌人模式），且不加入 arenaHudControls
  const tipText = weaponLabMode
    ? "WASD 移动  Shift 跑步  空格跳跃  Tab 锁定相机  鼠标射击  R 换弹  1-5 切枪  T 清弹孔  G 放死靶  H 清死靶  B 敌人模式  V 动靶模式"
    : "W A S D 移动   空格跳跃   鼠标射击   R 换弹   1-5 切枪";
  const label = text(tipText, 16, "#f8f8f8");
  tip.addControl(label);
  texture.addControl(tip);
  if (!weaponLabMode) ui.arenaHudControls.push(tip);
}

function buildStartPanel(onStart) {
  const panel = pixelPanel("start-panel", 590, 330);
  panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  const stack = new GUI.StackPanel("start-stack");
  stack.paddingTop = "24px";
  stack.paddingLeft = "28px";
  stack.paddingRight = "28px";
  panel.addControl(stack);

  const brand = text("Babylon.js 像素守卫战", 18, "#ffffff");
  brand.height = "32px";
  stack.addControl(brand);
  const title = text("我的方块靶场", 58, "#ffffa0", FONT_TITLE);
  title.height = "82px";
  stack.addControl(title);
  const copy = text("守住训练场，击退靠近的方块怪物", 22, "#f5f1db");
  copy.height = "46px";
  stack.addControl(copy);
  const button = pixelButton("进入靶场", onStart);
  stack.addControl(button);
  return panel;
}

function buildResultPanel(onRestart) {
  const panel = pixelPanel("result-panel", 600, 420);
  panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  const stack = new GUI.StackPanel("result-stack");
  stack.paddingTop = "18px";
  stack.paddingLeft = "28px";
  stack.paddingRight = "28px";
  panel.addControl(stack);

  const resultBadge = text("S", 60, "#ffffa0", FONT_TITLE);
  resultBadge.height = "74px";
  const resultTitle = text("守卫成功", 42, "#ffffff", FONT_TITLE);
  resultTitle.height = "56px";
  const resultCopy = text("", 18, "#f5f1db");
  resultCopy.height = "46px";
  stack.addControl(resultBadge);
  stack.addControl(resultTitle);
  stack.addControl(resultCopy);

  const stats = new GUI.Grid("result-stats");
  stats.height = "120px";
  stats.addRowDefinition(1);
  stats.addColumnDefinition(0.25);
  stats.addColumnDefinition(0.25);
  stats.addColumnDefinition(0.25);
  stats.addColumnDefinition(0.25);
  ["最终分数", "命中目标", "最高连击", "基地生命"].forEach((label, index) => {
    const value = text("0", 28, "#ffffa0", FONT_TITLE);
    const cell = labelStack(label, value);
    stats.addControl(cell, 0, index);
    if (index === 0) panel.resultScore = value;
    if (index === 1) panel.resultHits = value;
    if (index === 2) panel.resultCombo = value;
    if (index === 3) panel.resultBase = value;
  });
  stack.addControl(stats);
  stack.addControl(pixelButton("再守一局", onRestart));

  panel.resultBadge = resultBadge;
  panel.resultTitle = resultTitle;
  panel.resultCopy = resultCopy;
  return panel;
}

function pixelButton(label, onClick) {
  const button = GUI.Button.CreateSimpleButton(`${label}-button`, label);
  button.width = "210px";
  button.height = "56px";
  button.color = "#ffffff";
  button.background = "#2f8f38";
  button.thickness = 4;
  button.cornerRadius = 0;
  button.fontFamily = FONT_TITLE;
  button.fontSize = 24;
  button.shadowColor = "#111111";
  button.shadowOffsetY = 4;
  button.onPointerClickObservable.add(onClick);
  return button;
}

function labelStack(label, value) {
  const stack = new GUI.StackPanel(`${label}-stack`);
  const small = text(label, 15, "#d5d5d5");
  small.height = "24px";
  value.height = "38px";
  stack.addControl(small);
  stack.addControl(value);
  return stack;
}

function pixelPanel(name, width, height) {
  const rect = new GUI.Rectangle(name);
  rect.width = `${width}px`;
  rect.height = `${height}px`;
  rect.cornerRadius = 0;
  rect.thickness = 4;
  rect.color = "#151515";
  rect.background = "#5a5a5a";
  rect.shadowColor = "rgba(0, 0, 0, 0.45)";
  rect.shadowOffsetY = 7;
  return rect;
}

function text(value, size, color, fontFamily = FONT_UI) {
  const block = new GUI.TextBlock();
  block.text = value;
  block.color = color;
  block.fontSize = size;
  block.fontFamily = fontFamily;
  block.textWrapping = true;
  block.resizeToFit = false;
  return block;
}
