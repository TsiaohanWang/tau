# 机器安全的 print 模式会话 id / Machine-safe print-mode session ids

[原文]
Issue #499 asks how an orchestrator can record the durable Tau session created
for a print-mode worker without parsing human output or searching the session
index.

[译文]
Issue #499 提出的问题是:编排器如何在不解析人类可读输出、也不搜索会话索引的情况下,记录为某个 print 模式 worker 创建的持久化 Tau 会话?

## Pi 调研(Pi investigation)

[原文]
Pi was inspected at `earendil-works/pi` commit
`47ca25fcd8535b80710fad5be758f1f2cf81443c`. Its CLI exposes:

[译文]
对 `earendil-works/pi` 的提交 `47ca25fcd8535b80710fad5be758f1f2cf81443c` 做了检查。它的 CLI 暴露:

```text
--session-id <id>  Use exact project session ID, creating it if missing
```

[原文]
Pi validates ids as file-safe names. If the id already exists in the project,
Pi opens that session; otherwise it warns and creates it. This means automation
can generate a unique id before launching Pi and already knows the exact id
without consuming another output channel.

[译文]
Pi 会把 id 校验为文件安全的名字。如果该 id 在项目中已存在,Pi 会打开该会话;否则它会发出警告并创建。这意味着自动化可以在启动 Pi 之前生成一个唯一 id,并且无需占用另一个输出通道就已知道确切的 id。

## Tau 的设计(Tau design)

[原文]
Tau now follows Pi's option name and caller-selected-id approach:

[译文]
Tau 现在遵循 Pi 的选项名与「调用方选择 id」的做法:

```bash
tau --print --new-session --session-id worker-01 "..."
```

[原文]
The option is intentionally scoped to print mode because Tau already uses
`--session` for TUI resume behavior and issue #499 concerns isolated workers.
Tau also refuses an existing id instead of resuming it. This small semantic
difference protects the existing guarantee that every Tau print invocation
creates an isolated session and prevents an orchestrator typo or collision from
appending to another worker's transcript.

[译文]
该选项有意限定于 print 模式,因为 Tau 已经把 `--session` 用于 TUI 的恢复行为,而 issue #499 关注的是彼此隔离的 worker。Tau 还会拒绝已存在的 id,而不是恢复它。这处小的语义差异保护了既有的保证:每次 Tau print 调用都会创建一个隔离会话,并防止编排器的拼写错误或碰撞追加到另一个 worker 的会话记录中。

[原文]
No id is written to stdout or stderr. Text, JSON, and transcript rendering are
therefore unchanged. The caller should generate a unique id (for example, a
UUID), pass it to Tau, record it beside the worker report, and use the process
exit status to determine whether startup/the model turn succeeded.

[译文]
不会有任何 id 写入 stdout 或 stderr。因此文本、JSON 与会话记录渲染都不变。调用方应生成一个唯一 id(例如 UUID),把它传给 Tau,并记录在 worker 报告旁边,再用进程退出状态判断启动/模型轮次是否成功。

[原文]
Custom ids start with Pi's validation rule: alphanumeric characters plus `.`,
`_`, and `-`, beginning and ending with an alphanumeric character. Tau adds a
128-byte limit so every accepted id leaves room for the `.jsonl` suffix on
common filesystems. It also rejects `index`, `default`, and the current project's
dynamic default-session id because those names overlap session metadata or the
TUI's default transcript.

[译文]
自定义 id 从 Pi 的校验规则开始:允许字母数字字符以及 `.`、`_`、`-`,并且必须以字母数字字符开头和结尾。Tau 增加了 128 字节的上限,使每个被接受的 id 在常见文件系统上都留出 `.jsonl` 后缀的空间。它还拒绝 `index`、`default` 以及当前项目的动态默认会话 id,因为这些名字与会话元数据或 TUI 的默认会话记录重叠。

[原文]
Validation happens before provider/resource startup where it does not require
project context. Print-session creation then exclusively creates the transcript
before indexing it. This filesystem reservation makes an orphaned transcript or
two concurrent workers requesting the same id fail without overwriting; an
indexing failure removes the new reservation. Failures later in startup or
during the model turn retain the same requested id and normal non-zero exit
behavior, so diagnostics can inspect the session if it reached durable
initialization.

[译文]
在不依赖项目上下文的情况下,校验发生在 provider/资源启动之前。随后 print 会话创建会以独占方式创建会话记录,然后再为它建立索引。这种文件系统层面的预留使「孤立的会话记录」或「两个并发 worker 请求同一 id」在不会覆盖的情况下失败;索引失败会移除新的预留。启动稍后阶段或模型轮次期间的失败会保留所请求的同一个 id,并保持正常的非零退出行为,因此如果会话达到了持久化初始化阶段,诊断可以检查它。

## 测试(Testing)

[原文]
`tests/test_cli.py` covers all output modes, validation, print-only use, exact id
creation, and indexed collisions. `tests/test_session_manager.py` verifies the
filename safety and length rules, reserved ids, orphan handling, atomic
same-id concurrency, and reservation rollback at the persistence boundary.

[译文]
`tests/test_cli.py` 覆盖所有输出模式、校验、仅限 print 的使用、精确 id 创建与索引碰撞。`tests/test_session_manager.py` 在持久化边界上验证文件名安全与长度规则、保留 id、孤儿处理、同 id 并发下的原子性,以及预留回滚。
