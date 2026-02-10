'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChatMessage } from '@/components/chat-message';
import { Paperclip, X, Send } from 'lucide-react';
import type { QuorumEvent } from '@/lib/types';

export function ChatPanel({
  agentName,
  agentDisplayName,
  agentColor,
  initialMessages,
}: {
  agentName: string;
  agentDisplayName: string;
  agentColor: string;
  initialMessages: QuorumEvent[];
}) {
  const [messages, setMessages] = useState<QuorumEvent[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userSentRef = useRef(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // Only auto-scroll if user just sent a message or is already near the bottom
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
        const content = reader.result as string;
        setAttachedFile({ name: file.name, content });
      };
      reader.readAsText(file);
    }

    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, []);

  const removeAttachedFile = useCallback(() => {
    setAttachedFile(null);
  }, []);

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    // Build the full message, appending file content if attached
    let fullMessage = trimmed;
    if (attachedFile) {
      fullMessage += `\n\nHere's a file I'd like you to review:\n\nFilename: ${attachedFile.name}\nContent:\n${attachedFile.content}`;
    }

    // Display message shows just the user's text (plus file indicator)
    const displayText = attachedFile
      ? `${trimmed}\n\n[Attached: ${attachedFile.name}]`
      : trimmed;

    const userMessage: QuorumEvent = {
      id: `temp-${Date.now()}`,
      event_type: 'chat_message',
      title: `Chat to ${agentName}`,
      description: displayText,
      metadata: { target_agent: agentName, sender: 'user' },
      created_at: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachedFile(null);
    setLoading(true);
    userSentRef.current = true;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agentName, message: fullMessage }),
      });

      if (!res.ok) {
        // Try to parse JSON error (fallback responses come as JSON)
        const contentType = res.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          throw new Error('Failed to send message');
        }
        throw new Error('Failed to send message');
      }

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('text/plain')) {
        // Streaming response -- read chunks and build up the message
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        const streamingMsgId = `stream-${Date.now()}`;
        let accumulated = '';

        // Add an empty agent message that we will update as chunks arrive
        const agentMessage: QuorumEvent = {
          id: streamingMsgId,
          event_type: 'chat_response',
          title: `Chat from ${agentName}`,
          description: '',
          metadata: { target_agent: agentName, sender: 'agent' },
          created_at: new Date(),
        };
        setMessages((prev) => [...prev, agentMessage]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          accumulated += decoder.decode(value, { stream: true });

          // Update the streaming message with accumulated text
          const currentText = accumulated;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingMsgId
                ? { ...msg, description: currentText }
                : msg
            )
          );
        }
      } else {
        // JSON fallback response (no API key configured)
        const data = await res.json();

        const agentMessage: QuorumEvent = {
          id: data.event_id,
          event_type: 'chat_response',
          title: `Chat from ${agentName}`,
          description: data.response,
          metadata: { target_agent: agentName, sender: 'agent' },
          created_at: new Date(),
        };

        setMessages((prev) => [...prev, agentMessage]);
      }
    } catch {
      const errorMessage: QuorumEvent = {
        id: `error-${Date.now()}`,
        event_type: 'chat_response',
        title: `Chat from ${agentName}`,
        description: 'Failed to send message. Please try again.',
        metadata: { target_agent: agentName, sender: 'agent' },
        created_at: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
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
              <div
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
                style={{ backgroundColor: agentColor }}
              >
                {agentDisplayName.charAt(0)}
              </div>
              <h2 className="text-lg font-medium text-zinc-300">
                Start a conversation with {agentDisplayName}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Send a message to get started.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              agentName={agentName}
              agentColor={agentColor}
            />
          ))}
          {loading && messages[messages.length - 1]?.metadata?.sender !== 'agent' && (
            <div className="flex gap-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: agentColor }}
              >
                {agentDisplayName.charAt(0)}
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
          {/* Attached file pill */}
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
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.txt,.md,.markdown,.json,.csv,.xml,.html,.htm,.css,.js,.ts,.tsx,.jsx,.py,.sh,.yml,.yaml,.toml,.ini,.cfg,.conf,.log,.sql,.env,.dockerfile,.rs,.go,.java,.c,.cpp,.h,.hpp,.rb,.php,.swift,.kt,.scala,.r"
            />

            {/* Paperclip button */}
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
              placeholder={`Message ${agentDisplayName}...`}
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
