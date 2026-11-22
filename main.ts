// Vault Break — the hand-in program (Node 22, standard library only).
// It gathers the entry from beside this file — the playable game under
// game/ and the screenshots under screenshots/ — into the output
// directory, then writes /output/dossier.json with the vendored make.fun
// library, which is the summary the judge reads. The grader runs this
// program twice and both runs must write the same bytes; copying files
// and calling buildDossier is deterministic, so they do.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps: the dossier text is capped at 160 KiB, at most
// 4 screenshots of at most 256 KiB each, game/ holds at most 993 files
// and 48 MiB in all, and no path under game/ is over 1000 bytes. These
// numbers are the gate's limits, so the hand-in refuses nothing the
// scorer would accept and accepts nothing it would refuse.
const dossierCaps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, dossierCaps));
