# Agent Fabric G1 本机开发与验证子批次

## 授权、来源与停止点
2026-10-05 用户明确批准本机测试基线，要求先实现、集成并单独验收不依赖真实模型 API 或远端服务器的工作。最新范围以 answer:g1_clients_identity:2 和 answer:g1_model_budget:1 为准；先前完整 G1 准备资料及 14 个拟工作包作为后续路线图保留。
模型服务及 API 预算先交付建议和费用测算，必须等用户实际确认后才能启用收费调用。当前默认及本批实测模型费用为零收费调用；native 宿主和注册评审的历史用量另行保留，未知不改记为零。
本批完成仅声明 G1-local 的已验收能力，停止于本机子批次；不能把本机结果宣布为完整 G1。远端环境、真实模型、实物手机、正式登录、签名分发仍待验证。模型建议待确认不阻塞本机实施。

## G0 保留与兼容
G0 已验收候选 sha256:bddaaf167c89a606c06957d792398d6aeb4931e81c41eede376886ae3b5863d4，197 个通过测试、102 个强制 oracle 分支、3 项正式独立评估及全部旧失败/修复/验收记录保留为历史。
已知旧控制器累计时间 1677 秒；宿主完整 token/费用未知。不能重置历史或伪造总体成本上限。
原规划文件、G0 保护定义/runner/checker、原锁文件、原证据不改写。新增实现采用增量模块、独立客户端构建配置和依赖锁；原 G0 全套继续回归。原生引擎所有权、Space/当前授权、Stop fencing、unknown 不盲重试、禁止模型授权等不变量不变。
来源：docs/evidence/g0-acceptance-index.md、docs/evidence/g0-evidence-manifest.md、docs/operations/g0-quickstart.md、docs/operations/g0-recovery-procedure.md、docs/planning/decision-register.md。

## 已确认环境与尚未核查
本机 Mac arm64、Node 22.22.3、pnpm 10.18.0、Xcode 26.2、Android SDK/ARM64 Android 36.1 Google APIs Play Store 镜像及一个 Android 虚拟设备配置存在；是否能启动、构建、安装和交互需要实际验证，存在文件不等于通过。
本机 Docker 引擎已读取版本；实际数据库/持久层和其它本地服务由架构与交付人员选择、启动并验证，不推定远端资格。
用户已给出远端连接信息与本机私钥引用；SSH 沙箱网络失败，外部权限请求被用户中止，没有成功连接。当前子批次不重试 SSH、不部署远端、不申请云资源、不读取或复制私钥内容。
仅使用合成测试数据。本机测试身份与分开的操作者/审批身份可以实施；它们是测试配置，不能替代正式 SSO 或真实企业用户验收。

## 本地需求与验收义务
下列 G1-LR 为本子批次局部 ID，不取代 AF-01–20、UX-01–18 或完整 G1 的 G1-R01–12。

| ID | 行为与验收要求 | 来源/关联 |
| --- | --- | --- |
| G1-LR01 | 隔离于 G0 的可重复本机开发/构建基线、增量依赖与许可证登记；G0 历史和保护文件哈希保留，全套原回归通过 | 用户答案；package.json；G0 quickstart |
| G1-LR02 | 明确标记 deterministic-test 的模型适配器，固定输入/脚本产生确定性事件与测试用量；默认无供应商/网关调用、没有收费凭证需求；未确认真实 route 时拒绝启用，测试模式不能报告真实计费或能力资格 | answer:g1_model_budget:1；AF-02/06 |
| G1-LR03 | 本机测试登录、服务器派生 actor/Space/payer、操作者与审批身份分开；当前权限、双端分享/source audience、跨 Space/撤权/审批过期拒绝并有行为检查 | 测试基线；AF-03/16；G0 authority |
| G1-LR04 | 可运行的 loopback HTTP 服务与真实客户端 SDK：服务端 Task admission、Ask/Plan、命令幂等、状态/事件游标/结果；客户端无法自授 actor/Task/approval，静态样例不冒充活 API | 用户本机实现；client/module contracts |
| G1-LR05 | 本机数据持久与恢复、提交/outbox/版本一致性及结果文件边界；明确实际后端及生产适配迁移边界。allowed/denied/crash/restart/partial/duplicate 检查，unknown 不盲重试，纯 replay 零模型及零写效果 | record-authority/native-engine；G0 recovery |
| G1-LR06 | 原生 Session/Task/Run 流程与模型测试适配器集成，支持版本化 Plan、显式等待/确认、合成 artifact/check/result；本机模拟效果必须清楚标记，不授工作站 shell/Computer 权限、不自动 worker enrollment，不虚构远端 Act/VM 资格 | AF-01/04/05/09；D-03/10；用户本机子批次 |
| G1-LR07 | Stop 与当前权限/fence/幂等绑定，旧进度允许合法 Stop；断线未送达明确可见，重连不自动提交草稿或重新派发未知效果 | AF-19/20；UX-08/09 |
| G1-LR08 | 真实 Web 客户端，本机 HTTP 服务驱动登录、Space/Task、Ask/Plan、模拟 Run、结果、Stop、失败/等待/重连状态；按已有设计资料实现可操作页面，不仅构建或截图 | 用户本机基线；UX-01–18 |
| G1-LR09 | 可在本机运行的 Electron 桌面薄客户端，共享后端/SDK，受限 IPC、禁 Node renderer、context isolation、sandbox、受限导航与预览；实际启动/交互或具体能力阻塞均如实记录 | D-06/E-01；客户端合同 |
| G1-LR10 | Android 虚拟设备上的移动客户端开发入口/构建与同后端 Task/Stop/结果集成；真实模拟器启动/安装/交互需实际结果，不能把浏览器 mobile viewport 当原生运行，也不能替代实物手机、桌面真睡眠接管或签名分发 | 用户问答；D-06/E-01；客户端合同 |
| G1-LR11 | 模型服务建议、官方当前资料与计价来源、明确 workload/token 假设的费用测算（输入/输出/缓存/重试/币种/额外服务分别列明）、建议额度与启用审批清单；未确认路由/地区/费用只作为提案，本批零收费调用 | answer:g1_model_budget:1；O-05 |
| G1-LR12 | 本机独立验收矩阵、实际构建/功能/集成/恢复与必要 UI 交互记录、当前候选绑定的正式安全/代码/需求评估；本机已验证与完整 G1 待验证严格分列，完整 G1 14 工作包和原验收义务继续保留 | 用户独立验收；原 evidence/decision register |

