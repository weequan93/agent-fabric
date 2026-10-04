# Agent Fabric 工程路线图

版本：规划基线 2026-10-04。依据[主规格 v1.1](../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md)第 2、27、29–32 节及[设计交接包](../agent-fabric-design/README.md)。本文件是实施计划；各产品门均未实现、未验收。用户本批选择为“完成路线图和 G0 实施计划”，在计划包交付处停止。

阅读顺序：[G0 工作包](g0-implementation-plan.md) → [决策登记](decision-register.md) → [AF/UX 追溯](requirements-traceability.csv)。G0 是契约实现与验证基线，G1 是首个可用安全核心，后续门扩展其产品深度；所有阶段沿用同一权威记录和证据规则。

## 交付顺序与责任

```mermaid
flowchart LR
    G0["G0 契约与基线"] --> G1["G1 安全核心与三端"]
    G1 --> G2["G2 企业工作台"]
    G2 --> G3["G3 创作与计算机操作"]
    G3 --> G4["G4 治理式改进"]
    G4 --> G5["G5 合格扩展"]
```

模块负责人是待落实的责任角色，尚无已确认人员名单或工程日期承诺。开始实施前，协调者将 engine/control、clients/design、identity/security、runtime/SRE、data/memory、model gateway/FinOps、evaluation/Reflect 映射到真实责任人；独立验证和安全审查保留挑战实现的权限。

每门必须保存：版本化需求清单、dependency/lock/image 清单、操作与恢复程序、数据流及威胁模型变化、绑定实际候选/环境/检查定义的结果和回退计划。测试失败、缺失能力、未知成本和未执行的步骤保留可见状态。Push、部署、外部出版属于自己的任务与授权。

## G0 契约与确定性验证基线

**进入条件：** v1.1 范围与本批停止点已明确；G0 实施开始前分配实际责任人，完成工具/依赖版本调查并保护验收 oracle。本批仅编写该门的计划。

**范围：** 冻结原生 loop、TaskEnvelope、immutable tenant/Space/Task/Run 关系、command/event、operation/approval/fencing/budget、artifact/check/delivery 契约。给每类记录一个权威 owner，区分 Temporal workflow history、PostgreSQL 权威记录与可重建投影。建立威胁模型、迁移/恢复与确定性 fixture；用合成适配器验证正向、拒绝与恢复行为。[14 个工作包](g0-implementation-plan.md)规定精确产物归属和依赖。

**退出证据：** schema/状态机/效果幂等/未知结果/授权/replay/fencing/预算及证据契约的实际测试结果；replay 的模型与写工具调用计数为 0；必选有限套件中跨 Space 泄漏、未授权 dispatch、重复效果和陈旧 generation 写入为 0。单独保存边界、效果/重试和权限评审，禁止作者自行签发独立通过。

**责任与限制：** engine/control 与架构牵头，安全/数据/模型/运行时/验证参与。Fixture 通过只能支持软件契约，不能证明真实 Linux/OpenShell 隔离、SSO、网关收费或跨端体验。首个正式 G0 批次从 G0-01 开始，而不是直接批量编写所有客户端。

## G1 可用安全核心与三端

**进入条件：** G0 退出证据齐全；先锁定待验证的实际 Linux host/kernel/image、批准 region、模型 profile/网关、身份提供方、限额/保留策略和验证执行身份。资格失败的组合不能被广告为支持。

**范围：** 一个自有原生引擎；普通 Ask 在无 Space 文件系统的合格服务 worker 中运行且不启动 VM；Plan 保存版本化计划；Act 在任务边界内启动合格 remote computer。实现 personal/group Spaces、显式群组触发、任务 owner/control revision、基本身份/Space 授权、源受众检查、成本界限、基础保留、精确效果审批、受保护检查、可靠 Stop。web、desktop、mobile 都须是同一后端的薄但真实客户端；移动端能发起、查看、补充、停止和取回实际任务。

**退出旅程：** 桌面发起 → 睡眠 → mobile 看到同一 task/source/limits 并纠正或 Stop → web/desktop 恢复同一权威结果；切换 Space 不迁移待执行目标；群组普通讨论不自动调用 agent；普通问题不启动 Space VM；草稿、checks、外部 delivery 和通知分立。成员撤权、旧 approval、重复命令、断线重连、budget wait、未知效果和 worker recreation 都有拒绝/恢复证据。只开放已验证的 effect 路径。

**责任与测量：** clients/design、engine/control、identity/security、runtime/SRE、model/FinOps、evaluation 联合交付。主规格第 29 节的 warm acknowledgement p95 ≤2s、状态传播 ≤3s、在线 Stop 后新 dispatch ≤2s、privileged lease 最大 30s 是待测 pilot 参数，不能写成现有 SLA。cold startup、模型完成和进程终止分别量测。高严重授权、隔离、旧审批或重复效果缺陷阻止受影响 release profile。

**边界：** 基础保障不能推迟到 G2。薄客户端不要求 G1 就完成 G3 的深度设计编辑/桌面操作；它必须操作真实 Task。无人值守生产写入和 cross-tenant learning 不进入初始 pilot。

## G2 企业工作台与完整生命周期

**进入条件：** G1 合格范围及其 evidence package 已冻结；实际模型 gateway edition、用量延迟/超额策略、storage/retention、group connectors/service identity 和备份目标已落实。

