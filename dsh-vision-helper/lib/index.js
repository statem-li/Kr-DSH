/**
 * @dsh-external/dsh-vision-helper — 辅助视觉模型插件
 *
 * 给纯文本主模型当「眼睛」：把图片（文件路径 / data URL / base64）交给
 * 已配置的视觉模型（默认 sensenova/sensenova-6.8-flash-lite），返回文本描述。
 *
 * 用途：
 * - 浏览器插件截图兜底：AI 截完图拿不到视觉时，调 vision_describe 看页面
 * - 任何「图片 → 文本」的辅助理解需求
 *
 * 模型解析顺序：Config.visionModels > 工作区 .dsh/model-router.json 的
 * visionActive/vision[] > 内置默认 sensenova/sensenova-6.8-flash-lite。
 * 失败自动降级到列表里下一个可用模型。
 *
 * 传输：图片先落临时文件，PowerShell 读文件转 base64 调
 * POST {baseURL}/chat/completions（openai-completions 兼容），
 * 避开命令行长度上限（~32K 字符），沿用 dsh-image-gen 已验证的通道。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import z from 'schemastery';
export const name = '@dsh-external/dsh-vision-helper';
export const inject = ['tools', 'llm', 'settings', 'shell', 'sandboxPolicy', 'fs', 'webServer'];
export const Config = z.object({
    modelRouterPath: z.string().default(''),
    visionModels: z.array(z.string()).default([]),
    timeoutMs: z.number().default(150000),
    maxTokens: z.number().default(2048),
    defaultPrompt: z.string().default('用简洁的中文描述这张图片的关键内容：画面主体、布局结构、可见文字、界面元素。不要编造细节，看不清就直说。'),
});
const DEFAULT_VISION = 'sensenova/sensenova-6.8-flash-lite';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB 输入上限，防呆
// ── 工具函数 ────────────────────────────────────────────
function splitKey(key) {
    if (typeof key !== 'string')
        return null;
    const idx = key.indexOf('/');
    if (idx <= 0 || idx === key.length - 1)
        return null;
    return { provider: key.slice(0, idx), model: key.slice(idx + 1) };
}
function psEscape(value) {
    return String(value).replace(/'/g, "''");
}
function imageFileExt(dataUrlPrefix) {
    const m = /^data:image\/(png|jpe?g|webp|gif)/.exec(dataUrlPrefix);
    if (!m)
        return 'png';
    const ext = m[1];
    return ext === 'jpeg' ? 'jpg' : ext === 'jpe' ? 'jpg' : ext;
}
function isBase64Like(value) {
    return /^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 100;
}
/**
 * 把 image 参数归一成 { dataUrlPrefix, base64 }。
 * 支持：本地文件路径（相对工作区或绝对）、file://、data URL、裸 base64。
 */
