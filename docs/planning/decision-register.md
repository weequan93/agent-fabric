# 决策、假设与资料登记

规划日期：2026-10-04。依据[主规格 v1.1](../Agent_Fabric_Master_Product_and_Technical_Specification_v1.1.md)第 27、30、32 节及[设计包说明](../agent-fabric-design/README.md)。产品尚未实现；下列责任是角色建议，不是已确认人员、采购、环境或用户答案。

## 已确定的方向

| ID | 决定及来源 | 实施影响 |
| --- | --- | --- |
| D-01 | 用户实际选择本批完成路线图与 G0 实施计划 | 只交付计划包，G0 产品代码/云试验/部署留后续批次 |
| D-02 | v1.1 是当前产品基线，§1、33 | 保留 AF-01–20 和 UX-01–18；历史材料不构成竞争指令 |
| D-03 | 自有原生引擎 owns loop/context/delegation/completion，§7–10 | 禁止用嵌套竞争 harness 替代普通执行；模型无授权权威 |
| D-04 | Space 是 audience/data/storage/computer 边界，§3–4、12 | 不用可变 currentSpace 授权；navigation 不迁移 Task/Run；普通 Ask 无 VM |
| D-05 | Task/Run/artifact/check/delivery/notification 分离，§8、15 | draft ready 不等于 published；未知外部结果不盲重试 |
| D-06 | G1 有真实 web、desktop、mobile，§5、30 | 先共享契约与后端，再薄客户端；不得把移动端改为可选 |
| D-07 | 基础身份、Space授权、源受众、预算、保留、效果审批从G1工作，§30 | G2扩企业管理，不能补欠基础保障 |
| D-08 | Stop/current authority/fencing；接管有 all-path mutation barrier，§6、21 | stale progress不拒绝Stop；G3接管不是仅锁鼠标 |
| D-09 | Memory与Reflect独立授权，§16–18、23–24 | 事实修正直接版本化；方法发布须独立评估和授权 |
| D-10 | 首期Linux远端资格配置；本地需显式enrollment，可选硬件不普遍保证，§12–13 | 只展示实际合格组合；不得自动本机/跨区fallback |

## 实施方向与工程假设

| ID | 状态/方向 | 责任角色与核对点 |
| --- | --- | --- |
| E-01 | 规格建议TypeScript模块化core；React/Electron；React Native/Expo development builds | 架构/clients，G0版本调查、G1 streaming/SSO/accessibility/secure update实际试验后锁定 |
| E-02 | Temporal durable history、PostgreSQL权威metadata/outbox、object storage大payload、Space volume分离 | 架构/数据/G0-04、runtime，不能把投影或snapshot作授权/事务 |
| E-03 | LiteLLM或客户合格gateway；OPA决策+broker实际执行；OpenShell待部署资格 | 模型/FinOps/security/runtime，edition/许可/版本/实际控制需各自证据 |
| E-04 | OpenTelemetry与受保护audit；WebRTC显示传输与input broker分离 | SRE/clients，G1观测、G3真实输入/网络/lease试验 |
| E-05 | G0建议按14个包、接口先行、合成adapter+确定性fixture | 本批工程建议；实施时选择测试框架/包管理工具并lock，不能当已编译产品 |
| E-06 | 不给headcount、日期、成本或服务保证 | 实际责任人与能力/容量调查后再排工期；宿主用量未知 |
| E-07 | §29 warm ack p95≤2s、传播≤3s、Stop新dispatch≤2s、lease最大30s | 待测pilot参数；实际工作负载、样本、环境、失败/取消结果预先固定；不是当前SLA |

## 待解决的实施选择

