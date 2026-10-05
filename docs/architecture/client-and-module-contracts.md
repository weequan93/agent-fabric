# Client and subsequent module contracts — G0

This batch implements typed local protocols, not actual web/desktop/mobile clients or subsequent modules. The accepted original roadmap and traceability CSV remain immutable history. The G0 evidence matrix records new local coverage separately.

`presentation.ts` projects scope, current audience, intent, execution target, server payer, eligible source provenance, independent draft/check/delivery/notification states, budget estimates/reservations/settlements, waiting resolver and safe next action. A private title is omitted for an ineligible viewer/export audience. Export creates a copy after current source and destination checks; the copy has no original-source access grant.

`PresentationClient` reuses G0-06 ordered `ClientReplica`. Last update remains visible when disconnected. Offline Stop reads **Not delivered** and sends zero commands. Reconnect restores only current authorized committed state, preserves an unsent draft and never submits it. A failed refresh clears revoked state. Pending acknowledgment differs from dispatch fenced and does not claim remote processes stopped or external effects undone.

`DesktopClientState` is passive. A server-acknowledged lease must bind the current scope, Run, expiry and three fencing generations. Disconnect clears input authority; reconnect waits for observation and reconciliation. G0-08 owns the actual local six-path mutation barrier. G3 must qualify real shell/SDK/API/filesystem/browser/desktop containment and isolated sensitive-login profiles.

`FactMemoryRepository` keeps source-backed revision/CAS/history and tombstones; every retrieval rechecks current source authority. Fact correction has no behavior-release port. `BehaviorReleaseRepository` requires current source grants and actual protected-evaluation receipts for release and rollback; rollback changes the behavior head only and never restores grants, sources or memory. These are G0 fixtures; production memory arrives in G2 and Reflect/holdouts in G4.

`DesignPreviewContract`, `DispatchScheduleContract`, and `SourceRetentionContract` define version-bound previews, owner/service-identity/connector expiry, and deletion/revalidation/brokered/direct-link boundaries. No G0 scheduler, renderer, retention propagation or signed URL is qualified by these DTOs. G2 schedules must reauthorize the current owner or an explicitly approved service identity and reconcile unknown prior operations before dispatch.

`reduceFleetLifecycle` keeps archive, suspend and delete separate. Archive retains compute/storage states and fees; suspend stops compute fees but retains storage fees; delete terminates compute and tombstones storage. Settled history stays in the ledger. Actual drain, resources, invoices and backup propagation require G1/G2 evidence.

The owner-held repositories and authorization/protected-check callbacks are trusted controller capabilities. They are never exposed as model tools. Strings, content, current-looking flags and native worker reports cannot install verifier authority. Actual independent batch acceptance uses registered Loop evaluators.

## UX follow-up entry points

Every row retains the accepted later delivery gate. G0 safety/recovery tests cover protocols; actual clients and scenario validation remain the listed future work.

