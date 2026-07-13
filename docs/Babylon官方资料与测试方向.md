# Babylon 官方资料与测试方向

本文记录《我的方块靶场》当前需要关注的 Babylon.js 官方能力、后续可能需要的能力，以及排查问题时的资料查找顺序。目的是让后续调试不要只靠猜测，而是先回到项目真实模块和官方资料。

最后整理日期：2026-07-13。

## 项目现状

当前项目已经是 Babylon.js 项目，不需要重新选择 3D 引擎。

- 运行框架：Vite。
- 核心依赖：`@babylonjs/core`、`@babylonjs/gui`、`@babylonjs/loaders`。
- 主要源码入口：`src/world.js`、`src/effects.js`、`src/ui.js`、`src/assets.js`、`src/weaponModel.js`、`src/combat.js`。
- 自动测试入口：`test/` 下的 Node test。

因此 Babylon 官方资料的作用不是替代现有玩法代码，而是帮助我们更稳定地处理视觉资产、粒子特效、GUI、模型加载和浏览器验收。

## 现在需要重点关注

### MCP Servers

官方文档：<https://doc.babylonjs.com/toolsAndResources/mcpServers>

用途：让 MCP 兼容的 AI 客户端连接 Babylon 官方编辑器，用于创建、编辑、验证、导入、导出和实时同步编辑器图。

当前优先接入：

- `nme`：Node Material Editor，用于材质图。
- `npe`：Node Particle Editor，用于粒子图。

可暂缓接入：

- `gui`：GUI Editor，等需要重做开始页、结算页或 HUD 布局时再接。

不建议把 MCP 当成玩法逻辑框架。武器、波次、命中、碰撞、评分等规则继续保留在源码和自动测试里。

### Node Particle Editor 与 Particle System

官方文档：

- <https://doc.babylonjs.com/toolsAndResources/npe>
- <https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system>

适合本项目的方向：

- 枪口火焰。
- 命中火花。
- 暴击反馈。
- 爆炸或范围伤害提示。
- 方块击碎碎屑。
- 基地水晶受击或濒危效果。

测试重点：

- 粒子能正常加载和启动。
- 发射位置能跟随枪口、命中点或基地节点。
- 一次性特效能在结束后停止或释放，避免越打越卡。
- 粒子数量、生命周期、发射率不会导致帧率明显下降。
- 视觉失败不能中断扣血、扣弹、计分和主循环。

当前 `src/effects.js` 已经有手写 mesh 粒子和飘字。引入 NPE 资产时要小步替换，优先从一个独立效果开始，例如枪口火焰或命中火花。

### Node Material Editor

官方文档：<https://doc.babylonjs.com/toolsAndResources/nme>

适合本项目的方向：

- 基地水晶发光材质。
- 岩浆、灯块、能量跑道。
- 护盾、受击闪光、危险提示。
- 特殊敌人或 Boss 的可识别材质。
- 武器发光部件或枪口能量效果。

测试重点：

- 材质图能正常加载，不出现黑材质或透明异常。
- 发光、透明、混合模式不会遮挡准星和 HUD。
- 材质失败时有普通材质 fallback。
- 不要为了一个材质引入过重的渲染管线。

当前 `src/assets.js` 已经集中处理贴图和材质。新增 NME 材质时，优先在 `assets.js` 建立小型加载/回退入口，再由 `world.js` 或具体模块引用。

### glTF / GLB Loader

官方文档：<https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF>

适合本项目的方向：

- P90 第一人称模型。
- 后续枪械模型。
- 训练靶、特殊道具、基地装饰。
- 未来可能加入的敌人 GLB 模型。

测试重点：

- `@babylonjs/loaders` 依赖存在且构建可用。
- 模型路径、贴图路径和大小写正确。
- 模型加载失败时回退 2D 图标或简化 mesh。
- 模型坐标、缩放、朝向不会遮挡准星。
- Network 中模型和贴图不会重复请求。