| ID | 未解决事项 | 责任角色 | 最迟门/依赖 | 可审阅的决策结果 |
| --- | --- | --- | --- | --- |
| O-01 | 真实人员与职责/独立验证身份 | 协调/evaluation/security | G0实施启动，G0-01/14 | 真实owner矩阵、独立签名/执行路径；角色文字不当签名 |
| O-02 | 包管理、测试框架、依赖/Node版本、许可/锁与SBOM策略 | 架构/build | G0-02 | 与选定工具实测匹配的lock/build/check命令，版本资格结果 |
| O-03 | 实际Linux host/kernel/image、OpenShell控制覆盖/egress/resource与browser隔离 | runtime/SRE/security | G1前；G3敏感认证前扩验证 | 实际image/host/policy/generation、允许/拒绝/恢复结果；不支持路径阻止 |
| O-04 | shared-volume canonical commit、文件lease、未保存数据、crash/snapshot restore | 数据/runtime | G0-04协议；G1/G2实际试验 | 每类数据save/checkpoint/RPO/RTO及恢复次序，实测恢复记录 |
| O-05 | model profile、gateway edition、modalities/streaming/cancel、usage delay/overrun | 模型平台/FinOps | G0-09/10契约；G1路由；G2billing | 能力/approved equivalents、price/region、reservation与maximum overrun policy |
| O-06 | SSO/目录/role bundles、service identity、JML与独立approver | identity/security/product | G0-03契约，G1基础，G2完整JML | 可理解grant bundles和join/revoke/owner-offboarding实际证据 |
| O-07 | 部署地区、retention/backup/legal hold、strict brokered access/direct-link窗口 | data/security/平台政策owner | G0-01/04协议，G1shared pilot前 | 获准data-flow/region/retention；实际撤权路径与已发bytes限制 |
| O-08 | desktop/mobile认证、stream/input、keyboard/touch/accessibility、签名分发 | clients/runtime | G1三端；G3remote input专项 | qualified平台矩阵、sleep/reconnect/Stop/结果旅程与native试验 |
| O-09 | 独立review/acceptance评估器尚无自动runner | evaluation/协调 | 本批Loop正式评审/终验 | 已注册匹配执行器或实际评估者的合法当前候选签名；不能由作者生成 |
| O-10 | 缺少历史蓝图、研究报告、伴随review register | 产品/资料owner | 需要历史对照时；不阻塞v1.1可支持规划 | 提供原件后另作增量对照；不虚构缺失内容 |

O-03–O-08 是待资格验证的工程选择，不重新打开原生所有权、remote-first、Space隔离或三端要求。真实共享试点前必须解决相关强制控制；时间经过和用户未回答不构成许可。

## 资料读取台账

| 文件 | 本次实际操作 | SHA-256 |
| --- | --- | --- |
| 主规格v1.1 | 主线程分段阅读33编号章节及来源登记；架构/覆盖顾问读相关章节；未复核第三方线上资料 | `742426037b850ed220ba74bb3d14800e46242236b662563da047206000578949` |
| design/README.md | 阅读304板/版本23/一次性生成器交接说明 | `89e70f3b5009b6353b79dd5faead94da2017e06534516c043fd2a04bfb6fe99d` |
| boards/canvas.json | 解析索引，304个引用均有对应HTML文件 | `c314561006b33cef873a0ec8f4c49edfb46eb86822b9b2a2e3558c953ad0f9e6` |
| boards/Handoff-Notes.dc.html | 提取完整文字：token、平台布局、组件、设计覆盖和作者限制说明 | `ad3f9fce9ccafed7c243f0c423c11383d1c9292850dea1b97a236ae8e73c11b7` |
| boards/Start-Here.dc.html | 提取入口、device/流程与设计链接文字 | `bede378859ee2c16bd704c988c469e073e7196ed7a345d0a8a2d2aba7c9ed165` |

代表性阅读包括 Main、Layouts、Envelope-Desktop、Task-Desktop、Stop-Desktop。没有逐页渲染304板或执行交互。Handoff中的299个playable、contrast比率和渲染结果是交接作者声明，本批没有重测，不能转记为当前产品通过。

资料缺口：D01–D06所指历史蓝图/v1.0/研究报告、v1.1伴随评审登记未随仓库提供。设计中的姓名、日期、金额、地区均为sample/placeholder；部分板保留 `{{ dl }}`，Setup-Desktop/Setup-Windows有region placeholder。真实地区由O-07解决。保留源板；UI复用、dark token与biometric样例不能代替原生平台验收。一次性生成器本批不重跑，外部设计画布不发布。

## 变更和证据规则

每个新选择记录来源、状态、owner、受影响AF/UX、决策触发点、真实验证结果和回退；调整范围时更新追溯和验收，不静默删除需求。新artifact/policy/requirement版本使相关approval/check失效。高严重授权/隔离/陈旧审批/重复效果问题阻止受影响profile发布。

本批实际一致性命令与顾问只读意见会由Loop保留；它们可证明计划文件完整性，不证明未来产品行为。O-09未满足时，正式独立review/acceptance保持pending，作者不能生成自己的签名通过。

