# 潮汐纪年社 · 守护天使名号计算器

[打开网站](https://tidal-guardian-angel.github.io/) · [项目源码](https://github.com/tidal-guardian-angel/tidal-guardian-angel.github.io)

浏览器内运行的守护天使取字工具。首页以八个抽屉入口展示不同方法，展开后进入对应计算器；支持出生资料自动取得点位、手动输入点位，以及独立的姓名计算。结果提供取字或逐字加权记录、完整名号、带品牌水印的 PNG 导出、打印与复制记录，适配手机与桌面。

## 选择方法

首页地址保持不变。方法入口使用 `method` 查询参数，可以直接分享某一方法的链接；链接只选择方法，不包含出生资料。

| 首页入口 | 路由键 | 主要操作 |
| --- | --- | --- |
| [五生命点取字](https://tidal-guardian-angel.github.io/?method=five) | `five` | 太阳、月亮、上升、福点、出生前朔望五处取字，按昼夜排序。 |
| [命主星法](https://tidal-guardian-angel.github.io/?method=ascendant) | `ascendant` | 取上升星座的古典守护星，再用该星实际位置取字。 |
| [月座法](https://tidal-guardian-angel.github.io/?method=moon) | `moon` | 取月座下一星座的古典守护星，再用该星实际位置取字。 |
| [角宫法](https://tidal-guardian-angel.github.io/?method=angles) | `angles` | 对四个几何角点自动计算本质尊贵分，保留全部最高分候选。 |
| [第十一宫法](https://tidal-guardian-angel.github.io/?method=eleventh) | `eleventh` | 选择十一宫宫主星，或对宫头计算本质尊贵；自动排盘时须明确宫制。 |
| [姓名计算法](https://tidal-guardian-angel.github.io/?method=name) | `name` | 按用户确定的姓名拼写连续加权、扣除后缀、拆数并构名。 |
| [胜利星取字](https://tidal-guardian-angel.github.io/?method=almuten) | `almuten` | 用户手动选择已经确定的胜利星，网站完成后续取字。 |
| [日月取字](https://tidal-guardian-angel.github.io/?method=luminary) | `luminary` | 用户手动选择太阳或月亮，网站完成后续取字。 |

除姓名法外，各方法均提供出生资料与手动点位入口。出生资料模式负责取得所需星盘位置；胜利星和日月法仍由用户确认所选行星，网站不自动判断这两项的强弱。

五生命点的坐标、福点、向下取整及昼夜排序规则保持不变。其余六项星盘路径可明确选择“相对上升”或“白羊座0°”布字；每颗选定行星取一个根字母，再加 el 后缀。相对上升使用**分别取整数行，再作顺行差**的口径。计分出现并列时，每个候选分别生成完整名号，可切换后查看、保存或打印。

角宫与十一宫计分使用本站列明的本质尊贵表，三分可选择昼夜单主或三主分别计分；它与行星的后天宫位强弱判断分开。姓名法自动识别拉丁、希伯来或阿拉伯输入，默认希伯来字母输出，阿拉伯字母可选；希伯来千位使用 `׳` 标记，标记不读音。连续加权与通用拆数约定在结果中列出；中文姓名不自动转拼音。具体公式、固定拼读表、数表边界及参考资料页号见 [多方法计算规则](docs/多方法计算规则.md)。

## 本地运行

安装 Node.js 24，然后在本目录执行：

```sh
npm ci
npm run dev
```

构建与验证：

```sh
npm test
npm run build
npm run preview
```

`dist/` 是可部署的静态网站。通过 HTTP(S) 打开，直接双击 HTML 的 `file://` 方式无法载入城市、时区与星历文件。

## GitHub Pages

品牌组织站点的目标地址为 `https://tidal-guardian-angel.github.io/`，对应组织 `tidal-guardian-angel` 下的仓库 `tidal-guardian-angel.github.io`。迁移时先部署并验收组织站点，再处理旧网址跳转，保留旧仓库与旧站服务。

本项目采用 GitHub Pages 静态分支发布：`main` 保留完整源码，`gh-pages` 保留构建后的静态网站。在 Settings → Pages → Build and deployment 中选择 **Deploy from a branch**，分支选 `gh-pages`，目录选 `/ (root)`。

修改后先运行 `npm test`，提交并推送 `main`，再运行：

```sh
npm run publish:pages
```

该命令构建网站并将 `dist/` 发布到 `gh-pages`；GitHub Pages 随后自动更新。需要本机 Git 已登录并有该仓库写入权限，不需要额外的 Actions 工作流权限。

`base: './'` 与同源数据路径同时支持 `用户名.github.io/项目名/` 和独立域名。更换仓库或账号时，一并修改页面“源码与许可”中的源码仓库链接。

## 计算口径

- 回归黄道、地心视黄经；Swiss Ephemeris 2.10.03，通过本地 WebAssembly 运行。
- 使用随站发布的四份 Swiss 星历文件；检查实际星历来源，文件失效时明确报错。
- 日期范围 1800—2100 年；固定 tzdata 2026.6 / IANA 2026f，处理历史秒级偏移与夏令时重复、缺失时刻。
- 采用太阳中心的几何高度判定昼夜；朔望搜索出生前最近一次精确的新月或满月，始终取当时月亮的黄经。
- 五点按累计黄经向下取整，对 22 个希伯来字母循环取字；昼夜调整日月顺序与福点公式，添加 el 后缀，保留重复字母。

计算器提供名号计算与完整过程核对。方法规则见 [多方法计算规则](docs/多方法计算规则.md)，星历与时区实现说明见 [浏览器星历核验](docs/浏览器星历核验.md)。

## 团队修改入口

- `index.html`：品牌名、顶部提示、联系方式、使用说明。
- `src/style.css`：D 版配色、排版与手机适配。
- `src/app.js`：首页抽屉、方法路由、表单与候选切换。
- `src/result-view.js`：结果展示、复制记录、图片与打印内容。
- `public/assets/tidal-watermark.png`：已确认的靛蓝透明字标。
- `src/naming.js`：五生命点原有计算与精确坐标处理。
- `src/methods.js`：新增方法、尊贵计分、固定拼读与姓名构名。
- `src/calculator.js`：各方法与结果记录的衔接。
- `src/astrology.js`、`src/timezone.js`：星历、四角及明确宫制下的宫头、历史时区。
- `public/data/`：城市、固定时区及星历文件。

出生资料只在当前页面内参与计算；没有账户、资料数据库、统计脚本或外部排盘 API。页面刷新后输入清空。浏览器会从站点下载公共计算数据。

## 发布许可

网站程序按 AGPL-3.0-or-later 开源，见 `LICENSE` 与 `NOTICE`。本版 Swiss Ephemeris WebAssembly 依赖采用同一许可。第三方组件的许可证和完整星历封装源码随站点一并提供，详见 `public/licenses/`、`public/source/` 与 `docs/第三方来源.md`。
