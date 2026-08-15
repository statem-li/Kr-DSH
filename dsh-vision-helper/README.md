# dsh-vision-helper —— DSH 辅助视觉模型插件

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供**图片 → 文本描述**的辅助视觉能力：注册 `vision_describe` 工具，让纯文本主模型也能"看图"（页面截图、验证码、图表、图片内容等）。

## 功能

- **vision_describe 工具**：模型在对话中直接调用，传图片（文件路径 / data URL / base64）→ 返回文本描述
- **模型路由**：优先读工作区 `.dsh/model-router.json` 的 `visionActive`（如 `sensenova/sensenova-6.8-flash-lite`），可用 `visionModels` 配置覆盖，失败自动降级尝试下一个模型
- **自动读取 provider 配置**：复用 DSH 的 provider 配置（baseURL / apiKeyEnv）与凭据库，无需重复填写 API Key
- **max_tokens 自动重试**：推理型视觉模型思维链吃满配额（`finish=length` 且无正文）时，自动以 4 倍 max_tokens（上限 16384）重试一次
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

## 实现说明

- 传输：图片先落临时文件，PowerShell `Invoke-RestMethod` 调 `{baseURL}/chat/completions`（OpenAI 兼容），避开命令行长度上限
- 响应取 `choices[0].message.content`，忽略推理链字段

## 许可

MIT
