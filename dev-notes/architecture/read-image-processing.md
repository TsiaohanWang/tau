# 有界的 read 图片处理 / Bounded read-image processing

## 新增了什么(What was added)

[原文]
The `read` tool now validates image bytes with Pillow before attaching them. It
accepts JPEG, static PNG, GIF, WebP, and BMP detected from file content. BMP is
normalized to PNG because the provider APIs do not consistently accept BMP.
Images larger than 2,000 pixels on either side or 5 MB are resized and encoded
again; aspect ratio is preserved and small images are never enlarged.

[译文]
`read` 工具现在会在附加图片字节之前用 Pillow 校验它们。它接受通过文件内容识别出的 JPEG、静态 PNG、GIF、WebP 与 BMP。BMP 会被归一化为 PNG,因为各 provider API 对 BMP 的接受程度并不一致。任一边超过 2,000 像素或超过 5 MB 的图片会被缩放并重新编码;宽高比保持不变,小图永远不会被放大。

[原文]
Processing has explicit ceilings:

[译文]
处理过程有明确的上限:

[原文]
- source encoding: 50 MB
- source dimensions: 40 million pixels
- output dimensions: 2,000 by 2,000 maximum
- output encoding: 5 MB
- image header sniff: 64 KB before loading oversized local files
- resize/encode attempts: 12

[译文]
- 源文件编码大小:50 MB
- 源尺寸:4,000 万像素
- 输出尺寸:最大 2,000 × 2,000
- 输出编码大小:5 MB
- 图片头嗅探:在加载超大本地文件之前先读 64 KB
- 缩放/编码尝试次数:12

[原文]
Pillow was selected because it has maintained cross-platform wheels, supports
the required formats, and exposes decoding validation and decompression-bomb
warnings. Tau converts those warnings and decode/encode failures into text-only
tool results. Limits are checked before loading pixel data where Pillow's
metadata API allows it. For the default local operations, files over 50 MB are
classified from a 64 KB prefix and known image families are rejected before the
full file is read. Large text files retain the existing read behavior.

[译文]
选择 Pillow 是因为它维护着跨平台 wheel、支持所需格式,并暴露解码校验与解压炸弹(decompression-bomb)警告。Tau 会把这些警告以及解码/编码失败转换为纯文本的工具结果。在 Pillow 元数据 API 允许的地方,限制会在加载像素数据之前检查。对于默认的本地操作,超过 50 MB 的文件会先通过 64 KB 前缀做分类,已知的图片家族会在读取整个文件之前被拒绝。超大的文本文件保持既有的读取行为。

[原文]
`ReadOperations` separates path validation and byte reading from the tool's
classification and processing. Optional size and prefix callbacks enable the
early image rejection; implementations that omit them retain the full-read
fallback. The default remains the local filesystem. Tests can supply fake
operations, and a future remote-filesystem integration can do so without moving
local I/O into `tau_agent`.

[译文]
`ReadOperations` 把「路径校验与字节读取」同「工具的分类与处理」分离开。可选的大小与前缀回调实现了早期的图片拒绝;省略它们的实现则保留「完整读取」的回退行为。默认仍是本地文件系统。测试可以提供假操作,而未来的远程文件系统集成也可以这样做,而无需把本地 I/O 搬进 `tau_agent`。

## 为什么需要它(Why it exists)

[原文]
The first multimodal implementation correctly carried canonical `ImageContent`
through the agent and provider layers, but rejected every attachment above 5 MB
and trusted shallow signatures. Real screenshots and camera images can exceed a
provider's limit while remaining easy to resize. Malformed or very large decoded
images also need predictable failure behavior.

[译文]
第一个多模态实现正确地把规范的 `ImageContent` 贯穿 agent 与 provider 层,但它拒绝所有超过 5 MB 的附件,并且只信任浅层签名。真实的截图与相机照片可能超过 provider 限制,同时又很容易缩放。畸形或解码后极大的图片也需要可预期的失败行为。

