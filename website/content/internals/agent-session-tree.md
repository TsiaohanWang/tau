---
title: tau_agent · 会话持久化树
description: session/ 包的 entries / tree / jsonl / storage / memory
code_files:
  - tau_agent/session/__init__.py
  - tau_agent/session/entries.py
  - tau_agent/session/tree.py
  - tau_agent/session/jsonl.py
  - tau_agent/session/storage.py
  - tau_agent/session/memory.py
---

这一章解释 Tau 如何把"运行中的对话"持久化到磁盘，以及如何从磁盘恢复出完整
的会话状态。核心思想是把对话历史变成一棵**树（session tree）**——每次对话中的
分支（比如模型走了两条不同的路线）都记录下来，随时可以回溯到任何一个历史节点。
之所以用树而不是扁平列表，是因为 agent 可能在某一轮产生多个分支（比如用户中途
切换了话题、或者模型试了一条路发现不对又退回重来），树结构天然支持这种"分叉与
回溯"。每个节点叫 **leaf（叶节点）**，指向当前活跃分支的末端；从叶节点沿
`parent_id` 往回走到根，就是一条完整的对话路径。

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
    **Compaction（压缩）**是控制上下文长度的手段：对话太长会超出模型的 token 上限，
    于是把早期消息折叠成摘要，保留关键信息的同时缩减长度。
  - **`BranchSummaryEntry`**（`type="branch_summary"`）：分支点的摘要（`summary` +
    `branch_root_id`）。
  - **`LabelEntry`**（`type="label"`）：用户给会话打的标签（`label`）。
- **`LeafEntry`**（`type="leaf"`）：**当前分支的叶指针**，指 `entry_id`。可以有很多个；
  "导航当前分支"就是从一个 leaf 沿 `parent_id` 往回走到 root。

> Design note: 为什么用 `parent_id` 指针而非显式树对象来表达分支？因为会话历史以
> append-only JSONL 落盘——每产生一个节点就追加一行，已写的节点永不被改写。在只追加的
> 结构里，分支天然就是"同一父节点下出现多个子节点"，用 `parent_id` 指针即可完整表达，
> 而无需重写任何历史记录。Tau 的会话设计遵循同一思路：历史是 append-only JSONL，活跃上下文
> 可以通过 compaction 压缩，但绝不重写已落盘的整条记录。这让任意历史节点都能被无损保留，
> 并能沿 `parent_id` 回溯出任意分支的完整路径（见 `tree.py` 的 `path_to_entry`）。
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

> Design note: 一行一个节点的追加式存储，是"会话可持久化、可检查"的前提。Tau 的会话设计
> 原则是历史为 append-only JSONL——节点只增不改，因此任何已完整写入的行都是自洽、可被
> `entries_from_json_lines` 独立还原的记录；即使进程在写最后一行时崩溃，也只会损失那一行，
> 不会污染已有历史。active context 的压缩（compaction）同样不重写旧记录，而是追加一条
> `CompactionEntry` 在重放时把被替换消息折叠成摘要，从而保持记录的不可变性。

---

## `session/storage.py` — 存储接口与实现

- **`SessionStorage`**（Protocol）：追加式存储接口，两个 **`async`** 方法：
  - `async append(entry)`：追加一个节点；
  - `async read_all() -> list[SessionEntry]`：按存储顺序读全部。
  （调用方必须 `await` 这两个方法——它们是协程，不能直接同步调用。）
- **`JsonlSessionStorage`**：本地文件实现，`__init__(path: str | Path)` 记 `Path`。
  - `async append(entry)`：`parent.mkdir(parents=True)`，以 `"a"` 追加模式写一行
    （`entry_to_json_line`）。**追加式**保证已写节点永不被改写，符合"append-only 树"。这样
  会话历史天然不可变：分支、压缩、标签等所有变更都表现为新节点的追加，而非对旧行的就地修改，
  从而让会话既能耐久落盘、又能无损恢复与检查。
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

> Design note: compaction 不删除或改写已落盘的 `MessageEntry`，而是在重放阶段才把被替换的
> 消息折叠成一条摘要。原因在于历史必须是 append-only 的——原始消息保留在 JSONL 中，可随时
> 沿其他分支路径重放出未压缩的完整上下文；只有"当前活跃上下文"在内存重放时被摘要替代。这
> 与 Tau 会话设计一致：active context 可以被 compacted，但记录本身不被重写。
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

## 逐方法深度剖析（session/*）

