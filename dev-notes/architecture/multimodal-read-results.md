# 多模态 read 工具结果 / Multimodal read-tool results

[原文]
Tau's `read` tool now detects supported images from file magic and returns them
as canonical `ImageContent` blocks alongside its short text note. Processed
attachments are capped at 5 MB, and animated PNG files are not treated as
supported static PNG attachments. Oversized static images are now normalized by
the follow-up [bounded read-image processing](./read-image-processing.md). The
agent loop already preserves ordered
tool-result content, so image data remains provider-neutral until the `tau_ai`
serialization boundary.

[译文]
Tau 的 `read` 工具现在会通过文件魔数(magic)识别受支持的图片,并把它们作为规范的 `ImageContent` 块连同一条简短文本说明一起返回。处理后的附件上限为 5 MB,动画 PNG 文件不会被当作受支持的静态 PNG 附件。超大静态图片现在由后续的[有界 read 图片处理](./read-image-processing.md)做归一化。Agent 循环本来就会保留有序的工具结果内容,因此图片数据在到达 `tau_ai` 序列化边界之前始终保持 provider 无关。

[原文]
Each provider adapter maps image blocks to its wire format:

[译文]
每个 provider 适配器把图片块映射到自己的线上格式:

[原文]
- Anthropic nests base64 image blocks in `tool_result.content`.
- OpenAI Responses and Codex use `input_image` blocks in function-call output.
- OpenAI Chat Completions and Mistral keep the textual tool result and attach
  images in a following user message.
- Gemini 3 uses multimodal `functionResponse.parts`; older Gemini models receive
  a separate user image message.

[译文]
- Anthropic 把 base64 图片块嵌套在 `tool_result.content` 中。
- OpenAI Responses 与 Codex 在函数调用输出中使用 `input_image` 块。
- OpenAI Chat Completions 与 Mistral 保留文本形式的工具结果,并把图片附加在随后的一条用户消息中。
- Gemini 3 使用多模态的 `functionResponse.parts`;较旧的 Gemini 模型则接收一条单独的用户图片消息。

[原文]
Runtime provider configuration derives image support from the selected model's
catalog `input` metadata. Every provider config, including the distinct
`OpenAICodexProviderConfig`, preserves this metadata through runtime creation.
The sparse OpenAI Codex, OpenCode Go, OpenCode Zen, and GitHub Copilot catalog
entries now declare input modalities for every model, matching Pi's generated
provider catalog. Text-only models receive an explicit omission marker, which
avoids invalid provider requests and makes the missing visual context visible to
the model. GitHub Copilot image requests also include its required
`Copilot-Vision-Request: true` header.

[译文]
运行时 provider 配置会从所选模型的目录 `input` 元数据推导图片支持能力。每个 provider 配置(包括独立的 `OpenAICodexProviderConfig`)都会在运行时构建过程中保留这份元数据。此前稀疏的 OpenAI Codex、OpenCode Go、OpenCode Zen 与 GitHub Copilot 目录条目现在为每个模型声明了输入模态,与 Pi 生成的 provider 目录一致。纯文本模型会收到一个明确的省略标记,从而避免非法的 provider 请求,并让模型知道缺失了视觉上下文。GitHub Copilot 的图片请求还会带上它要求的 `Copilot-Vision-Request: true` 头。

[原文]
The image base64 payload moved from tool-result `details` into `content`. This
prevents duplicate session storage and lets all frontends continue rendering the
small text note without exposing base64 data.

[译文]
图片的 base64 载荷已从工具结果的 `details` 移入 `content`。这避免了会话存储中的重复,并让所有前端都能继续渲染那条简短文本说明,而不必暴露 base64 数据。

## 验证(Validation)

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy
```