当前 `src/weaponModel.js` 和资源测试已经覆盖部分模型链路。新增模型时必须同步检查 `src/config.js`、`public/assets/` 和资源存在性测试。

### Babylon GUI

官方文档：<https://doc.babylonjs.com/toolsAndResources/guiEditor>

适合本项目的方向：

- 开始界面视觉稿。
- 结算面板视觉稿。
- 武器栏、得分、倒计时、基地血量的布局验证。
- 教学提示或调试面板。

测试重点：

- HUD 不遮挡准星、武器和敌人。
- 移动端或窄屏下文字不溢出。
- GUI 控件尺寸稳定，不随数值变化跳动。
- 结算、重开、倒计时和开始按钮状态正确。

当前 `src/ui.js` 已经手写 GUI，短期不建议整体改成 GUI Editor JSON。GUI Editor 更适合做新面板原型，或在界面复杂后再局部导入。

### Decal 贴花

官方 API：`BABYLON.MeshBuilder.CreateDecal(name, sourceMesh, { position, normal, size, angle })`。

适合本项目的方向：

- 武器试验场弹孔记录。
- 墙面命中标记。
- 连续射击的后坐力轨迹可视化。

已落地实现（`src/effects.js` `createBulletHoleDecal`）：

- `position`：射线命中点世界坐标。
- `normal`：`pickResult.getNormal(true)`，贴花贴合墙面法线。
- `size`：`new BABYLON.Vector3(0.18, 0.18, 0.18)`，世界单位。
- `angle`：每次随机旋转，避免弹孔看起来一样。
- `material.zOffset = -2`：防 z-fighting，让弹孔贴在墙面之上。
- `renderingGroupId = 2`：弹孔在墙之上渲染。
- 弹孔贴图用 `DynamicTexture` 程序生成（64×64 黑色焦痕 + 放射裂纹），无外部 PNG 资源依赖。
- 累积上限 200 个，超出滚动清除最早的，防性能崩。

注意事项：

- Decal 的 sourceMesh 必须有足够面数；`makeBlock`（CreateBox）的平面墙贴合无问题。
- 若 Decal 穿透或错位，优先调小 `bulletHole.size` 或检查 `normal` 方向。
- `useAlphaFromDiffuseTexture = true` 让弹孔边缘自然过渡。
- 大量 Decal 可能影响性能；若卡顿可降上限到 100 或改用 `thinInstance` 合并。

### TaCZ 枪械模型建造规范（外部 Wiki）

官方 Wiki：<https://tacwiki.mcma.club/zh/>

TaCZ 模组（v1.1.4）的模型建造指南和枪包制作指南。本项目 4 把 V2 新武器（deagle_golden/rpg7/m107/m95）走 Bedrock geo renderer 路径（`src/taczGeoModel.js`），调试模型朝向、骨骼、比例时优先查这里，再回查 Babylon 文档。

Wiki 三大入口：

