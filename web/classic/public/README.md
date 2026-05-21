# New API 文档

> 本文档是 New API 网关的 API 接口参考，内容基于本仓库 `router/relay-router.go`、`relay/channel/` 和 `dto/` 源码整理，文字均为原创。

---

## 一、API 参考

### 1.1 Base URL

所有接口均托管在同一服务进程下，默认监听 `:3000`。访问示例：

```
http://<实例地址>:3000
```

生产环境建议在前面挂 Nginx / Caddy，做 TLS 终止与反向代理；若代理层需要压缩或缓冲，请按 README 的部署段落调整配置。

### 1.2 身份认证

网关支持两种 Key 头的上游协议，调用方按自己熟悉的风格二选一即可，网关会在内部按协议分发到上游：

| 协议 | 请求头 | 格式 | 适用端点 |
| --- | --- | --- | --- |
| OpenAI | `Authorization` | `Bearer sk-xxx` | `/v1/*` 大部分 |
| Anthropic | `x-api-key` + `anthropic-version` | sk-xxx，版本如 `2023-06-01` | `/v1/messages`、`/v1/models` |
| Google Gemini | `x-goog-api-key` 或 `?key=` | 明文 Key | `/v1beta/models/*` |

`sk-xxx` 是在后台"令牌"页申请得到的 API Key，和 OpenAI 官方发的 Key 没有关系，是网关内部签发的。

### 1.3 通用请求头

| Header | 说明 |
| --- | --- |
| `Content-Type: application/json` | JSON 请求体 |
| `Accept: text/event-stream` | 请求流式响应时建议声明 |
| `Accept-Encoding: gzip, br` | 响应会按照标准压缩协商，上传也支持 gzip/deflate 解压 |
| `X-Request-ID` | 可选，自己传入时网关会回写到响应头和日志，方便排障 |

### 1.4 统一响应结构

**成功**（对透传型接口）：网关只做协议适配，响应体与所选上游协议保持一致（OpenAI / Claude / Gemini / Rerank / Midjourney 各自不同）。

**失败**（统一 OpenAI 风格错误对象）：

```json
{
  "error": {
    "message": "token 已禁用或已过期",
    "type": "new_api_error",
    "param": "",
    "code": "invalid_api_key"
  }
}
```

| 字段 | 说明 |
| --- | --- |
| `message` | 人类可读的错误描述 |
| `type` | 错误大类，常见 `new_api_error`、`one_api_error`、`relay_error` 等 |
| `param` | 引发错误的参数名（多数情况下为空） |
| `code` | 机器可读错误码，供客户端判断 |

### 1.5 常见错误码

| code | HTTP | 触发场景 |
| --- | --- | --- |
| `invalid_api_key` | 401 | Key 不存在 / 被禁用 / 已过期 |
| `insufficient_quota` | 403 | 令牌或用户 Quota 已用完 |
| `ip_not_allowed` | 403 | 令牌设了 IP 白名单但来源不匹配 |
| `model_not_found` | 404 | 当前令牌 / 分组拿不到该模型 |
| `too_many_requests` | 429 | 令牌 / 用户 / 模型粒度限流触发 |
| `request_body_too_large` | 413 | 请求体超过 `MAX_REQUEST_BODY_MB`（默认 32） |
| `streaming_timeout` | 504 | 流式响应 `STREAMING_TIMEOUT` 内无新数据 |
| `upstream_error` | 502 | 上游返回 5xx 且重试链全部失败 |
| `channel_not_available` | 503 | 目标模型无任何可用渠道 |
| `internal_error` | 500 | 网关自身异常，详见 `logs/server.log` |

### 1.6 限流

共有三层独立的限流，先到先触发：

1. **令牌级**：令牌详情里的"每分钟请求数"。
2. **模型级**：`ModelRequestRateLimit` 中间件按 `<user, model>` 维度做令牌桶。
3. **上游渠道级**：渠道详情里的"最大并发"与"RPM"。超过后请求会优先派发到同优先级的其它渠道；都不可用才返回 429。

