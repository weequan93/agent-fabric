# G0 实施计划

本文件交付的是未来实施计划。用户本批授权为完成 G0–G5 路线图、G0 工作包、决策登记及需求追溯；计划交付是停止点。本批不创建产品代码、不部署、不调用真实模型或云资源。下面所有代码、迁移、测试和运维路径均为建议新增产物，尚未实现；工作包的验收与完成门均是未来要求，没有产品测试通过记录。

产品依据为 [v1.1 主规格](../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md)，尤其 §6–15、25–32。总阶段见 [路线图](roadmap.md)，待决事项见 [决策登记](decision-register.md)，AF-01–AF-20 与 UX-01–UX-18 的逐项关系见 [需求追溯](requirements-traceability.csv)。这些编号保持原义，不以计划文件存在替代行为验收。

## 范围、前置条件与证据边界

当前仓库没有应用代码、包清单和产品测试基线。TypeScript、Temporal、PostgreSQL、React/Electron、React Native/Expo、LiteLLM、OPA/OpenShell 是主规格的实施方向，具体版本、许可证、运行能力和部署资格未验证。本文件不声称已经选定或运行这些版本；实施批次先验证工具与锁文件，失败时登记具体不兼容项。

G0 建立拥有自己语义的原生引擎、确定性契约、权威记录、边界威胁模型及受保护评估基线。服务可先作为模块化核心；不为每个逻辑框增加独立服务，不引入另一个 planner、memory authority 或重试引擎。

开始实施前，由协调责任人把下列角色映射到实际负责人并登记写入权、审查权和验证身份：引擎/控制、客户端/设计、身份/安全、运行时/SRE、数据/记忆、模型平台/FinOps、验证/Reflect、产品验收。角色不代表已经存在的人员或团队规模。实现者不能签发自己的独立受保护检查；没有所需注册评估能力的条目保留 pending。

G0 的确定性替身和故障夹具可验证软件状态、schema、scope、digest、原子预算、幂等、replay、unknown settlement 与 fencing。替身通过不证明真实 host/kernel/image、进程/文件/egress 隔离、SSO、provider 使用量、三端交互、卷恢复或敏感浏览器隔离。G1 必须验证真实 runtime/model route、基础安全和 web、desktop、mobile 三个薄而真实的客户端。G3 实现 computer use 与所有冲突 mutation 路径的接管屏障，G4 实现 Reflect 独立评估、出版与 rollback；G0 为这些模块提前定义可测试协议，不提前宣称产品完成。

## 接口先行与权威归属

G0-01 先决定边界，G0-02 冻结公共协议，再开启依赖实现。协议必须共同定义 immutable tenant/Space/Task/Run ID、TaskEnvelope、command/event version、operation identity、approval digest/expiry、fencing generation、budget reservation、ArtifactVersion、CheckReceipt、DeliveryOperation。普通命令绑定当前身份、目标、expected revision、expiry 和作用域内幂等键；Stop/revoke 是单调例外。API、客户端和适配器不能各自定义另一套任务状态或授权规则。

| 记录 / 数据 | 单一权威 | 派生或存储边界 |
| --- | --- | --- |
| Space / Membership / source audience | 身份与 Space 服务 | 缓存必须带权限修订并重新验证 |
| Task / Run / AgentSession | 原生 controller / kernel | Temporal 拥有 workflow history；原生 workflow code 拥有任务语义，PostgreSQL 查询投影可重建 |
| Action / Approval / Budget | 可信效果、批准、预算 broker | 操作与 reservation 使用事务性记录；客户端标签不能选择 payer |
| ArtifactVersion / CheckReceipt | 产物服务 / 独立 verifier | 对象字节与 manifest 确认后才发布；worker 日志不能成为受保护证据 |
| MemoryRevision / RetrievalManifest | 记忆服务 | 索引可重建；相似度不授予权限或真实性 |
| Reflection / BehaviorRelease | 独立评估与 release 路径 | 模型只能提议，纠正记忆不发布方法 |
| Runtime / DriverLease | 生命周期 broker | 分离 Space binding、实例、资源 lease 与 fencing generation |

