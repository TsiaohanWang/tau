# SOCKS 代理支持 / SOCKS proxy support

[原文]
Tau uses `httpx` for provider requests, OAuth token refreshes, and startup update checks. `httpx` reads standard proxy environment variables such as `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY`.

[译文]
Tau 使用 `httpx` 处理 provider 请求、OAuth token 刷新与启动时的更新检查。`httpx` 会读取标准的代理环境变量,例如 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 与 `NO_PROXY`。

## 变更内容(What changed)

[原文]
Issue #221 reported failures when the environment contained a generic SOCKS proxy URL such as:

[译文]
Issue #221 报告了当环境中包含像这样的通用 SOCKS 代理 URL 时的失败:

```bash
ALL_PROXY=socks://127.0.0.1:1080
```

[原文]
`httpx` does not accept the generic `socks://` scheme. It accepts explicit SOCKS schemes such as `socks5://` and `socks5h://`, and those require the optional SOCKS dependency.

[译文]
`httpx` 不接受通用的 `socks://` 协议方案。它接受显式的 SOCKS 方案,例如 `socks5://` 与 `socks5h://`,而这些需要可选的 SOCKS 依赖。

[原文]
Tau now:

- installs `httpx[socks]` in the base package so `socksio` is available;
- normalizes `socks://...` to `socks5://...` before constructing Tau-owned HTTP clients;
- routes provider clients, OAuth token refresh clients, and update-check fetches through shared helpers in `tau_ai.http`.

[译文]
Tau 现在:

- 在基础包中安装 `httpx[socks]`,从而提供 `socksio`;
- 在构建 Tau 自有的 HTTP 客户端之前,把 `socks://...` 归一化为 `socks5://...`;
- 让 provider 客户端、OAuth token 刷新客户端与更新检查请求都走 `tau_ai.http` 中的共享辅助函数。

## 为什么 `socks://` 映射到 `socks5://`(Why `socks://` maps to `socks5://`)

[原文]
The generic scheme does not specify whether DNS lookup should happen locally or through the proxy. Tau treats it as SOCKS5 with local DNS resolution because that is the closest explicit `httpx` scheme and avoids silently changing DNS behavior beyond making the previously invalid URL usable.

[译文]
通用方案并不规定 DNS 解析应当发生在本地还是通过代理。Tau 把它当作「使用本地 DNS 解析的 SOCKS5」,因为这是最接近的显式 `httpx` 方案,并且除了让原本非法的 URL 变得可用之外,不会悄悄改变 DNS 行为。

[原文]
Users who need proxy-side DNS resolution should set an explicit `socks5h://` URL.

[译文]
需要由代理侧做 DNS 解析的用户,应当显式设置 `socks5h://` URL。

## 未来改进:避免临时修改环境变量(Future improvement: avoid temporary environment mutation)

[原文]
The current helper temporarily normalizes proxy environment variables while constructing Tau-owned `httpx` clients. For the synchronous update-check helper, the normalization currently wraps the full `httpx.get(...)` call because `httpx.get` constructs and uses a short-lived client internally.

[译文]
当前辅助函数在构建 Tau 自有的 `httpx` 客户端时会临时归一化代理环境变量。对于同步的更新检查辅助函数,归一化目前包裹了整个 `httpx.get(...)` 调用,因为 `httpx.get` 内部会构建并使用一个短生命周期的客户端。

[原文]
This is acceptable for the current low-concurrency startup update-check path, but environment variables are process-global state. If Tau later performs more concurrent networking around this helper, another thread or task could observe the normalized proxy value while the request is in progress.

[译文]
对于当前低并发的启动更新检查路径,这是可以接受的;但环境变量是进程级全局状态。如果 Tau 日后在这个辅助函数附近进行更多并发网络操作,其他线程或任务可能在请求进行期间观察到归一化后的代理值。

[原文]
If this becomes a concern, prefer avoiding process environment mutation for request execution:

1. normalize proxy values into local data;
2. construct an explicit `httpx.Client` or `httpx.AsyncClient` with equivalent proxy configuration;
3. perform requests through that client without changing `os.environ` during request execution.

[译文]
如果这成为问题,更好的做法是在执行请求时避免修改进程环境变量:

1. 把代理值归一化为本地数据;
2. 用等价的代理配置构建一个显式的 `httpx.Client` 或 `httpx.AsyncClient`;
3. 通过该客户端执行请求,而不在执行期间修改 `os.environ`。

[原文]
When implementing that, preserve `NO_PROXY` semantics. `httpx` currently handles environment proxy discovery and no-proxy matching internally, so replacing it with explicit mounts/proxy configuration should include tests for:

[译文]
实现这一点时,要保留 `NO_PROXY` 语义。`httpx` 目前在内部处理环境代理发现与 no-proxy 匹配,因此用显式的 mounts/代理配置替换它时,应当包含以下测试:

[原文]
- `ALL_PROXY=socks://...` normalization;
- `HTTP_PROXY` and `HTTPS_PROXY` handling;
- lowercase proxy env vars;
- `NO_PROXY=*` bypass;
- host/domain/IP `NO_PROXY` entries;
- explicit `socks5://` and `socks5h://` values staying unchanged.

[译文]
- `ALL_PROXY=socks://...` 的归一化;
- `HTTP_PROXY` 与 `HTTPS_PROXY` 的处理;
- 小写的代理环境变量;
- `NO_PROXY=*` 的绕过;
- host/域名/IP 形式的 `NO_PROXY` 条目;
- 显式的 `socks5://` 与 `socks5h://` 值保持不变。
