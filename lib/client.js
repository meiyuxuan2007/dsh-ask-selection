/**
 * dsh-ask-selection — client half.
 *
 * 选中即追问（Ask about any selection）：
 *   1. 在会话回答 / 右侧栏文档预览中用鼠标选中一段内容；
 *   2. 右键 → 「追问选中内容 / 要求修改选中内容」；
 *   3. 弹出的面板显示来源（文件路径 + 小节/页码/行号/单元格）与引用原文，
 *      输入问题后 Enter 直接发送到当前会话，或「插入输入框」放进草稿。
 *
 * v0.1.1（参照 Codex 扩展「Add to Codex Chat」模式）：
 *   - 纯文本文档支持「轻引用」：只写 文件路径 + 行号/小节/页码 + 开头 80 字预览，
 *     助手自行按路径读取原文（Codex 同款「文件+行号」思路），避免长引用截断；
 *   - 「插入输入框」后自动聚焦 composer 输入框。
 *
 * 实现要点（对齐 dsh 客户端插件纪律）：
 *   - 唯一持久注册：conversation.input.overlay 槽（唯一带 inputActions 的浮层槽）；
 *     sidebar.right.tab.document.actions 槽只做「预览文件路径登记」，渲染零尺寸标记。
 *   - 菜单与面板通过 ReactDOM.createPortal(document.body) 渲染（archive-manager 先例）。
 *   - 所有 DOM 探测 fail-open：找不到标记就退化为通用来源标签，绝不抛错。
 *   - 只用官方 dsw 主题 token（--dsw-alias-*），浅色/深色自动跟随。
 *   - 监听器在组件 effect 中注册并返回清理函数；卸载后无残留。
 */
