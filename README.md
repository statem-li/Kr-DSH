# dsh-image-gen —— DSH 生图插件

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供生图能力：注册 generate_image 工具，当对话模型要求生成图片时，自动调用你配置的生图模型（OpenAI 兼容 images/generations 接口）出图。

## 功能

- **generate_image 工具**：模型在对话中直接调用，提示词 → 生图模型 → 返回图片 URL
- **设置页「生图模型」**：选择当前生图模型（支持多个 provider / 模型切换）
- **配置持久化**：生图模型选择保存在工作区 .dsh/model-router.json（imageActive 字段）
- **自动读取 provider 配置**：复用 DSH 的 provider 配置（aseURL / piKeyEnv）与凭据库，无需重复填写 API Key

## 安装

1. 将 dsh-image-gen 目录复制到 DSH profile 的插件目录：

   `ash
   # Windows web profile 示例
   cp -r dsh-image-gen ~/.dsh/profiles/web/plugins/
   `

2. 在 profile 的 cordis.patch.yml 追加挂载声明：

   `yaml
   - insert:
       - id: dsh-image-gen
         name: dsh-image-gen
   `

3. 重启 DSH。

## 配置生图模型

方式一：设置 → **生图模型** 页面选择（下拉或列表按钮）。

方式二：直接编辑工作区 .dsh/model-router.json：

`json
{
  "image": [{ "provider": "sensenova", "model": "sensenova-u1-fast" }],
  "imageActive": "sensenova/sensenova-u1-fast"
}
`

生图插件从 DSH 的 provider 配置（llm 可配置 provider 目录）读取 aseURL 与 piKeyEnv，API Key 从 DSH 凭据库解析（如 .credentials.yaml 中的 SENSENOVA_API_KEY）。

## 生图调用

generate_image 工具通过 PowerShell Invoke-RestMethod 调用 {baseURL}/images/generations（强制 TLS 1.2、danger-full-access 沙箱策略），响应返回：

`json
{
  "ok": true,
  "model": "sensenova/sensenova-u1-fast",
  "imageUrl": "https://.../xxx.png",
  "imageDataUrl": null
}
`

- 图片 URL 为预签名地址，通常 24 小时内有效
- 生图耗时约 1 分钟（取决于模型），工具超时上限 5 分钟

## 许可

MIT
