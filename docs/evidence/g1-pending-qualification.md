# G1-local 证据边界与完整 G1 待验证登记

2026-10-05。本机团队 `team-b8733841c4e64668b730d6e5f132581d`。这份登记和 [需求证据矩阵](g1-local-requirements.csv) 是实现交接材料，不是独立评审结果或正式通过签名。

冻结定义实际包含 **12 项本机需求 G1-LR01–12**；已接受计划另外保留 **14 项完整 G1 工作包 G1-01–14**。矩阵以 `scope` 分开列出全部 26 项。本机证据可以成为完整 G1 的输入，不能自动改变完整 G1 的资格状态。

## 当前源码与实际观察

本次只读重新计算 [冻结 checker](../../g1-local/scripts/check.mjs) 的 declared-source-scope 算法：按声明文件路径排序，对 53 个当前 `g1-local/` 源码、配置、锁文件及检查文件分别计算 SHA256，再计算 schemaVersion/files 的紧凑 JSON 摘要，得到：

`sha256:ad11711f746155fe20ffe0c9ac466985dd4dc91b3eb8ffce54f9d344f67a3138`

该摘要与 [负载报告](g1-local-load.json) 的 candidateDigest 一致。它是本机声明源码范围摘要，不是 Loop 最终候选摘要，也不包括生成 APK、node_modules、临时构建目录或这两份文档。源码变化后应重新核对相关构建、测试、UI、测量及正式评审；不同来源的 hash 不能相互替代。

协调器在本任务上下文报告当前 48 项 core 测试全部通过、0 skip/TODO；并发重复操作在没有回执时错误返回 committed 的问题已经修复，原 pending 断言保留。当前 Web 5 项、Electron 9 项、mobile 8 项组件检查和 Android Metro/Hermes 575 模块构建已有实际执行结果。这些组件、构建和 SDK 检查不构成真实三端 UI 通过。

原 G0 的 14 包、197 项测试、102 个保护分支、冻结 oracle、源码、根锁文件、验收历史与累计控制器用量继续保留。G0 已接受历史候选为 `sha256:bddaaf167c89a606c06957d792398d6aeb4931e81c41eede376886ae3b5863d4`。本机任务不重签或覆盖它。最终交付必须保留当前原 G0 checker 的实际回归记录及相应 hash；本登记不能代替该记录。

### 负载

已直接读取完整 JSON，核对 10 次预热和 100 次正式样本、并发 4、所有 HTTP status=200、error=null、cancelled=false，使用真实 `performance.now` 时长而非测试时钟。按 nearest-rank 重新排序计算 p95，得到 **20.768584000000004 ms**，报告 errors=0；符合本机冻结的 p95≤2000 ms、0 未预期错误要求。

报告时间为 2026-10-05 06:58:41.642Z–06:58:42.099Z，实际传输 `http-loopback`，环境 Node v22.22.3/darwin/arm64，读取的是当前授权 Task。全部样本保留在原报告。本次文件核对不是重跑测量。这项 warm 本机授权读取结果不证明生产 SLA、冷启动、模型完成时间、状态传播、真实进程终止或跨设备网络性能。

### 三端 UI 和原生安装

| 客户端 | 当前实际观察的来源 | 当前待完成事项 |
| --- | --- | --- |
| Web | 协调器报告已通过真实 CUA 浏览器执行 12 项流程；组件/构建检查 5 项通过 | 本工作副本尚无完整 UI JSON、动作日志/截图字节及 hash；保留 host-observed、待 artifact-binding 状态 |
| Electron | 已有真实 pinned Electron 二进制/版本检查和 9 项组件边界测试；原生 UI 正在进行 | 完成真实原生窗口 12 项流程，并保留执行身份、启动命令、当前环境、Task/revision、动作结果及截图/日志 hash |
| Android 虚拟设备 | 当前 debug APK 实际构建成功由协调器报告：58 s、304 Gradle tasks，SHA256=`6e7bccbb5efdf2a492060bc85c1da3804c02b9f301da5adb766c9e7e6eaca737`；随后实际 adb install 返回 Success，冷启动恢复 emulator-5554 | 12 项原生触摸交互仍待验证；补充当前原生输入摘要、成功构建/安装/启动日志及 UI 动作证据；Metro、APK、安装不能代替交互 |

