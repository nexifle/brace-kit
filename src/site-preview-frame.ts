import {
  isSitePreviewNavigateMessage,
  isSitePreviewRenderMessage,
  postSitePreviewNavigate,
} from './utils/sitePreviewProtocol.ts';
import { withSitePreviewNavInterceptor } from './utils/sitePreview.ts';

const previewEl = document.getElementById('preview') as HTMLIFrameElement | null;
if (!previewEl) throw new Error('site-preview-frame: #preview iframe not found');
const iframe = previewEl;

let currentPagePath = '/';

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source === iframe.contentWindow) {
    if (!isSitePreviewNavigateMessage(event.data)) return;
    postSitePreviewNavigate(window.parent, event.data.path);
    return;
  }
  if (event.source !== window.parent) return;
  if (!isSitePreviewRenderMessage(event.data)) return;
  if (typeof event.data.pagePath === 'string' && event.data.pagePath.length > 0) {
    currentPagePath = event.data.pagePath;
  }
  iframe.srcdoc = withSitePreviewNavInterceptor(event.data.html, currentPagePath);
});

window.parent.postMessage({ type: 'ready', fromSitePreview: true }, '*');
