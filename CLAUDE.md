# Grove Hunters

Verse8 web MMORPG (Vite + React + TypeScript + three.js, server in `server/src/server.ts`). The repo keeps its old
working name, traitor-hunt.

**Before any work, read [docs/VERSE8-EDITOR.md](docs/VERSE8-EDITOR.md).** Every GitLab `develop` push auto-deploys
and must run in the Verse8 editor as-is.

- After each finished task: commit on `master`, merge `master` into local `develop`, push `origin master` and
  `gitlab develop`. Never force-push, never deploy by hand, never merge `develop` into `master`.
- Game assets live only on `develop` (GitHub is public; Unity EULA).
- Run `npx tsc -b`, `npx vitest run` and `npm run server:test` right before every commit.
- Talk to the user in Korean.