先前 IDE snapshot 300 s 超时与冷启动恢复事实保留。现有 [恢复记录](../operations/g1-local-recovery.md) 中 06:28 Gradle wrapper DNS 失败和 06:30 构建运行中属于真实历史检查点；后续成功构建应追加实际日志、生成目录、input digest 与 APK hash，不能将早期失败改写为通过。本文件没有执行 GUI、安装或构建；上述后续原生观察来自协调器。

冻结 UI 要求仍是每端独立的 login、space-selection、create-task、ask、plan、approval、synthetic-run、result、current-authority-stop、waiting-or-failure、offline-stop-not-delivered、disconnect-and-reconnect。三端 result 必须绑定同一个实际确认 Task。每端还需真实 executor/启动信息、mobile 安装信息、操作时间及当前 revision、原始截图或日志文件与 SHA256。未执行的端保持 pending；浏览器窄视口、Expo Go、源码截图和 mock transport 均不能填作原生交互通过。

### 正式评审

当前仍待当前候选的三个注册独立检查：`team-independent-security`、`team-independent-reviewer`、`team-independent-acceptance`。实现者、专业测试 agent 或本矩阵不能自签。命令/构建/UI/负载验证与正式评审属于不同证据。

最终 acceptance 文件是索引：`fileIsPassAttestation=false`，`formalResultAuthority=registered-controller-record`，仍引用原 requiredCheckIds。实际正式结果由注册控制器记录决定，不要求实现者先填写三个 pass 来启动正式检查，也不允许用没有评估器签名的建议替代正式验收。

## 完整 G1 的 14 项资格门

以下全部保持 **full_qualification_pending**，各项实际本机输入详见 CSV。后续只有在批准范围、实际环境和当前候选上执行对应程序，才能更新资格。

| 工作包 | 本机已形成的输入 | 仍需实际验证 |
| --- | --- | --- |
| G1-01 环境/接口/资格 | 独立合同、锁文件、源码与本机构建 | 批准的实际 Linux host/kernel/image、地区、profile、验证身份和运行资格 |
| G1-02 PostgreSQL/UoW/RLS | SQLite 文件事务、关系校验、outbox、回滚与重启 | PostgreSQL 迁移/UoW/RLS、跨租户隔离、生产 restore/HA；本机聚合记录不是 SQL RLS 证明 |
| G1-03 身份/审批/audit | 服务端测试身份、当前授权、双端分享、独立精确审批 | 正式 SSO/IdP/service identity、企业策略和部署 audit/retention；公开测试凭证不是生产身份 |
| G1-04 storage/volume/保留 | 合成 artifact bytes/digest/check/result 和当前 owner/tombstone 边界 | 实际存储/volume 持久性、保留/删除传播、备份恢复与成本 |
| G1-05 engine/Temporal | 自有本机持久控制器、Task/Run、独立 receipt 对账 | 合格服务 worker、生产 Temporal/恢复、OS/runtime 隔离及真正 worker recreation |
| G1-06 真模型/FinOps | deterministic-test、synthetic units、预留和结算、费用提案 | 实际供应商账户/路由/地区/能力/质量/用量延迟/计费/未知回执/硬预算；需先获用户启用授权 |
| G1-07 合格 Linux | 远端、shell、Computer、worker enrollment 固定关闭 | 实际授权远端访问、Linux image/kernel、lease/fence/isolation/recreation 与批准地区；本批不重试 SSH |
| G1-08 真 Ask/Plan/Act | 合成 Ask/版本化 Plan/独立批准 Run 与结果 | 普通 Ask 在无 Space 文件系统的合格服务 worker、真实模型及合格 remote computer Act、实际外部效果控制 |
| G1-09 服务/事件 SDK | 实际 loopback HTTP、当前授权、命令去重/查询/游标 | 生产部署、认证、事件服务、channel 访问与运维安全资格 |
| G1-10 Web | 本机 React/Vite、组件检查与 host-observed 浏览器流程 | 完整当前三端同 Task 证据与生产 Web 部署、可访问性、运维资格 |
| G1-11 Electron | 本机 Electron 二进制、renderer/IPC/导航/权限边界 | 原生完整流程、实物睡眠恢复、代码签名/更新/分发资格 |
| G1-12 实物移动端 | Android emulator 的真实 bundle/debug APK/安装输入，UI 待验证 | 实物 Android/iOS、实际后台/睡眠/断网接管、签名/商店/分发与设备支持资格 |
| G1-13 跨端故障/性能 | 实际 SDK/fault 检查和全部本机 warm HTTP 样本 | 桌面睡眠→mobile 纠正/Stop→同一权威结果恢复；真实通道；ack/status/在线 Stop/lease/cold/model/termination 分开量测 |
| G1-14 正式全门验收 | 本机证据材料及其独立验收输入 | 全部 14 项完整 G1 资格、原 AF/UX 义务、当前注册安全/代码/需求验收；本机通过不得抹除后续门 |

