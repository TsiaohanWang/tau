---
title: tau_coding · 支撑模块(一)
description: thinking / catalog_loader / branch_summary / diagnostics
code_files:
  - tau_coding/thinking.py
  - tau_coding/catalog_loader.py
  - tau_coding/branch_summary.py
  - tau_coding/diagnostics.py
---

## `tau_coding/thinking.py` — thinking-mode primitives

一个轻量、零依赖的模块,它*集中管理*推理强度的词汇表,使每一层(catalog、session、TUI、providers)都对同一组级别达成一致,从而避免推理设置以字符串形式散落在代码各处。

- **Type aliases:**
  - `ThinkingLevel = Literal["off", "minimal", "low", "medium", "high", "xhigh"]`
    —— 面向用户的 UI 词汇表。
  - `ThinkingParameter = Literal["reasoning_effort", "reasoning.effort", "anthropic.thinking"]`
    —— 各 provider 期望的*线路参数名*(OpenAI 在不同 API 形态下使用前两种;Anthropic 使用 `anthropic.thinking`)。catalog 决定某个模型使用哪一种。
  - `ReasoningEffort = Literal["none", "minimal", "low", "medium", "high", "xhigh"]`
    —— 与 OpenAI 兼容的取值(注意 `"off"` 映射为 `"none"`)。
- **`THINKING_LEVELS`** —— 规范的有序元组;以 `"off"` 开头,以便循环切换时能到达它。
- **`DEFAULT_THINKING_LEVEL = "medium"`** —— 默认思考级别。
- **`THINKING_LEVEL_DESCRIPTIONS`** —— 供 TUI 使用的人类可读标签。
- **`normalize_thinking_level(value)`** —— 大小写/空白不敏感的校验;`None` → 默认值;抛出面向用户的 `ValueError`,并列出所有可用模式。
- **`normalize_thinking_levels(values)`** —— 校验一个*序列*(catalog 使用);拒绝裸字符串、空列表与重复项。
- **`reasoning_effort_for_level(level)`** —— 映射到 OpenAI:`"off"` → `"none"`,其余保持原词。
- **`anthropic_thinking_budget_for_level(level)`** —— 映射到 Anthropic 扩展思考(extended-thinking)的 token 预算:`minimal=1024`、`low=2048`、`medium=4096`、`high=8192`、`xhigh=16384`;`"off"` → `None`(不开启扩展思考)。
- **`next_thinking_level(current, *, available)`** —— 稳定的循环旋转,供 TUI 的"循环思考"按键使用;以取模方式回绕;未知值 → 第一个可用值。

> **设计缘由。** 该模块把*UI 级别*(稳定、友好、与 provider 无关、在 TUI 中暴露的词汇表)与*provider 参数*(各后端期望的线路特定名称)分离开来。这遵循了 Tau 的"小层胜过魔法"(Small layers beat magic)原则——每一层都对一套共享词汇表达成一致,而不是把 provider 的怪异之处穿过 UI 层层传递。因此,日后新增一个 provider 只需在此处加一个映射并补一条 catalog 条目,TUI 与 session 层保持不变,因为它们只使用抽象级别。

---

## `tau_coding/catalog_loader.py` — provider catalog loading

加载 `tau_coding/data/catalog.toml`(内置)并叠加用户自己的
`~/.tau/catalog.toml`,产出经校验、供 `provider_catalog.py` 使用的 `ProviderCatalogEntry` 对象。

- **常量:** `CATALOG_SCHEMA_VERSION = 1`、`USER_CATALOG_FILENAME = "catalog.toml"`、
  `_THINKING_FIELDS`(必须作为*一组*合并的四个思考字段,与 `provider_config.py` 中的 `_merge_provider_config` 对应)。
- **严格类型的 Pydantic 校验器**(`_NonEmptyString`、
  `_NonEmptyStringTuple`、`_PositiveInt`、`_NonNegativeFloat`)—— 对 `_CatalogCostTier`、`_CatalogModelMetadata`、
  `_CatalogProvider`、`_CatalogFile` 设置 `extra="forbid"`
  与 `frozen=True`,使格式错误的 TOML 立即报错,且条目不可变。
- **`CatalogError(ValueError)`** —— 针对错误 catalog 文件的唯一异常类型。
- **`builtin_catalog_resource_text()`** —— 通过 `importlib.resources.files` 读取打包的 TOML。
- **`builtin_catalog()`**(`@cache`)—— 已解析/校验的内置 provider。
- **`user_catalog_path(paths)`** —— `~/.tau/catalog.toml`。
- **`effective_catalog(paths)`** —— 若无用户文件则返回内置;否则解析、校验、`_merge_raw_catalogs` 再重新校验。
- **`save_user_catalog_entries(entries, paths)`** —— 把完整的 provider 定义 upsert 进用户 catalog(供 `/setup` 使用);保留其他条目,通过 `_atomic_write_text` 原子写入。
- **合并逻辑:** `_merge_raw_catalogs` 按名称叠加 provider 表(overlay 优先,新增 provider 保持原有顺序);`_merge_raw_provider` 合并标量覆盖项,用 `dict.fromkeys` 去重拼接 `models`,深度合并 `context_windows`/`headers`/`compat`/`model_metadata`,并且——关键地——把四个思考字段当作一个*整体*处理:若 overlay 设置了任一思考字段,则整组替换,并丢弃 base 的思考组。`_merge_model_metadata` 对每个模型的元数据做同样的嵌套合并。
- **校验:** `_entries_from_raw` → `_entry_from_provider` 执行语义检查(默认模型须在 `models` 中;思考模型 / 上下文窗口 / 元数据键都引用真实模型;`thinking_default ∈ thinking_levels`;最后一个定价档位必须省略 `max_input_tokens`;档位上限严格递增),并以精确的带点字段路径抛出 `CatalogError`。
- **序列化往返:** `_raw_provider_from_entry` / `_raw_model_metadata_from_entry`
  重新生成可 TOML 序列化的字典;`_catalog_to_toml` 与 `_toml_value` /
  `_toml_key` 输出干净的 TOML;`thinking_level_map` 被拆为有效条目 + `unsupported_thinking_levels`(与加载时 `_model_metadata_from_provider` 中的合并操作互逆,后者会把 `unsupported_thinking_levels` 还原为 `None` 映射值)。
- **`_format_validation_error` / `_dotted_location`** —— 把 Pydantic 错误转换为人类可读的 `providers.<name>.<field>` 路径(将数组下标解析为 provider 名称)。

> **设计缘由。** catalog 是*数据,而非代码*。加载器的职责是让数据成为权威、由代码派生:provider 在此处一次性校验,之后运行时不再重复检查。这体现了 Tau 的"文档随实现而生"(Documentation follows implementation)立场——catalog 是单一事实来源,运行时只需消费它。严格类型的 Pydantic 模型(frozen、`extra="forbid"`)加上单一的 `CatalogError` 类型,使这一契约严丝合缝:格式错误的 TOML 在加载时即大声报错,而不是在运行时产生难以察觉的异常行为。

---

