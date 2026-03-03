import { useEffect, useRef, useState, useCallback } from 'react';
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch';
import mermaid from 'mermaid';
import {
  ZoomInIcon,
  ZoomOutIcon,
  RotateCcwIcon,
  MaximizeIcon,
  DownloadIcon,
  XIcon,
} from 'lucide-react';
import { Btn } from '../../ui/Btn';

interface MermaidDiagramProps {
  code: string;
  diagramId: string;
  isStreaming?: boolean;
}

type Theme = 'dark' | 'light';

// Controls component for zoom/pan
function MermaidControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();

  return (
    <div className="flex items-center gap-1">
      <Btn
        variant="outline"
        size="icon-sm"
        onClick={() => zoomIn(0.2)}
        title="Zoom in"
        className="bg-background/90 backdrop-blur-md shadow-lg"
      >
        <ZoomInIcon size={16} />
      </Btn>
      <Btn
        variant="outline"
        size="icon-sm"
        onClick={() => zoomOut(0.2)}
        title="Zoom out"
        className="bg-background/90 backdrop-blur-md shadow-lg"
      >
        <ZoomOutIcon size={16} />
      </Btn>
      <Btn
        variant="outline"
        size="icon-sm"
        onClick={() => resetTransform()}
        title="Reset view"
        className="bg-background/90 backdrop-blur-md shadow-lg"
      >
        <RotateCcwIcon size={16} />
      </Btn>
    </div>
  );
}

