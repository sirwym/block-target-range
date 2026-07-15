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
    // 换弹进度填充：放在 reloadbar 容器内，用动态 width 表示进度
    reloadFillEl: new GUI.Image("reload-fill", ASSET_PATHS.gui.reloadbar),
    weaponNameEl: text("M4", 18, "#ffffff", FONT_TITLE),
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
  buildInventoryPanel(texture, ui);

  ui.resultPanel.isVisible = false;
  ui.countdownEl.isVisible = false;
  ui.comboPopEl.isVisible = false;
  ui.inventoryOverlay.isVisible = false;
  setCrosshair(ui, "normal", true);
  return ui;
}

export function updateHud(ui, state) {
  ui.scoreEl.text = String(state.score);
  ui.comboEl.text = `x${state.combo}`;
  ui.comboTimerEl.text = state.combo >= 3 ? `COMBO x${state.combo}` : "经验充能";
  ui.timeEl.text = `${Math.ceil(state.timeLeft)}s`;
  ui.baseHealthEl.text = "♥".repeat(state.baseHealth) + "♡".repeat(GAME_CONFIG.baseHealth - state.baseHealth);
  const weapon = state.weapons ? getCurrentWeapon(state.weapons, WEAPON_CONFIG) : WEAPON_CONFIG.m4;
  const ammo = state.weapons?.ammo?.[weapon.id] ?? weapon.magazineSize;
  ui.weaponNameEl.text = weapon.label;
  ui.weaponAmmoEl.text = state.weapons?.reloading
    ? `换弹 ${Math.round(getReloadProgress(state.weapons) * 100)}%`
    : `${ammo} / ${weapon.magazineSize}`;
  const weaponReady = 1 - Math.min(1, (state.weapons?.fireTimer ?? 0) / weapon.fireInterval);
  ui.weaponCooldownFillEl.width = `${Math.round(34 * weaponReady)}px`;
  ui.weaponCooldownFillEl.background = weaponReady >= 1 ? "#72e857" : "#ffe36a";
  // 换弹进度宽度对齐 reloadBack 总宽 200px（三层布局后居中换弹条）
  ui.reloadFillEl.width = `${Math.round(200 * getReloadProgress(state.weapons ?? {}))}px`;
  // 开火模式图标切换：auto 武器显示 firemode_auto，半自动显示 firemode_semi
  if (ui.firemodeIcon) {
    ui.firemodeIcon.source = weapon.automatic ? ASSET_PATHS.gui.firemodeAuto : ASSET_PATHS.gui.firemodeSemi;
  }
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
  // 三层布局：顶部信息行（武器名+弹药+开火模式） / 换弹条 / 9 格热栏
  // 避免换弹条横穿热栏格子和武器信息重叠
  const wrap = new GUI.Rectangle("hotbar-wrap");
  wrap.width = "360px";
  wrap.height = "96px";
  wrap.thickness = 0;
  wrap.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  wrap.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  wrap.top = -8;

  // 顶部信息行：武器名 + 弹药，水平排列居中
  const weaponInfo = new GUI.StackPanel("weapon-info");
  weaponInfo.isHorizontal = true;
  weaponInfo.width = "280px";
  weaponInfo.height = "22px";
  weaponInfo.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  weaponInfo.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  weaponInfo.top = "2px";
  ui.weaponNameEl.height = "18px";
  ui.weaponNameEl.fontSize = 15;
  ui.weaponNameEl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  ui.weaponAmmoEl.height = "18px";
  ui.weaponAmmoEl.fontSize = 16;
  ui.weaponAmmoEl.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  weaponInfo.addControl(ui.weaponNameEl);
  weaponInfo.addControl(ui.weaponAmmoEl);
  wrap.addControl(weaponInfo);

  // 开火模式图标：放在信息行右侧
  const firemodeIcon = new GUI.Image("firemode-icon", ASSET_PATHS.gui.firemodeAuto);
  firemodeIcon.width = "14px";
  firemodeIcon.height = "14px";
  firemodeIcon.left = "130px";
  firemodeIcon.top = "4px";
  firemodeIcon.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  firemodeIcon.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  firemodeIcon.stretch = GUI.Image.STRETCH_FILL;
  firemodeIcon.alpha = 0.92;
  wrap.addControl(firemodeIcon);
  ui.firemodeIcon = firemodeIcon;

  // 换弹条：顶部信息行下方居中，不横穿热栏格子
  const reloadBack = new GUI.Container("reload-back");
  reloadBack.width = "200px";
  reloadBack.height = "6px";
  reloadBack.left = "0px";
  reloadBack.top = "28px";
  reloadBack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  reloadBack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  reloadBack.alpha = 0.92;
  reloadBack.clipChildren = true;

  const reloadBg = new GUI.Image("reload-bg", ASSET_PATHS.gui.reloadbar);
  reloadBg.width = "200px";
  reloadBg.height = "6px";
  reloadBg.stretch = GUI.Image.STRETCH_FILL;
  reloadBack.addControl(reloadBg);

  ui.reloadFillEl.height = "4px";
  ui.reloadFillEl.width = "0px";
  ui.reloadFillEl.left = 0;
  ui.reloadFillEl.top = 0;
  ui.reloadFillEl.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  ui.reloadFillEl.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  ui.reloadFillEl.stretch = GUI.Image.STRETCH_FILL;
  reloadBack.addControl(ui.reloadFillEl);

  const reloadBorder = new GUI.Rectangle("reload-border");
  reloadBorder.width = "200px";
  reloadBorder.height = "6px";
  reloadBorder.color = "#0b120a";
  reloadBorder.thickness = 1;
  reloadBorder.background = "transparent";
  reloadBack.addControl(reloadBorder);
  wrap.addControl(reloadBack);

  // 武器冷却条：放在换弹条左侧，不与换弹条重叠
  const cooldownBack = new GUI.Rectangle("weapon-cooldown-back");
  cooldownBack.width = "34px";
  cooldownBack.height = "4px";
  cooldownBack.left = "-120px";
  cooldownBack.top = "29px";
  cooldownBack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  cooldownBack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  cooldownBack.background = "#162315";
  cooldownBack.color = "#0b120a";
  cooldownBack.thickness = 1;
  ui.weaponCooldownFillEl.height = "2px";
  ui.weaponCooldownFillEl.width = "34px";
  ui.weaponCooldownFillEl.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  ui.weaponCooldownFillEl.background = "#72e857";
  ui.weaponCooldownFillEl.thickness = 0;
  cooldownBack.addControl(ui.weaponCooldownFillEl);
  wrap.addControl(cooldownBack);

  // 热栏底纹（inventory.png 热栏槽位区域）
  const background = new GUI.Image("inventory-hotbar", ASSET_PATHS.inventory);
  background.stretch = GUI.Image.STRETCH_FILL;
  background.sourceLeft = 7;
  background.sourceTop = 141;
  background.sourceWidth = 162;
  background.sourceHeight = 18;
  background.alpha = 0.92;
  background.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  background.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  wrap.addControl(background);

  // 9 格热栏
  const hotbar = new GUI.Grid("hotbar");
  hotbar.width = "342px";
  hotbar.height = "38px";
  hotbar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  hotbar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  hotbar.top = -8;
  hotbar.addRowDefinition(1);
  for (let i = 0; i < 9; i += 1) hotbar.addColumnDefinition(1 / 9);
  for (let i = 0; i < 9; i += 1) {
    const slot = pixelPanel(`slot-${i}`, 36, 36);
    const weaponId = WEAPON_ORDER[i];
    slot.metadata = { weaponId };
    slot.thickness = i === 0 ? 3 : 0;
    slot.color = i === 0 ? "#ffffff" : "transparent";
    slot.background = i === 0 ? "rgba(255, 255, 255, 0.08)" : "transparent";
    if (weaponId) {
      const image = new GUI.Image(`slot-icon-${i}`, WEAPON_CONFIG[weaponId].iconPath);
      image.stretch = GUI.Image.STRETCH_UNIFORM;
      image.paddingTop = "4px";
      image.paddingBottom = "4px";
      image.paddingLeft = "4px";
      image.paddingRight = "4px";
      slot.addControl(image);
      ui.weaponSlots.push(slot);
    }
    hotbar.addControl(slot, 0, i);
  }
  wrap.addControl(hotbar);
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

// 2D 瞄准镜蒙版已移除：TaCZ 原生武器模型自带瞄具/镜体结构与分划，
// 不再叠圆圈+红色十字线+黑色外圈遮罩，避免与 3D 镜体视觉冲突。
// 保留空 container 引用以兼容 main.js 中已有的 isVisible null 安全检查。
function buildScopeOverlay(texture, ui) {
  const overlay = new GUI.Container("scope-overlay");
  overlay.isVisible = false;
  overlay.width = "100%";
  overlay.height = "100%";
  texture.addControl(overlay);
  ui.scopeOverlay = overlay;
}

function buildTip(texture, ui, weaponLabMode = false) {
  // 紧凑化提示条：缩小尺寸和字号，避免换行压住画面；文案适配 5 把武器（1-5 切枪）
  const tip = pixelPanel("tip", weaponLabMode ? 520 : 460, 28);
  tip.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  tip.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  // hotbar 高 96px + 14px 间距，tip 底部对齐 top=-110 避免遮挡热栏
  tip.top = -110;
  // weaponLab 模式显示专属操作提示（含 Tab 背包、T 清弹孔、G 放死靶、H 清死靶、B 敌人模式），且不加入 arenaHudControls
  const tipText = weaponLabMode
    ? "WASD 移动  Shift 跑步  Tab 背包  R 换弹  1-9 切枪  T/G/H/B/V 工具"
    : "WASD 移动  空格跳跃  鼠标射击  R 换弹  1-9 切枪  Tab 背包";
  const label = text(tipText, 14, "#f8f8f8");
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

// Tab 人物+背包面板：默认隐藏，按 Tab 切换可见性。
// 布局：中央 880×520px，左侧 steve 预览 + 护甲槽占位，中部武器槽+武器详情，底部统计区。
// 数据由 openInventory 接收 buildInventoryViewData 返回的结构填充，updateInventoryStats 在面板打开期间刷新统计。
function buildInventoryPanel(texture, ui) {
  const overlay = new GUI.Container("inventory-overlay");
  overlay.width = "100%";
  overlay.height = "100%";
  overlay.background = "rgba(0, 0, 0, 0.55)";
  overlay.zIndex = 100;

  // 三列布局面板：左列角色预览+护甲槽 | 中列武器详情+3×3 武器槽 | 右列独立统计区
  // 统计区有独立半透明底，不压在背包格子上
  const panel = new GUI.Rectangle("inventory-panel");
  panel.width = "960px";
  panel.height = "560px";
  panel.cornerRadius = 0;
  panel.thickness = 4;
  panel.color = "#151515";
  panel.background = "rgba(20, 20, 20, 0.92)";
  panel.shadowColor = "rgba(0, 0, 0, 0.6)";
  panel.shadowOffsetY = 10;
  overlay.addControl(panel);

  // 极淡的 inventory.png 底纹（alpha=0.15），保留 Minecraft 像素感但不抢占注意力
  const panelBg = new GUI.Image("inventory-panel-bg", ASSET_PATHS.inventory);
  panelBg.width = "952px";
  panelBg.height = "552px";
  panelBg.stretch = GUI.Image.STRETCH_FILL;
  panelBg.sourceLeft = 0;
  panelBg.sourceTop = 0;
  panelBg.sourceWidth = 176;
  panelBg.sourceHeight = 166;
  panelBg.alpha = 0.15;
  panel.addControl(panelBg);

  // 标题
  const title = text("人物 · 背包", 24, "#ffffa0", FONT_TITLE);
  title.height = "32px";
  title.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  title.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  title.top = "8px";
  panel.addControl(title);

  // 右上角关闭提示
  const escHint = text("Tab / Esc 关闭", 14, "#d5d5d5");
  escHint.width = "180px";
  escHint.height = "24px";
  escHint.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  escHint.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  escHint.left = "-12px";
  escHint.top = "12px";
  escHint.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  panel.addControl(escHint);

  // ── 左列（240px）：角色预览 + 护甲槽 ──
  // steve.png UV [8,8,16,32] 是 Minecraft 标准正面皮肤区域，120×240px 严格 1:2 纵横比完整显示
  const playerPreview = new GUI.Image("inventory-player-preview", "assets/minecraft/entity/player/steve.png");
  playerPreview.width = "120px";
  playerPreview.height = "240px";
  playerPreview.stretch = GUI.Image.STRETCH_UNIFORM;
  playerPreview.sourceLeft = 8;
  playerPreview.sourceTop = 8;
  playerPreview.sourceWidth = 16;
  playerPreview.sourceHeight = 32;
  playerPreview.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  playerPreview.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  playerPreview.left = "60px";
  playerPreview.top = "60px";
  panel.addControl(playerPreview);

  // 护甲槽占位（4 个，项目无护甲系统，仅显示底纹）
  const armorSlots = [];
  for (let i = 0; i < 4; i += 1) {
    const slot = new GUI.Image(`inventory-armor-${i}`, ASSET_PATHS.gui.armorBackdrop);
    slot.width = "28px";
    slot.height = "28px";
    slot.stretch = GUI.Image.STRETCH_UNIFORM;
    slot.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    slot.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    slot.left = `${60 + i * 34}px`;
    slot.top = "320px";
    slot.alpha = 0.7;
    panel.addControl(slot);
    armorSlots.push(slot);
  }

  // ── 中列（360px，left=300）：武器详情 + 3×3 武器槽 ──
  // 武器详情区（武器名 + 5 行参数）
  const weaponDetailStack = new GUI.StackPanel("inventory-weapon-detail");
  weaponDetailStack.width = "320px";
  weaponDetailStack.height = "200px";
  weaponDetailStack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  weaponDetailStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  weaponDetailStack.left = "300px";
  weaponDetailStack.top = "60px";
  const weaponDetailEls = {
    name: text("M4", 22, "#ffffa0", FONT_TITLE),
    magazine: text("弹匣：17", 16, "#ffffff", FONT_UI),
    fireRate: text("射速：6.7/s", 16, "#ffffff", FONT_UI),
    damage: text("伤害：1", 16, "#ffffff", FONT_UI),
    recoil: text("后坐力：0.74", 16, "#ffffff", FONT_UI),
    fireMode: text("模式：半自动", 16, "#ffffff", FONT_UI),
  };
  weaponDetailEls.name.height = "32px";
  weaponDetailEls.magazine.height = "26px";
  weaponDetailEls.fireRate.height = "26px";
  weaponDetailEls.damage.height = "26px";
  weaponDetailEls.recoil.height = "26px";
  weaponDetailEls.fireMode.height = "26px";
  weaponDetailStack.addControl(weaponDetailEls.name);
  weaponDetailStack.addControl(weaponDetailEls.magazine);
  weaponDetailStack.addControl(weaponDetailEls.fireRate);
  weaponDetailStack.addControl(weaponDetailEls.damage);
  weaponDetailStack.addControl(weaponDetailEls.recoil);
  weaponDetailStack.addControl(weaponDetailEls.fireMode);
  panel.addControl(weaponDetailStack);

  // 武器槽 3 列 Grid：动态适配 WEAPON_ORDER.length（当前 5 把），不写死 9
  // 每个 slot 绑定 onPointerClickObservable，通过 ui.onWeaponSlotClick 回调切枪
  const slotCount = WEAPON_ORDER.length;
  const cols = 3;
  const rows = Math.ceil(slotCount / cols);
  const weaponSlotsWrap = new GUI.Grid("inventory-weapon-slots");
  weaponSlotsWrap.width = `${cols * 52}px`;
  weaponSlotsWrap.height = `${rows * 52}px`;
  weaponSlotsWrap.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  weaponSlotsWrap.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  weaponSlotsWrap.left = "300px";
  weaponSlotsWrap.top = "290px";
  for (let r = 0; r < rows; r += 1) weaponSlotsWrap.addRowDefinition(1 / rows);
  for (let c = 0; c < cols; c += 1) weaponSlotsWrap.addColumnDefinition(1 / cols);
  const inventoryWeaponSlots = [];
  for (let i = 0; i < slotCount; i += 1) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const slot = pixelPanel(`inv-slot-${i}`, 44, 44);
    const weaponId = WEAPON_ORDER[i];
    slot.metadata = { weaponId, index: i };
    slot.thickness = i === 0 ? 3 : 0;
    slot.color = i === 0 ? "#ffffff" : "transparent";
    slot.background = i === 0 ? "rgba(255, 255, 255, 0.08)" : "transparent";
    if (weaponId) {
      const image = new GUI.Image(`inv-slot-icon-${i}`, WEAPON_CONFIG[weaponId].iconPath);
      image.stretch = GUI.Image.STRETCH_UNIFORM;
      image.paddingTop = "6px";
      image.paddingBottom = "6px";
      image.paddingLeft = "6px";
      image.paddingRight = "6px";
      slot.addControl(image);
    }
    // 点击切枪：通过 ui.onWeaponSlotClick 回调通知 main.js
    slot.onPointerClickObservable.add(() => {
      if (ui.onWeaponSlotClick) ui.onWeaponSlotClick(i);
    });
    inventoryWeaponSlots.push(slot);
    weaponSlotsWrap.addControl(slot, r, c);
  }
  panel.addControl(weaponSlotsWrap);

  // ── 右列（320px，left=660）：独立统计区，半透明底不压背包格子 ──
  const statsContainer = new GUI.Rectangle("inventory-stats-container");
  statsContainer.width = "280px";
  statsContainer.height = "440px";
  statsContainer.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  statsContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  statsContainer.left = "660px";
  statsContainer.top = "60px";
  statsContainer.thickness = 1;
  statsContainer.color = "rgba(255, 255, 255, 0.15)";
  statsContainer.background = "rgba(0, 0, 0, 0.35)";
  panel.addControl(statsContainer);

  // 统计区内部 StackPanel：3 个区块垂直排列
  const statsStack = new GUI.StackPanel("inventory-stats");
  statsStack.width = "260px";
  statsStack.height = "420px";
  statsStack.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  statsStack.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  statsStack.top = "10px";
  statsContainer.addControl(statsStack);

  // 弹匣层（weaponLab 模式显示，靶场模式隐藏）
  const magSection = new GUI.StackPanel("inventory-mag-section");
  magSection.width = "260px";
  magSection.height = "130px";
  magSection.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  const magTitle = text("弹匣层", 16, "#d5d5d5", FONT_UI);
  magTitle.height = "22px";
  magSection.addControl(magTitle);
  const magLines = [];
  const magLabels = ["射击", "命中", "命中率", "DPS", "射速"];
  for (let i = 0; i < magLabels.length; i += 1) {
    const line = text(`${magLabels[i]}：0`, 14, "#ffffff", FONT_UI);
    line.height = "20px";
    magSection.addControl(line);
    magLines.push(line);
  }
  statsStack.addControl(magSection);

  // 会话层（weaponLab 模式显示，靶场模式隐藏）
  const sessSection = new GUI.StackPanel("inventory-sess-section");
  sessSection.width = "260px";
  sessSection.height = "110px";
  sessSection.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  const sessTitle = text("会话层", 16, "#d5d5d5", FONT_UI);
  sessTitle.height = "22px";
  sessSection.addControl(sessTitle);
  const sessLines = [];
  const sessLabels = ["累计射击", "累计命中", "累计伤害", "会话DPS"];
  for (let i = 0; i < sessLabels.length; i += 1) {
    const line = text(`${sessLabels[i]}：0`, 14, "#ffffff", FONT_UI);
    line.height = "20px";
    sessSection.addControl(line);
    sessLines.push(line);
  }
  statsStack.addControl(sessSection);

  // 当前模式区块（weaponLab 模式显示死靶/敌人/动靶，靶场模式显示得分信息）
  const modeSection = new GUI.StackPanel("inventory-mode-section");
  modeSection.width = "260px";
  modeSection.height = "140px";
  modeSection.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  const modeTitle = text("统计", 16, "#d5d5d5", FONT_UI);
  modeTitle.height = "22px";
  modeSection.addControl(modeTitle);
  const modeLines = [];
  for (let i = 0; i < 4; i += 1) {
    const line = text("", 14, "#ffffff", FONT_UI);
    line.height = "20px";
    modeSection.addControl(line);
    modeLines.push(line);
  }
  statsStack.addControl(modeSection);

  ui.inventoryOverlay = overlay;
  ui.inventoryPanel = panel;
  ui.inventoryWeaponSlots = inventoryWeaponSlots;
  ui.inventoryWeaponDetailEls = weaponDetailEls;
  ui.inventoryStatsEls = {
    magSection,
    magLines,
    sessSection,
    sessLines,
    modeSection,
    modeTitle,
    modeLines,
  };
  ui.inventoryContext = { isWeaponLab: false };
  texture.addControl(overlay);
}

// 刷新武器详情文本（武器名/弹匣/射速/伤害/后坐力/模式）
// 从 openInventory 提取为独立函数，供 updateInventoryPanel 每帧复用
function applyWeaponDetail(ui, w) {
  ui.inventoryWeaponDetailEls.name.text = w.label;
  ui.inventoryWeaponDetailEls.magazine.text = `弹匣：${w.magazineSize}`;
  ui.inventoryWeaponDetailEls.fireRate.text = `射速：${w.fireRate}/s`;
  ui.inventoryWeaponDetailEls.damage.text = `伤害：${w.bodyDamage}`;
  ui.inventoryWeaponDetailEls.recoil.text = `后坐力：${w.recoil}`;
  ui.inventoryWeaponDetailEls.fireMode.text = `模式：${w.fireMode}`;
}

// 刷新面板武器槽选中态：当前武器高亮，其余透明
function applySlotSelection(ui, weaponId) {
  ui.inventoryWeaponSlots.forEach((slot) => {
    const selected = slot.metadata?.weaponId === weaponId;
    slot.thickness = selected ? 3 : 0;
    slot.color = selected ? "#ffffff" : "transparent";
    slot.background = selected ? "rgba(255, 255, 255, 0.08)" : "transparent";
  });
}

// 面板打开期间每帧调用：同步刷新武器详情 + 选中态 + 统计。
// 解决面板打开时按 1-9 切枪后面板内武器名/详情/选中框不同步的问题。
export function updateInventoryPanel(ui, viewData) {
  if (!ui.inventoryOverlay?.isVisible) return;
  applyWeaponDetail(ui, viewData.currentWeapon);
  applySlotSelection(ui, viewData.currentWeapon.id);
  ui.inventoryContext = { ...ui.inventoryContext, currentWeaponId: viewData.currentWeapon.id };
  updateInventoryStats(ui, viewData);
}

// 把 buildInventoryViewData 返回的数据填到面板控件上，并显示面板。
// viewData: buildInventoryViewData(state, weaponLab, enemyState) 的返回值
// isWeaponLab: 是否为 weaponLab 模式（决定统计区块显示哪些层）
export function openInventory(ui, viewData, isWeaponLab) {
  if (!ui.inventoryOverlay) return;
  ui.inventoryContext = { isWeaponLab: Boolean(isWeaponLab), currentWeaponId: viewData.currentWeapon.id };
  updateInventoryPanel(ui, viewData);
  ui.inventoryOverlay.isVisible = true;
}

export function closeInventory(ui) {
  if (!ui.inventoryOverlay) return;
  ui.inventoryOverlay.isVisible = false;
}

export function isInventoryOpen(ui) {
  return Boolean(ui.inventoryOverlay?.isVisible);
}

// 在面板打开期间每帧调用：根据 viewData 刷新统计区块文本。
// weaponLab 模式：弹匣层 + 会话层 + 当前模式区块（死靶/敌人/动靶）
// 靶场模式：弹匣层和会话层隐藏，当前模式区块显示得分信息
export function updateInventoryStats(ui, viewData) {
  if (!ui.inventoryStatsEls) return;
  const { magSection, magLines, sessSection, sessLines, modeSection, modeTitle, modeLines } = ui.inventoryStatsEls;
  const isWeaponLab = ui.inventoryContext?.isWeaponLab;
  if (isWeaponLab && viewData.stats) {
    magSection.isVisible = true;
    sessSection.isVisible = true;
    const magLabels = ["射击", "命中", "命中率", "DPS", "射速"];
    const magValues = [
      viewData.stats.magazine.shots,
      viewData.stats.magazine.hits,
      `${viewData.stats.magazine.hitRate}%`,
      viewData.stats.magazine.dps,
      viewData.stats.magazine.fireRate,
    ];
    magLines.forEach((line, i) => { line.text = `${magLabels[i]}：${magValues[i]}`; });
    const sessLabels = ["累计射击", "累计命中", "累计伤害", "会话DPS"];
    const sessValues = [
      viewData.stats.session.shots,
      viewData.stats.session.hits,
      viewData.stats.session.damage,
      viewData.stats.session.dps,
    ];
    sessLines.forEach((line, i) => { line.text = `${sessLabels[i]}：${sessValues[i]}`; });
    // 当前模式区块：enemy 显示敌人信息，moving 显示动靶信息，其他显示死靶信息
    const mode = viewData.stats.mode;
    if (mode === "enemy") {
      modeTitle.text = "敌人";
      const es = viewData.stats.enemyState;
      const timeText = es?.result === "victory" ? "存活！"
        : es?.result === "defeat" ? "阵亡！"
        : `${Math.ceil(es?.timeLeft ?? 0)}s`;
      const labels = ["时间", "生命", "击杀", "爆头率"];
      const values = [timeText, `${es?.hp ?? 0}/${es?.playerMaxHP ?? 5}`, viewData.stats.enemy.kills, `${viewData.stats.enemy.headshotRate}%`];
      modeLines.forEach((line, i) => { line.text = `${labels[i]}：${values[i]}`; });
    } else if (mode === "moving") {
      modeTitle.text = "动靶";
      const labels = ["动靶数", "爆头", "身体", "爆头率"];
      const values = [viewData.stats.displayCount, viewData.stats.moving.headshots, viewData.stats.moving.bodyshots, `${viewData.stats.moving.headshotRate}%`];
      modeLines.forEach((line, i) => { line.text = `${labels[i]}：${values[i]}`; });
    } else {
      modeTitle.text = "死靶";
      const labels = ["死靶数", "爆头", "身体", "爆头率"];
      const values = [viewData.stats.displayCount, viewData.stats.dummy.headshots, viewData.stats.dummy.bodyshots, `${viewData.stats.dummy.headshotRate}%`];
      modeLines.forEach((line, i) => { line.text = `${labels[i]}：${values[i]}`; });
    }
  } else {
    // 靶场模式：隐藏弹匣层和会话层，模式区块显示得分信息
    magSection.isVisible = false;
    sessSection.isVisible = false;
    modeTitle.text = "本轮战况";
    if (viewData.rangeState) {
      const r = viewData.rangeState;
      const labels = ["分数", "命中", "连击", "时间"];
      const values = [r.score, r.hits, `x${r.combo}`, `${r.timeLeft}s`];
      modeLines.forEach((line, i) => { line.text = `${labels[i]}：${values[i]}`; });
    }
  }
}