### 1.7 重试

上游失败时网关会：

1. 在同优先级内按权重随机选下一条渠道；
2. 若同优先级全部失败，降级到下一优先级；
3. 全部耗尽后返回最后一次上游的 `upstream_error`。

重试链会写进使用日志的"详情"面板，可以回看具体命中了哪几条渠道。

### 1.8 请求体大小限制

默认单请求体最大 32 MB（解压后），由 `MAX_REQUEST_BODY_MB` 控制。超大图像 base64（如 4K 图片）可能触发 `request_body_too_large`，调大该环境变量并重启后生效。

### 1.9 流式响应

所有 `stream=true` 的请求走 Server-Sent Events。事件结束时会发一条 `data: [DONE]`，客户端应识别此标记关闭流。

若上游 `STREAMING_TIMEOUT`（默认 300 秒）内无新数据，网关会主动断开并返回 `streaming_timeout`。长思考模型（如 o1 / deepseek-r1）可能需要调大此值。

### 1.10 幂等与超时

- 网关没有做幂等键机制，重复提交会产生重复扣费。需要幂等请在调用方自己维护请求 ID 去重。
- 非流式请求总超时由 `RELAY_TIMEOUT`（0 表示不限制）控制。

---

## 二、AI 模型接口

本节按端点分条列出。相同模型能被多个端点调用时，各端点参数、协议各自独立，按上游真实约定解析。

### 2.1 模型列表

列出当前令牌可访问的模型（同时受用户分组、令牌白名单影响）。

| 方法 | 路径 | 协议 |
| --- | --- | --- |
| GET | `/v1/models` | OpenAI |
| GET | `/v1/models/{model}` | OpenAI / Anthropic |
| GET | `/v1beta/models` | Gemini |
| GET | `/v1beta/openai/models` | OpenAI 兼容（兼容一些客户端） |

响应（OpenAI 格式）：

```json
{
  "object": "list",
  "data": [
    { "id": "gpt-4o-mini", "object": "model", "created": 0, "owned_by": "openai" },
    { "id": "claude-4-sonnet", "object": "model", "created": 0, "owned_by": "anthropic" }
  ]
}
```

若请求头带 `x-api-key` + `anthropic-version`，`GET /v1/models` 会走 Anthropic 协议返回；带 `x-goog-api-key` 或 `?key=` 会走 Gemini 协议。

### 2.2 Chat Completions（OpenAI）

- **方法**：`POST`
- **路径**：`/v1/chat/completions`（旧客户端也支持 `/v1/completions`）
- **协议**：OpenAI Chat Completions
- **认证**：`Authorization: Bearer sk-xxx`

**请求示例**：

```bash
curl http://<实例地址>:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-xxx" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user",   "content": "简单介绍一下自己"}
    ],
    "temperature": 0.7,
    "stream": true
  }'
```

**常用请求字段**：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `model` | string | 必填，模型名，如 `gpt-4o-mini`、`claude-4-sonnet` |
| `messages` | array | 必填，role ∈ {system, user, assistant, tool} |
| `stream` | bool | 流式返回；对应 SSE 输出 |
| `temperature` | number | 0–2 |
| `top_p` | number | 与 `temperature` 互斥使用即可 |
| `max_tokens` / `max_completion_tokens` | int | 上限 token；后者是新 API 名，对 o-series 模型必须用 |
| `tools` | array | 函数调用工具列表，OpenAI Function Calling 格式 |
| `tool_choice` | auto \| required \| 对象 | 控制是否强制工具调用 |
| `response_format` | 对象 | JSON Mode 或 JSON Schema |
| `seed` | int | 可复现采样 |
| `user` | string | 可选，下游会透传 |
| `frequency_penalty` / `presence_penalty` | number | -2.0 – 2.0 |
| `logprobs` / `top_logprobs` | bool / int | 返回 token logprob |
| `stop` | string \| array | 停止词 |

