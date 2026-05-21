# 接入 Agent 工具

> 本网关对外是标准的 OpenAI / Anthropic / Gemini 协议，几乎所有开源或商用的 AI Agent / 聊天客户端都能无缝接入。本页按工具分类给出 Base URL、API Key 位置和常见踩坑点。

---

## 一、通用配置

在讲每个工具之前，先把几条共通信息说清楚，后文各节只贴差异点。

| 项目 | 值 |
| --- | --- |
| Base URL（OpenAI 协议） | `https://router.dog/v1` |
| Base URL（Anthropic 协议） | `https://router.dog` |
| Base URL（Gemini 协议） | `https://router.dog/v1beta` |
| API Key | 在后台「令牌」菜单签发，形如 `sk-xxxxxxxxxxxxxxxx` |
| 支持模型 | 取决于后台配置了哪些渠道，可在客户端里用 `GET /v1/models` 拉列表 |
| 是否强 HTTPS | 本地部署非必需；公网暴露强烈建议前面挂 TLS |

**关于 Key**：千万不要把上游厂商（OpenAI / Anthropic 等）的原始 Key 直接填给客户端——网关签发的 `sk-xxx` 才是你应该分发出去的 Token。

**关于模型名**：客户端里填的模型名会按字面量透传到网关，再由渠道的"模型映射"字段决定最终命中哪个上游模型。找不到模型时先检查：
1. 后台是否真的有渠道挂着这个模型名；
2. 当前令牌 / 用户分组是否允许访问；
3. 渠道是否为启用状态。

---

## 二、开发者 / 代码 Agent

### 2.1 Cursor

`设置 → Models → OpenAI API Key`：

| 字段 | 填写 |
| --- | --- |
| API Key | `sk-xxx` |
| Override OpenAI Base URL | `https://router.dog/v1` |

在下面 **Model Names** 里手动添加网关允许的模型（Cursor 默认只列 OpenAI 官方模型，新模型需要自己补）。勾选 Verify 测试通过即可。

Anthropic 模型可通过「添加自定义 OpenAI 兼容端点」启用，模型名用 `claude-4-sonnet` 这类；网关内部会协议转换。

### 2.2 Cline（VS Code 扩展）

打开 Cline 侧栏 → 右上齿轮：

- **API Provider**：选 `OpenAI Compatible`
- **Base URL**：`https://router.dog/v1`
- **API Key**：`sk-xxx`
- **Model ID**：直接填模型名，如 `gpt-4o-mini`

如果要用 Claude 原生协议（走 `/v1/messages`、能用 prompt cache），Provider 换成 `Anthropic`，Base URL 填 `https://router.dog`（注意不加 `/v1`）。

### 2.3 Continue（VS Code / JetBrains）

在 `~/.continue/config.yaml` 里加一组 model：

```yaml
models:
  - title: NewAPI GPT-4o
    provider: openai
    model: gpt-4o
    apiBase: https://router.dog/v1
    apiKey: sk-xxx
  - title: NewAPI Claude 4
    provider: anthropic
    model: claude-4-sonnet
    apiBase: https://router.dog
    apiKey: sk-xxx
```

`provider` 选 `openai` 时会走 Chat Completions；选 `anthropic` 走 Messages 原生协议。

### 2.4 Claude Code（Anthropic 官方 CLI）

通过环境变量覆盖默认端点：

```bash
export ANTHROPIC_BASE_URL="https://router.dog"
export ANTHROPIC_API_KEY="sk-xxx"
claude
```

Claude Code 用的是 Anthropic Messages 协议（`/v1/messages`），所以 Base URL **不加** `/v1`。模型通过命令行 `--model claude-4-sonnet` 或 `/model` 切换。

### 2.5 Aider

命令行参数：

```bash
aider \
  --openai-api-base https://router.dog/v1 \
  --openai-api-key sk-xxx \
  --model gpt-4o-mini
```

或者写进 `.aider.conf.yml`：

```yaml
openai-api-base: https://router.dog/v1
openai-api-key: sk-xxx
model: gpt-4o
```

如果遇到 `Model <name> not supported` 报错，加 `--model openai/<name>` 前缀强制走 OpenAI 适配器。

### 2.6 Zed

`~/.config/zed/settings.json`：

```jsonc
{
  "language_models": {
    "openai": {
      "api_url": "https://router.dog/v1",
      "available_models": [
        { "name": "gpt-4o", "max_tokens": 128000 },
        { "name": "claude-4-sonnet", "max_tokens": 200000 }
      ]
    }
  }
}
```

API Key 通过命令面板 `assistant: sign in` 粘贴。

### 2.7 CodeGPT（JetBrains）

Settings → Tools → CodeGPT → Providers → 选 `Custom OpenAI`：

| 字段 | 填写 |
| --- | --- |
| Host | `https://router.dog` |
| Path | `/v1/chat/completions` |
| Body Model | `gpt-4o-mini`（或其它你要用的模型名） |

勾选 `Use stream response`；API Key 贴在下面 `Authorization: Bearer sk-xxx`。

### 2.8 Goose（Block 出品）

`~/.config/goose/config.yaml`：

```yaml
GOOSE_PROVIDER: openai
OPENAI_HOST: https://router.dog
OPENAI_API_KEY: sk-xxx
GOOSE_MODEL: gpt-4o
```