window.__ModuleLoader__.load({
	id: "dsh-ask-selection",
	factory: function (require) {
		var module = { exports: {} };
		var exports = module.exports;

		var React = require("react");
		var ReactDOM = require("react-dom");

		var PACKAGE_ID = "dsh-ask-selection";
		var NS = PACKAGE_ID;
		var OVERLAY_SLOT = "conversation.input.overlay";
		var DOC_ACTIONS_SLOT = "sidebar.right.tab.document.actions";

		/* ------------------------------------------------------------------ */
		/* 内嵌词典（locale 服务不可用/缺词条时兜底）                            */
		/* ------------------------------------------------------------------ */

		var zhDict = {
			"ask.menu.ask": "追问选中内容",
			"ask.menu.modify": "要求修改选中内容",
			"ask.menu.copy": "复制选中内容",
			"ask.panel.titleAsk": "追问选中内容",
			"ask.panel.titleModify": "对选中内容提出修改要求",
			"ask.panel.source": "来源",
			"ask.panel.placeholderAsk": "针对这段引用想问什么？（Enter 发送）",
			"ask.panel.placeholderModify": "希望怎么改这段内容？（Enter 发送）",
			"ask.panel.send": "发送",
			"ask.panel.insert": "插入输入框",
			"ask.panel.cancel": "取消",
			"ask.panel.hint": "Enter 发送 · Shift+Enter 换行 · Esc 取消",
			"ask.panel.excelHint": "显示的是公式栏当前单元格，如需其它单元格请先在表格中左键单击选中它",
			"ask.panel.quoteMode": "引用方式",
			"ask.panel.quote": "引用内容",
			"ask.panel.quoteFull": "完整引用",
			"ask.panel.quoteLight": "轻引用",
			"ask.panel.quoteLightHint": "只附文件路径、位置与开头预览（约 80 字），助手会自行读取文件原文，提示词更短且无截断",
			"ask.prompt.lightHead": "引用位置：{loc}",
			"ask.prompt.lightPreview": "引用开头：{preview}",
			"ask.source.chat": "当前会话的回答",
			"ask.source.chatUser": "当前会话的提问",
			"ask.source.file": "文件",
			"ask.source.page": "第 {n} 页",
			"ask.source.section": "小节「{s}」",
			"ask.source.line": "第 {a}–{b} 行",
			"ask.source.cell": "工作表「{sheet}」单元格 {cell}",
			"ask.prompt.headerAsk": "我想追问以下引用内容（来源：{source}）：",
			"ask.prompt.headerModify": "请修改以下引用内容（来源：{source}）：",
			"ask.prompt.quote": "引用内容：",
			"ask.prompt.request": "我的要求："
		};

		var enDict = {
			"ask.menu.ask": "Ask about selection",
			"ask.menu.modify": "Request changes to selection",
			"ask.menu.copy": "Copy selection",
			"ask.panel.titleAsk": "Ask about the selection",
			"ask.panel.titleModify": "Request changes to the selection",
			"ask.panel.source": "Source",
			"ask.panel.placeholderAsk": "What do you want to ask about this quote? (Enter to send)",
			"ask.panel.placeholderModify": "How should this content be changed? (Enter to send)",
			"ask.panel.send": "Send",
			"ask.panel.insert": "Insert into composer",
			"ask.panel.cancel": "Cancel",
			"ask.panel.hint": "Enter to send · Shift+Enter for newline · Esc to cancel",
			"ask.panel.excelHint": "Shows the formula-bar cell. Left-click another cell first to target it.",
			"ask.panel.quoteMode": "Quote mode",
			"ask.panel.quoteFull": "Full quote",
			"ask.panel.quoteLight": "Light reference",
			"ask.panel.quoteLightHint": "Only the file path, location and a short preview; the agent reads the file itself, so nothing is truncated.",
			"ask.prompt.lightHead": "Quoted location: {loc}",
			"ask.prompt.lightPreview": "Quote begins: {preview}",
			"ask.source.chat": "an assistant reply in this conversation",
			"ask.source.chatUser": "a user message in this conversation",
			"ask.source.file": "file",
			"ask.source.page": "page {n}",
			"ask.source.section": "section \u201c{s}\u201d",
			"ask.source.line": "lines {a}\u2013{b}",
			"ask.source.cell": "sheet \u201c{sheet}\u201d cell {cell}",
			"ask.prompt.headerAsk": "I want to ask about the following quoted content (source: {source}):",
			"ask.prompt.headerModify": "Please revise the following quoted content (source: {source}):",
			"ask.prompt.quote": "Quoted content:",
			"ask.prompt.request": "My request:"
		};

		/* ------------------------------------------------------------------ */
		/* 内嵌词典兜底查找                                                    */
		/* ------------------------------------------------------------------ */

		function fallbackText(key, vars) {
			var s = zhDict[key] != null ? zhDict[key] : key;
			if (vars) {
				Object.keys(vars).forEach(function (k) {
					s = s.replace(new RegExp("\\{" + k + "\\}", "g"), String(vars[k] == null ? "" : vars[k]));
				});
			}
			return s;
		}

		/* ------------------------------------------------------------------ */
		/* 工具                                                                */
		/* ------------------------------------------------------------------ */

		var h = React.createElement;

		/** 预览文件地址（data-textpreview-url = tab.contentId）→ 绝对路径 的登记表 */
		var previewPaths = new Map();
		var previewSubscribers = new Set();
		function notifyPreviewPaths() {
			previewSubscribers.forEach(function (fn) {
				try { fn(); } catch (e) { /* fail-open */ }
			});
		}
		function registerPreviewPath(address, absolutePath) {
			if (!address || !absolutePath) return;
			if (previewPaths.get(address) === absolutePath) return;
			previewPaths.set(address, absolutePath);
			notifyPreviewPaths();
		}

		/** 全局 UI 状态（菜单 / 面板），由 dock 组件订阅 */
		var ui = {
			menu: null,   // { x, y, source, quote, mode }
			panel: null   // { source, quote, mode, anchor }
		};
		var uiSubscribers = new Set();
		function notifyUi() {
			uiSubscribers.forEach(function (fn) {
				try { fn(); } catch (e) { /* fail-open */ }
			});
		}
		function setUi(patch) {
			ui = Object.assign({}, ui, patch);
			notifyUi();
		}
		function useUi() {
			var useSES = React.useSyncExternalStore || null;
			if (useSES) {
				return useSES(
					function (cb) { uiSubscribers.add(cb); return function () { uiSubscribers.delete(cb); }; },
					function () { return ui; }
				);
			}
			// 兜底：老 React
			var force = React.useState(0)[1];
			React.useEffect(function () {
				var cb = function () { force(function (v) { return v + 1; }); };
				uiSubscribers.add(cb);
				return function () { uiSubscribers.delete(cb); };
			}, []);
			return ui;
		}

		/** 文本截断 */
		function clip(text, max) {
			if (text.length <= max) return text;
			return text.slice(0, max) + "…";
		}

		/** 把选区文本整理成带换行的引用（保留段落感，压缩纯空白） */
		function normalizeQuote(text, maxChars) {
			var limit = maxChars || 4000;
			var t = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
			t = t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n");
			if (t.length > limit) t = t.slice(0, limit) + "\n…（已截断）";
			return t.trim();
		}

		function selectionRange() {
			try {
				var sel = window.getSelection();
				if (!sel || sel.rangeCount === 0) return null;
				var range = sel.getRangeAt(0);
				if (range.collapsed) return null;
				return { sel: sel, range: range, text: String(sel.toString() || "") };
			} catch (e) {
				return null;
			}
		}

		function elementFromNode(node) {
			if (!node) return null;
			return node.nodeType === 1 ? node : node.parentElement;
		}

		/** 选区锚点是否在可编辑元素内（输入框里选字应该保留原生菜单） */
		function insideEditable(el) {
			if (!el || !el.closest) return false;
			return !!el.closest("input, textarea, select, [contenteditable=\"true\"], [contenteditable=\"\"]");
		}

		/** 「仅插入」后把焦点还给 composer 输入框（对齐 Codex focusComposer 体验） */
		function focusComposerNear(anchor) {
			try {
				var root = anchor && anchor.closest ? anchor.closest("[data-conversation-composer-overlay]") : null;
				var box = root ? root.querySelector("[role=textbox][contenteditable=\"true\"]") : null;
				if (!box) {
					var overlays = document.querySelectorAll("[data-conversation-composer-overlay]");
					for (var i = overlays.length - 1; i >= 0 && !box; i--) {
						box = overlays[i].querySelector("[role=textbox][contenteditable=\"true\"]") ||
							overlays[i].querySelector("[role=textbox]");
					}
				}
				if (box && typeof box.focus === "function") { box.focus(); return true; }
			} catch (e) { /* fail-open */ }
			return false;
		}

		/* ------------------------------------------------------------------ */
		/* 来源识别                                                            */
		/* ------------------------------------------------------------------ */

		/**
		 * 从右键事件解析「来源」。
		 * source = {
		 *   kind: "chat" | "chatUser" | "doc" | "excel",
		 *   label: 展示用完整标签（文件路径 + 定位信息）,
		 *   address?: 预览资源地址（doc）
		 * }
		 * 全部 fail-open：任何一步失败都返回 null 或降级标签。
		 */
		function resolveSource(target, range) {
			var el = elementFromNode(target);
			if (!el || !el.closest) return null;

			// 右侧栏文档预览（text/markdown/code/pdf/office）
			var previewRoot = el.closest("[data-textpreview-url]");
			if (previewRoot) {
				var address = previewRoot.getAttribute("data-textpreview-url") || "";
				var path = previewPaths.get(address) || "";
				return buildDocSource(el, address, path, range);
			}

			// Excel（FortuneSheet，无文本选区，走单元格通道）
			var excelRoot = el.closest("[data-excel-preview]");
			if (excelRoot) {
				return buildExcelSource(excelRoot);
			}

			// 右侧栏其它区域（含 unpreviewable 等）不处理
			if (el.closest("[data-sidebar-right-session]")) return null;

			// 会话主区：区分回答 / 用户消息（用户消息内选中一般用于引用改写）
			var chatRoot = chatRootOf(el, range);
			if (chatRoot) {
				var userBubble = el.closest(
					'[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"], ' +
					'[data-slot="conversation.chat.user"], [data-dsw-chat-user], .dsw-chat-user, [data-chat-user]'
				);
				return { kind: userBubble ? "chatUser" : "chat", label: null, address: null };
			}
			return null;
		}

		function buildDocSource(el, address, path, range) {
			var parts = [];
			var pageEl = null, section = null, lineInfo = null;
			try {
				pageEl = el.closest("[data-page-number]") || el.closest(".page");
				section = headingTrailOf(el);
				lineInfo = lineRangeOf(el, range);
			} catch (e) { /* fail-open */ }

			var kind = "doc";
			if (pageEl) {
				var n = pageEl.getAttribute("data-page-number");
				if (!n) n = (Array.prototype.indexOf.call(pageEl.parentElement ? pageEl.parentElement.children : [], pageEl) + 1) || "";
				if (n) parts.push({ page: n });
			}
			if (section) parts.push({ section: section });
			if (lineInfo) parts.push(lineInfo);

			return {
				kind: kind,
				label: null,
				address: address,
				path: path,
				pathFallback: looksLikeAbsolutePath(address) ? String(address) : "",
				parts: parts
			};
		}

		/** 判断字符串是否已经是绝对文件路径（盘符 / POSIX 根），避免把 dsh-resource:// 地址当路径 */
		function looksLikeAbsolutePath(value) {
			var s = String(value == null ? "" : value);
			if (!s) return false;
			if (s.charAt(0) === "/") return true;
			if (s.length > 2 && s.charAt(1) === ":" && (s.charCodeAt(2) === 47 || s.charCodeAt(2) === 92)) return true;
			return false;
		}

		/** 会话主区边界：优先用平台真实标记，退回 main 时要求选区锚点同在 main 内 */
		var CHAT_ROOT_SELECTOR = '[data-chat-flow-kind], [data-slot="conversation.chat.node"], [data-slot="conversation.chat.flow"], [data-slot="conversation.chat.message"], [data-conversation-scroll]';
		function chatRootOf(el, range) {
			var root = el.closest ? el.closest(CHAT_ROOT_SELECTOR) : null;
			if (root) return root;
			var main = el.closest ? el.closest("main, article, [data-dsw-chat]") : null;
			if (!main) return null;
			var anchor = range && range.startContainer ? elementFromNode(range.startContainer) : null;
			if (!anchor || !main.contains(anchor)) return null;
			return main;
		}

		/** Markdown 预览：从选区元素向上找最近的标题路径（取最近的 h1..h6） */
		function headingTrailOf(el) {
			try {
				var root = el.closest("[data-textpreview-url]") || document;
				var container = el;
				// 找到块级祖先
				while (container && container !== root && !isBlock(container)) {
					container = container.parentElement;
				}
				if (!container || container === root) return null;
				var headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
				var last = null;
				for (var i = 0; i < headings.length; i++) {
					var hd = headings[i];
					// hd 在 container 之前（或包含它）
					if (hd === container || hd.contains(container) || !(hd.compareDocumentPosition(container) & Node.DOCUMENT_POSITION_PRECEDING)) {
						last = hd;
					}
				}
				if (!last) return null;
				var text = (last.textContent || "").trim();
				return text ? clip(text, 60) : null;
			} catch (e) {
				return null;
			}
		}

		function isBlock(el) {
			if (!el || el.nodeType !== 1) return false;
			var tag = el.tagName;
			return tag === "P" || tag === "LI" || tag === "PRE" || tag === "BLOCKQUOTE" ||
				tag === "TABLE" || tag === "TD" || tag === "TH" || tag === "H1" || tag === "H2" ||
				tag === "H3" || tag === "H4" || tag === "H5" || tag === "H6" || tag === "DIV";
		}

		/** 文本/代码预览：行号范围（data-textpreview-line） */
		function lineRangeOf(el, range) {
			try {
				var root = el.closest("[data-textpreview-url]") || document;
				var lines = root.querySelectorAll("[data-textpreview-line]");
				if (!lines.length) return null;

				// 从一个节点向上找它所在的行元素
				function lineOf(node) {
					var n = node;
					while (n && n !== root) {
						if (n.nodeType === 1 && n.hasAttribute && n.hasAttribute("data-textpreview-line")) return n;
						n = n.parentElement;
					}
					return null;
				}

				var startLine = lineOf(range ? (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement) : null) || lineOf(el);
				var endLine = lineOf(range ? (range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement) : null) || startLine;
				if (!startLine) return null;

				var a = startLine.getAttribute("data-textpreview-line");
				var b = endLine.getAttribute("data-textpreview-line");
				if (!a) return null;
				if (b && Number(b) < Number(a)) { var tmp = a; a = b; b = tmp; }
				return { lineFrom: a, lineTo: b || a };
			} catch (e) {
				return null;
			}
		}

		/** Excel：读 FortuneSheet 名称框 / 公式栏 / 工作表标签（fail-open） */
		function buildExcelSource(root) {
			var cellAddr = "", cellValue = "", sheetName = "";
			try {
				var box = root.querySelector(".fortune-name-box");
				if (box) cellAddr = (box.textContent || "").trim();
				var fx = root.querySelector("#luckysheet-functionbox-cell, .fortune-fx-input");
				if (fx) cellValue = (fx.textContent || "").trim();
				var tabs = root.querySelectorAll(".fortune-sheet-list-item");
				for (var i = 0; i < tabs.length; i++) {
					var t = tabs[i];
					var check = t.querySelector(".fortune-sheet-selected-check-sapce");
					if (check && check.childElementCount > 0) {
						sheetName = (t.textContent || "").trim();
						break;
					}
				}
			} catch (e) { /* fail-open */ }

			var previewRoot = root.closest("[data-textpreview-url]");
			var address = previewRoot ? previewRoot.getAttribute("data-textpreview-url") : "";
			var path = address ? previewPaths.get(address) : "";

			return {
				kind: "excel",
				label: null,
				address: address,
				path: path,
				parts: (cellAddr || sheetName) ? [{ cell: cellAddr, sheet: sheetName }] : [],
				cellValue: cellValue
			};
		}

		/* ------------------------------------------------------------------ */
		/* 来源标签（i18n）                                                    */
		/* ------------------------------------------------------------------ */

		/** 位置信息（页/小节/行/单元格），不含文件路径 */
		function locatorLabel(t, source) {
			if (!source) return "";
			var bits = [];
			(source.parts || []).forEach(function (part) {
				if (part.page != null) bits.push(t("ask.source.page", { n: part.page }));
				if (part.section) bits.push(t("ask.source.section", { s: part.section }));
				if (part.cell) bits.push(t("ask.source.cell", { sheet: part.sheet || "", cell: part.cell }));
				else if (part.sheet) bits.push(part.sheet);
			});
			var ln = part2line(source);
			if (ln) bits.push(t("ask.source.line", ln));
			return bits.join(" · ");
		}

		function sourceLabel(t, source) {
			if (!source) return "";
			var bits = [];
			if (source.kind === "chat") bits.push(t("ask.source.chat"));
			else if (source.kind === "chatUser") bits.push(t("ask.source.chatUser"));
			else {
				var p = source.path || source.pathFallback || "";
				if (p) bits.push(p);
				var loc = locatorLabel(t, source);
				if (loc) bits.push(loc);
				if (!bits.length) bits.push(t("ask.source.file"));
			}
			return bits.join(" · ");
		}

		function part2line(source) {
			var out = null;
			(source.parts || []).forEach(function (part) {
				if (part.lineFrom) out = { a: part.lineFrom, b: part.lineTo || part.lineFrom };
			});
			return out;
		}

		/* ------------------------------------------------------------------ */
		/* 组装提示词                                                          */
		/* ------------------------------------------------------------------ */

		function buildPrompt(t, source, quote, request, mode, quoteMode) {
			var label = sourceLabel(t, source);
			var header = mode === "modify"
				? t("ask.prompt.headerModify", { source: label })
				: t("ask.prompt.headerAsk", { source: label });
			var lines = [header, ""];

			if (quoteMode === "light" && source && source.kind === "doc" && source.path) {
				// 轻引用：路径 + 位置 + 开头预览，助手自己读文件（对齐 Codex「文件+行号」模式）
				var loc = "`" + String(source.path).replace(/`/g, "'") + "`";
				var locator = locatorLabel(t, source);
				if (locator) loc += " · " + locator;
				lines.push(t("ask.prompt.lightHead", { loc: loc }));
				var preview = clip(String(quote).split("\n").join(" ").replace(/\s+/g, " ").trim(), 80);
				lines.push(t("ask.prompt.lightPreview", { preview: preview }));
			} else {
				lines.push(t("ask.prompt.quote"));
				var q = quote.split("\n").map(function (l) { return "> " + l; }).join("\n");
				lines.push(q);

				// Excel：附上公式栏读到的单元格值
				if (source && source.kind === "excel" && source.cellValue) {
					lines.push("> [fx] " + source.cellValue);
				}
			}

			lines.push("");
			lines.push(t("ask.prompt.request"));
			lines.push(request);
			return lines.join("\n");
		}

				/* ------------------------------------------------------------------ */
		/* 菜单 + 面板组件                                                     */
		/* ------------------------------------------------------------------ */

		var MENU_ACTIONS = [
			{ id: "ask", icon: "❓" },
			{ id: "modify", icon: "✏️" },
			{ id: "copy", icon: "📋" }
		];

		function ContextMenu(props) {
			var t = props.t, state = props.state, actions = props.actions;
			var ref = React.useRef(null);

			React.useEffect(function () {
				if (ref.current) ref.current.focus();
			}, []);

			var style = {
				position: "fixed",
				left: Math.min(state.x, (typeof window !== "undefined" ? window.innerWidth : 1024) - 230),
				top: Math.min(state.y, (typeof window !== "undefined" ? window.innerHeight : 768) - 160),
				zIndex: 2147483000,
				minWidth: 200,
				padding: "4px",
				borderRadius: "10px",
				background: "var(--dsw-alias-bg-layer-2, #2a2a2e)",
				border: "1px solid var(--dsw-alias-border-l1, #3c3c42)",
				boxShadow: "0 8px 24px rgba(0,0,0,.35)",
				outline: "none"
			};

			var itemStyle = {
				display: "flex", alignItems: "center", gap: "8px",
				width: "100%", padding: "7px 10px",
				background: "transparent", border: "none", cursor: "pointer",
				color: "var(--dsw-alias-label-primary, inherit)",
				font: "var(--dsh-content-font-size-secondary, 13px) var(--dsw-font-family, inherit)",
				borderRadius: "6px", textAlign: "left"
			};

			function hover(e) { e.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.15))"; }
			function unhover(e) { e.currentTarget.style.background = "transparent"; }

			return h("div", {
				ref: ref, role: "menu", tabIndex: -1, style: style,
				"data-ask-selection-menu": true,
				onContextMenu: function (e) { e.preventDefault(); e.stopPropagation(); },
				onBlur: function (e) {
				// 焦点移到菜单内部（点按钮）不关；移到外部才关
				var rt = e.relatedTarget;
				if (rt && rt.closest && rt.closest("[data-ask-selection-menu]")) return;
				actions.closeSoon();
			},
				onKeyDown: function (e) {
					if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); actions.close(); }
				}
			},
				MENU_ACTIONS.map(function (m) {
					return h("button", {
						key: m.id, type: "button", role: "menuitem", style: itemStyle,
						onMouseEnter: hover, onMouseLeave: unhover,
						onClick: function (e) {
							e.preventDefault(); e.stopPropagation();
							actions.choose(m.id);
						}
					},
						h("span", { "aria-hidden": true, style: { flex: "none", width: "16px", textAlign: "center" } }, m.icon),
						h("span", { style: { flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
							t(m.id === "ask" ? "ask.menu.ask" : m.id === "modify" ? "ask.menu.modify" : "ask.menu.copy"))
					);
				})
			);
		}

		function AskPanel(props) {
			var t = props.t, state = props.state, actions = props.actions, inputActions = props.inputActions;
			var inputRef = React.useRef(null);
			var _v = React.useState("");
			var value = _v[0], setValue = _v[1];

			React.useEffect(function () {
				if (inputRef.current) {
					inputRef.current.focus();
				}
			}, []);

			var isModify = state.mode === "modify";
			var label = sourceLabel(t, state.source);
			var isExcel = state.source && state.source.kind === "excel";
			var _qm = React.useState("full");
			var quoteMode = _qm[0], setQuoteMode = _qm[1];
			// 轻引用只在「文档预览 + 已知绝对路径 + 有定位信息」时提供（助手可按路径自行读取）
			var canLight = !!state.source && state.source.kind === "doc" && !!state.source.path &&
				!!(state.source.parts && state.source.parts.length);

			var wrapStyle = {
				position: "fixed",
				inset: 0,
				zIndex: 2147483000,
				display: "flex", alignItems: "flex-start", justifyContent: "center",
				paddingTop: "12vh",
				background: "rgba(0,0,0,.25)"
			};

			var cardStyle = {
				width: "min(680px, calc(100vw - 48px))",
				maxHeight: "72vh",
				display: "flex", flexDirection: "column",
				borderRadius: "14px",
				background: "var(--dsw-alias-bg-layer-2, #2a2a2e)",
				border: "1px solid var(--dsw-alias-border-l1, #3c3c42)",
				boxShadow: "0 16px 48px rgba(0,0,0,.45)"
			};

			function send() {
				var text = value.trim();
				if (!text) return;
				actions.submit(text, state, inputActions, quoteMode);
			}

			function onKeyDown(e) {
				if (e.key === "Escape") {
					e.preventDefault(); e.stopPropagation();
					actions.close();
					return;
				}
				if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
					// 焦点在按钮上时不要吞掉 Enter（否则点「取消」也会发送）
					if (inputRef.current && e.target !== inputRef.current) return;
					e.preventDefault();
					send();
				}
			}

			return h("div", {
				style: wrapStyle,
				"data-ask-selection-backdrop": true,
				onContextMenu: function (e) { e.preventDefault(); e.stopPropagation(); },
				onMouseDown: function (e) { if (e.target === e.currentTarget) actions.close(); }
			},
				h("section", {
					role: "dialog", "aria-modal": "true", "aria-label": t(isModify ? "ask.panel.titleModify" : "ask.panel.titleAsk"),
					style: cardStyle,
					onKeyDown: onKeyDown
				},
					// 标题行
					h("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px 0" } },
						h("span", { style: { fontWeight: 600, fontSize: "14px", color: "var(--dsw-alias-label-primary, inherit)" } },
							t(isModify ? "ask.panel.titleModify" : "ask.panel.titleAsk")),
						h("span", {
							style: {
								flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
								fontSize: "12px", color: "var(--dsw-alias-label-secondary, #9a9aa2)"
							}, title: label
						}, label ? t("ask.panel.source") + "：" + label : "")
					),
					// 引用块
					h("div", {
						style: {
							margin: "10px 16px 0", padding: "8px 10px",
							borderRadius: "8px",
							background: "var(--dsw-alias-bg-layer-1, rgba(128,128,128,.08))",
							border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.15))",
							maxHeight: "180px", overflow: "auto"
						}
					},
						h("pre", {
							style: {
								margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
								font: "var(--dsh-content-font-size-secondary, 13px) var(--dsw-font-family-code, monospace)",
								color: "var(--dsw-alias-label-primary, inherit)"
							}
						}, state.quote),
						isExcel ? h("div", {
							style: { marginTop: "6px", fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #7a7a82)" }
						}, t("ask.panel.excelHint")) : null
					),
					// 引用方式切换（仅文档预览 + 已知路径 + 有定位信息时出现）
					canLight ? h("div", { style: { display: "flex", alignItems: "center", gap: "6px", margin: "8px 16px 0", flexWrap: "wrap" } },
						h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #7a7a82)" } },
							t("ask.panel.quoteMode") + "："),
						h("button", {
							type: "button", onClick: function () { setQuoteMode("full"); },
							style: pillStyle(quoteMode !== "light")
						}, t("ask.panel.quoteFull")),
						h("button", {
							type: "button", title: t("ask.panel.quoteLightHint"),
							onClick: function () { setQuoteMode("light"); },
							style: pillStyle(quoteMode === "light")
						}, t("ask.panel.quoteLight")),
						quoteMode === "light" ? h("span", {
							style: { flex: "1 1 100%", fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #7a7a82)" }
						}, t("ask.panel.quoteLightHint")) : null
					) : null,
					// 输入区
					h("div", { style: { padding: "12px 16px" } },
						h("textarea", {
							ref: inputRef,
							value: value,
							rows: 3,
							placeholder: t(isModify ? "ask.panel.placeholderModify" : "ask.panel.placeholderAsk"),
							onChange: function (e) { setValue(e.target.value); },
							style: {
								width: "100%", boxSizing: "border-box", resize: "vertical",
								minHeight: "64px",
								padding: "8px 10px", borderRadius: "8px",
								background: "var(--dsw-alias-bg-layer-1, rgba(128,128,128,.08))",
								border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2))",
								color: "var(--dsw-alias-label-primary, inherit)",
								font: "var(--dsh-content-font-size-primary, 14px) var(--dsw-font-family, inherit)"
							}
						}),
						h("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" } },
							h("span", {
								style: { flex: "1", fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #7a7a82)" }
							}, t("ask.panel.hint")),
							h("button", {
								type: "button", onClick: function () { actions.close(); },
								style: buttonStyle(false)
							}, t("ask.panel.cancel")),
							h("button", {
								type: "button", onClick: function () { actions.insert(value, state, inputActions, quoteMode); },
								style: buttonStyle(false)
							}, t("ask.panel.insert")),
							h("button", {
								type: "button", onClick: send, disabled: !value.trim(),
								style: buttonStyle(true)
							}, t("ask.panel.send"))
						)
					)
				)
			);
		}

		function buttonStyle(primary) {
			return {
				padding: "6px 14px", borderRadius: "8px", cursor: "pointer",
				border: "1px solid " + (primary ? "transparent" : "var(--dsw-alias-border-l2, rgba(128,128,128,.3))"),
				background: primary ? "var(--dsw-alias-accent-bg, #4c6ef5)" : "transparent",
				color: primary ? "var(--dsw-alias-accent-fg, #fff)" : "var(--dsw-alias-label-primary, inherit)",
				font: "var(--dsh-content-font-size-secondary, 13px) var(--dsw-font-family, inherit)"
			};
		}

		/** 引用方式切换的小圆角按钮 */
		function pillStyle(active) {
			return {
				padding: "3px 10px", borderRadius: "999px", cursor: "pointer",
				border: "1px solid " + (active ? "var(--dsw-alias-border-l2, rgba(128,128,128,.4))" : "transparent"),
				background: active ? "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.15))" : "transparent",
				color: active ? "var(--dsw-alias-label-primary, inherit)" : "var(--dsw-alias-label-tertiary, #7a7a82)",
				font: "12px var(--dsw-font-family, inherit)"
			};
		}

		/* ------------------------------------------------------------------ */
		/* Dock：conversation.input.overlay 槽组件                             */
		/* ------------------------------------------------------------------ */

		function AskSelectionDock(inputProps) {
			var t = React.useMemo(function () {
				return function (key, vars) { return translate(inputProps.t, key, vars); };
			}, [inputProps.t]);

			var state = useUi();
			var inputActions = inputProps.inputActions;
			// 隐藏锚点：留在 composer 卡片内部，「插入后聚焦」时用它定位本会话的输入框
			var anchorRef = React.useRef(null);

			// contextmenu 捕获监听（挂载期）
			React.useEffect(function () {
				function onContextMenu(e) {
					// 自己的 UI 内部不再拦截
					if (e.target && e.target.closest && e.target.closest("[data-ask-selection-menu], [data-ask-selection-backdrop]")) return;

					if (e.defaultPrevented) return;
					var info = selectionRange();
					var el = elementFromNode(e.target);
					var source = resolveSource(e.target, info ? info.range : null);
					var excel = source && source.kind === "excel";

					if (!info && !excel) return;             // 没有选区也不在 Excel 预览里 → 不打扰原生菜单
					if (info && insideEditable(el)) return;  // 输入框里选字 → 保留原生菜单

					var quote = info ? normalizeQuote(info.text) : "";
					if (!excel && !quote) return;

					e.preventDefault();
					e.stopPropagation();

					setUi({
						menu: { x: e.clientX, y: e.clientY, source: source, quote: quote, mode: "ask" },
						panel: null
					});
				}
				document.addEventListener("contextmenu", onContextMenu, true);
				return function () {
					document.removeEventListener("contextmenu", onContextMenu, true);
				};
			}, []);

			// 点击其它地方 → 关菜单（capture）
			React.useEffect(function () {
				function onPointerDown(e) {
					if (state.menu && e.target && e.target.closest && e.target.closest("[data-ask-selection-menu]")) return;
					if (state.menu) setUi({ menu: null });
				}
				document.addEventListener("pointerdown", onPointerDown, true);
				return function () { document.removeEventListener("pointerdown", onPointerDown, true); };
			}, [state.menu]);

			// 转发翻译（注入的 t 是官方 locale 绑定）
			var actions = React.useMemo(function () {
				return {
					closeSoon: function () { setUi({ menu: null }); },
					close: function () { setUi({ menu: null, panel: null }); },
					choose: function (mode) {
						var m = ui.menu;
						if (!m) return;
						if (mode === "copy") {
							setUi({ menu: null });
							try { navigator.clipboard.writeText(m.quote); } catch (e) { /* fail-open */ }
							return;
						}
						setUi({ menu: null, panel: { source: m.source, quote: m.quote, mode: mode === "modify" ? "modify" : "ask" } });
					},
					submit: function (text, panel, ia, quoteMode) {
						var prompt = buildPrompt(t, panel.source, panel.quote, text, panel.mode, quoteMode || "full");
						// 先写草稿：写失败就保持面板开着，输入不丢
						try {
							if (ia && typeof ia.setDraft === "function") ia.setDraft(prompt);
						} catch (err) {
							console.warn("ask-selection: submit failed", err);
							return;
						}
						setUi({ menu: null, panel: null });
						try {
							if (ia && typeof ia.submit === "function") ia.submit();
						} catch (err) {
							console.warn("ask-selection: submit failed", err);
						}
					},
					insert: function (text, panel, ia, quoteMode) {
						var prompt = buildPrompt(t, panel.source, panel.quote, text, panel.mode, quoteMode || "full");
						// 先写草稿：写失败就保持面板开着，输入不丢
						try {
							if (ia && typeof ia.setDraft === "function") ia.setDraft(prompt);
						} catch (err) {
							console.warn("ask-selection: insert failed", err);
							return;
						}
						setUi({ menu: null, panel: null });
						// 插入后把焦点还给 composer 输入框（对齐 Codex focusComposer 体验）
						setTimeout(function () { focusComposerNear(anchorRef.current); }, 0);
					}
				};
			}, [t]);

			// 菜单 + 面板 → portal 到 body（锚点 span 留在插槽 DOM 里用于定位输入框）
			return h(React.Fragment, null,
				h("span", { ref: anchorRef, "data-ask-selection-anchor": true, style: { display: "none" } }),
				ReactDOM.createPortal(
					h(React.Fragment, null,
						state.menu ? h(ContextMenu, { key: "menu", t: t, state: state.menu, actions: actions }) : null,
						state.panel ? h(AskPanel, { key: "panel", t: t, state: state.panel, actions: actions, inputActions: inputActions }) : null
					),
					document.body
				)
			);
		}

		/* ------------------------------------------------------------------ */
		/* 文档工具条登记器：sidebar.right.tab.document.actions 槽组件          */
		/* ------------------------------------------------------------------ */

		/** 渲染零尺寸标记；挂载时把 address→absolutePath 写进登记表 */
		function DocPathRegistrar(ownerProps) {
			var ref = React.useRef(null);
			React.useEffect(function () {
				var el = ref.current;
				if (!el || !el.closest) return;
				var root = el.closest("[data-textpreview-url]");
				if (!root) return;
				registerPreviewPath(root.getAttribute("data-textpreview-url"), ownerProps.absolutePath);
			}, [ownerProps.absolutePath]);
			return h("span", { ref: ref, "data-ask-selection-registrar": true, style: { display: "none" } });
		}

		/* ------------------------------------------------------------------ */
		/* locale 兜底（ctx.locale 缺词条时直接用内嵌词典）                      */
		/* ------------------------------------------------------------------ */

		function translate(boundT, key, vars) {
			var raw = null;
			try {
				raw = typeof boundT === "function" ? boundT(key, vars) : null;
			} catch (e) { raw = null; }
			if (raw == null || raw === key) {
				raw = fallbackText(key, vars);
			}
			return raw;
		}

		/* ------------------------------------------------------------------ */
		/* 插件 apply                                                          */
		/* ------------------------------------------------------------------ */

		return {
			inject: ["slots", "locale"],
			apply: function (ctx) {
				var disposers = [];

				// locale 注册（zh/en）
				try {
					disposers.push(ctx.effect(function () {
						return ctx.locale.register(NS, {
							zh: zhDict,
							en: enDict
						});
					}, "ask-selection: dictionaries"));
				} catch (e) { console.warn("ask-selection: locale register failed", e); }

				// 主注册：conversation.input.overlay
				try {
					disposers.push(ctx.slots.inject(OVERLAY_SLOT, function () {
						return ctx.slots.register({
							name: OVERLAY_SLOT,
							id: "ask-selection.dock",
							order: 5,
							locale: NS,
							inject: function () { return { t: ctx.locale.bind(NS) }; }
						}, AskSelectionDock);
					}));
				} catch (e) { console.warn("ask-selection: dock register failed", e); }

				// 路径登记器：sidebar.right.tab.document.actions
				try {
					disposers.push(ctx.slots.inject(DOC_ACTIONS_SLOT, function () {
						return ctx.slots.register({
							name: DOC_ACTIONS_SLOT,
							id: "ask-selection.registrar",
							order: 5,
							locale: NS,
							inject: function () { return {}; }
						}, DocPathRegistrar);
					}));
				} catch (e) { console.warn("ask-selection: registrar register failed", e); }

				return function () {
					disposers.forEach(function (d) {
						try { if (typeof d === "function") d(); } catch (e) { /* fail-open */ }
					});
					setUi({ menu: null, panel: null });
					previewPaths.clear();
				};
			}
		};
	}
});