**范围：** LiteLLM/合格网关管理、父子共享 reservation 与 settled billing reconciliation；scoped/versioned/source-backed Memory STORE/LOAD、来源解释、事实修正、删除与派生失效；连接 setup/auth/resource-authorized/qualified 状态；完整 joiner/mover/leaver；Dispatch 日程/事件触发、timezone/overlap/missed-run/expiry；Fleet 资源/日志/模型延迟与成本关联、授权 lifecycle controls。G1 已有任务控制与基本资源可见性，G2 增加企业深度。

**退出证据：** 真实账单与 unknown usage 核对；memory recall/freshness/conflict/delete/revocation、延迟索引 fallback；connector expiry 和 owner 离职暂停或有效 service identity；schedule dedup/preview/恢复不重放 stale write；backup/restore 前先应用 tombstones/current policy；computer restart/restore 与 reconnect 正确。源受众与查询隔离不能被 billing team、cache 或 Fleet 日志绕过。

**责任：** data/memory、model/FinOps、identity/security、runtime/SRE 与 evaluation。UX-15 的事实修正在此交付，方法发布仍等待 G4；UX-17 的 archive/suspend/delete 在 G1 有明确效果，G2 补齐 memory/connector/backup 传播。

## G3 创作、Design Studio 与受控 computer use

**进入条件：** G1/G2 身份、权限、artifact、delivery、runtime 及连接基础可信；真实生成/预览/浏览器/桌面工具、input mapping 和 sensitive browser isolation 完成专项资格试验。

**范围：** DesignArtifact 的版本化草稿、stable element IDs、支持范围内 source patches、token/assets、variants/comments/revision conflicts、responsive/accessibility/interaction checks、独立 origin preview 与可追溯 export。文档、表格、演示等能力包复用 artifact/policy/check 契约，按各格式分别验证。Computer use 执行 observe → authorize → act → postcondition；view/input/clipboard/download grants 分立，exclusive fenced driver lease 和 mutation barrier 覆盖 GUI、shell、SDK、API、browser、filesystem 的所有冲突写入。

**退出旅程：** 团队产生 dashboard draft → 两端评论/并发修改显示 conflict/variant → 预览测试 → 人接管先阻止所有冲突写入且揭示 in-flight effect → 显式 return-control 后重新观察/校验；结果仍区分 checked draft 与 separately authorized publication。wrong-target/stale-frame/reconnect、不自动恢复输入、preview attack、敏感 profile/cookies/input 真实隔离、键盘/touch/display geometry 均有实际证据。

**责任与限制：** clients/design、runtime/SRE、action/desktop broker、security、evaluation。不支持的 native app、edit region 或认证隔离显式阻止/给出允许替代。HTML 设计板不证明原生 biometric、streaming 或运行时隔离；不能承诺任意 OS 应用互通或无损 round-trip。

## G4 治理式 Reflect 改进

**进入条件：** 实际任务/check/feedback/memory provenance 可供受众内引用；独立实验执行身份、protected holdouts、maintenance budget、release registry 和 rollback 资格已建立。

**范围：** 失败/介入证据 → 诊断假设 → 狭窄 prompt/context/tool/profile candidate → isolated experiment → 独立 holdout → 授权 release → 小范围 rollout/retain/revert。Memory 改事实，不发布方法；within-task repair 与 cross-run optimization 预算分离。首期 proposal-only，人的真实授权才发布。

**退出证据：** 可重现实验控制 model、起点、环境、权限、预算；保留全部结果、不确定性与辅助成本；保护评分/holdout；没有升权、关闭检查、抬高预算或自改 live controller；实际行为回退、source deletion/revocation 导致候选失效及 active-run 安全撤销有记录。

**责任与限制：** evaluation/Reflect、data/memory、security 与发布 owner。一次演示不能声明统计改进；不做自动 model-weight training，不启用默认 cross-tenant learning。rollback 改后续选择，不撤回已完成外部效果。

## G5 合格扩展

**进入条件：** 已交付核心门与适配器 conformance oracle；每个新 runtime/app/channel/model、私有推理或可选硬件都有明确 owner、版本和支持矩阵。

**范围：** 更多运行环境、客户控制部署、经显式 enrollment 的本地 worker、额外 app/channel、private inference 与可选 NVIDIA Sentry/BlueField 等部署专属层。共享原生语义与控制服务，不叠加另一个 planner、memory authority 或 retry loop。

**退出证据：** 每个 advertised client/model/runtime 组合绑定真实环境、capability negotiation、schema/version、identity/audience/revocation、effect dedup、export、失效/迁移/恢复测试和 deployment/edition/许可限制。软件部署不声称硬件保证；有限测试不证明绝对免疫或性能领导。

**责任：** runtime/SRE、adapter/model、clients、security、procurement 与 evaluation；缺失强制能力的 profile fail closed，不能通过降级到本机、另一地区或非合格工具赶上进度。

## 跨阶段需求与下一批

AF-07、AF-09、AF-11、AF-13、AF-19 和 UX-01、UX-05、UX-07、UX-12–17 分阶段扩展；“首门”不代表完整义务关闭。完整映射在[追溯表](requirements-traceability.csv)。所有产品状态目前为未实现。

下一批建议实施 G0-01、G0-02，先交付权威/接口/威胁边界和最小编译/确定性测试骨架，再按依赖开放实现。实际人员、依赖版本与环境选择在[决策登记](decision-register.md)落实。本批未授权执行该实施批次。

本批的文件、链接、38 个 ID、14 包依赖和产物归属可由真实命令检查；注册独立评审/终验是另外的 Loop 任务。咨询意见及绿色文档结构检查不等于产品、安全或部署验收。