## 实施组织与依赖
同一 G1 native 团队建立独立命名的 G1-local 执行工作流，保留准备阶段问答、历史和累计控制器记录；无需更换 team 来规避限制。
协调者先在 INTAKE 提交完整工作流/角色选择/精确文件合同/检查，再派发隔离的实际专业 worker。架构、公共接口和本机构建基线先行；服务端持久层/身份/模型测试适配器/HTTP 与 SDK 随依赖推进；再并行推进 Web、Electron、Android 和文档/费用建议；最后集成与本机专属正式验收。
按已冻结 max_parallel=2、宿主实际容量及 timeout=600s 协调；原标准不靠改门限通过。代码只在 controller 提供的工作副本编辑，由 Loop 导入；既有用户改动不重置/提交/删除。独立审查不能由实现者自己签名，专业咨询不算正式通过。
技术细节由工程团队选型并记录。若实际本机工具或验收能力缺失，先完成独立工作、保留成果，记录具体缺失与恢复条件，不将未运行测试记为通过。

## 本机行为场景与检查边界
1. 合法测试身份创建个人 Task，经 deterministic-test Ask 产生固定回答/Plan；另一表面用同 Task/revision 读取结果。模型模式、模拟效果与零收费调用在 API、UI、记录中可见。
2. 合法批准版本化合成动作得到结果；版本变化/撤权/跨 Space 泄露/未授权签名或模型内容不能变成批准。拒绝发生在适配器/效果回调前。
3. 同 command key 重复、lost ack、事件 gap/重复/乱序/过期游标，使用持久状态重连恢复；未发送草稿保持本地，unknown 不盲重试。
4. 当前权限合法 Stop 先推进 generation/fence，再阻止后续 dispatch；记录 already-in-flight 与“撤销已产生效果”的区别。跨 Space、撤权 Stop 被拒绝；同 key 重复 Stop 幂等。
5. 可重现的本地重启/部分提交/未知用量故障，实际 owner、持久层、预算和事件有明确断言；可用本地合成用量检查余额守恒但不能声称真实供应商费用核对。
6. Web/Electron/Android 各表面使用同一实际本机服务。每个实际交互记录环境、动作、Task/Run/版本、原始结果和限制；构建成功不能独自证明 UI 通过。
7. 必要浏览器/模拟器/签名/UI 或产品人工证据不可得时相关要求保持 pending。人类产品验收、生产 UI/load、实机、正式 SSO、远端 Linux/隔离/Act、真实模型与账单、正式签名和分发是完整 G1 后续门，不伪造或下降原标准。
8. 模型/网络隔离验证包括提供供应商地址/凭证或启用开关仍不能在本批触发收费调用；测试适配器不能自动 fallback。localhost 应用端口与本地测试服务允许，外部供应商/SSH/cloud 行为不属于此子批次。

## 后续完整 G1 保留清单
G1-01 环境/接口/资格、02 PG/UoW/RLS、03 正式身份/审批/audit、04 storage/volume/保留、05 engine/Temporal、06 真模型/FinOps、07 合格 Linux、08 真 Ask/Plan/Act、09 服务/事件 SDK、10 Web、11 Electron、12 实物 mobile、13 跨端故障/性能、14 正式全门验收继续保持原义务。局部增量可成为各包输入，不直接把本机模拟通过映射成部署资格。
尚未批准的服务/地区/API预算、云权限和周期预算、真实数据范围/备份保留/下载撤权、正式 SSO 与审批人、物理手机、正式证书/更新分发在后续执行前分别解决。用户已批准本机子批次，当前没有阻塞这一范围的业务问题；不等待这些后续条件才进行已授权开发。