> 以下为会话树 entries/tree/jsonl/storage/memory 的逐方法展开。

## 文件:session/entries.py

本文件定义会话(append-only)的底层数据模型:一组以 `BaseSessionEntry` 为基类的 Pydantic 模型,以及用 `Annotated` 联合类型 + 判别字段 `type` 包裹的统一入口类型 `SessionEntry`。所有节点都带有 `id`/`parent_id`/`timestamp`,并通过 `parent_id` 串成会话树。

### new_entry_id

```python
def new_entry_id() -> str
```

- **作用**:生成一个全局唯一的会话条目 id。
- **实现**:直接调用标准库 `uuid.uuid4().hex`,返回不含连字符的 32 位十六进制字符串。用作 `BaseSessionEntry.id` 的默认工厂值。

### current_timestamp

```python
def current_timestamp() -> float
```

- **作用**:返回条目写入时的 Unix 时间戳(秒,浮点)。
- **实现**:调用标准库 `time.time()`。作为 `BaseSessionEntry.timestamp` 与 `SessionInfoEntry.created_at` 的默认工厂值。

### BaseSessionEntry

```python
class BaseSessionEntry(BaseModel)
```

所有会话条目共有的基类(Pydantic `BaseModel`)。

#### 字段

- `model_config = ConfigDict(extra="forbid")`:禁止任何未在模型中声明的额外字段,保证条目结构严格、反序列化时不会静默吞掉未知字段。
- `id: str = Field(default_factory=new_entry_id)`:条目唯一标识,默认自动生成。
- `parent_id: str | None = None`:父节点 id,用于在内存/存储中重建树结构。根为 `None`。
- `timestamp: float = Field(default_factory=current_timestamp)`:写入时间戳,默认取当前时间。

该类本身不带 `type` 字段,所有具体子类都各自声明字面量 `type`,以便被 `SessionEntry` 的判别联合解析。

### MessageEntry

```python
class MessageEntry(BaseSessionEntry)
```

- **类型判别**:`type: Literal["message"] = "message"`。
- **字段**:
  - `message: AgentMessage`:承载一条对话消息(用户/助手/工具等),类型来自 `tau_agent.messages`。

表示会话正文中一条对话消息条目,是重放为 `SessionState.messages` 的核心数据。

### ModelChangeEntry

```python
class ModelChangeEntry(BaseSessionEntry)
```

- **类型判别**:`type: Literal["model_change"] = "model_change"`。
- **字段**:
  - `model: str`:本次切换后生效的模型名称。

表示一次模型选择变更;重放时被读入 `SessionState.model`。

### ThinkingLevelChangeEntry

```python
class ThinkingLevelChangeEntry(BaseSessionEntry)
```

- **类型判别**:`type: Literal["thinking_level_change"] = "thinking_level_change"`。
- **字段**:
  - `thinking_level: str | None = None`:思考/推理级别,可重置为 `None`。

表示思考级别变更;重放时被读入 `SessionState.thinking_level`。

### CompactionEntry

```python
class CompactionEntry(BaseSessionEntry)
```

- **类型判别**:`type: Literal["compaction"] = "compaction"`。
- **字段**:
  - `summary: str`:对较早消息的压缩摘要文本。
  - `replaces_entry_ids: list[str] = Field(default_factory=list)`:被本摘要所"替换/折叠"的那些消息条目 id 列表。

表示一次上下文压缩:在重放时(`memory.py` 的 `_apply_compaction`)会把 `replaces_entry_ids` 指向的消息从 `message_rows` 中剔除,并以一条合成 `UserMessage(摘要)` 替代,从而缩减上下文长度。

### BranchSummaryEntry

```python
class BranchSummaryEntry(BaseSessionEntry)
```

- **类型判别**:`type: Literal["branch_summary"] = "branch_summary"`。
- **字段**:
  - `summary: str`:某个分支的摘要文本。
  - `branch_root_id: str | None = None`:该分支根节点 id(可选)。

表示"从某分支返回"时留下的分支摘要;重放时会被格式化为一条 `UserMessage` 注入消息流(`_format_branch_summary`)。

### LabelEntry

```python
class LabelEntry(BaseSessionEntry)
```

- **类型判别**:`type: Literal["label"] = "label"`。
- **字段**:
  - `label: str`:人类可读的会话标签。

表示会话标签;重放时被读入 `SessionState.label`。

### LeafEntry

```python
class LeafEntry(BaseSessionEntry)
```

