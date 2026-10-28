// Builds the single-file claude.ai artifact from the same source as the website:
// strips module syntax, inlines styles, loads Three.js from cdnjs, and boots the UI with the claude.ai backend.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(root + p, 'utf8');
const unmodule = src => src
  .replace(/^\/\/ @ts-self-types=.*$/m, '')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '')
  .replace(/^export \{[\s\S]*?\};\s*$/m, '')
  .replace(/^export (function|const|async function|let|class) /gm, '$1 ');
const js = ['supabase/functions/_shared/engine.js', 'src/board3d.js', 'src/backend-claude.js', 'src/ui.js'].map(f => `// ---- ${f} ----\n${unmodule(read(f))}`).join('\n');
const inviteUrl = process.env.ARTIFACT_URL || 'https://claude.ai/artifact/WiWM5Hox7oDQWs3JTip3Ad';
const html = `<title>Hidup di Indonesia</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bungee&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<style>
${read('src/styles.css')}
</style>
<div id="app"></div>
<script>
${js}
startApp(claudeBackend({ inviteUrl: ${JSON.stringify(inviteUrl)} }));
</script>
`;
mkdirSync(root + 'dist-artifact', { recursive: true });
writeFileSync(root + 'dist-artifact/index.html', html);
console.log(`dist-artifact/index.html ${(html.length / 1024).toFixed(0)} KB`);
