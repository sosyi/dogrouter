# API 文档

> 本文档是 New API 网关对外 HTTP 接口的完整参考，内容基于本仓库 `router/relay-router.go`、`relay/channel/` 和 `dto/` 源码整理，文字均为原创。

---

## 概述

### Base URL

默认监听 `:3000`，按使用协议选择前缀：

| 协议 | Base URL |
| --- | --- |
| OpenAI | `https://router.dog/v1` |
| Anthropic | `https://router.dog`（走 `/v1/messages`） |
| Gemini | `https://router.dog/v1beta` |

### 身份认证

网关按请求头识别客户端使用的协议并分发到对应上游。填的都是后台签发的 `sk-xxx`（不是原厂 Key）。

| 协议 | 请求头 |
| --- | --- |
| OpenAI | `Authorization: Bearer sk-xxx` |
| Anthropic | `x-api-key: sk-xxx` + `anthropic-version: 2023-06-01` |
| Gemini | `x-goog-api-key: sk-xxx` 或 `?key=sk-xxx` |

### 统一错误结构

失败时统一返回 OpenAI 风格错误：

```json
{
  "error": {
    "message": "...",
    "type": "...",
    "code": "..."
  }
}
```

常见 `code`：

| code | HTTP | 场景 |
| --- | --- | --- |
| `invalid_api_key` | 401 | Key 不存在 / 禁用 / 过期 |
| `insufficient_quota` | 403 | Quota 已用完 |
| `ip_not_allowed` | 403 | 令牌限制了来源 IP |
| `model_not_found` | 404 | 令牌 / 分组拿不到该模型 |
| `too_many_requests` | 429 | 限流触发（令牌 / 模型 / 渠道三层任一） |
| `request_body_too_large` | 413 | 超过 `MAX_REQUEST_BODY_MB`（默认 32） |
| `streaming_timeout` | 504 | `STREAMING_TIMEOUT` 内无新数据 |
| `channel_not_available` | 503 | 该模型无任何可用渠道 |
| `upstream_error` | 502 | 所有重试耗尽 |
| `internal_error` | 500 | 网关异常，查 `logs/server.log` |

### 限流与重试

三层独立限流，先到先触发：令牌级 → 模型级 → 渠道级。

上游失败时按"同优先级内按权重随机 → 下一优先级 → 耗尽返回 `upstream_error`"重试；每次请求的完整重试链会写进"使用日志 → 详情"。

### 流式响应

`stream=true` 走 SSE，结尾会发 `data: [DONE]`。长思考模型（o1 / deepseek-r1 等）可调大 `STREAMING_TIMEOUT` 以避免中途超时断开。

---

## 模型列表

列出当前令牌能访问的模型（同时受用户分组、令牌白名单影响）。

| 方法 | 路径 | 协议 |
| --- | --- | --- |
| GET | `/v1/models` | OpenAI（若带 `x-api-key`+`anthropic-version` 则切 Anthropic；带 `x-goog-api-key` 则切 Gemini） |
| GET | `/v1/models/{model}` | OpenAI / Anthropic |
| GET | `/v1beta/models` | Gemini |
| GET | `/v1beta/openai/models` | OpenAI 兼容（部分客户端发现用） |

响应（OpenAI）：

```json
{
  "object": "list",
  "data": [
    { "id": "gpt-4o-mini", "object": "model", "owned_by": "openai" }
  ]
}
```

---

## 聊天补全

OpenAI Chat Completions 协议。

- **方法**：`POST`
- **路径**：`/v1/chat/completions`（兼容 `/v1/completions`）
- **认证**：`Authorization: Bearer sk-xxx`

```bash
curl https://router.dog/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-xxx" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "stream": true
  }'
```

**关键请求字段**：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `model` | string | 模型名 |
| `messages` | array | role ∈ system / user / assistant / tool |
| `stream` | bool | SSE 流式输出 |
| `temperature` / `top_p` | number | 采样参数，建议二选一 |
| `max_tokens` / `max_completion_tokens` | int | 上限 token（o-series 必须用后者） |
| `tools` / `tool_choice` | array / any | Function Calling |
| `response_format` | object | JSON Mode / JSON Schema |
| `seed` | int | 可复现采样 |
| `stop` | string \| array | 停止词 |
| `frequency_penalty` / `presence_penalty` | number | -2.0 – 2.0 |

**响应（非流式）**：

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "model": "gpt-4o-mini",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "..." },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 12, "completion_tokens": 34, "total_tokens": 46 }
}
```

流式响应每行 `data: {json}`，增量放在 `choices[0].delta`，最后 `data: [DONE]`。

---

## Claude Messages

Anthropic 原生 Messages 协议。适合需要 prompt caching、tool use、多模态消息块的场景。

- **方法**：`POST`
- **路径**：`/v1/messages`
- **认证**：同网关其它端点（`Authorization: Bearer sk-xxx`），或客户端偏好传原生 `x-api-key` + `anthropic-version`

```bash
curl https://router.dog/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-xxx" \
  -d '{
    "model": "claude-4-sonnet",
    "max_tokens": 1024,
    "system": "You are a coding assistant.",
    "messages": [{"role": "user", "content": "写一段 Go 快排"}]
  }'
