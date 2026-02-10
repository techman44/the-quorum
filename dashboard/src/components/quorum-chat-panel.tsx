'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, X, Send } from 'lucide-react';
import type { QuorumEvent } from '@/lib/types';

interface QuorumChatPanelProps {
  initialMessages: QuorumEvent[];
  threadId: string | null;
  threadTitle: string | null;
}

// Agent colors matching agents.ts - ordered for display
const AGENT_ORDER = [
  'The Connector',
  'The Executor',
  'The Strategist',
  "The Devil's Advocate",
  'The Opportunist',
  'The Data Collector',
  'The Closer',
  'Council Summary',
] as const;

const AGENT_STYLES: Record<string, { color: string; initial: string }> = {
  'The Connector': { color: '#3B82F6', initial: 'C' },
  'The Executor': { color: '#EF4444', initial: 'E' },
  'The Strategist': { color: '#8B5CF6', initial: 'S' },
  "The Devil's Advocate": { color: '#F59E0B', initial: 'D' },
  'The Opportunist': { color: '#10B981', initial: 'O' },
  'The Data Collector': { color: '#6366F1', initial: 'D' },
  'The Closer': { color: '#F97316', initial: 'CL' },
  'Council Summary': { color: '#FFFFFF', initial: 'Q' },
};

/** Detect which agents have appeared in the streamed text so far */
function detectActiveAgents(text: string): string[] {
  const found: string[] = [];
  for (const agent of AGENT_ORDER) {
    if (text.includes(`**${agent}**`)) {
      found.push(agent);
    }
  }
  return found;
}

