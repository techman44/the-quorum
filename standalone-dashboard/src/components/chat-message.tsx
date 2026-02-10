import type { QuorumEvent } from '@/lib/types';

/**
 * Renders basic markdown-like formatting:
 * - ```code blocks```
 * - `inline code`
 * - **bold**
 * - Bullet lists (lines starting with - or *)
 * - Regular text lines
 */
function renderFormattedText(text: string) {
  const elements: React.ReactNode[] = [];
  let keyIdx = 0;

  // Split by fenced code blocks first
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Process text before the code block
    if (match.index > lastIndex) {
      elements.push(
        ...renderInlineSegments(text.slice(lastIndex, match.index), keyIdx)
      );
      keyIdx += 100;
    }

    // Render the code block
    const code = match[2];
    elements.push(
      <pre
        key={`cb-${keyIdx++}`}
        className="my-2 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-300"
      >
        <code>{code}</code>
      </pre>
    );

    lastIndex = match.index + match[0].length;
  }

  // Process remaining text after last code block
  if (lastIndex < text.length) {
    elements.push(...renderInlineSegments(text.slice(lastIndex), keyIdx));
  }

  return elements;
}

function renderInlineSegments(text: string, startKey: number): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let keyIdx = startKey;

  // Split into lines and process each
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Bullet list items
    if (/^[-*]\s+/.test(trimmedLine)) {
      const bulletContent = trimmedLine.replace(/^[-*]\s+/, '');
      elements.push(
        <div key={`li-${keyIdx++}`} className="flex gap-2 pl-2">
          <span className="select-none text-zinc-500">&#8226;</span>
          <span>{renderInlineFormatting(bulletContent, keyIdx++)}</span>
        </div>
      );
    } else if (trimmedLine === '') {
      // Empty line -> small spacing
      elements.push(<div key={`br-${keyIdx++}`} className="h-2" />);
    } else {
      // Regular text line with inline formatting
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

  // Match **bold** and `inline code`
  const inlineRegex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // Bold
      elements.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // Inline code
      elements.push(
        <code
          key={`ic-${keyIdx++}`}
          className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300"
        >
          {match[3]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements;
}

export function ChatMessage({
  message,
  agentName,
  agentColor,
}: {
  message: QuorumEvent;
  agentName: string;
  agentColor: string;
}) {
  const isUser = message.metadata?.sender === 'user';
  const timestamp = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%]">
          <div className="rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-sm text-white">
            <p className="whitespace-pre-wrap">{message.description}</p>
          </div>
          <p className="mt-1 text-right text-xs text-zinc-500">{timestamp}</p>
        </div>
      </div>
    );
  }

  const initial = agentName.charAt(0).toUpperCase();

  return (
    <div className="flex gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: agentColor }}
      >
        {initial}
      </div>
      <div className="max-w-[75%]">
        <div
          className="rounded-2xl rounded-bl-sm bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 border-l-2"
          style={{ borderLeftColor: agentColor }}
        >
          <div className="whitespace-pre-wrap">
            {renderFormattedText(message.description)}
          </div>
        </div>
        <p className="mt-1 text-xs text-zinc-500">{timestamp}</p>
      </div>
    </div>
  );
}
