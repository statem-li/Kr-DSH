# dsh-image-gen —— DSH 生图插件

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供生图能力：注册 `generate_image` 工具，当对话模型要求生成图片时，自动调用你配置的生图模型（OpenAI 兼容 images/generations 接口）出图。

## 功能

- **generate_image 工具**：模型在对话中直接调用，提示词 → 生图模型 → 返回图片 URL
- **host 接口**：`GET /api/image-gen/snapshot`（模型枚举）、`POST /api/image-gen/config`（保存生图模型选择）
- **配置持久化**：生图模型选择保存在工作区 `.dsh/model-router.json`（imageActive 字段）
- **自动读取 provider 配置**：复用 DSH 的 provider 配置（baseURL / apiKeyEnv）与凭据库，无需重复填写 API Key

## ⚠️ 配置入口已合并（2026-08）

生图模型的**配置界面**已合并到 **dsh-vision-helper** 的「设置 → **AI 模型**」统一页（一个页面同时配置辅助视觉模型与生图模型）。

- 本仓库 `lib/client.js` 已更新为**不再注册「生图模型」设置分区**（配置入口统一到 AI 模型页）
- 插件本体（`generate_image` 工具 + host 接口）不变，生图功能不受影响
- **注意**：该 client bundle 是修改后的编译产物。若从其他渠道重新构建/覆盖本插件，`lib/client.js` 会被还原为带独立分区版本——届时只需重新复制本仓库的 `lib/client.js`，或在 vision-helper 的 AI 模型页正常工作时不理会（两个分区并存，功能不冲突）。

## 安装

1. 将 dsh-image-gen 目录复制到 DSH profile 的插件目录：

   ```bash
   # Windows web profile 示例
   cp -r dsh-image-gen ~/.dsh/profiles/web/plugins/
   ```

2. 在 profile 的 cordis.patch.yml 追加挂载声明（见 cordis.patch.yml）。

3. 重启 DSH。

## 配置生图模型

方式一（推荐）：设置 → **AI 模型** → 生图模型区块（dsh-vision-helper 提供）。

方式二：直接编辑工作区 `.dsh/model-router.json`：

```json
{
  "image": [{ "provider": "sensenova", "model": "sensenova-u1-fast" }],
  "imageActive": "sensenova/sensenova-u1-fast"
}
```

## 生图调用

generate_image 工具通过 PowerShell Invoke-RestMethod 调用 `{baseURL}/images/generations`（强制 TLS 1.2、danger-full-access 沙箱策略），响应返回：

```json
{
  "ok": true,
  "model": "sensenova/sensenova-u1-fast",
  "imageUrl": "https://.../xxx.png",
  "imageDataUrl": null
}
```

- 图片 URL 为预签名地址，通常 24 小时内有效
- 生图耗时约 1 分钟（取决于模型），工具超时上限 5 分钟

## 许可

MIT