- **类型判别**:`type: Literal["leaf"] = "leaf"`。
- **字段**:
  - `entry_id: str | None = None`:当前活跃分支的叶子节点 id。

表示"活跃分支叶子指针":标记当前会话位于哪条分支末端。`active_leaf_id` 在重放时优先取该条目的值。

### SessionInfoEntry

```python
class SessionInfoEntry(BaseSessionEntry)
```

- **类型判别**:`type: Literal["session_info"] = "session_info"`。
- **字段**:
  - `created_at: float = Field(default_factory=current_timestamp)`:会话创建时间。
  - `cwd: str | None = None`:创建会话时的工作目录(可选)。
  - `title: str | None = None`:会话标题(可选)。

承载会话级元数据;重放时被读入 `SessionState.session_info`。

### CustomEntry

```python
class CustomEntry(BaseSessionEntry)
```

- **类型判别**:`type: Literal["custom"] = "custom"`。
- **字段**:
  - `namespace: str`:扩展/应用方命名空间,用于隔离不同来源自定义数据。
  - `data: dict[str, JSONValue] = Field(default_factory=dict)`:自定义键值数据,值受 `JSONValue` 约束。

供扩展程序存放自有数据;重放时被收集进 `SessionState.custom_entries`。

### SessionEntry

```python
type SessionEntry = Annotated[
    MessageEntry | ModelChangeEntry | ThinkingLevelChangeEntry
    | CompactionEntry | BranchSummaryEntry | LabelEntry
    | LeafEntry | SessionInfoEntry | CustomEntry,
    Field(discriminator="type"),
]
```

- **作用**:所有具体条目类型的判别联合(union)类型,以字面量字段 `type` 作为 Pydantic 判别器。
- **实现**:通过 `Field(discriminator="type")` 让 `TypeAdapter(SessionEntry)` 在(反)序列化时根据 `type` 字段自动路由到正确的具体子类。这是 JSONL 序列化与重建树的基础。

---

## 文件:session/tree.py

本文件提供基于 `parent_id` 指针的会话树遍历助手。它本身不持有一个"树对象",而是以"条目列表 + parent 指针"作为输入做纯函数式遍历,是 `memory.py` 从任意叶节点重放路径的底层工具。

### SessionTreeError

```python
class SessionTreeError(ValueError)
```

- **作用**:当条目集合无法构成合法可遍历的树(出现重复 id、环、缺失父节点等)时抛出的异常类型,继承自 `ValueError`。

### entries_by_id

```python
def entries_by_id(entries: list[SessionEntry]) -> dict[str, SessionEntry]
```

- **作用**:把条目列表转成 `{id: entry}` 字典,便于 O(1) 按 id 查父节点。
- **实现**:
  1. 初始化空 `dict`。
  2. 遍历 `entries`,若某 `entry.id` 已存在则抛 `SessionTreeError(f"Duplicate session entry id: {entry.id}")`。
  3. 否则写入 `result[entry.id] = entry`。
  4. 返回字典。

### path_to_entry

```python
def path_to_entry(entries: list[SessionEntry], leaf_id: str) -> list[SessionEntry]
```

- **作用**:从 `leaf_id` 出发沿 `parent_id` 一路回溯到根,返回"根→叶"有序路径。这是分支重放的核心:给定任意分支末端的叶子,即可还原该分支的完整历史。
- **实现**:
  1. 用 `entries_by_id` 建立 id→entry 索引。
  2. 维护 `path` 列表与 `seen` 集合,从 `current_id = leaf_id` 开始循环:
     - 若 `current_id` 已出现在 `seen`,说明有环,抛 `SessionTreeError(f"Cycle detected at session entry: {current_id}")`。
     - 否则加入 `seen`。
     - 从 `by_id` 取 `entry`;取不到则抛 `SessionTreeError(f"Missing session entry: {current_id}")`。
     - 把 `entry` 追加到 `path`,并把 `current_id` 指向 `entry.parent_id`。
  3. `current_id` 为 `None`(到达根)时退出循环。
  4. `path.reverse()` 把"叶→根"翻转成"根→叶"后返回。

> 说明:任务描述中提到的 `SessionTree` 类及各实例方法(`add_child`/`get_node`/`walk`/`ancestors`/`children`/`find`)在本文件中**并不存在**。本文件实际提供的是两个模块级纯函数 `entries_by_id` 与 `path_to_entry`,二者即为该目录的"树遍历助手"实现,分支模型完全靠 `parent_id` 指针表达。

---

## 文件:session/jsonl.py

