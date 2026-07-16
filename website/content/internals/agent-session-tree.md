---
title: tau_agent · 会话持久化树
description: session/ 包的 entries / tree / jsonl / storage / memory
---

## `session/entries.py` — 会话树节点模型

- **`new_entry_id()`**：用 `uuid4().hex` 生成唯一节点 id。
- **`current_timestamp()`**：当前 Unix 时间戳。
- **`BaseSessionEntry`**（pydantic，`extra="forbid"`）：所有节点的公共字段——
  `id`（默认 `new_entry_id`）、`parent_id: str | None`、`timestamp`。
- 九个具体节点（各自固定 `type` 字面量判别）：
  - **`MessageEntry`**（`type="message"`）：存一条 `AgentMessage`（transcript 的核心单元）。
  - **`ModelChangeEntry`**（`type="model_change"`）：记录一次模型切换（`model`）。
  - **`ThinkingLevelChangeEntry`**（`type="thinking_level_change"`）：记录思考级别切换
    （`thinking_level: str | None`）。
  - **`CompactionEntry`**（`type="compaction"`）：一次上下文压缩——`summary` 文本 +
    `replaces_entry_ids`（被它替代的节点 id 列表）。重放时这些旧消息会被摘要替换。
  - **`BranchSummaryEntry`**（`type="branch_summary"`）：分支点的摘要（`summary` +
    `branch_root_id`）。
  - **`LabelEntry`**（`type="label"`）：用户给会话打的标签（`label`）。
  - **`LeafEntry`**（`type="leaf"`）：**当前分支的叶指针**，指 `entry_id`。可以有很多个；
    "导航当前分支"就是从一个 leaf 沿 `parent_id` 往回走到 root。
  - **`SessionInfoEntry`**（`type="session_info"`）：根节点元数据——`created_at`、
    `cwd`、`title`。
  - **`CustomEntry`**（`type="custom"`）：扩展/应用私有数据（`namespace` + `data`）。
- **`SessionEntry`**：用 `Annotated[... , Field(discriminator="type")]` 的**判别联合**，
  反序列化时按 `type` 字段自动选具体类。`storage`/`jsonl` 都依赖它。

> Rust `tau-rs` 的 `tau-agent/src/session.rs` 也有对应的 `SessionEntry` 枚举与
> `entries`，但 Python 这版把 `leaf`/`compaction`/`branch_summary` 等节点拆得更细。

---

## `session/tree.py` — 树遍历助手

- **`SessionTreeError(ValueError)`**：entries 不构成合法可遍历树时抛出。
- **`entries_by_id(entries)`**：按 `id` 建索引字典，**遇到重复 id 抛
  `SessionTreeError`**。
- **`path_to_entry(entries, leaf_id)`**：从 `leaf_id` 沿 `parent_id` 一路上溯到 root，
  返回 root→leaf 的节点链（已 `reverse`）。
  - **循环检测**：用 `seen` 集合，若又回到已访问节点则抛 `SessionTreeError
    (Cycle detected)`——防止 `parent_id` 形成环的损坏日志。
  - 缺失节点也抛 `SessionTreeError (Missing session entry)`。

这是"从某个叶看整条分支"的核心工具，被 `memory.from_entries` 在给定 `leaf_id` 时调用。

---

## `session/jsonl.py` — JSONL 序列化

- **`_SESSION_ENTRY_ADAPTER = TypeAdapter(SessionEntry)`**：靠判别联合自动分派。
- **`SessionJsonlError(ValueError)`**：一行无法解码时抛出。
- **`entry_to_json_line(entry)`**：`dump_json` 后解码成字符串并加 `"\n"`——**每个
  节点一行 JSON**。
- **`entry_from_json_line(line, *, line_number=None)`**：`validate_json` 一行；失败包成
  `SessionJsonlError`（带行号）。
- **`entries_from_json_lines(lines)`**：跳过空行，按序逐行解码成 `SessionEntry` 列表。
  注意：这里**不会**容忍最后一行截断——任何非空但无法解析为 JSON 的行（包括写入
  中途崩溃留下的半行）都会抛 `SessionJsonlError`。append-only 的设计保证了已落盘的
  整行节点是完整的，风险只来自最后一次写操作被中断的那一行。

---

## `session/storage.py` — 存储接口与实现

