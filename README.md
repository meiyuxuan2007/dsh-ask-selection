# dsh-ask-selection

在 DeepSeek Harness（dsh）的 Web 客户端里，选中一段文字右键，就能就着这段内容追问模型，或让它改写。

不用复制、不用切窗口。

## 功能

- **会话回答**：在任意消息里选中片段 → 右键 →「追问选中内容」/「要求修改选中内容」。
- **右侧栏文档预览**：Markdown、纯文本、代码、PDF、Office（docx / pptx 转换后的 PDF）、Excel 都支持。
  - 文本类：自动带上文件路径、Markdown 小节标题、行号范围；
  - PDF / Office：自动带上文件路径与页码；
  - Excel：读取当前单元格（名称框 + 公式栏）与工作表名。
- **右键菜单**：追问选中内容 / 要求修改选中内容 / 复制选中内容。
- **两种回填**：`Enter` 直接发送到当前会话；「插入输入框」只把内容放进草稿，可以接着编辑。
- **轻引用模式**：文档预览（Markdown、文本、代码、PDF、Office）在能拿到文件绝对路径与定位信息时，可以只引用「文件路径 · 位置 + 开头约 80 字」，让模型自己读原文，提示词更短，也不受引用截断影响；面板里「引用方式」默认是完整引用，需要时再切到轻引用。

发出的消息是结构化引用，例如：

```text
我想追问以下引用内容（来源：notes.md · 小节「部署」· 第 3–12 行）：

引用内容：
> ……选中的原文……

我的要求：
这一段为什么要先建索引？
```

PDF / Office 预览给的是页码，例如 `report.pdf · 第 3 页`；Excel 给的是 `预算.xlsx · 工作表「Q3」单元格 B12`。

## 安装

```bash
dsh plugin add dsh-ask-selection
```

也可以在 dsh 的插件页点「安装」，输入框里填 `dsh-ask-selection`。该输入框同样接受 Git 地址、tgz 包和本地绝对路径，方便装未发布的版本。

要求：dsh 客户端 ≥ 0.2.1-rc.3 且 < 0.3.0（带 Web 界面）；Node.js ≥ 22。

## 使用

1. 在会话回答或右侧栏文档预览里选中一段文字；
2. 右键，选「追问选中内容」或「要求修改选中内容」；
3. 在面板里写要求，`Enter` 发送，或点「插入输入框」只放进草稿。

「轻引用」适用于能拿到绝对路径与定位信息的文档预览（文本、代码、Markdown、PDF、Office）；Excel 走单元格通道、会话选区在对话流里，这两者仍发完整引用。

## 已知边界

- Excel 目前只取公式栏里的当前单元格，不批量取选中区域的多个单元格；
- 图片预览没有可复制的文字，不处理；
- 文本类行号基于预览的分页渲染，长文件只加载了前几页时，行号范围也只覆盖已加载的部分；
- 「轻引用」需要右侧栏能拿到文件的绝对路径与位置，拿不到时只能完整引用；
- 聊天输入框里选中文字仍走浏览器原生右键菜单，不弹本插件的菜单。

## 兼容性

- dsh 客户端：≥ 0.2.1-rc.3 且 < 0.3.0，需带 Web 界面（`engines.dsh` + `dsh.client.platform = web`）
- Node.js：≥ 22
- 运行时依赖：无第三方依赖；文案走宿主 `@deepseek-ai/dsh-client-locale`，不可用时回退内置词典

## 开发

本地调试：

1. 把仓库目录软链或复制到 `profiles/<profile>/node_modules/dsh-ask-selection`；
2. profile 的 `package.json`：`dependencies` 加包名，`dsh.profile.bundles` 数组加 `"dsh-ask-selection"`；
3. 刷新 Web 界面。

实现要点：

- 唯一的持久 UI 注册在 `conversation.input.overlay`（客户端里唯一带 `inputActions` 的浮层槽）；菜单与追问面板用 `ReactDOM.createPortal(document.body)` 渲染，监听 document 捕获阶段的 `contextmenu`。
- `sidebar.right.tab.document.actions` 槽注册一个零尺寸登记器，把 `ownerProps.absolutePath` 与 `[data-textpreview-url]`（即 `tab.contentId`）配对，右键时反查文件路径。
- Excel 走 FortuneSheet 的只读 DOM：`.fortune-name-box`、`#luckysheet-functionbox-cell`、`.fortune-sheet-list-item`。
- 所有 DOM 探测都是 fail-open：找不到标记就退化成通用来源标签，不报错，也不影响原生右键（输入框内选字仍走原生菜单）。
- 主题只用 `--dsw-alias-*` 官方 token。

## 变更记录

### 0.2.1

文档与元数据修订，代码未变：