## `tau_coding/branch_summary.py` — abandoned-branch summaries

当用户切换会话分支时,被放弃分支的对话可由模型浓缩成摘要,并作为上下文重新附加。本模块负责构建提示词并解析结果。

- **常量 / 提示词:** `BRANCH_SUMMARY_SYSTEM_PROMPT`(严格要求"只总结、不要续写")、`BRANCH_SUMMARY_PREAMBLE`(附加到摘要前的"你此前探索了另一条分支"引导语)、`BRANCH_SUMMARY_PROMPT`(一个固定的 Markdown 模板,包含 Goal / Constraints / Progress / Key Decisions / Next Steps 等小节),以及 `MAX_SUMMARY_SOURCE_MESSAGE_CHARS = 4_000`、
  `MAX_SUMMARY_SOURCE_TOTAL_CHARS = 60_000`、`TOOL_RESULT_MAX_CHARS = 2_000` —— 这些是硬性上限,确保摘要请求本身永远不会撑爆上下文窗口。
- **`summarize_branch_messages_with_model(*, provider, model, messages, custom_instructions, replace_instructions)`**
  —— 通过 provider 流式发送一条 `UserMessage`(无工具),返回助手文本;若遇到任何 `ProviderErrorEvent` / 空结果则返回 `None`,随后用 `_add_branch_summary_context` 包装。
- **`_branch_summary_prompt`** —— 序列化对话并组装指令;`replace_instructions` 会整体替换模板,否则把 `custom_instructions` 作为"Additional focus"追加。
- **`_serialize_branch_conversation`** —— 把每条消息裁剪到
  `MAX_SUMMARY_SOURCE_MESSAGE_CHARS`;当累计字符数超过
  `MAX_SUMMARY_SOURCE_TOTAL_CHARS` 时停止,并追加一条 "[N message(s) omitted]"
  说明。正是这种预算纪律,使得一个 6 万字符的分支仍能装入一次摘要请求。
- **`_format_summary_source_message` / `_format_assistant_summary_source` /
  `_format_tool_call_arguments`** —— 把每条 `AgentMessage` 渲染为紧凑、带标签的一行;工具调用显示为 `name(key=val, …)`。
- **`_trim_summary_source_text`** —— 截断,并附上明确的 "[… N more
  characters truncated]" 标记。
- **`_add_branch_summary_context`** —— 扫描助手工具调用中对 `path` 参数的 `read`、
  `edit`、`write` 操作,发出 `<read-files>` /
  `<modified-files>` 块,使摘要保留与决策最相关的文件清单。仅读取(读了但未修改)的文件与已修改的文件分开。

> **设计缘由。** 摘要器被刻意设计成*有损但结构化*。它用逐字保真换取一个有界、符合模式的摘要加上文件集合,而这正是 agent 日后回到某个分支时真正需要的东西。硬性字符上限(`MAX_SUMMARY_SOURCE_MESSAGE_CHARS`、`MAX_SUMMARY_SOURCE_TOTAL_CHARS`)保证无论被放弃的分支增长到多长,摘要请求本身都不可能耗尽上下文窗口。这让分支恢复既廉价又可预期,而不必重放完整的对话记录。

---

## `tau_coding/diagnostics.py` — structured failure logging

当 agent 调用失败时,追加机器可读的 JSONL 诊断信息,以便支持 / 调试在不泄露密钥的情况下重建发生了什么。

- **`AgentCallDiagnosticContext`**(frozen,slots)—— 不含密钥的上下文:
  `provider_name`、`model`、`cwd`、`session_id`、`run_id`。注意它刻意*不*携带任何 API 密钥或消息内容。
- **`AgentCallDiagnosticLogger`** —— 以 `path` 构造;`from_paths`
  在 `TauPaths().agent_calls_log_path` 处构建它。`log_exception` 写入一条
  `kind="exception"` 条目,含类型/消息/完整 traceback;`log_error_event`
  写入一条 `kind="error_event"` 条目,含 `ErrorEvent.message`、
  `recoverable` 标志以及可选的 `data`。`_append` 创建父目录并
  追加一行 JSON(键已排序)—— 仅追加,因此写入中途崩溃不会破坏之前的条目。
- **`new_agent_call_run_id()`** —— 一个 `uuid4().hex`,标识一次 coding-session 的 agent 调用;它会穿过 `AgentCallDiagnosticContext`,使同一次运行的多条日志条目共享同一个 id。
- **`_base_entry`** —— 打上 `timestamp`(UTC ISO)、`kind`、`phase` 以及上下文字段。`phase` 参数让调用方记录失败发生在循环的*何处*(provider 调用、工具执行、压缩……)。

> **设计缘由。** 诊断信息被刻意地与面向用户的错误分离。它们是仅追加、无密钥、结构化的,以便日后可被 grep/解析而不存在泄露凭据的风险——上下文数据类携带 `provider_name`/`model`/`cwd`/`session_id`/`run_id`,但绝不携带 API 密钥或消息内容。由于条目以单行 JSON 追加,写入中途崩溃不会破坏之前的条目。除非某个失败路径主动暴露日志路径,否则这里的内容不会展示给用户。

---

## 逐方法深度剖析（thinking / catalog_loader / branch_summary / diagnostics）

> 以下为 support-1 各组支撑模块的逐方法展开。

## 文件:thinking.py

该模块定义 Tau 编码会话中"思考模式(thinking mode)"的基础类型、常量与映射函数。核心职责是:把用户在 UI 上选择的、与具体 provider 无关的"思考级别"(off/minimal/low/medium/high/xhigh)转换为各 provider 实际请求所需的参数。OpenAI 风格 provider 接收 `reasoning_effort` 取值(推理强度),Anthropic 接收扩展思考(extended thinking)的 token 预算整数,二者由不同的映射函数分别产出。

### ThinkingLevel

```python
ThinkingLevel = Literal["off", "minimal", "low", "medium", "high", "xhigh"]
```

类型别名(Literal)。表示 Tau 在 UI 层暴露的六种抽象思考级别。它是 provider 无关的统一枚举值;具体 provider 在 `provider_config`/`provider_runtime` 中再把它翻译成各自的请求字段。

### ThinkingParameter

```python
ThinkingParameter = Literal["reasoning_effort", "reasoning.effort", "anthropic.thinking"]
```

类型别名(Literal)。表示把思考级别映射到 provider 请求时可能使用的三种参数名(OpenAI 风格 `reasoning_effort`、点分式 `reasoning.effort`、Anthropic 风格 `anthropic.thinking`)。catalog 里的 `thinking_parameter` 字段会选用其中之一。

### ReasoningEffort

```python
ReasoningEffort = Literal["none", "minimal", "low", "medium", "high", "xhigh"]
```

类型别名(Literal)。OpenAI 兼容的推理强度取值。与 `ThinkingLevel` 唯一区别是 `"off"` 被映射为 `"none"`(因为 OpenAI 没有 off,只有 none)。

### THINKING_LEVELS

```python
THINKING_LEVELS: tuple[ThinkingLevel, ...] = (
    "off", "minimal", "low", "medium", "high", "xhigh",
)
```