本文件负责任意 `SessionEntry` 与 JSONL 文本行之间的(反)序列化。所有分支/重放/持久化都先经此模块转成或转自磁盘文本。

### SessionJsonlError

```python
class SessionJsonlError(ValueError)
```

- **作用**:当某行 JSONL 无法解析为合法 `SessionEntry`(Pydantic 校验失败)时抛出的异常,继承自 `ValueError`。

### entry_to_json_line

```python
def entry_to_json_line(entry: SessionEntry) -> str
```

- **作用**:把单个会话条目序列化为一行 JSONL 文本。
- **实现**:使用模块级 `TypeAdapter[SessionEntry]`(`_SESSION_ENTRY_ADAPTER`)的 `dump_json(entry)` 得到字节,`decode()` 成字符串后追加 `"\n"`。判别联合保证输出含 `type` 字段,后续可正确反序列化。

### entry_from_json_line

```python
def entry_from_json_line(line: str, *, line_number: int | None = None) -> SessionEntry
```

- **作用**:把单行文本反序列化为类型化的 `SessionEntry`(依据 `type` 判别到具体子类)。
- **实现**:
  1. `try` 中用 `_SESSION_ENTRY_ADAPTER.validate_json(line)` 解析。
  2. 捕获 `ValidationError`,若有 `line_number` 则构造带行号的报错 `Invalid session entry on line N: ...`,否则 `Invalid session entry: ...`,以 `SessionJsonlError` 重新抛出并保留原异常链(`from exc`)。

### entries_from_json_lines

```python
def entries_from_json_lines(lines: list[str]) -> list[SessionEntry]
```

- **作用**:批量反序列化 JSONL 文本,跳过空行,保持顺序。
- **实现**:
  1. 遍历 `lines`,`enumerate` 从 1 开始作为行号。
  2. 若 `line.strip()` 为空则 `continue`(忽略空行)。
  3. 否则调用 `entry_from_json_line(line, line_number=index)` 并追加到结果列表。
  4. 返回有序的 `SessionEntry` 列表。

模块级常量 `_SESSION_ENTRY_ADAPTER = TypeAdapter(SessionEntry)` 是所有(反)序列化的统一入口,利用 `entries.py` 的判别联合自动选择子类。

---

## 文件:session/storage.py

本文件定义会话存储的抽象接口(`Protocol`)与基于本地 JSONL 文件的实现,提供追加写与全量读两种能力(append-only 语义)。

### SessionStorage

```python
class SessionStorage(Protocol)
```

- **作用**:声明"追加式会话存储"的协议接口,任何实现只要提供 `append` 与 `read_all` 即满足。核心层不依赖具体文件系统。
- **方法声明**:
  - `async def append(self, entry: SessionEntry) -> None`:追加一个条目(抽象,无实现)。
  - `async def read_all(self) -> list[SessionEntry]`:按存储顺序读回全部条目(抽象,无实现)。

### JsonlSessionStorage

```python
class JsonlSessionStorage
```

本地基于单个 JSONL 文件的追加式存储实现。

#### __init__

```python
def __init__(self, path: str | Path) -> None
```

- **实现**:`self.path = Path(path)`,仅记录目标文件路径,不立即创建。

#### append

```python
async def append(self, entry: SessionEntry) -> None
```

- **作用**:把单个条目追加写入文件末尾(append-only)。
- **实现**:
  1. `self.path.parent.mkdir(parents=True, exist_ok=True)`:确保父目录存在(递归创建,已存在不报错)。
  2. 以 `"a"`(追加)模式、`utf-8` 编码打开文件。
  3. `file.write(entry_to_json_line(entry))`:经 `jsonl.entry_to_json_line` 写出一行。

> 说明:此处为普通追加写,并非"原子写/临时文件 rename"形式。实际原子性依赖追加模式本身(每行独立、追加不截断),而非先写临时文件再 rename。任务描述中"原子写"在本实现中体现为"以追加模式打开、不重写已有内容、按行独立写入",并非 atomic rename 机制。

#### read_all

```python
async def read_all(self) -> list[SessionEntry]
```

- **作用**:按文件顺序读出全部条目。
- **实现**:
  1. 若 `self.path` 不存在,直接返回 `[]`(缺失文件即空会话,不抛错)。
  2. 否则 `self.path.read_text(encoding="utf-8").splitlines()` 得到行列表,交给 `entries_from_json_lines` 解析并返回。

---

## 文件:session/memory.py