export function MermaidDiagram({ code, diagramId, isStreaming }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>('dark');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Detect parent theme from CSS class
  useEffect(() => {
    const detectTheme = () => {
      const isDark =
        document.documentElement.classList.contains('dark') ||
        containerRef.current?.closest('.dark') !== null;
      setTheme(isDark ? 'dark' : 'light');
    };

    detectTheme();

    // Watch for theme changes
    const observer = new MutationObserver(detectTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Re-render diagram when theme changes or streaming completes
  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async () => {
      // Skip rendering during streaming - wait for complete diagram code
      if (isStreaming) {
        setIsLoading(true);
        return;
      }

      try {
        setIsLoading(true);
        setError('');

        // Initialize mermaid with unique ID for this diagram
        const uniqueId = `mermaid-${diagramId}-${Date.now()}`;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'strict',
          fontFamily: 'inherit',
          themeVariables: {
            // Primary colors
            primaryColor: theme === 'dark' ? '#334155' : '#e2e8f0',
            primaryTextColor: theme === 'dark' ? '#f1f5f9' : '#1e293b',
            primaryBorderColor: theme === 'dark' ? '#64748b' : '#94a3b8',

            // Secondary colors
            secondaryColor: theme === 'dark' ? '#1e293b' : '#f1f5f9',
            secondaryTextColor: theme === 'dark' ? '#f1f5f9' : '#1e293b',
            secondaryBorderColor: theme === 'dark' ? '#64748b' : '#94a3b8',

            // Tertiary colors
            tertiaryColor: theme === 'dark' ? '#0f172a' : '#ffffff',
            tertiaryTextColor: theme === 'dark' ? '#f1f5f9' : '#1e293b',

            // Background
            background: theme === 'dark' ? '#1a1a2e' : '#ffffff',
            mainBkg: theme === 'dark' ? '#334155' : '#e2e8f0',
            secondBkg: theme === 'dark' ? '#1e293b' : '#f1f5f9',

            // Lines and edges
            lineColor: theme === 'dark' ? '#94a3b8' : '#475569',
            edgeLabelBackground: theme === 'dark' ? '#1a1a2e' : '#ffffff',

            // Node specific
            nodeBkg: theme === 'dark' ? '#334155' : '#e2e8f0',
            nodeTextColor: theme === 'dark' ? '#f1f5f9' : '#1e293b',
            nodeBorder: theme === 'dark' ? '#64748b' : '#94a3b8',

            // Clusters
            clusterBkg: theme === 'dark' ? '#1e293b' : '#f1f5f9',
            clusterBorder: theme === 'dark' ? '#64748b' : '#94a3b8',

            // Titles and labels
            titleColor: theme === 'dark' ? '#f1f5f9' : '#1e293b',
            sectionTextColor: theme === 'dark' ? '#f1f5f9' : '#1e293b',
            taskTextColor: theme === 'dark' ? '#f1f5f9' : '#1e293b',
            taskTextOutsideColor: theme === 'dark' ? '#f1f5f9' : '#1e293b',
            taskTextLightColor: theme === 'dark' ? '#1e293b' : '#f1f5f9',
            taskTextDarkColor: theme === 'dark' ? '#f1f5f9' : '#1e293b',

            // Text colors for different elements
            textColor: theme === 'dark' ? '#f1f5f9' : '#1e293b',
            labelTextColor: theme === 'dark' ? '#f1f5f9' : '#1e293b',

            // Special node types
            fillType0: theme === 'dark' ? '#334155' : '#e2e8f0',
            fillType1: theme === 'dark' ? '#1e293b' : '#f1f5f9',
            fillType2: theme === 'dark' ? '#0f172a' : '#ffffff',

            // C4Context specific
            personBorder: theme === 'dark' ? '#64748b' : '#94a3b8',
            personBkg: theme === 'dark' ? '#334155' : '#e2e8f0',

            // Pie chart
            pieOuterStrokeWidth: '1px',
          },
        });

        // Validate and render
        const valid = await mermaid.parse(code);
        if (!valid) {
          throw new Error('Invalid mermaid syntax');
        }

        const { svg } = await mermaid.render(uniqueId, code);

        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [code, diagramId, theme, isStreaming]);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isFullscreen]);

  const handleDownload = useCallback(() => {
    if (!svgContent) return;

    try {
      // Parse the SVG and clean it up for valid XML
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');

      // Check for parsing errors
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        console.error('SVG parse error:', parserError.textContent);
        // Fallback: try to fix common issues manually
        let cleanedSvg = svgContent
          // Fix self-closing tags
          .replace(/<br>/g, '<br/>')
          .replace(/<hr>/g, '<hr/>')
          .replace(/<img([^>]*)>/g, '<img$1/>')
          // Fix HTML entities by converting to numeric entities
          .replace(/&nbsp;/g, '&#160;')
          .replace(/&copy;/g, '&#169;')
          .replace(/&reg;/g, '&#174;')
          .replace(/&trade;/g, '&#8482;')
          .replace(/&hellip;/g, '&#8230;')
          .replace(/&mdash;/g, '&#8212;')
          .replace(/&ndash;/g, '&#8211;')
          .replace(/&[a-zA-Z]+;/g, (match) => {
            // Create a temporary element to decode entity
            const span = document.createElement('span');
            span.textContent = match;
            const decoded = span.textContent || match;
            if (decoded !== match && decoded.length === 1) {
              return `&#${decoded.charCodeAt(0)};`;
            }
            return match;
          });

        // Ensure XML declaration and namespace
        if (!cleanedSvg.includes('xmlns=')) {
          cleanedSvg = cleanedSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        const blob = new Blob([cleanedSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `diagram-${diagramId}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      // Get the SVG element
      const svgElement = doc.querySelector('svg');
      if (!svgElement) {
        throw new Error('No SVG element found');
      }

      // Ensure proper namespace
      if (!svgElement.hasAttribute('xmlns')) {
        svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }

      // Add XML declaration
      const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
      const serializer = new XMLSerializer();
      const serialized = serializer.serializeToString(svgElement);
      const finalSvg = xmlDeclaration + serialized;

      // Create blob and download
      const blob = new Blob([finalSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `diagram-${diagramId}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download SVG:', err);
      // Final fallback: download as-is
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `diagram-${diagramId}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }, [svgContent, diagramId]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Error state
  if (error) {
    return (
      <div className="my-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
        <div className="text-sm text-destructive font-medium mb-2">Failed to render diagram</div>
        <pre className="text-xs text-destructive/80 overflow-x-auto">{error}</pre>
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">Show source code</summary>
          <pre className="mt-2 text-xs text-muted-foreground overflow-x-auto bg-muted/50 p-2 rounded">
            {code}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-theme={theme}
      className={`
        rounded-lg border border-border overflow-hidden group
        ${isFullscreen
          ? 'fixed inset-4 z-[200] m-0 bg-background/95 backdrop-blur-xl shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col'
          : 'my-4 bg-muted/30'}
        ${theme === 'dark' ? 'bg-[#1a1a2e]' : 'bg-white'}
        transition-colors duration-300
      `}
    >
      {/* Toolbar */}
      <div
        className={`
        flex items-center justify-between px-3 py-2 border-b border-border/50
        ${theme === 'dark' ? 'bg-muted/50' : 'bg-gray-50'}
        transition-colors duration-300
      `}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
            Mermaid Diagram
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Fullscreen Button - Always visible in fullscreen, hover in normal */}
          <Btn
            variant={isFullscreen ? 'destructive' : 'outline'}
            size="icon-sm"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
            className={isFullscreen ? '' : 'opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200'}
          >
            {isFullscreen ? <XIcon size={16} /> : <MaximizeIcon size={16} />}
          </Btn>

          {/* Download Button */}
          <Btn
            variant="outline"
            size="icon-sm"
            onClick={handleDownload}
            disabled={isLoading || !svgContent}
            title="Download SVG"
            className={isFullscreen ? '' : 'opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200'}
          >
            <DownloadIcon size={16} />
          </Btn>
        </div>
      </div>

      {/* Diagram with zoom/pan */}
      <div
        className={`
        relative flex-1 overflow-hidden
        ${theme === 'dark' ? 'bg-[#1a1a2e]' : 'bg-white'}
        transition-colors duration-300
      `}
      >
        {/* Loading Overlay */}
        {isLoading && (
          <div
            className={`
            absolute inset-0 z-20 flex items-center justify-center
            ${theme === 'dark' ? 'bg-[#1a1a2e]' : 'bg-white'}
          `}
          >
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-sm">Rendering diagram...</span>
            </div>
          </div>
        )}

        <TransformWrapper
          initialScale={1}
          minScale={0.2}
          maxScale={8}
          centerOnInit={true}
          wheel={{ step: 0.15 }}
          pinch={{ step: 5 }}
          doubleClick={{ step: 0.5, mode: 'zoomIn' }}
        >
          {/* Floating Controls */}
          <div
            className={`
            absolute top-4 right-4 z-10 flex items-center gap-2
            ${isFullscreen ? 'top-6 right-6' : ''}
            opacity-0 group-hover:opacity-100 transition-opacity duration-200
          `}
          >
            <MermaidControls />
          </div>

          <TransformComponent
            wrapperClass={isFullscreen ? '!h-full' : ''}
            wrapperStyle={{
              width: '100%',
              height: '100%',
              minHeight: isFullscreen ? 'auto' : '250px',
              maxHeight: isFullscreen ? 'none' : '600px',
            }}
            contentStyle={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              className={`
                mermaid-diagram-content
                ${isFullscreen ? 'p-12' : 'p-6 sm:p-8'}
              `}
              // Note: SVG content is generated by mermaid library (trusted source)
              dangerouslySetInnerHTML={{ __html: svgContent }}
              style={{
                minWidth: '100px',
                minHeight: '100px',
              }}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* Footer with hint */}
      <div
        className={`
        px-3 py-2 border-t border-border/30 text-center
        ${theme === 'dark' ? 'bg-muted/30' : 'bg-gray-50'}
        ${isFullscreen ? 'px-6 py-3' : ''}
        transition-colors duration-300
      `}
      >
        <div
          className={`
          text-muted-foreground/60 flex items-center justify-center gap-4 flex-wrap text-xs
        `}
        >
          <span className="flex items-center gap-1">
            <ZoomInIcon size={isFullscreen ? 14 : 12} />
            Scroll to zoom
          </span>
          <span className="flex items-center gap-1">
            <RotateCcwIcon size={isFullscreen ? 14 : 12} />
            Drag to pan
          </span>
          <span className="flex items-center gap-1">
            <MaximizeIcon size={isFullscreen ? 14 : 12} />
            Double-click to zoom in
          </span>
          {isFullscreen && (
            <span className="flex items-center gap-1 text-primary">
              <XIcon size={14} />
              Press Esc to exit
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
