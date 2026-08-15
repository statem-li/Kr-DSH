/**
 * @dsh-external/dsh-browser — AI 浏览器操作插件（hybrid）
 *
 * 核心设计（对齐 openhanako browser 工具）：
 * - 文本主感知：snapshot 注入 JS 遍历 DOM，给可交互元素标 data-dsh-ref，
 *   返回文本 ref 树给 LLM；每次操作后自动返回最新 snapshot。
 * - 截图兜底：browser_screenshot 存文件返回路径，模型用 vision_describe
 *   （辅助视觉插件）看图。
 * - 独立 Chrome 实例：专属 user-data-dir（登录态持久化），用户实时可见可交互。
 * - 零依赖：Node 24 原生 WebSocket 实现 CDP 客户端。
 */
import fs from 'node:fs';
import path from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import z from 'schemastery';
import { CdpConnection, createPageSession, navigateAndWait, captureScreenshot, fetchBrowserWsUrl, evaluateJson, } from './cdp.js';
import { resolveChromePath, launchChrome, killChrome, findFreePort, DEFAULT_CHROME_CANDIDATES, } from './chrome.js';
import { getSnapshot, clickRef, typeRef, scrollPage } from './snapshot.js';
export const name = '@dsh-external/dsh-browser';
export const inject = ['tools', 'webServer', 'fs', 'sandboxPolicy'];
export const Config = z.object({
    chromePath: z.string().default(''),
    port: z.number().default(0),
    headless: z.boolean().default(false),
    screenshotDir: z.string().default(''),
});
const MAX_LOG = 200;
const NAV_TIMEOUT_MS = 30000;
export function apply(ctx, config) {
    // 插件数据根目录（prefs/浏览器 profile 共用）
    const dataRoot = path.join(process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh'), 'plugin-data', 'dsh-browser');
    const prefsFile = path.join(dataRoot, 'prefs.json');
    // ═══ 「允许 AI 使用浏览器」开关（默认开启，持久化）═══
    let allowBrowser = true;
    function loadPrefs() {
        try {
            const parsed = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
            allowBrowser = parsed?.allowBrowser !== false;
        }
        catch {
            allowBrowser = true;
        }
    }
    function savePrefs() {
        try {
            fs.mkdirSync(dataRoot, { recursive: true });
            fs.writeFileSync(prefsFile, JSON.stringify({ allowBrowser }, null, 2) + '\n');
        }
        catch { /* 持久化失败不影响运行 */ }
    }
    loadPrefs();
    const state = {
        runtime: null,
        conn: null,
        session: null,
        screenshotDir: '',
        lastScreenshotPath: null,
        log: [],
    };
    const log = (action, detail = '') => {
        state.log.push({ ts: new Date().toISOString(), action, detail: String(detail).slice(0, 200) });
        if (state.log.length > MAX_LOG)
            state.log.splice(0, state.log.length - MAX_LOG);
    };
    // ═══ 浏览器工具门禁：开关关闭时拦截全部 browser_* 调用 ═══
    ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
        if (typeof exec?.name === 'string' && exec.name.startsWith('browser_') && !allowBrowser) {
            return { kind: 'deny', reason: '浏览器使用已被用户禁用（可在对话面板开关中开启）' };
        }
        return next();
    }), '@dsh-external/dsh-browser: allow gate');
    // ═══ 生命周期：启动 / 停止 / 状态 ═══
    async function startBrowser() {
        if (state.conn?.connected && state.session) {
            return { ok: true, alreadyRunning: true, ...(await statusFields()) };
        }
        // 进程真实存活判定：exitCode === null 表示还在跑（proc.killed 是本地标记，进程可能已被外部关闭）
        const procAlive = !!state.runtime && state.runtime.proc.exitCode === null && !state.runtime.proc.killed;
        if (procAlive) {
            // 进程活着但连接断了：重连
            if (state.conn) {
                try {
                    state.conn.close();
                }
                catch { }
            }
            state.conn = null;
        }
        else {
            const chromePath = config.chromePath || resolveChromePath(DEFAULT_CHROME_CANDIDATES);
            const port = config.port || (await findFreePort(9222));
            const profileDir = path.join(dataRoot, 'profiles', 'default');
            const runtime = launchChrome(chromePath, profileDir, port, config.headless);
            state.runtime = runtime;
            state.screenshotDir = config.screenshotDir || path.join(profileDir, 'screenshots');
            fs.mkdirSync(state.screenshotDir, { recursive: true });
            log('start', `${chromePath} port=${port} headless=${config.headless}`);
        }
        // 等待 CDP 就绪并连接
        const wsUrl = await fetchBrowserWsUrl(state.runtime.port, 15000);
        const conn = new CdpConnection(wsUrl);
        await conn.connect(10000);
        state.conn = conn;
        const session = await createPageSession(conn);
        state.session = session;
        log('ready', wsUrl);
        return { ok: true, ...(await statusFields()) };
    }
    async function stopBrowser() {
        if (state.conn) {
            try {
                state.conn.close();
            }
            catch { }
        }
        state.conn = null;
        state.session = null;
        killChrome(state.runtime);
        state.runtime = null;
        log('stop', 'browser closed');
        return { ok: true, running: false };
    }
    async function requireSession() {
        if (!state.conn?.connected || !state.session) {
            await startBrowser();
        }
        if (!state.conn?.connected || !state.session) {
            throw new Error('浏览器未就绪，请先调用 browser_start');
        }
        return state.session;
    }
    async function statusFields() {
        const running = !!state.runtime && !state.runtime.proc.killed && !!state.conn?.connected;
        let url = '';
        let title = '';
        let refCount = 0;
        if (running && state.session) {
            try {
                const snap = await getSnapshot(state.session);
                url = snap.url;
                title = snap.title;
                refCount = snap.refCount;
            }
            catch { /* 页面可能未加载完 */ }
        }
        return {
            running,
            url,
            title,
            refCount,
            port: state.runtime?.port ?? null,
            headless: config.headless,
        };
    }
    async function snapshotAfter(fn) {
        const value = await fn();
        const session = await requireSession();
        const snap = await getSnapshot(session);
        return { action: value, snapshot: snap.text };
    }
    // ═══ 工具注册（ctx.effect：fiber dispose 自动注销）═══
    const tools = [
        defineTool({
            name: 'browser_start',
            description: '启动 AI 专用 Chrome 实例（独立配置目录、登录态持久化）。AI 操作浏览器前第一步调用；重复调用返回当前状态。',
            parameters: {},
            output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
            async execute() {
                try {
                    return await startBrowser();
                }
                catch (e) {
                    return { ok: false, error: String(e?.message || e) };
                }
            },
        }),
        defineTool({
            name: 'browser_navigate',
            description: '在浏览器打开 URL 并等待加载，返回页面 ref 树。',
            parameters: {
                url: { type: 'string', required: true, description: '要打开的网址（http/https）' },
            },
            output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
            async execute(args) {
                try {
                    const session = await requireSession();
                    const url = String(args.url).trim();
                    if (!/^https?:\/\//i.test(url))
                        throw new Error('仅支持 http/https 地址');
                    const info = await navigateAndWait(session, url, NAV_TIMEOUT_MS);
                    const snap = await getSnapshot(session);
                    log('navigate', url);
                    return { ok: true, url: info.url, title: info.title, snapshot: snap.text };
                }
                catch (e) {
                    return { ok: false, error: String(e?.message || e) };
                }
            },
        }),
        defineTool({
            name: 'browser_snapshot',
            description: '获取当前页面 ref 树：元素以 [ref] 定位。页面变化后 ref 失效，操作前先获取最新 snapshot。',
            parameters: {},
            output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
            async execute() {
                try {
                    const session = await requireSession();
                    const snap = await getSnapshot(session);
                    return { ok: true, url: snap.url, title: snap.title, snapshot: snap.text };
                }
                catch (e) {
                    return { ok: false, error: String(e?.message || e) };
                }
            },
        }),
        defineTool({
            name: 'browser_click',
            description: '点击页面元素（ref 来自最新 snapshot），返回操作后新 snapshot。',
            parameters: {
                ref: { type: 'number', required: true, description: 'snapshot 中的 [ref] 编号' },
            },
            output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
            async execute(args) {
                try {
                    const session = await requireSession();
                    await clickRef(session, Number(args.ref));
                    log('click', `ref=${args.ref}`);
                    return { ok: true, ...(await snapshotAfter(async () => null)) };
                }
                catch (e) {
                    return { ok: false, error: String(e?.message || e) };
                }
            },
        }),
        defineTool({
            name: 'browser_type',
            description: '向输入框输入文本（ref 来自最新 snapshot），返回操作后新 snapshot。',
            parameters: {
                ref: { type: 'number', required: true, description: 'snapshot 中的 [ref] 编号' },
                text: { type: 'string', required: true, description: '要输入的文本' },
                pressEnter: { type: 'boolean', description: '输入后按回车（提交表单/搜索），默认 false' },
            },
            output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
            async execute(args) {
                try {
                    const session = await requireSession();
                    await typeRef(session, Number(args.ref), String(args.text), args.pressEnter === true);
                    log('type', `ref=${args.ref} enter=${!!args.pressEnter}`);
                    return { ok: true, ...(await snapshotAfter(async () => null)) };
                }
                catch (e) {
                    return { ok: false, error: String(e?.message || e) };
                }
            },
        }),
        defineTool({
            name: 'browser_scroll',
            description: '滚动当前页面，返回操作后新 snapshot。',
            parameters: {
                direction: { type: 'string', required: true, description: 'up / down / left / right' },
                amount: { type: 'number', description: '滚动步数（默认 3）' },
            },
            output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
            async execute(args) {
                try {
                    const dir = String(args.direction);
                    if (!['up', 'down', 'left', 'right'].includes(dir))
                        throw new Error('direction 须为 up/down/left/right');
                    const session = await requireSession();
                    await scrollPage(session, dir, Number(args.amount) || 3);
                    log('scroll', dir);
                    return { ok: true, ...(await snapshotAfter(async () => null)) };
                }
                catch (e) {
                    return { ok: false, error: String(e?.message || e) };
                }
            },
        }),
        defineTool({
            name: 'browser_evaluate',
            description: '在页面执行 JavaScript 表达式并返回结果（JSON 序列化）。用于处理 ref 树定位不到的元素（弹窗、iframe、自定义控件）。',
            parameters: {
                expression: { type: 'string', required: true, description: '要执行的 JS 表达式，返回 JSON 可序列化的值' },
            },
            output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
            async execute(args) {
                try {
                    const session = await requireSession();
                    const value = await evaluateJson(session, String(args.expression));
                    log('evaluate', String(args.expression).slice(0, 120));
                    return { ok: true, value };
                }
                catch (e) {
                    return { ok: false, error: String(e?.message || e) };
                }
            },
        }),
        defineTool({
            name: 'browser_screenshot',
            description: '截图保存为文件并返回路径。需要看页面画面（图表/验证码/布局）时，用 vision_describe 读取该路径。',
            parameters: {},
            output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
            async execute() {
                try {
                    const session = await requireSession();
                    const base64 = await captureScreenshot(session);
                    const file = path.join(state.screenshotDir, `shot-${Date.now()}.jpg`);
                    fs.writeFileSync(file, Buffer.from(base64, 'base64'));
                    state.lastScreenshotPath = file;
                    log('screenshot', file);
                    return {
                        ok: true,
                        path: file,
                        bytes: fs.statSync(file).size,
                        hint: '如需看图内容，调用 vision_describe，image 参数传此路径',
                    };
                }
                catch (e) {
                    return { ok: false, error: String(e?.message || e) };
                }
            },
        }),
        defineTool({
            name: 'browser_stop',
            description: '关闭 AI 浏览器实例。',
            parameters: {},
            output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
            async execute() {
                try {
                    return await stopBrowser();
                }
                catch (e) {
                    return { ok: false, error: String(e?.message || e) };
                }
            },
        }),
        defineTool({
            name: 'browser_status',
            description: '查询浏览器运行状态（运行中/URL/标题/元素数）。',
            parameters: {},
            output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
            async execute() {
                try {
                    return { ok: true, ...(await statusFields()) };
                }
                catch (e) {
                    return { ok: false, error: String(e?.message || e) };
                }
            },
        }),
    ];
    ctx.effect(() => {
        for (const tool of tools)
            ctx.tools.register(tool);
        return () => {
            // 插件卸载/重载时清理浏览器进程
            if (state.conn) {
                try {
                    state.conn.close();
                }
                catch { }
            }
            killChrome(state.runtime);
            state.runtime = null;
        };
    }, '@dsh-external/dsh-browser: tools');
    // ═══ UI 路由（供 client 面板）═══
    ctx.effect(() => {
        const webServer = ctx.webServer;
        if (!webServer)
            return;
        return webServer.register({
            kind: 'exact',
            path: '/api/dsh-browser/status',
            handler: async (_req, res) => {
                try {
                    const body = JSON.stringify({ ok: true, ...(await statusFields()), log: state.log.slice(-10) });
                    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
                    res.end(body);
                }
                catch (e) {
                    res.writeHead(500, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
                }
            },
        });
    }, '@dsh-external/dsh-browser: status route');
    ctx.effect(() => {
        const webServer = ctx.webServer;
        if (!webServer)
            return;
        return webServer.register({
            kind: 'exact',
            path: '/api/dsh-browser/screenshot',
            handler: async (_req, res) => {
                try {
                    if (!state.lastScreenshotPath || !fs.existsSync(state.lastScreenshotPath)) {
                        res.writeHead(404, { 'content-type': 'application/json' });
                        res.end(JSON.stringify({ ok: false, error: 'no screenshot yet' }));
                        return;
                    }
                    const data = fs.readFileSync(state.lastScreenshotPath);
                    res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
                    res.end(data);
                }
                catch (e) {
                    res.writeHead(500, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
                }
            },
        });
    }, '@dsh-external/dsh-browser: screenshot route');
    ctx.effect(() => {
        const webServer = ctx.webServer;
        if (!webServer)
            return;
        return webServer.register({
            kind: 'exact',
            path: '/api/dsh-browser/allow',
            handler: async (req, res) => {
                const respond = (status, payload) => {
                    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
                    res.end(JSON.stringify(payload));
                };
                try {
                    if (req.method === 'POST') {
                        // 读 body
                        const body = await new Promise((resolve) => {
                            let data = '';
                            req.on('data', (chunk) => { data += chunk; });
                            req.on('end', () => {
                                try {
                                    resolve(JSON.parse(data || '{}'));
                                }
                                catch {
                                    resolve(null);
                                }
                            });
                            req.on('error', () => resolve(null));
                        });
                        if (!body || typeof body.allow !== 'boolean')
                            return respond(400, { ok: false, error: 'allow 须为布尔值' });
                        allowBrowser = body.allow;
                        savePrefs();
                        log('allow', String(allowBrowser));
                        return respond(200, { ok: true, allow: allowBrowser });
                    }
                    respond(200, { ok: true, allow: allowBrowser });
                }
                catch (e) {
                    respond(500, { ok: false, error: String(e?.message || e) });
                }
            },
        });
    }, '@dsh-external/dsh-browser: allow route');
    ctx.logger?.info?.('[dsh-browser] loaded (headless=' + config.headless + ', port=' + config.port + ')');
}
//# sourceMappingURL=index.js.map