- README 对齐实际行为：轻引用同样适用于 PDF / Office 预览（Office 预览会先转成 PDF），Excel 与会话选区仍发完整引用；
- 补上「复制选中内容」与菜单三项（追问 / 要求修改 / 复制）的说明；
- 修正示例里「小节 + 页码」混用的问题，行号与页码分别举例；
- 新增 `engines.dsh`（`>=0.2.1-rc.3 <0.3.0`），插件市场不再标记「未声明宿主版本要求」。

### 0.2.0

首个公开发布版本：功能与 0.1.2 一致，补齐 LICENSE、仓库元数据、中英 README 与自动 Release 工作流。

### 0.1.2

修复一批缺陷，无新增功能：

- 发送 / 插入改为先写草稿、写成功才关面板；写入失败时保留面板与已输入内容；
- 聊天区来源识别改用平台真实标记（`[data-chat-flow-kind]`、`[data-slot="conversation.chat.*"]`、`[data-conversation-scroll]`），右键页头、滚动条等非消息区域不再弹自定义菜单；
- 路径解析失败时不再把 `dsh-resource://…` 内部地址当路径显示；
- 补齐内嵌词典，locale 不可用时不再显示原始 key；
- 删除重复定义的 `locatorLabel`；
- Enter 发送仅在焦点位于输入框时生效；
- 尊重上游已 `preventDefault` 的 `contextmenu`。

### 0.1.1

- 新增轻引用模式；
- 「插入输入框」后自动聚焦回 composer。

## License

MIT

---

## English

Right-click any selected text in DeepSeek Harness (dsh) Web — in chat answers or in the right-sidebar document previews — to ask the model about it or to request an edit.

### Features

- **Chat answers**: select any fragment of a message → right-click → "Ask about selection" / "Request an edit".
- **Right-sidebar previews**: Markdown, plain text, code, PDF, Office (docx / pptx rendered as PDF) and Excel.
  - Text-like previews carry the file path, Markdown section title and line range;
  - PDF / Office carry the file path and page number;
  - Excel reads the current cell (name box + formula bar) and the sheet name.
- **Context menu**: Ask about selection / Request an edit / Copy selection.
- **Two ways to use it**: `Enter` sends straight to the current conversation; "Insert into composer" only drops the text into the draft.
- **Light quote mode**: for document previews (Markdown, text, code, PDF, Office) whose absolute path and location are known, you can quote just "path · location + first ~80 characters" and let the model read the file itself; the panel defaults to a full quote and switches to light on demand.

### Install

```bash
dsh plugin add dsh-ask-selection
```

The install field in the dsh plugin page accepts the same value, plus a Git address, a tarball, or an absolute local path.

Requires dsh client ≥ 0.2.1-rc.3 and < 0.3.0 with the Web UI, and Node.js ≥ 22.

### Usage

Select text, right-click, pick "Ask about selection" or "Request an edit", type your request, then press `Enter` or "Insert into composer".

Light quote applies to any document preview with a known absolute path and location; Excel (cell channel) and chat selections always send a full quote.

### Known limits

- Excel: only the current cell in the formula bar is read, not a multi-cell range;
- Image previews have no selectable text and are ignored;
- Line numbers cover only the pages already rendered in the preview;
- Light quote needs the absolute path and location from the right sidebar; otherwise a full quote is used;
- Selecting text inside the composer still uses the browser's native context menu.

### Compatibility

- dsh client: ≥ 0.2.1-rc.3 and < 0.3.0, with the Web UI (`engines.dsh` + `dsh.client.platform = web`)
- Node.js: ≥ 22
- Runtime dependencies: none; UI copy comes from the host's `@deepseek-ai/dsh-client-locale` and falls back to a built-in dictionary when unavailable.

### Changelog

#### 0.2.1

Documentation and metadata only; no code changes:

- the README now matches the real behavior: light quotes also cover PDF and Office previews (Office is rendered to PDF first), while Excel and chat selections still send a full quote;
- documented all three menu actions, including "Copy selection";
- fixed the mixed section/page example; line numbers and page numbers are now shown separately;
- added `engines.dsh` (`>=0.2.1-rc.3 <0.3.0`), so the plugin marketplace no longer flags a missing host version requirement.

#### 0.2.0

First public release: same features as 0.1.2, plus LICENSE, repository metadata, a bilingual README and an automated Release workflow.

#### 0.1.2

Bug fixes only:

- send / insert now write the draft first and close the panel only on success;
- chat-side detection uses the platform's real markers (`[data-chat-flow-kind]`, `[data-slot="conversation.chat.*"]`, `[data-conversation-scroll]`);
- `dsh-resource://` internal addresses are no longer shown as file paths;
- the built-in dictionary is complete, and a duplicate `locatorLabel` is gone.

#### 0.1.1

- light quote mode;
- focus returns to the composer after "Insert into composer".

### License

MIT