async function resolveImageData(ctx, image) {
    const raw = String(image || '').trim();
    if (!raw)
        throw new Error('image 参数为空：需要图片文件路径、data URL 或 base64');
    if (raw.startsWith('data:')) {
        const comma = raw.indexOf(',');
        if (comma <= 0)
            throw new Error('data URL 格式无效');
        const prefix = raw.slice(0, comma + 1);
        const base64 = raw.slice(comma + 1);
        if (!base64)
            throw new Error('data URL 内容为空');
        return { prefix, base64, ref: 'data-url' };
    }
    if (raw.startsWith('file://')) {
        const filePath = raw.slice('file://'.length);
        return readImageFile(ctx, filePath);
    }
    // 绝对路径直接检查（ctx.fs.resolve 只按工作区根解析相对路径）
    if (path.isAbsolute(raw) && fs.existsSync(raw) && fs.statSync(raw).isFile()) {
        return readImageFile(ctx, raw);
    }
    // 尝试按相对路径解析（相对工作区根）
    try {
        const resolved = await ctx.fs.resolve(raw);
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
            return readImageFile(ctx, resolved);
        }
    }
    catch {
        /* 不是文件路径，继续 */
    }
    if (isBase64Like(raw)) {
        return { prefix: 'data:image/png;base64,', base64: raw.replace(/\s+/g, ''), ref: 'base64' };
    }
    throw new Error(`无法识别 image 参数：既不是存在的文件（${raw.slice(0, 80)}…），也不是 data URL / base64`);
}
async function readImageFile(ctx, filePath) {
    const resolved = path.isAbsolute(filePath) ? filePath : await ctx.fs.resolve(filePath);
    if (!fs.existsSync(resolved))
        throw new Error(`图片文件不存在：${resolved}`);
    const stat = fs.statSync(resolved);
    if (!stat.isFile())
        throw new Error(`不是文件：${resolved}`);
    if (stat.size > MAX_IMAGE_BYTES)
        throw new Error(`图片过大（${stat.size} 字节，上限 ${MAX_IMAGE_BYTES}）`);
    const buf = fs.readFileSync(resolved);
    const ext = path.extname(resolved).toLowerCase().replace('.', '') || 'png';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const base64 = buf.toString('base64');
    return { prefix: `data:image/${mime};base64,`, base64, ref: resolved };
}
/** 解析 provider 配置（baseURL / apiKeyEnv），沿用 dsh-image-gen 的读取路径 */
function providerConfig(ctx, providerId) {
    try {
        const entries = ctx.llm.listConfigurableProviders();
        const entry = entries.find((e) => e.provider === providerId);
        if (!entry || !entry.settingsNs)
            return null;
        const section = ctx.settings.get(entry.settingsNs);
        if (!section || typeof section !== 'object')
            return null;
        let node = section;
        const pathKeys = Array.isArray(entry.settingsPath) ? entry.settingsPath : [];
        for (const key of pathKeys) {
            if (node && typeof node === 'object' && key in node)
                node = node[key];
            else
                return null;
        }
        return node && typeof node === 'object' ? node : null;
    }
    catch {
        return null;
    }
}
async function resolveApiKey(ctx, profile) {
    if (!profile || typeof profile.apiKeyEnv !== 'string' || !profile.apiKeyEnv)
        return null;
    const credentials = ctx.get('credentials');
    if (!credentials)
        return null;
    try {
        const resolved = await credentials.resolve(profile.apiKeyEnv);
        return resolved ? String(resolved.value) : null;
    }
    catch {
        return null;
    }
}
/** 模型列表：Config.visionModels > model-router.json > 默认 */
async function resolveVisionModels(ctx, config) {
    if (config.visionModels.length > 0)
        return [...config.visionModels];
    try {
        const routerPath = config.modelRouterPath || '.dsh/model-router.json';
        const target = await ctx.fs.resolve(routerPath);
        const text = await ctx.fs.readText(target);
        const parsed = JSON.parse(text);
        const list = [];
        const active = typeof parsed.visionActive === 'string' ? parsed.visionActive : '';
        if (active && splitKey(active))
            list.push(active);
        if (Array.isArray(parsed.vision)) {
            for (const item of parsed.vision) {
                if (item && typeof item.provider === 'string' && typeof item.model === 'string') {
                    const key = `${item.provider}/${item.model}`;
                    if (!list.includes(key))
                        list.push(key);
                }
            }
        }
        if (list.length > 0)
            return list;
    }
    catch {
        /* 无路由文件，用默认 */
    }
    return [DEFAULT_VISION];
}
/**
 * 调 chat/completions（PowerShell Invoke-RestMethod，danger-full-access 沙箱）。
 * 图片 base64 在 PS 侧从临时文件读，命令行只传路径，避免 32K 长度上限。
 */
