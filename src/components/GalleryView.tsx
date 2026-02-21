import { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '../store/index.ts';
import { getAllImages } from '../utils/imageDB.ts';
import type { StoredImageRecord } from '../types/index.ts';
import { CloseIcon } from './icons/CloseIcon.tsx';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface MarkdownImage {
  type: 'url';
  url: string;
  conversationId: string;
  createdAt: number;
}

type GalleryItem = StoredImageRecord | MarkdownImage;

function isMarkdownImage(item: GalleryItem): item is MarkdownImage {
  return (item as MarkdownImage).type === 'url';
}

function getItemId(item: GalleryItem): string {
  return isMarkdownImage(item) ? `md:${item.conversationId}::${item.url}` : `db:${item.key}`;
}

const FAVORITES_STORAGE_KEY = 'gallery_favorites';

const MD_IMAGE_REGEX = /!\[.*?\]\((https?:\/\/[^)\s]+)\)/g;

async function getMarkdownImages(conversations: { id: string; updatedAt: number }[]): Promise<MarkdownImage[]> {
  const results: MarkdownImage[] = [];
  const seen = new Set<string>();

  for (const conv of conversations) {
    try {
      const data = await chrome.storage.local.get(`conv_${conv.id}`);
      const messages: { role: string; content: string }[] = data[`conv_${conv.id}`] || [];

      for (const msg of messages) {
        if (!msg.content) continue;
        let match: RegExpExecArray | null;
        MD_IMAGE_REGEX.lastIndex = 0;
        while ((match = MD_IMAGE_REGEX.exec(msg.content)) !== null) {
          const url = match[1];
          const key = `${conv.id}::${url}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({ type: 'url', url, conversationId: conv.id, createdAt: conv.updatedAt });
          }
        }
      }
    } catch {
      // skip conversation jika gagal dimuat
    }
  }

  return results;
}

export function GalleryView() {
  const store = useStore();
  const [images, setImages] = useState<StoredImageRecord[]>([]);
  const [markdownImages, setMarkdownImages] = useState<MarkdownImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);

  // Load favorites from storage
  useEffect(() => {
    chrome.storage.local.get(FAVORITES_STORAGE_KEY).then((data) => {
      if (data[FAVORITES_STORAGE_KEY]) {
        setFavorites(new Set(data[FAVORITES_STORAGE_KEY]));
      }
    });
  }, []);

  // Restore scroll position after favorites change
  useEffect(() => {
    if (scrollContainerRef.current && scrollPositionRef.current > 0) {
      scrollContainerRef.current.scrollTop = scrollPositionRef.current;
      scrollPositionRef.current = 0;
    }
  }, [favorites]);

  // Save favorites to storage
  const saveFavorites = useCallback(async (newFavorites: Set<string>) => {
    await chrome.storage.local.set({ [FAVORITES_STORAGE_KEY]: Array.from(newFavorites) });
  }, []);

  const toggleFavorite = useCallback((item: GalleryItem) => {
    // Save current scroll position before state change
    if (scrollContainerRef.current) {
      scrollPositionRef.current = scrollContainerRef.current.scrollTop;
    }
    const id = getItemId(item);
    setFavorites((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      saveFavorites(newSet);
      return newSet;
    });
  }, [saveFavorites]);

  const isFavorite = useCallback((item: GalleryItem): boolean => {
    return favorites.has(getItemId(item));
  }, [favorites]);

  useEffect(() => {
    Promise.all([
      getAllImages(),
      getMarkdownImages(store.conversations),
    ]).then(([imgs, mdImgs]) => {
      setImages(imgs);
      setMarkdownImages(mdImgs);
      setLoading(false);
    });
  }, []);

  function getConvTitle(conversationId: string): string {
    const conv = store.conversations.find((c) => c.id === conversationId);
    return conv?.title || 'Conversation';
  }

  function handleDownload(item: GalleryItem) {
    if (isMarkdownImage(item)) {
      const link = document.createElement('a');
      link.href = item.url;
      link.download = item.url.split('/').pop() || 'image';
      link.target = '_blank';
      link.click();
      return;
    }
    const ext = item.mimeType.split('/')[1] || 'png';
    const link = document.createElement('a');
    link.href = `data:${item.mimeType};base64,${item.data}`;
    link.download = `generated-${item.key}.${ext}`;
    link.click();
  }

  async function handleCopy(item: GalleryItem) {
    if (isMarkdownImage(item)) {
      await navigator.clipboard.writeText(item.url);
      return;
    }
    try {
      const res = await fetch(`data:${item.mimeType};base64,${item.data}`);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [item.mimeType]: blob })]);
    } catch {
      await navigator.clipboard.writeText(`data:${item.mimeType};base64,${item.data}`);
    }
  }

  async function handleJumpToConversation(conversationId: string) {
    setLightbox(null);
    await store.switchConversation(conversationId);
    store.setView('chat');
  }

  const handleLightboxNav = useCallback((direction: 'prev' | 'next') => {
    if (!lightbox) return;
    // Sort items with favorites first
    const allItems: GalleryItem[] = [...images, ...markdownImages].sort((a, b) => {
      const aFav = favorites.has(getItemId(a)) ? 1 : 0;
      const bFav = favorites.has(getItemId(b)) ? 1 : 0;
      return bFav - aFav;
    });
    // Filter by tab
    const filteredItems = activeTab === 'favorites'
      ? allItems.filter((item) => favorites.has(getItemId(item)))
      : allItems;
    const currentIndex = filteredItems.findIndex((item) => {
      if (isMarkdownImage(item) && isMarkdownImage(lightbox)) {
        return item.url === lightbox.url && item.conversationId === lightbox.conversationId;
      }
      if (!isMarkdownImage(item) && !isMarkdownImage(lightbox)) {
        return item.key === lightbox.key;
      }
      return false;
    });
    if (direction === 'prev' && currentIndex > 0) {
      setLightbox(filteredItems[currentIndex - 1]);
    } else if (direction === 'next' && currentIndex < filteredItems.length - 1) {
      setLightbox(filteredItems[currentIndex + 1]);
    }
  }, [lightbox, images, markdownImages, favorites, activeTab]);

  useEffect(() => {
    if (!lightbox) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handleLightboxNav('prev');
      } else if (e.key === 'ArrowRight') {
        handleLightboxNav('next');
      } else if (e.key === 'Escape') {
        setLightbox(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightbox, handleLightboxNav]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] shrink-0">
        <button
          className="flex items-center gap-1.5 bg-transparent border-none text-[var(--text-secondary)] cursor-pointer text-[0.8125rem] px-2 py-1 transition-colors duration-150 hover:text-[var(--text-primary)]"
          onClick={() => store.setView('chat')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Kembali
        </button>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">Gallery</span>
          {!loading && (
            <span className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-active)] px-2 py-0.5">
              {images.length + markdownImages.length} gambar
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] shrink-0">
        <button
          className={`px-3 py-1.5 text-[0.8125rem] font-medium transition-colors duration-150 ${
            activeTab === 'all'
              ? 'text-[var(--text-primary)] bg-[var(--bg-active)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
          onClick={() => setActiveTab('all')}
        >
          Semua
        </button>
        <button
          className={`px-3 py-1.5 text-[0.8125rem] font-medium transition-colors duration-150 flex items-center gap-1.5 ${
            activeTab === 'favorites'
              ? 'text-[var(--text-primary)] bg-[var(--bg-active)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
          onClick={() => setActiveTab('favorites')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={activeTab === 'favorites' ? "#fbbf24" : "none"} stroke={activeTab === 'favorites' ? "#fbbf24" : "currentColor"} strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          Favorit
          {!loading && favorites.size > 0 && (
            <span className={`text-[0.6875rem] px-1.5 py-0.5 ${activeTab === 'favorites' ? 'bg-amber-500/20 text-amber-400' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'}`}>
              {favorites.size}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-[var(--bg-active)] scrollbar-track-transparent">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-[var(--text-tertiary)]">
            <div className="opacity-40">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <p className="text-[0.9375rem] text-[var(--text-secondary)] font-medium">Memuat gambar...</p>
          </div>
        ) : images.length === 0 && markdownImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-[var(--text-tertiary)]">
            <div className="opacity-40">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <p className="text-[0.9375rem] text-[var(--text-secondary)] font-medium">Belum ada gambar yang dihasilkan</p>
            <span className="text-[0.8125rem] text-[var(--text-tertiary)] max-w-[240px]">
              Mulai conversation dan generate gambar untuk melihatnya di sini
            </span>
          </div>
        ) : (() => {
          // Combine and sort items - favorites first
          const allItems: GalleryItem[] = [...images, ...markdownImages];
          const sortedItems = [...allItems].sort((a, b) => {
            const aFav = isFavorite(a) ? 1 : 0;
            const bFav = isFavorite(b) ? 1 : 0;
            return bFav - aFav;
          });
          // Filter by tab
          const filteredItems = activeTab === 'favorites'
            ? sortedItems.filter((item) => isFavorite(item))
            : sortedItems;

          if (filteredItems.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-[var(--text-tertiary)]">
                <div className="opacity-40">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
                <p className="text-[0.9375rem] text-[var(--text-secondary)] font-medium">Belum ada gambar favorit</p>
                <span className="text-[0.8125rem] text-[var(--text-tertiary)] max-w-[240px]">
                  Klik ikon bintang pada gambar untuk menambahkan ke favorit
                </span>
              </div>
            );
          }

          return (
          <div className="grid grid-cols-3 gap-2.5">
            {filteredItems.map((item) => {
              const isMd = isMarkdownImage(item);
              const itemKey = isMd ? `md:${(item as MarkdownImage).conversationId}::${(item as MarkdownImage).url}` : (item as StoredImageRecord).key;
              const imgSrc = isMd ? (item as MarkdownImage).url : `data:${(item as StoredImageRecord).mimeType};base64,${(item as StoredImageRecord).data}`;
              const fav = isFavorite(item);

              return (
              <div
                key={itemKey}
                className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] overflow-hidden cursor-pointer transition-all duration-150 hover:border-[var(--border-active)]"
                onClick={() => setLightbox(item)}
              >
                <div className="relative aspect-square overflow-hidden bg-[var(--bg-tertiary)]">
                  <img
                    src={imgSrc}
                    alt="Generated image"
                    className="w-full h-full object-cover block"
                    crossOrigin={isMd ? "anonymous" : undefined}
                  />
                  {/* Favorite indicator */}
                  {fav && (
                    <div className="absolute top-1.5 left-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </div>
                  )}
                  <div
                    className="absolute inset-0 bg-black/60 flex items-center justify-center gap-1.5 opacity-0 transition-opacity duration-150 hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="flex items-center justify-center w-7 h-7 bg-white/12 border border-white/15 text-[var(--text-primary)] cursor-pointer transition-colors duration-150 hover:bg-white/[0.22]"
                      title="Lihat"
                      onClick={() => setLightbox(item)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button
                      className={`flex items-center justify-center w-7 h-7 ${fav ? 'bg-amber-500/30 border-amber-400/50' : 'bg-white/12 border-white/15'} text-[var(--text-primary)] cursor-pointer transition-colors duration-150 hover:bg-white/[0.22]`}
                      title={fav ? "Hapus Favorit" : "Favorit"}
                      onClick={() => toggleFavorite(item)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={fav ? "#fbbf24" : "none"} stroke={fav ? "#fbbf24" : "currentColor"} strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                    <button
                      className="flex items-center justify-center w-7 h-7 bg-white/12 border border-white/15 text-[var(--text-primary)] cursor-pointer transition-colors duration-150 hover:bg-white/[0.22]"
                      title="Download"
                      onClick={() => handleDownload(item)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    <button
                      className="flex items-center justify-center w-7 h-7 bg-white/12 border border-white/15 text-[var(--text-primary)] cursor-pointer transition-colors duration-150 hover:bg-white/[0.22]"
                      title="Salin"
                      onClick={() => handleCopy(item)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="px-2 py-1.5 flex flex-col gap-0.5">
                  <span className="text-[0.6875rem] text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis font-medium">
                    {getConvTitle(item.conversationId)}
                  </span>
                  <span className="text-[0.625rem] text-[var(--text-tertiary)]">{formatDate(item.createdAt)}</span>
                </div>
              </div>
            );})}
          </div>
          );
        })()}
      </div>

      {/* Lightbox */}
      {lightbox && (() => {
        // Sort items with favorites first
        const allItems: GalleryItem[] = [...images, ...markdownImages].sort((a, b) => {
          const aFav = favorites.has(getItemId(a)) ? 1 : 0;
          const bFav = favorites.has(getItemId(b)) ? 1 : 0;
          return bFav - aFav;
        });
        // Filter by tab
        const filteredItems = activeTab === 'favorites'
          ? allItems.filter((item) => favorites.has(getItemId(item)))
          : allItems;
        const currentIndex = filteredItems.findIndex((item) => {
          if (isMarkdownImage(item) && isMarkdownImage(lightbox)) {
            return item.url === lightbox.url && item.conversationId === lightbox.conversationId;
          }
          if (!isMarkdownImage(item) && !isMarkdownImage(lightbox)) {
            return item.key === lightbox.key;
          }
          return false;
        });
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < filteredItems.length - 1;

        const handlePrev = () => {
          if (hasPrev) setLightbox(filteredItems[currentIndex - 1]);
        };

        const handleNext = () => {
          if (hasNext) setLightbox(filteredItems[currentIndex + 1]);
        };

        return (
          <div
            className="fixed inset-0 bg-black/85 z-[1000] flex items-center justify-center backdrop-blur-sm"
            onClick={() => setLightbox(null)}
          >
            {/* Prev Button */}
            <button
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/60 border border-white/20 text-white/80 cursor-pointer z-[10] transition-all duration-150 hover:text-white hover:bg-black/80 ${!hasPrev ? 'opacity-30 pointer-events-none' : ''}`}
              onClick={(e) => { e.stopPropagation(); handlePrev(); }}
              disabled={!hasPrev}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            {/* Next Button */}
            <button
              className={`absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-black/60 border border-white/20 text-white/80 cursor-pointer z-[10] transition-all duration-150 hover:text-white hover:bg-black/80 ${!hasNext ? 'opacity-30 pointer-events-none' : ''}`}
              onClick={(e) => { e.stopPropagation(); handleNext(); }}
              disabled={!hasNext}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            <div
              className="relative bg-[var(--bg-secondary)] border border-[var(--border-subtle)] max-w-[calc(100vw-80px)] max-h-[calc(100vh-48px)] flex flex-col overflow-hidden mx-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-black/50 border border-[var(--border-subtle)] text-[var(--text-secondary)] cursor-pointer z-[1] transition-colors duration-150 hover:text-[var(--text-primary)]"
                onClick={() => setLightbox(null)}
              >
                <CloseIcon size={18} />
              </button>
              <img
                src={isMarkdownImage(lightbox) ? lightbox.url : `data:${lightbox.mimeType};base64,${lightbox.data}`}
                alt="Generated image"
                className="max-w-full max-h-[calc(100vh-160px)] object-contain block"
              />
              <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center gap-3 flex-wrap">
                <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                  <span className="text-[0.8125rem] font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">
                    {getConvTitle(lightbox.conversationId)}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">{formatDate(lightbox.createdAt)}</span>
                </div>
                <div className="flex gap-1.5 shrink-0 items-center">
                  <span className="text-xs text-[var(--text-tertiary)] mr-2">
                    {currentIndex + 1} / {filteredItems.length}
                  </span>
                  <button
                    className={`flex items-center gap-1.25 px-2.5 py-1.25 ${isFavorite(lightbox) ? 'bg-amber-500/20 border-amber-400/40 text-amber-400' : 'bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]'} text-xs cursor-pointer transition-all duration-150 hover:border-[var(--border-active)]`}
                    onClick={() => toggleFavorite(lightbox)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={isFavorite(lightbox) ? "#fbbf24" : "none"} stroke={isFavorite(lightbox) ? "#fbbf24" : "currentColor"} strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    {isFavorite(lightbox) ? 'Favorit' : 'Favoritkan'}
                  </button>
                  <button
                    className="flex items-center gap-1.25 px-2.5 py-1.25 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs cursor-pointer transition-all duration-150 hover:text-[var(--text-primary)] hover:border-[var(--border-active)]"
                    onClick={() => handleDownload(lightbox)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download
                  </button>
                  <button
                    className="flex items-center gap-1.25 px-2.5 py-1.25 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs cursor-pointer transition-all duration-150 hover:text-[var(--text-primary)] hover:border-[var(--border-active)]"
                    onClick={() => handleCopy(lightbox)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Salin
                  </button>
                  <button
                    className="flex items-center gap-1.25 px-2.5 py-1.25 bg-[rgba(129,140,248,0.1)] border border-[rgba(129,140,248,0.3)] text-[var(--accent-primary)] text-xs cursor-pointer transition-all duration-150 hover:bg-[rgba(129,140,248,0.2)] hover:border-[var(--accent-primary)]"
                    onClick={() => handleJumpToConversation(lightbox.conversationId)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    Buka Conversation
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