不可变元组常量,按强度从低到高排列。作为所有思考级别的唯一权威集合来源,被校验函数、循环函数和 `normalize_*` 函数引用。顺序决定了 `next_thinking_level` 的循环次序。

### DEFAULT_THINKING_LEVEL

```python
DEFAULT_THINKING_LEVEL: ThinkingLevel = "medium"
```

模块级默认思考级别常量,取值 `"medium"`。在 `normalize_thinking_level`(缺省值)、`next_thinking_level`(空 available 时的回退)、以及 `cli.py`/`tui/app.py` 构造会话的默认参数处使用。

### THINKING_LEVEL_DESCRIPTIONS

```python
THINKING_LEVEL_DESCRIPTIONS: dict[ThinkingLevel, str] = {
    "off": "No reasoning",
    "minimal": "Very brief reasoning",
    "low": "Light reasoning",
    "medium": "Moderate reasoning",
    "high": "Deep reasoning",
    "xhigh": "Maximum reasoning",
}
```

`ThinkingLevel -> 人类可读描述` 的字典。供 UI(状态栏、帮助信息)展示每个级别的语义,便于用户理解强度差异。该模块本身不提供 `thinking_level_label` / `thinking_level_description` 之类的包装函数,描述由 UI 层直接读取此字典。

### normalize_thinking_level

```python
def normalize_thinking_level(value: str | None) -> ThinkingLevel:
```

**作用**:把任意字符串输入规整为合法的 `ThinkingLevel`,非法时报出面向用户的错误。

**关键实现**:
1. 若 `value is None`,直接返回 `DEFAULT_THINKING_LEVEL`(`"medium"`)。
2. 否则 `value.strip().lower()` 去空白并转小写。
3. 若结果在 `THINKING_LEVELS` 中,返回该规范化值。
4. 否则抛出 `ValueError`,消息中列出所有可用模式(`, ".join(THINKING_LEVELS)`),便于用户纠正。

该函数是几乎所有其他映射/校验函数的内部基石(`reasoning_effort_for_level`、`anthropic_thinking_budget_for_level`、`normalize_thinking_levels`、`next_thinking_level` 都依赖它)。

### normalize_thinking_levels

```python
def normalize_thinking_levels(values: Sequence[str]) -> tuple[ThinkingLevel, ...]:
```

**作用**:把一个思考级别列表规整为已去重的合法元组,用于校验配置中(如 catalog 的 `thinking_levels`)提供的一组级别。

**关键实现**:
1. 若 `values` 是字符串(`isinstance(values, str)`)或为空(`not values`),抛出 `ValueError`(消息列出可用模式)。
2. 否则对每个元素调用 `normalize_thinking_level`,得到元组 `normalized`。
3. 用 `len(set(normalized)) != len(normalized)` 检测重复,有重复则抛 `ValueError("Thinking modes must be unique")`。
4. 返回去重后的规范化元组(集合判定只检查存在重复,不保证顺序去重,但输入顺序被保留)。

### reasoning_effort_for_level

```python
def reasoning_effort_for_level(level: str | None) -> ReasoningEffort:
```

**作用**:把 Tau 的 UI 思考级别映射为 OpenAI 兼容的 `ReasoningEffort` 取值。

**关键实现**:
1. 先 `normalize_thinking_level(level)` 得到规范化级别。
2. 若为 `"off"`,返回 `"none"`(OpenAI 的 API 以 `"none"` 表示关闭推理,没有 `"off"` 这一档)。
3. 否则原样返回该级别字符串(它天然属于 `ReasoningEffort` 的取值集合)。

映射动机:OpenAI 的 Chat Completions / Responses API 通过 `reasoning_effort`(`"none"`/`"minimal"`/`"low"`/`"medium"`/`"high"`)控制推理强度,而 Tau 的 UI 词汇用 `"off"` 表示"不推理"。该函数把 `"off"` 归一为 `"none"` 后,其余级别名称与 OpenAI 的取值一一对应,无需额外换算。

此函数在 `provider_config.py:1582` 和 `provider_runtime.py:176` 中被调用,用于向 OpenAI 风格 provider 的请求体注入 `reasoning_effort`。

### anthropic_thinking_budget_for_level

```python
def anthropic_thinking_budget_for_level(level: str | None) -> int | None:
```

**作用**:把 Tau 的 UI 思考级别映射为 Anthropic 扩展思考(extended thinking)的 token 预算整数(`thinking.budget_tokens`)。

**关键实现**:
1. `normalize_thinking_level(level)` 得到规范化级别。
2. 若为 `"off"`,返回 `None`(不开启扩展思考)。
3. 否则按下表查表返回 token 数:
    - `"minimal"`: `1024`
    - `"low"`: `2048`
    - `"medium"`: `4096`
    - `"high"`: `8192`
    - `"xhigh"`: `16384`

映射动机:Anthropic 的 extended thinking 以一个 token 预算(而非命名档位)控制推理深度,且该预算须低于请求的总 `max_tokens`。Tau 用一组固定预算值把抽象的 UI 级别线性映射到推理深度,使同一级别在不同 provider 下获得可比较的思考投入;预算随级别按 2 倍递增,从 `minimal` 的 1024 到 `xhigh` 的 16384。

在 `provider_config.py:1609` 调用,用于向 Anthropic provider 注入 `thinking` 预算参数。

### next_thinking_level

```python
def next_thinking_level(
    current: str | None,
    *,
    available: tuple[ThinkingLevel, ...] = THINKING_LEVELS,
) -> ThinkingLevel:
```

**作用**:在一个稳定循环中返回 `current` 的"下一个"思考级别,用于 UI 中用户按快捷键在级别间循环切换。

**关键实现**:
1. 若 `available` 为空,返回 `DEFAULT_THINKING_LEVEL`。
2. 尝试 `normalize_thinking_level(current)` 并在 `available.index(...)` 定位当前下标;若 `current` 非法(`ValueError`),则回退到 `available[0]`。
3. 返回 `available[(index + 1) % len(available)]`——环形取模,保证到末尾后回到开头。

调用关系:在 `session.py` 的 `cycle_thinking_level` 中使用,而 `tui/app.py:4595 _cycle_thinking_level`、`commands.py` 的 `/thinking` 命令循环均经由会话方法间接调用 `next_thinking_level`。

---

## 文件:catalog_loader.py

该模块负责从"打包内置资源"与"用户主目录 overlay"两处加载 provider 目录(catalog),将 TOML 解析为受 pydantic 校验的结构,合并 overlay 覆盖内置值,最终产出 `ProviderCatalogEntry` 元组供 `provider_config` / `provider_runtime` 使用。同时提供把条目写回用户 `catalog.toml` 的 upsert 与原子写能力。

### 模块级常量

