# Tau/Pi RPC 运行时互换方案 / Tau/Pi RPC runtime interchangeability plan

## 目标(Objective)

[原文]
An Electron host should be able to select either subprocess with one product setting:

[译文]
Electron 宿主应当能通过一个产品设置,在两种子进程之间任选其一:

```json
{"agent_runtime": "tau"}
```

[原文]
Runtime-specific startup configuration (binary path, provider/model, cwd, and session location)
may differ. After startup, the host must use one command/event contract without branching on the
runtime for ordinary coding-agent behavior.

[译文]
各运行时特有的启动配置(二进制路径、provider/model、cwd、会话位置)可以不同。但在启动之后,对于普通的编码 agent 行为,宿主必须使用同一套命令/事件契约,不得按运行时分支处理。

[原文]
The compatibility target is Pi's documented JSONL RPC protocol in
`packages/coding-agent/docs/rpc.md`, because Pi already publishes a typed TypeScript client. Tau
must match command names, request fields, response envelopes, response data shapes, event names,
and lifecycle semantics for the shared surface. Persisted session files do not need to be mutually
readable; interchangeability is at the process boundary.

[译文]
兼容目标是 Pi 在 `packages/coding-agent/docs/rpc.md` 中记录的 JSONL RPC 协议,因为 Pi 已经发布了带类型的 TypeScript 客户端。对于双方共享的能力面,Tau 必须匹配命令名、请求字段、响应信封、响应数据形态、事件名以及生命周期语义。持久化的会话文件不需要互相可读;互换性发生在进程边界上。

## 完成的定义(Definition of done)

[原文]
1. The same black-box contract suite can launch Pi or Tau and exercise prompting, streaming,
   cancellation, model selection, thinking controls, direct shell commands, compaction, session
   inspection, and command discovery.
2. Shared commands have the same required request fields and success response shapes.
3. Shared events use the same camel-case wire vocabulary and lifecycle meaning.
4. Unsupported optional behavior returns a deterministic failed response; it never silently
   changes semantics.
5. Runtime-specific capabilities are isolated to optional features rather than ordinary chat/tool
   operation.
6. Electron consumes generated/shared protocol types or its own normalized domain model, never
   provider-specific chunks or either runtime's persisted JSONL.

[译文]
1. 同一套黑盒契约测试既能启动 Pi 也能启动 Tau,并覆盖提示、流式输出、取消、模型选择、thinking 控制、直接 shell 命令、压缩、会话检查与命令发现。
2. 共享命令具有相同的必填请求字段与成功响应形态。
3. 共享事件使用相同的 camelCase 线上词汇与生命周期含义。
4. 不受支持的可选行为返回确定性的失败响应,绝不静默改变语义。
5. 运行时特有的能力被隔离在可选功能中,而不影响普通的聊天/工具操作。
6. Electron 消费生成的/共享的协议类型,或它自己归一化后的领域模型;绝不消费 provider 特有的分片,也不直接消费任一运行时的持久化 JSONL。

## 差距清单(Gap inventory)

### 线上数据形态(Wire shapes)

[原文]
Tau's first RPC version used model references where Pi returns complete model objects, omitted
state fields, returned a flat tree, exposed Tau session-stat names, and returned a display string
from compaction. These are wire compatibility issues even when the underlying behavior exists.

[译文]
Tau 最初的 RPC 版本在 Pi 返回完整模型对象的地方使用了模型引用;省略了状态字段;返回扁平化的树;暴露了 Tau 自己的会话统计名称;压缩操作返回的是一段展示字符串。即使底层行为已经存在,这些仍是线上兼容性问题。

### 缺失的命令(Missing commands)

[原文]
Pi additionally supports model/thinking cycling, queue delivery modes, auto-compaction/retry
controls, direct bash cancellation, HTML export, cloning, fork-message discovery, entry cursors,
last-assistant lookup, and session naming.

[译文]
Pi 还额外支持:模型/thinking 循环切换、队列投递模式、自动压缩/重试控制、直接 bash 取消、HTML 导出、克隆、分叉消息发现、条目游标、最后一条 assistant 查找以及会话命名。

### 输入与扩展 UI(Input and extension UI)

[原文]
Pi accepts image blocks and implements an extension dialog request/response subprotocol. Tau's
provider-neutral messages support images, but `CodingSession.prompt()` currently accepts text and
Tau's extension bridge is callback-oriented. Both require dedicated session seams before they can
be made protocol-compatible.

[译文]
Pi 接受图片块,并实现了扩展对话框的请求/响应子协议。Tau 的 provider 无关消息支持图片,但 `CodingSession.prompt()` 目前只接受文本,且 Tau 的扩展桥是回调式的。二者都需要专门的会话接缝,才能做到协议兼容。

### 会话身份(Session identity)

[原文]
Pi exposes session file paths; Tau primarily exposes indexed IDs. Tau should accept either an ID
or an indexed Tau session path at the RPC boundary while keeping `SessionManager` authoritative.
The two runtimes' persisted files remain intentionally different.

[译文]
Pi 暴露会话文件路径;Tau 主要暴露带索引的 ID。Tau 应当在 RPC 边界上同时接受 ID 或带索引的 Tau 会话路径,同时保持 `SessionManager` 为权威来源。两个运行时的持久化文件仍有意保持不同。

## 交付阶段(Delivery phases)

