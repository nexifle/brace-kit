import { getSlideProject } from './utils/slideDB.ts';
import {
  composeSitePreviewDocument,
  parseSitePreviewSearch,
  sitePreviewPath,
} from './utils/sitePreview.ts';
import {
  isSitePreviewNavigateMessage,
  isSitePreviewReadyMessage,
  postSitePreviewRender,
} from './utils/sitePreviewProtocol.ts';

const POLL_MS = 1000;

const previewEl = document.getElementById('preview') as HTMLIFrameElement | null;
const emptyEl = document.getElementById('empty');
if (!previewEl) throw new Error('site-preview: #preview iframe not found');
const iframe = previewEl;

let lastHtml = '';
let frameReady = false;
let pendingHtml: string | null = null;

function sendHtml(html: string): void {
  const win = iframe.contentWindow;
  if (!frameReady || !win) {
    pendingHtml = html;
    return;
  }
  const parsed = parseSitePreviewSearch(location.search);
  postSitePreviewRender(win, html, parsed?.pagePath);
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== iframe.contentWindow) return;
  if (isSitePreviewReadyMessage(event.data)) {
    frameReady = true;
    if (pendingHtml !== null) {
      sendHtml(pendingHtml);
      pendingHtml = null;
    }
    return;
  }
  if (!isSitePreviewNavigateMessage(event.data)) return;
  const parsed = parseSitePreviewSearch(location.search);
  if (!parsed) return;
  const next = sitePreviewPath(parsed.projectId, event.data.path);
  const search = next.slice(next.indexOf('?'));
  if (search === location.search) return;
  history.replaceState(null, '', next);
  lastHtml = '';
  void refresh();
});

function showEmpty(message: string): void {
  lastHtml = '';
  document.body.classList.add('empty');
  if (emptyEl) {
    emptyEl.textContent = message;
    emptyEl.classList.add('visible');
  }
  sendHtml('');
}

function showDoc(html: string, title: string): void {
  document.body.classList.remove('empty');
  emptyEl?.classList.remove('visible');
  document.title = title;
  if (html === lastHtml) return;
  lastHtml = html;
  sendHtml(html);
}

async function refresh(): Promise<void> {
  if (document.hidden) return;
  const parsed = parseSitePreviewSearch(location.search);
  if (!parsed) {
    showEmpty('No preview');
    return;
  }
  const project = await getSlideProject(parsed.projectId);
  if (!project) {
    showEmpty('Project not found');
    return;
  }
  const doc = composeSitePreviewDocument(project.files, project.kind, parsed.pagePath);
  if (!doc) {
    showEmpty('Pages will appear here as they are written.');
    return;
  }
  showDoc(doc.html, doc.title);
}

void refresh();
setInterval(() => {
  void refresh();
}, POLL_MS);
document.addEventListener('visibilitychange', () => {
  void refresh();
});
