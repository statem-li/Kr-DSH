# dsh-browser —— DSH AI 浏览器操作插件

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 **AI 操作浏览器**能力：CDP 直连本机 Chrome/Edge，文本 ref 树主感知（便宜），截图走辅助视觉模型兜底（配合 dsh-vision-helper）。

## 功能

- **9 个工具**：`browser_start / navigate / snapshot / click / type / scroll / screenshot / stop / status`（另有 `browser_evaluate` 执行页面 JS，处理 ref 树定位不到的元素）
- **文本主感知**：snapshot 注入 JS 遍历 DOM，给可交互元素标 `data-dsh-ref`，返回文本 ref 树；每次操作后自动返回最新 snapshot；操作前自动重新分配 ref，杜绝动态页面残留错位
- **独立 Chrome 实例**：专属 user-data-dir（登录态/扫码持久化，重启免重登），用户实时可见可交互
- **零依赖**：Node 24 原生 WebSocket 手写 CDP 客户端，不装 playwright
- **截图兜底**：`browser_screenshot` 存文件返回路径，模型用 `vision_describe` 看图（图表/验证码/布局）
- **「允许 AI 使用浏览器」总开关**：设置 → 基础设置页圆钮开关（默认开启、持久化），关闭后所有 `browser_*` 调用被门禁拦截
- **设置页状态**：设置页条目附浏览器运行状态与最近截图（3s 轮询）

## 安装

1. 将 dsh-browser 目录复制到 DSH profile 的插件目录：

   ```bash
   # Windows web profile 示例
   cp -r dsh-browser ~/.dsh/profiles/web/plugins/
   ```

2. 在 profile 的 cordis.patch.yml 追加挂载声明：

   ```yaml
   - insert:
       - id: browser
         name: dsh-browser
   ```

3. 重启 DSH。

## 用法

对 AI 说"用浏览器帮我……"，模型会自动编排：

```
browser_start      → 拉起 Chrome（自动探测路径/端口，幂等）
browser_navigate   → 打开 URL，返回 ref 树
browser_snapshot   → 当前页 ref 树（[ref] 定位）
browser_click/type → 按 ref 操作，返回新 snapshot
browser_scroll     → 滚动页面
browser_screenshot → 截图存文件，配合 vision_describe 看图
browser_stop       → 关闭
```

## 配置

编辑 profile 配置（如 `cordis.patch.yml` 或 settings）：

```yaml
- id: browser
  name: dsh-browser
  config:
    chromePath: ""        # Chrome/Edge 路径（空 = 自动探测常见路径）
    port: 0               # CDP 端口（0 = 从 9222 起自动找空闲）
    headless: false       # 无头模式
    screenshotDir: ""     # 截图目录（空 = profile 目录下 screenshots/）
```

## 实现说明

- `lib/browser/` 架构：CDP 客户端（`CdpConnection`）、Chrome 进程管理（端口探测/自愈重连）、snapshot 注入（`data-dsh-ref` 分配 + 操作前重分配）
- 数据目录：`~/.dsh/plugin-data/dsh-browser/`（profiles/ 登录态、screenshots/、prefs.json 开关状态）
- UI：设置 → 基础设置「允许 AI 使用浏览器」开关（`settings.general.item` 槽位）

## 许可

MIT
