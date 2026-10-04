# Agent Fabric G0 实施批次

用户在本对话明确批准进入 G0 实施阶段：依据已验收路线图、G0实施计划和决策登记，保留原成果与验收历史，建立新的实施批次。先完成G0-01和G0-02，再按依赖推进其余包，持续实际实现、确定性测试、注册独立评审和需求验收，G0验收后停止。

## 已接受输入与批次历史
- 原团队 team-38a6d9ab4e99491b8c9c6e76d0c5f90d 已 COMPLETE，3/3任务；最终规划候选 sha256:b9f36873fe0de813349f48eee666fa9c11f684748b72b42c6ab09bce2d9d0e66。
- 产品契约：docs/Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md。
- 本批实施依据：docs/planning/roadmap.md、docs/planning/g0-implementation-plan.md、docs/planning/decision-register.md、docs/planning/requirements-traceability.csv。
- 所有历史资料、原规格、设计板和已验收计划文件保持原字节；新增实现、架构、安全、运维与G0证据文档记录本批状态。历史私有控制器记录不删除、不复用为新的通过证据。
- 本地实际可用 Node v22.22.3 / pnpm 10.18.0；依赖和测试工具由架构/build角色验证并锁定，不伪造版本资格。
- 真实专业责任映射到宿主实际agent；实现角色、独立oracle/测试角色、注册独立评估身份分开。主线程协调并串行集成。

## G0 范围
按G0计划的14包及精确未来产物实现拥有自己语义的TypeScript模块化native core。G0软件契约、状态机、确定性适配器、故障注入和受保护oracle是本批范围；产品后续阶段不自动加入。
G0-01 架构、权威表、接口登记、边界威胁模型。
G0-02 公共版本化类型/运行时验证、构建与锁文件、预算接口；独立验证owner在下游实现前冻结oracle与断言。
G0-03 immutable tenant/Space/actor身份、意图和有效权限交集；跨Space读与dispatch拒绝、撤权失效。
G0-04 SQL权威关系迁移、确定性产物提交/outbox和恢复协议；真实PostgreSQL/RLS/对象存储资格留G1。
G0-05 Task/Run/session状态机、终态新Run、预算等待、纯replay；模型自报不决定完成。
G0-06 command幂等/revision/expiry例外、accepted与completed分开、snapshot/cursor及安全重连。
G0-07 effect broker精确批准/参数digest/operation、unknown settlement先核对、不可盲重试。
G0-08 当前权限Stop、单调fencing、worker替换、所有冲突mutation路径屏障协议；不宣称真实进程隔离。
G0-09 权限先于retrieval、预算先于invocation、profile capability与provider边界、context capsule/no-VM Ask。
G0-10 单一原子父子预算账本、reserve/unknown/settled、server payer、统一重试与top-up。
G0-11 artifact版本、精确候选独立check receipt、delivery/notification分立、改动失效和并发变体。
G0-12 runtime/tool/channel资格与capability拒绝、expiry/lease/replace契约；缺强制控制不调度。
G0-13 memory/design/desktop/behavior与三端presentation协议；offline Stop不谎称已送达，事实纠正不发布方法。
G0-14 集成全部模块执行确定性baseline、safety/recovery/authority/replay/fencing故障场景，形成版本绑定证据、迁移/rollback与恢复程序。

## 依赖和执行
严格继承实施计划前置依赖。G0-07/09在G0-10之前仅使用G0-02冻结预算接口的受控替身；G0-10完成后G0-14必须集成真实G0账本重验。受保护oracle提前由独立验证角色制定；实现者不能为通过结果改断言或阈值。
主线程在冻结并发数与宿主容量内派发实际专业agent，精确文件无重复写入；及时收集、集成、检查、交接。native对话用量未知，不虚报花费。必须保持同一实施团队/子运行的累计限制。

## 验收
G0-IMP-01：14包精确产物均实际存在，架构/单一权威/接口和依赖一致。
G0-IMP-02：干净冻结锁安装、TypeScript类型检查与真实确定性测试成功；全部必选oracle用例被测试执行而不是仅数文件。
G0-IMP-03：正向允许、拒绝、故障恢复均有行为断言；跨Space泄漏、未授权dispatch、重复effect、旧generation越权写入为0；replay模型/写调用为0。
G0-IMP-04：预算unknown reservation、并发reserve、重复settlement、耗尽等待、top-up；未知外部写ack-loss不重发；revocation/tombstone先于恢复。
G0-IMP-05：38项AF/UX追溯保留产品分阶段义务；G0已实现契约与G1/G3/G4真实环境pending分开。新证据包提供实际命令、候选/锁/oracle/环境、结果和限制，不冒充外部效果认证。
G0-IMP-06：当前集成候选实际独立架构/安全/实现审阅及需求验收有合法注册评估证据，无高严重度授权/隔离/陈旧批准/重复效果阻塞；controller COMPLETE 且 final_candidate_current 才交付停止。
测试保护不得降级、删失断言、调整门限或用自签/咨询替代独立检查。可恢复错误先界定并修复；缺必要能力/权限/预算则保留准确阻塞和成果。

## 非目标与待验证事项
不实施G1 web/desktop/mobile产品、不连接真实SSO/cloud/provider、不部署、不发布或做真实收费模型试验；G0适配器使用可控的确定性替身。Temporal、Postgres、LiteLLM、OPA/OpenShell、对象存储和真实Linux/kernel/VM/browser资格仍由相应后续门取得真实证据，内存替身不会认证它们。
需要用户决定的问题最多三项一起提出；已批准的G0实现、安装测试依赖和常规本地工程取舍无需反复确认。真实外部地区、保留、账单overrun政策留后续门，不把设计占位符当决定。
