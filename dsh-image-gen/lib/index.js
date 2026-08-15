// dsh-image-gen host half — 生图工具(generate_image)
// - 生图模型配置:工作区 .dsh/model-router.json 的 imageActive(当前生图模型)
// - 调用 provider baseURL 的 images/generations HTTP 接口(PowerShell Invoke-RestMethod, danger-full-access)
// - HTTP API:snapshot(模型列表+当前生图模型) / config(保存)
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-image-gen'
export const inject = ['llm', 'fs', 'sandboxPolicy', 'shell', 'settings', 'webServer', 'tools']

export function apply(ctx) {
  let configPath = 'model-router.json'
  let imageActive = ''

  function splitKey(key) {
    if (typeof key !== 'string') return null
    const idx = key.indexOf('/')
    if (idx <= 0 || idx === key.length - 1) return null
    return { provider: key.slice(0, idx), model: key.slice(idx + 1) }
  }

  function ensureConfigPath() {
    try {
      const root = ctx.sandboxPolicy.workspaceRoot
      if (typeof root === 'string' && root.length > 0) {
        configPath = root.replace(/[\\/]+$/, '') + '/.dsh/model-router.json'
      }
    } catch (error) {
      console.error('dsh-image-gen: failed to resolve workspace root:', error)
    }
  }

  async function loadConfig() {
    try {
      const target = await ctx.fs.resolve(configPath)
      const text = await ctx.fs.readText(target)
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed.imageActive === 'string') imageActive = parsed.imageActive
      if (!imageActive && Array.isArray(parsed && parsed.image) && parsed.image.length > 0) {
        imageActive = parsed.image[0].provider + '/' + parsed.image[0].model
      }
    } catch (error) {
      console.log('dsh-image-gen: no config yet')
    }
  }

  async function saveImageActive(key) {
    const target = await ctx.fs.resolve(configPath)
    let parsed = {}
    try {
      parsed = JSON.parse(await ctx.fs.readText(target))
    } catch (error) { /* fresh file */ }
    const next = {
      vision: Array.isArray(parsed.vision) ? parsed.vision : [],
      image: Array.isArray(parsed.image) ? parsed.image : [],
      visionActive: typeof parsed.visionActive === 'string' ? parsed.visionActive : '',
      imageActive: key,
    }
    await ctx.fs.writeText(target, JSON.stringify(next, null, 2))
    imageActive = key
  }

  function imageProfile(providerId) {
    try {
      const entries = ctx.llm.listConfigurableProviders()
      const entry = entries.find(e => e.provider === providerId)
      if (!entry || !entry.settingsNs) return null
      const section = ctx.settings.get(entry.settingsNs)
      if (!section || typeof section !== 'object') return null
      let node = section
      const path = Array.isArray(entry.settingsPath) ? entry.settingsPath : []
      for (const key of path) {
        if (node && typeof node === 'object' && key in node) node = node[key]
        else return null
      }
      return node && typeof node === 'object' ? node : null
    } catch (error) {
      return null
    }
  }

  async function resolveApiKey(profile) {
    if (!profile || typeof profile.apiKeyEnv !== 'string' || profile.apiKeyEnv.length === 0) return null
    const credentials = ctx.get('credentials')
    if (!credentials) return null
    try {
      const resolved = await credentials.resolve(profile.apiKeyEnv)
      return resolved ? resolved.value : null
    } catch (error) {
      return null
    }
  }

  async function generateViaHttp(active, prompt, signal) {
    const profile = imageProfile(active.provider)
    if (!profile || typeof profile.baseURL !== 'string' || profile.baseURL.length === 0) {
      return { ok: false, error: 'provider "' + active.provider + '" 未配置 baseURL' }
    }
    const apiKey = await resolveApiKey(profile)
    if (!apiKey) {
      return { ok: false, error: '未找到生图 API 凭据（' + profile.apiKeyEnv + '）：请在凭据设置中配置。' }
    }
    const base = profile.baseURL.replace(/[\\/]+$/, '')
    const safePrompt = String(prompt).replace(/'/g, "''")
    const command = "$ErrorActionPreference = 'Stop'; [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; try { $b = @{ model = '" + active.model + "'; prompt = '" + safePrompt + "'; n = 1 } | ConvertTo-Json -Compress; $r = Invoke-RestMethod -UseBasicParsing -Uri '" + base + "/images/generations' -Method Post -Headers @{ Authorization = 'Bearer " + apiKey + "'; 'Content-Type' = 'application/json' } -Body $b -TimeoutSec 300; @{ ok = $true; data = @($r.data) } | ConvertTo-Json -Depth 6 -Compress } catch { $inner = ''; if ($_.Exception.InnerException) { $inner = $_.Exception.InnerException.Message }; @{ ok = $false; error = $_.Exception.Message; inner = $inner; ps = $PSVersionTable.PSVersion.ToString() } | ConvertTo-Json -Compress }"
    try {
      const policy = ctx.sandboxPolicy.resolve({ mode: 'danger-full-access' })
      const spec = ctx.shell.resolve({ command, timeoutMs: 320000, signal, sandboxPolicy: policy })
      const result = await ctx.shell.run(spec)
      const stdout = result.stdout && result.stdout.text ? result.stdout.text : ''
      const stderr = result.stderr && result.stderr.text ? result.stderr.text : ''
      if (result.exitCode !== 0) {
        return { ok: false, error: '生图 API 调用失败 (exit ' + result.exitCode + '): ' + (stderr || stdout || '未知错误') }
      }
      let parsed
      try {
        parsed = JSON.parse(stdout)
      } catch (error) {
        return { ok: false, error: '生图 API 响应解析失败: ' + stdout.slice(0, 400) }
      }
      if (!parsed || parsed.ok !== true) {
        return { ok: false, error: '生图 API 错误: ' + JSON.stringify(parsed) }
      }
      const item = parsed.data && parsed.data[0]
      if (!item) return { ok: false, error: '生图 API 返回空结果' }
      return {
        ok: true,
        model: active.provider + '/' + active.model,
        imageUrl: item.url || null,
        imageDataUrl: item.b64_json ? 'data:image/png;base64,' + item.b64_json : null,
      }
    } catch (error) {
      return { ok: false, error: '生图 API 调用异常: ' + String(error && error.message ? error.message : error) }
    }
  }

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'generate_image',
    description: '调用已配置的生图模型生成一张图片。当用户要求生成、绘制、创建图片或图像时使用本工具，提示词越详细越好。若返回 ok=false，请把 error 信息转告用户（通常需要先在「设置 → 生图模型」中选择生图模型）。',
    parameters: {
      prompt: { type: 'string', required: true, description: '详细的图片生成提示词，建议包含主体、风格、场景、构图、光线等细节。' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      const active = splitKey(imageActive)
      if (!active) {
        return { ok: false, error: '尚未配置生图模型：请在「设置 → 生图模型」中选择生图模型。' }
      }
      return generateViaHttp(active, String(args.prompt), exec.signal)
    },
  })))

  function jsonResponse(res, status, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(body)
  }

  function readBody(req) {
    return new Promise((resolve) => {
      let data = ''
      req.on('data', (chunk) => { data += chunk })
      req.on('end', () => {
        try { resolve(JSON.parse(data || '{}')) } catch { resolve(null) }
      })
      req.on('error', () => resolve(null))
    })
  }

  // 设置页快照:providers + 当前生图模型
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/image-gen/snapshot',
    handler: async (req, res) => {
      try {
        const providers = []
        for (const info of ctx.llm.listProviders()) {
          let models = []
          try {
            models = await ctx.llm.listModels(info.id)
          } catch (error) { /* no discovery */ }
          providers.push({
            id: info.id,
            name: info.name,
            models: models.map(m => ({ id: m.id, name: m.name || m.id })),
          })
        }
        jsonResponse(res, 200, { ok: true, providers, imageActive })
      } catch (error) {
        jsonResponse(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    },
  }))

  // 保存当前生图模型
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/image-gen/config',
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') return jsonResponse(res, 405, { ok: false, error: 'method not allowed' })
        const body = await readBody(req)
        const key = body && typeof body.imageActive === 'string' ? body.imageActive : ''
        await saveImageActive(key)
        jsonResponse(res, 200, { ok: true })
      } catch (error) {
        jsonResponse(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    },
  }))

  ensureConfigPath()
  void loadConfig()
}
