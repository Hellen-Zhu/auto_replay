# OREO UAT 回放工具（MVP）

QA 本地用 Playwright 跑 case → 跑通后自动导出**用例文件**（JSON）→ PO 用**绿色版运行器**双击回放，在自己电脑的 Edge 上真实操作一遍，并生成带截图的执行报告。

```
QA：npx playwright test  ──导出──►  cases/login_maker_trades.json
                                          │ 放到共享盘
PO：双击 运行用例.bat → 选编号 → Edge 弹出自动操作 → evidence/xxx/report.html
```

用例文件里**没有服务器地址、没有密码**，只有相对路径和配置引用（`${cfg:accounts.maker.password}`），这些值放在每台电脑自己的 `config.local.json` 里。

## 目录

| 路径 | 说明 |
|---|---|
| `core/actions.js` | 执行核心。QA 跑 case 和 PO 回放走同一套代码 |
| `core/config.js` | 读取 `config.local.json` |
| `framework/targets.ts` | 页面元素定位，统一用 `data-testid` |
| `framework/ui.ts` | 操作封装层：执行 + 记录，自动处理动态值和密码 |
| `framework/fixtures.ts` | test 通过后自动导出到 `cases/` |
| `framework/flows.ts` | 可复用流程（登录） |
| `tests/` | 测试用例 |
| `runner/runner.js` | PO 端运行器 |
| `portable/运行用例.bat` | PO 双击的启动文件 |
| `scripts/build-portable.js` | 打包绿色版运行器 |
| `mock-oreo/` | 模拟 OREO 页面，仅用于本地演示 |

## QA：第一次使用

```bash
npm install                            # 浏览器用本机 Edge，不需要下载
copy config.local.example.json config.local.json
```

编辑 `config.local.json`：填 `baseUrl`（真实服务器地址）和各角色账号密码。这个文件已在 `.gitignore` 里，不会提交。

```bash
npx playwright test                    # 跑全部 case，通过的自动导出到 cases/
npx playwright test --headed           # 想看着浏览器跑
npm run replay                         # 用运行器回放，和 PO 看到的一样
```

> 想先不连真实系统试一下：`npm run mock` 启动模拟页面，把 `baseUrl` 改成 `http://localhost:4173`，maker 密码填 `maker1`。

## QA：写一个新 case

```ts
test('TARF 录入 @case:tarf_book', async ({ ui }) => {
  let tradeId = '';
  await login(ui, 'maker');
  await ui.step('录入 TARF', async () => {
    await ui.click(T.layout.newTradeBtn);
    await ui.fill({ testId: 'trade-ccy-pair-input', inner: 'input' }, 'USDCNH');
    await ui.click({ testId: 'trade-submit-btn' });
    tradeId = await ui.read({ testId: 'trade-id' }, 'tradeId');   // 读到交易号
  });
  await ui.step('Checker 审批', async () => {
    await login(ui, 'checker');
    await ui.fill({ testId: 'trades-search-input', inner: 'input' }, tradeId); // 自动变成 ${var:tradeId}
  });
});
```

要点：

- 所有页面操作都通过 `ui.xxx`，不要直接调用 `page`，否则不会被记录。
- `@case:xxx` 决定导出文件名；`ui.step('标题', ...)` 的标题会出现在 PO 的执行日志和报告里。
- `ui.read()` 读到的值，后面再用到时会**自动变量化**，PO 回放时用新产生的值。
- 账号密码用 `cfg('accounts.maker.password')`；就算不小心写了明文，导出时也会被替换成配置引用。
- OREO 的输入框是 web component，真正的 `<input>` 在 shadow DOM 里，所以输入框 target 要加 `inner: 'input'`；按钮直接点宿主元素即可。
- 只有**通过**的 case 才会导出。

## 打包给 PO

```bash
npm run build:portable                    # 直接复制你本机的 node.exe，不需要外网
npm run build:portable -- --with-config   # 带上你的 baseUrl 和账号（密码会清空）
npm run build:portable -- --no-zip        # 只生成文件夹，不压缩
```

产出 `dist/UAT-Runner.zip`，放共享盘即可。之后只需要把新导出的 `cases/*.json` 发给 PO，放进他的 `cases` 文件夹。

## PO：怎么用

1. 解压 `UAT-Runner.zip`（不需要安装任何东西）。
2. 双击 **运行用例.bat**，输入编号回车；或把用例 `.json` 拖到 bat 上。
3. 第一次会提示输入系统地址和密码（密码只在本次运行中使用，不保存）。
4. Edge 弹出并自动操作；结束后自动打开报告：每步截图和结果。
5. 有问题时把 `evidence/` 下对应的文件夹发给 QA，里面的 `trace.zip` 可以逐步回放。

## 已知限制

- 默认不录像（录像依赖 Playwright 的 ffmpeg，内网一般下载不了）；每步截图和 trace 已足够复现。需要时在 `config.local.json` 设置 `"evidence": { "video": true }`，并手动安装 ffmpeg。
- 需要 PO 电脑上有 Edge（默认）或 Chrome（`browser.channel` 改成 `"chrome"`）。
- 需要公司允许运行共享盘/解压出来的 `node.exe` 和 `.bat`，建议先找一台 PO 电脑实测。
- `LOGIN_PATH` 默认是 `/`，如果真实登录页地址不同，改 `framework/flows.ts`。
- 回放会在 UAT 里真实操作（真实录单、审批），请确认环境能承受重复执行。
