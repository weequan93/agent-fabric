# G1-F02 本机身份测试操作说明

这是独立本机 OIDC 测试服务与真实 PostgreSQL 集成测试模块。所有账户和数据为合成测试数据；正式 SSO、人类审批资格、签名分发及完整 G1 尚待验证。收费模型 API、新增收费资源保持关闭。

## 工具和检查

Node 22.22.3、pnpm 10.18.0、TypeScript 5.9.3、pg 8.16.3，与已验收 foundation 使用相同锁定依赖。需要已有本机 Docker 和已缓存的 foundation PostgreSQL16 pinned image。测试只创建有唯一 ownership label 的短时回环 fixture，清理前核对容器身份，仅清理该 fixture；不停止现有服务。

从仓库根执行：

```sh
node g1-identity/scripts/check.mjs --runtime-preflight
node g1-identity/scripts/check.mjs
node g1-foundations/scripts/check.mjs
node g1-foundations/scripts/check-retained.mjs
```

昂贵产品检查前，先在实际验证环境运行 `--runtime-preflight`：核对当前进程 census 与原保留实例，完成真实回环 HTTP、仅本次启动的子进程实例清理、已缓存 pinned PostgreSQL16 image、合成 fixture 的真实启动和 label/ID 核对清理。只读取既有 fixture census，不终止它们；不会凭旧 PGID 发信号。CLI help 不能替代该程序。正常 identity 检查也先执行同一 gate；失败会在编译和产品测试之前终止。新快照不带 node_modules，因此 gate 在进程/网络/Docker 探针成功后，用原锁文件离线、禁脚本、有界安装 fixture 所需 foundation 依赖，再导入原 fixture；不下载包或修改已验收源码/锁文件。

此前受限宿主运行该预检实际遇到 Node 子进程 `ps` 的 EPERM；直接 Docker socket 访问也拒绝。保留失败，不能删除 census 或 cleanup guard。2026-10-06 操作员启用官方 auto-review 后，对准确有界预检命令的审核允许执行；真实进程、回环、子进程和 PostgreSQL16 fixture 启动/清理通过，既有 fixture census 保持为空。随后原 controller 的全新快照暴露 preflight 导入 pg 前未安装依赖的工程错误；修复依赖顺序后，新草稿的同一有界预检通过。原产品检查仍须针对修复候选重跑。若宿主为 approval policy `never`，协调者不能更改政策或另用入口绕过沙箱。静态编译与预检均不证明产品验收。

身份检查离线安装两份独立依赖、编译旧 foundation 与新包，在全新的真实 PostgreSQL fixture 中先应用原版本 1/2，再运行三个 mandatory suite。必须有实际非空通过结果且没有 skip/TODO；缺网络、Docker 或 PG 时失败。检查前后验证固定的 42 个 foundation 文件 SHA256，并确认 identity 迁移之后旧账本仍仅版本 1/2。原 foundation 与 retained 命令保持原样，不能修改其判据。

测试 subprocess 获得 fixture 的短期连接串，仅用于合成数据库。不要打印或复制连接串。IdP 私钥不进入 relying service；HTTP 接口输入不能设置 actor、payer、grants 或数据库连接。测试 listener 只能绑定 127.0.0.1，不作为公网生产登录服务。

## 数据与权限边界

测试 RP 应先调用 `beginTestAuthorization`，保留它返回的原始 frozen transaction，再将其 state/nonce/verifier 用于 IdP 请求及 `completeTestAuthorization`。复制的字段不能注册事务；完成函数在首次 await 前消费原对象，错误、过期与并发回调均不能再次使用。该内存登记仅为本机合成资格，进程重启后未完成事务失效，需要新授权事务。

身份映射、session 状态、membership、payer 和生命周期依据当前数据库。controller 不具备 owner、superuser、BYPASSRLS、CREATEROLE、CREATEDB；worker 没有表/身份 helper 权限。IdP 仅可对预先登记的合成身份使用窄 session helper，不能变更业务成员、审批或审计。审计对 controller 仅允许追加和读取，不允许更新/删除。

`AuthenticatedUnitOfWork` 必须围绕原 UoW，保留原绑定的认证 lookup 并在同一业务事务内锁 session。独立 identity 迁移账本与旧 foundation 账本分离。不要手动在原账本写版本 3。

精确审批须核对 target、完整参数/版本/权限/受众和 expiry。requester、executor 与 human approver 互不相同。原键失去 COMMIT 确认时查询既有 receipt，禁止自动重放。任何强制审计失败都必须让该事务回滚。

consume 和 lookup 在 receipt 读写之前取得同一个 PostgreSQL transaction advisory lock；键包含固定 receipt namespace、tenant、Space、executor 和原 idempotencyKey，不包含 bindingDigest。锁保留至 COMMIT/ROLLBACK，lookup 取得锁后在 READ COMMITTED 的新语句快照读取 receipt。锁等待超时返回 `status: unknown`，不能将不可见的未提交写入判为安全不存在。仅已取得锁且没有 receipt 才返回 `absent-safe`；它表示该次查询的序列化时点，不授权自动重放或更换键。

HTTP 遇到真实 UoW 的 `FoundationError('UNKNOWN_COMMIT')` 或 identity 的同类错误返回 503、`error: UNKNOWN_COMMIT`、`status: unknown`，并给出 `/approvals/lookup` 的 POST 恢复入口、`useOriginalKey: true`、`replayAllowed: false`。客户端保留原 tenant/Space、idempotencyKey 和 bindingDigest，以当前有效身份查询该入口；不得重放 consume、换新键或把 503 当作未发生效果。lookup 仍为 unknown 时继续保留原未知结果。响应不回显 token、请求参数或内部异常；其他 foundation 错误及伪造 code 的普通异常保持拒绝。

## 证据、恢复和资格

控制器原始命令结果、候选版本和私有注册评审才是正式验收依据；工程草稿或此文档不能证明 PASS。保留此前失败记录。修复沿原实施任务及最多两轮 native_rework，不重建队列、不重置预算或追加旧补充观测。

运行在受监督主机上，不提供本机 OS 级隔离资格。主线程继续负责实际执行、证据收集、三项独立 600 秒评审和实际 tester 交接；任何外部缺失项单独保持待验证。