**响应字段**（非流式）：

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1715600000,
  "model": "gpt-4o-mini",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 34,
    "total_tokens": 46
  }
}
```

流式响应：每个事件是 `data: {json}` 且最后发 `data: [DONE]`。增量字段在 `choices[0].delta`。

### 2.3 Messages（Anthropic Claude）

- **方法**：`POST`
- **路径**：`/v1/messages`
- **协议**：Anthropic Messages
- **认证**：`Authorization: Bearer sk-xxx`（网关统一令牌），或原生 `x-api-key` + `anthropic-version`

**请求示例**：

```bash
curl http://<实例地址>:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-xxx" \
  -d '{
    "model": "claude-4-sonnet",
    "max_tokens": 1024,
    "system": "You are a coding assistant.",
    "messages": [
      {"role": "user", "content": "写一段 Go 的快速排序"}
    ]
  }'
```

**差异要点**：

- `system` 是顶层字段而不是 messages 中的一条。
- `content` 既可以是字符串，也可以是包含 `type: text / image / tool_use / tool_result` 的对象数组，适合多模态和工具调用。
- 支持 `cache_control: { "type": "ephemeral" }` 做 Prompt Caching；缓存命中在 `usage.cache_read_input_tokens` 中体现。
- 流式响应格式是 `event: message_start / content_block_delta / message_stop` 的多事件流。

### 2.4 Responses（OpenAI v2 Responses API）

- **方法**：`POST`
- **路径**：`/v1/responses`、`/v1/responses/compact`
- **协议**：OpenAI Responses
- **用途**：新一代 assistant 风格接口，支持多轮、工具、结构化输出；`compact` 版本返回压缩格式。

字段和响应结构遵循 OpenAI 官方 Responses API 定义。网关透传不做参数魔改。

### 2.5 Embeddings

- **方法**：`POST`
- **路径**：`/v1/embeddings`
- **协议**：OpenAI Embeddings

```json
{
  "model": "text-embedding-3-small",
  "input": ["句子 A", "句子 B"],
  "encoding_format": "float"
}
```

响应 `data[i].embedding` 是 float 数组，长度由模型决定（如 3-small=1536、3-large=3072）。

### 2.6 图像生成与编辑

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/images/generations` | 文生图 |
| POST | `/v1/images/edits` | 图生图 / 蒙版编辑 |
| POST | `/v1/edits` | 旧路径，语义同 edits |

**生成示例**：

```json
{
  "model": "gpt-image-1",
  "prompt": "a cyberpunk cat in a neon alley",
  "size": "1024x1024",
  "n": 1,
  "response_format": "b64_json"
}
```

返回 `data[].url` 或 `data[].b64_json`，取决于 `response_format`。

图像编辑（multipart/form-data）：

```bash
curl http://<实例地址>:3000/v1/images/edits \
  -H "Authorization: Bearer sk-xxx" \
  -F image=@input.png \
  -F mask=@mask.png \
  -F prompt="把猫换成柴犬" \
  -F model=gpt-image-1 \
  -F size=1024x1024
```

### 2.7 音频

| 方法 | 路径 | 协议 | 说明 |
| --- | --- | --- | --- |
| POST | `/v1/audio/transcriptions` | multipart/form-data | 语音转文字（如 whisper） |
| POST | `/v1/audio/translations` | multipart/form-data | 语音翻译为英文文字 |
| POST | `/v1/audio/speech` | JSON | 文字转语音（TTS） |

**转录示例**：

```bash
curl http://<实例地址>:3000/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-xxx" \
  -F file=@meeting.mp3 \
  -F model=whisper-1 \
  -F response_format=verbose_json
```

**TTS 示例**：

```json
{
  "model": "gpt-4o-mini-tts",
  "voice": "alloy",
  "input": "你好，世界",
  "format": "mp3"
}
```

### 2.8 Rerank

- **方法**：`POST`
- **路径**：`/v1/rerank`
- **协议**：Cohere / Jina Rerank 风格