- `CATALOG_SCHEMA_VERSION = 1`:catalog 文件要求的 `schema_version`,校验不匹配即报错。
- `USER_CATALOG_FILENAME = "catalog.toml"`:用户级 overlay 文件名,位于 `~/.tau/`。
- `_THINKING_FIELDS = ("thinking_levels", "thinking_models", "thinking_default", "thinking_parameter")`:思考相关字段组,合并时作为一个整体替换(见 `_merge_raw_provider`)。
- `_NonEmptyString`、`_NonEmptyStringTuple`、`_PositiveInt`、`_NonNegativeFloat`:pydantic 的 `Annotated` 校验类型,用于约束 TOML 字符串/整数/浮点字段非空、正数、非负等。

### CatalogError

```python
class CatalogError(ValueError):
```

继承自 `ValueError` 的专用异常,在 catalog 文件 TOML 非法、结构非法、校验失败、重复 provider 名等情况抛出,携带可读的 `source` 上下文信息。

### _CatalogCostTier

```python
class _CatalogCostTier(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    max_input_tokens: _PositiveInt | None = None
    input: _NonNegativeFloat
    output: _NonNegativeFloat
    cacheRead: _NonNegativeFloat
    cacheWrite: _NonNegativeFloat
```

pydantic 模型,表示一个按输入 token 分档的定价档位。`frozen=True, extra="forbid"` 表示实例不可变、且禁止未知字段。字段:`max_input_tokens` 为该档位的上限 token 数(最后一档必须为 `None` 表示无上限);`input`/`output`/`cacheRead`/`cacheWrite` 为该档位下的四种单价(非负浮点)。

### _CatalogModelMetadata

```python
class _CatalogModelMetadata(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    name / api / base_url / reasoning / input / cost / cost_tiers /
    context_window / max_tokens / headers / compat / thinking_level_map /
    unsupported_thinking_levels
```

pydantic 模型,描述单个模型在 catalog 中的元数据:`name`(展示名,可选)、`api`(ProviderApi,可选)、`base_url`、`reasoning`(是否推理模型)、`input`(支持的输入模态元组)、`cost`(简单单价字典)、`cost_tiers`(分档定价元组)、`context_window`/`max_tokens`(整数,可选)、`headers`/`compat`(字典)、`thinking_level_map`(思考级别→provider 特定字符串映射)、`unsupported_thinking_levels`(该模型不支持的思考级别元组)。

### _CatalogProvider

```python
class _CatalogProvider(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    name / display_name / kind / base_url / api_key_env / credential_name /
    models / default_model / docs_url / api / context_windows / headers /
    compat / model_metadata / thinking_levels / thinking_models /
    thinking_default / thinking_parameter / auth_methods
```

pydantic 模型,描述一个 provider 的完整目录条目。必填:`name`、`display_name`、`kind`(ProviderKind)、`base_url`、`api_key_env`、`models`(非空元组)、`default_model`、`docs_url`。可选:`credential_name`、`api`、`context_windows`、`headers`、`compat`、`model_metadata`(模型名→`_CatalogModelMetadata`)、思考相关四字段 `thinking_levels/thinking_models/thinking_default/thinking_parameter`、`auth_methods`(默认 `("api_key",)`)。`extra="forbid"` 保证 TOML 里任何未声明字段都会触发校验错误。

### _CatalogFile

```python
class _CatalogFile(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    schema_version: Literal[1]
    providers: tuple[_CatalogProvider, ...] = ()
```

pydantic 模型,代表一份完整 catalog 文件的根。`schema_version` 固定为 `Literal[1]`,`providers` 为 provider 元组(可空)。它是 `_entries_from_raw` 用 `model_validate` 校验整个 raw dict 的入口模型。

### builtin_catalog_resource_text

```python
def builtin_catalog_resource_text() -> str:
```

**作用**:读取打包在 `tau_coding/data/catalog.toml` 中的内置 catalog 文本。

**关键实现**:用 `importlib.resources.files("tau_coding").joinpath("data/catalog.toml").read_text(encoding="utf-8")` 取资源内容并返回。

### builtin_catalog

```python
@cache
def builtin_catalog() -> tuple[ProviderCatalogEntry, ...]:
```

**作用**:返回内置 provider catalog(已解析为 `ProviderCatalogEntry` 元组),结果以 `@cache` 进程内缓存。

**关键实现**:调用 `_builtin_raw()` 取原始 dict,再 `_entries_from_raw(..., source="built-in catalog.toml")` 校验并转换为条目元组。被 `effective_catalog`、`` provider_catalog.py:_load_builtin_catalog` 及 ``builtin_catalog_resource_text`/`_builtin_raw` 引用。

### user_catalog_path

```python
def user_catalog_path(paths: TauPaths | None = None) -> Path:
```

**作用**:返回用户级 catalog overlay 文件路径(`~/.tau/catalog.toml`)。

**关键实现**:`(paths or TauPaths()).home / USER_CATALOG_FILENAME`。`TauPaths.home` 即用户主目录下 `.tau` 目录。被 `effective_catalog`、`save_user_catalog_entries`、`cli.py` 多处引用。

### effective_catalog

```python
def effective_catalog(paths: TauPaths | None = None) -> tuple[ProviderCatalogEntry, ...]:
```

**作用**:返回"内置 catalog + 用户 `~/.tau/catalog.toml` overlay"合并后的最终条目,这是主流程实际使用的入口。

**关键实现**:
1. `path = user_catalog_path(paths)`。
2. 若文件不存在,直接返回 `builtin_catalog()`(最快路径,带缓存)。
3. 若存在,读取文本 `_parse_catalog_text(...)`,然后 `_validate_catalog_root(...)` 校验根结构。
4. `_merge_raw_catalogs(_builtin_raw(), overlay_raw)` 合并原始 dict。
5. `_entries_from_raw(merged, ...)` 校验并转换为条目返回。

### save_user_catalog_entries

```python
def save_user_catalog_entries(
    entries: Iterable[ProviderCatalogEntry],
    paths: TauPaths | None = None,
) -> Path:
```

**作用**:把一组 `ProviderCatalogEntry` upsert(按 name 覆盖或追加)进用户级 `catalog.toml`,原子写回,返回文件路径。

**关键实现**:
1. `path = user_catalog_path(paths)`。
2. 若文件存在:解析并 `_validate_catalog_root` 校验,取 `providers` 列表;否则初始化 `{"schema_version": ..., "providers": []}`。
3. 用 `_raw_provider_name` 建立 `name -> index` 索引。
4. 对每个 `entry`:`_raw_provider_from_entry(entry)` 转回 raw dict;若 name 已存在则原地替换,否则追加并记录新索引。
5. 组装 `updated` dict,`path.parent.mkdir(parents=True, exist_ok=True)`,然后 `_atomic_write_text(path, _catalog_to_toml(updated))` 写入。

调用关系:在 `provider_config.py:964` 保存用户新增/修改的 provider,以及 `tui/app.py:4330` 从 TUI 保存登录后得到的 catalog 条目时调用。

### _builtin_raw

```python
@cache
def _builtin_raw() -> dict[str, Any]:
```

**作用**:以 `@cache` 缓存的原始内置 catalog dict(已解析为 Python 对象),供 `effective_catalog` 与 `builtin_catalog` 复用,避免重复解析 TOML。

