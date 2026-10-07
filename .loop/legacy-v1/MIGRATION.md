# Loop v1 → v2 migration

```json
{
  "project": "/Users/super/Documents/ai/agent-fabric",
  "v1_team": "team-aa741c058dac4bbb8e530e859445a639",
  "tasks": [
    {
      "id": "g1_f02_identity",
      "status": "done",
      "v1": "COMPLETE"
    },
    {
      "id": "g1_f02_final",
      "status": "active",
      "v1": "RUNNING"
    }
  ],
  "acceptance": [
    "identity-behavior",
    "foundation-behavior",
    "retained-baselines"
  ],
  "reviews": [
    "team-independent-security",
    "team-independent-reviewer",
    "team-independent-acceptance"
  ],
  "drafts": [],
  "export_bundle": "/var/folders/zc/8zfqkrh55wz4825ghhhp5lr80000gn/T/loop-v1-export-agent-fabric-20261006T102301",
  "dry_run": false,
  "applied": {},
  "removed_host_entries": [
    "/Users/super/Documents/ai/agent-fabric/.codex/config.toml"
  ],
  "installed": [
    "/Users/super/Documents/ai/agent-fabric/.loop/bin/loop",
    "/Users/super/Documents/ai/agent-fabric/.mcp.json",
    "/Users/super/Documents/ai/agent-fabric/.claude/skills/loop/SKILL.md",
    "/Users/super/Documents/ai/agent-fabric/.codex/config.toml",
    "/Users/super/Documents/ai/agent-fabric/.agents/skills/loop/SKILL.md",
    "/Users/super/Documents/ai/agent-fabric/AGENTS.md"
  ],
  "goal": "agent-fabric-g1_f02_local_identity"
}
```

The v1 state directory `/Users/super/Documents/ai/loop-states/agent-fabric` was not modified. Delete it only after the migrated goal is accepted.