[路线图](../planning/roadmap.md) 中 G1 的 warm acknowledgement≤2 s、状态传播≤3 s、在线 Stop 后新 dispatch≤2 s、privileged lease≤30 s 是待测 pilot 参数。本机授权读取 p95 不能替代这些不同观测。G2 企业工作台、G3 专业操作与硬隔离、G4 方法发布/协作以及后续运行韧性的既有门继续保留，不因本机包而提前通过。

## 费用、授权和用量

固定 `paidCallsAllowed=false`、`remoteAllowed=false`；本机产品供应商收费 API 未启用，调用数保持 0。确定性合成 units 不是真实账单或供应商费用。本地调试 APK不是生产签名分发，单机 SQLite 不是远端部署资格。

[模型预算提案](../planning/g1-model-budget-proposal.md) 是 dated 官方来源、token/cache/retry/USD 假设及可复算算式的提案。USD 10 总额、USD 2/日、USD 0.25/Task 尚未生效。真实供应商账户、普通/困难路由、禁止未批准 fallback、处理地区/数据类别、币种和预算均需实际用户决定；启用前重新核对官方价格和实际账单控制，不在此登记内开启 API。已有服务器地区、资源费和外部账单没有实际资格证据，不能填为零。

宿主会话、专业 agent 和独立评审费用属于另一用量来源；当前完整计费为 **unknown**。不能将产品付费调用为 0 写成整个研发免费。保留原控制器历史、累计账本和有效边界；不新造团队总预算、不重置原任务计数或超时。

## 最终更新规则

协调器只能依据真实当前动作/结果、原始字节及注册记录追加状态：完成桌面/移动原生交互→补齐 current-source 三端 UI artifact binding→完成原始 combined verify/G0 gate→运行三个正式独立评审→形成 truthfully indexed local acceptance。源码变化后重新执行受影响检查；缺权限、工具、供应商/环境或验证身份继续保留具体 pending 原因。交付并停止的范围仍为用户批准的 G1-local，完整 G1 的待验证门和全部旧成果/历史保留。

## 2026-10-05 current local evidence checkpoint

The preceding ad11711f checkpoint remains history. Current source sha256:b901f53b806e2499035704037d000a023dd4436f5a98921db161bdc7ec50e85e has actual CUA Web12, Electron12, Android12 actions and artifact binding; all three read the same Task cb5494be-47a5-404c-9284-205e1964538c and result digest a4a2c8e6e83dec5cc8afcebc27ade58108f760883316574008e4e6f48c7cd892. Current debug APK SHA25621022586d8ea23cdcf9d07c17c523bdd2c530f44609931c8508e737949d7022d;installed native application, not a viewport/helper substitute. Mobile compatibility repair preserves strict HTTP queries and has10actual component/polyfill tests. The earlier schema error, failed/expired approvals, source UI and all110 old load observations remain history. Current110 HTTP observations have p95 110.40712500000001ms and0errors.

Evidence index/log/UI/load paths are now present. All26 matrix rows retain old columns plus explicit current checkpoint columns. Original combined command/G0 gates and all3registered assessments remain pending here; no implementation-side document signs an independent pass. Full G1 fourteen qualifications, physical devices/sleep, real models/region/budget, remote host, formal SSO and signing/distribution stay pending.
