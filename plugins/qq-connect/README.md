# AI Buddy QQ / QQ连接

`@ai-buddy/qq-connect` **2.0.8** · AI Buddy **>= 2.0.2** · source-available: Apache 2.0 + Commons Clause.

让指定角色通过宿主受管理连接回应你允许的 QQ 会话，保留角色口吻、独立回复风格与实际发送回执。此版本沿用本机 2.0.7 的已验收功能；桥接、协议 hash、权限与数据格式不变。

## 安装、连接与授权

在 AI 酱的扩展目录选择「QQ连接」，核对版本并安装、启用。AI 酱不另建服务账号、不代注册。用户明确点击连接后，宿主按需准备固定版本的 **NapCat 官方上游原组件**并扫码登录；本仓库不镜像、修改或捆绑 NapCat/QQ 客户端。已有手动 OneBot 配置仍可由高级连接使用。

安装、更新或仅扫码不会自动开始聊天、模型请求或工作任务。默认关闭；选择接管角色、账号与允许名单后才启用。QQ 接管角色独立于 APP 当前前台角色，模型优先使用接管角色的专属绑定，否则按宿主既有默认规则处理；不暗中换模型。Cookie、Token、登录态由宿主管理，不进入模型、页面、日志或插件包。

## 回复与记录

- 联系人、群分别允许。群默认只响应结构化 @ 或宿主验证的“回复本账号”；自然参与和主动问候需要各自授权。群管理员、昵称、普通文本、转发/引用、OCR、网页或模型内容不能授权主人工作。
- QQ 默认与每个会话可选「继承 / 简短 / 自然 / 详细」，优先级为会话覆盖 → QQ 默认 → 通用风格，不强制截断或设置新 token 上限。取消、换账号使旧草稿与迟到响应失效。
- 发送者、@目标和引用上下文使用宿主核实身份，稳定 QQ ID 用于归属，昵称仅用于称呼。模型能识别何种图片/链接/表情/卡片取决于连接和模型实际能力；无能力或证据不足时明确未知，不冒称识别。语音/音频没有自动 ASR 保证。
- 每次显式连接/重连创建新 epoch，不补取 QQ 历史或离线缺口。平台消息持久去重；断连/换角色取消旧队列。发送前重验许可与代次，同一实际回复只发送一次，不分句广播。
- 完整结构化模型来源保存在本地独立表，APP 可展开查看，QQ 最多追加 3 个真实来源链接；原始收到的消息保持。实际平台发送成功、对方已读、经历已记住是不同事实。超时/断连发送保持 unknown，不盲目补发；成功发信后的经历补记只恢复记忆，不重发 QQ，不再调用模型。
- 消息、时间线、outbox、来源和经历保留原账号/会话/角色/人生。停用和正常退出关闭连接与监听；卸载默认保留 SQLite 历史和宿主经历。schema 1，minimumWriter `0.1.0-dev.2`；旧 writer 必须拒绝，数据库恢复不会撤回真实消息或回滚经历/钱包。

## 主人工作与普通聊天

主人工作需宿主核实的主人私聊或 APP 权限；群内任何身份都不够。QQ 只转交 `owner.work.propose/read/approve/cancel`，不拥有 `work.host`，不内置 Codex/Claude/DSH 工作执行器。相同任务/计划版本的批准与取消持久去重，pending/submitted/unknown 不重放。

Work 插件不在本轮公开安装集合中。未装、停用或不具工作权限时显示该能力不可用，普通允许会话的 QQ 聊天仍独立可用；扫码、接管角色和允许名单均不等于主人工作授权。

## 验证与开发

已接受的导出前基线为 core 2829 项（2825 pass / 4 skip）、social 480 项（476 pass / 4 skip），真实 Electron 中的 3 个合成阅读场景，以及正式安装后两个插件实际加载。不是本仓库的新测试计数，也不等于真实 QQ 登录、入站→模型→出站、真实媒体语义或对方已读验收。未用真实账号、付费模型或历史入站重放来补做本次源码导出。

独立开发固定 Node **24.21.0**、npm **11.19.0**、esbuild **0.28.2**。在新 checkout 执行 `npm ci`、`npm test`、`npm run build`、`npm run verify:artifacts`、`npm run repro`；不用私有宿主或兄弟插件源码。`TEST-SCOPE.json` 说明哪些测试需要私有宿主/布局工具而未导出，保留的服务、客户端、OneBot 和共享测试使用隔离 fixture；源码与打包哈希由 `PUBLIC-SOURCE.json`、`SOURCE-INPUTS.json` 绑定。详见仓库 `docs/DEVELOPMENT.md`、`docs/VALIDATION.md`。已冻结或发布的包同版本不替换字节。

## English

AI Buddy QQ 2.0.8 connects an explicitly selected character to allowlisted QQ conversations through the host. It requires AI Buddy >= 2.0.2. AI Buddy creates no extra service account or platform signup. Only explicit Connect prepares the pinned, unmodified official NapCat component and starts the user's scan-login flow; this repository does not mirror or bundle it. Installation, updates and scanning alone grant no chat, model or owner-work permission. The plugin starts disabled and contains no credentials or QQ runtime.

Conversation reply style overrides the QQ default, which otherwise inherits the general style. Verified sender, mention and reply context preserves identity. Media interpretation depends on actual backend/model capabilities and metadata; unsupported audio or visual content is not presented as understood. New connection epochs consume only new events, not platform history. Durable deduplication and send receipts distinguish actual delivery, unknown sends, read status and memory completion. Memory-only recovery never resends a completed/unknown message.

Owner work needs separately verified owner scope and a compatible installed Work plugin; Work is excluded from this public installation set and its absence does not block ordinary QQ chat. Group roles, quoted content and model output cannot authorize work. Uninstall retains history by default. The accepted integration baseline had core 2825 pass / 4 skip, social 476 pass / 4 skip, real Electron synthetic-scene checks and both plugins loaded after a formal install. It did not accept a real QQ inbound -> model -> outbound roundtrip. This release keeps the accepted local 2.0.7 functional baseline.

Source is available under Apache 2.0 **with Commons Clause**, subject to unchanged `LICENSE.md`. Existing third-party notices and host artwork/reference-rights qualifications remain; this repository does not claim all such rights are cleared. [Host](https://github.com/lXiaoSel1/AI-Buddy) · [Extension directory](https://github.com/lXiaoSel1/AI-Buddy-Extensions) · [Plugin source and releases](https://github.com/lXiaoSel1/AI-Buddy-QQ).

## 2.0.8

沿用已验收的本机 2.0.7，公开设置撤销与异步回复竞态修复。旧记录、发送回执、授权边界、权限、合同与数据格式保持原值。本轮仅使用新版本及正式下载身份，不增加业务行为。

Publishes the accepted local 2.0.7 settings-revocation and asynchronous-reply race fix. Existing records, delivery receipts, authorization boundaries, capabilities, contract and schema are preserved. This preparation changes only release identifiers and documentation.
