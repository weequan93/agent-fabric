# G1-F02 本机身份与精确审批实施计划

本批为原项目队列的第二个 G1 foundation 增量。仅增加 `g1-identity`，保留 G0、G1-local、G1-F01 全部源码、锁文件、原始证据、验收历史和失败记录。当前文档描述实施与验证计划，不能替代实际控制器检查或独立验收。

## 授权、能力和额度

实际用户选择本机独立 OIDC 测试服务及现有模拟器。产品收费模型 API 和新增收费资源保持关闭；不请求生产账户，不自动调用模型或创建收费资源。

2026-10-06 已核对实际 LocalRuntime：支持快照、有界执行、持久状态和取消；仅有受监督本机执行，未具备 OS 隔离、强制策略、受信运行证据或完整消费计量。本机回环端口在沙箱内 EPERM，批准有界主机探针后实际 HTTP 往返成功且监听已关闭。三项私有注册独立评审入口可用，正式每项 600 秒；配置可用不等于检查通过。

原累计声明 10,197 秒和已用 896,929 毫秒（向上取整 897 秒）保留。按用户“增加无线秒控制器额度”的实际授权，官方追加登记 amendment `actual-user-controller-allowance-20261006`：有效累计上限 2,592,000 秒，登记时余额 2,591,103 秒。该值是框架允许的有限最大值，不是无限时间；原队列、单项限制和历史未重置。宿主对话及专业 agent 的 token 与费用未知，不计入控制器秒数。

## 接口及兼容决定

1. 独立回环测试 IdP 使用真实 HTTP 发现、JWKS、授权码及 S256 PKCE。私钥仅由 IdP 子进程持有，用户、客户端和回调均为明确合成测试配置；生产资格待验证。
2. 严格 access-token 校验固定 issuer、API audience、RS256、JWKS key/type、时间、subject 和 session。JWT 自报 actor、payer 或 grants 不构成权限。浏览器输入不取得数据库连接。
3. 原 `createScopeVerifier` 的认证 lookup 和 `PostgresUnitOfWork` 的当前 PostgreSQL 权限锁均保持执行。在原事务 callback 前补充身份/session 锁及当前数据库失效检查；session 撤销写入同一数据源并与业务事务序列化。
4. 身份迁移使用独立 `fabric_identity_migrations`，不向已验收的 `fabric_foundation_migrations` 写入版本 3。旧账本保持版本 1、2，旧迁移源码不变。
5. 精确审批绑定 tenant、Space、Task、Run、operation、目标、操作、参数摘要、artifact、requirement/policy revision、受众、限额及 expiry。requester、executor、当前有审批权限的 human approver 必须相互独立；service principal 不能代替 human consent。
6. 审批消费与 receipt、追加审计、outbox 同事务，强制审计失败导致回滚。去重键不得绑定不同摘要；失去 COMMIT 确认只能查询原键，不自动重放。
7. 来源及目的受众在使用时依据当前数据库授权，锁定当前成员和权限 revision；用户可读取来源并不意味着整个目标受众均可读取。拒绝错误不含私有来源标题或秘密。

### 原交接拒绝后的有界修复

原 tester 交接拒绝指出不同来源 Space 的 payer 未被验证或锁定，旧合成 fixture 使用同一 payer 隐藏了缺口。完整 findings SHA256 为 `110decd99cccb05d4ca8549ed1faab458d68ed0f42f65de11d508a83f134a2a9`；原失败与 receipt 保留，沿原实施 child 和已冻结 native_rework 修复。

本次来源受众查询锁定来源及目标 Space、成员和两个当前 payer actor，拒绝失效 payer；受众摘要同时绑定两个 payer ID 与两个 Space authority revision。测量生产器使用不同来源 payer，覆盖撤销、payer ID 摘要篡改、authority revision 变化与并发撤销锁，并在已有数据库写入后注入失败检查整体回滚。原真实检查发现 fixture 尝试替换 immutable payer；保留失败并修复测试，明确断言该 UPDATE 被原 guard 拒绝，revision 仅在独立 fixture 中单调推进、不回退。以上须由当前候选原始检查、实际新交接与三个注册独立评审验证，不能作为 PASS 证据。

## 分工及依赖

### 第二轮原独立安全评审修复