/** Vertical stack of agent avatars showing who's contributing */
function AgentAvatarStack({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const activeAgents = detectActiveAgents(text);

  if (activeAgents.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 text-xs font-bold text-white">
          Q
        </div>
        {isStreaming && (
          <div className="flex h-5 w-5 items-center justify-center">
            <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 text-xs font-bold text-white">
        Q
      </div>
      {activeAgents.map((agent, idx) => {
        const style = AGENT_STYLES[agent];
        if (!style) return null;
        const isLast = idx === activeAgents.length - 1;
        const isSummary = agent === 'Council Summary';

        return (
          <div key={agent} className="relative flex flex-col items-center">
            {/* Connector line */}
            <div className="h-1.5 w-px bg-zinc-700" />
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white transition-all duration-300 ${
                isLast && isStreaming ? 'ring-2 ring-offset-1 ring-offset-zinc-950' : ''
              } ${isSummary ? 'bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500' : ''}`}
              style={{
                backgroundColor: isSummary ? undefined : style.color,
                ...(isLast && isStreaming ? { '--tw-ring-color': style.color } as React.CSSProperties : {}),
              }}
              title={agent}
            >
              {style.initial}
            </div>
            {isLast && isStreaming && (
              <div className="mt-1 flex h-4 w-4 items-center justify-center">
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{ backgroundColor: style.color }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Parse the council response into sections.
 * Looks for **Agent Name** headers at the start of lines.
 */
function parseSections(text: string): { agent: string | null; content: string }[] {
  const sections: { agent: string | null; content: string }[] = [];
  const headerPattern = /^\*\*(.+?)\*\*/gm;

  let lastIndex = 0;
  let lastAgent: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = headerPattern.exec(text)) !== null) {
    // Content before this header
    if (match.index > lastIndex) {
      const content = text.slice(lastIndex, match.index).trim();
      if (content) {
        sections.push({ agent: lastAgent, content });
      }
    }

    lastAgent = match[1];
    lastIndex = match.index + match[0].length;
  }

  // Remaining content
  const remaining = text.slice(lastIndex).trim();
  if (remaining) {
    sections.push({ agent: lastAgent, content: remaining });
  }

  // If no sections were detected, return the whole text as one block
  if (sections.length === 0 && text.trim()) {
    sections.push({ agent: null, content: text.trim() });
  }

  return sections;
}

function renderFormattedText(text: string) {
  const elements: React.ReactNode[] = [];
  let keyIdx = 0;

  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(...renderInlineSegments(text.slice(lastIndex, match.index), keyIdx));
      keyIdx += 100;
    }
    elements.push(
      <pre key={`cb-${keyIdx++}`} className="my-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-300">
        <code>{match[2]}</code>
      </pre>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    elements.push(...renderInlineSegments(text.slice(lastIndex), keyIdx));
  }

  return elements;
}

function renderInlineSegments(text: string, startKey: number): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let keyIdx = startKey;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (/^[-*]\s+/.test(trimmedLine)) {
      const bulletContent = trimmedLine.replace(/^[-*]\s+/, '');
      elements.push(
        <div key={`li-${keyIdx++}`} className="flex gap-2 pl-2">
          <span className="select-none text-zinc-500">&#8226;</span>
          <span>{renderInlineFormatting(bulletContent, keyIdx++)}</span>
        </div>
      );
    } else if (trimmedLine === '') {
      elements.push(<div key={`br-${keyIdx++}`} className="h-2" />);
    } else {
      elements.push(
        <span key={`ln-${keyIdx++}`}>
          {renderInlineFormatting(line, keyIdx++)}
          {i < lines.length - 1 ? '\n' : ''}
        </span>
      );
    }
  }

  return elements;
}

function renderInlineFormatting(text: string, startKey: number): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let keyIdx = startKey;

  const inlineRegex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      elements.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold">{match[2]}</strong>
      );
    } else if (match[3]) {
      elements.push(
        <code key={`ic-${keyIdx++}`} className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300">
          {match[3]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements;
}

function CouncilMessage({ text }: { text: string }) {
  const sections = parseSections(text);

  // If it's a single section with no agent, render plain
  if (sections.length === 1 && !sections[0].agent) {
    return (
      <div className="whitespace-pre-wrap text-sm text-zinc-100">
        {renderFormattedText(sections[0].content)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((section, idx) => {
        const style = section.agent ? AGENT_STYLES[section.agent] : null;
        const isCouncilSummary = section.agent === 'Council Summary';

        if (isCouncilSummary) {
          return (
            <div
              key={idx}
              className="rounded-lg border border-zinc-600 bg-zinc-800/50 p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 text-[10px] font-bold text-white">
                  Q
                </div>
                <span className="text-sm font-semibold text-zinc-200">
                  Council Summary
                </span>
              </div>
              <div className="whitespace-pre-wrap text-sm text-zinc-100">
                {renderFormattedText(section.content)}
              </div>
            </div>
          );
        }

        if (style) {
          return (
            <div
              key={idx}
              className="rounded-lg border-l-2 bg-zinc-800/30 px-4 py-3"
              style={{ borderLeftColor: style.color }}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: style.color }}
                >
                  {style.initial}
                </div>
                <span className="text-xs font-semibold text-zinc-300">
                  {section.agent}
                </span>
              </div>
              <div className="whitespace-pre-wrap text-sm text-zinc-100">
                {renderFormattedText(section.content)}
              </div>
            </div>
          );
        }

        // Plain section (no recognized agent header)
        return (
          <div key={idx} className="whitespace-pre-wrap text-sm text-zinc-100">
            {renderFormattedText(section.content)}
          </div>
        );
      })}
    </div>
  );
}

export function QuorumChatPanel({
  initialMessages,
  threadId,
  threadTitle,
}: QuorumChatPanelProps) {
  const [messages, setMessages] = useState<QuorumEvent[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userSentRef = useRef(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (userSentRef.current || distanceFromBottom < 150) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      userSentRef.current = false;
    }
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's a PDF - need special handling
    if (file.name.toLowerCase().endsWith('.pdf')) {
      // For PDFs, we need to send to server for text extraction
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/extract-pdf', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to extract PDF text');
        }

        const data = await res.json();
        setAttachedFile({ name: file.name, content: data.text });
      } catch (err) {
        console.error('PDF extraction error:', err);
        alert(err instanceof Error ? err.message : 'Failed to extract text from PDF. Please try a text file instead.');
      }
    } else {
      // For text files, read directly
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedFile({ name: file.name, content: reader.result as string });
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  }, []);

  const removeAttachedFile = useCallback(() => {
    setAttachedFile(null);
  }, []);

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    let fullMessage = trimmed;
    if (attachedFile) {
      fullMessage += `\n\nHere's a file I'd like the council to review:\n\nFilename: ${attachedFile.name}\nContent:\n${attachedFile.content}`;
    }

    const displayText = attachedFile
      ? `${trimmed}\n\n[Attached: ${attachedFile.name}]`
      : trimmed;

    const userMessage: QuorumEvent = {
      id: `temp-${Date.now()}`,
      event_type: 'quorum_chat',
      title: 'Chat to The Quorum',
      description: displayText,
      metadata: { target_agent: 'quorum', sender: 'user' },
      created_at: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachedFile(null);
    setLoading(true);
    userSentRef.current = true;

    try {
      const res = await fetch('/api/quorum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fullMessage,
          threadId,
          threadTitle,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to send message');
      }

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('text/plain')) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        const sMsgId = `stream-${Date.now()}`;
        setStreamingMsgId(sMsgId);
        let accumulated = '';

        const councilMessage: QuorumEvent = {
          id: sMsgId,
          event_type: 'quorum_response',
          title: 'Response from The Quorum',
          description: '',
          metadata: { target_agent: 'quorum', sender: 'council' },
          created_at: new Date(),
        };
        setMessages((prev) => [...prev, councilMessage]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          accumulated += decoder.decode(value, { stream: true });
          const currentText = accumulated;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === sMsgId
                ? { ...msg, description: currentText }
                : msg
            )
          );
        }
      } else {
        const data = await res.json();
        const councilMessage: QuorumEvent = {
          id: data.event_id,
          event_type: 'quorum_response',
          title: 'Response from The Quorum',
          description: data.response,
          metadata: { target_agent: 'quorum', sender: 'council' },
          created_at: new Date(),
        };
        setMessages((prev) => [...prev, councilMessage]);
      }
    } catch {
      const errorMessage: QuorumEvent = {
        id: `error-${Date.now()}`,
        event_type: 'quorum_response',
        title: 'Response from The Quorum',
        description: 'Failed to reach The Quorum. Please try again.',
        metadata: { target_agent: 'quorum', sender: 'council' },
        created_at: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setStreamingMsgId(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 text-2xl font-bold text-white">
                Q
              </div>
              <h2 className="text-lg font-medium text-zinc-300">
                Welcome to The Quorum
              </h2>
              <p className="mt-1 max-w-md text-sm text-zinc-500">
                Ask anything and all 7 agents will contribute their unique perspectives. The Connector finds patterns, The Executor tracks actions, The Strategist sees the big picture, The Devil&apos;s Advocate spots risks, The Opportunist finds quick wins, The Data Collector gathers facts, and The Closer verifies completion and ties up loose ends.
              </p>
            </div>
          )}
          {messages.map((msg) => {
            const isUser = msg.metadata?.sender === 'user';
            const timestamp = new Date(msg.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            if (isUser) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[75%]">
                    <div className="rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-sm text-white">
                      <p className="whitespace-pre-wrap">{msg.description}</p>
                    </div>
                    <p className="mt-1 text-right text-xs text-zinc-500">{timestamp}</p>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex gap-3 items-start">
                <AgentAvatarStack
                  text={msg.description}
                  isStreaming={streamingMsgId === msg.id}
                />
                <div className="max-w-[85%] min-w-0">
                  <div className="rounded-2xl rounded-bl-sm bg-zinc-800 px-4 py-3">
                    <CouncilMessage text={msg.description} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{timestamp}</p>
                </div>
              </div>
            );
          })}
          {loading && messages[messages.length - 1]?.metadata?.sender !== 'council' && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-amber-500 text-xs font-bold text-white">
                Q
              </div>
              <div className="rounded-2xl rounded-bl-sm bg-zinc-800 px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-zinc-800 p-4">
        <div className="mx-auto max-w-3xl">
          {attachedFile && (
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                <Paperclip className="size-3" />
                {attachedFile.name}
                <button
                  onClick={removeAttachedFile}
                  className="ml-1 rounded-full p-0.5 hover:bg-zinc-700"
                  type="button"
                >
                  <X className="size-3" />
                </button>
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.txt,.md,.markdown,.json,.csv,.xml,.html,.htm,.css,.js,.ts,.tsx,.jsx,.py,.sh,.yml,.yaml,.toml,.ini,.cfg,.conf,.log,.sql,.env,.dockerfile,.rs,.go,.java,.c,.cpp,.h,.hpp,.rb,.php,.swift,.kt,.scala,.r"
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="self-end shrink-0 text-zinc-400 hover:text-zinc-200"
            >
              <Paperclip className="size-4" />
            </Button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask The Quorum..."
              disabled={loading}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
            />

            <Button
              onClick={handleSubmit}
              disabled={loading || !input.trim()}
              size="default"
              className="self-end"
            >
              <Send className="size-4" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
