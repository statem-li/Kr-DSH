window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-browser",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/BrowserAllowDock.tsx
		/**
		* BrowserAllowSetting — 「设置 → 基础设置」页的浏览器开关条目。
		*
		* 槽位：settings.general.item。形态完全对齐 zh-thinking 的「中文思考」
		* 标准开关行：左侧标题+描述，右侧圆钮 switch（button[role=switch]）。
		*/
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 12,
			padding: "10px 0",
			borderBottom: "1px solid var(--dsw-alias-border-l2)"
		};
		const copyStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 2,
			minWidth: 0
		};
		const titleStyle = {
			fontSize: 14,
			color: "var(--dsw-alias-label-primary)"
		};
		const descStyle = {
			fontSize: 12,
			color: "var(--dsw-alias-label-secondary)"
		};
		const switchStyle = {
			position: "relative",
			width: 40,
			height: 22,
			borderRadius: 11,
			border: "none",
			cursor: "pointer",
			flex: "none",
			background: "var(--dsw-alias-border-l2)",
			transition: "background .15s",
			padding: 0
		};
		const switchOnStyle = {
			...switchStyle,
			background: "var(--dsw-alias-brand-primary)"
		};
		const knobStyle = {
			position: "absolute",
			top: 2,
			left: 2,
			width: 18,
			height: 18,
			borderRadius: "50%",
			background: "#fff",
			transition: "left .15s",
			boxShadow: "0 1px 2px rgba(0,0,0,.2)"
		};
		const knobOnStyle = {
			...knobStyle,
			left: 20
		};
		function fetchState() {
			return fetch("/api/dsh-browser/allow", { cache: "no-store" }).then((r) => r.json());
		}
		function postState(allow) {
			return fetch("/api/dsh-browser/allow", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ allow })
			}).then((r) => r.json());
		}
		function BrowserAllowSetting(_props) {
			const [allow, setAllow] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let alive = true;
				fetchState().then((r) => {
					if (alive && r && typeof r.allow === "boolean") setAllow(r.allow);
				}).catch(() => {});
				return () => {
					alive = false;
				};
			}, []);
			const toggle = () => {
				const next = !(allow === true);
				setAllow(next);
				postState(next).catch(() => {});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rowStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: copyStyle,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: titleStyle,
						children: "允许 AI 使用浏览器"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: descStyle,
						children: "关闭后 AI 将无法调用浏览器工具（browser_*），默认开启。"
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					role: "switch",
					"aria-checked": allow === true,
					"aria-label": "允许 AI 使用浏览器开关",
					style: allow === true ? switchOnStyle : switchStyle,
					onClick: toggle,
					disabled: allow === null,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: allow === true ? knobOnStyle : knobStyle })
				})]
			});
		}
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots"];
		function apply(ctx) {
			ctx.effect(() => ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "dsh-browser",
				order: 30,
				label: () => "dsh-browser"
			}, BrowserAllowSetting)), "@dsh-external/dsh-browser: allow setting");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map