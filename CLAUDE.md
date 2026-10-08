# OREO UAT Replay — 项目交接说明

> 给 Claude Code 的上下文文件。打开本项目时会自动读取。

## 1. 背景与目标

- 项目：OREO，银行内部 non-flow FX 结构化产品（TARF、DCD、KO Forward 等）全生命周期管理系统的 UAT 测试。
- 角色：用户是 QA。
- 目标：**QA 本地用 Playwright 跑通一个 case → 自动导出一个"用例文件"（JSON）→ PO 不写代码、不装程序，双击即可在自己电脑的浏览器里真实回放这个 case，用于复现问题或重复验收。**
- 当前状态：**MVP 已完成并验证**（登录 → 进入 Trades 页 → 校验右上角显示当前用户），在模拟页面上端到端跑通。下一步是对接真实系统并扩展业务 case。

## 2. 已确定的关键决策（不要轻易推翻）

| 决策 | 原因 |
|---|---|
| 用 Playwright（TypeScript 写 case，运行器是纯 JS） | 定位器、自动等待、trace 能力最好 |
| 导出 **JSON 步骤数据**，不导出代码 | PO 只运行数据，安全、易审计；等待/截图/浏览器等由运行器统一控制 |
| **QA 跑 case 和 PO 回放共用 `core/actions.js`** | 保证"录的时候怎么执行，回放时就怎么执行" |
| 记录在"动作层"而非录制鼠标点击 | 系统有状态（交易号每次不同），点击录制无法重跑 |
| 服务器地址、账号密码只在 `config.local.json` | 不进代码、不进用例文件、不进 Git（截图 URL 里的真实 IP 不得出现在仓库中） |
| PO 端是**绿色版文件夹**：便携 `node.exe` + `runner` + `@playwright/test` | PO 不能安装程序；用本机自带 **Edge**（`channel: msedge`），不下载浏览器 |
| 默认**不录像** | 录像依赖 Playwright 的 ffmpeg，公司内网解析不到 `cdn.playwright.dev`，下载失败 |
| 打包时**复制本机 node.exe**，不下载 Node | 公司内网无法访问 nodejs.org |
| 定位器**优先 `data-testid`** | 用户明确要求；开发已在关键控件上提供 testid |
| 被否决的方案 | 内网服务器 + noVNC 实时画面（用户觉得太复杂）；Java jar 打包；纯录制点击回放 |

## 3. 架构

```
QA:  tests/*.spec.ts ──通过 ui.xxx 操作──► framework/ui.ts（执行 + 记录）
                                              │ 调用
                                              ▼
                                        core/actions.js  ◄── 共享执行核心
                                              ▲
PO:  运行用例.bat → runner/runner.js ──读 cases/*.json 逐步调用┘
```

- test **通过**后，`framework/fixtures.ts` 自动导出 `cases/<caseId>.json`。
- 运行器列出 `cases/` 下的用例，PO 输入编号（直接回车 = 第 1 个），或把 json 拖到 bat 上。
- 每次回放生成 `evidence/<caseId>_<时间>/`：`report.html`（每步结果 + 截图）、`result.json`、`step-XX.png`、`trace.zip`。

## 4. 目录与职责

| 路径 | 职责 |
|---|---|
| `core/actions.js` | 执行核心：`resolveTarget`、`resolveValue`（占位符）、`executeStep`、`describeStep`。**保持 CommonJS，只依赖 `@playwright/test`**（要打进运行器） |
| `core/config.js` | 读 `config.local.json`（可用 `OREO_UAT_CONFIG` / `OREO_BASE_URL` 覆盖）、`launchOptions`、`secretEntries` |
| `framework/targets.ts` | 页面元素定位表 `T` |
| `framework/ui.ts` | `UI` 类：`goto / fill / click / press / read / expectVisible / expectText / expectUrl / step`；自动变量化、密码防呆、`exportCase` |
| `framework/fixtures.ts` | 注入 `ui`，test 通过后导出；标题里的 `@case:xxx` 决定文件名 |
| `framework/flows.ts` | 可复用流程：`login(ui, role)`；`LOGIN_PATH = '/'` |
| `tests/login.spec.ts` | 唯一的示例 case |
| `runner/runner.js` | PO 端运行器：选用例、询问缺失配置（密码隐藏输入）、执行、截图、trace、HTML 报告 |
| `portable/运行用例.bat` | PO 双击入口（**必须 CRLF 换行**，内容保持 ASCII） |
| `scripts/build-portable.js` | 打包 `dist/UAT-Runner(.zip)` |
| `mock-oreo/server.js` | 模拟 OREO（仿真 shadow DOM 结构和 testid），仅用于本地验证，`npm run mock` → `http://localhost:4173`，maker / `maker1` |
| `cases/` | 导出的用例文件（提交到 Git，分发给 PO） |

## 5. 用例文件格式（formatVersion 1）

