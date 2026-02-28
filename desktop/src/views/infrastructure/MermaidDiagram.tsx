import { useEffect, useRef, useCallback, useState } from 'react';
import mermaid from 'mermaid';
import type { DiagramNode } from './diagrams';

type Props = {
  id: string;
  source: string;
  nodes: DiagramNode[];
  onNodeClick: (node: DiagramNode) => void;
  className?: string;
};

let mermaidInitialized = false;

function initMermaid(isDark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
      padding: 12,
      nodeSpacing: 40,
      rankSpacing: 50,
    },
    themeVariables: isDark ? {
      primaryColor: '#3b82f6',
      primaryTextColor: '#e2e8f0',
      primaryBorderColor: '#475569',
      lineColor: '#64748b',
      secondaryColor: '#1e293b',
      tertiaryColor: '#0f172a',
      background: '#0f172a',
      mainBkg: '#1e293b',
      nodeBorder: '#475569',
      clusterBkg: '#1e293b',
      titleColor: '#e2e8f0',
      edgeLabelBackground: '#1e293b',
    } : {
      primaryColor: '#3b82f6',
      primaryTextColor: '#1e293b',
      primaryBorderColor: '#cbd5e1',
      lineColor: '#94a3b8',
      secondaryColor: '#f1f5f9',
      tertiaryColor: '#f8fafc',
      background: '#ffffff',
      mainBkg: '#f1f5f9',
      nodeBorder: '#cbd5e1',
    },
    securityLevel: 'loose',
  });
  mermaidInitialized = true;
}

export function MermaidDiagram({ id, source, nodes, onNodeClick, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const renderDiagram = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      // Re-init mermaid on each render to pick up theme changes
      initMermaid(isDark);

      // Clear previous
      containerRef.current.innerHTML = '';
      setError(null);
      setRendered(false);

      // Unique ID for this render
      const renderKey = `mermaid-${id}-${Date.now()}`;
      const { svg } = await mermaid.render(renderKey, source);

      if (!containerRef.current) return;
      containerRef.current.innerHTML = svg;

      // Attach click handlers to nodes that have drill-down
      const clickableNodes = nodes.filter(n => n.drillDownId);
      for (const node of clickableNodes) {
        // Mermaid wraps nodes in <g> elements with class "node" and id like "flowchart-ID-N"
        const nodeEls = containerRef.current.querySelectorAll(`[id*="flowchart-${node.id}-"]`);
        for (const el of nodeEls) {
          const gEl = el.closest('.node') || el;
          (gEl as HTMLElement).style.cursor = 'pointer';
          // Add a subtle visual hint that it's clickable
          const rect = gEl.querySelector('rect, .basic');
          if (rect) {
            (rect as SVGElement).style.strokeWidth = '2';
          }
          gEl.addEventListener('click', (e) => {
            e.stopPropagation();
            onNodeClick(node);
          });
        }
      }

      setRendered(true);
    } catch (err) {
      console.error('Mermaid render error:', err);
      setError(err instanceof Error ? err.message : 'Failed to render diagram');
    }
  }, [id, source, nodes, onNodeClick, isDark]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  return (
    <div className={className}>
      {error && (
        <div className="p-4 rounded-md bg-destructive/10 text-destructive text-xs">
          Diagram render error: {error}
        </div>
      )}
      <div
        ref={containerRef}
        className={`mermaid-container transition-opacity duration-200 ${rendered ? 'opacity-100' : 'opacity-0'} [&_svg]:max-w-full [&_svg]:h-auto`}
      />
      {/* Clickable node hint */}
      {rendered && nodes.some(n => n.drillDownId) && (
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Click highlighted nodes to drill down
        </p>
      )}
    </div>
  );
}
