# 前向兼容的用户配置 / Forward-compatible user configuration

## 变更内容(What changed)

[原文]
Tau now ignores fields it does not recognize in user-level runtime settings:

[译文]
Tau 现在会忽略用户级运行时设置中它不认识的字段:

[原文]
- top-level settings and nested keybinding actions in `~/.tau/tui.json`;
- fields in `~/.tau/settings.json`;
- top-level settings and nested provider-preference fields in
  `~/.tau/providers.json`.

[译文]
- `~/.tau/tui.json` 中的顶层设置与嵌套的键位动作;
- `~/.tau/settings.json` 中的字段;
- `~/.tau/providers.json` 中的顶层设置与嵌套的 provider 偏好字段。

[原文]
Recognized fields are still validated exactly as before. Invalid known values,
malformed objects, empty known key strings, conflicting shell-prefix aliases,
and duplicate assignments among known TUI actions remain configuration errors.

[译文]
已识别的字段仍按原有方式严格校验。非法的已知取值、畸形对象、为空的已知按键字符串、冲突的 shell 前缀别名,以及已知 TUI 动作之间的重复赋值,仍然是配置错误。

## 为什么(Why)

[原文]
These JSON files are user-level state and can be shared by multiple Tau
installations. A newer Tau release may add a setting and write it to one of
those files. Previously, starting an older release could then fail before
opening the TUI with an error such as:

[译文]
这些 JSON 文件是用户级状态,可能被多个 Tau 安装实例共享。较新的 Tau 版本可能新增一个设置并把它写入这些文件之一。过去,在这种情况下启动较旧版本,可能在打开 TUI 之前就失败,并报出类似这样的错误:

```text
Unknown TUI settings field: turn_notification
```

[原文]
Each parser now consumes the fields its version understands and ignores future
metadata. This follows the compatibility principle already used by session
index records (`extra="ignore"`), credential object fields, unknown top-level
provider settings, and orphaned provider preferences.

[译文]
现在每个解析器只消费它这个版本能理解的字段,并忽略未来的元数据。这遵循了 Tau 已在多处使用的兼容原则:会话索引记录(`extra="ignore"`)、凭据对象字段、未知的顶层 provider 设置,以及孤立的 provider 偏好。

[原文]
Unknown fields are not part of the parsed settings models and therefore are not
emitted if that older version later rewrites a settings file. This change
protects startup compatibility; it does not make older releases understand or
preserve newer features.

[译文]
未知字段不属于解析后的设置模型,因此如果较旧版本之后重写设置文件,这些字段不会被写出。本次变更保护的是启动兼容性;它并不会让旧版本理解或保留新功能。

## 有意保持严格的格式(Deliberately strict formats)

[原文]
This policy does not apply to every persisted file:

[译文]
该策略并不适用于所有持久化文件:

[原文]
- `~/.tau/catalog.toml` remains schema-versioned and strict because it controls
  provider endpoints, authentication routing, model capabilities, and pricing;
- custom theme JSON remains strict so misspelled color and role names produce a
  useful diagnostic rather than a subtly broken theme;
- session transcript entries remain strict to protect conversation integrity.

[译文]
- `~/.tau/catalog.toml` 仍保持带 schema 版本且严格,因为它控制 provider 端点、认证路由、模型能力与定价;
- 自定义主题 JSON 仍保持严格,这样拼错颜色与角色名会给出有用的诊断,而不是一个微妙损坏的主题;
- 会话记录条目仍保持严格,以保护对话的完整性。

[原文]
Credential objects and session index metadata were already tolerant of extra
fields, so they need no parser change.

[译文]
凭据对象与会话索引元数据本来就容忍多余字段,因此它们无需修改解析器。

## 如何测试(How to test)

[原文]
1. Add a made-up field to each JSON settings file, such as
   `"future_setting": true`.
2. Add a made-up action inside `tui.json`'s `keybindings` and a made-up option
   inside one `providers.json` provider preference.
3. Start Tau and confirm the TUI opens while recognized settings still apply.
4. Give recognized settings invalid values and confirm Tau still reports those
   configuration errors.

[译文]
1. 给每个 JSON 设置文件加一个虚构字段,例如 `"future_setting": true`。
2. 在 `tui.json` 的 `keybindings` 里加一个虚构动作,并在 `providers.json` 的某个 provider 偏好里加一个虚构选项。
3. 启动 Tau,确认 TUI 能打开,并且已识别的设置仍然生效。
4. 给已识别的设置赋非法值,确认 Tau 仍会报告这些配置错误。

[原文]
Automated tests cover ignored fields in all three parsers alongside existing
strict validation tests for recognized fields.

[译文]
自动化测试覆盖三个解析器对忽略字段的处理,并与既有的「已识别字段严格校验」测试并存。