大 payload 存在产物存储，不进入 workflow history。跨存储使用幂等 outbox 和 reconciliation。聊天不是 command queue，tool log 不是 approval，snapshot 不是数据库事务，屏幕录像不是 replay 授权。架构与实现文档由对应工作包唯一拥有，跨包修改需原 owner 协调，不重复声明文件归属。

## 工作包

### G0-01 架构、权威记录与威胁边界

- 负责：架构牵头，身份安全、数据与运行时参与；独立安全审查确认威胁覆盖。
- 前置：无。
- 产物：`docs/architecture/native-engine.md`、`docs/architecture/record-authority.md`、`docs/architecture/interface-registry.md`、`docs/security/threat-model.md`。
- 正向：明确 conversation、computer、external-effect 三种执行类；每类记录、调用路径和失败域有一个权威 owner；规定 no-VM Ask、assigned ComputerAssignment 和个人/群组边界。
- 拒绝：模型、客户端、session worker、插件、查询投影均不能生成预算、approval、有效 CheckReceipt 或 release grant；不把 worktree、串行锁、协议兼容或硬件标志当作隔离证据。
- 恢复：每类记录说明恢复顺序、tombstone 和重新授权入口，未知外部效果先 reconciliation，禁用恢复时重放写操作。
- 完成门：所有核心记录和 adapter 均有权威、接口、错误、并发与恢复条目；影响授权/效果的未决接口为 0；独立审查状态和剩余部署假设真实登记，文档审阅不能冒充部署安全通过。

### G0-02 构建基线与公共类型契约

