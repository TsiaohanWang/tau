# CLI:把错误的 `--model` 呈现为清晰的错误 / CLI: surface bad `--model` as a clean error (issue #265)

## 变更内容(What changed)

[原文]
`tau --model <bad-model>` no longer crashes with an `anyio`/`asyncio` traceback
when the model is not declared by the selected provider. Two `except` handlers in
`src/tau_coding/cli.py` were broadened from `RuntimeError` to
`(RuntimeError, ValueError)`:

[译文]
当所选 provider 未声明某个模型时,`tau --model <bad-model>` 不再以 `anyio`/`asyncio` 回溯崩溃。`src/tau_coding/cli.py` 中的两个 `except` 处理器已从 `RuntimeError` 拓宽为 `(RuntimeError, ValueError)`:

[原文]
- the **TUI** startup branch (`main()` → `anyio.run(run_openai_tui, …)`), and
- the **print-mode** branch (`main()` → `anyio.run(run_openai_print_mode, …)`).

[译文]
- **TUI** 启动分支(`main()` → `anyio.run(run_openai_tui, …)`),以及
- **print 模式**分支(`main()` → `anyio.run(run_openai_print_mode, …)`)。

[原文]
`ProviderConfigError(ValueError)` is raised by `validate_provider_model()` deep
inside the event loop (via `resolve_provider_selection()` →
`_resolve_tui_startup_selection()` / `run_openai_print_mode`). Because the
handlers only caught `RuntimeError`, the `ValueError` subclass escaped as an
unhandled exception and printed a multi-frame traceback. Catching `ValueError`
lets `typer.BadParameter` surface the existing, friendly message verbatim:

[译文]
`ProviderConfigError(ValueError)` 由事件循环深处的 `validate_provider_model()` 抛出(经由 `resolve_provider_selection()` → `_resolve_tui_startup_selection()` / `run_openai_print_mode`)。由于这些处理器只捕获 `RuntimeError`,这个 `ValueError` 子类作为未处理异常逃逸,并打印出多帧回溯。捕获 `ValueError` 后,`typer.BadParameter` 得以原样呈现既有的友好消息:

[原文]
> Invalid value: Model is not configured for provider local: llama. Available
> models: qwen

[译文]
> Invalid value: Model is not configured for provider local: llama. Available
> models: qwen

[原文]
The `export` command in the same file already used the correct pattern
(`except (RuntimeError, ValueError)`) and served as the reference.

[译文]
同一文件中的 `export` 命令早已使用正确模式(`except (RuntimeError, ValueError)`),成为了参照。

## 为什么需要它(Why it exists)

[原文]
Reported in https://github.com/huggingface/tau/issues/265. The provider catalog
is intentionally provider-specific, so an unknown/typo'd model name is a common
user error. The actionable message (which lists the valid models for the
provider) already existed in `provider_config.validate_provider_model`; it just
wasn't being surfaced cleanly through the CLI entry points.

[译文]
由 https://github.com/huggingface/tau/issues/265 报告。Provider 目录有意按 provider 区分,因此未知/拼错的模型名是常见的用户错误。那条可操作的消息(列出该 provider 的合法模型)早已存在于 `provider_config.validate_provider_model` 中;它只是没能干净地经由 CLI 入口呈现出来。

[原文]
This keeps the validation logic in `provider_config.py` as the single source of
truth for the message and restores parity across all `--model` entry points
(TUI, print mode, and export).

[译文]
这使 `provider_config.py` 中的校验逻辑继续作为该消息的唯一事实来源,并恢复了所有 `--model` 入口(TUI、print 模式与 export)之间的一致性。

## 与设计的对应关系(How it maps to the design)

[原文]
This is a pure CLI-layer fix. It does not touch:

[译文]
这是纯 CLI 层的修复。它不触及:

[原文]
- the portable agent harness (`tau_agent`),
- the provider/model streaming layer (`tau_ai`), or
- the Textual TUI rendering.

[译文]
- 可移植 agent harness(`tau_agent`),
- provider/模型流式层(`tau_ai`),或
- Textual TUI 渲染。

[原文]
The validation itself already lives in `tau_coding.provider_config`; only the
CLI's error boundary was wrong. This is consistent with the architecture
principle that CLI error handling should consume errors from the lower layers
rather than letting them leak as raw tracebacks.

[译文]
校验本身早已位于 `tau_coding.provider_config`;出错的只是 CLI 的错误边界。这符合架构原则:CLI 的错误处理应当消费来自更低层的错误,而不是让它们以原始回溯的形式泄漏出去。

## 如何测试(How to test)

[原文]
Regression tests (verified to fail before the fix and pass after):

[译文]
回归测试(已验证修复前失败、修复后通过):

```bash
uv run pytest tests/test_cli.py -k "bad_model" -v
```

[原文]
- `test_tui_surfaces_bad_model_as_clean_error`
- `test_print_mode_surfaces_bad_model_as_clean_error`

[译文]
- `test_tui_surfaces_bad_model_as_clean_error`
- `test_print_mode_surfaces_bad_model_as_clean_error`

[原文]
Both monkeypatch `load_provider_settings` (in both the `cli` and `tui.app`
namespaces, since each imports it) to return a provider whose only model is
`qwen`, then invoke the CLI runner with `--model llama --provider local` (TUI)
and with `-p hello` added (print mode). They assert `exit_code == 2` (Typer's
`BadParameter` convention) and that the output panel contains
`"Model is not configured for provider local: llama. Available models: qwen"`.

[译文]
两者都会 monkeypatch `load_provider_settings`(同时 patch `cli` 与 `tui.app` 两个命名空间,因为它们各自导入了它),让它返回一个只有 `qwen` 一个模型的 provider,然后分别以 `--model llama --provider local`(TUI)与额外加上 `-p hello`(print 模式)调用 CLI runner。它们断言 `exit_code == 2`(Typer 的 `BadParameter` 约定),并断言输出面板包含 `"Model is not configured for provider local: llama. Available models: qwen"`。

[原文]
Full suite:

[译文]
完整套件:

```bash
uv run pytest -q
uv run ruff check src/tau_coding/cli.py tests/test_cli.py
uv run ruff format --check src/tau_coding/cli.py tests/test_cli.py
```

## 备注/后续项(Notes / follow-ups)

[原文]
- The original issue draft incorrectly claimed the print-mode path already
  handled `ValueError`; that `except (RuntimeError, ValueError)` snippet was
  actually from the `export` command. Empirical reproduction confirmed
  print-mode was *also* broken, so both paths were fixed together.
- A larger follow-up (not in scope here): audit remaining `anyio.run(...)` call
  sites and extract a shared error-handling helper so all entry points use one
  handler and cannot drift apart again. Pre-loop validation (resolving the
  provider/model before entering the event loop) is another optional polish.

[译文]
- 最初的 issue 草稿错误地声称 print 模式路径已经处理 `ValueError`;那段 `except (RuntimeError, ValueError)` 代码其实来自 `export` 命令。实际复现确认 print 模式**同样**有问题,因此两条路径一起修复。
- 更大的后续项(不在本次范围内):审计剩余的 `anyio.run(...)` 调用点,并抽取一个共享的错误处理辅助函数,使所有入口共用同一个处理器,不会再各自漂移。进入事件循环之前先做预校验(先解析 provider/模型)是另一个可选的打磨项。
