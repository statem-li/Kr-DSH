# dsh-image-gallery — 生图画廊插件

把会话里 `generate_image` 工具的成功结果渲染为**对话内并排缩略图画廊**:

- 📷 生图结果直接以卡片形式显示在消息流中(缩略图并排)
- 🔍 单击缩略图 → 原图 Lightbox 放大(Esc / 点击遮罩关闭)
- 💾 Lightbox 右上角「保存图片」按钮:优先弹系统「另存为」对话框(位置与文件名自选),不可用时自动降级为普通下载
- ⏳ 链接失效(生图链接仅 24 小时有效)时显示占位提示,不裂图
- 🖼️ 配合 `generate_image` 的 `count` 参数,一次生成多张并排展示

## 原理

监听会话事件流中的 `tool/call`(`name = generate_image`)与 `tool/result`
(文本含 `imageUrl`),通过 DSH 客户端插件机制注册一个 `conversation.chat.node`
渲染器,把同一调用的成功图片发布为 `generated-images` 节点。**纯插件实现,
不改动 DSH 源码。**

## 安装

1. 把本目录链接到 DSH web profile:

   ```powershell
   New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\@dsh-external\dsh-image-gallery" -Target (Get-Location)
   ```

2. 在 `%USERPROFILE%\.dsh\profiles\web\cordis.patch.yml` 追加:

   ```yaml
   - insert:
       - id: dsh-image-gallery
         name: "@dsh-external/dsh-image-gallery"
   ```

3. 重启 DSH web(或等 patch 热装配)后刷新页面。

## 构建

依赖 DSH 源码检出(`DSH_CHECKOUT` 指向 deepseek-harness 检出目录):

```bash
DSH_CHECKOUT=D:/AI/deepseek-harness bash scripts/build.sh   # host 半身 tsc
tsdown                                                  # client bundle → lib/client.js
```

## 依赖

- DSH client 插件机制:`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-conversation`
- 生图工具:`generate_image`(dsh-vision-helper 提供,支持 `count` 一次多张)

## 许可

BSD-3-Clause
