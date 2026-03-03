import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useStore } from '../store/index.ts';
import { getAllImages } from '../utils/imageDB.ts';
import type { StoredImageRecord } from '../types/index.ts';
import {
  XIcon,
  ChevronLeftIcon,
  DownloadIcon,
  CopyIcon,
  StarIcon,
  ImageIcon,
  MessageSquareIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  SparklesIcon
} from 'lucide-react';
import { Btn } from './ui/Btn.tsx';

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

async function getMarkdownImages(conversations: { id: string; updatedAt: number; markdownImages?: string[] }[]): Promise<MarkdownImage[]> {
  const results: MarkdownImage[] = [];
  const seen = new Set<string>();

  for (const conv of conversations) {
    if (conv.markdownImages && conv.markdownImages.length > 0) {
      for (const url of conv.markdownImages) {
        const key = `${conv.id}::${url}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ type: 'url', url, conversationId: conv.id, createdAt: conv.updatedAt });
        }
      }
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

  // Load favorites
  useEffect(() => {
    chrome.storage.local.get(FAVORITES_STORAGE_KEY).then((data) => {
      const favorites = data[FAVORITES_STORAGE_KEY];
      if (favorites && Array.isArray(favorites)) {
        setFavorites(new Set(favorites));
      }
    });
  }, []);

  // Sync scroll
  useEffect(() => {
    if (scrollContainerRef.current && scrollPositionRef.current > 0) {
      scrollContainerRef.current.scrollTop = scrollPositionRef.current;
      scrollPositionRef.current = 0;
    }
  }, [favorites]);

  const saveFavorites = useCallback(async (newFavorites: Set<string>) => {
    await chrome.storage.local.set({ [FAVORITES_STORAGE_KEY]: Array.from(newFavorites) });
  }, []);

  const toggleFavorite = useCallback((item: GalleryItem) => {
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

  const allItems = useMemo(
    () => [...images, ...markdownImages],
    [images, markdownImages]
  );

  const sortedFilteredItems = useMemo(() => {
    const sorted = [...allItems].sort((a, b) => {
      const aFav = favorites.has(getItemId(a)) ? 1 : 0;
      const bFav = favorites.has(getItemId(b)) ? 1 : 0;
      return bFav - aFav || (b.createdAt - a.createdAt);
    });
    return activeTab === 'favorites'
      ? sorted.filter((item) => favorites.has(getItemId(item)))
      : sorted;
  }, [allItems, favorites, activeTab]);

  const activeFavoriteCount = useMemo(
    () => allItems.filter((item) => favorites.has(getItemId(item))).length,
    [allItems, favorites]
  );

  useEffect(() => {
    Promise.all([
      getAllImages(),
      getMarkdownImages(store.conversations),
    ]).then(([imgs, mdImgs]) => {
      setImages(imgs);
      setMarkdownImages(mdImgs);
      setLoading(false);

      // Bersihkan stale favorites — hapus ID yang sudah tidak ada di gallery
      const validIds = new Set([
        ...imgs.map((img) => getItemId(img)),
        ...mdImgs.map((md) => getItemId(md)),
      ]);
      setFavorites((prev) => {
        const cleaned = new Set([...prev].filter((id) => validIds.has(id)));
        if (cleaned.size !== prev.size) {
          saveFavorites(cleaned);
          return cleaned;
        }
        return prev;
      });
    });
  }, [store.conversations, saveFavorites]);

  const getConvTitle = useCallback((conversationId: string): string => {
    const conv = store.conversations.find((c) => c.id === conversationId);
    return conv?.title || 'Untitled Chat';
  }, [store.conversations]);

  const handleDownload = (item: GalleryItem) => {
    const link = document.createElement('a');
    if (isMarkdownImage(item)) {
      link.href = item.url;
      link.download = item.url.split('/').pop() || 'image';
      link.target = '_blank';
    } else {
      const ext = item.mimeType.split('/')[1] || 'png';
      link.href = `data:${item.mimeType};base64,${item.data}`;
      link.download = `generated-${item.key}.${ext}`;
    }
    link.click();
  };

  const handleCopy = async (item: GalleryItem) => {
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
  };

  const handleJumpToConversation = async (conversationId: string) => {
    setLightbox(null);
    await store.switchConversation(conversationId);
    store.setView('chat');
  };

  const handleLightboxNav = useCallback((direction: 'prev' | 'next') => {
    if (!lightbox) return;
    const currentIndex = sortedFilteredItems.findIndex(item => getItemId(item) === getItemId(lightbox));

    if (direction === 'prev' && currentIndex > 0) {
      setLightbox(sortedFilteredItems[currentIndex - 1]);
    } else if (direction === 'next' && currentIndex < sortedFilteredItems.length - 1) {
      setLightbox(sortedFilteredItems[currentIndex + 1]);
    }
  }, [lightbox, sortedFilteredItems]);

  useEffect(() => {
    if (!lightbox) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handleLightboxNav('prev');
      else if (e.key === 'ArrowRight') handleLightboxNav('next');
      else if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightbox, handleLightboxNav]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border/50 bg-card/50 backdrop-blur-md shrink-0">
        <Btn
          variant="ghost"
          size="sm"
          className="h-8 gap-2 text-muted-foreground hover:text-foreground pl-1 pr-2.5"
          onClick={() => store.setView('chat')}
        >
          <ArrowLeftIcon size={14} />
          <span className="text-xs">Back</span>
        </Btn>
        <div className="flex items-center gap-3 flex-1">
          <span className="text-base font-bold text-foreground">Gallery</span>
          {!loading && (
            <div className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-2xs font-black uppercase tracking-widest text-primary">
              {images.length + markdownImages.length} items
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-background/80 backdrop-blur-sm shrink-0">
        <button
          className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 ${activeTab === 'all'
            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`}
          onClick={() => setActiveTab('all')}
        >
          All Images
        </button>
        <button
          className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${activeTab === 'favorites'
            ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 scale-105'
            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            }`}
          onClick={() => setActiveTab('favorites')}
        >
          <StarIcon size={12} fill={activeTab === 'favorites' ? "currentColor" : "none"} />
          Favorites
          {!loading && activeFavoriteCount > 0 && (
            <span className={`flex items-center justify-center min-w-4 h-4 rounded-full px-1 text-2xs font-black ${activeTab === 'favorites' ? 'bg-white/20 text-white' : 'bg-muted/80 text-muted-foreground'}`}>
              {activeFavoriteCount}
            </span>
          )}
        </button>
      </div>

      {/* Grid Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-5 scrollbar-thin animate-in fade-in duration-500">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-32 animate-in fade-in duration-700">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
              <div className="relative w-16 h-16 rounded-lg bg-card/50 backdrop-blur-md border border-primary/20 flex items-center justify-center shadow-2xl">
                <SparklesIcon size={28} className="text-primary animate-spin duration-3000" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xs font-black uppercase tracking-[0.3em] text-primary animate-pulse">Syncing Library</span>
              <span className="text-2xs text-muted-foreground/50 font-medium">Fetching captured assets...</span>
            </div>
          </div>
        ) : images.length === 0 && markdownImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center text-muted-foreground gap-5">
            <div className="w-20 h-20 bg-muted/20 rounded-lg flex items-center justify-center">
              <ImageIcon size={32} className="opacity-20 translate-y-1" />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-bold text-foreground">Capture the void</p>
              <span className="text-xs max-w-[200px] leading-relaxed opacity-60">
                Generated images and captured screenshots will drift through this space.
              </span>
            </div>
          </div>
        ) : (() => {
          if (sortedFilteredItems.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center py-32 text-center text-muted-foreground gap-5 animate-in slide-in-from-bottom-4 duration-500">
                <div className="w-16 h-16 bg-muted/20 rounded-lg flex items-center justify-center">
                  <StarIcon size={24} className="opacity-20" />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-60">No favorites yet</p>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {sortedFilteredItems.map((item) => {
                const isMd = isMarkdownImage(item);
                const itemKey = getItemId(item);
                const imgSrc = isMd ? item.url : `data:${item.mimeType};base64,${item.data}`;
                const fav = isFavorite(item);

                return (
                  <div
                    key={itemKey}
                    className="group relative bg-card border border-border/50 rounded-lg overflow-hidden cursor-pointer transition-all duration-500 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1"
                    onClick={() => setLightbox(item)}
                  >
                    <div className="relative aspect-square overflow-hidden bg-muted/20">
                      <img
                        src={imgSrc}
                        alt="Gallery Asset"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        crossOrigin={isMd ? "anonymous" : undefined}
                      />

                      {/* Favorite/Action Overlays */}
                      <div className="absolute top-2 left-2 z-10 transition-transform duration-300 group-hover:scale-110">
                        {fav && (
                          <div className="p-1.5 bg-amber-500 rounded-lg shadow-lg shadow-amber-500/30">
                            <StarIcon size={12} fill="white" className="text-white" />
                          </div>
                        )}
                      </div>

                      <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-end p-3 gap-1.5">
                        <div className="flex-1 min-w-0 mb-0.5">
                          <div className="text-2xs text-white/60 font-medium truncate leading-tight">
                            {getConvTitle(item.conversationId)}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            className="w-7 h-7 bg-white/10 backdrop-blur-md rounded-md flex items-center justify-center text-white hover:bg-primary transition-colors"
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(item); }}
                          >
                            <StarIcon size={12} fill={fav ? "currentColor" : "none"} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Lightbox / Cinema Mode */}
      {lightbox && (() => {
        const currentIndex = sortedFilteredItems.findIndex(item => getItemId(item) === getItemId(lightbox));
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < sortedFilteredItems.length - 1;

        return (
          <div
            className="fixed inset-0 bg-background/95 backdrop-blur-2xl z-[1000] flex items-center justify-center animate-in fade-in duration-300"
            onClick={() => setLightbox(null)}
          >
            {/* Controls Overlay */}
            <div className="absolute inset-x-0 top-0 p-5 flex items-center justify-between z-10 bg-linear-to-b from-background to-transparent pointer-events-none">
              <div className="flex flex-col gap-0.5 pointer-events-auto">
                <span className="text-2xs font-black uppercase tracking-widest text-primary leading-none">
                  Captured Content
                </span>
                <span className="text-sm font-bold text-foreground">
                  {getConvTitle(lightbox.conversationId)}
                </span>
              </div>
              <Btn
                variant="ghost"
                size="icon"
                onClick={() => setLightbox(null)}
                className="rounded-full bg-background/40 backdrop-blur-md border border-border/50 hover:bg-destructive/10 hover:text-destructive pointer-events-auto"
              >
                <XIcon size={20} />
              </Btn>
            </div>

            <div className="absolute inset-x-0 bottom-10 px-5 flex items-center justify-center gap-4 z-10 pointer-events-none">
              <div className="flex items-center gap-1.5 p-1.5 bg-background/40 backdrop-blur-xl border border-white/5 rounded-lg pointer-events-auto shadow-2xl">
                <Btn
                  variant="ghost"
                  size="sm"
                  className={`gap-2 ${isFavorite(lightbox) ? 'text-amber-500' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(lightbox); }}
                >
                  <StarIcon size={14} fill={isFavorite(lightbox) ? "currentColor" : "none"} />
                  Favorite
                </Btn>
                <div className="w-px h-4 bg-border/20 mx-1" />
                <Btn variant="ghost" size="sm" className="gap-2" onClick={(e) => { e.stopPropagation(); handleCopy(lightbox); }}>
                  <CopyIcon size={14} />
                  Copy
                </Btn>
                <Btn variant="ghost" size="sm" className="gap-2" onClick={(e) => { e.stopPropagation(); handleDownload(lightbox); }}>
                  <DownloadIcon size={14} />
                  Save
                </Btn>
                <div className="w-px h-4 bg-border/20 mx-1" />
                <Btn
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-primary"
                  onClick={(e) => { e.stopPropagation(); handleJumpToConversation(lightbox.conversationId); }}
                >
                  <MessageSquareIcon size={14} />
                  Go to Chat
                </Btn>
              </div>
            </div>

            {/* Navigation */}
            <div className="absolute inset-y-0 left-4 flex items-center z-20 pointer-events-none">
              <button
                className={`w-12 h-12 rounded-full border border-white/10 bg-background/20 backdrop-blur-md text-white flex items-center justify-center transition-all duration-300 pointer-events-auto
                   ${hasPrev ? 'hover:bg-primary hover:scale-110 opacity-100 shadow-xl' : 'opacity-20 translate-x-10 grayscale pointer-events-none'}`}
                onClick={(e) => { e.stopPropagation(); handleLightboxNav('prev'); }}
              >
                <ChevronLeftIcon size={24} />
              </button>
            </div>
            <div className="absolute inset-y-0 right-4 flex items-center z-20 pointer-events-none">
              <button
                className={`w-12 h-12 rounded-full border border-white/10 bg-background/20 backdrop-blur-md text-white flex items-center justify-center transition-all duration-300 pointer-events-auto
                   ${hasNext ? 'hover:bg-primary hover:scale-110 opacity-100 shadow-xl' : 'opacity-20 -translate-x-10 grayscale pointer-events-none'}`}
                onClick={(e) => { e.stopPropagation(); handleLightboxNav('next'); }}
              >
                <ChevronRightIcon size={24} />
              </button>
            </div>

            {/* Image Container */}
            <div
              className="max-w-[90vw] max-h-[75vh] relative animate-in zoom-in-95 duration-500"
              onClick={e => e.stopPropagation()}
            >
              <img
                src={isMarkdownImage(lightbox) ? lightbox.url : `data:${lightbox.mimeType};base64,${lightbox.data}`}
                alt="Cinema View"
                className="w-full h-full object-contain rounded-lg shadow-[0_0_100px_rgba(var(--primary-rgb),0.1)] grayscale-0 transition-all duration-700"
              />
              <div className="absolute -bottom-8 inset-x-0 text-center pointer-events-none">
                <span className="text-2xs font-black uppercase tracking-[0.3em] text-muted-foreground/40">
                  Item {currentIndex + 1} of {sortedFilteredItems.length}
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
