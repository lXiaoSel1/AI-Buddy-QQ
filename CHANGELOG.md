## 2.0.6 — 2026-11-01

- Publish an independent, self-contained source repository and fixed development toolchain; update installation, permission, retention and verification boundaries.
- Functional baseline remains 2.0.5. Bridge, capabilities, contract hash and data schema are unchanged. This patch does not claim new live platform or model acceptance.

## 2.0.5 — 2026-11-01

- Refresh the selected conversation and conversation list together while retaining unsaved settings.

# 2.0.4

- Add host-verified memory-only compensation for actual successful QQ sends, including restart recovery and a scoped manual memory retry. Never resend an unknown or completed platform send.
- Show remembered, memory pending and needs review beside actual successful sends. Original identity, account and send time remain fixed.

# 2.0.3

- 新增 QQ 默认及单会话的“继承 / 简短 / 自然 / 详细”设置；保留角色口吻、允许名单和原模型绑定。
- 文字请求显式携带宿主核实的发送者、@目标与引用状态；补齐合法 CQ at/reply 与数组输入的一致解析。
- 取消与换账号使旧风格草稿/迟到响应失效；新风格按账号独立保存，旧 settings 仍可由 2.0.2 读取。
- 不新增模型、冷却、分句群发或自动 @；不改变协议 hash、权限或数据版本。
- 真实群入站到模型回复仍需另行实际验收，不以隔离通过代替。

# 2.0.2

- 没有 QQ 账号时直接进入设置第 1 步「用哪个 QQ 账号？」。以前每个账号有自己的数据库，没有账号时连读状态都被拒，页面显示红色「操作未完成…」「设置没读到」。其他读取失败改用黄色提示，技术详情里写错误代码。
- 绝不显示或发送角色 id：接管卡、头像、最后一条消息和发进 QQ 的「现在由…陪你聊天」都用角色目录里的名字；2.0.1 存下的 id 名字在读取时改正；找不到名字时写「当前角色 / 当前接管者」。
- 状态卡写「上次检查 … 通过」；「AI 酱启动时自动恢复」可以直接在状态卡上开关（关闭不需要宿主；打开需要 AI 酱 r9 及以后）。
- 允许名单：选中的联系人写「只回复」，群用多人图标，重复的群号会说明；通讯录在打开页面时自动读取。聊天：发送状态带对勾、时钟图标和颜色；标签带图标和会话数。
- 页面自己滚动；角色头像显示宿主给的图；扫码登录或删除账号后自动重新读取。
- With no QQ account the page opens on setup step 1; a character id is never shown or sent (names come from the character list, stored ids are corrected); last check and a resume-on-start switch on the status card; send-status icons, tab counts; the page scrolls itself.

# 0.1.0-dev.6

- 显式连接时恢复已保存账号的运行通道，并由宿主重新核对原角色、人生与操作归属；重启后无需先重复点击角色绑定。
- 合并重复连接，拒绝迟到绑定和身份变化；不改变自动恢复授权、允许名单、历史或工作权限。
- Explicit reconnect now restores the saved managed channel and verifies the same operator scope; concurrent clicks coalesce and stale results cannot reconnect after cancellation.

# 0.1.0-dev.2

- 修复最终租约校验与发送/工作转交之间的微任务撤销竞态，取消不冒称已送达或已撤回。
- 修复预提交租约失败占住批准请求、断连未提交分类、无效发送回执误报成功。
- 修复旧 WebSocket 延迟事件污染新连接、登录探测中退出后仍启动连接的生命周期竞态。
- 修复托管连接 open 中退出后的旧 epoch/连接残留，引用读取与发送显式携带原签发上下文、租约和身份范围。
- 拒绝不同任务/计划的工作回执；经历写入仅在 recorded===true 且无 recorded/stored/accepted/ok 显式 false 时确认，缺/负回执保留待处理，不冒称已进入本体。
- 最低 writer 升为 0.1.0-dev.2；旧包和测试证据保留。新增失败复现与修复后测试均为 Mock，无真实 QQ/模型/APP 测试。

# 0.1.0-dev.1

- 新增独立 QQ连接原生 DSH 包入口、设置与本地时间线页面。
- 新增原创 OneBot v11 WS/HTTP适配、托管宿主事件队列适配和分类型消息规范化。
- 新增 SQLite 持久去重、重连新 epoch、接管代次、在途撤销、unknown 发信保留和历史保留。
- 新增允许名单、分开的群响应/主动规则与主人私聊工作转交；不内置工作执行器。
- 交付提案合同 Mock测试；真实本体、QQ账号、媒体识别、工作执行和联合安装未验收。
