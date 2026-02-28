import { useState, useCallback, useMemo } from 'react';
import { MermaidDiagram } from './MermaidDiagram';
import {
  type Lens, type DiagramNode,
  getDiagram, getBreadcrumbs, LENS_ROOTS, LENS_INFO,
} from './diagrams';
import { ChevronRight, ZoomIn } from 'lucide-react';

const LENS_ORDER: Lens[] = ['structure', 'time', 'logic', 'state'];

export function SystemDiagrams() {
  const [activeLens, setActiveLens] = useState<Lens>('structure');
  const [activeDiagramId, setActiveDiagramId] = useState(LENS_ROOTS.structure);

  const diagram = useMemo(() => getDiagram(activeDiagramId), [activeDiagramId]);
  const breadcrumbs = useMemo(() => getBreadcrumbs(activeDiagramId), [activeDiagramId]);

  const handleLensSwitch = useCallback((lens: Lens) => {
    setActiveLens(lens);
    setActiveDiagramId(LENS_ROOTS[lens]);
  }, []);

  const handleNodeClick = useCallback((node: DiagramNode) => {
    if (node.drillDownId) {
      const target = getDiagram(node.drillDownId);
      if (target) {
        setActiveDiagramId(target.id);
      }
    }
  }, []);

  const handleBreadcrumbClick = useCallback((diagramId: string) => {
    setActiveDiagramId(diagramId);
  }, []);

  if (!diagram) {
    return <div className="p-4 text-xs text-muted-foreground">Diagram not found: {activeDiagramId}</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Lens selector tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0">
        {LENS_ORDER.map(lens => {
          const info = LENS_INFO[lens];
          const isActive = lens === activeLens;
          return (
            <button
              key={lens}
              onClick={() => handleLensSwitch(lens)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] transition-colors ${
                isActive
                  ? 'bg-secondary text-foreground font-semibold'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              }`}
              title={info.description}
            >
              <span>{info.emoji}</span>
              {info.label}
            </button>
          );
        })}
      </div>

      {/* Breadcrumb trail */}
      {breadcrumbs.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/50 shrink-0 bg-secondary/30">
          {breadcrumbs.map((bc, i) => (
            <span key={bc.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              <button
                onClick={() => handleBreadcrumbClick(bc.id)}
                className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${
                  i === breadcrumbs.length - 1
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                {bc.title}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Diagram title + description */}
      <div className="px-4 pt-3 pb-1 shrink-0">
        <h3 className="text-sm font-semibold text-foreground">{diagram.title}</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {LENS_INFO[diagram.lens].description}
        </p>
      </div>

      {/* Diagram content */}
      <div className="flex-1 min-h-0 overflow-auto px-4 pb-4">
        <MermaidDiagram
          id={diagram.id}
          source={diagram.mermaid}
          nodes={diagram.nodes}
          onNodeClick={handleNodeClick}
          className="mt-2"
        />

        {/* Clickable nodes legend */}
        {diagram.nodes.some(n => n.drillDownId) && (
          <div className="mt-4 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Drill-down nodes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {diagram.nodes.filter(n => n.drillDownId).map(node => (
                <button
                  key={node.id}
                  onClick={() => handleNodeClick(node)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                >
                  <ZoomIn className="w-3 h-3" />
                  {node.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