- **`SessionStorage`**（Protocol）：追加式存储接口，两个 **`async`** 方法：
  - `async append(entry)`：追加一个节点；
  - `async read_all() -> list[SessionEntry]`：按存储顺序读全部。
  （调用方必须 `await` 这两个方法——它们是协程，不能直接同步调用。）
- **`JsonlSessionStorage`**：本地文件实现，`__init__(path: str | Path)` 记 `Path`。
  - `async append(entry)`：`parent.mkdir(parents=True)`，以 `"a"` 追加模式写一行
    （`entry_to_json_line`）。**追加式**保证已写节点永不被改写，符合"append-only 树"。
  - `async read_all()`：文件不存在 → 返回 `[]`（空会话）；否则 `splitlines()` 后
    `entries_from_json_lines`。

> 上层 `CodingSession` 把每个完成的 `MessageEntry` 后都追加一个 `LeafEntry`，所以"活跃
> 分支 tip"在运行途中也可见于树导航。

---

## `session/memory.py` — 从节点重放成内存状态

- **`_UNSET_LEAF_ID`**：哨兵对象，区分"未给 leaf"与"显式给 None"。
- **`SessionState`**（frozen dataclass）：从追加式节点派生出的**当前会话状态**：
  `messages`（重放出的 transcript）、`model`、`thinking_level`、`label`、
  `active_leaf_id`、`session_info`、`custom_entries`、`compaction_entries`、
  `context_entry_ids`（重放后消息对应的节点 id）、`entries`（被重放的节点本身）。
- **`SessionState.from_entries(entries, *, leaf_id=_UNSET_LEAF_ID)`**：重放核心。
  - `replay_all = leaf_id is _UNSET_LEAF_ID`；若给了 `leaf_id` 就用
    `path_to_entry(entries, leaf_id)` 只重放**该分支路径**，否则线性重放全部。
  - 遍历 `replay_entries`，按 `entry.type` 用 `match` 处理：
    - `message` → 记下 `(id, message)`；
    - `model_change` → 更新 `model`；
    - `thinking_level_change` → 更新 `thinking_level`；
    - `label` → 更新 `label`；
    - `leaf` → `active_leaf_id = entry.entry_id`；
    - `session_info` → 记 `session_info`；
    - `custom` → 追加到 `custom_entries`；
    - `compaction` → 追加 `compaction_entries`，并 `_apply_compaction` 把被替换的旧
      消息替换成摘要 `UserMessage`；
    - `branch_summary` → 插入一条 `UserMessage`（带 `<summary>` 包裹的分支摘要）。
- **`_apply_compaction(message_rows, entry)`**：按 `replaces_entry_ids` 过滤旧消息，
  在被替换区间的开头插入一条摘要消息（只插一次）。**这让"压缩历史"在重放时直接变成
  模型看到的上下文**，从而控制 token 用量。
- **`_format_compaction_summary` / `_format_branch_summary`**：把摘要包成模型可读的
  文本前缀。

> 这是恢复会话的关键：`CodingSession.load` 调 `SessionState.from_entries(entries,
> leaf_id=latest_leaf.entry_id)`，就精确重建出 harness 需要的 `messages`、当前
> `model`、思考级别等，同时保留 `model_change`/`label` 元数据——对应之前 Rust 版
> "rebuild_from_messages preserves SessionInfo + metadata and writes a Leaf" 的修复。

---

## 本部分小结

`tau_agent/session/` 把"运行态"变成了"可持久化、可分支的树"：

- transcript 的每一步都是一个 `SessionEntry` 节点，靠 `parent_id` 连成树；
- `MessageEntry` 存消息，`LeafEntry` 指当前分支 tip，`CompactionEntry` 做上下文压缩；
- `jsonl` + `storage` 负责一行一个节点的追加式落盘；
- `memory.from_entries` 把节点重放成 `harness` 可直接用的 `SessionState`。

至此 `tau_agent` 三层全部讲完（数据模型 → 执行核心 → 持久化）。下一任务（Part 2d）
收尾 `tau_agent/__init__` 的导出与它和 `tau_ai` 的边界，然后进入 `tau_coding`。

<!-- NAV -->
[← tau_agent · 执行核心]({{< relref "./agent-loop-harness.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_agent · 公共导出与边界]({{< relref "./agent-init-boundary.md" >}})