```json
{
  "model": "rerank-multilingual-v3.0",
  "query": "how to deploy new-api",
  "documents": ["doc A", "doc B", "doc C"],
  "top_n": 3
}
```

响应 `results[]` 含 `document.index`、`document.text`、`relevance_score`。

### 2.9 Moderations

- **方法**：`POST`
- **路径**：`/v1/moderations`
- **协议**：OpenAI Moderations

```json
{ "model": "omni-moderation-latest", "input": "..." }
```

返回每个类别的 `flagged` 与分值，用于内容安全判断。

### 2.10 Gemini 原生接口

- **方法**：`POST`
- **路径**：`/v1beta/models/{model}:{action}`（如 `:generateContent`、`:streamGenerateContent`）
- **认证**：`x-goog-api-key: sk-xxx` 或 `?key=sk-xxx`

```bash
curl "http://<实例地址>:3000/v1beta/models/gemini-2.5-pro:generateContent?key=sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{"text": "用一句话介绍光合作用"}]
    }]
  }'
```

`/v1/engines/{model}/embeddings` 也被归到 Gemini 协议分支处理。

网关同样支持 `/v1beta/openai/models` 伪 OpenAI 路径，部分客户端（LobeChat 等）用它做模型发现。

### 2.11 Realtime（WebSocket）

- **方法**：WebSocket
- **路径**：`/v1/realtime?model=<model>`
- **用途**：OpenAI Realtime 语音/多模态双向通道

建立连接后按 OpenAI 官方 Realtime 事件协议发送 `session.update`、`input_audio_buffer.append` 等事件；网关透传到上游。

### 2.12 Midjourney（私服协议）

路径前缀 `/mj`，所有子路径均为 `POST`（`GET` 仅用于任务查询和图像下载）。

| 路径 | 用途 |
| --- | --- |
| `/mj/submit/imagine` | 基于 prompt 生成四宫格 |
| `/mj/submit/change` / `/mj/submit/action` | 放大 / 变体 / Pan / Zoom 等二次操作 |
| `/mj/submit/modal` | 提交 modal 表单（inpaint 等） |
| `/mj/submit/shorten` | 缩短 prompt |
| `/mj/submit/describe` | 以图生 prompt |
| `/mj/submit/blend` | 多图融合 |
| `/mj/submit/edits` | 图片编辑 |
| `/mj/submit/video` | 视频生成 |
| `/mj/task/:id/fetch` | 查任务进度 |
| `/mj/task/:id/image-seed` | 查原始 seed |
| `/mj/task/list-by-condition` | 按条件查任务列表 |
| `/mj/insight-face/swap` | 换脸 |
| `/mj/submit/upload-discord-images` | 上传底图到 Discord |
| `/mj/image/:id` | 下载任务产物 |

还有带模式前缀的路径 `/:mode/mj/...`（`mode` 如 `fast`、`turbo`、`relax`），语义同 `/mj/...`。

### 2.13 Suno（私服协议）

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/suno/submit/:action` | 提交任务（`action` 如 `music`、`lyrics`） |
| POST | `/suno/fetch` | 批量查任务 |
| GET | `/suno/fetch/:id` | 单个任务查进度 |

### 2.14 Playground

- **方法**：`POST`
- **路径**：`/pg/chat/completions`
- **认证**：`UserAuth` 会话，而非 API Key

仅供后台的"测试"与 Chat Playground 页面内部使用。

### 2.15 未实现的端点

以下路径存在，但仅返回 501 / `not_implemented`，调用请勿依赖：

- `/v1/images/variations`
- `/v1/files*`
- `/v1/fine-tunes*`
- `DELETE /v1/models/:model`

---

> 如需对某个具体端点的字段做深入说明，请以本仓库 `dto/` 目录下对应请求结构体（如 `dto/openai_request.go`、`dto/claude_request.go`）的字段和注释为准；上游厂商的官方文档是最终参考。
