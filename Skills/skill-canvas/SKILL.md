---
name: skill-canvas
description: Use when the user wants to see, map or review the architecture of a multi-step skill (steps, parallel branches, conditional steps, dynamic inputs and outputs) on a live visual canvas. Works for an existing skill ("visualize the log-freshbook-hours skill", "show me how X's steps fit together", "review X on the canvas") and is the canvas multi-step-skill-designer uses while building new ones.
argument-hint: "<skill name or path to visualize, or blank for an empty canvas>"
---

# Skill canvas

A live canvas of a multi-step skill: its steps, parallel branches, dynamic inputs and dynamic outputs. You maintain one JSON file (`skill-spec.json`); the page redraws within a second. The user can edit on the canvas too, and both of you review changes through the same loop.

The canvas shows a skill's design, not a running skill.

## Vocabulary (use these terms with the user)

- **Dynamic input**: changes *which steps happen*, not just the data steps work on. Gets a toggle on the cards it affects.
- **Data input**: changes what steps work on only. Shown as a chip.
- **Dynamic output**: an evolving plan, checklist or intermediate product, shaped by earlier steps. It is a consequence of dynamic inputs. Not just a finished product.

## Open the canvas

```bash
scripts/start.sh <workspace> [port]
```

Resolve `scripts/` relative to this skill's folder and run it in the background. Needs Node 16+.

- **Workspace**: one folder per skill, because each holds one `skill-spec.json`. Use `./skill-viz` for the skill being worked on now. If that folder already holds a spec for a different skill, use `./skill-viz-<skill-name>` instead of overwriting it.
- **URL**: the script prints the URL to open. If the workspace is already being served it prints `Already serving: <url>`, which may be on a different port than you asked for. Open the printed URL in a browser pane, or give the user the link. It must be opened over http, not as a file.
- **Port**: defaults to 8765. If another workspace already uses it, pass a different port.

## Visualize an existing skill

1. Read the skill's entry `SKILL.md` and every node skill it runs. Follow `references/from-skill.md` to turn them into a spec.
2. Write the spec to the workspace and set `outputDir` to the folder that holds those skills (for example `.claude/skills`), so an approved review writes back to them.
3. Tell the user what is on the canvas in two or three lines, plus anything you could not map (for example a step whose run condition the files never state).

Do not change the skill files while visualizing. The canvas is a picture of them until the user asks for a change.

## Review loop (canvas and files)

Both sides of a review use the same loop, so one person can review the canvas while another reviews the files:

- **On the canvas**: the user drags cards, draws connections, adds or deletes steps, writes a note on any step, then clicks **Ready for agent**. You improve the spec and set `status: "enhanced"`. The user accepts or rejects each change, then presses **Approve**.
- **In the files**: the **Files** panel lists what is in `outputDir` and previews each file live, so a reviewer can read the actual `SKILL.md` files as you write them.

Read each step's `userNote` as an instruction, and never remove the user's `x`/`y`. Write skill files only after an `approve` event. Follow `PROTOCOL.md` for the full loop (it is agent-neutral). In Claude Code, run `node scripts/skillviz.js wait <workspace> --name claude` in the background with the Monitor tool so a click wakes you.

## Notes

- Schema and spec rules: `references/spec.md`.
- Do not edit `template.html` per skill. It is generic; only `skill-spec.json` changes.
- The canvas: drag to pan, Ctrl+scroll or pinch to zoom, buttons or keys (+ - 0 1) for zoom, fit and 100%.
- Tests: `node tests/core.test.js` (canvas logic) and `node tests/server.test.js` (server, signals, wait).
