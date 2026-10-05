# G1 本机开发与验证子批次

日期：2026-10-05。团队：team-b8733841c4e64668b730d6e5f132581d。

用户批准先完成本机实现、集成、确定性测试及独立验收，真实供应商 API 先提供建议与费用测算，确认后才能启用。当前模型为明确标记的 deterministic-test，效果为 synthetic-only，不启用收费调用、远端服务器、工作站 shell、Computer 或自动 worker enrollment。

G0 已验收代码、保护测试、文档、证据和全部历史保留。增量独立放在 g1-local/，每个客户端有自己的 package/lock；禁止更改 G0 的公共合同、根锁文件、构建脚本、保护 oracle 及既有证据。G0 原 14 工作包及 102 强制分支、197 测试和已接受候选 sha256:bddaaf167c89a606c06957d792398d6aeb4931e81c41eede376886ae3b5863d4 是历史基线，不是新批次完成声明。

## 执行顺序

| 工作包 | 专业职责 | 依赖 | 目标 |
| --- | --- | --- | --- |
| g1_local_baseline | coordinator | 无 | Establish G1-local exact public contracts and independent build/check baseline plus explicit local-only architecture, fixed meaningful test definition and model/API cost proposal. Preserve all G0 source/oracles/locks/evidence. User-approved local synthetic data only; no paid API, SSH or cloud. Propose models with fetched official citations and token/price arithmetic; approval required before any activation. |
| g1_local_backend | backend | g1_local_baseline | Implement real single-process SQLite local-test authority/journal, synthetic test identities and separate approval principal, deterministic-test model and simulated-only effect workflow. Use G0 ownership/invariants; durable intent then independent receipt, unknown retained until original reconciliation. No shell/Computer/worker enrollment; do not present this store as PG/RLS/Temporal or runtime qualification. |
| g1_local_http | backend | g1_local_backend | Implement loopback-only actual HTTP service and browser/native compatible fetch SDK over accepted contracts, shared real test identity/Task/Ask/Plan/approval/simulated run/result/Stop/event APIs. Enforce origin/token/input/size/path/current authority on actual boundary, protect native emulator access as authorized test-only local channel; no public exposure or external services. |
| g1_local_web | frontend | g1_local_http | Implement real React/Vite Web client using actual loopback API and shared SDK, existing Agent Fabric flows and design: test login, Space/Task list, Ask/Plan/independent approval, simulated run/results, Stop and empty/loading/error/denied/reconnect/offline draft states. Explicit persistent deterministic-test/simulated-effect/no-paid-API labels. No hardcoded mock dashboard. |
| g1_local_desktop | frontend | g1_local_web | Implement actual Mac Electron thin application over qualified local Web/API, pinned independent dependency lock and executable startup path. Renderer nodeIntegration=false, contextIsolation=true, sandbox=true, narrow/empty IPC, exact allowed loopback navigation, isolated preview, reject external windows/protocols. Local installation only; no production signing/update or sleep-mobile handover claim. |
| g1_local_mobile | frontend | g1_local_web | Implement genuine React Native/Expo Android development client using same local API/Task and contracts: synthetic login, Ask/Plan approval/result/Stop, current permissions and offline drafts. Independent pinned package/lock, local native build/install entry using existing ARM64 Android emulator; native generated builds/artifacts outside candidate source. Not Expo Go/web viewport/physical qualification substitutes. |
| g1_local_verify | tester | g1_local_desktop, g1_local_mobile | Integrate and actually verify real local HTTP/SQLite/identity/deterministic model and three clients; execute original G0 regression, new allowed/denied/recovery/fault/idempotency/current-authority/budget/Stop checks plus actual local UI flows. Retain candidate-linked raw measurements/screenshots/logs/artifacts and reproducible quickstart/recovery; no fabricated outcomes, unavailable UI remains pending. |
| g1_local_final | acceptance | g1_local_verify | Independently accept only user-approved G1-local on one exact integrated candidate: all actual command/build/UI/recovery/load evidence and current registered independent security/code/requirements assessments. Preserve G0 and preparation history/accounting. Deliver model cost proposal for actual user decision, full G1 external qualification remains pending; stop after this local subbatch. |

