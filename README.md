# Kr-DSH —— DeepSeek Harness 外部插件集合

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）开发的**外部插件集合**。全部插件通过 DSH 的 profile 插件机制（bundle / insert 行）安装，不改动 DSH 源码。

## 插件列表

| 插件 | 说明 |
|------|------|
| **[dsh-usage-skill](dsh-usage-skill/)** | 用量统计（Token 热力图、供应商余额）+ 技能管理面板（Bundle 分组、技能文件查看器、zip/目录导入、归入/移出/删除） |
| **[dsh-browser](dsh-browser/)** | AI 浏览器操作：CDP 直连 Chrome，文本 snapshot+ref 主感知，截图走辅助视觉兜底 |
| **[dsh-vision-helper](dsh-vision-helper/)** | 辅助视觉模型：图片→文本描述，供文本模型、浏览器截图兜底与聊天贴图降级使用 |
| **[dsh-session-message-nav](dsh-session-message-nav/)** | 会话消息导航：头部「消息」弹窗列出本会话全部已发送消息（点击滚动定位）+ 右侧滚动齿轮（每节悬停预览对话内容、点击/拖动跳转） |
| **[dsh-zh-thinking](dsh-zh-thinking/)** | 中文思考开关：设置页开关，引导模型用中文进行内部思考 |
| **[dsh-router-standard](dsh-router-standard/)** | Task-aware reasoning-mode router：三档行为带（spec / mixed / react）、persona 与首轮工具注入、agent 可调 |
| **[dsh-better-markdown](dsh-better-markdown/)** | 流式 Markdown 渲染：用 markstream-react 替换 DSH Web 渲染链路，更快更流畅 |
| **[dsh-image-gallery](dsh-image-gallery/)** | 生图画廊：generate_image 结果在对话内并排缩略展示，单击 Lightbox 放大、可保存 |
| **[dsh-tool-summary](dsh-tool-summary/)** | 工具调用聚合：每轮工具调用折叠为分组 + 总结卡片，减少消息流刷屏 |

## 安装

### 方式一：link 安装（开发/常用）

把插件目录放到本地，然后在 web profile 中 link：

```powershell
# 示例：安装 dsh-usage-skill
cd C:\Users\Anti\.dsh\profiles\web
pnpm add "link:D:\AI\Dsh\kr-dsh-upload\repo\dsh-usage-skill"
```

bundle 插件加入 `dsh.profile.bundles` 层栈后重启 dsh web 生效；非 bundle 插件写 insert 行，配置 HMR 实时挂载。

### 方式二：从 GitHub 安装

```powershell
dsh plugin --profile web add "github:statem-li/Kr-DSH#main&path:/dsh-usage-skill"
```

> 注：Windows 下 `&` 会被 cmd 当作命令分隔符，若遇到解析错误，可在 profile 目录直接执行 `pnpm add "github:statem-li/Kr-DSH#main&path:/dsh-usage-skill"`，再把包名手动加入 `dsh.profile.bundles` 层栈后重启。

## 说明

- 各插件均为独立目录，可单独安装使用
- 详细用法见各插件目录内 README

## 许可

MIT
