import { NextRequest, NextResponse } from 'next/server';
import { getAgent } from '@/lib/agents';
import { storeChatMessage } from '@/lib/db';
import { streamAgentChat } from '@/lib/ai/model-selector';
import { getSession, addMessageToSession } from '@/lib/ai/sessions';
import type { ChatMessage } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent, message } = body;

    if (!agent || typeof agent !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid agent name' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid message' },
        { status: 400 }
      );
    }

    const agentDef = getAgent(agent);
    if (!agentDef) {
      return NextResponse.json(
        { error: `Unknown agent: ${agent}` },
        { status: 404 }
      );
    }

    // Store the user message
    await storeChatMessage(agent, message, 'user');

    // Build session ID so conversations are remembered per agent
    const sessionId = `quorum-chat-${agent}`;

    // Get or create session
    const session = await getSession(sessionId, agent);

    // Get agent prompt from AGENT_PROMPTS if available
    const { AGENT_PROMPTS } = await import('@/lib/agents');
    const systemPrompt = AGENT_PROMPTS[agent] || `You are ${agentDef.displayName}.`;

    // Build messages with system prompt
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...session.messages,
      { role: 'user', content: message },
    ];

    // Store user message in session
    await addMessageToSession(sessionId, { role: 'user', content: message });

    const agentNameForStorage = agent;
    let fullResponse = '';

    const stream = new ReadableStream({
      async start(streamController) {
        try {
          // Stream the response
          for await (const chunk of streamAgentChat(agent, messages)) {
            fullResponse += chunk;
            streamController.enqueue(new TextEncoder().encode(chunk));
          }

          // Store the assistant's response in session
          await addMessageToSession(sessionId, { role: 'assistant', content: fullResponse });

          // Store in events
          await storeChatMessage(agentNameForStorage, fullResponse, 'agent');

          streamController.close();
        } catch (error) {
          console.error('Chat API error:', error);

          // Send fallback message
          const fallback = typeof error === 'object' && error !== null && 'message' in error
            ? (error as { message: string }).message
            : 'Failed to generate response. Please check your AI provider configuration.';

          fullResponse = fallback;
          streamController.enqueue(new TextEncoder().encode(fallback));

          // Store the error response
          await storeChatMessage(agentNameForStorage, fullResponse, 'agent');

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
    console.error('Chat API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
