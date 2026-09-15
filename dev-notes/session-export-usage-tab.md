# 会话导出的用量标签页 / Session export usage tab

## 变更内容(What changed)

[原文]
HTML session exports now contain two self-contained tabs:

[译文]
HTML 会话导出现在包含两个自包含的标签页:

[原文]
- **Transcript**: the existing session tree, entry stream, filters, and JSONL download.
- **Cache**: request-level token usage, cache behavior, output/reasoning totals, estimated cost, tool-call counts, and compactions for the active branch.

[译文]
- **Transcript**:既有的会话树、条目流、过滤器与 JSONL 下载。
- **Cache**:活动分支上的请求级 token 用量、缓存行为、输出/推理总量、估算成本、工具调用计数与压缩。

[原文]
The Cache tab includes interactive SVG charts (hover tooltips, legend series toggles). Each chart can be downloaded as a 2x PNG with a white background. No network resources are required.

[译文]
Cache 标签页包含交互式 SVG 图表(悬停工具提示、图例系列开关)。每张图都可以下载为白底的 2 倍 PNG。不需要任何网络资源。

## 标签页(Tabs)

[原文]
Tab switching uses focusable `<button>` elements in a `role="tablist"`: click or use Left/Right arrows to move between panels. Panels toggle with the `hidden` attribute, and the transcript filter bar hides while Cache is active. Tab links use `#transcript` and `#cache`; transcript entry deep links remain unchanged.

[译文]
标签页切换使用 `role="tablist"` 中可聚焦的 `<button>` 元素:点击或使用左右方向键在面板之间移动。面板通过 `hidden` 属性切换,当 Cache 处于活动状态时会话记录过滤栏隐藏。标签链接使用 `#transcript` 与 `#cache`;会话记录条目的深层链接保持不变。

## Tau 主题化(Tau theming)

[原文]
The export template now uses Tau's own TUI themes instead of ad-hoc colors:

[译文]
导出模板现在使用 Tau 自己的 TUI 主题,而不是临时拼凑的颜色:

[原文]
- Light mode: `tau-light` (`src/tau_coding/tui/themes/tau-light.json`) — white canvas, `#0f766e` teal accent.
- Dark mode: `tau-dark` (`tau-dark.json`) — black canvas, `#a7f3f0` cyan accent.

[译文]
- 浅色模式:`tau-light`(`src/tau_coding/tui/themes/tau-light.json`)—— 白色画布,`#0f766e` 青绿强调色。
- 深色模式:`tau-dark`(`tau-dark.json`)—— 黑色画布,`#a7f3f0` 青色强调色。

[原文]
Export CSS and chart series colors are derived from the loaded built-in theme definitions. Charts ship both palette variants per series (`data-dark`/`data-light` attributes) and recolor live when the theme toggle or system preference changes, via a `tau-themechange` event and a `.theme-dark` class on `<html>`. PNG downloads always render on white with the light-theme variants.

[译文]
导出的 CSS 与图表系列颜色派生自已加载的内置主题定义。图表为每个系列同时携带两套调色板变体(`data-dark`/`data-light` 属性),并在主题开关或系统偏好变化时,通过 `tau-themechange` 事件与 `<html>` 上的 `.theme-dark` 类实时重新着色。PNG 下载始终以白色为底、使用浅色主题变体渲染。

[原文]
The layout borrows the analysis-script terminal aesthetic: JetBrains Mono everywhere, `$`/`#` prompt markers, dashed rules, and flat squared panels.

[译文]
布局借鉴了分析脚本的终端美学:全局使用 JetBrains Mono、`$`/`#` 提示标记、虚线分隔线与扁平的直角面板。

## 设计(Design)

[原文]
Usage collection and rendering live in `src/tau_coding/session_usage.py`. This keeps analytics separate from the existing transcript renderer while allowing `render_session_html()` to compose both views into one standalone file.

[译文]
用量采集与渲染位于 `src/tau_coding/session_usage.py`。这使分析逻辑与既有的会话记录渲染器保持分离,同时让 `render_session_html()` 能把两个视图组合成一个独立文件。

[原文]
The collector reads typed `SessionEntry` and `AssistantMessage` models rather than reparsing JSONL. Cost estimates reuse the session-statistics cost calculation and Tau's built-in provider catalog, including input-token pricing tiers. Provider-reported total cost is the fallback when catalog pricing is unavailable.

[译文]
采集器读取带类型的 `SessionEntry` 与 `AssistantMessage` 模型,而不是重新解析 JSONL。成本估算复用会话统计的成本计算与 Tau 的内置 provider 目录,包括输入 token 的分层定价。当目录定价不可用时,以 provider 上报的总成本作为回退。

[原文]
Only entries on the active session path feed the dashboard. If an export has no resolvable active path, it falls back to all visible entries.

[译文]
只有活动会话路径上的条目才会进入该看板。如果某次导出没有可解析的活动路径,则回退到所有可见条目。

[原文]
The local `scripts/analyze_session.py` prototype remains outside this tracked implementation and unchanged as a behavior reference.

[译文]
本地原型 `scripts/analyze_session.py` 不在本次纳入版本管理的实现之内,并作为行为参照保持不变。

## 验证(Verification)

```bash
uv run ruff check src/tau_coding tests
uv run ruff format --check src/tau_coding tests
uv run pytest
```
