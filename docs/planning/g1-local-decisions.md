# G1 本机决策登记

2026-10-05，依据用户真实答复，所有旧决策及验收历史保留。

| ID | 决策 | 状态及边界 |
| --- | --- | --- |
| GL-D01 | 独立 g1-local/ 子批次；G0 代码和证据不可覆盖 | 用户已批准；本机单独验收 |
| GL-D02 | Mac 本机、Chrome Web、Electron、Android 虚拟设备 | 用户已批准开发测试；实物与签名分发待验证 |
| GL-D03 | 固定 deterministic-test 模型、synthetic-only 效果 | 已批准；paidCallsAllowed=false、remoteAllowed=false；无收费凭证需求 |
| GL-D04 | SQLite 本机事务与持久 outbox，独立后续生产迁移 | 本机工程选择；生产 PG/RLS/Temporal 资格不在此批 |
| GL-D05 | 本机测试登录，operator/approver/viewer 分开 | 测试基线；正式 SSO/审计部署待验证 |
| GL-D06 | 服务端重新派生当前权限、scope、payer，闭合 wire schema | 必须实施行为验证；caller 不能授予权限 |
| GL-D07 | 未知模型/效果保存 receipt 身份并 reconcile；纯 replay 零新增调用/效果 | 原 G0 义务延续；不能盲重试 |
| GL-D08 | Stop 可携带过时 expectedRevision，但使用当前权限与 fence | 必须测试重连未送达、重复及旧进度合法 Stop |
| GL-D09 | 先建议模型供应商/路由与费用，不启用 API | 用户明确要求；候选预算仍须用户确认 |
| GL-D10 | 2 名专业 worker 并行、600 秒正式任务/评审时限 | 继承已批准控制边界；超时只保留实际成果，不能伪装通过 |
| GL-D11 | 本机三份正式独立评审绑定当前候选 | 安全、代码、需求；不能用咨询或实现者自签替代 |
| GL-D12 | 远端/真模型/实物/正式登录/签名保留待验证 | 本机验收不得抹除完整 G1 14 工作包 |

本批产品供应商 API 调用数应为 0。宿主对话/专业 agent/独立评审用量属于控制器之外，累计记录继续保留；没有完整原生计费凭据时费用记 unknown，不能把“产品 API 未启用”说成整体免费。