注意 Goose 的变量是 `OPENAI_HOST`（不要写 `/v1` 后缀）。

---

## 三、聊天客户端 / Web UI

### 3.1 Cherry Studio

`设置 → 模型服务 → 添加`：

- **提供商**：选 `OpenAI`
- **API 密钥**：`sk-xxx`
- **API 地址**：`https://router.dog`（Cherry Studio 会自动补 `/v1`，不要重复加）
- **模型**：点"添加"手动输入模型名，或点"管理"从 `/v1/models` 拉列表

Claude 走 Anthropic 原生协议时，提供商选 `Anthropic`，API 地址填 `https://router.dog`。

### 3.2 LobeChat

自部署 LobeChat：在环境变量里设：

```
OPENAI_API_KEY=sk-xxx
OPENAI_PROXY_URL=https://router.dog/v1
```

或者在 LobeChat 的"设置 → 语言模型"里添加自定义 OpenAI 端点。`OPENAI_MODEL_LIST` 可填需要显示的模型白名单。

### 3.3 NextChat（ChatGPT-Next-Web）

`.env.local` / Docker 环境变量：

```
OPENAI_API_KEY=sk-xxx
BASE_URL=https://router.dog
CUSTOM_MODELS=+gpt-4o,+claude-4-sonnet,+gemini-2.5-pro
```

`CUSTOM_MODELS` 前的 `+` 表示添加到下拉，`-` 表示移除默认值。

### 3.4 Open WebUI

`设置 → 管理员设置 → 连接 → OpenAI API`：

- **URL**：`https://router.dog/v1`
- **API Key**：`sk-xxx`

点右侧刷新按钮拉取模型列表。Open WebUI 支持同时挂多个 OpenAI 兼容端点，可以把网关和其它本地模型（Ollama 等）同时列出来。

### 3.5 Jan

`设置 → 模型 → 添加 Model Provider → OpenAI`：

- **Base URL**：`https://router.dog/v1`
- **API Key**：`sk-xxx`

然后在"模型"里点"导入"，手动录入你要用的模型名和上下文长度。

### 3.6 AnythingLLM

新建 Workspace → LLM Provider 选 `Generic OpenAI`：

| 字段 | 填写 |
| --- | --- |
| Base URL | `https://router.dog/v1` |
| API Key | `sk-xxx` |
| Chat Model Name | 你要用的模型，如 `gpt-4o-mini` |
| Token context window | 按模型实际能力填（gpt-4o 建议 128000） |

### 3.7 Dify

Dify 后台 → 模型供应商 → OpenAI → "添加":

- **模型类型**：LLM（或 Embedding）
- **模型名称**：`gpt-4o-mini` 等
- **API Key**：`sk-xxx`
- **自定义 API Base**：`https://router.dog/v1`

想走其他厂商协议时，按 Dify 对应供应商的"添加"流程填 Base URL 即可。

---

## 四、HTTP / SDK 直调

除了客户端，应用里也可以用 SDK 或纯 HTTP 直接打：

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://router.dog/v1",
    api_key="sk-xxx",
)

stream = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "你好"}],
    stream=True,
)

for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

Node.js（`openai@4+`）：

```js
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://router.dog/v1",
  apiKey: "sk-xxx",
});

const res = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hi" }],
});
```

Anthropic SDK：

```python
from anthropic import Anthropic

client = Anthropic(
    base_url="https://router.dog",
    api_key="sk-xxx",
)
msg = client.messages.create(
    model="claude-4-sonnet",
    max_tokens=512,
    messages=[{"role": "user", "content": "hi"}],
)
```

---

## 五、常见问题

**Q：客户端里下拉选不到我刚加的模型？**
大多数客户端启动时会缓存 `/v1/models` 的结果。在客户端里点"刷新模型列表"按钮，或退出重进。

**Q：返回 `model_not_found` 但后台渠道明明有？**
依次检查：
1. 当前令牌（sk-xxx）的"可用模型"白名单里有没有这个模型；
2. 当前用户的分组是否在渠道的"可用分组"白名单里；
3. 渠道是否启用；
4. 有没有拼写差异（大小写、连字符）。

**Q：流式输出中途断开？**
上游响应慢、单次无数据超过 `STREAMING_TIMEOUT`（默认 300 秒）会被网关切断。
- 换更稳定的渠道；
- 后台把 `STREAMING_TIMEOUT` 改大；
- 反向代理（Nginx）要开 `proxy_buffering off`。

**Q：想让客户端走 Claude 原生协议拿 prompt cache？**
客户端 provider 选 "Anthropic"（而不是 OpenAI Compatible），Base URL 不加 `/v1`，直接填 `https://router.dog`。网关会把 `/v1/messages` 路径透传并把 `cache_control` 字段带到上游。

**Q：图片 / 音频接口超大请求失败？**
默认请求体上限 32 MB（`MAX_REQUEST_BODY_MB`）。4K 图的 base64 经常超，调大此变量重启即可。

**Q：多 Key 轮询怎么配？**
在后台新建多条同类型的渠道，Key 各填各的；给相同的"优先级"和不同的"权重"，网关会按权重随机分发，其中一条挂掉会自动跳到另一条。