```

**与 OpenAI 协议的差异**：

- `system` 是顶层字段，不放在 `messages` 里。
- `content` 可以是字符串，也可以是包含 `type: text / image / tool_use / tool_result` 的块数组。
- 加 `cache_control: { "type": "ephemeral" }` 可做 Prompt Caching，命中量体现在 `usage.cache_read_input_tokens`。
- 流式事件：`message_start / content_block_delta / message_stop` 的多事件流。

---

## 响应接口

OpenAI Responses API（v2 协议），适合多轮、工具、结构化输出场景。

- **方法**：`POST`
- **路径**：`/v1/responses`、`/v1/responses/compact`

字段与响应体遵循 OpenAI 官方定义，网关透传不改写参数。`compact` 版本返回紧凑格式，便于带宽敏感场景。

---

## 嵌入

OpenAI Embeddings 协议。

- **方法**：`POST`
- **路径**：`/v1/embeddings`

```json
{
  "model": "text-embedding-3-small",
  "input": ["句子 A", "句子 B"],
  "encoding_format": "float"
}
```

`data[i].embedding` 是 float 数组，维度由模型决定（`3-small` = 1536、`3-large` = 3072）。

---

## 图像

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/v1/images/generations` | 文生图 |
| POST | `/v1/images/edits` | 图生图 / 蒙版编辑 |
| POST | `/v1/edits` | 旧路径，语义同上 |

**生成**（JSON）：

```json
{
  "model": "gpt-image-1",
  "prompt": "a cyberpunk cat in a neon alley",
  "size": "1024x1024",
  "n": 1,
  "response_format": "b64_json"
}
```

**编辑**（multipart/form-data）：

```bash
curl https://router.dog/v1/images/edits \
  -H "Authorization: Bearer sk-xxx" \
  -F image=@input.png \
  -F mask=@mask.png \
  -F prompt="把猫换成柴犬" \
  -F model=gpt-image-1 \
  -F size=1024x1024
```

返回 `data[].url` 或 `data[].b64_json`，由 `response_format` 决定。

---

## 音频

| 方法 | 路径 | 协议 | 用途 |
| --- | --- | --- | --- |
| POST | `/v1/audio/transcriptions` | multipart | 语音转文字（Whisper 等） |
| POST | `/v1/audio/translations` | multipart | 语音翻译为英文文字 |
| POST | `/v1/audio/speech` | JSON | 文字转语音（TTS） |

**转录**：

```bash
curl https://router.dog/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-xxx" \
  -F file=@meeting.mp3 \
  -F model=whisper-1 \
  -F response_format=verbose_json
```

**TTS**：

```json
{
  "model": "gpt-4o-mini-tts",
  "voice": "alloy",
  "input": "你好，世界",
  "format": "mp3"
}
```

---

## 重排与审核

两个独立端点，放在一起介绍便于查阅。

**Rerank**

- **方法**：`POST`
- **路径**：`/v1/rerank`
- **协议**：Cohere / Jina Rerank 风格

```json
{
  "model": "rerank-multilingual-v3.0",
  "query": "how to deploy",
  "documents": ["doc A", "doc B", "doc C"],
  "top_n": 3
}
```

响应 `results[]` 含 `document.index`、`document.text`、`relevance_score`。

**Moderations**

- **方法**：`POST`
- **路径**：`/v1/moderations`
- **协议**：OpenAI Moderations

```json
{ "model": "omni-moderation-latest", "input": "..." }
```

返回每个类别的 `flagged` 与分值，用于内容安全判断。

---

## 其他协议

覆盖各家原生协议和私服协议。

#### Gemini 原生

- **方法**：`POST`
- **路径**：`/v1beta/models/{model}:{action}`（`:generateContent` / `:streamGenerateContent`）
- **认证**：`x-goog-api-key: sk-xxx` 或 `?key=sk-xxx`

```bash
curl "https://router.dog/v1beta/models/gemini-2.5-pro:generateContent?key=sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"role": "user", "parts": [{"text": "介绍光合作用"}]}]
  }'
```

`/v1/engines/{model}/embeddings` 也被归到 Gemini 协议分支处理。

#### Realtime（WebSocket）

- **路径**：`/v1/realtime?model=<model>`
- **用途**：OpenAI Realtime 语音 / 多模态双向通道

建连后按 OpenAI 官方 Realtime 事件协议发送 `session.update`、`input_audio_buffer.append` 等事件，网关透传到上游。

#### Midjourney

路径前缀 `/mj`，还支持 `/:mode/mj/...`（`mode` = `fast` / `turbo` / `relax`）。

| 路径 | 用途 |
| --- | --- |
| `/mj/submit/imagine` | 基于 prompt 生成四宫格 |
| `/mj/submit/change` · `/mj/submit/action` | 放大 / 变体 / Pan / Zoom |
| `/mj/submit/modal` | inpaint 等 modal 表单 |
| `/mj/submit/shorten` / `describe` / `blend` / `edits` / `video` | 缩短 prompt、以图生 prompt、多图融合、编辑、视频 |
| `/mj/task/:id/fetch` · `/mj/task/:id/image-seed` | 查任务进度 / seed |
| `/mj/task/list-by-condition` | 按条件批量查 |
| `/mj/insight-face/swap` | 换脸 |
| `/mj/image/:id` | 下载任务产物 |

#### Suno

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/suno/submit/:action` | 提交任务（`action` = `music` / `lyrics`） |
| POST | `/suno/fetch` | 批量查任务 |
| GET | `/suno/fetch/:id` | 单任务进度 |

#### 未实现端点

以下路径存在但仅返回 501 / `not_implemented`，请勿依赖：

- `/v1/images/variations`
- `/v1/files*`
- `/v1/fine-tunes*`
- `DELETE /v1/models/:model`

---

> 需要对某个端点做更深入的字段说明，请以本仓库 `dto/` 目录下对应结构体（如 `dto/openai_request.go`、`dto/claude_request.go`）的字段注释为准；上游厂商的官方协议文档是最终依据。
