---
title: "Tau Documentation"
description: "Learn how coding agents are built — Tau 是 HuggingFace 推出的教育性 Python 编码智能体项目源码文档"
build:
  list: false
---

Tau 是一个**教育性 Python 项目**,用于学习如何构建编码智能体。它实现了 Pi 的极简主义智能体 harness 架构,三层设计清晰、可扩展、易阅读。

## 快速导航

| 我想... | 去哪里 |
|---------|--------|
| 了解 Tau 是什么 | [What is Tau?]({{< relref "what-is-tau" >}}) |
| 快速上手运行 | [Quickstart]({{< relref "quickstart" >}}) |
| 理解核心设计概念 | [Core concepts]({{< relref "concepts" >}}) |
| 学习使用各功能 | [Guides]({{< relref "guides/tui" >}}) |
| 查阅 API/配置/CLI | [Reference]({{< relref "reference/cli" >}}) |
| 深入源码架构 | [Internals: Architecture]({{< relref "internals/architecture" >}}) |
| 逐文件源码剖析 | [Source code walkthrough]({{< relref "internals/source-walkthrough" >}}) |

## 三层架构一览

Tau 将代码分成三层,每层只回答一个问题:

```text
tau_ai      → 与模型对话的统一接口
tau_agent   → 可复用的智能体核心(无 UI 依赖)
tau_coding  → 编码智能体应用(CLI + TUI + 工具)
```

## 文档结构

- **Use Tau** — 概念与快速入门
- **Guides** — 用户操作指南(会话、提供商、上下文管理等)
- **Reference** — 工具/斜杠命令/配置/快捷键/CLI 参考
- **How Tau works** — 架构概述、设计原则、源码逐文件剖析

  → 从 [What is Tau?]({{< relref "what-is-tau" >}}) 开始阅读。
