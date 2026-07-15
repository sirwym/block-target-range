# V2 新枪资源链报告

本文档记录 2 把新枪（`deagle_golden`/`m95`）的 TaCZ/V2 原生资源链，用于原生 geo renderer 加载。

## 资源路径映射规则

| display.json 字段 | tacz: 命名空间 | public/ 路径 |
|---|---|---|
| `model` | `tacz:gun/{weapon}_geo` | `assets/tacz/geo_models/gun/{weapon}_geo.json` |
| `texture` | `tacz:gun/uv/{weapon}` | `assets/tac/textures/{weapon}/{weapon}.png` |
| `animation` | `tacz:{weapon}` | `assets/tacz/animations/{weapon}.animation.json` |
| `use_default_animation` | `"pistol"` / `"rifle"` | `assets/tacz/player_animator/{type}_default.player_animation.json` |

## deagle_golden

- **display**: `assets/tacz/display/guns/deagle_golden_display.json`
- **model**: `tacz:gun/deagle_golden_geo` → `assets/tacz/geo_models/gun/deagle_golden_geo.json`
- **texture**: `tacz:gun/uv/deagle_golden` → `assets/tac/textures/deagle_golden/deagle_golden.png`（256×256）
- **animation**: `tacz:deagle_golden` → `assets/tacz/animations/deagle_golden.animation.json`（12 个动画）
- **use_default_animation**: `"pistol"` → `assets/tacz/player_animator/pistol_default.player_animation.json`
- **transform.scale**: thirdperson=[0.6,0.6,0.6], ground=[0.6,0.6,0.6], fixed=[1.2,1.2,1.2]（无 firstperson，用 viewTransform.scale=1.0）
- **muzzle_flash**: texture=`tacz:flash/common_muzzle_flash`, scale=0.65
- **sounds**: draw/put_away/shoot/shoot_3p/silence/silence_3p
- **geo bones 数量**: 77
- **关键 bone**: root, mag_and_lefthand, mag_and_bullet, bullet, magazine, mag_standard, magazine1-4, lefthand, gun_and_righthand, righthand, Deagle_golden, constraint, shell, muzzle_flash, slide2, slide, camera, view, iron_view, idle_view
- **动画 bones**: static_idle(lefthand/righthand/constraint), shoot(root/constraint/slide2/bullet_in_barrel/hammer/camera), reload_empty(root/mag_and_lefthand/slide2/additional_magazine/mag_and_bullet/release/bullet/bullet_in_barrel/lefthand/righthand/camera/constraint), inspect(root/mag_and_lefthand/mag_and_bullet/gun_and_righthand/Deagle/slide2/safety/additional_magazine/lefthand/righthand/camera/constraint/bullet/Deagle_golden)
- **bone 别名问题**: inspect 动画用 `Deagle`，geo 中是 `Deagle_golden` → 代码层别名映射

## m95

- **display**: `assets/tacz/display/guns/m95_display.json`
- **model**: `tacz:gun/m95_geo` → `assets/tacz/geo_models/gun/m95_geo.json`
- **texture**: `tacz:gun/uv/m95` → `assets/tac/textures/m95/m95.png`（256×256）
- **animation**: `tacz:m95` → `assets/tacz/animations/m95.animation.json`（9 个动画）
- **use_default_animation**: `"rifle"` → `assets/tacz/player_animator/rifle_default.player_animation.json`
- **muzzle_flash**: scale=2
- **iron_zoom**: 机瞄放大
- **geo bones 数量**: 100
- **关键 bone**: root, mag_and_lefthand, lefthand, mag_and_bullet, bullet, magzine（拼写错误）, bullet_in_mag, mag_extended_1/2/3, magazine/2/3, gun_and_righthand, m95, constraint, muzzle_pos, muzzle_flash, shell_ejection, 50bmg2, mag_release, sight_folded, sight, m95_bolt, bullet_in_barrel, 50bmg, bolt, fix, rotate, m95_barrel, barrel9, tube, muzzle_default, m95_body, body, upper, sightbase, lower, grip, trigger, switch, bipod, righthand
- **动画 bones**: static_idle(lefthand/righthand/constraint), reload_tactical(root/lefthand/mag_and_bullet/righthand/l2/l3/constraint/camera), reload_empty(m95_bolt/rotate/root/lefthand/mag_and_bullet/righthand/mag_and_lefthand/l2/l3/constraint/shell_ejection/camera), bolt(m95_bolt/rotate/root/lefthand/righthand/shell_ejection/camera), shoot(root/m95_barrel/camera/constraint)
- **栓动武器**：有独立 `bolt` 动画状态

## 当前 flat Blockbench 模型与原始 geo 的差异

`convertBedrockToBlockbench.mjs` 对 2 把新枪的转换丢失：

1. **bone 层级**：77~100 个 bone 被拍扁成 flat elements 数组，无父子关系
2. **多轴旋转**：cube.rotation/bone.rotation 仅取绝对值最大的单轴，其他两轴丢弃
3. **祖先旋转影响**：祖先 bone 有旋转时，子 bone cube 位置未做矩阵变换
4. **UV 数据**：per-face UV 被忽略，运行时用 CreateBox 6 面立方体 + 单色材质
5. **bone 动画能力**：无 bone 概念，无法做层级动画（root 旋转带动整枪、mag_and_lefthand 同时驱动左手和弹匣）

原生 geo renderer（`src/taczGeoModel.js`）修复以上全部问题。