本文件是把"追加式条目列表"重放(replay)为"当前内存会话状态"的核心。它支持三种重放模式:线性全量重放、从指定 `leaf_id` 沿树路径重放(分支切换)、以及显式 `None` 表示空路径。`SessionState` 是不可变( frozen + slots )快照。

### SessionState

```python
@dataclass(frozen=True, slots=True)
class SessionState
```

从 append-only 条目派生出的当前会话状态快照,冻结且使用 `__slots__` 以省内存。

#### 字段

- `messages: tuple[AgentMessage, ...]`:重放后得到的消息序列(顺序同对话流)。
- `model: str | None`:当前生效模型(来自最后一个 `model_change`)。
- `thinking_level: str | None`:当前思考级别(来自最后一个 `thinking_level_change`)。
- `label: str | None`:会话标签(来自最后一个 `label`)。
- `active_leaf_id: str | None`:当前活跃分支叶子 id。
- `session_info: SessionInfoEntry | None`:会话元数据(若有)。
- `custom_entries: tuple[CustomEntry, ...]`:所有自定义条目集合。
- `compaction_entries: tuple[CompactionEntry, ...]`:所有压缩条目集合。
- `context_entry_ids: tuple[str, ...]`:当前 `messages` 中各消息对应源条目的 id(用于追溯哪些原始条目进入了上下文,尤其是 compaction 之后)。
- `entries: tuple[SessionEntry, ...]`:参与本次重放的实际条目序列(全量或某分支路径)。

#### from_entries

```python
@classmethod
def from_entries(
    cls,
    entries: list[SessionEntry],
    *,
    leaf_id: str | None | object = _UNSET_LEAF_ID,
) -> SessionState
```

- **作用**:把条目列表重放成 `SessionState`。这是分支切换/任意节点重放的入口。
- **关键分支(重放集 `replay_entries` 的确定)**:
  1. `replay_all = leaf_id is _UNSET_LEAF_ID`:未传 `leaf_id` 时为真。
  2. `resolved_leaf_id = None if replay_all else cast(str | None, leaf_id)`。
  3. 计算 `replay_entries`:
     - 若 `replay_all`:用全量 `entries`(线性重放,保持存储顺序)。
     - 否则若 `resolved_leaf_id is not None`:调用 `path_to_entry(entries, resolved_leaf_id)` 得到该叶到根的路径(分支重放)。
     - 否则(`leaf_id` 显式为 `None`):用空列表 `[]`(表示"第一个根条目之前"的空状态)。
- **重放遍历**:初始化 `message_rows`(携带源 `entry_id` 的 `(id, AgentMessage)` 列表)、`model`、`thinking_level`、`label`、`active_leaf_id`(初值=`resolved_leaf_id`)、`session_info`、`custom_entries`、`compaction_entries`。对每个 `entry` 按 `entry.type` 用 `match` 分派:
  - `"message"`:`message_rows.append((entry.id, entry.message))`。
  - `"model_change"`:`model = entry.model`。
  - `"thinking_level_change"`:`thinking_level = entry.thinking_level`。
  - `"label"`:`label = entry.label`。
  - `"leaf"`:`active_leaf_id = entry.entry_id`(以叶子指针条目覆盖)。
  - `"session_info"`:`session_info = entry`。
  - `"custom"`:`custom_entries.append(entry)`。
  - `"compaction"`:`compaction_entries.append(entry)`,并 `message_rows = _apply_compaction(message_rows, entry)` 折叠旧消息。
  - `"branch_summary"`:`message_rows.append((entry.id, UserMessage(content=_format_branch_summary(entry))))`(注入分支摘要消息)。
- **收尾**:用推导式分离出纯 `messages` 与 `context_entry_ids`,并把 `replay_entries` 一并打包成冻结的 `SessionState` 返回。

### _apply_compaction

```python
def _apply_compaction(
    message_rows: list[tuple[str, AgentMessage]],
    entry: CompactionEntry,
) -> list[tuple[str, AgentMessage]]
```

- **作用**:在重放时把 `entry.replaces_entry_ids` 指向的历史消息就地折叠为一条摘要消息,实现上下文压缩。
- **实现**:
  1. `replaced_ids = set(entry.replaces_entry_ids)`,`inserted_summary = False`。
  2. 遍历 `message_rows`:
     - 若 `entry_id not in replaced_ids`:原样 `retained.append`。
     - 若属于被替换集合:不保留原消息;且当尚未插入摘要时,插入 `(entry.id, UserMessage(_format_compaction_summary(entry.summary)))`,置 `inserted_summary = True`。这样摘要只在该分支首次遇到被替换消息时插入一次,保留"折叠点"语义。
  3. 若遍历完仍 `not inserted_summary`(即没有任何被替换消息存在于当前 rows,例如摘要出现在被替换消息之前或替换集合为空),则在末尾补插一条摘要消息。
  4. 返回新的 `retained` 列表。

