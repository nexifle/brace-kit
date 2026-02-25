import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MermaidDiagram } from '../components/message/display/MermaidDiagram';

/**
 * Hook to hydrate mermaid placeholders with interactive React components.
 *
 * This hook finds all mermaid placeholders in the container and replaces them
 * with rendered MermaidDiagram components that support zoom/pan.
 *
 * Pattern: Since renderMarkdown returns HTML string (not React elements),
 * we use placeholders in the HTML and hydrate them after render.
 */
export function useMermaidHydration(containerRef: React.RefObject<HTMLElement | null>) {
  const rootsRef = useRef<Map<HTMLElement, Root>>(new Map());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find all mermaid placeholders
    const placeholders = container.querySelectorAll('[data-mermaid-placeholder]');

    placeholders.forEach((placeholder) => {
      const el = placeholder as HTMLElement;
      const code = el.dataset.mermaidCode;
      const diagramId = el.dataset.mermaidId;

      if (!code || !diagramId) return;

      // Check if we already have a root for this element
      let root = rootsRef.current.get(el);
      if (!root) {
        root = createRoot(el);
        rootsRef.current.set(el, root);
      }

      // Render the MermaidDiagram component
      root.render(<MermaidDiagram code={code} diagramId={diagramId} />);
    });

    // Cleanup function
    return () => {
      rootsRef.current.forEach((root, el) => {
        // Only unmount if the element is no longer in the DOM
        if (!container.contains(el)) {
          root.unmount();
          rootsRef.current.delete(el);
        }
      });
    };
  });
}

/**
 * Standalone function to hydrate mermaid placeholders.
 * Useful when you need to hydrate outside of a React component lifecycle.
 */
export function hydrateMermaidDiagrams(container: HTMLElement) {
  const placeholders = container.querySelectorAll('[data-mermaid-placeholder]');

  placeholders.forEach((placeholder) => {
    const el = placeholder as HTMLElement;
    const code = el.dataset.mermaidCode;
    const diagramId = el.dataset.mermaidId;

    if (!code || !diagramId) return;

    const root = createRoot(el);
    root.render(<MermaidDiagram code={code} diagramId={diagramId} />);
  });
}
