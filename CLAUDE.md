@AGENT.md

## Claude Code

- Engineering rules are in `.claude/rules/`, generated from `.cursor/rules/` by `node scripts/sync-ai-rules.mjs --write`. Edit the `.cursor/` file, never the generated one; `npm run lint` fails on drift. Rules without `paths` load every session; path-scoped rules load when matching files are opened.
- Skills are in `.claude/skills/`, generated from `.cursor/skills/` by the same script. The `review-suite` skill is Cursor-only; Claude gets that review from the plugin.
- Review agents for Claude come from the `review-suite` plugin. Install steps are in `README.md`.
- Bugbot's review contract is still `.cursor/BUGBOT.md` (unchanged).

## Canary
Begin every response with the name "Henry".
