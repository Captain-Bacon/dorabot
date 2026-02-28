import { useState, useEffect, useCallback, useMemo, useRef, type MouseEvent } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { useGateway } from '../hooks/useGateway';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  BookOpen, Search, HelpCircle, Pencil, Loader2, X, Check,
  ChevronRight, ExternalLink, MessageSquare, FileEdit,
} from 'lucide-react';

type Props = {
  gateway: ReturnType<typeof useGateway>;
};

type HeadingData = {
  id: string;
  text: string;
  level: number;
  position: number;
};

type Annotation = {
  sectionId: string;
  question?: string;
  clarificationAnswer?: string;
  improvementInProgress?: boolean;
};

export function ManualView({ gateway }: Props) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [headings, setHeadings] = useState<HeadingData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string>('');
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Map<string, Annotation>>(new Map());
  const [askingQuestion, setAskingQuestion] = useState<string | null>(null);
  const [questionInput, setQuestionInput] = useState('');
  const [improvingSections, setImprovingSections] = useState<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);
  // scrollRef removed: using scrollIntoView instead of manual scrollTo

  // Load manual content
  useEffect(() => {
    const loadManual = async () => {
      if (gateway.connectionState !== 'connected') return;
      try {
        const result = await gateway.rpc('manual.read') as { content: string };
        if (result?.content) {
          setContent(result.content);
          parseHeadings(result.content);
        }
      } catch (err) {
        console.error('Failed to load manual:', err);
      } finally {
        setLoading(false);
      }
    };
    loadManual();
  }, [gateway]);

  // Parse headings for TOC
  const parseHeadings = (text: string) => {
    const lines = text.split('\n');
    const parsed: HeadingData[] = [];
    let position = 0;

    for (const line of lines) {
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        const id = text.toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-');
        parsed.push({ id, text, level, position });
      }
      position += line.length + 1;
    }

    setHeadings(parsed);
  };

  // Scroll to section
  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    const viewport = contentRef.current?.closest('[data-radix-scroll-area-viewport]');

    if (element && viewport && contentRef.current) {
      const viewportElement = viewport as HTMLElement;
      // Calculate element position relative to content container
      const contentTop = contentRef.current.getBoundingClientRect().top;
      const elementTop = element.getBoundingClientRect().top;
      const relativePosition = elementTop - contentTop;
      const currentScroll = viewportElement.scrollTop;

      viewportElement.scrollTo({
        top: currentScroll + relativePosition - 80, // offset for header spacing
        behavior: 'smooth'
      });
      setActiveSection(id);
    }
  }, []);

  // Intersection observer for active section
  useEffect(() => {
    if (!contentRef.current) return;

    const viewport = contentRef.current.closest('[data-radix-scroll-area-viewport]');
    if (!viewport) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      {
        root: viewport as Element,
        threshold: 0.5,
        rootMargin: '-20% 0px -70% 0px'
      }
    );

    const headingElements = contentRef.current.querySelectorAll('h1, h2, h3');
    headingElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [content]);

  // Filter headings by search
  const filteredHeadings = useMemo(() => {
    if (!searchQuery.trim()) return headings;
    const q = searchQuery.toLowerCase();
    return headings.filter(h => h.text.toLowerCase().includes(q));
  }, [headings, searchQuery]);

  // Highlighted content with search
  const highlightedContent = useMemo(() => {
    if (!searchQuery.trim()) return content;
    const q = searchQuery.toLowerCase();
    const lines = content.split('\n');
    const highlighted = lines.filter(line =>
      line.toLowerCase().includes(q)
    );
    return highlighted.length > 0 ? content : content;
  }, [content, searchQuery]);

  // Handle "Explain this to me"
  const handleAskClarification = useCallback(async (sectionId: string) => {
    setAskingQuestion(sectionId);
    setQuestionInput('');
  }, []);

  const submitClarification = useCallback(async (sectionId: string) => {
    if (!questionInput.trim()) return;

    const heading = headings.find(h => h.id === sectionId);
    if (!heading) return;

    setAskingQuestion(null);

    // Send to agent
    await gateway.sendMessage(
      `Please explain this section of the user manual: "${heading.text}"\n\nSpecific question: ${questionInput}\n\nProvide a clear, concise explanation.`
    );

    setQuestionInput('');
  }, [questionInput, headings, gateway]);

  // Handle "This should be clearer"
  const handleImproveSection = useCallback(async (sectionId: string) => {
    const heading = headings.find(h => h.id === sectionId);
    if (!heading) return;

    setImprovingSections(prev => new Set(prev).add(sectionId));

    // Extract section content
    const headingIndex = headings.indexOf(heading);
    const nextHeading = headings[headingIndex + 1];
    const sectionStart = heading.position;
    const sectionEnd = nextHeading ? nextHeading.position : content.length;
    const sectionContent = content.substring(sectionStart, sectionEnd);

    await gateway.sendMessage(
      `Please improve this section of the user manual for clarity:\n\n${sectionContent}\n\nRewrite it to be clearer, more concise, and easier to understand. Keep the same heading level and structure. When done, update the file at /Users/jonathanluker/GitHub/dorabot/docs/USER-MANUAL.md with the improved version.`
    );

    // Will clear the improving state when manual is reloaded
  }, [headings, content, gateway]);

  // Custom markdown components
  const components = useMemo(() => ({
    h1: ({ children, ...props }: any) => {
      const id = String(children).toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      return (
        <div
          className="relative group"
          onMouseEnter={() => setHoveredSection(id)}
          onMouseLeave={() => setHoveredSection(null)}
        >
          <h1 id={id} className="text-3xl font-bold mt-8 mb-4 scroll-mt-20" {...props}>
            {children}
          </h1>
          {hoveredSection === id && (
            <div className="absolute right-0 top-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAskClarification(id)}
                className="h-7 text-xs"
              >
                <HelpCircle className="w-3.5 h-3.5 mr-1" />
                Explain
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleImproveSection(id)}
                className="h-7 text-xs"
                disabled={improvingSections.has(id)}
              >
                {improvingSections.has(id) ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                )}
                Improve
              </Button>
            </div>
          )}
        </div>
      );
    },
    h2: ({ children, ...props }: any) => {
      const id = String(children).toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      return (
        <div
          className="relative group"
          onMouseEnter={() => setHoveredSection(id)}
          onMouseLeave={() => setHoveredSection(null)}
        >
          <h2 id={id} className="text-2xl font-semibold mt-6 mb-3 scroll-mt-20" {...props}>
            {children}
          </h2>
          {hoveredSection === id && (
            <div className="absolute right-0 top-1 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAskClarification(id)}
                className="h-7 text-xs"
              >
                <HelpCircle className="w-3.5 h-3.5 mr-1" />
                Explain
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleImproveSection(id)}
                className="h-7 text-xs"
                disabled={improvingSections.has(id)}
              >
                {improvingSections.has(id) ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Pencil className="w-3.5 h-3.5 mr-1" />
                )}
                Improve
              </Button>
            </div>
          )}
        </div>
      );
    },
    h3: ({ children, ...props }: any) => {
      const id = String(children).toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      return (
        <div
          className="relative group"
          onMouseEnter={() => setHoveredSection(id)}
          onMouseLeave={() => setHoveredSection(null)}
        >
          <h3 id={id} className="text-xl font-medium mt-4 mb-2 scroll-mt-20" {...props}>
            {children}
          </h3>
          {hoveredSection === id && (
            <div className="absolute right-0 top-0.5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAskClarification(id)}
                className="h-6 text-xs"
              >
                <HelpCircle className="w-3 h-3 mr-1" />
                Explain
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleImproveSection(id)}
                className="h-6 text-xs"
                disabled={improvingSections.has(id)}
              >
                {improvingSections.has(id) ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Pencil className="w-3 h-3 mr-1" />
                )}
                Improve
              </Button>
            </div>
          )}
        </div>
      );
    },
    table: ({ children, ...props }: any) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }: any) => (
      <thead className="bg-muted/50" {...props}>{children}</thead>
    ),
    th: ({ children, ...props }: any) => (
      <th className="border border-border px-3 py-2 text-left text-sm font-medium" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }: any) => (
      <td className="border border-border px-3 py-2 text-sm" {...props}>
        {children}
      </td>
    ),
    code: ({ inline, children, ...props }: any) => {
      if (inline) {
        return (
          <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono" {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className="block p-3 rounded bg-muted text-sm font-mono overflow-x-auto my-3" {...props}>
          {children}
        </code>
      );
    },
    a: ({ children, href, ...props }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline inline-flex items-center gap-1"
        {...props}
      >
        {children}
        <ExternalLink className="w-3 h-3" />
      </a>
    ),
  }), [hoveredSection, improvingSections, handleAskClarification, handleImproveSection]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* TOC Sidebar */}
      <div className="w-64 border-r border-border flex flex-col bg-muted/5 overflow-hidden">
        <div className="p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">User Manual</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search sections..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2">
            {filteredHeadings.map((heading) => (
              <button
                key={heading.id}
                onClick={() => scrollToSection(heading.id)}
                className={cn(
                  'w-full text-left px-3 py-1.5 rounded text-sm hover:bg-accent transition-colors',
                  activeSection === heading.id && 'bg-accent font-medium',
                  heading.level === 1 && 'font-medium',
                  heading.level === 2 && 'pl-6 text-sm',
                  heading.level === 3 && 'pl-9 text-xs text-muted-foreground'
                )}
              >
                <div className="flex items-center gap-1.5">
                  {heading.level === 1 && <ChevronRight className="w-3 h-3" />}
                  <span className="truncate">{heading.text}</span>
                </div>
              </button>
            ))}
            {filteredHeadings.length === 0 && searchQuery && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No sections match "{searchQuery}"
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border text-xs text-muted-foreground">
          <p>Hover over any section heading to explain or improve it.</p>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="h-full">
          <div className="max-w-4xl mx-auto p-8" ref={contentRef}>
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={components}
            >
              {highlightedContent}
            </Markdown>
          </div>
        </ScrollArea>

        {/* Question Input Modal */}
        {askingQuestion && (
          <div className="border-t border-border bg-background p-4">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-primary mt-1" />
                <div className="flex-1">
                  <p className="text-sm font-medium mb-2">
                    What would you like to know about this section?
                  </p>
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      placeholder="Ask your question..."
                      value={questionInput}
                      onChange={(e) => setQuestionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submitClarification(askingQuestion);
                        } else if (e.key === 'Escape') {
                          setAskingQuestion(null);
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => submitClarification(askingQuestion)}
                      disabled={!questionInput.trim()}
                    >
                      <MessageSquare className="w-4 h-4 mr-1" />
                      Ask
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAskingQuestion(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    The agent will answer in the chat. Press Enter to send, Escape to cancel.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