**关键实现**:`_parse_catalog_text(builtin_catalog_resource_text(), source="built-in catalog.toml")`。

### _parse_catalog_text

```python
def _parse_catalog_text(text: str, *, source: str) -> dict[str, Any]:
```

**作用**:把 TOML 文本解析为 dict,解析失败时抛出带 `source` 的 `CatalogError`。

**关键实现**:`tomllib.loads(text)`;捕获 `tomllib.TOMLDecodeError` 并包装为 `CatalogError(f"{source}: invalid TOML: {error}")`。

### _validate_catalog_root

```python
def _validate_catalog_root(raw: dict[str, Any], *, source: str) -> None:
```

**作用**:校验 catalog 根级别的合法性(只允许 `schema_version` 与 `providers` 两个顶层键、必须含正确 `schema_version`、`providers` 结构合法)。

**关键实现**:
1. `allowed = {"schema_version", "providers"}`;若 raw 有未知键,抛 `CatalogError` 列出未知键。
2. 缺 `schema_version` 抛错;其值不等于 `CATALOG_SCHEMA_VERSION` 抛 `unsupported schema_version` 错误。
3. 调用 `_raw_providers(raw)`(其内部也会校验 providers 是 dict 列表)确保 providers 结构正确。

### _merge_raw_catalogs

```python
def _merge_raw_catalogs(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
```

**作用**:把 overlay 的 provider 表合并到 base 之上,overlay 值优先;保留 base 中未被覆盖的 provider 并维持出现顺序。

**关键实现**:
1. 分别取 base/overlay 的 providers 列表。
2. 先遍历 base,按 `name` 存入 `by_name` 并记录 `order`。
3. 再遍历 overlay:若 name 已在 `by_name`,则 `_merge_raw_provider(旧, 新)` 深合并;否则直接加入 `by_name` 并追加 `order`。
4. 返回 `{"schema_version": overlay.get(..., base.get(...)), "providers": [按 order 顺序的 merged 列表]}`。

### _merge_raw_provider

```python
def _merge_raw_provider(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
```

**作用**:合并单个 provider 的两个 raw dict(overlay 覆盖 base 的标量字段),并对 `models`/`context_windows`/`headers`/`compat`/`model_metadata`/思考字段做专门合并。

**关键实现**:
1. `merged = {**base, **overlay}` —— 标量字段直接覆盖。
2. `models`:若两边都是 list,合并为 `[*overlay_models, *base_models]` 并用 `dict.fromkeys` 去重且保持 overlay 在前。
3. `context_windows`/`headers`/`compat`:若两边都是 dict,做 `{**base, **overlay}` 浅合并(overlay 胜)。
4. `model_metadata`:调用 `_merge_model_metadata` 递归合并。
5. 思考字段组:若 overlay 含 `thinking_levels`,则把 `_THINKING_FIELDS` 中出现在 overlay 的字段全部采用,未出现在 overlay 的则从 merged 中 `pop` 删除——实现"设置 thinking_levels 即整体替换四个思考字段"的语义。

### _merge_model_metadata

```python
def _merge_model_metadata(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
```

**作用**:逐模型合并 `model_metadata` 子表。

**关键实现**:
1. `merged = {**base}`。
2. 对 overlay 中每个 `(model, overlay_metadata)`:若 base 中对应值也是 dict,则 `next_metadata = {**base_metadata, **overlay_metadata}` 覆盖标量;再对 `headers`/`compat`/`thinking_level_map` 做 `{**base, **overlay}` 字典合并;否则直接采用 overlay 值。

### _raw_providers

```python
def _raw_providers(raw: dict[str, Any]) -> list[dict[str, Any]]:
```

**作用**:从根 raw dict 取出 `providers` 列表,并校验其为 dict 的数组(对应 TOML 的 `[[providers]]`)。

**关键实现**:`providers = raw.get("providers", [])`;若不是 list 或含非 dict 元素,抛 `CatalogError("catalog providers must be an array of tables ([[providers]])")`。

### _raw_provider_name

```python
def _raw_provider_name(provider: dict[str, Any]) -> str:
```

**作用**:取 provider raw dict 的 `name` 并校验非空字符串。

**关键实现**:`name = provider.get("name")`;不是 str 或空串则抛 `CatalogError`(要求非空字符串 name)。返回 `.strip()` 后的 name。

### _entries_from_raw

```python
def _entries_from_raw(raw: dict[str, Any], *, source: str) -> tuple[ProviderCatalogEntry, ...]:
```

**作用**:把 raw dict 经 pydantic 校验后转换为 `ProviderCatalogEntry` 元组,并检测重复 provider 名。

**关键实现**:
1. `_CatalogFile.model_validate(raw)`;失败则 `_format_validation_error` 包装为 `CatalogError`。
2. 对每个 `provider` 调用 `_entry_from_provider` 生成条目。
3. 收集所有 `entry.name`,若 `len(set(names)) != len(names)` 则抛 `CatalogError` 列出重复名。
4. 返回条目元组。

### _entry_from_provider

```python
def _entry_from_provider(provider: _CatalogProvider, *, source: str) -> ProviderCatalogEntry:
```

**作用**:把单个 `_CatalogProvider`(含其 `model_metadata`)转换为最终的 `ProviderCatalogEntry`,并在转换时做一致性校验。

**关键实现**:
1. 构造 `prefix = f"{source}: providers.{provider.name}"` 用于错误定位。
2. 校验 `default_model` ∈ `models`;每个 `thinking_models`/`context_windows` 键/`model_metadata` 键 ∈ `models`(否则抛 `CatalogError`)。
3. 若 `thinking_default` 非 None 但不在 `thinking_levels` 中,抛错。
4. 对每个 model 的 `cost_tiers` 调 `_validate_cost_tiers` 校验。
5. 用 `_model_metadata_from_provider` 把每个 `_CatalogModelMetadata` 转为 `ModelCatalogMetadata`,并放进 `context_windows`(模型 metadata 里的 `context_window` 会补充到 provider 级 `context_windows`)。
6. 构造并返回 `ProviderCatalogEntry`(含 thinking 四字段、`auth_methods` 等)。

### _validate_cost_tiers

```python
def _validate_cost_tiers(tiers, *, field_name: str) -> None:
```

**作用**:校验分档定价的合法性——最后一档必须无上限、各档上限必须严格递增。

**关键实现**:
1. 空 tiers 直接返回。
2. 若 `tiers[-1].max_input_tokens is not None`,抛 `CatalogError`(末档必须省略上限)。
3. 遍历除末档外的每档:上限必须为非 None 且严格大于 `previous_limit`,否则抛 `must be strictly increasing` 错误;更新 `previous_limit`。

### _model_metadata_from_provider

```python
def _model_metadata_from_provider(metadata: _CatalogModelMetadata) -> ModelCatalogMetadata:
```

**作用**:把单个 `_CatalogModelMetadata` 转为运行时用的 `ModelCatalogMetadata`,并把 `unsupported_thinking_levels` 折叠进 `thinking_level_map`(置为 `None`)。

