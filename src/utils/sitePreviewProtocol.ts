export const SITE_PREVIEW_FRAME_PAGE = 'site-preview-frame.html';
export const SITE_PREVIEW_FROM_FLAG = 'fromSitePreview' as const;

export type SitePreviewParentToFrame = {
  type: 'render';
  html: string;
  pagePath?: string;
};

export type SitePreviewReadyMessage = {
  type: 'ready';
  fromSitePreview: true;
};

export type SitePreviewNavigateMessage = {
  type: 'navigate';
  path: string;
  fromSitePreview: true;
};

export type SitePreviewFrameToParent =
  | SitePreviewReadyMessage
  | SitePreviewNavigateMessage;

export function isSitePreviewRenderMessage(
  data: unknown,
): data is SitePreviewParentToFrame {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Partial<SitePreviewParentToFrame>;
  return msg.type === 'render' && typeof msg.html === 'string';
}

export function isSitePreviewReadyMessage(
  data: unknown,
): data is SitePreviewReadyMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Partial<SitePreviewReadyMessage>;
  return msg.type === 'ready' && msg.fromSitePreview === true;
}

export function isSitePreviewNavigateMessage(
  data: unknown,
): data is SitePreviewNavigateMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Partial<SitePreviewNavigateMessage>;
  return (
    msg.type === 'navigate' &&
    msg.fromSitePreview === true &&
    typeof msg.path === 'string' &&
    msg.path.length > 0
  );
}

export function postSitePreviewRender(
  target: Window,
  html: string,
  pagePath?: string,
): void {
  const msg: SitePreviewParentToFrame = pagePath
    ? { type: 'render', html, pagePath }
    : { type: 'render', html };
  target.postMessage(msg, '*');
}

export function postSitePreviewNavigate(target: Window, path: string): void {
  const msg: SitePreviewNavigateMessage = {
    type: 'navigate',
    path,
    fromSitePreview: true,
  };
  target.postMessage(msg, '*');
}
