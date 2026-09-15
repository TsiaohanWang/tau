---
title: "Phase 28: Pi-compatible RPC mode / 阶段 28:与 Pi 兼容的 RPC 模式"
---

[原文]
Phase 28 adds a headless frontend at `tau_coding.rpc`. It consumes the same `CodingSession`
events as print mode and Textual, preserving `tau_coding → tau_agent → tau_ai`.

[译文]
阶段 28 在 `tau_coding.rpc` 加入了一个无头前端。它消费与 print 模式和 Textual 相同的 `CodingSession` 事件,保持 `tau_coding → tau_agent → tau_ai` 的分层。

[原文]
The process uses strict JSONL on stdin/stdout. A serialized writer prevents response and event
bytes from interleaving; prompt work runs in an AnyIO task group so cancellation and queued input
remain available while events stream. EOF cancels active work, waits for owned tasks, and closes
the session.

[译文]
该进程在 stdin/stdout 上使用严格的 JSONL。串行化的 writer 防止响应字节与事件字节交错;提示工作运行在 AnyIO task group 中,因此事件流式输出期间取消操作与排队输入仍然可用。EOF 会取消活动工作、等待其持有的任务结束,然后关闭会话。

## 与 Pi 的兼容性(Pi compatibility)

[原文]
| Area | Status |
| --- | --- |
| prompt, steer, follow-up, abort | supported |
| state/messages | supported |
| models and thinking | Pi-shaped models plus set/cycle/list supported |
| manual compaction | supported; detailed usage remains approximate |
| new/switch session, stats, tree, fork | Pi-shaped wire responses; Tau ID or indexed path accepted |
| command discovery | supported with synthetic Tau source metadata |
| direct bash | supported |
| abort_bash | deferred; needs a cancellable public session API |
| HTML export, session naming, entry cursor | supported |
| auto-compaction toggle | supported |
| extension UI RPC | deferred; Tau currently uses frontend bridge callbacks |
| queue/retry controls, clone, image prompts | deferred |

[译文]
| 领域 | 状态 |
| --- | --- |
| prompt、steer、follow-up、abort | 已支持 |
| state/messages | 已支持 |
| 模型与 thinking | 提供 Pi 形态的模型,并支持 set/cycle/list |
| 手动压缩 | 已支持;详细用量仍为近似值 |
| 新建/切换会话、stats、tree、fork | 提供 Pi 形态的线上响应;接受 Tau ID 或已索引路径 |
| 命令发现 | 已支持,附带合成的 Tau 来源元数据 |
| 直接 bash | 已支持 |
| abort_bash | 推迟;需要一个可取消的公开会话 API |
| HTML 导出、会话命名、条目游标 | 已支持 |
| 自动压缩开关 | 已支持 |
| 扩展 UI RPC | 推迟;Tau 目前使用前端桥回调 |
| 队列/重试控制、clone、图片提示 | 推迟 |

[原文]
The protocol intentionally maps only public `CodingSession` behavior. It does not read raw session
JSONL, depend on Textual, or duplicate the agent loop.

[译文]
该协议有意只映射公开的 `CodingSession` 行为。它不读取原始会话 JSONL、不依赖 Textual,也不复制 agent 循环。

## 验证(Verification)

[原文]
`tests/test_rpc.py` drives a real `CodingSession` with `FakeProvider` through in-memory JSONL
streams. It covers correlated acceptance, event streaming, malformed records, CRLF, and Unicode
line separators. CLI tests cover `--mode rpc` routing separately.

[译文]
`tests/test_rpc.py` 使用 `FakeProvider` 通过内存 JSONL 流驱动真实的 `CodingSession`。它覆盖带关联的确认应答、事件流式输出、畸形记录、CRLF 以及 Unicode 行分隔符。CLI 测试则单独覆盖 `--mode rpc` 的路由。