**关键实现**:
1. `thinking_level_map = dict(metadata.thinking_level_map)`;对 `unsupported_thinking_levels` 中每个 level 置 `thinking_level_map[level] = None`(None 表示不支持)。
2. 把 `cost_tiers` 逐档转为 `ModelCostTier`(把 `input`/`output`/`cacheRead`/`cacheWrite` 折叠进 `cost` dict)。
3. `compat` 经 `_json_object` 规范化;返回 `ModelCatalogMetadata`。

### _json_object

```python
def _json_object(value: Mapping[str, Any], field_name: str) -> dict[str, JSONValue]:
```

**作用**:把任意 dict 递归规范化为 JSON 安全的 `dict[str, JSONValue]`,用于 `compat` 等自由结构字段。

**关键实现**:对每个 `(key, item)` 调 `_json_value` 递归转换并收集。

### _json_value

```python
def _json_value(value: Any, field_name: str) -> JSONValue:
```

**作用**:递归地把单个值规范化为 JSON 兼容类型。

**关键实现**:
- `None`/基础标量 → 直接返回。
- `list` → 逐项 `_json_value`。
- `dict` → 键必须为 str(否则 `CatalogError`),值递归;其余类型抛 `CatalogError(unsupported value)`。

### _format_validation_error

```python
def _format_validation_error(raw: dict[str, Any], error: ValidationError) -> str:
```

**作用**:把 pydantic 的 `ValidationError` 折叠为可读、可定位的单行错误串。

**关键实现**:对每个 issue,用 `_dotted_location(raw, issue["loc"])` 把 (providers, idx, field) 转成 `.` 分隔路径,拼接 `location: msg`,用 `"; "` 连接。

### _dotted_location

```python
def _dotted_location(raw: dict[str, Any], location: tuple[int | str, ...]) -> list[str]:
```

**作用**:把 pydantic 错误位置元组转成带 provider 名的路径片段列表,使错误更易读。

**关键实现**:遍历 location,遇到 `("providers", <int>)` 时从 raw 的 providers 列表按下标取出该 provider 的 `name` 替换数字下标;其余部分直接 `str()`。

### _raw_provider_from_entry

```python
def _raw_provider_from_entry(entry: ProviderCatalogEntry) -> dict[str, Any]:
```

**作用**:把运行时的 `ProviderCatalogEntry` 反向序列化为可写回 TOML 的 raw dict(用于 `save_user_catalog_entries`)。

**关键实现**:先填必填字段;再根据 `is not None`/`if 值` 条件追加可选字段(`api`、`credential_name`、`context_windows`、`headers`、`compat`、`model_metadata`、`thinking_*`、`auth_methods` 若非默认值)。

### _raw_model_metadata_from_entry

```python
def _raw_model_metadata_from_entry(metadata: ModelCatalogMetadata) -> dict[str, Any]:
```

**作用**:把 `ModelCatalogMetadata` 反向序列化为 raw dict。

**关键实现**:按字段条件填充;特别地,把 `thinking_level_map` 中值为 `None` 的项提取成 `unsupported_thinking_levels` 列表,非 None 的项保留为 `thinking_level_map`(与正向读取 `_model_metadata_from_provider` 互逆)。

### _catalog_to_toml

```python
def _catalog_to_toml(raw: dict[str, Any]) -> str:
```

**作用**:把合并/更新后的 raw catalog dict 渲染为 TOML 文本字符串。

**关键实现**:
1. 首行写 `schema_version`。
2. 对每个 provider 写 `[[providers]]`,按固定键顺序写标量字段(经 `_toml_value` 渲染)。
3. 若有 `context_windows`,写 `[providers.context_windows]` 子表。
4. 若有 `model_metadata`,逐模型写 `[providers.model_metadata.<model>]` 子表(含其所有键值)。
5. 用 `"\n".join(lines).rstrip() + "\n"` 收尾。

### _toml_key

```python
def _toml_key(value: str) -> str:
```

**作用**:为 TOML 键做转义——合法裸键直接返回,否则用 JSON 字符串引用。

**关键实现**:若 value 去掉 `_`/`-` 后是字母数字且首字符非数字,返回原值;否则 `json.dumps(value)`。

### _toml_value

```python
def _toml_value(value: object) -> str:
```

**作用**:把 Python 值渲染为 TOML 字面量文本。

**关键实现**:str→JSON 字符串;bool→`true`/`false`;int/float→`str`;list/tuple→方括号逗号列表;dict→`{ key = value, ... }`(键经 `_toml_key`);其余抛 `TypeError`。

### _atomic_write_text

```python
def _atomic_write_text(path: Path, text: str) -> None:
```

**作用**:把文本原子地写入 `path`(先写临时文件再 `replace`),避免半写文件损坏。

**关键实现**:在 `path.parent` 下用 `NamedTemporaryFile`(前缀 `.{name}.`、后缀 `.tmp`、`delete=False`)写内容并 flush;然后 `temp_path.replace(path)` 原子替换;任何异常时 `suppress(OSError)` 删除临时文件后重新抛出。

### 思考级别如何被 catalog 与主流程串联

`catalog_loader` 在解析 `_CatalogProvider` 时携带 `thinking_levels`(该 provider 支持的级别)、`thinking_models`、`thinking_default`、`thinking_parameter`(用哪个请求参数名)。这些字段经 `_entry_from_provider` 进入 `ProviderCatalogEntry`,再经 `provider_config.provider_thinking_levels` / `provider_default_thinking_level`(均委托 `provider_catalog` 的 `thinking_level_map` 等)被 `session.py` 的 `available_thinking_levels` 属性消费,最终驱动 `thinking.py` 的 `normalize_thinking_level` / `next_thinking_level` 等函数。`provider_runtime.py` 在发起请求时,又用 `reasoning_effort_for_level` / `anthropic_thinking_budget_for_level` 把会话当前的思考级别翻译为具体 provider 参数。

---

## 文件:branch_summary.py

该模块用于"当会话在会话树(session tree)的多个分支间切换时,把被放弃(abandoned)的分支对话用模型浓缩成一段结构化摘要",以便主流程把摘要作为上下文注入回当前分支。全部逻辑围绕 `_serialize_branch_conversation` 把消息截取到预算内、`summarize_branch_messages_with_model` 调用模型、最后附加上该分支读写过的文件清单。

### 模块级常量与 prompt

- `BRANCH_SUMMARY_SYSTEM_PROMPT`:系统提示词,要求模型只产出"对话分支的结构化摘要",不要继续对话或回答问题。
- `BRANCH_SUMMARY_PREAMBLE`:注入回上下文时的引导语("用户在此前探索了另一条分支……该探索的摘要:")。
- `BRANCH_SUMMARY_PROMPT`:要求模型严格按固定 Markdown 模板(Goal / Constraints & Preferences / Progress{Done,In Progress,Blocked} / Key Decisions / Next Steps)输出的用户提示词。
- `MAX_SUMMARY_SOURCE_MESSAGE_CHARS = 4_000`:单条消息内容的最大字符数(超出截断)。
- `MAX_SUMMARY_SOURCE_TOTAL_CHARS = 60_000`:整段对话序列化的总字符预算(超出则丢弃剩余消息)。
- `TOOL_RESULT_MAX_CHARS = 2_000`:工具结果的单独截断上限。