async function callVisionChat(ctx, baseURL, apiKey, model, imageBase64, prefix, prompt, maxTokens, timeoutMs, signal) {
    // 图片落临时文件
    const tmpFile = path.join(os.tmpdir(), `dsh-vision-${process.pid}-${crypto.randomBytes(6).toString('hex')}.${imageFileExt(prefix)}`);
    fs.writeFileSync(tmpFile, Buffer.from(imageBase64, 'base64'));
    const base = String(baseURL).replace(/[\\/]+$/, '');
    const escaped = {
        model: psEscape(model),
        prompt: psEscape(prompt),
        key: psEscape(apiKey),
        file: psEscape(tmpFile),
        url: psEscape(`${base}/chat/completions`),
    };
    const command = [
        "$ErrorActionPreference = 'Stop'",
        "[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12",
        `$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes('${escaped.file}'))`,
        `$body = @{ model = '${escaped.model}'; messages = @(@{ role = 'user'; content = @(@{ type = 'text'; text = '${escaped.prompt}' }, @{ type = 'image_url'; image_url = @{ url = "data:image/png;base64,$b64" } }) }); max_tokens = ${maxTokens} } | ConvertTo-Json -Depth 8 -Compress`,
        'try {',
        `  $r = Invoke-RestMethod -UseBasicParsing -Uri '${escaped.url}' -Method Post -Headers @{ Authorization = 'Bearer ${escaped.key}'; 'Content-Type' = 'application/json' } -Body $body -TimeoutSec ${Math.floor(timeoutMs / 1000)}`,
        '  $m = $r.choices[0].message',
        "  @{ ok = $true; content = $m.content; finish = $r.choices[0].finish_reason; model = $r.model } | ConvertTo-Json -Depth 4 -Compress",
        '} catch {',
        "  $detail = ''",
        "  if ($_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message }",
        "  @{ ok = $false; error = $_.Exception.Message; detail = $detail } | ConvertTo-Json -Depth 4 -Compress",
        '}',
    ].join('; ');
    try {
        const policy = ctx.sandboxPolicy.resolve({ mode: 'danger-full-access' });
        const spec = ctx.shell.resolve({ command, timeoutMs, signal, sandboxPolicy: policy });
        const result = await ctx.shell.run(spec);
        const stdout = result.stdout && result.stdout.text ? result.stdout.text : '';
        const stderr = result.stderr && result.stderr.text ? result.stderr.text : '';
        if (result.exitCode !== 0) {
            return { ok: false, error: `shell 退出码 ${result.exitCode}`, detail: (stderr || stdout || '').slice(0, 500) };
        }
        let parsed = null;
        try {
            parsed = JSON.parse(stdout);
        }
        catch {
            return { ok: false, error: '响应解析失败', detail: stdout.slice(0, 400) };
        }
        return parsed || { ok: false, error: '空响应' };
    }
    catch (error) {
        return { ok: false, error: String(error?.message ?? error) };
    }
    finally {
        try {
            fs.rmSync(tmpFile, { force: true });
        }
        catch { /* 清理失败忽略 */ }
    }
}
// ── 插件主体 ────────────────────────────────────────────
export function apply(ctx, config) {
    // ═══ 生图能力（自 dsh-image-gen 合并；模型配置存 model-router.json 的 imageActive）═══
    let imageActive = '';
    async function loadImageConfig() {
        try {
            const target = await ctx.fs.resolve(config.modelRouterPath || '.dsh/model-router.json');
            const parsed = JSON.parse(await ctx.fs.readText(target));
            if (parsed && typeof parsed.imageActive === 'string')
                imageActive = parsed.imageActive;
            if (!imageActive && Array.isArray(parsed?.image) && parsed.image.length > 0) {
                imageActive = parsed.image[0].provider + '/' + parsed.image[0].model;
            }
        }
        catch { /* 无配置 */ }
    }
    async function saveImageActive(key) {
        const target = await ctx.fs.resolve(config.modelRouterPath || '.dsh/model-router.json');
        let parsed = {};
        try {
            parsed = JSON.parse(await ctx.fs.readText(target));
        }
        catch { /* 无文件则新建 */ }
        const list = Array.isArray(parsed.image) ? parsed.image : [];
        const parts = splitKey(key);
        if (parts && !list.some((item) => item.provider === parts.provider && item.model === parts.model)) {
            list.push({ provider: parts.provider, model: parts.model });
        }
        const next = { ...parsed, image: list, imageActive: key };
        await ctx.fs.writeText(target, JSON.stringify(next, null, 2));
        imageActive = key;
    }
    async function generateViaHttp(active, prompt, signal) {
        const profile = providerConfig(ctx, active.provider);
        if (!profile || typeof profile.baseURL !== 'string' || !profile.baseURL) {
            return { ok: false, error: `provider "${active.provider}" 未配置 baseURL` };
        }
        const apiKey = await resolveApiKey(ctx, profile);
        if (!apiKey) {
            return { ok: false, error: `未找到生图 API 凭据（${profile.apiKeyEnv || '未知 env'}）：请在凭据设置中配置。` };
        }
        const base = String(profile.baseURL).replace(/[\\/]+$/, '');
        const safePrompt = String(prompt).replace(/'/g, "''");
        const command = "$ErrorActionPreference = 'Stop'; [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; try { $b = @{ model = '" + active.model + "'; prompt = '" + safePrompt + "'; n = 1 } | ConvertTo-Json -Compress; $r = Invoke-RestMethod -UseBasicParsing -Uri '" + base + "/images/generations' -Method Post -Headers @{ Authorization = 'Bearer " + apiKey + "'; 'Content-Type' = 'application/json' } -Body $b -TimeoutSec 300; @{ ok = $true; data = @($r.data) } | ConvertTo-Json -Depth 6 -Compress } catch { $inner = ''; if ($_.Exception.InnerException) { $inner = $_.Exception.InnerException.Message }; @{ ok = $false; error = $_.Exception.Message; inner = $inner; ps = $PSVersionTable.PSVersion.ToString() } | ConvertTo-Json -Compress }";
        try {
            const policy = ctx.sandboxPolicy.resolve({ mode: 'danger-full-access' });
            const spec = ctx.shell.resolve({ command, timeoutMs: 320000, signal, sandboxPolicy: policy });
            const result = await ctx.shell.run(spec);
            const stdout = result.stdout && result.stdout.text ? result.stdout.text : '';
            const stderr = result.stderr && result.stderr.text ? result.stderr.text : '';
            if (result.exitCode !== 0) {
                return { ok: false, error: `生图 API 调用失败 (exit ${result.exitCode}): ${(stderr || stdout || '未知错误').slice(0, 500)}` };
            }
            let parsed = null;
            try {
                parsed = JSON.parse(stdout);
            }
            catch {
                return { ok: false, error: '生图 API 响应解析失败: ' + stdout.slice(0, 400) };
            }
            if (!parsed || parsed.ok !== true) {
                return { ok: false, error: '生图 API 错误: ' + JSON.stringify(parsed).slice(0, 500) };
            }
            const item = parsed.data && parsed.data[0];
            if (!item)
                return { ok: false, error: '生图 API 返回空结果' };
            return {
                ok: true,
                model: `${active.provider}/${active.model}`,
                imageUrl: item.url || null,
                imageDataUrl: item.b64_json ? 'data:image/png;base64,' + item.b64_json : null,
            };
        }
        catch (error) {
            return { ok: false, error: '生图 API 调用异常: ' + String(error?.message ?? error) };
        }
    }
    async function describe(imageArg, promptArg, signal) {
        const { prefix, base64, ref } = await resolveImageData(ctx, imageArg);
        const prompt = String(promptArg || '').trim() || config.defaultPrompt;
        const models = await resolveVisionModels(ctx, config);
        const failures = [];
        for (const key of models) {
            const active = splitKey(key);
            if (!active)
                continue;
            const profile = providerConfig(ctx, active.provider);
            if (!profile || typeof profile.baseURL !== 'string' || !profile.baseURL) {
                failures.push(`${key}: provider "${active.provider}" 未配置 baseURL`);
                continue;
            }
            const apiKey = await resolveApiKey(ctx, profile);
            if (!apiKey) {
                failures.push(`${key}: 未找到 API 凭据（${profile.apiKeyEnv || '未知 env'}），请先在凭据设置中配置`);
                continue;
            }
            let res = await callVisionChat(ctx, profile.baseURL, apiKey, active.model, base64, prefix, prompt, config.maxTokens, config.timeoutMs, signal);
            // 推理链吃满配额（finish=length 且无正文）：加大 max_tokens 重试一次
            if (res.ok && !res.content && res.finish === 'length') {
                const bigger = Math.min(config.maxTokens * 4, 16384);
                if (bigger > config.maxTokens) {
                    res = await callVisionChat(ctx, profile.baseURL, apiKey, active.model, base64, prefix, prompt, bigger, config.timeoutMs, signal);
                }
            }
            if (res.ok && typeof res.content === 'string' && res.content.trim().length > 0) {
                return {
                    ok: true,
                    text: res.content.trim(),
                    model: `${active.provider}/${active.model}`,
                    image: ref.length > 120 ? `…${ref.slice(-117)}` : ref,
                };
            }
            if (res.ok && !res.content) {
                failures.push(`${key}: 模型未返回正文（finish=${res.finish || 'unknown'}，可能 max_tokens 不足）`);
            }
            else {
                failures.push(`${key}: ${res.error || '未知错误'}${res.detail ? ' — ' + String(res.detail).slice(0, 300) : ''}`);
            }
        }
        throw new Error(`所有视觉模型都失败了。尝试顺序：[${models.join(', ')}]\n` +
            failures.map((f) => `- ${f}`).join('\n'));
    }
    // 工具注册（ctx.effect：fiber dispose 自动注销）
    ctx.effect(() => ctx.tools.register(defineTool({
        name: 'vision_describe',
        description: '辅助视觉：用视觉模型描述一张图片，返回文本。需要看图（页面截图、验证码、图表、图片内容）时使用，主模型无需图片能力。',
        parameters: {
            image: {
                type: 'string',
                required: true,
                description: '图片：本地文件路径（相对工作区或绝对）、data URL 或 base64',
            },
            prompt: {
                type: 'string',
                description: '可选：描述要求，缺省为通用中文描述',
            },
        },
        output: {
            schema: { type: 'json' },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        },
        async execute(args, exec) {
            return describe(String(args.image), args.prompt, exec?.signal);
        },
    })), '@dsh-external/dsh-vision-helper: vision_describe');
    // generate_image：生图工具（自 dsh-image-gen 合并）
    ctx.effect(() => ctx.tools.register(defineTool({
        name: 'generate_image',
        description: '调用已配置的生图模型生成一张图片。当用户要求生成、绘制、创建图片或图像时使用本工具，提示词越详细越好。若返回 ok=false，请把 error 信息转告用户（生图模型在「设置 → AI 模型」中配置）。',
        parameters: {
            prompt: {
                type: 'string',
                required: true,
                description: '详细的图片生成提示词，建议包含主体、风格、场景、构图、光线等细节。',
            },
        },
        output: {
            schema: { type: 'json' },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        },
        async execute(args, exec) {
            const active = splitKey(imageActive);
            if (!active) {
                return { ok: false, error: '尚未配置生图模型：请在「设置 → AI 模型」中选择生图模型。' };
            }
            return generateViaHttp(active, String(args.prompt), exec?.signal);
        },
    })), '@dsh-external/dsh-vision-helper: generate_image');
    // 模型配置快照：webServer 只读接口（供设置页 / 排查）
    ctx.effect(() => {
        const webServer = ctx.webServer;
        if (!webServer)
            return;
        return webServer.register({
            kind: 'exact',
            path: '/api/vision-helper/snapshot',
            handler: async (req, res) => {
                try {
                    const models = await resolveVisionModels(ctx, config);
                    const body = JSON.stringify({ ok: true, models, active: models[0] || null });
                    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
                    res.end(body);
                }
                catch (error) {
                    res.writeHead(500, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
                }
            },
        });
    });
    // ── 配置接口：模型枚举（providers）+ 保存（config）──
    function jsonResponse(res, status, payload) {
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(payload));
    }
    function readBody(req) {
        return new Promise((resolve) => {
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
    }
    async function saveVisionActive(key) {
        const target = await ctx.fs.resolve(config.modelRouterPath || '.dsh/model-router.json');
        let parsed = {};
        try {
            parsed = JSON.parse(await ctx.fs.readText(target));
        }
        catch { /* 无文件则新建 */ }
        const list = Array.isArray(parsed.vision) ? parsed.vision : [];
        const parts = splitKey(key);
        if (parts && !list.some((item) => item.provider === parts.provider && item.model === parts.model)) {
            list.push({ provider: parts.provider, model: parts.model });
        }
        const next = { ...parsed, vision: list, visionActive: key };
        await ctx.fs.writeText(target, JSON.stringify(next, null, 2));
    }
    ctx.effect(() => {
        const webServer = ctx.webServer;
        if (!webServer)
            return;
        return webServer.register({
            kind: 'exact',
            path: '/api/vision-helper/providers',
            handler: async (_req, res) => {
                try {
                    const providers = [];
                    for (const info of ctx.llm.listProviders()) {
                        let models = [];
                        try {
                            models = await ctx.llm.listModels(info.id);
                        }
                        catch { /* 无发现 */ }
                        providers.push({
                            id: info.id,
                            name: info.name,
                            models: models.map((m) => ({
                                id: m.id,
                                name: m.name || m.id,
                                input: Array.isArray(m.input) ? m.input : null,
                            })),
                        });
                    }
                    const active = (await resolveVisionModels(ctx, config))[0] || null;
                    jsonResponse(res, 200, { ok: true, providers, active });
                }
                catch (error) {
                    jsonResponse(res, 500, { ok: false, error: String(error?.message ?? error) });
                }
            },
        });
    });
    ctx.effect(() => {
        const webServer = ctx.webServer;
        if (!webServer)
            return;
        return webServer.register({
            kind: 'exact',
            path: '/api/vision-helper/config',
            handler: async (req, res) => {
                try {
                    if (req.method !== 'POST')
                        return jsonResponse(res, 405, { ok: false, error: 'method not allowed' });
                    const body = await readBody(req);
                    const key = body && typeof body.visionActive === 'string' ? body.visionActive : '';
                    if (!splitKey(key))
                        return jsonResponse(res, 400, { ok: false, error: 'visionActive 须为 provider/model 格式' });
                    await saveVisionActive(key);
                    jsonResponse(res, 200, { ok: true, active: key });
                }
                catch (error) {
                    jsonResponse(res, 500, { ok: false, error: String(error?.message ?? error) });
                }
            },
        });
    });
    // ── 生图接口（兼容原 /api/image-gen/* 路径，AI 模型页生图区块依赖）──
    ctx.effect(() => {
        const webServer = ctx.webServer;
        if (!webServer)
            return;
        return webServer.register({
            kind: 'exact',
            path: '/api/image-gen/snapshot',
            handler: async (_req, res) => {
                try {
                    const providers = [];
                    for (const info of ctx.llm.listProviders()) {
                        let models = [];
                        try {
                            models = await ctx.llm.listModels(info.id);
                        }
                        catch { /* 无发现 */ }
                        providers.push({
                            id: info.id,
                            name: info.name,
                            models: models.map((m) => ({ id: m.id, name: m.name || m.id })),
                        });
                    }
                    jsonResponse(res, 200, { ok: true, providers, imageActive });
                }
                catch (error) {
                    jsonResponse(res, 500, { ok: false, error: String(error?.message ?? error) });
                }
            },
        });
    });
    ctx.effect(() => {
        const webServer = ctx.webServer;
        if (!webServer)
            return;
        return webServer.register({
            kind: 'exact',
            path: '/api/image-gen/config',
            handler: async (req, res) => {
                try {
                    if (req.method !== 'POST')
                        return jsonResponse(res, 405, { ok: false, error: 'method not allowed' });
                    const body = await readBody(req);
                    const key = body && typeof body.imageActive === 'string' ? body.imageActive : '';
                    if (!splitKey(key))
                        return jsonResponse(res, 400, { ok: false, error: 'imageActive 须为 provider/model 格式' });
                    await saveImageActive(key);
                    jsonResponse(res, 200, { ok: true, imageActive: key });
                }
                catch (error) {
                    jsonResponse(res, 500, { ok: false, error: String(error?.message ?? error) });
                }
            },
        });
    });
    void loadImageConfig();
}
//# sourceMappingURL=index.js.map