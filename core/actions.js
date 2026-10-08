// 共享执行核心：QA 本地跑 case 和 PO 回放用例文件，走的都是这里的同一套逻辑，
// 保证"录的时候怎么执行，回放时就怎么执行"。
// 注意：本文件保持 CommonJS，并且只依赖 @playwright/test，便于打包进绿色版运行器。

const { expect } = require('@playwright/test');

/**
 * 把 JSON 里的 target 描述转成 Playwright Locator。
 * 支持字段（按优先级）：testId / role(+name) / label / placeholder / text / css
 * 附加字段：inner（在宿主元素内再找，如 web component 的 shadow DOM 里的 input）、nth
 */
function resolveTarget(page, target) {
  if (!target) throw new Error('步骤缺少 target');
  let loc;
  if (target.testId) loc = page.getByTestId(target.testId);
  else if (target.role) loc = page.getByRole(target.role, target.name ? { name: target.name, exact: !!target.exact } : {});
  else if (target.label) loc = page.getByLabel(target.label, { exact: !!target.exact });
  else if (target.placeholder) loc = page.getByPlaceholder(target.placeholder, { exact: !!target.exact });
  else if (target.text) loc = page.getByText(target.text, { exact: !!target.exact });
  else if (target.css) loc = page.locator(target.css);
  else throw new Error('无法识别的 target：' + JSON.stringify(target));

  // CSS 定位会自动穿透 open shadow root，所以 inner: 'input' 能找到 sc-text-input 里的原生 input
  if (target.inner) loc = loc.locator(target.inner);
  if (target.nth !== undefined && target.nth !== null) loc = loc.nth(target.nth);
  return loc;
}

function describeTarget(target) {
  if (!target) return '';
  const base =
    (target.testId && `testId=${target.testId}`) ||
    (target.role && `role=${target.role}${target.name ? `[${target.name}]` : ''}`) ||
    (target.label && `label=${target.label}`) ||
    (target.placeholder && `placeholder=${target.placeholder}`) ||
    (target.text && `text=${target.text}`) ||
    (target.css && `css=${target.css}`) ||
    '?';
  return base + (target.inner ? ` >> ${target.inner}` : '') + (target.nth !== undefined ? ` [${target.nth}]` : '');
}

/** 取对象的点路径值：get({a:{b:1}}, 'a.b') => 1 */
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const PLACEHOLDER = /\$\{(var|cfg):([^}]+)\}/g;

/**
 * 解析值里的占位符：
 *   ${var:tradeId}                  运行时读取到的动态值（如交易号）
 *   ${cfg:accounts.maker.password}  本地配置里的值（账号、密码等，不进入用例文件）
 * ctx.askConfig(path) 可选：配置里缺值时询问用户（运行器用它在命令行里让 PO 输入密码）
 */
async function resolveValue(value, ctx) {
  if (typeof value !== 'string') return value;
  let out = '';
  let last = 0;
  for (const m of value.matchAll(PLACEHOLDER)) {
    out += value.slice(last, m.index);
    const [, kind, key] = m;
    let v;
    if (kind === 'var') {
      v = ctx.vars[key];
      if (v === undefined) throw new Error(`变量 ${key} 还没有被读取（检查前面是否有对应的 read 步骤）`);
    } else {
      v = getPath(ctx.config, key);
      if (v === undefined || v === '') {
        if (!ctx.askConfig) throw new Error(`本地配置缺少 ${key}，请在 config.local.json 中补充`);
        v = await ctx.askConfig(key);
      }
    }
    out += String(v);
    last = m.index + m[0].length;
  }
  return out + value.slice(last);
}

/** 拼接 baseUrl 和相对路径，用例文件里只存相对路径，不存服务器地址 */
function resolveUrl(baseUrl, path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!baseUrl) throw new Error('未配置 baseUrl，请在 config.local.json 中设置');
  return baseUrl.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 执行一个步骤。step 中的 value 可以带占位符，这里统一解析。
 * 返回值：read 步骤返回读到的文本，其余返回 undefined。
 */
async function executeStep(page, step, ctx) {
  const timeout = step.timeout ?? ctx.config?.timeouts?.step ?? 15000;
  const value = await resolveValue(step.value, ctx);
  // 定位器里也可能带变量，例如 { text: '${var:tradeId}' } 用来点击刚录入的那笔交易
  if (step.target) {
    const resolved = {};
    for (const [k, v] of Object.entries(step.target)) resolved[k] = await resolveValue(v, ctx);
    step = { ...step, target: resolved };
  }

  switch (step.action) {
    case 'goto':
      await page.goto(resolveUrl(ctx.config.baseUrl, value));
      return;
    case 'fill':
      await resolveTarget(page, step.target).fill(value, { timeout });
      return;
    case 'click':
      await resolveTarget(page, step.target).click({ timeout });
      return;
    case 'press':
      await resolveTarget(page, step.target).press(value, { timeout });
      return;
    case 'select':
      await resolveTarget(page, step.target).selectOption(value, { timeout });
      return;
    case 'read': {
      const loc = resolveTarget(page, step.target);
      await loc.waitFor({ state: 'visible', timeout });
      const text = (await loc.innerText()).trim();
      ctx.vars[step.saveAs] = text;
      return text;
    }
    case 'expectVisible':
      await expect(resolveTarget(page, step.target)).toBeVisible({ timeout });
      return;
    case 'expectText':
      if (step.exact) await expect(resolveTarget(page, step.target)).toHaveText(value, { timeout });
      else await expect(resolveTarget(page, step.target)).toContainText(value, { timeout });
      return;
    case 'expectUrl':
      // 只比较路径部分，不关心服务器地址
      await expect(page).toHaveURL(new RegExp(escapeRegExp(value) + '(\\?.*)?(#.*)?$'), { timeout });
      return;
    case 'wait':
      await page.waitForTimeout(Number(value) || 0);
      return;
    default:
      throw new Error(`不支持的动作：${step.action}`);
  }
}

/** 一行可读的步骤描述，用于日志和报告 */
function describeStep(step) {
  const t = describeTarget(step.target);
  const v = step.secret
    ? '******'
    : typeof step.value === 'string'
      ? step.value.replace(/\$\{cfg:([^}]+)\}/g, '〔配置 $1〕').replace(/\$\{var:([^}]+)\}/g, '〔变量 $1〕')
      : step.value;
  switch (step.action) {
    case 'goto': return `打开页面 ${v}`;
    case 'fill': return `在 ${t} 输入 ${v}`;
    case 'click': return `点击 ${t}`;
    case 'press': return `在 ${t} 按键 ${v}`;
    case 'select': return `在 ${t} 选择 ${v}`;
    case 'read': return `读取 ${t} 保存为 ${step.saveAs}`;
    case 'expectVisible': return `校验 ${t} 可见`;
    case 'expectText': return `校验 ${t} ${step.exact ? '等于' : '包含'} ${v}`;
    case 'expectUrl': return `校验当前页面为 ${v}`;
    case 'wait': return `等待 ${v} ms`;
    default: return step.action;
  }
}

module.exports = { resolveTarget, describeTarget, resolveValue, resolveUrl, executeStep, describeStep, getPath };
