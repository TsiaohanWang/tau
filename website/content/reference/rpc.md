---
title: "RPC protocol / RPC 协议"
description: "Control Tau as a subprocess with Pi-compatible JSONL commands and events. / 用与 Pi 兼容的 JSONL 命令与事件把 Tau 当作子进程来控制。"
---

[原文]
Run Tau as a headless subprocess:

[译文]
把 Tau 作为无头子进程运行:

```bash
tau --mode rpc [--provider NAME] [--model MODEL] [--cwd PATH] [--session ID]
```

[原文]
RPC mode reads one JSON object per LF-terminated line from stdin and writes responses and
session events as compact JSON lines to stdout. Diagnostics use stderr. Clients may include an
`id`; the corresponding response echoes it. Event records are asynchronous and do not normally
carry request IDs.

[译文]
RPC 模式从 stdin 每条以 LF 结尾的行读取一个 JSON 对象,并把响应与会话事件以紧凑 JSON 行的形式写到 stdout。诊断信息走 stderr。客户端可以带上 `id`;对应的响应会把它回显。事件记录是异步的,通常不携带请求 ID。

```json
{"id":"1","type":"prompt","message":"Inspect this project"}
{"id":"1","type":"response","command":"prompt","success":true}
{"type":"agent_start"}
```

[原文]
The protocol supports Pi-compatible prompting (`prompt`, `steer`, `follow_up`, `abort`), state
and message inspection, complete Pi-shaped model references, model and thinking cycling,
auto-compaction control, direct shell commands, HTML export, new/resumed sessions, entry cursors,
session statistics and trees, forking, last-assistant lookup, session naming, and command
discovery. Unknown commands and invalid arguments return `success: false` without stopping the
process.

[译文]
该协议支持与 Pi 兼容的提示(`prompt`、`steer`、`follow_up`、`abort`)、状态与消息检查、完整的 Pi 形态模型引用、模型与 thinking 循环切换、自动压缩控制、直接 shell 命令、HTML 导出、新建/恢复会话、条目游标、会话统计与树、分叉、最后一条 assistant 查找、会话命名,以及命令发现。未知命令与非法参数会返回 `success: false`,但不会停止进程。

[原文]
Use `agent_settled`, not `agent_end`, to decide that a run is fully idle: retries, overflow
compaction, or queued continuations can follow `agent_end`.

[译文]
判断一次运行是否完全空闲,请用 `agent_settled` 而不是 `agent_end`:重试、溢出压缩或排队的续跑都可能跟在 `agent_end` 之后。

## 分帧(Framing)

[原文]
Split records only on LF (`\n`). A trailing CR is accepted for CRLF input. Unicode line
separators such as U+2028 and U+2029 are ordinary characters inside JSON strings. Records are
limited to 16 MiB.

[译文]
只按 LF(`\n`)切分记录。对于 CRLF 输入,末尾的 CR 会被接受。U+2028、U+2029 之类的 Unicode 行分隔符在 JSON 字符串内部只是普通字符。单条记录上限为 16 MiB。

## 最小 Node/Electron 客户端(Minimal Node/Electron client)

```js
import { spawn } from "node:child_process";

const tau = spawn("tau", ["--mode", "rpc"], { stdio: ["pipe", "pipe", "inherit"] });
tau.stdout.setEncoding("utf8");
let buffer = "";
tau.stdout.on("data", chunk => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf("\n");
    if (index < 0) break;
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    console.log(JSON.parse(line));
  }
});
tau.stdin.write(JSON.stringify({ id: "1", type: "prompt", message: "Hello" }) + "\n");
```

[原文]
RPC and TUI compaction preserve recent entries and return or persist the first pre-existing
retained entry as `firstKeptEntryId`, matching Pi. Session inspection emits modern compactions
in Pi's native shape without Tau's former replacement-id bridge. Older Tau records can lack a
boundary; inspection exposes those honestly as `customType: "tau.compaction"` entries instead
of fabricating Pi compaction metadata. Their legacy id lists remain usable for local replay but
are not added to the RPC wire format. When available, projected compaction and branch-summary
entries include Pi-compatible `usage` data from the request that generated the summary. Legacy
entries and heuristic fallback summaries omit the field.

[译文]
RPC 与 TUI 的压缩都会保留近期条目,并把第一个既有的保留条目作为 `firstKeptEntryId` 返回或持久化,与 Pi 一致。会话检查以 Pi 的原生形态输出现代压缩,不再使用 Tau 此前的「替换 ID 桥」。较旧的 Tau 记录可能缺少边界;检查会如实把它们暴露为 `customType: "tau.compaction"` 条目,而不是虚构 Pi 的压缩元数据。它们的旧式 id 列表仍可用于本地重放,但不会被加入 RPC 线上格式。在可获得时,投射出的压缩与分支摘要条目会包含 Pi 兼容的 `usage` 数据,来自生成该摘要的那次请求。旧式条目与启发式回退摘要会省略该字段。

[原文]
Session inspection projects persisted `custom_message` entries in Pi wire
shape: `parentId`, `customType`, `content`, `details`, and `display`. Tau's local
session JSONL uses snake_case wrapper fields such as `parent_id` and
`custom_type`; clients should rely on the RPC shape rather than the storage
spelling.

[译文]
会话检查会把持久化的 `custom_message` 条目投射为 Pi 线上形态:`parentId`、`customType`、`content`、`details` 与 `display`。Tau 本地会话 JSONL 使用 snake_case 包装字段,例如 `parent_id` 与 `custom_type`;客户端应依赖 RPC 形态,而不是存储层的拼写。

[原文]
Tau mirrors Pi where its public `CodingSession` has equivalent behavior. Direct `bash` is
supported, but `abort_bash` requires a future cancellable session API. Queue delivery modes,
retry controls, cloning, image prompts, and the extension UI request/response subprotocol remain
staged compatibility work. See `dev-notes/design/rpc-runtime-interchangeability-plan.md` for the
contract, completed frontend-critical phase, and remaining production phases.

[译文]
凡是公开的 `CodingSession` 具备等价行为之处,Tau 都镜像 Pi。直接 `bash` 已支持,但 `abort_bash` 需要一个未来可取消的会话 API。队列投递模式、重试控制、克隆、图片提示,以及扩展 UI 的请求/响应子协议,仍是分阶段推进的兼容性工作。契约、已完成的前端关键阶段与剩余生产阶段,见 `dev-notes/design/rpc-runtime-interchangeability-plan.md`。
