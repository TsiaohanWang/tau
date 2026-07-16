---
title: tau_coding · 会话索引
description: session_manager.py
code_files:
  - tau_coding/session_manager.py
---

## `tau_coding/session_manager.py` — the session index

`CodingSession`（第 3b 部分）拥有*单个*对话文件。`SessionManager`（会话管理器）则
拥有*所有会话的目录*，使 CLI 能够在多次运行之间列出、恢复与创建会话。

### `SessionRecordModel`（Pydantic）

单个会话元数据的磁盘 JSON 形态：

- `id: str` — 会话 id（十六进制 uuid，或 `default-<project-hash>`）。
- `path: str`、`cwd: str` — JSONL 文件位置与解析后的工作目录。
- `model: str`、`provider_name: str | None`。
- `title: str | None` — 用户可见的名称。
- `created_at`、`updated_at: float` — 纪元秒数。

`model_config = ConfigDict(extra="ignore")` 意味着新增字段不会破坏旧的索引文件。

### `CodingSessionRecord`（frozen dataclass）

`SessionRecordModel` 在内存中的、带类型的孪生体。它持有 `Path` 对象而非字符串，
也是应用其余部分实际使用的形态。

- `from_model` / `to_model` — 在 JSON 模型与记录之间互相转换。
- 它像其他 Tau 数据类型一样是 `frozen=True, slots=True`：不可变且内存轻量，
  因为管理器可能持有大量此类对象。

### `SessionManager`

索引由一组 `index.jsonl` 文件构成。在 `paths.sessions_dir / "index.jsonl"` 处
有一个*遗留的全局*索引，在 `paths.project_session_dir(cwd) / "index.jsonl"` 处
有一个*每项目*索引。每一行是一个 JSON 形式的 `CodingSessionRecord`。

关键方法：

- **`index_path`** — 遗留的全局索引。
- **`project_index_path(cwd)`** — 针对已解析 cwd 的每项目索引。
- **`list_sessions(cwd=None)`** — 返回按 `updated_at` 降序排序的记录。给定 `cwd`
  时，它只读取该项目的索引以及任何指向该 cwd 的全局记录（已去重）。不给定
  `cwd` 时，它聚合全局索引与会话目录下每一个 `*/index.jsonl`。
- **`get_session(session_id)`** — 跨所有索引的线性扫描。
- **`latest_session_for_cwd(cwd)`** — 某目录最近更新的会话（供不带 `--session`
  参数运行 `tau` 时使用）。
- **`create_session(...)`** — 先调用 `prepare_session` 再调用 `index_session`。
- **`prepare_session(...)`** — 构造一个 `CodingSessionRecord` 但*不写入*，解析
  cwd、生成 id（或使用提供的 id）、并计算 JSONL 路径。它还会创建父目录。
- **`index_session(record)`** — 调用 `_upsert`。
- **`get_or_create_default_session(...)`** — 返回一个项目内稳定的 `default-<hash>`
  会话，若缺失则创建索引条目。这就是 “直接在本仓库里运行 `tau`” 所用的会话。
- **`touch_session(...)`** — 更新 `model`/`provider_name`/`title` 并刷新
  `updated_at`（每次使用会话时都会调用，使其浮到 `list_sessions` 顶部）。

```python
def list_sessions(self, cwd: Path | None = None) -> list[CodingSessionRecord]:
    records = self._read_project_records(cwd) if cwd is not None else self._read_all_records()
    return sorted(records, key=lambda record: record.updated_at, reverse=True)

def get_session(self, session_id: str) -> CodingSessionRecord | None:
    for record in self._read_all_records():
        if record.id == session_id:
            return record
    return None

def create_session(self, *, cwd, model, provider_name=None, title=None, session_id=None) -> CodingSessionRecord:
    record = self.prepare_session(cwd=cwd, model=model, provider_name=provider_name,
                                  title=title, session_id=session_id)
    self.index_session(record)
    return record

def touch_session(self, session_id: str, *, model=None, provider_name=None, title=None) -> CodingSessionRecord | None:
    existing = self.get_session(session_id)
    if existing is None:
        return None
    updated = CodingSessionRecord(
        id=existing.id, path=existing.path, cwd=existing.cwd,
        model=model or existing.model,
        provider_name=provider_name if provider_name is not None else existing.provider_name,
        title=title if title is not None else existing.title,
        created_at=existing.created_at, updated_at=time(),
    )
    self._upsert(updated)
    return updated
```

以上为 `SessionManager` 关键方法的精简实现：`list_sessions` 按 `updated_at` 降序排序；`get_session` 作为按 id 解析会话引用（`resolve_session_ref`）的线性扫描；`create_session` 委托 `prepare_session` + `index_session`；`touch_session` 取出旧记录、刷新元数据后 `_upsert` 就地更新（管理器无独立 `delete`，删除由重建索引时剔除对应 id 完成）。

索引 I/O 辅助函数：

- **`_read_index(path)`** — 把 JSONL 索引读为记录；文件缺失则返回 `[]`。
- **`_read_project_records(cwd)`** — 该 cwd 的项目索引 + 全局记录；去重。
- **`_read_all_records()`** — 全局索引 + 每一个 `*/index.jsonl`；去重。
- **`_write_index(path, records)`** — 写入所有记录，每行一个 JSON 对象，末尾换行。
- **`_upsert(record)`** — 读取项目索引，丢弃任何同 id 的现有条目，追加后写回。
  因此重新打开会话是就地更新其元数据，而非复制一份。

### `_deduplicate_records`

模块级辅助函数：给定可能重叠的、来自多个索引的记录，每个 id 保留一条，优先保留
`updated_at` 较新（较近）的那条。这处理了会话同时出现在全局索引与项目索引中的情形。

> **为什么有两个索引位置，以及为什么读取时合并它们。** 全局的
> `index.jsonl` 是遗留布局；新会话则写入每项目索引。与其急切地迁移旧文件，
> 管理器选择把两者都读入，再由 `_deduplicate_records` 消解任何重叠，这样已有的
> 安装无需任何迁移步骤就能继续解析它的旧会话。这正体现了 Tau 的 “Sessions are
> durable and inspectable”（会话可持久且可检视）原则：会话索引是朴素、面向追加的
> JSONL，跨版本都保持可读，而前向兼容性由 `ConfigDict(extra="ignore")` 丢弃未知
> 字段来保障，而非重写文件。

---

<!-- NAV -->
[← tau_coding · Slash 命令]({{< relref "./coding-commands.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · Provider 配置]({{< relref "./coding-provider-config.md" >}})
