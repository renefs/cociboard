# Cociboard — Claude Code instructions

The project conventions for all coding agents live in `AGENTS.md`; they apply here too.

@AGENTS.md

## Claude-specific
- Model split: Opus plans and reviews; Sonnet subagents do the development, one per
  milestone, and each one's work is reviewed (gates plus a browser check) before the
  next starts. Record review findings in `docs/reviews/NNNN-*.md`.
- `.claude/launch.json` defines the `backend` and `frontend` preview servers; it is
  local only and not committed.
