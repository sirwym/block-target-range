# 我的方块靶场

基于 Babylon.js 的第一人称方块靶场 demo，支持 5 把武器射击、敌人波次、命中反馈和音频系统。

## 特性

- **5 把武器**：Glock 17、M4、AK47、AWP、P90，支持自动/半自动射击、换弹、切枪
- **3D 模型**：P90 使用 Blockbench JSON 模型，其他武器使用 2D 图标
- **敌人系统**：僵尸和 Creeper 风格敌人，支持头部/身体命中判定
- **音频系统**：真实 OGG 音效 + 合成 fallback，节流缓存防止请求暴涨
- **HUD 界面**：准星、弹药显示、热栏、得分和连击反馈
- **调试模式**：支持多种调试参数，方便验收武器朝向、命中盒、模型状态

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行测试
npm run test

# 运行 E2E 测试
npm run test:e2e

# 构建产物
npm run build

# 完整检查（测试 + 构建）
npm run check
```

启动后访问 `http://127.0.0.1:5174` 即可试玩。

## 操作说明

- **移动**：WASD
- **跳跃**：空格
- **射击**：鼠标左键
- **换弹**：R
- **切枪**：数字键 1-5

## 技术栈

- **渲染引擎**：[Babylon.js](https://www.babylonjs.com/) 8.x
- **构建工具**：Vite 7.x
- **测试框架**：Node test + Playwright
- **资源格式**：Blockbench JSON 模型、OGG 音效、PNG 贴图

## 项目结构

```
src/          # 游戏源码（场景、武器、敌人、音频、UI）
test/         # 单元测试（武器规则、音频、碰撞、评分）
e2e/          # E2E 测试（浏览器视觉验收）
public/       # 浏览器运行时资源（贴图、音效、模型）
docs/         # 项目文档
```

详细结构见 [docs/项目结构.md](./docs/项目结构.md)。

## 调试

在 URL 后追加参数启用调试模式：

- `?debugHitbox=1`：显示命中盒
- `?debugActor=1`：显示敌人调试信息
- `?debugWeapon=1`：检查武器显示和 P90 模型
- `?debugWeapon2D=1`：检查 2D 武器朝向和镜像

## 文档

- [武器系统](./docs/武器系统.md)：武器配置、新增武器流程、2D/3D 显示校准
- [调试与验收](./docs/调试与验收.md)：调试参数、浏览器验收清单、故障排查
- [资源与授权](./docs/资源与授权.md)：资源放置约定、授权注意事项
- [Babylon 官方资料](./docs/Babylon官方资料与测试方向.md)：Babylon 能力、MCP 工具、资料查找

## 许可证

本项目仅用于学习和演示。资源来源和授权见 [docs/资源与授权.md](./docs/资源与授权.md)。
