import { build } from 'bun';
import { existsSync, mkdirSync, copyFileSync, renameSync, rmdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import tailwindPlugin from 'bun-plugin-tailwind';

const outDir = './dist';

// Recursively copy a directory tree (used for phase skill markdown, which must
// ship to dist/ so sub-agents can fetch it via chrome.runtime.getURL()).
function copyDirTree(fromDir: string, toDir: string): void {
  if (!existsSync(fromDir)) return;
  mkdirSync(toDir, { recursive: true });
  for (const entry of readdirSync(fromDir)) {
    const from = join(fromDir, entry);
    const to = join(toDir, entry);
    if (statSync(from).isDirectory()) {
      copyDirTree(from, to);
    } else {
      copyFileSync(from, to);
      console.log(`Copied: ${from} -> ${to}`);
    }
  }
}

// Ensure output directory exists
if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

// Build the React app
const result = await build({
  entrypoints: ['./src/index.tsx', './src/tab.tsx', './src/content.ts', './src/onboarding.tsx', './src/background/index.ts', './src/google-docs-bridge.ts', './src/slide-renderer.ts'],
  outdir: outDir,
  format: 'esm',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
  splitting: false,
  external: ['chrome'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  plugins: [tailwindPlugin],
});

if (result.success) {
  console.log('Build successful!');
  console.log(`Output: ${outDir}/index.js`);

  // Copy static files
  const filesToCopy = [
    { from: './public/sidebar.html', to: `${outDir}/sidebar.html` },
    { from: './public/tab.html', to: `${outDir}/tab.html` },
    { from: './public/onboarding.html', to: `${outDir}/onboarding.html` },
    { from: './public/slide-renderer.html', to: `${outDir}/slide-renderer.html` },
    { from: './manifest.json', to: `${outDir}/manifest.json` },
  ];

  // Copy lib files if they exist
  const libFiles = [
    'highlight.min.js',
    'highlight-github-dark.min.css',
    'turndown.js',
  ];

  // Create lib directory
  const libDir = join(outDir, 'lib');
  if (!existsSync(libDir)) {
    mkdirSync(libDir, { recursive: true });
  }

  for (const file of libFiles) {
    const from = join('./lib', file);
    const to = join(libDir, file);
    if (existsSync(from)) {
      filesToCopy.push({ from, to });
    }
  }

  // Bundle marked's UMD build into dist/lib for the HTML export feature
  // (fetched at export time so the sidebar bundle stays lean).
  {
    const from = join('./node_modules/marked/lib/marked.umd.js');
    const to = join(libDir, 'marked.umd.js');
    if (existsSync(from)) {
      filesToCopy.push({ from, to });
    }
  }


  // Copy icons if they exist
  const iconsDir = './icons';
  if (existsSync(iconsDir)) {
    const iconsOutDir = join(outDir, 'icons');
    if (!existsSync(iconsOutDir)) {
      mkdirSync(iconsOutDir, { recursive: true });
    }
    // Copy all icon files
    const iconFiles = [
      'icon16.png',
      'icon48.png',
      'icon128.png',
    ];
    for (const file of iconFiles) {
      const from = join(iconsDir, file);
      const to = join(iconsOutDir, file);
      if (existsSync(from)) {
        filesToCopy.push({ from, to });
      }
    }
  }

  for (const { from, to } of filesToCopy) {
    try {
      copyFileSync(from, to);
      console.log(`Copied: ${from} -> ${to}`);
    } catch (e: unknown) {
      console.warn(`Failed to copy ${from}: ${(e as Error).message}`);
    }
  }

  // Copy phase skill markdown (sub-agents fetch these at runtime).
  copyDirTree(join('src', 'skills'), join(outDir, 'skills'));

  // Flatten dist/src/* to dist/ (Bun preserves src/ subdir structure)
  const srcOutDir = join(outDir, 'src');
  if (existsSync(srcOutDir)) {
    const flatFiles = ['index.js', 'tab.js', 'content.js', 'index.css', 'onboarding.js', 'onboarding.css', 'google-docs-bridge.js', 'slide-renderer.js'];
    for (const file of flatFiles) {
      const from = join(srcOutDir, file);
      const to = join(outDir, file);
      if (existsSync(from)) {
        renameSync(from, to);
        console.log(`Flattened: ${from} -> ${to}`);
      }
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
    console.log(`Flattened: ${bgFrom} -> ${bgTo}`);
    // Clean up empty background directory
    try {
      rmdirSync(bgSrcDir);
    } catch {
      // Directory not empty or doesn't exist, ignore
    }
  }

  console.log('\nBuild complete! Load the extension from the dist/ folder.');
} else {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
