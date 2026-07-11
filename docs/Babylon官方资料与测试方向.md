# Babylon 官方资料与测试方向

本文记录《我的方块靶场》当前需要关注的 Babylon.js 官方能力、后续可能需要的能力，以及排查问题时的资料查找顺序。目的是让后续调试不要只靠猜测，而是先回到项目真实模块和官方资料。

最后整理日期：2026-07-11。

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