```json
{
  "formatVersion": 1, "name": "...", "description": "...",
  "source": "tests/login.spec.ts › ...", "codeVersion": "git:abc123",
  "requiredConfig": ["accounts.maker.email", "accounts.maker.password"],
  "steps": [
    { "title": "以 maker 身份登录", "action": "goto", "value": "/" },
    { "action": "fill", "target": { "testId": "login-email-input", "inner": "input" }, "value": "${cfg:accounts.maker.email}" },
    { "action": "read", "target": { "testId": "trade-id" }, "saveAs": "tradeId" },
    { "action": "click", "target": { "text": "${var:tradeId}" } }
  ]
}
```

- 动作：`goto fill click press select read expectVisible expectText expectUrl wait`
- target 字段：`testId | role(+name) | label | placeholder | text | css`，附加 `inner`、`nth`、`exact`
- 占位符：`${cfg:路径}` = 本地配置；`${var:名字}` = 前面 `read` 读到的值。**value 和 target 里都会解析。**
- `title` 只挂在每个 `ui.step()` 分组的第一个动作上。
- 改格式时要同时改 `ui.ts`（写）和 `actions.js`（读），并考虑 `formatVersion` 兼容。

## 6. OREO 页面已知结构（来自用户截图）

- UI 组件是 **web component + open shadow DOM**（`sc-text-input`、`sc-button`、内部是 Shoelace 风格的 `sl-button`）。
- **输入框**：真正的 `<input part="input">` 在 shadow root 里，target 要写 `{ testId: '...', inner: 'input' }`（CSS 定位器会穿透 open shadow root；直接对宿主 `fill` 会报错）。
- **按钮**：直接点宿主 `sc-button` 即可。
- 已知 testid：
  - 登录：`login-dialog`、`login-email-input`、`login-password-input`、`login-sign-in-to-portal-btn`
  - 顶部栏：`layout-new-trade-btn`、`layout-ai-reader-btn`、`layout-theme-toggle-btn`、`layout-user-menu-btn`（内含 `<span>maker</span>`）、`layout-topnav-c…`（截图被截断）
- Trades 页路径 `/trades`；页面有 Validation Blotter / Pending Approval / Expires Today 等 blotter，搜索框 "Search by Trade ID..."（testid 未知）。
- 测试账号示例：`maker@test.com`（显示名 `maker`）。**登录页路径未确认**，当前假设 `/`。

## 7. 常用命令

```bash
npm install
copy config.local.example.json config.local.json   # 填 baseUrl 和账号密码
npx playwright test --headed      # 跑 case，通过后导出到 cases/
npm run replay                    # 本地用运行器回放（与 PO 体验一致）
npm run build:portable            # 打包 dist/UAT-Runner.zip（--with-config 带上配置但清空密码；--no-zip）
npm run mock                      # 启动模拟 OREO
npx tsc -p .                      # 类型检查
```

## 8. 用户环境与约束

- Windows + VS Code + PowerShell（pwsh）；公司内网，**外网域名解析不到**（`ENOTFOUND cdn.playwright.dev`），npm 走公司镜像可用。
- PO 电脑：不能安装程序，有 Edge。需确认 IT 是否允许运行共享盘里的 `node.exe` / `.bat`。
- GitHub 仓库：`https://github.com/Hellen-Zhu/auto_replay`。之前推送失败（连接的 GitHub 账号无 push 权限），需用户在本机自行 `git push`，或修复授权后再推。`.gitignore` 已排除 `config.local.json`、`node_modules/`、`evidence/`、`dist/`、`test-results/`。

## 9. 已修过的坑（避免回退）

- 运行器读输入用 `rl[Symbol.asyncIterator]()` 的行队列；用 `rl.question` 连续提问在管道输入下会丢行并静默退出。
- 录像初始化失败时要**关掉整个 browser 重新 launch**，只关 context 会导致后续 `newPage` 失败。
- "找不到浏览器"提示只在 `browserType.launch` 报错时显示，否则会误报。
- target 里的 `${var:...}` 也必须在 `executeStep` 里解析（定位刚录入的交易时需要）。

## 10. 建议的下一步

1. **对接真实系统**：确认登录页路径（改 `flows.ts` 的 `LOGIN_PATH`），用真实 `baseUrl` 跑通 `login.spec.ts`。
2. **第一个业务 case**：maker New Trade 录入一笔 TARF → `read` 交易号 → checker 登录 → 在 Pending Approval 找到该交易并审批 → 校验状态。用来验证交易号自动变量化。需要拿到录单表单、搜索框、审批按钮、状态字段的 testid。
3. 在 PO 的电脑上实测绿色版（Edge 启动、IT 策略、UAT 网络可达）。
4. 可选增强：运行器支持参数化（PO 改货币对/本金）；报告里显示业务数据；用例清单页；把 ffmpeg 从本机缓存复制进打包目录（若后续需要录像）。

## 11. 编码约定

- 所有页面操作必须经过 `ui.xxx`，不要直接用 `page`，否则不会被记录。
- 新元素先加到 `framework/targets.ts`，优先 `data-testid`；缺 testid 时请开发补，而不是写脆弱的 CSS/XPath。
- 账号密码一律 `cfg('accounts.<role>.password')`；不要把真实服务器地址、IP、密码写进任何会提交的文件。
- 用户沟通语言：中文。
