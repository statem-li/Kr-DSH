# dsh-session-message-nav — 会话消息导航插件

DeepSeek Harness Web GUI 客户端插件：会话内快速查看/定位自己发过的所有消息。

## 功能

1. **头部右上角「消息 N」按钮**
   - 点击弹出本会话全部已发送消息列表（含运行中插入的 steering 消息），
     按时间正序，显示序号 / 时间 / 内容预览（两行截断）。
   - 点击某条消息 → 会话自动滚动到该消息，并高亮闪烁 2.4 秒。
   - 历史未加载完时会话（`hasMore`）底部提供「加载更早」按钮。
   - 列表随会话实时更新（新消息到达自动出现）。

2. **右侧中间「消息横条」**（透明无背景，只显示横条本身）
   - **每条横条 = 一条你发送的消息**：15px 宽的细短线，不显示文字；
   - 颜色：**当前阅读位置的消息 = 蓝色**（加宽 1.5 倍至 23px），其余 = 灰色，
     随滚动自动切换；
   - 点击某条 → 会话自动滚动到该消息并高亮闪烁 2.4 秒；
   - 消息多时面板可滚动，当前阅读位置的消息自动滚入面板视野；
   - 按住面板空白处上下拖动 → 像拉滚轮一样滚动会话；
   - 列表随会话实时更新（新消息到达自动出现）。

## 构建

```bash
# host 半身（tsc）+ client 半身（tsdown → lib/client.js）
export DSH_CHECKOUT=D:/AI/deepseek-harness
npm run build        # host: src/ → lib/
npm run build:client # client: → lib/client.js
```

## 注入

```bash
# 运行时注入（免重启；junction + loader.create，dev 工具链）
# dev_inject_plugin D:/AI/Dsh/dsh-session-message-nav
# 然后刷新 Web GUI 页面（新 client bundle 经 __DSH_BOOT__ 图装配）
```

## 结构

- `src/index.ts` — host 半身（占位；loader 挂载 + client bundle 发现用）
- `src/client/index.ts` — 注册 `conversation.session.header.utilities` 槽位（右上角）
- `src/client/SessionMessageNav.tsx` — 消息列表弹窗 + 右侧消息横条 UI
- `src/client/styles.ts` — 运行时注入样式（`--dsw-alias-*` 主题令牌）
- `tsdown.config.ts` — host/client 双 bundle（client 平台外部依赖走模块表）

## DOM 契约（ui-conversation 稳定提供）

`[data-conversation-scroll]` 滚动容器 / `[data-chat-flow]` 消息流 /
`[data-chat-anchor-key]` 节点锚点 / `[data-composer-seat]` 粘贴输入区。
