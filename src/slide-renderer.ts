// Slide renderer sandbox entrypoint.
// US-009 fills in the ready/render/capture/ping postMessage protocol.

const stage = document.getElementById('stage') as HTMLDivElement | null;
if (!stage) {
  throw new Error('slide-renderer: #stage element not found');
}

export default stage;