- 负责：引擎/控制牵头，API、数据、安全与适配器 owner 共同确认；独立验证 owner 编写并审查受保护 oracle，实现者不能改变其断言与阈值。
- 前置：G0-01。
- 产物：`package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`tsconfig.base.json`、`tsconfig.json`、`engine/contracts/src/identity.ts`、`engine/contracts/src/task-envelope.ts`、`engine/contracts/src/commands.ts`、`engine/contracts/src/events.ts`、`engine/contracts/src/adapters.ts`、`engine/contracts/src/budget.ts`、`evals/fixtures/g0-oracle-definition.json`。
- 正向：选择经过本地验证的构建版本，锁定安装结果和兼容范围；typed envelope、command、event、capability 有版本与序列化例子，schema 往返保持语义。pnpm 配置和锁文件是候选构建方案的拟定路径；工具资格试验若改变方案，由本包 owner 同步修订路径与依赖。先形成锁，再在干净副本验证冻结锁安装与类型/fixture命令，不能假设尚不存在的锁可用。
- 拒绝：未知必需字段、不支持的安全能力、缺失 source audience 和部分流式工具参数显式拒绝；manifest 不授予权限，provider 翻译不静默丢弃必需特性。
- 恢复：旧事件通过显式兼容/迁移或拒绝，不能默默降级；每个 Run pin engine、behavior、schema、environment 版本；升级仅在验证边界进行。
- 完成门：实际受支持构建环境中类型检查成功；必选 schema 正/负例全部符合预期；预算 reserve/settle/unknown 接口由控制与 FinOps owner 确认，受保护 oracle 由独立验证 owner 在依赖实现前冻结；锁定依赖和许可证/更新责任进入候选证据包。具体包版本此前仍为待验证。

### G0-03 Space、身份、意图与有效权限

- 负责：身份/安全牵头，Space 与数据 owner 实现；安全 verifier 独立检查。
- 前置：G0-02。
- 产物：`services/spaces/src/bindings.ts`、`security/identity/src/actor.ts`、`security/policy/src/effective-authority.ts`、`evals/safety/space-authorization.test.ts`。
- 正向：权限是 enterprise、Space、role、TaskEnvelope、tool 与 runtime capability 的交集；个人/群组 Space 独立，source readable 与 destination shareable 独立验证；群组仅明确 trigger 启动，Ask/Plan/Act 为意图上限。
- 拒绝：伪造 tenant、payer、role、owner，跨 Space 非法关系、群组借私人连接权限、Ask/Plan 突然写入及认证/批准/权限互相替代均拒绝；authority 服务不可用时受影响读取与 dispatch fail closed。
- 恢复：membership/policy 修订使旧 capsule、缓存和待执行效果重新验证，撤销不被旧上下文或恢复镜像复活；当前授权允许的替代路径显示 waiting resolver。
- 完成门：正向允许例全部可运行，负向夹具未授权读取/dispatch 数为 0；明确 G1 SSO、实际目录 joiner/mover/leaver 与数据库隔离验证责任，替身权限判断不宣称身份系统已上线。

### G0-04 权威记录、产物提交与跨存储一致性

- 负责：数据/记忆牵头，产物与控制 owner 共同审查，SRE 定义恢复边界。
- 前置：G0-01、G0-02、G0-03。
- 产物：`infra/migrations/0001_core_records.sql`、`services/artifacts/src/commit-manifest.ts`、`services/spaces/src/outbox.ts`、`evals/recovery/storage-commit.test.ts`。
- 正向：记录带 tenant/scope，关联匹配所有权或显式分享 grant；原子 outbox 与权威 mutation 一起提交，artifact 字节和 manifest durably confirmed 后才发布；derived index 可重建。
- 拒绝：未提交 upload 不发布；volume snapshot 不充当数据库事务；memory commit 不声称 live files 已保存；工作进程不得持有数据库 owner、superuser 或 BYPASSRLS 权限。
- 恢复：重复 outbox job 幂等；延迟任务重查 deletion/authority；孤立 upload 隔离或按策略清理；恢复先应用 revocation/deletion tombstone，后开放读取/rehydration。
- 完成门：确定性 crash/重复投递/提交缺失夹具全部符合权威规则；迁移与恢复次序有可审阅规范；真实 PostgreSQL 角色/RLS、加密对象存储和卷恢复资格留给真实环境验证，不能由纯内存替身签发。

### G0-05 Task、Run 与原生会话状态机

- 负责：引擎/控制牵头，API 与验证 owner 审核状态表。
- 前置：G0-02、G0-03、G0-04。
- 产物：`engine/scheduler/src/task-state.ts`、`engine/scheduler/src/run-state.ts`、`engine/kernel/src/session-loop.ts`、`evals/fixtures/lifecycle-cases.json`。
- 正向：Task 记录目标/需求修订，Run 是一次尝试；queued/preparing、running/verifying、waiting、paused、cancelling/reconciling、succeeded/partial/failed/cancelled 具有明确定义；budget waiting 支持当前授权 top-up 后继续。
- 拒绝：terminal Run 不重开；通知失败不能重定义任务结果；prepare proposal 不显示 published；普通回答不强加部署 gate；模型自报不能决定完成。
- 恢复：终态重试是新 Run，保留历史 evidence/charges；replay 重建 state，不重新请求模型、不执行 write tool；未知 effect 未核对不能让 model 继续。
- 完成门：状态表每条合法/非法 transition 都有夹具，全部符合预期；replay 的模型请求与写工具调用计数均为 0；controller 与 session kernel 分工经审查，不依赖竞争产品 harness。

### G0-06 命令 API、事件游标与重连

- 负责：API/控制牵头，客户端协议 owner 和安全 owner 审查。
- 前置：G0-03、G0-04、G0-05。
- 产物：`apps/api/src/commands/dispatch-command.ts`、`apps/api/src/streams/task-events.ts`、`engine/contracts/src/command-response.ts`、`evals/recovery/command-sync.test.ts`。
- 正向：accepted/rejected/requires-review 与操作完成分开；同一认证 scope 的幂等键返回同一 command identity；每个 event stream 有有序序号，snapshot+cursor 能恢复漏失事件。
- 拒绝：普通命令 stale expected revision/expiry 拒绝并返回授权刷新结果；comment 不能变成 reviseTask；不把 token streaming 当 committed result；客户端 owner/payer/role 字段不直接信任。
- 恢复：回连先查已提交 command 状态，失效 cursor 获取授权 snapshot；清除撤销本地记录；Approve/Publish/Resize/Restore 和 GUI 输入不得对 changed state 静默重发；unsent draft 不自动提交。
- 完成门：重复、乱序、cursor 失效、offline 控制等夹具全部符合预期，重复作用域命令身份数为 1；事件/响应共享同一 schema；真实 web/desktop/mobile streaming 和睡眠回连属于 G1，G0 不宣称已经跨端可用。

### G0-07 效果 Broker、批准绑定与未知结果

- 负责：效果执行牵头，身份安全/FinOps/产物 owner 共同定义 precondition；验证 owner 检查重复效果。
- 前置：G0-03、G0-04、G0-05、G0-06。
- 产物：`execution/action-broker/src/operation.ts`、`execution/action-broker/src/dispatch.ts`、`execution/action-broker/src/reconcile.ts`、`evals/recovery/unknown-effect.test.ts`。
- 正向：执行前保存 operation ID、精确 target、规范化参数 digest、artifact precondition、actor、policy revision、approval/expiry、budget reservation 和 execution lease；执行路径 receipt 决定 settlement。G0-10 完成前只使用 G0-02 冻结预算接口的受控替身，不调用真实收费步骤或产生外部效果，不建立第二套预算权威；G0-10 完成后在 G0-14 集成重验。
- 拒绝：改变 recipient/artifact/target/policy 使相关 approval 无效；过期认证/批准、partial streamed arguments 和未知高影响 effect 不执行；tool 名称允许不代表实际效果允许。
- 恢复：模拟远端写成功但 ack 丢失时进入 unknown；先 downstream lookup/idempotency/reconciliation；无安全去重能力时等待人工或领域恢复，不盲重试、不将 unknown 当 safely failed。
- 完成门：必选重复 effect 数和未授权 effect 数均为 0；ack-loss、approval drift、policy outage 均有明确 settlement/等待路径；Temporal retry 不被描述为 arbitrary external exactly-once，真实下游 conformance 在相应交付 gate 再验证。

### G0-08 Stop、撤销、fencing 与接管屏障协议

- 负责：引擎/控制牵头，运行时/安全与 desktop broker owner 协作；独立可靠性/安全检查。
- 前置：G0-05、G0-06、G0-07。
- 产物：`engine/scheduler/src/stop.ts`、`execution/action-broker/src/fencing.ts`、`execution/desktop-broker/src/mutation-barrier-contract.ts`、`evals/safety/stale-stop.test.ts`。
- 正向：Stop 绑定 immutable task/run、当前 stop authority、幂等键并推进 cancellation/fencing generation；进度 stale 本身不得拒绝。返回分别描述 accepted、dispatch fenced、processes terminated、external outcome unknown。
- 拒绝：旧 worker、旧 input lease 与旧 pending publish 不得越过新 generation；Stop-run 只针对该尝试，Stop-task 阻止新尝试；Stop 不宣称撤销已送邮件或已提交事务，input 断线不重放。
- 恢复：unreachable worker 撤销 authority，标 unknown/quarantined；replacement 使用新 generation；恢复先核对未知 effects/current grants，Stop-task 仅明确授权 retry 才解锁；重复同键 Stop 不产生另一个 command。
- 完成门：stale-view、并发 dispatch、重复 Stop、worker 替换夹具全部符合预期，新 generation 后旧 generation 写入数为 0。协议列全 shell/SDK/API/filesystem/browser/desktop 的冲突 mutation 路径；G0 不把单一鼠标 lease 当接管通过，G3 执行真实 all-path mutation barrier 验证。

### G0-09 Context 编译与模型 operating profile

- 负责：模型平台牵头，引擎、数据/记忆和安全 owner 审查。
- 前置：G0-02、G0-03、G0-05。
- 产物：`engine/context/src/compile.ts`、`engine/profiles/src/capabilities.ts`、`adapters/models/src/model-adapter.ts`、`evals/fixtures/model-conformance-cases.json`。
- 正向：context 由 typed records 编译，保留 scope/provenance/time/trust；authorize before retrieval、budget before invocation；记录实际 profile+manifest，no-VM Ask 仅使用获批 service 能力。G0-10 完成前只使用 G0-02 冻结预算接口与受控模型替身，不发真实收费模型请求；G0-10 完成后在 G0-14 集成重验预算拒绝、unknown usage 与恢复。
- 拒绝：敌意 web/tool/memory 摘要不能提权；缺必需 modalities/schema/cancel/usage 能力显式拒绝；不擅自跨 provider/region fallback；manual pin 未允许替代时 waiting，不将 Fast/Balanced/Thorough 当 authority。
- 恢复：安全边界切换使用 capsule，保留 requirements、uncertainty、失败方案、pending effects、checks 与下一安全动作；opaque reasoning/KV cache 保持 provider-scoped，权限修订后重新编译。
- 完成门：必选 capability/filter/cache-revision 夹具全部符合预期；Ask 夹具 Space VM 启动数为 0；真实 LiteLLM/provider 编码、streaming、计量与取消能力留给 G1 qualified route，不由 mock 结果认证。

### G0-10 原子预算、归属与统一重试

- 负责：模型平台/FinOps 牵头，控制与数据 owner 实现，独立验证检查并发账本。
- 前置：G0-04、G0-05、G0-07、G0-09。
- 产物：`engine/scheduler/src/budget-ledger.ts`、`adapters/models/src/retry-budget.ts`、`evals/recovery/budget-ledger.test.ts`。
- 正向：server-stamped tenant/user/Space/run/purpose 决定 payer；父子 reserve 同一原子 allowance，planning/embeddings/Reflect 属 task 或明确 maintenance allowance；estimated 与 settled、持久存储与 compute 费用分别表达。
- 拒绝：child 不能复制预算；engine/gateway 不能叠加重试放大；模型和 Reflect 不能提高 ceiling；shared VM 全额不能复制计入每个并发任务；延迟 metering 不宣传 exact invoice cap。
- 恢复：耗尽后不接纳新收费步骤，保存工作并 waiting budget；unknown usage 保留 reservation 后 reconciliation；top-up 后重查 grants；说明允许的 bounded in-flight overrun 规则仍待实际政策决定。
- 完成门：并发 reserve、release、延迟 usage、重复 settlement、top-up 夹具全部符合账本恒等式，重复 settlement 数为 0；真实 provider/gateway 延迟费用、quota 与共享 compute 分摊在 G1/G2 另行实测。

### G0-11 产物版本、受保护检查与交付分离

- 负责：产物与验证牵头，效果 broker、安全和产品验收 owner 确认状态语义；验证身份独立于实现者。
- 前置：G0-04、G0-05、G0-06、G0-07。
- 产物：`services/artifacts/src/version.ts`、`execution/verification/src/check-receipt.ts`、`execution/action-broker/src/delivery-operation.ts`、`evals/safety/protected-completion.test.ts`。
- 正向：draft/candidate/accepted、verification、DeliveryOperation 和 notification 独立；CheckReceipt 绑定 exact artifact digest、environment image、dependency lock、check definition 和 verifier identity。
- 拒绝：worker self-report 不生成有效 receipt；改动 invalidate 受影响 checks/reviews/approval；接受设计不批准部署；准备草稿成功不得伪称 delivered/deployed；agent 不能禁用 protected checks 或改评分规则。
- 恢复：draft 回连按 expected base revision compare/rebase/retain variant，不能覆盖 newer accepted version；unknown delivery 先 reconcile；notification 失败保留真实 task result；缺检查明确 unavailable/pending。
- 完成门：artifact drift、check spoof、并发编辑、delivery/notification 混淆夹具全部符合预期；没有独立 verifier 能力时不得宣布受保护检查认证通过，真实 executor/审批路径在 G1 或相应 effect gate qualification。

### G0-12 Runtime、Tool、Channel 与资格契约

- 负责：架构/运行时牵头，安全、模型平台和连接 owner 审查。
- 前置：G0-02、G0-03、G0-07、G0-08。
- 产物：`adapters/runtimes/src/runtime-adapter.ts`、`adapters/tools/src/tool-contract.ts`、`adapters/channels/src/channel-adapter.ts`、`security/conformance/src/qualification-record.ts`。
- 正向：定义 provision/qualify/inspect/suspend/terminate/transfer/delete、tool effect/schema/resource/grants/credentials/timeout/limits/reconcile、channel identity/audience/notification；qualification 带 version、tested deployment、date、expiry，extension pin digest/dependencies。
- 拒绝：缺强制控制、过期资格、unsupported security backend 显式拒绝 scheduling；不静默回退本机或不批准区域；MCP/ACP/A2A 不能代替授权、隔离、计费与 completion；额外 worker 默认不自动扩容。
- 恢复：capability loss 重新检查当前任务；需要 recreation 的 policy 标 pending，匹配 qualified generation 前不标 active；租约到期 privileged continuation 停止；实例替换不重用旧凭据。
- 完成门：adapter 替身的 lifecycle/capability-loss/schema 拒绝夹具全部符合预期；资格记录拒绝自声明代替部署 evidence；实际 Linux/OpenShell resource enforcement、host/kernel 支持和可显示控制范围在 G1 检验，更多 profiles/硬件在 G5 逐个 qualification。

### G0-13 用户状态、三端与后续模块协议

- 负责：客户端/设计与 API 牵头，数据/记忆、desktop broker、Reflect 和产品验收 owner 审查。
- 前置：G0-05、G0-06、G0-08、G0-10、G0-11、G0-12。
- 产物：`engine/contracts/src/presentation.ts`、`engine/contracts/src/memory.ts`、`engine/contracts/src/desktop.ts`、`engine/contracts/src/behavior-release.ts`、`docs/architecture/client-and-module-contracts.md`。
- 正向：统一表达 audience、intent、execution target、payer、sources、draft/check/delivery 状态、waiting resolver、费用状态和 safe next action；memory revision/retrieval/delete、Design version/preview、Dispatch schedule、Fleet lifecycle、desktop takeover、Reflect evaluation/release/rollback 有明确后续接口。
- 拒绝：offline Stop 显示 Not delivered，不虚报 Stopped；旧画面注明 last update；memory correction 不 release behavior；export 不创建原私源持续访问，private title 不向未授权 audience 暴露；archive/suspend/delete 不混为一个动作。
- 恢复：snapshot 恢复已确认结果，unsent draft 保留不提交，changed approval 要求 refresh/reauth；input reconnect 不自动 resume；source delete 使依赖 memory/candidate 重验证；behavior rollback 不复活撤销权限。
- 完成门：跨模块状态与 source/retention/intent 契约无冲突，正/拒绝/恢复例均可序列化；UX-01–UX-18 有可追溯后续测试入口。G1 才交付真实 web/desktop/mobile，G2 扩展 memory/Dispatch/Fleet，G3 实现 Design/computer use，G4 发布 Reflect；本包仅协议不是这些模块实现通过。

### G0-14 确定性基线、恢复评估与证据包

- 负责：独立验证牵头，安全/SRE/架构分别审查自身范围，产品验收确认需求映射；controller 决定正式 gate。
- 前置：G0-01、G0-02、G0-03、G0-04、G0-05、G0-06、G0-07、G0-08、G0-09、G0-10、G0-11、G0-12、G0-13。
- 产物：`evals/fixtures/g0-contract-suite.json`、`evals/safety/authority-boundaries.test.ts`、`evals/recovery/replay-and-fencing.test.ts`、`docs/evidence/g0-evidence-manifest.md`、`docs/operations/g0-recovery-procedure.md`。
- 正向：fresh fixtures 固定 inputs、check definition、candidate、lock 与环境，消费 G0-02 已由独立验证 owner 冻结的 protected oracle，不能为迁就实现调整断言或阈值；集成真实预算账本重验 G0-07/G0-09。逐项报告 pass/fail/pending、真实 evidence reference、责任人和限制；allowed work 被过严 policy 阻止也记录为失败。
- 拒绝：必选 release suite 中 cross-Space disclosure、unauthorized dispatch、duplicate effect、旧 generation 越权写入均为 0；agent 不改 protected thresholds，不将咨询、检查计划、同模型 review 或 unsigned host report 当独立认证。
- 恢复：checkpoint/restore、crash after remote write、ack loss、membership revoke、policy outage、预算 waiting、expired capability 和 replay 逐项验证；恢复运行先当前权限/tombstone、后 unknown reconciliation、再 continuation。
- 完成门：全部适用必选夹具符合预期；高严重度 authorization/isolation/stale-approval/duplicate-effect finding 为 0；必需独立评估缺失即 pending。证据包真实区分确定性替身、本地真实组件、实际部署和人工判断，未获得实际证据的 G1/G3/G4 条目不标通过。

## 分批执行与并行边界

以下是依赖顺序而非已执行日程；没有虚构日期、工时或负责人。每批结束先检查实际文件与接口，再释放下批。大包可分专业执行，但同一产物只有上述 owner 写入。

| 批次 | 工作包 | 交接条件 |
| --- | --- | --- |
| A | G0-01 | 权威、威胁边界与未知效果规则可审阅 |
| B | G0-02 | 公共类型/版本/构建基线、预算接口及独立验证 owner 的受保护 oracle 冻结后开放依赖实现 |
| C | G0-03，再 G0-04 | 有效权限与可恢复数据关系确认 |
| D | G0-05，再 G0-06；G0-09 可在 G0-05 后独立进行 | controller/state/API 一致，模型替身受同一授权边界 |
| E | G0-07，再 G0-08；G0-10 在 G0-07/G0-09 后；G0-11 在 G0-07 后 | operation settlement、Stop/fencing、budget 和检查引用公共协议 |
| F | G0-12，再 G0-13 | 资格/能力契约与模块/三端表示一致 |
| G | G0-14 | 集成重测并收集真实 gate evidence |

依赖有环或 shared file 双重写入时先回接口 owner 修正，不通过新增平行 authority 绕开。独立执行只适用于文件无重叠、接口已确认和资源允许的切片；worktree/snapshot 是冲突管理，不能作为恶意代码隔离。相关 candidate 变化后重跑受影响检查和必要独立评审。

## G0 未来退出证据与 G1 入口

G0 退出要求受版本控制的需求 checklist、架构/数据流/威胁变更、依赖和许可证清单、真实确定性测试结果、恢复 procedure、记录迁移/rollback 路径和下一门资格列表。每份结果必须绑定 candidate、环境和检查定义；所有未执行项明确 pending。高严重度授权、隔离、陈旧批准或重复效果缺陷阻止受影响 profile 发布。没有注册独立 evaluator 或必要人工 judgment 时保留未验收，不能把文件一致性检查替代产品验收。

进入 G1 前解决或为每项 spike 明确 owner/环境/验证入口：实际 Linux host/kernel/image 与 OpenShell 控制、认证浏览器隔离、shared-volume commit/snapshot、SSO/角色 bundles、gateway/provider modalities/streaming/retries/usage-delay/overrun、regions/retention/direct-link exposure 与 strict brokered revocation、客户端签名分发/SSO/streaming/input/accessibility。资料缺口和工程假设见决策登记；这些未知不阻止本批计划，但不能跳过相应真实资格门。

G1 的真实三端共同验收 no-VM Ask、隔离 computer task、intentional group trigger、current authority Stop、client sleep/reconnect、相同结果 retrieval、budget/approval waiting 和明确错误恢复。主规格 §29 的 warm-control-plane pilot 参数为 accepted-command p95 ≤2 秒、可见状态传播 ≤3 秒、在线 Stop 接受后停止新 dispatch ≤2 秒、privileged lease 初始最大 30 秒；process termination、external outcome、cold start 与模型完成分别测量。它们是待测目标，不是 G0 虚拟时间夹具结果、服务保证或已经通过的性能结论。

本批实际检查范围仅为计划文件存在、38 个唯一原需求 ID、14 包依赖无环、产物唯一归属、字段完整与本地链接一致性。检查将由协调者针对收集后的实际候选运行；本文件尚不登记整体包通过，也不创造独立签名或产品部署证据。