| Requirement | Scenario | G0 packages | Actual client/module follow-up | Later validation |
|---|---|---|---|---|
| UX-01 | 授权来源问答且不启动Space VM | G0-03, G0-09, G0-12, G0-13 | G1无VM问答；G2完整memory recall | service routing/source eligibility fixture；实际saved decision问答和VM未启动 |
| UX-02 | 群组讨论不自动触发且追问有明确Task目标 | G0-03, G0-05, G0-06, G0-13 | G1群组触发与回复目标 | 讨论/mention/reply/update分类fixture；实际双成员消息与控制冲突 |
| UX-03 | Ask/Plan不修改目标服务器或仓库 | G0-02, G0-03, G0-07, G0-13 | G1 Ask回答与Plan计划artifact | intent ceiling与target-write拒绝fixture；实际请求无目标修改 |
| UX-04 | Act preflight后桌面睡眠远端继续移动端同任务 | G0-02, G0-05, G0-06, G0-10, G0-12, G0-13 | G1三端真实Task/source/limits/preflight | accepted/reconnect契约；真实desktop sleep/mobile steer/结果 |
| UX-05 | 原型结果区分草稿检查与另行授权发布 | G0-03, G0-07, G0-11, G0-13 | G1状态契约；G3真实原型与publication边界 | artifact/delivery分离fixture；实际生成/检查/单独发布精确版本 |
| UX-06 | 切换Space不迁移pending operation目标或凭据 | G0-02, G0-03, G0-06, G0-07 | G1 immutable target与跨Space隔离 | 导航/队列fixture；实际双Space操作和credential/context边界 |
| UX-07 | 冲突文件或desktop lease明示排队不偷偷多开VM | G0-04, G0-05, G0-08, G0-12, G0-13 | G1文件资源竞争；G3desktop lease | 冲突lease/owner/wait契约；实际single-VM冲突队列与费用 |
| UX-08 | 旧移动进度Stop按当前权限推进fencing并显示不确定性 | G0-03, G0-06, G0-07, G0-08, G0-13, G0-14 | G1 stale Stop和unknown effect | stale Stop/idempotency/generation fixture；实际在线Stop与in-flight报告 |
| UX-09 | 接管停止所有冲突写入且重连不自动恢复输入 | G0-05, G0-07, G0-08, G0-12, G0-13 | G3all-path mutation barrier与显式return control | barrier/lease/expiry契约；实际GUI/shell/API/browser写入停止 |
| UX-10 | 敏感登录真实隔离profile cookies input或阻止 | G0-01, G0-03, G0-08, G0-12, G0-13, G0-14 | G3受隔离认证路径；G1先验证开放runtime控制 | unsupported拒绝fixture；实际跨进程browser profile/cookies/input/telemetry隔离 |
| UX-11 | 预算耗尽保存等待许可top-up恢复并显示持续费用 | G0-04, G0-05, G0-10, G0-13 | G1等待/恢复/存储和in-flight；G2账务核对 | 并发reservation/wait/reconcile fixture；实际延迟usage与top-up |
| UX-12 | 群组不能泄漏私人连接并提供授权替代 | G0-03, G0-07, G0-09, G0-13 | G1源受众拒绝；G2实际连接与私有/出版替代 | source/audience拒绝fixture；实际个人OAuth与群组service identity |
| UX-13 | 撤成员阻断后续上下文发布和brokered流并披露direct-link窗口 | G0-03, G0-04, G0-07, G0-12, G0-13, G0-14 | G1在线撤权交付路径；G2完整JML与保留传播 | revision/tombstone契约；实际generation/download/stream/direct-link资格 |
| UX-14 | 手机桌面并发草稿不覆盖可比较或保留variant | G0-04, G0-06, G0-11, G0-13 | G1公共写入防丢；G3Design并发草稿 | base revision/conflict/variant fixture；实际双端编辑autosave/reconnect |
| UX-15 | 事实修正版本化而方法补丁等待Reflect独立门 | G0-03, G0-04, G0-11, G0-13, G0-14 | G2事实修正与method proposal；G4独立评估后发布 | memory/release权限与lineage fixture；实际correction与holdout/release |
| UX-16 | schedule owner离职或connector过期暂停或合法service identity且不重放 | G0-03, G0-05, G0-06, G0-07, G0-12, G0-13, G0-14 | G2日程和连接完整生命周期 | 身份/expiry/dedup/reconcile fixture；实际offboarding/renew/recovery |
| UX-17 | archive suspend delete对任务数据费用有不同明确效果 | G0-03, G0-04, G0-05, G0-08, G0-10, G0-12, G0-13, G0-14 | G1明确效果及受控drain/fence；G2完整数据/连接/backup传播 | lifecycle/retention/charge契约；实际drain/unknown settle/tombstone/restore |
| UX-18 | 通知失败不改变已有任务结果且另有delivery status | G0-05, G0-06, G0-11, G0-13 | G1结果与通知分离；G2扩展delivery/retry | task/artifact/delivery/notification fixture；实际推送失败仍能取回结果 |

Protocol test entry: `evals/safety/presentation-and-module.test.ts`; all protected IDs are fixed in `evals/fixtures/g0-oracle-definition.json`. The original `requirements-traceability.csv` still describes the accepted pre-implementation planning baseline.