### Phase A — frontend-critical parity(阶段 A:前端关键能力对齐,本次变更) / Phase A — frontend-critical parity (this change)

[原文]
- Normalize state and model responses to Pi field names.
- Add model/thinking cycling.
- Add direct bash, HTML export, entry cursors, tree projection, fork-message discovery,
  last-assistant lookup, and session naming.
- Add auto-compaction control through a public `CodingSession` method.
- Keep session restoration behind `SessionManager` while accepting Pi's `sessionPath` field.
- Add fixture-style response tests and update the published compatibility matrix.

[译文]
- 把状态与模型响应归一化为 Pi 的字段名。
- 增加模型/thinking 循环切换。
- 增加直接 bash、HTML 导出、条目游标、树投影、分叉消息发现、最后一条 assistant 查找以及会话命名。
- 通过一个公开的 `CodingSession` 方法提供自动压缩控制。
- 会话恢复仍由 `SessionManager` 负责,同时接受 Pi 的 `sessionPath` 字段。
- 增加 fixture 风格的响应测试,并更新已发布的兼容性矩阵。

[原文]
This phase enables one Electron adapter for text chat, streaming tools, cancellation, model and
thinking selection, direct commands, transcript restoration, and session browsing.

[译文]
该阶段让一个 Electron 适配器即可支持:文本聊天、流式工具、取消、模型与 thinking 选择、直接命令、会话记录恢复以及会话浏览。

### 阶段 B:执行控制(Phase B — execution controls)

[原文]
- Add a cancellable direct-bash task owned by `CodingSession`; emit Pi-compatible
  `bash_execution_update` records and implement `abort_bash`.
- Add runtime auto-retry enable/disable and retry-delay cancellation seams.
- Add queue delivery modes (`all` and `one-at-a-time`) to the portable harness rather than faking
  them in the RPC frontend.
- Return structured compaction data (summary, replaced boundary, token estimates, usage) from a
  session API while preserving current TUI messages.

[译文]
- 增加由 `CodingSession` 持有的可取消直接 bash 任务;发出与 Pi 兼容的 `bash_execution_update` 记录,并实现 `abort_bash`。
- 增加运行时自动重试的启用/禁用,以及重试延迟取消接缝。
- 把队列投递模式(`all` 与 `one-at-a-time`)加入可移植 harness,而不是在 RPC 前端里伪造。
- 从会话 API 返回结构化压缩数据(摘要、被替换的边界、token 估算、用量),同时保留现有 TUI 消息。

### 阶段 C:多模态与扩展 UI(Phase C — multimodal and extension UI)

[原文]
- Extend session prompt/queue APIs with provider-neutral image content.
- Implement an RPC extension UI bridge for select, confirm, input, editor, notifications, status,
  widgets, titles, and editor text.
- Correlate dialog responses and handle cancellation/timeouts without blocking stdin dispatch.

[译文]
- 用 provider 无关的图片内容扩展会话 prompt/队列 API。
- 为 select、confirm、input、editor、通知、状态、组件、标题与编辑器文本实现 RPC 扩展 UI 桥。
- 关联对话框响应,并在不阻塞 stdin 分发的前提下处理取消/超时。

### 阶段 D:一致性验证与客户端验证(Phase D — conformance and client validation)

[原文]
- Vendor protocol fixtures derived from Pi's public documentation (not Pi runtime code).
- Run the same subprocess scenarios against both installed binaries in an optional integration
  job.
- Add a small TypeScript smoke fixture using Pi's RPC client against Tau; pin the tested Pi
  protocol version in documentation.
- Classify future Pi protocol additions as supported, intentionally different, or pending before
  claiming a newer compatibility level.

[译文]
- 内嵌从 Pi 公开文档(而非 Pi 运行时代码)推导出的协议 fixture。
- 在一个可选的集成任务中,对两个已安装的二进制运行同一套子进程场景。
- 增加一个小的 TypeScript 冒烟 fixture,用 Pi 的 RPC 客户端连接 Tau;并在文档中固定所测试的 Pi 协议版本。
- 在声称更高兼容级别之前,把 Pi 未来的协议新增项归类为「已支持」「有意不同」或「待实现」。

## Electron 集成指引(Electron integration guidance)

[原文]
Use subprocess RPC for both runtimes, even though Pi can also be imported directly in Node. Keep
process launch in the Electron main process and expose a narrow IPC API to the renderer. Store
runtime-specific launch configuration separately from the shared session state. The renderer
should key running state off `agent_settled`, not `agent_end`.

[译文]
两个运行时都使用子进程 RPC,尽管 Pi 也可以在 Node 中直接导入。把进程启动保留在 Electron 主进程,并向渲染进程暴露一个窄的 IPC API。将运行时特有的启动配置与共享会话状态分开存储。渲染进程应当以 `agent_settled`(而不是 `agent_end`)作为运行状态的判断依据。

[原文]
A production host should still maintain a capability table for optional Phase B/C behavior.
Choosing `agent_runtime` alone is sufficient for the Phase A common surface; optional controls
should be hidden or disabled when the selected runtime does not advertise/support them.

[译文]
生产宿主仍应维护一张能力表,用于阶段 B/C 的可选行为。仅选择 `agent_runtime` 就足以覆盖阶段 A 的公共能力面;当所选运行时不声明/不支持某些可选控制时,应隐藏或禁用它们。