主线程协调，Loop 同时最多 2 名专业执行者，宿主最多 4 活跃线程。每次专业任务使用绑定真实 agent 的隔离副本、精确文件所有权和 600 秒有效时限；回收稳定成果后才运行原合同检查和下游接收。三个正式独立评审各有 600 秒时限，安全、代码、需求评审不能由实现者自签。

## 本机基线和验收

Node 22.22.3、pnpm 10.18.0、Mac arm64；实际 SQLite 单进程事务及持久 outbox，不声称生产 PostgreSQL/RLS/Temporal 已验证。HTTP 仅绑定 loopback；客户端经真实 HTTP SDK 使用服务端当前 actor/Space/payer、不可变审批绑定、命令幂等、游标和结果。

Web 为真实 React/Vite 页面；桌面为 Electron 薄客户端；移动为 Android 虚拟设备原生开发客户端。浏览器移动视口不能替代原生安装/交互。启动、安装或交互失败须留下实际原因，缺失检查不得签通过。真实 UI 使用确定性合成数据，操作员和审批人分开；所有模型输出和合成效果显式标记测试模式。

构建、类型、行为、原 G0 全回归、持久化/重启/故障/重复/未知状态/权限/Stop、三客户端实际操作及冻结负载检查都要运行。负载限定 10 次预热、100 次读取、并发 4、p95≤2000ms、0 未预期错误；保留所有样本、失败与取消，这不是生产 SLA。最终三份独立评审与需求证据绑定同一当前候选。只在本机子批次正式验收通过后停止。

## 完整 G1 义务保留

G1-01 环境/接口/资格；02 PostgreSQL/UoW/RLS；03 正式身份/审批/audit；04 storage/volume/保留；05 engine/Temporal；06 真模型/FinOps；07 合格 Linux；08 真 Ask/Plan/Act；09 服务/事件 SDK；10 Web；11 Electron；12 实物移动端；13 跨端故障/性能；14 正式全门验收。局部结果可作输入，不能自动获得生产资格。

远端环境及权限、实际供应商 route/账户/处理地区与收费预算、实物手机、正式 SSO、代码签名/分发、真实模型能力/计费与跨端接管均待验证。当前 SSH 访问没有成功建立，既有服务器信息只保留为用户提供的待核对配置，不重试连接。

## 本机核心依赖登记

独立离线 frozen install 实际安装 3 包、0 下载；它们与已登记 G0 锁定包同版本，并未升级。元数据和 shipped license 逐文件读出：

| 包 | 版本 | 许可证 | package.json SHA256 | shipped license SHA256 |
| --- | --- | --- | --- | --- |
| typescript | 5.9.3 | Apache-2.0 | 822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6 | a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47 |
| @types/node | 22.18.6 | MIT | 4e64d27ee0a5d911c0998042265e474713176f366f090ebdd78a4faadbd31928 | c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383 |
| undici-types（传递） | 6.21.0 | MIT | 11f873b423b96a5ad444a099685ca6b9de1379dcd83fd8d368e757ddb53658e4 | a6db8096b2707bc0102d256917d4d33f298ba36d8c3f25de067a2b5bb379db27 |

TypeScript bundled ThirdPartyNoticeText.txt SHA256=1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c；未来分发保留完整 notice。[已验收 G0 详细上游/完整许可证登记](../evidence/g0-build.json)保留不变。coordinator/DevOps 负责每次升级重新登记 lock integrity、许可证与原检查；Web/Electron/mobile 新增依赖由各包登记，最终验证汇总实际安装的直接及传递包，不沿用这三包作为全部客户端依赖的断言。

基线工作副本逐字节核验：G0 build 65 项、既有规划 5 项、已验收最终 handoff 16 项，共 86 项哈希全部匹配、0 差异；这是保存核验，原全套行为回归及本机验收仍按正式检查执行。
