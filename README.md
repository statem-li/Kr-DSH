# Kr-DSH — DeepSeek Harness 插件索引

> 本仓库原为「插件集合」（多插件混装单仓库），已按 **DSH 官方规范**重构：每个插件拆分为**独立仓库**——仓库根目录声明插件（`package.json` 的 `dsh.bundle` 字段 + `cordis.patch.yml`），打上 `dsh-plugin` 主题，全部支持官方一句话安装。

## 一键安装（DSH 官方格式）

在 DSH 终端执行：

```bash
dsh plugin add github:statem-li/<plugin>
```

需要锁定版本时，可固定 commit：

```bash
dsh plugin add github:statem-li/<plugin>#<commit-sha>
```

| 插件 | 说明 | 官方一键安装 |
|------|------|-------------|
| [dsh-usage-skill](https://github.com/statem-li/dsh-usage-skill) | 用量统计（Token 热力图、供应商余额）+ 技能管理面板（Bundle 分组、拖拽安装、zip/目录导入） | `dsh plugin add github:statem-li/dsh-usage-skill` |
| [dsh-browser](https://github.com/statem-li/dsh-browser) | AI 浏览器操作：CDP 直连 Chrome，文本 snapshot+ref 主感知，截图辅助视觉兜底 | `dsh plugin add github:statem-li/dsh-browser` |
| [dsh-vision-helper](https://github.com/statem-li/dsh-vision-helper) | 辅助视觉模型：图片→文本描述，供文本模型、浏览器截图兜底与聊天贴图降级 | `dsh plugin add github:statem-li/dsh-vision-helper` |
| [dsh-session-message-nav](https://github.com/statem-li/dsh-session-message-nav) | 会话消息导航：头部消息弹窗（点击滚动定位）+ 右侧消息横条（悬停预览、点击/拖动跳转） | `dsh plugin add github:statem-li/dsh-session-message-nav` |
| [dsh-zh-thinking](https://github.com/statem-li/dsh-zh-thinking) | 中文思考开关：设置页开关，引导模型用中文内部思考 | `dsh plugin add github:statem-li/dsh-zh-thinking` |
| [dsh-better-markdown](https://github.com/statem-li/dsh-better-markdown) | 流式 Markdown 渲染：用 markstream-react 替换 DSH Web 渲染链路 | `dsh plugin add github:statem-li/dsh-better-markdown` |
| [dsh-image-gallery](https://github.com/statem-li/dsh-image-gallery) | 生图画廊：generate_image 结果对话内并排缩略展示，单击 Lightbox 放大、可保存 | `dsh plugin add github:statem-li/dsh-image-gallery` |
| [dsh-tool-summary](https://github.com/statem-li/dsh-tool-summary) | 工具调用聚合：每轮工具调用折叠为分组 + 总结卡片 | `dsh plugin add github:statem-li/dsh-tool-summary` |
| [dsh-reasoning-effort](https://github.com/statem-li/dsh-reasoning-effort) | 推理强度滑块：模型与强度独立入口，支持手动档位 | `dsh plugin add github:statem-li/dsh-reasoning-effort` |

各插件仓库均已打上 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 主题，可被 DSH 插件生态与官方目录发现。

## 本仓库的角色：索引与归档

- 上表 9 个已安装能力的插件全部拆分至**独立仓库**（一个仓库一个插件，仓库根目录即插件根目录），安装请使用各自仓库的官方命令；
- **`dsh-router-standard/`** 保留在本仓库：它是研究产物（Task-aware reasoning-mode router：三档行为带 spec / mixed / react、persona 与首轮工具注入、agent 可调），**非 profile 插件、没有 `dsh` 声明**，无法用 `dsh plugin add` 安装，按 preset 方式使用（见其目录 README）；
- 各插件旧版快照目录仍保留在本仓库内，仅供追溯；**代码以各独立仓库为准**。

## 许可

MIT