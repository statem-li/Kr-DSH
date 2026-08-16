# dsh-tool-summary

DeepSeek Harness Web 插件:把每一轮对话的工具调用**聚合为一个可折叠分组**,附**总结卡片**,大幅减少工具调用在消息流中的刷屏。

## 功能

- **按轮聚合**:同一轮(一个 turn)的所有工具调用合并成一行「🔧 工具调用 ×N」,默认折叠;几百行工具调用压缩为几个分组。
- **总结卡片**:展开后顶部显示统计——总调用数、进行中/失败数、按工具分布 chips、涉及文件(点击可直接打开)。
- **简约工具行**:每个调用一行(状态点 + 工具名 + 单行摘要),点击展开参数与输出;输出限高内部滚动;行尾 ⤴ 按钮可在轨迹视图查看该调用。
- **只读过滤**:read / grep / glob / web_search 等纯读工具默认隐藏(偏好存 localStorage),可一键显示。
- **失败标记**:分组标题旁显示 ⚠ N(失败次数)。
- **安全回退**:通过 slot shadow(priority -100)接管 `conversation.chat.node` 的 `tool-call` key;渲染异常时自动 abdicate,Harness 内置工具行立即接管。

## 安装

前置条件:DeepSeek Harness Web 可正常启动(≥ 0.1.0-rc.5)。

```sh
git clone <本仓库> && cd dsh-tool-summary
pnpm install && node build.mjs
# 在 web profile 的 cordis.patch.yml 中加入:
# - insert:
#     - id: dsh-tool-summary
#       name: dsh-tool-summary
# 并在 profile package.json 的 dependencies 中加入:
# "dsh-tool-summary": "link:<本目录绝对路径>"
```

用户层补丁通过 profile HMR watcher **热生效**,无需重启 DSH。

## 开发

```sh
node build.mjs    # 构建 lib/index.js + lib/client.js(client bundle 为 __ModuleLoader__ 契约格式)
tsc -p .          # 类型检查(tsconfig paths 指向 DeepSeek Harness checkout 的依赖)
```

改完源码后:重新 build → touch profile 的 `cordis.patch.yml`(触发重挂载)→ 刷新页面。

## 实现要点

- 聚合头判定:每个 turn 的第一个 tool-call node(按 `chat.locations.getTurn(turn)` 顺序)渲染整个分组,同 turn 其余 node 渲染空。
- 工具行自绘,不 dispatch `tool.call.toolview`(该 slot 的 children 声明由 ui-tool 独占,shadow 无法重新声明)。
- 无第三方运行时依赖(client bundle ~17 KB),样式使用 Harness design tokens(`--dsw-alias-*`)。

## License

MIT
