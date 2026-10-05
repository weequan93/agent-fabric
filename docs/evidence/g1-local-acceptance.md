# G1-local 本机验收索引

本批交付范围为用户批准的本机开发与验证：真实本机 HTTP/SQLite 服务、Web 浏览器、Electron 原生窗口和安装后的 Android arm64 模拟器应用，模型固定为 **deterministic-test**，外部效果固定为 **synthetic-only**，身份为公开合成数据的 **local-test**。收费模型 API、SSH 与云端执行仍关闭。

这份索引 **不自签正式通过**。只有当前 Loop 团队 `team-9fadeec39e704d17af04c441f083b554` 为 COMPLETE、`final_candidate_current=true`，且原命令检查及三个注册独立评审都在同一当前整合候选上通过，才构成本批本机验收。安全、代码和需求评审的实际结果保存在控制器记录；本文件不在评审启动前填写 pass，也不借用 G0 的历史签名。

声明源码范围摘要为 `sha256:b901f53b806e2499035704037d000a023dd4436f5a98921db161bdc7ec50e85e`。该值是固定 checker 计算的53文件范围摘要；它与包含文档的整仓候选摘要用途不同。整仓候选及环境绑定以外部控制器记录为准，避免索引自引用。

## 已实际执行的输入

- 原 verify 命令及 G0-preservation 命令在整合候选 `sha256:2f0d9ec8cf442514afab80b630ad196faf815efe337e3e680e8daa6c33ac3655` 实际通过；该检查点属于 final 索引添加之前的真实历史。final 必须在最终整合候选重新执行原检查。
- 实际测试：48 核心、5 Web、9 Electron、10 mobile，0失败/跳过/TODO；移动两项新增测试执行真实安装的 whatwg-fetch polyfill，传输 mock 明确属于组件验证。
- CUA 实际 Web12、Electron12、Android12，共36项交互。每端记录 login/Space/create/Ask/Plan/独立审批/明确 synthetic Run/result/current Stop/waiting/offline Not delivered/只读 reconnect。源码、启动/安装、环境、时间、Task/revision、实际日志字节及 hash 均保留在 [UI证据](g1-local-ui.json) 和 [观察日志](g1-local-verification.md)。
- 三端 result 均读取 `task-cb5494be-47a5-404c-9284-205e1964538c` revision1/generation0，摘要 `a4a2c8e6e83dec5cc8afcebc27ade58108f760883316574008e4e6f48c7cd892`。Android 的审批与执行过程保留 Plan1 到期、明确 correction 生成 Plan2、独立 Web 当前审批、实际 native Start 的完整顺序；没有延长五分钟审批期限。
- [负载证据](g1-local-load.json)：10预热+100正式授权 HTTP 读取、并发4、全部200/0错误、真实 performance.now，nearest-rank p95 **110.407125ms**。全部当前样本以及旧候选110个样本分别保留；这是本机 warm read，不是生产 SLA。
- 当前 Android debug APK 构建43s/304tasks，SHA256 `21022586d8ea23cdcf9d07c17c523bdd2c530f44609931c8508e737949d7022d`；native input `sha256:ab37c95450eb11dd04da70f6e0d67aa8cd71b163b7d9732013f5a470c11756b2`；实际安装/启动后再执行原生交互。APK、Metro、helper 或窄视口本身不被算作 UI 通过。
- G0 已接受候选 `sha256:bddaaf167c89a606c06957d792398d6aeb4931e81c41eede376886ae3b5863d4` 的14包、197测试、102强制分支及历史保留。刚实际复算65原源码/5原计划/16原交付文件共86个 hash，0不一致。原G0 checker 实际197通过、102分支各一次。
- [需求矩阵](g1-local-requirements.csv) 保留12本机义务和14完整 G1 门；历史列和当前检查点列分开保存，不改写早期失败、pending或累计用量。最终当前正式状态属于控制器。

## 运行与恢复

[本机启动说明](../operations/g1-local-quickstart.md)、[恢复说明](../operations/g1-local-recovery.md) 保留安装、loopback启动、实际 native构建/安装/Metro/adb reverse流程、故障恢复以及最初 Gradle DNS/Metro watchFolder/模拟器 snapshot 失败。实际测试中的 SQLite crash/reopen、事务回滚、未知回执对账、并发命令 pending、权限撤销与 Stop 后零发布均保留原断言。

新依赖的固定版本、实际安装许可证/metadata hash 和更新责任记录在 [JSON索引](g1-local-acceptance.json)。core/toolchain 由 architecture、Web/Expo/RN/bundling 由 frontend、Electron/vendor binary 由 devops 负责；更新必须重新产生当前构建、行为和受影响原生交互证据。生产签名、平台 notices 与分发仍在完整 G1 门内。

## 费用提案与未验证项

[模型费用测算](../planning/g1-model-budget-proposal.md) 已形成，建议先普通路由/困难升级、禁止未批准 fallback。USD10总额/USD2日/USD0.25每Task只是未启用建议，必须等待用户实际确认后才启用收费调用。产品收费 API0；宿主会话、专业 agent、独立评审完整费用仍 unknown，不能声称整个研发免费。原控制器及历史累计用量保留。

[完整 G1 待验证登记](g1-pending-qualification.md) 中14门继续 pending：远端与部署地区、真实模型/供应商/预算、PostgreSQL/RLS/HA、生产 worker/Temporal/隔离、实物手机与桌面睡眠、正式登录、签名/更新/分发、生产性能和完整G1终验。本机验收不使这些门提前通过。完成本批正式验收后停在 G1-local。