### _format_compaction_summary

```python
def _format_compaction_summary(summary: str) -> str
```

- **作用**:把压缩摘要包装成用户可见文本。
- **实现**:返回 `f"Previous conversation summary:\n{summary}"`。

### _format_branch_summary

```python
def _format_branch_summary(entry: BranchSummaryEntry) -> str
```

- **作用**:把分支摘要包装成提示文本,说明当前会话曾从该分支返回。
- **实现**:返回以 `"The following is a summary of a branch that this conversation came back from:\n"` 开头、中间用 `<summary>...</summary>` 包裹 `entry.summary` 的字符串。

---

## 文件:session/__init__.py

本文件是 `tau_agent.session` 包的公共导出面,集中 re-export 各子模块的核心符号,并声明 `__all__`。

### __all__

```python
__all__ = [ ... ]
```

- **作用**:定义包级公共 API,约束 `from tau_agent.session import *` 的可见名。
- **导出内容**:
  - 条目模型:`BaseSessionEntry`、`MessageEntry`、`ModelChangeEntry`、`ThinkingLevelChangeEntry`、`CompactionEntry`、`BranchSummaryEntry`、`LabelEntry`、`LeafEntry`、`SessionInfoEntry`、`CustomEntry`、`SessionEntry`。
  - JSONL 相关:`entry_to_json_line`、`entry_from_json_line`、`entries_from_json_lines`、`SessionJsonlError`。
  - 内存状态:`SessionState`(来自 `memory.py`)。
  - 存储:`SessionStorage`、`JsonlSessionStorage`。
  - 树助手:`path_to_entry`、`entries_by_id`、`SessionTreeError`。

> 注意:本文件并未导出 `tree.py` 中的函数之外、或 `entries.py` 里的 `new_entry_id`/`current_timestamp` 等辅助函数,也并未单独导出 `SessionTree` 类(该文件本就无此类)。

---

## 串联:TUI 分支功能(`TreePickerScreen`)的底层机制

1. **树结构**:每个 `SessionEntry` 通过 `parent_id` 指向父节点,组成一棵支持多分支的会话树(分支 = 同一父节点下出现多个子节点)。`tree.py` 的 `entries_by_id` + `path_to_entry` 提供"从任意叶子回溯根"的纯函数遍历,无需显式树对象。

2. **分支切换 / 任意节点重放**:`memory.py` 的 `SessionState.from_entries(entries, leaf_id=...)` 借 `path_to_entry` 取某分支根→叶路径,再按 `type` 分派重放出该分支对应的 `messages`/`model`/`thinking_level` 等。这就是 TUI 中 `TreePickerScreen` 选择某节点/分支后"跳到该历史点继续"的内存状态来源——选谁,就重放谁的路径。

3. **JSONL 持久化**:`storage.py` 的 `JsonlSessionStorage` 以追加模式把每条 `SessionEntry` 经 `jsonl.py` 写成一行带 `type` 判别字段的 JSONL;`read_all` 再用 `entries_from_json_lines` + 判别联合 `SessionEntry` 还原为强类型条目列表,为上面的重放提供输入。

4. **Compaction 与分支摘要**:`CompactionEntry` 通过 `replaces_entry_ids` 在重放时被 `_apply_compaction` 折叠成一条摘要 `UserMessage`,控制上下文长度;`BranchSummaryEntry` 则在分支返回时注入 `UserMessage` 说明。二者都靠 `type` 分派在 `from_entries` 中无缝融入消息流。

5. **整体数据流**:磁盘 JSONL → `JsonlSessionStorage.read_all` → `entries_from_json_lines`(判别联合)→ `list[SessionEntry]` → `SessionState.from_entries(leaf_id=选中节点)`(经 `path_to_entry` 取分支路径、按 `type` 重放、compaction 折叠)→ 当前 `SessionState` 交给 agent 循环 / TUI 展示。

---

<!-- NAV -->
[← tau_agent · 执行核心]({{< relref "./agent-loop-harness.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_agent · 公共导出与边界]({{< relref "./agent-init-boundary.md" >}})
