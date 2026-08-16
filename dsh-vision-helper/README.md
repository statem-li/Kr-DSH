# dsh-vision-helper —— DSH 辅助视觉模型插件

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供**图片 → 文本描述**的辅助视觉能力：注册 `vision_describe` 工具，让纯文本主模型也能"看图"（页面截图、验证码、图表、图片内容等）。

## 功能

- **vision_describe 工具**：模型在对话中直接调用，传图片（文件路径 / data URL / base64）→ 返回文本描述
- **非多模态模型聊天贴图降级**：聊天中粘贴/拖拽/上传图片时，若当前主模型不支持图片输入，自动用辅助视觉模型把图片转成文本描述再交给主模型；聊天历史仍正常显示图片缩略图（纯插件实现，零核心改动，官方更新不冲突）
- **host 图片准入绕行**：包装 `llm.resolveModelInfo`，放行非多模态模型的图片提交，让降级链路有机会执行
- **模型路由**：优先读工作区 `.dsh/model-router.json` 的 `visionActive`（如 `sensenova/sensenova-6.8-flash-lite`），可用 `visionModels` 配置覆盖，失败自动降级尝试下一个模型
- **自动读取 provider 配置**：复用 DSH 的 provider 配置（baseURL / apiKeyEnv）与凭据库，无需重复填写 API Key
- **max_tokens 自动重试**：推理型视觉模型思维链吃满配额（`finish=length` 且无正文）时，自动以 4 倍 max_tokens（上限 16384）重试一次
- **描述缓存**：图片描述按附件 id 缓存（上限 `fallbackCacheSize`），历史图片每轮请求只描述一次
- **配置快照接口**：`GET /api/vision-helper/snapshot` 返回当前模型列表

## 安装

1. 将 dsh-vision-helper 目录复制到 DSH profile 的插件目录：

   ```bash
   # Windows web profile 示例
   cp -r dsh-vision-helper ~/.dsh/profiles/web/plugins/
   ```

2. 在 profile 的 cordis.patch.yml 追加挂载声明：

   ```yaml
   - insert:
       - id: vision-helper
         name: dsh-vision-helper
   ```

3. 重启 DSH。

## 用法

对 AI 说"描述这张图片/这个截图"，或模型按需直接调用：

```
vision_describe({
  image: "C:/path/to/screenshot.jpg",   // 文件路径（相对工作区或绝对）、data URL 或 base64
  prompt: "可选：描述要求，缺省为通用中文描述"
})
```

返回：

```json
{
  "ok": true,
  "text": "图片展示了……",
  "model": "sensenova/sensenova-6.8-flash-lite",
  "image": "C:/path/to/screenshot.jpg"
}
```

## 配置

编辑工作区 `.dsh/model-router.json`（与生图插件共用）：

```json
{
  "vision": [{ "provider": "sensenova", "model": "sensenova-6.8-flash-lite" }],
  "visionActive": "sensenova/sensenova-6.8-flash-lite"
}
```

API Key 从 DSH 凭据库解析（如 `.credentials.yaml` 中的 `SENSENOVA_API_KEY`）。

聊天贴图降级可选配置（profile 的 cordis.patch.yml 中给本插件加 `config`）：

| 配置 | 默认 | 说明 |
|---|---|---|
| `textModelImageFallback` | `true` | 非多模态模型贴图自动转文本描述的总开关，设 `false` 恢复原报错行为 |
| `fallbackDescribePrompt` | 中文通用描述 | 降级时发往辅助视觉模型的描述提示词 |
| `fallbackCacheSize` | `256` | 图片描述缓存条数上限（超出后清空重建） |

## 实现说明

- 传输：图片先落临时文件，PowerShell `Invoke-RestMethod` 调 `{baseURL}/chat/completions`（OpenAI 兼容），避开命令行长度上限
- 响应取 `choices[0].message.content`，忽略推理链字段

## 许可

MIT
