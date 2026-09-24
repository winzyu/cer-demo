# Cloud context-exploration prompt

Fill `<slug>` (short kebab-case task name), the scope files and three to five concrete questions.
Scope files must exist at pushed `dev`.
Tell the user to run it on Sonnet (`claude --model sonnet --cloud "..."` from cer-demo, or paste at claude.ai/code).

```
Context exploration for <task>, read-only except for the report. Follow "Cloud sessions" in CLAUDE.md.
Read only these files: <scope files>. Do not run tests, install packages or start the server.
Answer:
1. <question>
2. <question>
Write explore/<slug>.md, at most 60 lines: the explored commit (git rev-parse --short HEAD); each question with its answer and file:line references; open questions; risks. Quote at most one line per reference; no pasted code blocks.
Commit only that file to branch cloud/explore-<slug>, push it, and stop.
```

Local start line for the next session:

```
Run git fetch origin cloud/explore-<slug>, read it with git show origin/cloud/explore-<slug>:explore/<slug>.md, check git diff <explored commit>..HEAD --stat on its cited paths, verify key claims at their file:line before editing, then work <task>.
```
