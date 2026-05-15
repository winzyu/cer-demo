# CLAUDE.md — Clean Earth RAG

Project-level instructions for Claude Code. Read `README.md` first; that is the build spec. This file is for *how* you work, not *what* you build.

---

## Git & version control

- **Do not run `git push`, `git commit`, `git merge`, or any other history-modifying git command.** I handle all git actions myself.
- You may run read-only git commands (`git status`, `git diff`, `git log`, `git show`) freely.
- Do not create branches.
- Do not modify `.gitignore` without asking.
- If you think a commit is warranted, say so in your response and let me make it.

## Tests

- Write a test for any non-trivial function before considering it done. "Non-trivial" means: anything with branching, anything that touches the database, anything that parses input.
- Tests live in `backend/tests/`, named `test_*.py`.
- Don't write tests that hit the live Fireworks API. Mock the LLM client.
- A passing test does not mean the code works. Run the actual flow end-to-end before claiming a task is complete.

## Verification before claiming "done"

- Before saying a task is finished, state explicitly what you ran to verify it worked. "It should work" is not verification.
- For backend changes, run the server and hit the endpoint with `curl` or equivalent. Paste the actual output.
- For seed scripts, show the row counts before and after.
- For RAG retrieval changes, show a sample query and the chunks it returned.

## Communication style

- Be terse. I don't need preambles, summaries of what you're about to do, or recaps of what we just discussed.
- When you finish a task, list the files you changed and what changed in each. One line per file.
- If you couldn't do something or got stuck, say so plainly. Don't paper over partial completion.
- Do not write `# TODO: implement this` and call the task done. If something is unimplemented, say it in your response.
- When you make a non-obvious technical choice, say why in one sentence. Don't write essays.

## Asking questions

- Batch your questions. If you have three things to clarify, ask them all at once, not one per message.
- If you can answer your own question by reading the codebase or the README, do that first.

## Privacy

- The data in this project is dummy data for the baseline, but the production version will handle confidential data under a DPA with Fireworks. Treat it as if it's already real.
- Do not write code that sends sensor data, document contents, or user messages to any service other than Fireworks (and Postgres locally).
- If you find yourself about to add an outbound HTTP call to a domain other than `api.fireworks.ai`, stop and confirm.

## Additional Rules

- When a request is ambiguous, ask one clarifying question rather than guessing. Guessing wastes more time than asking.
- **"Show me the plan first."** Before writing more than ~30 lines of code, outline what you're about to do and wait for me to approve.
- **Quote the README when you cite it.** "Per README Section 5, the corpus owner is TBD" is more useful than "as discussed."
- **No speculative comments.** Don't write `# In the future, we might want to ...`. The README's Deferred section is the only place that kind of thinking belongs.