# Approved evidence-only G1-local review recovery batch

Actual user approval on 2026-10-05: “批准证据接入与评审恢复批次（推荐）”. This approval accepts only evidence import and the same three independent registered assessments, each bounded to 600 seconds. Stop after G1-local acceptance. Paid models and SSH/cloud remain disabled; all full G1 pending qualifications remain pending.

Preserve all source, 14 G0 work packages, 197 G0 tests, 102 mandatory branches, all 8 G1-local task records and 15 collected specialist assignments, original criteria, historical failures and authenticated assessments, actual answers and cumulative usage. The current G1-local source digest is sha256:b901f53b806e2499035704037d000a023dd4436f5a98921db161bdc7ec50e85e. The pre-recovery whole candidate is sha256:06da7b6d32c7a491e0091bab10102203bf02f006155e278a76f13ec41a2f0d78; prior team team-b8733841c4e64668b730d6e5f132581d, final child run-0e6eb1baf84e4500878995355e8365db. No earlier checks become current merely through carry-forward.

Local behavior is implemented and the original command checks passed at the current checkpoint. Security assessment remains inconclusive solely for retained screenshots outside its authorized review copy (SEC-G1-EVIDENCE-001). A fresh reviewed batch may add exact unmodified 87 original JPEG screenshots and one original selected-tool-record ZIP under docs/evidence/g1-local-raw/, update the existing two acceptance indexes, and then run the unchanged G1-local and G0 check commands plus registered security/code/requirements reviews on one exact new integrated candidate. The prepared exact-path/hash/byte manifest is /private/tmp/agent-fabric-g1-review-recovery/attachments-manifest.json. Full original ZIP hash 487afe79ffc22042bd52ccc277ca984a851515c10e5903d2d07f94b235b5489b; 472 actual provider call/output records, 236 calls, 87 original screenshots. All 88 attachments have been copied and byte-hash verified, total 24,802,125 bytes.

The completed implementation and frozen checkers are read-only in recovery; no modification of tests, oracles, acceptance criteria, source, G0, paid-route policy, production qualification or review independence is authorized. Acceptance indexes are evidence indexes, never self-issued formal pass. Missing capabilities cannot be waived. Source-scope hashes remain b901; the whole-candidate digest changes to include byte-bound evidence.

For transport of these fixed files only, configure sufficient bounded binary proposal bytes (40 MiB response ceiling); this is not a model-context or model-token increase. Original formal review effective time remains 600 seconds. Preserve prior recorded controller use: final child 297 seconds and 2 iterations already consumed out of 2400 seconds / 12 iterations, with tokens and cost unknown and 1,615,320 known partial executor tokens. Recovery has at most the remaining 2103 seconds / 10 iterations, no new token/cost cap, and must retain all original usage records. All host-chat and native-agent global costs remain unknown. Other completed implementation-task usage remains separate historical usage; no zero-cost claim.

Only actual COMPLETE and final_candidate_current=true with all original checks plus three registered independent passes on the same candidate constitute local acceptance. Preserve prior team and controller history by cancellation/archive of the unfinished review entry before explicit preset reinitialization. Do not delete or overwrite historical state. New setup archives prior controls, retains the same private state directory, and launches no agents by itself.


## Reviewed input preparation after protocol preflight

The initial evidence-recovery admission team-b821e9da64074adcacbe30a75677f063 executed no proposal, model review or command checks and was archived after observing the protocol's fixed 1 MiB binary-file/proposal caps. All original88 files are now prepared in their approved docs/evidence/g1-local-raw/ paths as exact external evidence inputs, before any active controller freeze. This authorized input preparation imports no implementation code and claims no pass. Every file hash is checked against the approved manifest. The new batch snapshots these pre-existing read-only inputs; its only generated changes are the two acceptance indexes, within the original protocol limits. All original90 delivery paths remain required actual outputs and all original6criteria/5checks remain unchanged. The prior final297s/2iterations and the archived zero-execution admission remain historical;2103s/10iterations remain the execution envelope.

Set bounded project/scenario metadata context to512 KiB only to carry the expanded input manifest/role contracts; registered reviewer model context and effective600s time remain unchanged. Snapshot perfile16MiB/total100MiB and the reviewer max_request_bytes1MiB remain. No binary protocol limit is weakened and no changed-source proposal bypasses the controller.

Actual archived recovery entry retained2s of controller bookkeeping,0proposals/0reviews/0command checks. Remaining original final budget is now2101s/10iterations; historical wall total438s for local task controllers and this recovery entry. All host total costs remain unknown.
