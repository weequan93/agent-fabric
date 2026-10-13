# Turn163 probe corrections

The initial controller request used f05-01.build (unknown). It was rejected before job creation. Corrected request used f05-01.strict-build, f05-02.authority-component and f05-11-maintenance-failure-capture.original-maintenance-failure-still-refused; actual job job-7877bd5607.

Exact command `python3 docs/loop/agent-fabric-g1-f05-storage/readiness-turn163/collect-controller.py` returned exit1: AssertionError at line9 `assert job['status']=='finished'`, while the controller reported running with all three check results pass. No stream copies were created by this attempt. The guard was retained unchanged.

The dependent command `node docs/loop/agent-fabric-g1-f05-storage/readiness-turn163/decode-authority.mjs` returned exit1: ENOENT opening `/Users/super/Documents/ai/agent-fabric/docs/loop/agent-fabric-g1-f05-storage/readiness-turn163/controller/job-7877bd5607/f05-02.authority-component/stdout.log` at decode-authority.mjs:6:13. This was a premature dependent collection attempt, not a tool/product permission failure or a passing resource probe.

After loop_check reported finished, both original commands succeeded, complete streams were copied/read-verified, and the unchanged shipped decoder verified the final command receipt. No check rerun, guard change, old ownership cleanup, product dispatch or raw-stream edit occurred. Local sysctl/process-census restrictions remain as captured in exact resource-probes streams; controller fixture observations provide the external-to-sandbox local startup/cleanup route.