注册 security review 对候选 `988fe74b…` 实际返回 FAIL：SEC-F02-001 为 RP 仅比较 state/nonce、未消费事务；SEC-F02-002 为先检查的审批参与者 session 可能在后续锁等待期间到期。完整 findings SHA256 `43546e345263c13ca2dfffd3be7882f92ef4d4e332399c9877582d57752fa01c` 保留。沿同一原 child、剩余的第二轮 native_rework 修复；没有增加轮数、评审时限或任务额度。

RP 采用有界、过期、不可伪造的 pending transaction，在任何 token exchange await 前原子消费，并绑定随机 state/nonce/PKCE 与准确端点/client/audience/redirect。真实 HTTP 测试覆盖不同 code 下相同事务的顺序/并发再用。审批在全部锁取得之后以同一数据库时点重查全部必要参与者；写入后再查当前 session 与审批 expiry，不把锁当成时间有效性。真实 PostgreSQL 测试需观察晚到锁等待、早检查 session 到期和零持久副作用。具体实现须由原检查、实际新交接和新的注册评审证明。

| 工作 | 责任 | 文件与依赖 |
| --- | --- | --- |
| 公共接口 | 实际 architecture agent | `src/contracts.ts`；先收集，再派发实现 |
| IdP、token、身份与 HTTP | 实际 backend agent | 6 个精确文件，独立副本 |
| PostgreSQL、审批、审计及受众 | 实际 database agent | 7 个精确文件，独立副本 |
| 包、锁、构建、检查、操作说明 | 主线程执行 devops/documentation/integration | 7 个文件；串行收集与组合验证 |
| 功能检查及交接 | tester | 实际组合候选和控制器原始结果 |
| 安全、代码、需求验收 | 三个私有注册独立上下文 | 当前候选、完整 review-evidence；每项 600 秒 |

Loop 最多 2 个专业 worker 同时占用槽位，宿主最多 4 个上下文包括主线程。草稿副本共用主机权限，不能据此宣称运行隔离。架构输出和收集的草稿都不是正式验收证据。

## 原验收标准和预算

实施任务 `g1_f02_identity`：上限 1,440 秒；三个原命令各 180 秒，首轮 540 秒、完整重试修复储备 540 秒、额外余量 360 秒。

终验任务 `g1_f02_final`：上限 8,280 秒；三个命令在每次外部评审导入后重新执行，540 × 4 + 600 × 3 = 3,960 秒；完整修复复验储备 3,960 秒、额外余量 360 秒。子任务与集成保守合计登记 2 × (1,440 + 8,280) = 19,440 秒，已通过原队列有效预算预检。

| 需求 | 可观察检查 |
| --- | --- |
| F02-01/02 | 独立真实 HTTP 子进程；code/PKCE/state/nonce/回调/签名/key/issuer/audience/type/时间/重放拒绝 |
| F02-02/03/05 | 真实非 owner PostgreSQL；当前身份、session、成员、payer、lifecycle；两连接 session 撤销锁竞争，无未授权副作用 |
| F02-03/04/05 | 独立 human 审批；精确绑定；过期、失效、重复及并发消费；审计故障回滚、原键 unknown-commit 查询；当前来源受众 |
| F02-06 | foundation 42 个文件固定 SHA256；原 597 个保护文件和 88 个原始证据由不变的原检查验证；原 G0/G1-local/foundation 检查 |
| F02-07 | 当前候选三项注册独立 600 秒评审、原始 evidence 副本、实际 tester 交接 |

实际整合前不填 PASS。测试缺失能力必须失败，不得 skip 或以 mock 代替 PostgreSQL/独立网络验收；当前三个 `.test.ts` 和检查脚本是本批待实现的测量生产器。

## 保留的外部资格和后续

正式企业 SSO、真实人的独立审批资格、实物手机、签名分发、真实模型地区/凭证/预算、受保护远端 worker/OS 隔离及完整 G1 仍待验证。已授权队列 G1-F03 至 G1-F07、G2–G5 继续保持依赖及外部资格门槛。完成本增量之后按原队列推进；队列耗尽不等于全产品完成，需要对照原 38 项 AF/UX 需求。

原始第二轮命令在真实 PG 中发现新回归夹具的请求方存活 2 秒恰好触达保留的 2 秒 lock_timeout，得到锁超时而非预期失效拒绝；本轮缩短合成请求方存活为 500 毫秒，保留实际 pg_blocking_pids 阻塞观察、数据库时钟过期观察和全部锁超时/回滚断言，不扩大运行限制。原失败证据保留。
