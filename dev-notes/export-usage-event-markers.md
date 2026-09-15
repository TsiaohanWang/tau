# HTML 会话导出中的用量事件 / Usage events in HTML session exports

[原文]
The HTML session export's former **Cache** tab is now **Usage**, matching its broader
request, token, cost, tool, and compaction data.

[译文]
HTML 会话导出中原先的 **Cache** 标签页现在是 **Usage**,以匹配其更宽泛的请求、token、成本、工具与压缩数据。

[原文]
The prompt-input chart now places notable persisted session events at the next model
request:

[译文]
提示输入图表现在会把值得注意的持久化会话事件放在下一次模型请求处:

[原文]
- context compaction
- model change
- thinking-level change
- branch summary

[译文]
- 上下文压缩
- 模型变更
- thinking 等级变更
- 分支摘要

[原文]
Events after the final response are attached to that last request. Markers use the Tau
theme palette, include accessible SVG labels/tooltips, switch with the page theme, and
remain in downloaded PNG charts.

[译文]
最终响应之后的事件会挂到最后那次请求上。标记使用 Tau 的主题调色板,包含可访问的 SVG 标签/工具提示,随页面主题切换,并会保留在下载的 PNG 图表中。

## 验证(Verification)

```bash
uv run pytest tests/test_session_usage.py tests/test_session_export.py
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
