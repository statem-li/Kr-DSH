window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-image-gallery",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/definition.ts
		/** 当前识别的生图工具名（宿主可增减；这里覆盖 dsh-vision-helper 的 generate_image）。 */
		const IMAGE_TOOL_NAMES = new Set(["generate_image"]);
		function isImageToolName(value) {
			return IMAGE_TOOL_NAMES.has(value);
		}
		/** 从 tool/result 的 message.content 里取第一个纯文本块。 */
		function resultText(content) {
			for (const block of content) {
				if (block === null || typeof block !== "object") continue;
				const candidate = block;
				if (candidate.type !== "tool-result") continue;
				const inner = Array.isArray(candidate.content) ? candidate.content : [];
				for (const part of inner) {
					if (part === null || typeof part !== "object") continue;
					const textBlock = part;
					if (textBlock.type === "text" && typeof textBlock.text === "string") return textBlock.text;
				}
			}
			return null;
		}
		/** 生图成功的文本结果里一定带 imageUrl 字段——用这个做 result 侧的低成本指纹。 */
		function isImageResultText(text) {
			return text !== null && /"imageUrl"\s*:/.test(text);
		}
		/** 解析生图结果 JSON：{ ok, model, imageUrls?/imageUrl? } → 展示 URL 列表。 */
		function parseImageResult(text) {
			let parsed;
			try {
				parsed = JSON.parse(text);
			} catch {
				return null;
			}
			if (parsed === null || typeof parsed !== "object") return null;
			const record = parsed;
			if (record.ok !== true) return null;
			const urls = [];
			const push = (value) => {
				if (typeof value === "string" && value !== "" && !urls.includes(value)) urls.push(value);
			};
			if (Array.isArray(record.imageUrls)) for (const item of record.imageUrls) push(item);
			push(record.imageUrl);
			if (typeof record.imageDataUrl === "string" && record.imageDataUrl) push(record.imageDataUrl);
			if (urls.length === 0) return null;
			return {
				urls,
				model: typeof record.model === "string" ? record.model : null
			};
		}
		/** 从 tool/call arguments（JSON 字符串）里取 prompt 字段。 */
		function parsePrompt(argumentsRaw) {
			try {
				const parsed = JSON.parse(argumentsRaw);
				return typeof parsed.prompt === "string" ? parsed.prompt : null;
			} catch {
				return null;
			}
		}
		function locationOf(context) {
			return context.start?.location ?? context.matches[0]?.location ?? { kind: "unresolved" };
		}
		/** 只含 result（start 被窗口截断）时，从 matches 里回演出画廊状态。 */
		function fallbackState(context) {
			let images = [];
			for (const match of context.matches) {
				if (match.event.type !== "tool/result") continue;
				const text = resultText(match.event.data.message.content);
				if (text === null) continue;
				const parsed = parseImageResult(text);
				if (parsed === null) continue;
				const callId = String(match.event.data.message.source.callId);
				for (const url of parsed.urls) images = [...images, {
					callId,
					model: parsed.model,
					url,
					prompt: null
				}];
			}
			return images.length === 0 ? void 0 : {
				toolName: "generate_image",
				promptRaw: null,
				images
			};
		}
		/** 生图画廊会话节点定义（Chat 目标）。 */
		const generatedImagesDefinition = {
			kind: "generated-images",
			target: "chat",
			match: (event) => {
				if (event.type === "tool/call") return isImageToolName(event.data.name) ? {
					id: String(event.data.callId),
					role: "start"
				} : null;
				if (event.type === "tool/result" && (0, _deepseek_ai_dsh_client_runtime_client.isAppendSurfaceEvent)(event)) {
					if (!isImageResultText(resultText(event.data.message.content))) return null;
					const callId = event.data.message.source.callId;
					return {
						id: String(callId),
						role: "update"
					};
				}
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "tool/call") throw new Error("generated-images start requires tool/call");
				return {
					toolName: match.event.data.name,
					promptRaw: parsePrompt(match.event.data.arguments),
					images: []
				};
			},
			update: (context, match) => {
				if (match.event.type !== "tool/result") return context.state;
				const text = resultText(match.event.data.message.content);
				if (text === null) return context.state;
				const parsed = parseImageResult(text);
				if (parsed === null) return context.state;
				const callId = String(match.event.data.message.source.callId);
				const entries = parsed.urls.map((url) => ({
					callId,
					model: parsed.model,
					url,
					prompt: context.state.promptRaw
				}));
				return {
					...context.state,
					images: [...context.state.images, ...entries]
				};
			},
			publication: () => "immediate",
			buildViewNode: (context) => {
				const state = context.state ?? fallbackState(context);
				if (state === void 0 || state.images.length === 0) return null;
				const anchor = context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0;
				return {
					key: context.key,
					kind: "generated-images",
					id: context.id,
					target: "chat",
					anchorSeq: anchor,
					location: locationOf(context),
					visibility: "visible",
					data: { images: state.images }
				};
			}
		};
		//#endregion
		//#region src/client/styles.ts
		/**
		* dsh-image-gallery — 样式（运行时注入 <style>，卸载时移除）。
		* 类名前缀 gig-；颜色走 DSH 主题令牌（--dsw-alias-*），缺省兜底深色值。
		*/
		const css = {
			gallery: "gig-gallery",
			head: "gig-head",
			row: "gig-row",
			item: "gig-item",
			thumb: "gig-thumb",
			badge: "gig-badge",
			backdrop: "gig-backdrop",
			stage: "gig-stage",
			full: "gig-full",
			broken: "gig-broken",
			metaLine: "gig-meta-line",
			model: "gig-model",
			hint: "gig-hint",
			saveButton: "gig-save-button",
			saveIcon: "gig-save-icon",
			hintLine: "gig-hint-line"
		};
		const STYLE_ID = "dsh-image-gallery-styles";
		const SHEET = `
.gig-gallery{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#333);border-radius:12px;background:var(--dsw-alias-bg-layer-2,#16181d)}
.gig-head{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary,#bbb)}
.gig-row{display:flex;flex-wrap:wrap;gap:10px}
.gig-item{position:relative;display:block;padding:0;border:none;border-radius:10px;background:transparent;cursor:zoom-in;overflow:hidden;flex:0 0 auto;line-height:0}
.gig-item:hover .gig-thumb{outline:2px solid var(--dsw-alias-state-business-primary,#4a9eff);outline-offset:-2px}
.gig-thumb{display:block;max-width:min(220px,38vw);max-height:190px;min-width:80px;object-fit:cover;border-radius:10px;transition:outline 120ms}
.gig-badge{position:absolute;left:6px;bottom:6px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;line-height:18px;text-align:center;font-weight:600}
.gig-backdrop{position:fixed;inset:0;z-index:6000;display:flex;align-items:center;justify-content:center;background:rgba(8,10,14,.78);backdrop-filter:blur(2px);animation:gig-fade .16s ease-out}
.gig-stage{position:relative;display:flex;flex-direction:column;gap:10px;max-width:92vw;max-height:92vh}
.gig-full{display:block;max-width:92vw;max-height:82vh;object-fit:contain;border-radius:8px;box-shadow:0 12px 48px rgba(0,0,0,.55);cursor:zoom-out}
.gig-broken{display:flex;align-items:center;justify-content:center;min-width:280px;min-height:160px;border:1px dashed var(--dsw-alias-border-l2,#444);border-radius:10px;color:var(--dsw-alias-label-tertiary,#888);font-size:13px}
.gig-meta-line{display:flex;align-items:center;gap:10px;justify-content:center;font-size:11px;color:var(--dsw-alias-label-secondary,#bbb)}
.gig-model{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);color:var(--dsw-alias-label-tertiary,#888)}
.gig-save-button{position:absolute;top:12px;right:12px;z-index:5;display:flex;align-items:center;gap:7px;padding:8px 18px;border:none;border-radius:20px;background:var(--dsw-alias-state-business-primary,#4a9eff);color:#fff;font-size:12px;font-weight:600;line-height:1.3;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.45);transition:filter 120ms,transform 120ms}
.gig-save-button:hover:not(:disabled){filter:brightness(1.12);transform:translateY(-1px)}
.gig-save-button:active:not(:disabled){transform:translateY(0)}
.gig-save-button:disabled{opacity:.6;cursor:default}
.gig-save-icon{flex:0 0 auto;display:block}
.gig-hint{color:var(--dsw-alias-label-tertiary,#777)}
.gig-hint-line{margin-top:-4px;text-align:center;font-size:11px;color:var(--dsw-alias-label-tertiary,#666)}
@keyframes gig-fade{from{opacity:0}to{opacity:1}}
`;
		let injected = false;
		/** 注入全局样式（幂等）；返回移除函数。 */
		function injectStyles() {
			if (!injected) {
				const tag = document.createElement("style");
				tag.id = STYLE_ID;
				tag.dataset.plugin = "@dsh-external/dsh-image-gallery";
				tag.dataset.pluginCss = "dsh-image-gallery/styles";
				tag.textContent = SHEET;
				document.head.appendChild(tag);
				injected = true;
			}
			return () => {
				if (!injected) return;
				document.getElementById(STYLE_ID)?.remove();
				injected = false;
			};
		}
		//#endregion
		//#region src/client/GeneratedImageGallery.tsx
		/**
		* dsh-image-gallery — 生图画廊渲染组件。
		*
		* 将一次会话中 generate_image 的成功结果渲染为并排缩略图：
		*   - 单击缩略图打开原图 Lightbox（Esc / 点击遮罩关闭）；
		*   - Lightbox 右上角「保存图片」按钮：优先弹系统「另存为」对话框
		*     （showSaveFilePicker，位置和文件名由用户自选）；不支持该 API 的
		*     浏览器自动降级为普通下载（浏览器默认下载目录）；
		*   - 链接失效（生图链接仅 24 小时有效）时显示占位提示。
		*/
		/** 从远程 URL 提取文件名（含扩展名），兜底 gallery-N.png。 */
		function filenameFrom(url, index) {
			try {
				const last = new URL(url).pathname.split("/").pop() ?? "";
				if (/\.(png|jpe?g|webp|gif)$/i.test(last)) return last;
			} catch {}
			return `gallery-${index + 1}.png`;
		}
		/** 普通下载（浏览器默认下载目录 / 下载栏）。失败返回 false。 */
		async function downloadFallback(url, filename) {
			try {
				const response = await fetch(url, { mode: "cors" });
				if (!response.ok) return false;
				const blob = await response.blob();
				if (blob.size === 0) return false;
				const objectUrl = URL.createObjectURL(blob);
				const anchor = document.createElement("a");
				anchor.href = objectUrl;
				anchor.download = filename;
				document.body.appendChild(anchor);
				anchor.click();
				anchor.remove();
				setTimeout(() => URL.revokeObjectURL(objectUrl), 6e4);
				return true;
			} catch {
				return false;
			}
		}
		/**
		* 保存图片：优先系统「另存为」对话框（用户自选位置/文件名）；
		* 对话框不可用（手势/权限异常、浏览器不支持）时自动降级为普通下载，
		* 保证任何环境下都能拿到图。
		*
		* 顺序关键：showSaveFilePicker 必须在用户点击手势的有效窗口内调用——
		* 先 await fetch 下载大图会耗尽手势窗口导致 SecurityError，所以先弹
		* 对话框拿到句柄，再取图写入用户所选的位置。
		*/
		async function saveImage(url, filename) {
			if (typeof window.showSaveFilePicker === "function") {
				let handle;
				try {
					handle = await window.showSaveFilePicker({ suggestedName: filename });
				} catch (error) {
					if (error instanceof DOMException && error.name === "AbortError") return "canceled";
					return await downloadFallback(url, filename) ? "saved" : "failed";
				}
				try {
					const response = await fetch(url, { mode: "cors" });
					if (!response.ok) return await downloadFallback(url, filename) ? "saved" : "failed";
					const blob = await response.blob();
					if (blob.size === 0) return await downloadFallback(url, filename) ? "saved" : "failed";
					const writable = await handle.createWritable();
					await writable.write(blob);
					await writable.close();
					return "saved";
				} catch {
					return await downloadFallback(url, filename) ? "saved" : "failed";
				}
			}
			return await downloadFallback(url, filename) ? "saved" : "failed";
		}
		function GeneratedImageGallery({ node, t }) {
			const images = node.data.images;
			const [openIndex, setOpenIndex] = (0, react.useState)(null);
			const [broken, setBroken] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [saveState, setSaveState] = (0, react.useState)("idle");
			(0, react.useEffect)(() => {
				if (openIndex === null) return;
				const onKey = (event) => {
					if (event.key === "Escape") setOpenIndex(null);
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [openIndex]);
			const open = openIndex !== null ? images[openIndex] : void 0;
			const onSave = async () => {
				if (open === void 0 || saveState === "saving") return;
				setSaveState("saving");
				const result = await saveImage(open.url, filenameFrom(open.url, openIndex));
				setSaveState(result === "canceled" ? "idle" : result);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: css.gallery,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: css.head,
						children: t("gig.head", { n: images.length })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: css.row,
						children: images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: css.item,
							onClick: () => {
								setOpenIndex(index);
								setSaveState("idle");
							},
							title: t("gig.thumbTitle"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
								src: image.url,
								alt: `${t("gig.head", { n: images.length })} ${index + 1}`,
								loading: "lazy",
								decoding: "async",
								referrerPolicy: "no-referrer",
								draggable: false,
								className: css.thumb,
								onError: () => setBroken((prev) => new Set(prev).add(index))
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: css.badge,
								children: index + 1
							})]
						}, `${image.callId}:${index}`))
					}),
					open !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: css.backdrop,
						role: "dialog",
						"aria-modal": "true",
						"aria-label": t("gig.lightboxAria"),
						onClick: () => setOpenIndex(null),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: css.stage,
							onClick: (event) => event.stopPropagation(),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: css.saveButton,
									onClick: (event) => {
										event.stopPropagation();
										onSave();
									},
									disabled: saveState === "saving",
									"aria-label": t("gig.save"),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
										className: css.saveIcon,
										viewBox: "0 0 16 16",
										width: "14",
										height: "14",
										"aria-hidden": "true",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: "M8 1v8m0 0L4.5 5.5M8 9l3.5-3.5",
											stroke: "currentColor",
											strokeWidth: "2",
											fill: "none",
											strokeLinecap: "round",
											strokeLinejoin: "round"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
											d: "M2.5 11.5v2h11v-2",
											stroke: "currentColor",
											strokeWidth: "2",
											fill: "none",
											strokeLinecap: "round"
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										saveState === "idle" && t("gig.save"),
										saveState === "saving" && t("gig.saving"),
										saveState === "saved" && t("gig.saved"),
										saveState === "failed" && t("gig.saveFailed")
									] })]
								}),
								broken.has(openIndex) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: css.broken,
									children: t("gig.broken")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
									src: open.url,
									alt: `${t("gig.lightboxAria")} ${openIndex + 1}`,
									className: css.full,
									onError: () => setBroken((prev) => new Set(prev).add(openIndex))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: css.metaLine,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["#", openIndex + 1] }), open.model !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: css.model,
										children: open.model
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: css.hintLine,
									children: t("gig.hint")
								})
							]
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** `gallery` namespace dictionaries（dsh-image-gallery 的界面文案）。 */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"gig.head": "生图结果 · {n} 张",
			"gig.thumbTitle": "单击放大",
			"gig.hint": "点击空白处或按 Esc 关闭 · 右上角按钮可保存图片",
			"gig.broken": "图片链接已失效（生图链接仅 24 小时有效）",
			"gig.lightboxAria": "生图预览",
			"gig.close": "关闭预览",
			"gig.save": "保存图片",
			"gig.saving": "保存中…",
			"gig.saved": "已保存",
			"gig.saveFailed": "保存失败，请重试"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"gig.head": "Generated images · {n}",
			"gig.thumbTitle": "Click to zoom",
			"gig.hint": "Click background or press Esc to close · save via the top-right button",
			"gig.broken": "Image link expired (generated links are valid for 24 hours)",
			"gig.lightboxAria": "Generated image preview",
			"gig.close": "Close preview",
			"gig.save": "Save image",
			"gig.saving": "Saving…",
			"gig.saved": "Saved",
			"gig.saveFailed": "Save failed, please retry"
		};
		//#endregion
		//#region src/client/index.ts
		const NS = "gallery";
		const inject = [
			"slots",
			"conversationEvents",
			"locale"
		];
		/** 保护 Lightbox 内的原生右键菜单：外部注入（扩展/宿主）可能在
		* document capture 阶段 preventDefault contextmenu，导致放大后右键无反应。
		* 这里在 window capture（更早）拦截，仅对画廊遮罩内的右键生效，
		* 让浏览器原生「另存为」菜单恢复；画廊外行为完全不变。 */
		function protectLightboxContextMenu() {
			const onContextMenu = (event) => {
				const target = event.target;
				if (target !== null && target.closest(".gig-backdrop") !== null) event.stopImmediatePropagation();
			};
			window.addEventListener("contextmenu", onContextMenu, true);
			return () => window.removeEventListener("contextmenu", onContextMenu, true);
		}
		function apply(ctx) {
			injectStyles();
			ctx.effect(protectLightboxContextMenu, "@dsh-external/dsh-image-gallery: lightbox context-menu guard");
			ctx.conversationEvents.register(generatedImagesDefinition);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "@dsh-external/dsh-image-gallery: dictionaries");
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "generated-images",
				locale: NS
			}, GeneratedImageGallery));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map