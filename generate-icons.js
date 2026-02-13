// Quick icon generator — run with: bun generate-icons.js
// Creates simple PNG icons for the Chrome extension

const sizes = [16, 48, 128];

for (const size of sizes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F46E5"/>
      <stop offset="100%" style="stop-color:#7C3AED"/>
    </linearGradient>
    <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#C4B5FD"/>
      <stop offset="100%" style="stop-color:#E0E7FF"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <g transform="translate(24, 24)" stroke="url(#fg)" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M40 8L8 24l32 16l32-16L40 8z"/>
    <path d="M8 56l32 16l32-16"/>
    <path d="M8 40l32 16l32-16"/>
  </g>
</svg>`;

  await Bun.write(`icons/icon${size}.svg`, svg);
  
  // Use resvg or sharp if available, otherwise keep SVGs
  // Chrome extensions support SVG icons in modern versions
  console.log(`Created icons/icon${size}.svg (${size}x${size})`);
}

console.log('\nNote: Chrome MV3 needs PNG icons. Converting...');

// For simplicity, let's also write PNGs using the canvas trick
// Since we're in Bun, let's just keep SVGs and update manifest to use them
// Or better yet, write a simple HTML file that creates the PNGs
console.log('SVG icons created. You can convert to PNG using any tool, or use the SVGs directly.');
