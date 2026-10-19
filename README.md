# AI Skills

A public repository of AI skills created by Bitovians.

Skills are reusable instructions that teach Claude (or other AI assistants) how to perform specific tasks consistently — things like writing Jira stories, reviewing code, or following a particular workflow.

## Using a skill

Skills in this repo are meant to be copied into your own projects, not referenced remotely. To use one:

1. Find the skill you want under [Skills/](Skills/).
2. Copy its folder (including `SKILL.md` and any supporting files) into your own project.
3. Follow any setup instructions in the skill's `SKILL.md`.

## Adding a skill

Want to share a skill you've built? Add it as a markdown file under `Skills/`:

1. Create a new folder under `Skills/` named after your skill (e.g. `Skills/my-skill-name/`).
2. Add a `SKILL.md` file describing what the skill does and how to use it.
3. Include any supporting files (examples, templates, etc.) in the same folder.
4. Open a pull request.

## Skills

- [multi-step-skill-designer](Skills/multi-step-skill-designer): Design a multi-step skill with Claude on a live canvas, then generate one skill per step plus a thin entry skill. Needs [skill-canvas](Skills/skill-canvas) copied alongside it.
- [roast](Skills/roast) — A brutally honest, no-nonsense code review that pushes back hard on bad patterns, security issues, and design smells.
- [skill-canvas](Skills/skill-canvas): A live canvas that shows a multi-step skill's steps, parallel branches, conditions, inputs and outputs. Needs Node.js 16+.
- [write-jira-story](Skills/write-jira-story) — Generate well-structured Jira stories.
