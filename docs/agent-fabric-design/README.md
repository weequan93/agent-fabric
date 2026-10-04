# Agent Fabric design bundle
- boards/ : all 304 .dc.html boards (the HTML design) + canvas.json (index). Source of truth, matches published version 23.
- generators/ : Python scripts that produced and checked the boards (check.py = Playwright render check). Most are one-shot; see the handoff doc before re-running any.
Published canvas: https://claude.ai/code/artifact/906f1e94-28f0-4a2a-ac51-7c3d430bed89
Publishing: Artifact tool with url above, root=boards/, file_path=boards/canvas.json, files=[changed boards], max 255 per publish.
