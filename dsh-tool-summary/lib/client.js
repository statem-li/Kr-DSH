window.__ModuleLoader__.load({ id: "dsh-tool-summary", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/ToolGroupNodeView.tsx
var import_react2 = require("react");

// src/client/tool-stats.ts
var READONLY_TOOLS = /* @__PURE__ */ new Set([
  "read",
  "grep",
  "glob",
  "web_search",
  "web_fetch",
  "search",
  "ls",
  "find",
  "list"
]);
function callName(block) {
  return "kind" in block ? block.call?.name ?? "" : block.name;
}
function isRunning(block) {
  return !("kind" in block);
}
function argsPath(argsRaw) {
  if (argsRaw === "") return void 0;
  try {
    const parsed = JSON.parse(argsRaw);
    if (typeof parsed !== "object" || parsed === null) return void 0;
    const record = parsed;
    for (const key of ["file_path", "path", "dir", "url"]) {
      const value = record[key];
      if (typeof value === "string" && value !== "") return value;
    }
    return void 0;
  } catch {
    return void 0;
  }
}
function resultText(block) {
  if (!("kind" in block)) return "";
  const parts = [];
  for (const content of block.content) {
    const c = content;
    if (c.type === "text" && typeof c.text === "string") parts.push(c.text);
  }
  return parts.join("\n");
}
function computeStats(blocks) {
  const counts = /* @__PURE__ */ new Map();
  const files = /* @__PURE__ */ new Set();
  let total = 0;
  let running = 0;
  let errors = 0;
  let readOnly = 0;
  for (const block of blocks) {
    const name = callName(block);
    total += 1;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (isRunning(block)) running += 1;
    else if (block.isError) errors += 1;
    if (READONLY_TOOLS.has(name)) readOnly += 1;
    const path = argsPath("kind" in block ? block.call?.argsRaw ?? "" : block.argsRaw);
    if (path !== void 0) files.add(path);
  }
  const byTool = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { total, running, errors, byTool, files: [...files], readOnly };
}
function shortenPath(path, cwd) {
  if (cwd !== void 0 && cwd !== "" && path.startsWith(cwd)) {
    const rest = path.slice(cwd.length).replace(/^[\\/]+/, "");
    return rest === "" ? path : rest;
  }
  return path;
}
function callSummary(block) {
  const name = callName(block);
  const raw = "kind" in block ? block.call?.argsRaw ?? "" : block.argsRaw;
  if (raw === "") return name;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return `${name} \xB7 ${raw}`;
    const record = parsed;
    for (const key of ["file_path", "path", "command", "url", "pattern"]) {
      const value = record[key];
      if (typeof value === "string" && value !== "") return value;
    }
    return `${name} \xB7 ${raw.slice(0, 80)}`;
  } catch {
    return `${name} \xB7 ${raw.slice(0, 80)}`;
  }
}

// src/client/activity-drawer.tsx
var import_react = require("react");
var import_client = require("react-dom/client");

// src/client/reasoning-classify.ts
var CATEGORIES = [
  {
    label: "\u5B9E\u65BD\u7F16\u5199",
    icon: "\u270F\uFE0F",
    patterns: [
      /修改/,
      /写入/,
      /实现/,
      /编辑/,
      /创建/,
      /新增/,
      /构建/,
      /重写/,
      /重构/,
      /覆盖/,
      /调用(一?下)?工具|调用generate_image|调用\d+次/,
      /写(代码|文件|脚本|函数|组件|插件|一个|好|完|下)/,
      /建(文件|目录|项目|一个)/,
      /加入|添加/,
      /定义|声明/,
      /删除|清理/,
      /生成结果|产出/
    ]
  },
  {
    label: "\u539F\u56E0\u6392\u67E5",
    icon: "\u{1F50E}",
    patterns: [
      /为什么/,
      /原因/,
      /这是因为/,
      /根本原因/,
      /导致/,
      /引发/,
      /起因/,
      /溯源/,
      /排查/,
      /诊断/,
      /定位问题/,
      /根因/,
      /为何/,
      /怎么会/,
      /哪里出(错|问题|问)/,
      /问题出在/,
      /报错|错误|异常/,
      /失败(了|原因)?/,
      /原因(是|在|何)/,
      /(找|查)(出|到|一下|一?个)?(原因|问题|根|源头)/,
      /解释一下/
    ]
  },
  {
    label: "\u9A8C\u8BC1\u786E\u8BA4",
    icon: "\u2705",
    patterns: [
      /验证/,
      /确认(了|下)?/,
      /测试/,
      /试验/,
      /成功后|成功了/,
      /完美/,
      /生效/,
      /没问题/,
      /通过/,
      /结果[:：]|输出[:：]/,
      /运行结果/,
      /实测/,
      /工作正常/,
      /验证通过/
    ]
  },
  {
    label: "\u89C4\u5212\u65B9\u6848",
    icon: "\u{1F4CB}",
    patterns: [
      /计划/,
      /方案/,
      /步骤/,
      /打算/,
      /思路/,
      /策略/,
      /规划/,
      /设计/,
      /着手/,
      /大致/,
      /拆分|分步/,
      /准备(先|要)?/,
      /接下来/,
      /先(写|建|看|试|做|处理)/,
      /应该(用|先|直接)/
    ]
  },
  {
    label: "\u51B3\u7B56\u6743\u8861",
    icon: "\u{1F914}",
    patterns: [
      /选择/,
      /决定/,
      /权衡/,
      /考虑/,
      /或者/,
      /对比/,
      /倾向于/,
      /取舍/,
      /到底|究竟/,
      /两个(方案|选择)/
    ]
  },
  {
    label: "\u603B\u7ED3\u6C47\u62A5",
    icon: "\u{1F4DD}",
    patterns: [
      /总结/,
      /汇报/,
      /结论/,
      /提交/,
      /推送/,
      /上传/,
      /发布/,
      /收尾/,
      /搞定/,
      /完成(了|时)?|全部(完成|搞定)/,
      /完成情况/,
      /回顾/
    ]
  },
  {
    label: "\u63A2\u7D22\u5206\u6790",
    icon: "\u{1F50D}",
    patterns: [
      /搜索/,
      /查找/,
      /看看/,
      /找找/,
      /检查/,
      /查看/,
      /寻找/,
      /定位/,
      /遍历/,
      /目录|结构/,
      /可能(在|是)?/,
      /在哪里/,
      /位置/,
      /配置|环境/,
      /是否|有无/,
      /没(有|看到|找到)/,
      /(更|更)广/,
      /排除/,
      /了解|认识/,
      /读(一下|取|文件|内容)/
    ]
  }
];
var FALLBACK = { label: "\u5176\u4ED6", icon: "\u{1F4AC}" };
function classifyReasoning(text) {
  let best = FALLBACK;
  let bestScore = 0;
  for (const category of CATEGORIES) {
    let score = 0;
    for (const pattern of category.patterns) {
      const global = new RegExp(pattern.source, "g");
      const matches = text.match(global);
      if (matches !== null) score += matches.length;
    }
    if (score > bestScore) {
      best = { label: category.label, icon: category.icon };
      bestScore = score;
    }
  }
  return best;
}
function groupReasoning(items) {
  const order = [];
  const map = /* @__PURE__ */ new Map();
  for (const item of items) {
    const category = classifyReasoning(item.text);
    let list = map.get(category.label);
    if (list === void 0) {
      list = [];
      map.set(category.label, list);
      order.push(category);
    }
    list.push(item);
  }
  return order.map((category) => ({ category, items: map.get(category.label) ?? [] }));
}

// src/client/activity-drawer.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var STORE_KEY = "__dshActivityDrawerStore__";
function activityStore() {
  const globalObj = globalThis;
  const existing = globalObj[STORE_KEY];
  if (existing !== void 0) return existing;
  const listeners = /* @__PURE__ */ new Set();
  const data = /* @__PURE__ */ new Map();
  let openTurn = null;
  let activeMode = null;
  let handlers = { openFile: () => {
  }, inspectCall: () => {
  } };
  const notify = () => {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
      }
    }
  };
  const store = {
    get openTurn() {
      return openTurn;
    },
    get activeMode() {
      return activeMode;
    },
    open: (turn, mode) => {
      openTurn = turn;
      activeMode = mode;
      notify();
    },
    close: () => {
      openTurn = null;
      activeMode = null;
      notify();
    },
    setReasoning: (turn, items) => {
      data.set(turn, { ...data.get(turn) ?? {}, reasoning: items });
      notify();
    },
    setTools: (turn, nodes, cwd) => {
      data.set(turn, { ...data.get(turn) ?? {}, tools: nodes, toolsCwd: cwd });
      notify();
    },
    setHandlers: (next) => {
      handlers = next;
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    get: (turn) => data.get(turn),
    handlers: () => handlers
  };
  globalObj[STORE_KEY] = store;
  return store;
}
function DrawerToolSummary({ stats, cwd, openFile }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dts__summary", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dts__summary-title", children: "\u{1F527} \u5DE5\u5177\u8C03\u7528\u603B\u7ED3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dts__summary-line", children: [
      "\u5171 ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: stats.total }),
      " \u6B21\u8C03\u7528",
      stats.running > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        " \xB7 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: stats.running }),
        " \u6B21\u8FDB\u884C\u4E2D"
      ] }),
      stats.errors > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        " \xB7 \u26A0 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: stats.errors }),
        " \u6B21\u5931\u8D25"
      ] })
    ] }),
    stats.byTool.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dts__chips", children: stats.byTool.map(({ name, count }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dts__chip", "data-tool": name, children: [
      name,
      " \xD7",
      count
    ] }, name)) }),
    stats.files.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dts__files", children: stats.files.map((path) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: "dts__file",
        title: path,
        onClick: () => {
          openFile(path);
        },
        children: shortenPath(path, cwd)
      },
      path
    )) })
  ] });
}
function ReasoningGroups({ items, activeIndex, jumpToCategory }) {
  const groups = (0, import_react.useMemo)(() => groupReasoning(items), [items]);
  let cursor = 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dts__modal-reasoning", children: groups.map((group) => {
    const firstIndex = cursor;
    cursor += group.items.length;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dts__modal-reasoning-group", "data-reasoning-category": group.category.label, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dts__modal-reasoning-group-title", role: "button", tabIndex: 0, onClick: () => jumpToCategory(firstIndex), children: [
        group.category.icon,
        " ",
        group.category.label,
        " (",
        group.items.length,
        ")"
      ] }),
      group.items.map((item) => {
        const globalIndex = firstIndex + group.items.indexOf(item);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            "data-reasoning-index": globalIndex,
            "data-active": activeIndex === globalIndex || void 0,
            className: "dts__modal-reasoning-item",
            "data-running": item.running || void 0,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dts__modal-reasoning-item-index", "aria-hidden": true, children: globalIndex + 1 }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dts__modal-reasoning-item-text", children: item.text })
            ]
          },
          globalIndex
        );
      })
    ] }, group.category.label);
  }) });
}
function DrawerPanel({ turn, data, store, openFile, inspectCall }) {
  const reasoning = data?.reasoning ?? [];
  const toolNodes = data?.tools ?? [];
  const blocks = (0, import_react.useMemo)(() => toolNodes.map((node) => node.data.root), [toolNodes]);
  const stats = (0, import_react.useMemo)(() => computeStats(blocks), [blocks]);
  const close = () => {
    store.close();
  };
  const mode = store.activeMode;
  const [activeIndex, setActiveIndex] = (0, import_react.useState)(null);
  const jumpTo = (index) => {
    setActiveIndex(index);
    const el = document.querySelector(`[data-reasoning-index="${index}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dts__modal-backdrop", onClick: close, "aria-hidden": true }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dts__modal", role: "dialog", "aria-label": `\u7B2C ${turn} \u8F6E\u6D3B\u52A8\u8BE6\u60C5`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "dts__modal-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dts__modal-title", children: [
          "\u7B2C ",
          turn,
          " \u8F6E \xB7 \u{1F9E0} ",
          reasoning.length,
          " \xB7 \u{1F527} ",
          toolNodes.length
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dts__modal-close", onClick: close, "aria-label": "\u5173\u95ED", children: "\u2715" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dts__modal-scroll", children: [
        mode !== "tools" && reasoning.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dts__modal-panel", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "dts__modal-panel-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u{1F9E0} \u601D\u8003\u8FC7\u7A0B" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dts__modal-panel-count", children: reasoning.length })
          ] }),
          reasoning.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", { className: "dts__reasoning-nav", "aria-label": "\u601D\u8003\u6761\u76EE\u5BFC\u822A", children: reasoning.map((_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: "dts__reasoning-nav-item",
              "data-active": activeIndex === index || void 0,
              title: `\u8DF3\u5230\u7B2C ${index + 1} \u6761\u601D\u8003`,
              onClick: () => {
                jumpTo(index);
              },
              children: index + 1
            },
            index
          )) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReasoningGroups, { items: reasoning, activeIndex, jumpToCategory: jumpTo })
        ] }),
        mode !== "reasoning" && toolNodes.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dts__modal-panel", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "dts__modal-panel-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u{1F527} \u5DE5\u5177\u8C03\u7528" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dts__modal-panel-count", children: toolNodes.length })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DrawerToolSummary, { stats, cwd: data?.toolsCwd, openFile }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dts__modal-tools", children: toolNodes.map((node) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            ToolCallTreeList,
            {
              block: node.data.root,
              cwd: data?.toolsCwd,
              openFile,
              inspectCall
            },
            node.key
          )) })
        ] }),
        reasoning.length === 0 && toolNodes.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dts__empty", children: "\u8FD9\u4E00\u8F6E\u6CA1\u6709\u53EF\u663E\u793A\u7684\u601D\u8003\u6216\u5DE5\u5177\u8C03\u7528" })
      ] })
    ] })
  ] });
}
function DrawerApp() {
  const [openTurn, setOpenTurn] = (0, import_react.useState)(null);
  const [data, setData] = (0, import_react.useState)(void 0);
  (0, import_react.useEffect)(() => {
    const store2 = activityStore();
    const render = () => {
      const turn = store2.openTurn;
      setOpenTurn(turn);
      setData(turn === null ? void 0 : store2.get(turn));
    };
    render();
    return store2.subscribe(render);
  }, []);
  if (openTurn === null) return null;
  const store = activityStore();
  const handlers = store.handlers();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    DrawerPanel,
    {
      turn: openTurn,
      data,
      store,
      openFile: handlers.openFile,
      inspectCall: handlers.inspectCall
    }
  );
}
var mounted = false;
function mountActivityDrawer() {
  if (mounted) return;
  mounted = true;
  if (typeof document === "undefined") return;
  if (document.getElementById("dsh-activity-drawer-root") !== null) return;
  const host = document.createElement("div");
  host.id = "dsh-activity-drawer-root";
  document.body.appendChild(host);
  (0, import_client.createRoot)(host).render(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DrawerApp, {}));
}

// src/client/ToolGroupNodeView.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var NS = "dts";
var EMPTY = [];
function turnNumber(node) {
  const location = node.location;
  if (location === void 0) return void 0;
  if (location.kind === "turn" || location.kind === "step") return location.turn?.turn;
  return void 0;
}
var SimpleToolRow = (0, import_react2.memo)(function SimpleToolRow2({
  block,
  selected,
  cwd,
  openFile,
  inspectCall
}) {
  const [open, setOpen] = (0, import_react2.useState)(false);
  const running = isRunning(block);
  const name = callName(block);
  const argsRaw = "kind" in block ? block.call?.argsRaw ?? "" : block.argsRaw;
  const summary = callSummary(block);
  const output = resultText(block);
  const failed = !running && block.isError;
  const stopped = !running && !block.isError && block.error !== void 0;
  const state = running ? "running" : failed ? "error" : stopped ? "stopped" : "ok";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      className: `${NS}__call`,
      "data-selected": selected || void 0,
      "data-state": state,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            className: `${NS}__row`,
            role: "button",
            tabIndex: 0,
            "aria-expanded": open,
            onClick: () => {
              setOpen((value) => !value);
            },
            onKeyDown: (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setOpen((value) => !value);
              }
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `${NS}__dot`, "data-state": state, "aria-hidden": true }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `${NS}__row-name`, children: name || block.callId }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `${NS}__row-summary`, title: summary, children: summary }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  className: `${NS}__inspect`,
                  title: "\u5728\u8F68\u8FF9\u4E2D\u67E5\u770B",
                  "aria-label": `\u5728\u8F68\u8FF9\u4E2D\u67E5\u770B ${name}`,
                  onClick: (event) => {
                    event.stopPropagation();
                    inspectCall(block.callId);
                  },
                  children: "\u2934"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `${NS}__chevron`, "data-open": open || void 0, "aria-hidden": true, children: "\u25B6" })
            ]
          }
        ),
        open && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `${NS}__row-body`, children: [
          argsRaw !== "" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `${NS}__row-args`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `${NS}__row-label`, children: "\u53C2\u6570" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: argsRaw })
          ] }),
          output !== "" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `${NS}__row-output`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `${NS}__row-label`, children: "\u8F93\u51FA" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: `${NS}__row-pre`, children: output })
          ] }),
          argsRaw === "" && output === "" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${NS}__row-empty`, children: running ? "\u6267\u884C\u4E2D\u2026" : "\u65E0\u8F93\u51FA" })
        ] })
      ]
    }
  );
});
function ToolCallTreeList({ block, cwd, openFile, inspectCall }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: `${NS}__drawer-call`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      SimpleToolRow,
      {
        block,
        selected: false,
        cwd,
        openFile,
        inspectCall
      }
    ),
    block.subCalls.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `${NS}__subcalls`, "data-subcalls": true, children: block.subCalls.map((child) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ToolCallTreeList, { block: child, cwd, openFile, inspectCall }, child.callId)) })
  ] });
}
var ToolEntry = (0, import_react2.memo)(function ToolEntry2({
  nodes,
  turn,
  cwd,
  openFile,
  inspectCall
}) {
  const store = activityStore();
  (0, import_react2.useEffect)(() => {
    store.setTools(turn, nodes, cwd);
    store.setHandlers({ openFile, inspectCall });
  }, [store, turn, nodes, cwd, openFile, inspectCall]);
  const stats = (0, import_react2.useMemo)(() => computeStats(nodes.map((node) => node.data.root)), [nodes]);
  const readOnly = (0, import_react2.useMemo)(() => nodes.filter((node) => READONLY_TOOLS.has(callName(node.data.root))).length, [nodes]);
  const running = stats.running > 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "button",
    {
      type: "button",
      className: `${NS}__entry`,
      "data-running": running || void 0,
      title: "\u70B9\u51FB\u6253\u5F00\u672C\u8F6E\u601D\u8003\u4E0E\u5DE5\u5177\u8C03\u7528\u8BE6\u60C5",
      "aria-label": `\u672C\u8F6E\u5DE5\u5177\u8C03\u7528 ${stats.total} \u6B21\uFF0C\u70B9\u51FB\u67E5\u770B`,
      onClick: () => {
        store.open(turn, "tools");
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `${NS}__entry-icon`, "aria-hidden": true, children: "\u{1F527}" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `${NS}__entry-text`, children: running ? `\u5DE5\u5177 ${stats.total} \u8FDB\u884C\u4E2D` : `\u5DE5\u5177 \xD7${stats.total}` }),
        readOnly > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: `${NS}__entry-sub`, children: [
          "\u53EA\u8BFB ",
          readOnly
        ] }),
        stats.errors > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: `${NS}__entry-err`, children: [
          "\u26A0 ",
          stats.errors
        ] })
      ]
    }
  );
});
var ToolGroupNodeView = (0, import_react2.memo)(function ToolGroupNodeView2(props) {
  const { node, useSession, cwd, openFile, inspectCall } = props;
  const turn = turnNumber(node);
  const nodes = useSession((snapshot) => {
    if (turn === void 0) return EMPTY;
    return snapshot.chat.locations.getTurn(turn).map((key) => snapshot.chat.nodes.get(key)).filter((candidate) => candidate !== void 0 && candidate.kind === "tool-call");
  });
  if (nodes.length === 0) return null;
  if (node.key !== nodes[0]?.key) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    ToolEntry,
    {
      nodes,
      turn,
      cwd,
      openFile,
      inspectCall
    }
  );
});

