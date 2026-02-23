import { build } from 'bun';
import { existsSync, mkdirSync, copyFileSync, renameSync, rmdirSync, watch } from 'fs';
import { join } from 'path';
import tailwindPlugin from 'bun-plugin-tailwind';

const outDir = './dist';
const WS_PORT = 35729;

// --- WebSocket server for hot reload notifications ---
const clients = new Set<ServerWebSocket<unknown>>();

const wsServer = Bun.serve({
  port: WS_PORT,
  fetch(req, server) {
    if (server.upgrade(req)) return;
    return new Response('Hot reload server', { status: 200 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
    },
    close(ws) {
      clients.delete(ws);
    },
    message() {},
  },
});

console.log(`[dev] Hot reload server running at ws://localhost:${WS_PORT}`);

// --- Build function ---
async function runBuild(): Promise<boolean> {
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const result = await build({
    entrypoints: ['./src/index.tsx', './src/content.ts', './src/onboarding.tsx', './src/background/index.ts'],
    outdir: outDir,
    format: 'esm',
    target: 'browser',
    minify: false,
    sourcemap: 'external',
    splitting: false,
    external: ['chrome', './mcp.js'],
    define: {
      'process.env.NODE_ENV': '"development"',
    },
    plugins: [tailwindPlugin],
  });

  if (!result.success) {
    console.error('[dev] Build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    return false;
  }

  // Copy static files
  const filesToCopy: { from: string; to: string }[] = [
    { from: './public/sidebar.html', to: `${outDir}/sidebar.html` },
    { from: './public/onboarding.html', to: `${outDir}/onboarding.html` },
    { from: './manifest.json', to: `${outDir}/manifest.json` },
  ];

  const libDir = join(outDir, 'lib');
  if (!existsSync(libDir)) mkdirSync(libDir, { recursive: true });

  const libFiles = ['highlight.min.js', 'highlight-github-dark.min.css', 'turndown.js'];
  for (const file of libFiles) {
    const from = join('./lib', file);
    if (existsSync(from)) filesToCopy.push({ from, to: join(libDir, file) });
  }

  if (existsSync('./mcp.js')) {
    filesToCopy.push({ from: './mcp.js', to: join(outDir, 'mcp.js') });
  }

  const iconsDir = './icons';
  if (existsSync(iconsDir)) {
    const iconsOutDir = join(outDir, 'icons');
    if (!existsSync(iconsOutDir)) mkdirSync(iconsOutDir, { recursive: true });
    for (const file of ['icon16.png', 'icon48.png', 'icon128.png']) {
      const from = join(iconsDir, file);
      if (existsSync(from)) filesToCopy.push({ from, to: join(iconsOutDir, file) });
    }
  }

  for (const { from, to } of filesToCopy) {
    try {
      copyFileSync(from, to);
    } catch (e: unknown) {
      console.warn(`[dev] Failed to copy ${from}: ${(e as Error).message}`);
    }
  }

  // Flatten dist/src/* to dist/
  const srcOutDir = join(outDir, 'src');
  if (existsSync(srcOutDir)) {
    for (const file of ['index.js', 'index.js.map', 'content.js', 'content.js.map', 'index.css', 'onboarding.js', 'onboarding.js.map', 'onboarding.css']) {
      const from = join(srcOutDir, file);
      const to = join(outDir, file);
      if (existsSync(from)) renameSync(from, to);
    }
    // Clean up empty src directory
    try {
      rmdirSync(srcOutDir);
    } catch {
      // Directory not empty or doesn't exist, ignore
    }
  }

  // Flatten background script from dist/background/index.js to dist/background.js
  const bgSrcDir = join(outDir, 'background');
  const bgFrom = join(bgSrcDir, 'index.js');
  const bgTo = join(outDir, 'background.js');
  if (existsSync(bgFrom)) {
    renameSync(bgFrom, bgTo);
    // Also move sourcemap if exists
    const mapFrom = join(bgSrcDir, 'index.js.map');
    const mapTo = join(outDir, 'background.js.map');
    if (existsSync(mapFrom)) {
      renameSync(mapFrom, mapTo);
    }
    // Clean up empty background directory
    try {
      rmdirSync(bgSrcDir);
    } catch {
      // Directory not empty or doesn't exist, ignore
    }
  }

  return true;
}

// --- Write hot-reload.js to dist/ ---
async function writeHotReloadClient() {
  const clientJs = `(function() {
  const ws = new WebSocket('ws://localhost:${WS_PORT}');
  ws.onmessage = function(e) {
    if (e.data === 'reload') {
      console.log('[hot-reload] Changes detected, reloading...');
      location.reload();
    }
  };
  ws.onclose = function() {
    setTimeout(function() { location.reload(); }, 2000);
  };
})();
`;
  await Bun.write(join(outDir, 'hot-reload.js'), clientJs);
}

// --- Inject hot reload client into sidebar.html ---
async function injectHotReloadScript() {
  const htmlPath = join(outDir, 'sidebar.html');
  if (!existsSync(htmlPath)) return;

  const html = await Bun.file(htmlPath).text();

  if (html.includes('hot-reload.js')) return; // already injected

  const injected = html.replace('</body>', `  <script src="hot-reload.js"></script>\n</body>`);
  await Bun.write(htmlPath, injected);
}

// --- Notify all clients to reload ---
function notifyClients() {
  for (const client of clients) {
    try {
      client.send('reload');
    } catch {}
  }
}

// --- Debounce helper ---
function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

// --- Initial build ---
console.log('[dev] Building...');
const ok = await runBuild();
if (ok) {
  await writeHotReloadClient();
  await injectHotReloadScript();
  console.log('[dev] Initial build complete. Watching for changes...\n');
} else {
  process.exit(1);
}

// --- Watch file changes ---
const debouncedRebuild = debounce(async () => {
  console.log('[dev] Changes detected, rebuilding...');
  const success = await runBuild();
  if (success) {
    await writeHotReloadClient();
    await injectHotReloadScript();
    notifyClients();
    console.log('[dev] Rebuild complete, sidebar will reload automatically.\n');
  }
}, 300);

const watchDirs = ['./src', './public', './manifest.json', './mcp.js'];

for (const dir of watchDirs) {
  if (existsSync(dir)) {
    watch(dir, { recursive: true }, debouncedRebuild);
  }
}

console.log('[dev] Watching for changes in: src/, public/, manifest.json');
console.log('[dev] Load extension from dist/ folder and enable Developer Mode in Chrome.\n');

// Keep process alive
await new Promise(() => {});
