# Current distribution note — 2.0.6

The original notices below are retained as historical provenance. The plugin archive does not include platform content, credentials, FFmpeg/ASR or NapCat. The host now provides separately managed components; NapCat is obtained unmodified from its pinned official upstream only after explicit Connect, and the FFmpeg-only media kit adds no ASR model. This repository does not mirror those components. Root THIRD_PARTY_NOTICES.md and licenses/upstream/LICENSE.md preserve the legal references in the unchanged license. Current installation evidence and unverified live-platform/model limits are in README.md. Existing host artwork/reference-rights qualifications remain; no blanket rights-clearance claim is made.

---

# 第三方来源与分发边界

本包的平台 transport、规范化、状态与权限代码为本次原创实现。未复制或捆绑下列外部项目的源码、客户端、账号数据或运行组件。

只读研究来源（固定历史提交，非当前版本兼容承诺）：

| 来源 | Commit | 研究内容 |
|---|---|---|
| Yuuyuko-uu/dsh-qq-bridge | 29b218cebcc83c2bb37600976749ed02dbe498d6 | 原生 DSH 清单、OneBot HTTP 消息形状与旧轮询限制 |
| Derpyu520/qq-bridge | a56164e70a0521a7829138a42eee76066fde2b8b | OneBot WS事件、媒体段、发送回执和旧DSH接线限制 |

以上本地历史快照的实际 LICENSE 文件当前缺失；package 的 MIT 字段及历史 manifest 不能替代本次复制许可核验，因此没有将其代码复制入本包。

宿主桥、DSH页面注册方式沿本项目 Source10。LICENSE.md 由整合根任务从本地现行项目许可逐字节保留。Node运行环境与 React/DSH运行库由宿主提供；插件包不包含第三方 QQ 后端或原生 QQ 客户端。选择/分发 SnowLuma、NapCat 或其他运行组件前须另核固定版本的正式许可。
