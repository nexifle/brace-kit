import { useEffect, useRef, useState } from 'react';

/**
 * Observe the pixel size (width + height) of an element via ResizeObserver.
 * Returns a ref to attach and the current size (0,0 until first measure).
 * Used for adaptive layouts and scale-to-fit previews.
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const notify = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    notify();
    const observer = new ResizeObserver(notify);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}