## SEC-G1-EVIDENCE-001 原始证据补充

第一次注册安全评审在候选1c60aaa8上返回 inconclusive，原始结果及累计用量保留；缺口是整理后的日志没有附上原始自动化结果。本次只补材料，不改源码、冻结条件或已有动作记录。

JSON索引 rawUiEvidence 保存 236 个实际调用及其原始文本输出、源会话 ordinal/时间/记录hash，87 张原始 CUA 截图的完整字节路径和hash，以及实际原生构建/安装/Metro输出。截图仅解码base64传输，没有图像编辑；未裁剪、未重新生成。完整选定原始call/output行（含原图dataURI）保存在 /private/tmp/agent-fabric-g1-local-raw-evidence/original-selected-tool-records.zip；SHA256 487afe79ffc22042bd52ccc277ca984a851515c10e5903d2d07f94b235b5489b。JSON中直接保留原始AX/DOM结果，截图文件可由独立评审以读取/查看工具检查。材料来自当前宿主真实工具记录，不是将 expected/observed 汇总重新写成 raw，不含其他用户对话。

独立评审仍必须验证来源、当前范围与实际动作/权限/断线恢复，材料补齐本身不宣告通过。各张截图与完整原始归档是只读验收输入，源码范围仍b901f53b。

## 已批准的证据接入与评审恢复批次

用户在2026-10-05实际批准“批准证据接入与评审恢复批次（推荐）”。当前恢复团队为 `team-9fadeec39e704d17af04c441f083b554`；原团队 `team-b8733841c4e64668b730d6e5f132581d` 的8个任务、15个专业分工、两次真实安全评审 inconclusive、代码/命令/UI/负载/验收历史均保存在同一私有状态库。旧控制文件已由官方CLI归档，源代码和所有冻结判据保持原样。

87张原始JPEG及原始472记录ZIP已作为88个真实候选文件接入 [原始证据目录](g1-local-raw/)。JSON的 allScreenshots、每个实际 rawOutput 的图像 artifact 及 originalArchive 均改为候选相对路径，原临时路径另存为 originalPath，仅作来源历史。每个文件字节、大小及SHA256均与原记录逐一核对；累计24,802,125 bytes。原始归档SHA256仍为487afe79ffc22042bd52ccc277ca984a851515c10e5903d2d07f94b235b5489b。未裁剪、未编辑、未重绘，未修改原始AX/DOM文本或完整ZIP。

可直接查看 [Android在线Stop原图](g1-local-raw/10806-85.jpg) 与 [最终revision8/generation1及未发送草稿原图](g1-local-raw/10816-86.jpg)。这些图像补齐可访问性；实际交互链、源码/APK绑定、当前授权、独立审批、断线恢复仍由注册评估器评估，截图本身不自签通过。旧独立评审在候选06da7b6d返回 inconclusive 的结果和 evidenceDigest e0952141a17d19b6409ccff2d9b0b3d5a3ba9863da360b3efe7d7c798d412a9f仍保留。

原final控制器已记录297秒/2次迭代，原本机8任务共436秒，已知部分执行器tokens1,615,320；完整tokens/费用仍unknown。恢复只用原final剩余2103秒/10次迭代，每项正式评审600秒。40MiB响应上限及16MiB单文件快照上限只用于固定原始二进制材料接入；模型context/费用/收费API/远端启用没有扩张。

必须在含这88文件的同一最终整合候选重新通过原G1-local/G0命令及三个注册安全、代码、需求评审，并取得实际收件检视记录。只有当前团队COMPLETE且final_candidate_current=true才交付本机验收；完成后停止在G1-local，完整G1的14项外部资格仍pending。

### 原始材料作为冻结输入

原始88文件按用户已批准范围，在没有活动控制器时逐一核对并准备，随后冻结为当前候选的只读输入。当前task明确禁止修改 g1-local-raw/** 和全部实现源码，控制器只应用这两份索引的差异。固定1MiB二进制/提案协议没有变更。先前未执行提案/命令/评审的接入入口也已归档，记录2秒控制器开销；剩余执行预算为2101秒/10次迭代，累计本机任务加恢复入口438秒。上文2103秒及40MiB是先前入口的历史准备值，当前执行以2101秒及原协议/2MiB响应上限为准。元数据context512KiB仅承载新增输入目录与角色合同，注册评审模型context及600秒时限保持不变。88文件在真实workbench快照中再次逐一校验尺寸/SHA256，全部符合原manifest。

## 连接更新与评审恢复历史

2026-10-05 18:06:59 SGT，项目技能说明由外部更新。需求验收进程已正常退出，评审副本600个文件未改，但主项目的整仓候选变化，控制器未准入该次验收签名。旧候选 `98c08f92…` 上的安全、代码通过保留为历史，不用于当前验收。原进程已实际核对并通过官方 reconcile 记录；没有盲重放。

已连接协议2.0的当前框架，技能哈希为 `642b443f5c2337ac9d7b21d8e8392cc5f641be8006818085e4347d0912e71466`。冻结任务、条件和预算仍有效，继续原团队、原子任务；核销时累计731秒、已知部分token 6434515，宿主完整用量和费用仍未知。新候选的首次评审预检因缺少当前命令结果而终止，未派发模型。本次只补记这两个索引，重新执行原命令及三项正式独立评审，再由tester验收实际交接；2101秒/10轮累计上限和每项600秒有效时限不变。全部代码、G0、87截图和原始归档保留，收费API/SSH/云端关闭，完成后停在G1-local。
