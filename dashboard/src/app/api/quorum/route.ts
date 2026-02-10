import { NextRequest, NextResponse } from 'next/server';
import { storeQuorumMessage } from '@/lib/db';
import { streamAgentChat } from '@/lib/ai/model-selector';
import { getSession, addMessageToSession } from '@/lib/ai/sessions';
import type { ChatMessage } from '@/lib/types';

const QUORUM_SYSTEM_PROMPT = `You are The Quorum - a council of 7 AI agents working together. When responding to queries, structure your response to show the perspectives of relevant agents:

- **The Connector** (patterns & connections)
- **The Executor** (action items & deadlines)
- **The Strategist** (big picture & priorities)
- **The Devil's Advocate** (risks & challenges)
- **The Opportunist** (quick wins & hidden value)
- **The Data Collector** (facts & evidence)
- **The Closer** (verifies completion, closes tasks, updates status from evidence)

Search the database for relevant context. After showing relevant agent perspectives, provide a **Council Summary** that synthesizes the key takeaway and recommended action.

Format each agent section with their name as a bold header (e.g. **The Connector**). Only include agents whose perspective is relevant - don't force all 7 for every query.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, threadId, threadTitle } = body as {
      message: string;
      threadId?: string | null;
      threadTitle?: string | null;
    };

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid message' },
        { status: 400 }
      );
    }

    // Use provided threadId or default to 'default'
    const effectiveThreadId = threadId || 'default';
    const effectiveThreadTitle = threadTitle || (threadId ? null : 'Default Conversation');

    // Store the user message with thread info
    await storeQuorumMessage(message, 'user', effectiveThreadId, effectiveThreadTitle);

    // Use thread-specific session ID so conversations don't bleed into each other
    const sessionId = `quorum-council-${effectiveThreadId}`;

    // Get or create session
    const session = await getSession(sessionId, 'quorum');

    // Build messages with system prompt
    const messages: ChatMessage[] = [
      { role: 'system', content: QUORUM_SYSTEM_PROMPT },
      ...session.messages,
      { role: 'user', content: message },
    ];

    // Store user message in session
    await addMessageToSession(sessionId, { role: 'user', content: message });

    let fullResponse = '';

    const stream = new ReadableStream({
      async start(streamController) {
        try {
          // Stream the response
          for await (const chunk of streamAgentChat('quorum', messages)) {
            fullResponse += chunk;
            streamController.enqueue(new TextEncoder().encode(chunk));
          }

          // Store the assistant's response in session
          await addMessageToSession(sessionId, { role: 'assistant', content: fullResponse });

          // Store in events
          await storeQuorumMessage(fullResponse, 'council', effectiveThreadId, effectiveThreadTitle);

          streamController.close();
        } catch (error) {
          console.error('Quorum API error:', error);

          // Send fallback message
          const fallback = typeof error === 'object' && error !== null && 'message' in error
            ? (error as { message: string }).message
            : 'Failed to generate response. Please check your AI provider configuration.';

          fullResponse = fallback;
          streamController.enqueue(new TextEncoder().encode(fallback));

          // Store the error response
          await storeQuorumMessage(fallback, 'council', effectiveThreadId, effectiveThreadTitle);

          streamController.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (err) {
    console.error('Quorum API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