### summarize_branch_messages_with_model

```python
async def summarize_branch_messages_with_model(
    *, provider: ModelProvider, model: str,
    messages: Sequence[AgentMessage],
    custom_instructions: str | None = None,
    replace_instructions: bool = False,
) -> str | None:
```

**作用**:用指定 `provider`/`model` 生成被放弃分支的结构化摘要;任何失败(无消息、模型报错、空响应)都返回 `None` 而非抛异常。

**关键实现**:
1. 若 `messages` 为空,直接 `return None`。
2. 构造请求:system 为 `BRANCH_SUMMARY_SYSTEM_PROMPT`,messages 为单个 `UserMessage`(内容为 `_branch_summary_prompt(...)`),`tools=[]`(禁止工具调用)。
3. `async for event in provider.stream_response(...)` 消费流式事件:遇 `ProviderErrorEvent` → 返回 `None`;遇 `ProviderResponseEndEvent` → 记录 `response = event.message`。
4. 若无 `response` 或 `response.content.strip()` 为空,返回 `None`。
5. 否则对摘要调 `_add_branch_summary_context(summary, messages)`,附加读/写文件清单后返回。

调用关系:`session.py:1829` 在切换/放弃分支时 `await summarize_branch_messages_with_model(...)` 生成摘要并写入分支上下文;它依赖 `tau_ai` 的 `ModelProvider`/`ProviderErrorEvent`/`ProviderResponseEndEvent`。

### _branch_summary_prompt

```python
def _branch_summary_prompt(
    messages: Sequence[AgentMessage], *,
    custom_instructions: str | None = None,
    replace_instructions: bool = False,
) -> str:
```

**作用**:拼装发送给模型的完整用户提示——对话内容 + 指令。

**关键实现**:`_serialize_branch_conversation(messages)` 得到对话文本;按规则选择指令:
- `replace_instructions and custom_instructions` → 用自定义指令完全替换默认模板;
- 仅 `custom_instructions` → 默认模板 + `"\n\nAdditional focus: ..."`;
- 否则用 `BRANCH_SUMMARY_PROMPT`。
最后返回 `<conversation>\n{conversation}\n</conversation>\n\n{instructions}`。

### _serialize_branch_conversation

```python
def _serialize_branch_conversation(messages: Sequence[AgentMessage]) -> str:
```

**作用**:把消息序列渲染为文本,受总字符预算 `MAX_SUMMARY_SOURCE_TOTAL_CHARS` 约束,超出则截断剩余消息并加省略说明。

**关键实现**:
1. 遍历消息(从 1 开始编号),`_format_summary_source_message` 渲染每条。
2. 若当前条渲染后长度超过 `remaining_chars`,则 `omitted_count = 剩余消息数`,`break`。
3. 否则追加并扣减 `remaining_chars`。
4. 若有 omitted,追加 `"[... N message(s) omitted because the branch was too long]"`。
5. 用 `"\n\n".join(parts)` 连接返回。

### _format_summary_source_message

```python
def _format_summary_source_message(message: AgentMessage) -> str:
```

**作用**:按消息类型把一条 `AgentMessage` 渲染成摘要源文本。

**关键实现**:用 `match` 分派:
- `UserMessage` → `"[User]: {_trim_summary_source_text(content)}"`。
- `AssistantMessage` → 转 `_format_assistant_summary_source`。
- `ToolResultMessage` → `"[Tool result: {name} ({ok|failed})]: {截断后的 content}"`(`ok` 决定 status 文案)。
- 其它类型无分支(该 match 覆盖了全部消息类型)。

### _format_assistant_summary_source

```python
def _format_assistant_summary_source(message: AssistantMessage) -> str:
```

**作用**:专门渲染助手消息:文本 + 工具调用摘要。

**关键实现**:
1. `_trim_summary_source_text(message.content)` 得文本;若非 `"(empty)"` 则加 `"[Assistant]: {content}"`。
2. 若 `message.tool_calls` 非空,把每个调用格式化为 `"{name}({参数})"`(参数经 `_format_tool_call_arguments`),拼成 `"[Assistant tool calls]: a; b"`。
3. 若两部分都为空,返回 `"[Assistant]: (empty)"`。

### _format_tool_call_arguments

```python
def _format_tool_call_arguments(arguments: Mapping[str, object]) -> str:
```

**作用**:把工具调用参数字典渲染为 `key=json` 形式、按键排序的字符串。

**关键实现**:`", ".join(f"{key}={json.dumps(value, sort_keys=True)}" for key, value in sorted(arguments.items()))`。

### _trim_summary_source_text

```python
def _trim_summary_source_text(
    text: str, *, max_chars: int = MAX_SUMMARY_SOURCE_MESSAGE_CHARS,
) -> str:
```

**作用**:把单条源文本截断到 `max_chars`(默认 4000),空文本替换为 `"(empty)"`。

**关键实现**:`text.strip() or "(empty)"`;若长度 ≤ `max_chars` 直接返回;否则返回 `前缀.rstrip() + "\n\n[... {超出字符数} more characters truncated]"`。

### _add_branch_summary_context

```python
def _add_branch_summary_context(summary: str, messages: Sequence[AgentMessage]) -> str:
```

**作用**:在模型生成的摘要前加引导语,并附加上该分支读/写过的文件清单,形成最终注入上下文的文本。

**关键实现**:
1. `read_files, modified_files = _branch_file_operations(messages)`。
2. `sections = [BRANCH_SUMMARY_PREAMBLE + summary]`。
3. 若 `read_files` 非空,追加 `<read-files>\n...\n</read-files>`。
4. 若 `modified_files` 非空,追加 `<modified-files>\n...\n</modified-files>`。
5. `"\n\n".join(sections)` 返回。

### _branch_file_operations

```python
def _branch_file_operations(messages: Sequence[AgentMessage]) -> tuple[list[str], list[str]]:
```

**作用**:扫描分支全部消息的工具调用,提取"只读文件"与"被修改文件"两个去重有序列表。

**关键实现**:
1. 遍历消息,仅处理 `AssistantMessage` 的工具调用。
2. 取 `call.arguments.get("path")`,非字符串或空则跳过。
3. `call.name == "read"` → 加入 `read` 集合;`call.name in {"edit", "write"}` → 加入 `modified` 集合。
4. 返回 `(sorted(read - modified), sorted(modified))`——只读文件排除掉被修改的,使两类清单互斥且无重复。

---

## 文件:diagnostics.py

该模块提供结构化、机器可解析的失败诊断日志。每次 agent 调用分配一个 `run_id`,失败时把上下文( provider/model/cwd/session/run )、阶段(phase)、以及异常或错误事件以单行 JSON 追加到 `~/.tau/agent_calls.log`(JSONL),供后续排障。设计目标是"绝不泄露密钥",只记录非敏感字段。