- [枪包制作指南](https://tacwiki.mcma.club/zh/gunpack/01_before_start)：文件结构、命名空间规则、资源放置约定。
- [模型建造指南](https://tacwiki.mcma.club/zh/model_guide/)：Blockbench 建模规范、骨骼命名、比例标准、贴图上色。
- [从旧版本迁移](https://tacwiki.mcma.club/zh/gunpack/-2_convert_from_legacy)：V1→V2 格式变化，维护转换脚本时参考。

#### 关键规范（校准 V2 新武器时直接对照）

- **比例标准**：1000mm = 48 grid。换算公式 `x = 48 * L / 1000`，L 为枪械实际总长（mm）。项目 `PIXEL_TO_UNIT = 1/16` 是 Bedrock 像素 → Babylon 单位，与该比例配合使用可校准 `modelConfig.scaling`。
- **枪管朝向**：必须为 N↑ 方向（-Z）。项目 `taczGeoModel.js` 的 `cubeFaceVertices` 已对齐（north=-Z）。若 V2 模型在 Babylon 中枪口朝向异常，先核对 `modelConfig.rotation` 是否需要补偿。
- **对称性**：模型必须关于 Z-Y 平面对称，锚定立方体位于中轴 N↑。验收 V2 新武器时，若发现模型左右不对称或散架，优先排查 `createTaczGeoModel` 的 bone/cube bind-pose 差值计算（`bone local = bone.pivot - parent.pivot`，`cube local = cubeCenter/cubePivot - bone.pivot`），不要回退到 `setAbsolutePosition` 或 world matrix inverse 反算 local；再排查旋转顺序（TaCZ mod 实测使用 ZXY 顺序 `qY.multiply(qX).multiply(qZ)`，v10 曾尝试 Microsoft 官方文档的 XYZ 顺序但导致 m95 散架，已回退为 ZXY）、cube.pivot fallback（v9 起缺 pivot 时 fallback 到 cube 自身中心 `origin+size/2`，而非 bone.pivot）。当前 `createTaczGeoModel` 返回 `debugGeometry`，其中 `rawOutliers` 是可见性规则前的模型距离诊断，`visibleOutliers`/兼容字段 `outliers` 是最终可见 cube 诊断，浏览器 `snapshot()` 还会补充 `screenOutliers`。排查天空碎片或贴脸巨大碎片时优先看 `visibleOutliers` + `screenOutliers`，不要再把“离模型中心最远”的 raw 结果直接当作可隐藏碎片。Phase2 屏幕诊断 v2 会给每个屏幕碎片标记 `hideAllowed` 与 `projectionUnreliable`：如果 AABB 角点穿过相机近裁面，`areaPx` 可能被 Babylon 投影放大，必须先核对 `projectionUnreliable=false` 后才把它当作真实视觉面积。2026-07-13 的 Phase2 `info` 显示，`m4/ak47/m95/m107` 主结构 outlier 多数 `projectionUnreliable=false`，但 `minCameraZ`/`cameraSpaceCenter.z` 贴近 `camera.minZ=0.1`，应优先排查纯静态 first-person pose，使用 `PHASE2_STATIC_POSE_CALIBRATION` 和 `searchPhase2StaticPose()` 调整静态姿态，不要继续扩大主结构隐藏表。
- **骨骼命名规则**：TaCZ 程序自动识别骨骼名称。项目已知 bone 别名问题：
  - deagle_golden：inspect 动画用 `Deagle`，geo 中是 `Deagle_golden` → 代码层别名映射。
  - m107：shoot 动画误用 `m95_barrel`，geo 中实际是 `gun_barrel` → 代码层别名映射。
  - m95：geo 中有拼写错误 `magzine`（应为 `magazine`）。
  - 排查动画错位时，先回 Wiki 核对官方骨骼命名表，确认是 V2 资源本身 bug 还是别名映射错误。
- **标准部件尺寸**：导轨底部宽度 0.75 grid，握把宽度 1.5-2 grid。视觉验收时可作为比例尺，发现模型缩放失真时对照排查。
- **两脚架骨骼旋转轴**：m107/m95 有 bipod bone，动画轴需要单独处理。Wiki 提供两脚架建模规范（先创建无旋转的脚架模型，再调整骨骼枢轴到旋转轴位置）。
- **面剔除优化**：Wiki 推荐 Blockbench 的 Optimize 插件做面剔除。m107 有 189 个 bone，面数最高，可考虑对 V2 模型做面剔除减少 Babylon 渲染压力（性能优化方向，非阻塞）。

#### 资源链路对照（验证 `taczWeaponLoader.js` 映射规则）

| Wiki 标准路径 | 项目 public/ 路径 | 状态 |
|---|---|---|
| `assets/tacz/geo_models/gun/{weapon}_geo.json` | 同名映射 | ✅ 一致 |
| `assets/tacz/textures/gun/uv/{weapon}` | `assets/tac/textures/{weapon}/{weapon}.png` | ⚠️ 项目历史放到 `tac/` 目录，与 Wiki 规范不符（不重命名，风险大） |
| `assets/tacz/animations/{weapon}.animation.json` | 同名映射 | ✅ 一致 |
| `assets/tacz/player_animator/{type}_default.player_animation.json` | 同名映射 | ✅ 一致 |
| `assets/tacz/tacz_sounds/{weapon}/` | 项目用 `assets/tacz/sounds/` | ⚠️ 目录名简化 |
| `assets/tacz/display/guns/{weapon}_display.json` | 同名映射 | ✅ 一致 |

#### 不搬入项目的内容

Wiki 的以下内容与项目当前玩法无关，不要复制到 `public/assets/`：

- `scripts/` 客户端 lua 状态机（项目用 JS 实现武器状态机）。
- `data/recipes/` 合成配方（靶场不需要合成）。
- `lang/` 语言文件（项目自实现 i18n）。
- `data/data/attachments/`、`ammo/`、`blocks/` 配件、弹药、合成台（项目目前只做枪械）。

#### 第一人称 marker 后处理（TaCZ `idle_view` / `iron_view` → `WEAPON_MARKER_CALIBRATION`）

TaCZ Bedrock geo 模型自带 4 个第一人称定位 marker bone：`idle_view`（腰射相机位置）、`iron_view`（开镜相机位置）、`lefthand_pos`、`righthand_pos`。`src/taczFirstPersonMarkers.js` 会从 geo bone 世界矩阵反算到 `rig.modelRoot` 本地坐标，作为 `rig.calibration.hipPose.position` 和 `adsPose.position` 的基础值。

**注意：marker position 不能直接拿来用，必须经过 `WEAPON_MARKER_CALIBRATION` 后处理**。原因：

- Bedrock geo 坐标系下 marker position 范围在 0-1.3 之间（枪身局部像素 / 16），与旧 `WEAPON_CALIBRATION` 使用的世界单位语义不同。直接赋给 `weaponRoot.position` 会让武器几乎贴在相机原点，投影过大且偏顶部。
- 不同枪型的 marker 在 geo 中的相对位置差异很大，p90 的 `idle_view` 偏枪身上方，m107 的 `idle_view` 偏枪尾，需要 per-weapon 微调才能让所有武器在屏幕中呈现一致的腰射位置。
- 部分 V2 新枪（m107/m95）的 marker 受模型骨骼旋转影响，raw position 不可靠，需要 `invertPosePosition` 反转符号。

`src/taczFirstPersonMarkers.js` 的 `applyMarkerOffset` 实现了三步后处理：

1. `markerScale`：对 raw marker position 做 uniform 缩放（默认 1，特殊枪型可调）。
2. `invertPosePosition`：bool，true 时把 position 三个分量取反（应对 bone 父级旋转导致的方向反转）。
3. `hipOffset` / `adsOffset`：[x, y, z] 数组，叠加到缩放后的 position 上。`hipOffset.y` 负值让武器下移（`screenBounds.centerY` 增大），`hipOffset.z` 正值让武器离相机更远（投影变小）。

最终 `rig.calibration.hipPose.position = idleView.position * markerScale + hipOffset`，`adsPose.position = ironView.position * markerScale + adsOffset`。`weaponRoot.position` 直接使用这个值，不要在 `firstPersonRig.js` 里再做额外的世界单位换算。

调试腰射位置偏屏/不可见时，先用浏览器 MCP `evaluate_script` 读 `window.__blockTargetRangeDebug.snapshot()`，看 `activeModel.screenBounds.centerY` 和 `minY`：

- `centerY < 400`：武器偏顶部，把对应武器的 `WEAPON_MARKER_CALIBRATION[id].hipOffset.y` 调更负（如 -0.4 → -0.9）。
- `centerY > 600` 或武器部分移出底部：武器偏底部，`hipOffset.y` 调更接近 0 或微正。
- 投影过大（`width > 500`）：加 `hipOffset.z` 正值（如 +0.4）让武器离相机更远，或减小 `WEAPON_CALIBRATION[id].modelScale`。
- 投影过小（`height < 80`）：减小 `hipOffset.z` 或增大 `modelScale`。

**重要：`screenBounds` 在武器部分移出视野时不稳定**。`m107` `hipOffset.y=-1.6` 时 `centerY=378` 反而比 `-1.3` 时的 `396` 更低，因为模型底部移出屏幕，bounding box 只包含可见部分，center 计算偏移。遇到这种反向变化时优先回退到上一个较优值，改用 `modelScale` 调投影大小，不要继续在 `hipOffset.y` 上加码。

切换武器后等 2.5 秒再采集 snapshot，draw 动画过渡帧会让 bounding box 跳动（glock17 没改 `hipOffset` 时 `centerY` 从 486 跳到 639）。

#### 枪口锚点自动定位（geo muzzle bone → `rig.modelRoot` 本地空间）

`rig.muzzleAnchor` 的位置不要用 `WEAPON_CALIBRATION[id].muzzle` 静态值，应优先从 TaCZ geo muzzle bone 自动计算。`src/taczFirstPersonAdapter.js` 按以下优先级查找 bone：

1. `muzzle_pos`（TaCZ 标准枪口 bone，大多数武器用这个）
2. `muzzle_flash`（部分 V1 兼容枪包）
3. `muzzle_default`（fallback）
4. `rocket_head`（RPG7 专用，火箭弹发射口在模型底部，不在枪管前端）

找到 bone 后，通过 `bone.getAbsoluteMatrix()` 拿世界矩阵，再用 `modelRoot.getWorldMatrix().invert()` 转回 `modelRoot` 本地空间，赋给 `rig.muzzleAnchor.position`。这样枪口锚点会自动跟随模型骨骼动画（如换弹时枪管位移），不需要 per-weapon 配置。

`snapshot().activeModel.nativeMuzzleSource` 字段暴露了实际使用的 bone 名和 raw position，调试枪口火焰位置错位时先看这个字段：

- `nativeMuzzleSource` 为 `null`：geo 中没有上述 4 个 bone 之一，回退到 `WEAPON_CALIBRATION[id].muzzle` 静态值，需要检查 geo json 是否漏建 muzzle bone。
- `nativeMuzzleSource.boneName` 不在预期列表：说明 bone 别名映射有问题，回查 `taczFirstPersonAdapter.js` 的 muzzle bone 查找逻辑。
- `nativeMuzzleSource.position` 范围异常（如 [0,0,0] 或负值）：说明 bone 父级有旋转/缩放，世界矩阵转换出错，检查 `modelRoot.getWorldMatrix()` 是否在 bone 矩阵计算时已经更新。

E2E 测试 `e2e/weapons.spec.js` 的 `expectMuzzleNearFrontFor` 用 `muzzleAnchorScreen` 相对 `screenBounds` 的 `relativeX/relativeY` 断言枪口在模型前端，阈值在 `MUZZLE_FRONT_THRESHOLDS` 中 per-weapon 配置。RPG7/m107/m95 的 `rocket_head`/`muzzle_pos` 在模型底部，`relativeY` 接近 1.0，阈值放宽到 1.10-1.20。

## 以后可能需要

### Node Geometry Editor

官方入口：<https://doc.babylonjs.com/toolsAndResources/nge>

可能用途：

- 训练靶模型。
- 传送门、能量塔、补给箱。
- 特殊障碍物。

暂不优先的原因：当前方块靶场以方块结构为主，`world.js` 手写 mesh 更直接，碰撞盒也更容易控制。

### Flow Graph Editor

官方入口：<https://doc.babylonjs.com/toolsAndResources/mcpServers>

可能用途：

- 简单机关演示。
- 视觉互动原型。

暂不优先的原因：本项目的核心玩法规则需要可测试、可 diff、可维护，继续放在源码模块里更稳。

### Node Render Graph Editor

官方入口：<https://doc.babylonjs.com/toolsAndResources/mcpServers>

可能用途：

- 后期高级渲染。
- 特殊画面效果。

暂不优先的原因：当前项目更需要稳定玩法和低风险视觉增强，不需要复杂渲染管线。

### Smart Filters Editor

官方入口：<https://doc.babylonjs.com/toolsAndResources/sfe>

可能用途：

- 低血量屏幕滤镜。
- 命中或爆炸后的短暂画面滤镜。

暂不优先的原因：滤镜容易影响可读性和性能，先把粒子、材质、模型链路稳定后再考虑。

### WebXR、Viewer Configurator、Asset Librarian

暂时不属于主线。只有当项目明确扩展到 XR、模型预览器或大型资产管理时再重新评估。

## 排查资料查找顺序

遇到 Babylon.js、MCP、材质、粒子、GUI、模型加载、渲染或浏览器显示问题时，按下面顺序查：

1. 先看本项目文档：`docs/项目结构.md`、`docs/调试与验收.md`、`docs/资源与授权.md` 和本文。
2. 再看对应源码：`src/assets.js`、`src/effects.js`、`src/world.js`、`src/ui.js`、`src/weaponModel.js`、`src/combat.js`。
3. 查 Babylon 官方文档：<https://doc.babylonjs.com/>。
4. 查官方 API 文档：<https://doc.babylonjs.com/typedoc/>。
5. 查 Babylon Playground 示例：<https://playground.babylonjs.com/>。
6. 查 Babylon 官方论坛/社区：<https://forum.babylonjs.com/>。
7. 查 GitHub issue 或源码：<https://github.com/BabylonJS/Babylon.js>。
8. 如果是 npm 包、MCP 服务器或版本问题，再查 npm 包信息：<https://www.npmjs.com/package/@babylonjs/mcp-servers>。

如果找不到合适的本地文档，不能直接猜。要优先去官方文档、官方 API、Playground、官方论坛或 GitHub 查找，再把结论补回项目文档。

## 测试方向分层

### 继续使用现有自动测试

这些内容不交给 MCP，继续用 Node test 和源码模块保证：

- 武器冷却、弹匣、换弹。
- 自动/半自动射击。
- 命中判定和伤害。
- 敌人波次和移动规则。
- 碰撞规则。
- 得分和评级。
- 音频缓存。
- 资源路径存在性。

### 增加浏览器视觉验收

这些内容必须在真实浏览器里看：

- 粒子是否出现、位置是否正确、是否越打越卡。
- 材质是否黑屏、过曝、透明异常。
- GLB 模型是否遮挡准星或方向错误。
- HUD 是否遮挡玩法区域。
- 控制台是否有红色错误。
- Network 是否有重复资源请求。

### 未来可加入截图或画布测试

如果视觉资产越来越多，可以增加 Playwright 截图或 canvas 像素检查：

- 页面启动后不是空白画布。
- 进入游戏后场景有非背景像素。
- 关键 UI 元素在预期区域。
- 切换武器后模型或图标可见。
- 触发命中后出现短暂高亮或粒子。

截图测试不能替代手动体验，但可以防止黑屏、资源丢失、HUD 严重跑版这类明显问题。

## 建议接入顺序

1. 接 `babylonjs_npe`，先做枪口火焰或命中火花。
2. 接 `babylonjs_nme`，再做基地水晶或岩浆发光材质。
3. 稳定后再考虑 `babylonjs_gui`，用于开始页或结算页。
4. 如果出现复杂靶场道具需求，再评估 `nge`。

每接入一种新 Babylon 编辑器资产，都要留下以下信息：

- 官方文档或社区链接。
- 资产保存位置。
- 加载入口。
- fallback 行为。
- 自动测试或浏览器验收方式。
- 已知限制。
