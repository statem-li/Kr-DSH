# dsh-zh-thinking — DSH 中文思考开关

在 DSH 设置页「常规」中提供 **中文思考** 开关:开启时向模型系统提示词注入"内部思考使用中文"指令,关闭时零上下文占用。开关状态持久化于 `settings.yaml`。

## 文件结构

```
dsh-zh-thinking/
├── package.json          # 包声明(dsh.client → lib/client.js)
└── lib/
    ├── index.js          # Host half:settings 持久化 + systemPrompt section + /api/zh-thinking 路由
    └── client.js         # Browser half:设置页开关行(ModuleLoader bundle)
```

## 安装(Windows)

1. **复制插件目录**到 DSH 用户目录:
   ```powershell
   Copy-Item .\dsh-zh-thinking "$env:USERPROFILE\.dsh\profiles\web\plugins\" -Recurse -Force
   Copy-Item .\dsh-zh-thinking "$env:USERPROFILE\.dsh\profiles\node_modules\" -Recurse -Force
   ```
   > 两份都要:web\plugins 是源目录,node_modules 是 loader 实际解析的副本。

2. **注册插件行**——编辑 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml`,在 `insert` 列表末尾追加:
   ```yaml
       # dsh-zh-thinking：设置页「中文思考」开关（引导模型用中文进行内部思考）
       - id: zh-thinking
         name: dsh-zh-thinking
   ```

3. **重启 DSH 服务**——host 组合在启动时加载,重启后:
   - 设置 → 常规 → 出现「中文思考」开关(默认开启);
   - 从下一轮对话起模型内部思考使用中文。

## 验证

- 开关:设置页切换后立即持久化,重启不丢;
- API: `curl http://127.0.0.1:3080/api/zh-thinking` → `{"ok":true,"enabled":true}`;
- 关闭时系统提示词零占用(空 section 被自动丢弃)。

## 备注

- Host 侧(systemPrompt、路由)改动需重启 DSH;client.js 改动由 HMR 热更新(需 `pnpm run dev:web` 运行中)。
- 依赖:host 侧仅使用内置服务(`systemPrompt` / `settings` / `webServer`),无第三方运行时依赖。