[原文]
This follows Pi's separation: coding-specific file/image work happens at the
read-tool boundary, `tau_agent` stores provider-neutral content, and `tau_ai`
serializes it. Tau keeps its existing shared capability helper in
`tau_ai/content.py`; provider adapters still own their wire-specific placement
because tool-result image placement differs across APIs.

[译文]
这遵循 Pi 的分层:编码相关的文件/图片工作在 read 工具边界完成,`tau_agent` 存储 provider 无关的内容,`tau_ai` 负责序列化。Tau 保留 `tau_ai/content.py` 中既有的共享能力辅助函数;provider 适配器仍持有各自线上放置方式的所有权,因为不同 API 对工具结果图片的放置位置并不相同。

## 产品与交付决策(Product and delivery decisions)

[原文]
1. Preserve original supported bytes when they are already safe. This avoids
   quality loss and preserves supported GIF/WebP animation.
2. Convert BMP to PNG, and resize static oversized images. An animated image
   that exceeds limits is omitted rather than silently flattened to one frame.
   Animated PNG and JPEG XL input receive explicit unsupported-format notes
   instead of falling through to UTF-8 decoding.
3. Keep one transformed payload in `ImageContent`. Original bytes and base64 are
   not copied into tool `details` or session JSONL.
4. Share mutable image-capability state between `CodingSession` and the built-in
   `read` tool. Text-only models receive a strong text-only notice before image
   processing, and model changes update that state in place. Provider adapters
   retain the same defensive downgrade for old sessions and other tools.
5. Return transformation notes to the model so it knows when dimensions or
   encoding changed.
6. Keep terminal image rendering out of scope. Textual has no built-in equivalent
   to Pi's terminal-image protocol renderer, so the TUI continues to show the
   textual status. A custom widget or third-party integration can be evaluated
   separately without changing the tool-result contract.
7. Keep live credential checks outside CI. `TODO.md` retains the provider/model
   validation matrix follow-up.

[译文]
1. 在原始字节已经安全时保留原样。这避免画质损失,并保留受支持的 GIF/WebP 动画。
2. 把 BMP 转换为 PNG,并缩放超大的静态图片。超过限制的动画图片会被省略,而不是被静默压平成单帧。动画 PNG 与 JPEG XL 输入会得到明确的「不支持格式」说明,而不是落到 UTF-8 解码。
3. 在 `ImageContent` 中只保留一份转换后的载荷。原始字节与 base64 不会被复制进工具 `details` 或会话 JSONL。
4. 在 `CodingSession` 与内置 `read` 工具之间共享可变的图片能力状态。纯文本模型会在图片处理之前收到一条明确的「仅文本」提示,模型切换会就地更新该状态。Provider 适配器对旧会话与其他工具保留同样的防御式降级。
5. 把转换说明返回给模型,让它知道尺寸或编码何时发生了变化。
6. 终端图片渲染不在范围内。Textual 没有与 Pi 终端图片协议渲染器等价的内置能力,因此 TUI 继续展示文本状态。自定义组件或第三方集成可以单独评估,而不改变工具结果契约。
7. 把真实凭据检查留在 CI 之外。`TODO.md` 保留了 provider/模型验证矩阵这一后续项。

## 如何测试(How to test)

[原文]
Focused behavior:

[译文]
聚焦行为:

```bash
uv run pytest tests/test_image_processing.py tests/test_coding_tools.py
```

[原文]
Full validation:

[译文]
完整验证:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
uv build
cd website && hugo --minify
```

[原文]
Manual validation should read a small image, a BMP, and a static image above
2,000 pixels with a vision model. Confirm that the model sees each image, BMP is
reported as converted, and the large image reports its resized dimensions.

[译文]
手动验证应使用一个视觉模型读取一张小图、一张 BMP,以及一张超过 2,000 像素的静态图片。确认模型能看到每张图片、BMP 被报告为已转换,并且大图会报告其缩放后的尺寸。