// src/client/styles.ts
var CSS = `
/* Collapse flow slots that render nothing (aggregated tool groups + reasoning
   groups leave empty node slots behind; the transcript column's flex gap
   would otherwise turn each into a blank strip). */
[data-chat-flow-key]:has(> [data-slot]:empty) {
  display: none;
}

.dts__group {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dsw-alias-border-base, rgba(127,127,127,.25));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, transparent);
  overflow: hidden;
}

.dts__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 10px;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-primary);
}

.dts__head:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.08));
}

.dts__head-icon {
  flex: none;
  font-size: 13px;
  line-height: 1;
}

.dts__head-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  line-height: 24px;
}

.dts__head-running {
  color: var(--dsw-alias-state-business-primary);
}

.dts__head-errors {
  flex: none;
  border-radius: 10px;
  padding: 0 8px;
  background: color-mix(in srgb, var(--dsw-alias-state-danger-primary, #e5484d) 14%, transparent);
  color: var(--dsw-alias-state-danger-primary, #e5484d);
  font-size: 11px;
  line-height: 18px;
}

.dts__chevron {
  flex: none;
  margin-left: auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  transition: transform .15s ease;
}

.dts__chevron[data-open="true"] {
  transform: rotate(90deg);
}

.dts__body {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--dsw-alias-border-base, rgba(127,127,127,.18));
}

.dts__summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.05));
}

.dts__summary-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.dts__summary-line {
  font-size: 12px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}

.dts__summary-line b {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.dts__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.dts__chip {
  border-radius: 10px;
  padding: 1px 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.1));
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}

.dts__files {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.dts__file {
  margin: 0;
  border: 0;
  padding: 1px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3182ce) 12%, transparent);
  color: var(--dsw-alias-state-business-primary, #3182ce);
  cursor: pointer;
  font-size: 11px;
  line-height: 18px;
  font-family: var(--ds-font-family-code, monospace);
  white-space: nowrap;
}

.dts__file:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.dts__tool-list {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}

.dts__call {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.dts__call[data-selected="true"] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.08));
}

.dts__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 3px 8px;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 22px;
}

.dts__row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.08));
}

.dts__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-label-caption, #94a3b8);
}

.dts__dot[data-state="running"] {
  background: var(--dsw-alias-state-business-primary, #3182ce);
  animation: dts-pulse 1s ease-in-out infinite;
}

.dts__dot[data-state="ok"] {
  background: var(--dsw-alias-state-success-primary, #2f9e44);
}

.dts__dot[data-state="error"] {
  background: var(--dsw-alias-state-danger-primary, #e5484d);
}

.dts__dot[data-state="stopped"] {
  background: var(--dsw-alias-label-caption, #94a3b8);
}

@keyframes dts-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .35; }
}

.dts__row-name {
  flex: none;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.dts__row-summary {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--ds-font-family-code, monospace);
  font-size: 11px;
}

.dts__inspect {
  flex: none;
  margin: 0;
  border: 0;
  padding: 0 4px;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  font-size: 11px;
  line-height: 20px;
  opacity: 0;
}

.dts__row:hover .dts__inspect,
.dts__inspect:focus-visible {
  opacity: 1;
}

.dts__inspect:hover {
  color: var(--dsw-alias-state-business-primary, #3182ce);
}

.dts__row-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow-y: auto;
  margin: 0 8px 6px 24px;
  padding: 6px 8px;
  border-left: 2px solid var(--dsw-alias-border-base, rgba(127,127,127,.25));
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.04));
  border-radius: 0 6px 6px 0;
}

.dts__row-args,
.dts__row-output {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dts__row-label {
  flex: none;
  color: var(--dsw-alias-label-caption, #94a3b8);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .04em;
}

.dts__row-args code {
  color: var(--dsw-alias-label-secondary);
  font-family: var(--ds-font-family-code, monospace);
  font-size: 11px;
  line-height: 18px;
  word-break: break-all;
  white-space: pre-wrap;
}

.dts__row-pre {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-family: var(--ds-font-family-code, monospace);
  font-size: 11px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 220px;
  overflow-y: auto;
}

.dts__row-empty {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-style: italic;
}

.dts__subcalls {
  display: flex;
  flex-direction: column;
  margin-left: 20px;
  border-left: 1px solid var(--dsw-alias-border-base, rgba(127,127,127,.18));
}

/* ---- one-line entry chips (replaces the inline groups) ---- */
.dts__entry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  border: 1px solid var(--dsw-alias-border-base, rgba(127,127,127,.25));
  border-radius: 999px;
  padding: 2px 12px;
  background: var(--dsw-alias-bg-layer-1, rgba(127,127,127,.06));
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 12px;
  line-height: 22px;
  white-space: nowrap;
}

.dts__entry:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color: var(--dsw-alias-label-primary);
}

.dts__entry[data-running="true"] .dts__entry-text {
  color: var(--dsw-alias-state-business-primary, #3182ce);
}

.dts__entry-icon {
  font-size: 12px;
}

.dts__entry-text {
  font-weight: 500;
}

.dts__entry-sub {
  opacity: .7;
}

.dts__entry-err {
  border-radius: 999px;
  padding: 0 6px;
  background: color-mix(in srgb, var(--dsw-alias-state-danger-primary, #e5484d) 14%, transparent);
  color: var(--dsw-alias-state-danger-primary, #e5484d);
  font-size: 11px;
}

/* ---- centered activity modal (like the image lightbox) ---- */
.dts__modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9990;
  background: rgba(0, 0, 0, .45);
}

.dts__modal {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 9991;
  display: flex;
  flex-direction: column;
  width: min(760px, 92vw);
  max-height: min(84vh, 860px);
  border: 1px solid var(--dsw-alias-border-base, rgba(127,127,127,.25));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  box-shadow: 0 18px 60px rgba(0, 0, 0, .3);
  transform: translate(-50%, -50%);
  animation: dts-modal-in .16s ease-out;
}

@keyframes dts-modal-in {
  from { transform: translate(-50%, -48%) scale(.97); opacity: .4; }
  to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
}

.dts__modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-base, rgba(127,127,127,.18));
}

.dts__modal-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.dts__modal-close {
  margin: 0;
  border: 0;
  padding: 2px 10px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 14px;
  line-height: 22px;
  border-radius: 6px;
}

.dts__modal-close:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color: var(--dsw-alias-label-primary);
}

.dts__modal-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px 24px;
}

/* ---- separate panels: thinking vs tools ---- */
.dts__modal-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--dsw-alias-border-base, rgba(127,127,127,.22));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.04));
  padding: 12px 12px 14px;
}

.dts__modal-panel + .dts__modal-panel {
  margin-top: 18px;
}

.dts__modal-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.dts__modal-panel-count {
  border-radius: 999px;
  padding: 0 8px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}

/* ---- reasoning item jump navigation ---- */
.dts__reasoning-nav {
  display: flex;
  gap: 4px;
  max-width: 100%;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: thin;
}

.dts__reasoning-nav-item {
  flex: none;
  margin: 0;
  border: 1px solid var(--dsw-alias-border-base, rgba(127,127,127,.25));
  border-radius: 8px;
  padding: 1px 9px;
  background: var(--dsw-alias-bg-layer-1, rgba(127,127,127,.06));
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 11px;
  line-height: 20px;
  min-width: 24px;
}

.dts__reasoning-nav-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14));
  color: var(--dsw-alias-label-primary);
}

.dts__reasoning-nav-item[data-active="true"] {
  border-color: var(--dsw-alias-state-business-primary, #3182ce);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3182ce) 16%, transparent);
  color: var(--dsw-alias-state-business-primary, #3182ce);
  font-weight: 600;
}

.dts__modal-reasoning {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dts__modal-reasoning-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dts__modal-reasoning-group-title {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 2px 12px;
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12));
  border: 1px solid var(--dsw-alias-border-base, rgba(127,127,127,.25));
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 22px;
}

.dts__modal-reasoning-item {
  display: flex;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 22px;
  border-radius: 6px;
  scroll-margin-top: 8px;
}

.dts__modal-reasoning-item[data-active="true"] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #3182ce) 8%, transparent);
  outline: 1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary, #3182ce) 35%, transparent);
}

.dts__modal-reasoning-item[data-running="true"] {
  color: var(--dsw-alias-label-primary);
}

.dts__modal-reasoning-item-index {
  flex: none;
  align-self: flex-start;
  min-width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.1));
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  font-weight: 600;
  line-height: 20px;
  margin-top: 2px;
}

.dts__modal-reasoning-item-text {
  min-width: 0;
  flex: 1 1 auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.dts__modal-tools {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* call-tree wrapper inside the modal (see ToolCallTreeList) */
.dts__drawer-call {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.dts__generic {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-height: 28px;
  padding: 3px 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.dts__generic-name {
  flex: none;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.dts__generic-args {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--ds-font-family-code, monospace);
  font-size: 11px;
}

.dts__toggle {
  align-self: flex-start;
  margin: 2px 8px 8px;
  border: 0;
  border-radius: 10px;
  padding: 2px 10px;
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.1));
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  font-size: 11px;
  line-height: 20px;
}

.dts__toggle:hover {
  color: var(--dsw-alias-label-primary);
}

.dts__empty {
  padding: 8px 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
`;
function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("dsh-tool-summary-styles") !== null) return;
  const style = document.createElement("style");
  style.id = "dsh-tool-summary-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

// src/client/index.ts
var inject = ["slots"];
function apply(ctx) {
  injectStyles();
  mountActivityDrawer();
  ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
    name: "conversation.chat.node",
    key: "tool-call",
    priority: -100,
    locale: "conversation"
    // No children declaration: `tool.call.toolview` is declared exclusively by
    // ui-tool; this shadow only dispatches it at render time.
  }, ToolGroupNodeView));
}

return module.exports; } });
