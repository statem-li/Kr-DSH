window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-vision-helper",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/VisionModelSection.tsx
		/**
		* VisionModelSection — 「设置 → AI 模型」统一配置页。
		*
		* 槽位：settings.section（order 14）。
		* 两个区块：
		*  1. 辅助视觉模型（vision_describe 使用）——/api/vision-helper/providers + /config
		*  2. 生图模型（generate_image 使用）——/api/image-gen/snapshot + /config
		* 数据都落在工作区 .dsh/model-router.json（visionActive / imageActive）。
		*/
		const TITLE = {
			fontSize: 15,
			fontWeight: 600,
			marginBottom: 12
		};
		const BLOCK = { marginBottom: 24 };
		const BLOCK_TITLE = {
			fontSize: 14,
			fontWeight: 600,
			marginBottom: 6,
			marginTop: 4
		};
		const GROUP = { marginBottom: 14 };
		const GROUP_TITLE = {
			fontSize: 13,
			fontWeight: 600,
			marginBottom: 8,
			color: "var(--dsw-alias-label-secondary)"
		};
		const BTN = {
			display: "inline-flex",
			alignItems: "center",
			gap: 6,
			padding: "6px 12px",
			margin: "0 8px 8px 0",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 6,
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			fontSize: 13,
			cursor: "pointer"
		};
		const ACTIVE = {
			...BTN,
			borderColor: "var(--dsw-alias-brand-primary)",
			color: "var(--dsw-alias-brand-primary)",
			fontWeight: 600
		};
		const TAG = {
			fontSize: 11,
			color: "var(--dsw-alias-label-secondary)",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 4,
			padding: "0 4px"
		};
		const HINT = {
			fontSize: 12,
			color: "var(--dsw-alias-label-secondary)",
			marginBottom: 10
		};
		const SEP = {
			height: 1,
			background: "var(--dsw-alias-border-l2)",
			margin: "16px 0"
		};
		function isVisionModel(m) {
			return Array.isArray(m.input) && m.input.includes("image");
		}
		function VisionModelSection(_props) {
			const [providers, setProviders] = (0, react.useState)([]);
			const [active, setActive] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const [imgProviders, setImgProviders] = (0, react.useState)([]);
			const [imgActive, setImgActive] = (0, react.useState)("");
			const [imgError, setImgError] = (0, react.useState)(null);
			const [imgSaving, setImgSaving] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let alive = true;
				fetch("/api/vision-helper/providers", { cache: "no-store" }).then((r) => r.json()).then((d) => {
					if (!alive) return;
					if (d && d.ok !== false) {
						setProviders(d.providers || []);
						setActive(d.active || "");
					} else setError(d && d.error || "加载失败");
				}).catch(() => {
					if (alive) setError("接口不可用");
				});
				fetch("/api/image-gen/snapshot", { cache: "no-store" }).then((r) => r.json()).then((d) => {
					if (!alive) return;
					if (d && d.ok !== false) {
						setImgProviders(d.providers || []);
						setImgActive(d.imageActive || "");
					} else setImgError(d && d.error || "加载失败");
				}).catch(() => {
					if (alive) setImgError("接口不可用");
				});
				return () => {
					alive = false;
				};
			}, []);
			const pickVision = (key) => {
				if (saving) return;
				setSaving(true);
				fetch("/api/vision-helper/config", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ visionActive: key })
				}).then((r) => r.json()).then((d) => {
					if (d && d.ok) setActive(key);
				}).finally(() => setSaving(false));
			};
			const pickImage = (key) => {
				if (imgSaving) return;
				setImgSaving(true);
				fetch("/api/image-gen/config", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ imageActive: key })
				}).then((r) => r.json()).then((d) => {
					if (d && d.ok) setImgActive(key);
				}).finally(() => setImgSaving(false));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: TITLE,
					children: "AI 模型"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: BLOCK,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: BLOCK_TITLE,
							children: "辅助视觉模型"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: HINT,
							children: "vision_describe 使用的模型（图片→文本描述，供文本主模型与浏览器截图兜底）。标注「视觉」的模型声明了图片输入。"
						}),
						error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								color: "#d33",
								marginTop: 8
							},
							children: error
						}),
						providers.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: GROUP,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: GROUP_TITLE,
								children: p.name || p.id
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: p.models.map((m) => {
								const key = `${p.id}/${m.id}`;
								const isActive = key === active;
								const vision = isVisionModel(m);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									style: isActive ? ACTIVE : BTN,
									onClick: () => pickVision(key),
									disabled: saving,
									title: isActive ? "当前辅助视觉模型" : "设为辅助视觉模型",
									children: [
										m.name || m.id,
										isActive && " ✓ 当前",
										vision && !isActive && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: TAG,
											children: "视觉"
										})
									]
								}, key);
							}) })]
						}, p.id)),
						!error && providers.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: { color: "#888" },
							children: "加载中…"
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: SEP }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: BLOCK,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: BLOCK_TITLE,
							children: "生图模型"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: HINT,
							children: "generate_image 使用的模型（提示词 → 图片生成）。"
						}),
						imgError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								color: "#d33",
								marginTop: 8
							},
							children: imgError
						}),
						imgProviders.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: GROUP,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: GROUP_TITLE,
								children: p.name || p.id
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: p.models.map((m) => {
								const key = `${p.id}/${m.id}`;
								const isActive = key === imgActive;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									style: isActive ? ACTIVE : BTN,
									onClick: () => pickImage(key),
									disabled: imgSaving,
									title: isActive ? "当前生图模型" : "设为生图模型",
									children: [m.name || m.id, isActive && " ✓ 当前"]
								}, key);
							}) })]
						}, p.id)),
						!imgError && imgProviders.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: { color: "#888" },
							children: "加载中…"
						})
					]
				})
			] });
		}
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots"];
		function apply(ctx) {
			ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "vision-helper",
				order: 14,
				label: "AI 模型"
			}, VisionModelSection)), "@dsh-external/dsh-vision-helper: vision section");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map