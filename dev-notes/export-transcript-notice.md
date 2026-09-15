# 导出目标位置的会话记录提示 / Export destination transcript notice

## 变更内容(What changed)

[原文]
A successful TUI `/export` now adds the exported file location as a status row in
the visible transcript instead of using Textual's temporary lower-right toast.
Export failures remain error notifications.

[译文]
成功执行 TUI 的 `/export` 后,现在会把导出文件的位置作为一行状态加入可见会话记录,而不再使用 Textual 那个右下角临时 toast。导出失败仍然是错误通知。

## 为什么(Why)

[原文]
The destination is useful after a toast disappears. Keeping it in display state
makes it easy to find and copy while preserving the boundary between TUI output
and model context.

[译文]
toast 消失之后,目标位置仍然有用。把它保留在显示状态中,便于查找与复制,同时保持 TUI 输出与模型上下文之间的边界。

## 上下文与持久化(Context and persistence)

[原文]
The status row uses the same non-persistent command-output path as `/reload`.
It is not added to `CodingSession.messages`, written to session JSONL, or sent to
the model.

[译文]
该状态行使用与 `/reload` 相同的非持久化命令输出路径。它不会被加入 `CodingSession.messages`,不会写入会话 JSONL,也不会发送给模型。

## 测试(Test)

```bash
uv run pytest tests/test_tui_app.py -k export_command
```