### AgentCallDiagnosticContext

```python
@dataclass(frozen=True, slots=True)
class AgentCallDiagnosticContext:
    provider_name: str
    model: str
    cwd: Path
    session_id: str | None
    run_id: str
```

不可变(`frozen`)、带 `__slots__` 的诊断上下文数据类。字段逐一说明:
- `provider_name: str`——产生该次调用的 provider 名称。
- `model: str`——使用的模型名。
- `cwd: Path`——当前工作目录(用于定位会话发生的项目位置)。
- `session_id: str | None`——所属会话 id(可能为 None,例如尚未建立会话)。
- `run_id: str`——单次 agent 调用的唯一标识(由 `new_agent_call_run_id` 生成),用于把同一次调用产生的多条诊断关联起来。

### AgentCallDiagnosticLogger

```python
class AgentCallDiagnosticLogger:
```

**作用**:面向 `agent_calls.log` 的 JSONL 诊断日志追加器,把失败条目以结构体形式落盘。

#### __init__

```python
def __init__(self, path: Path) -> None:
```

**作用**:用日志文件路径构造 logger。

**关键实现**:仅 `self.path = path` 保存目标路径。

#### from_paths

```python
@classmethod
def from_paths(cls, paths: TauPaths | None = None) -> AgentCallDiagnosticLogger:
```

**作用**:工厂方法,使用 Tau 默认路径布局创建 logger。

**关键实现**:`return cls((paths or TauPaths()).agent_calls_log_path)`——取 `TauPaths` 的 `agent_calls_log_path`(即 `~/.tau/agent_calls.log`)作为落盘位置。

#### log_exception

```python
def log_exception(self, *, context: AgentCallDiagnosticContext, phase: str, exc: BaseException) -> Path:
```

**作用**:记录一次未预期异常(含完整 traceback),返回日志路径。

**关键实现**:
1. `_base_entry(context, phase=phase, kind="exception")` 生成基础字段。
2. 在 entry 上加 `"exception"` 字段:`type`(异常类名)、`message`(`str(exc)`)、`traceback`(`"".join(traceback.format_exception(...))` 完整栈)。
3. `self._append(entry)` 写入,返回 `self.path`。

#### log_error_event

```python
def log_error_event(self, *, context: AgentCallDiagnosticContext, phase: str, event: ErrorEvent) -> Path:
```

**作用**:记录一次来自 provider 的 `ErrorEvent`(agent 错误事件),只纳入"安全"的诊断字段。

**关键实现**:
1. `_base_entry(context, phase=phase, kind="error_event")`。
2. 加 `"error"` 字段:`message`(`event.message`)、`recoverable`(`event.recoverable` 布尔);若 `event.data is not None` 则附上 `data`(这是 provider 自己判定可公开的诊断数据,不含密钥)。
3. `self._append(entry)`,返回路径。

#### _append

```python
def _append(self, entry: dict[str, Any]) -> None:
```

**作用**:把单条诊断 entry 以 JSONL 形式原子追加到日志文件。

**关键实现**:`self.path.parent.mkdir(parents=True, exist_ok=True)` 确保目录存在;以 `"a"` 模式打开,`file.write(json.dumps(entry, sort_keys=True) + "\n")`——`sort_keys=True` 保证字段顺序稳定便于 diff。

### new_agent_call_run_id

```python
def new_agent_call_run_id() -> str:
```

**作用**:为一次 coding-session 的 agent 调用生成稳定的唯一 id。

**关键实现**:`return uuid4().hex`——32 位十六进制随机串。在 `session.py:1539` 每次发起 agent 调用前生成并存入 `AgentCallDiagnosticContext.run_id`,从而把同一次调用中多处失败(异常/错误事件)通过 `run_id` 关联。

### _base_entry

```python
def _base_entry(context: AgentCallDiagnosticContext, *, phase: str, kind: str) -> dict[str, Any]:
```

**作用**:构造所有诊断条目的公共基础字段(时间戳 + 上下文 + 分类)。

**关键实现**:返回固定字段字典:
- `"timestamp"`:`datetime.now(UTC).isoformat()`(UTC、ISO8601)。
- `"kind"`:`kind`(`"exception"` 或 `"error_event"`)。
- `"phase"`:调用阶段标识(由调用方传入,如请求构造、流式读取等阶段)。
- `"run_id"`/`"session_id"`/`"provider_name"`/`"model"`/`"cwd"`:直接来自 `context`(cwd 转 `str`)。

### 主流程如何采集与落盘诊断

- `session.py:275` 在构造 `CodingSession` 时执行 `self._diagnostic_logger = AgentCallDiagnosticLogger.from_paths(self._resource_paths.paths)`,使整个会话共享一个 logger。
- `session.py:1539` 在每次 agent 调用前 `run_id = new_agent_call_run_id()`,连同 provider/model/cwd/session_id 组装成 `AgentCallDiagnosticContext`。
- 在 agent 循环的多处异常/错误捕获点(如 `session.py:1426/1462/1486/1497/1517/1526/1665/1685/1703` 等),调用 `self._diagnostic_logger.log_exception(...)` 或 `log_error_event(...)`,把返回的日志路径存入 `self._last_diagnostic_log_path`,最终会在 UI/CLI 的失败提示中告知用户"诊断信息已写入 <path>",便于排障而无需暴露任何密钥。

---

## 四个支撑模块在主流程中的协作总览

1. **`catalog_loader` → `provider_config`/`provider_runtime`**:`effective_catalog()` 是配置层唯一数据源;它产出的 `ProviderCatalogEntry` 经 `provider_config` 转成运行时 provider 配置,其中的思考字段(`thinking_levels` 等)再被 `tau_coding.thinking` 的映射函数消费。
2. **`thinking` → `session`/`tui`/`cli`**:`normalize_thinking_level`、`next_thinking_level`、`reasoning_effort_for_level`、`anthropic_thinking_budget_for_level` 把 UI 选择的抽象级别翻译为 provider 请求参数;`session.py` 的 `available_thinking_levels`/`set_thinking_level`/`cycle_thinking_level` 是 UI(TUI `app.py:_set_thinking_level`/`_cycle_thinking_level`、CLI `commands.py` 的 `/thinking`)与底层映射函数之间的桥梁。
3. **`branch_summary` → `session`**:`summarize_branch_messages_with_model` 在会话树分支切换/放弃时被 `session.py` 调用,把分支对话浓缩成带文件清单的上下文,回注当前分支,从而保留"探索历史"而不必重放全部消息。
4. **`diagnostics` → `session`**:`AgentCallDiagnosticLogger` 由会话持有,在 agent 调用的各个失败阶段记录结构化 JSONL 诊断,关联 `run_id`,为 CLI/TUI 的失败反馈提供可排查、无密钥的落盘日志。

---

<!-- NAV -->
[← tau_coding · 扩展系统]({{< relref "./coding-extensions.md" >}})
[↑ 总览]({{< relref "./source-walkthrough.md" >}})
[→ tau_coding · 支撑模块(二)]({{< relref "./coding-support-2.md" >}})
