// Google Gemini provider implementation
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText } from 'ai';
import type { ChatMessage, ChatOptions, AIProvider } from './base';

export interface GoogleCompletionResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export class GoogleProvider {
  private provider: AIProvider;
  private client: ReturnType<typeof createGoogleGenerativeAI>;

  constructor(provider: AIProvider) {
    this.provider = provider;
    this.client = createGoogleGenerativeAI({
      apiKey: provider.apiKey || process.env.GOOGLE_API_KEY || '',
    });
  }

  /**
   * Generate a chat completion (non-streaming)
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<GoogleCompletionResult> {
    const model = this.client(this.provider.metadata?.model as string || 'gemini-2.5-pro');

    // Separate system message from chat messages
    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        content: m.content,
      }));

    const result = await generateText({
      model,
      system: systemMessage,
      messages: chatMessages,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 4096,
      topP: options.topP,
    } as any);

    return {
      content: result.text,
      usage: {
        promptTokens: (result.usage as any)?.promptTokens || (result.usage as any)?.prompt || 0,
        completionTokens: (result.usage as any)?.completionTokens || (result.usage as any)?.completionion || 0,
      },
    };
  }

  /**
   * Generate a streaming chat completion
   */
  async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string> {
    const model = this.client(this.provider.metadata?.model as string || 'gemini-2.5-pro');

    const systemMessage = messages.find(m => m.role === 'system')?.content;
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        content: m.content,
      }));

    const result = await streamText({
      model,
      system: systemMessage,
      messages: chatMessages,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 4096,
      topP: options.topP,
    } as any);

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }

  /**
   * Test the connection
   */
  async test(): Promise<boolean> {
    try {
      const model = this.client('gemini-2.0-flash-exp');
      await generateText({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 5,
      } as any);
      return true;
    } catch {
      return false;
    }
  }
}

export async function createGoogleProvider(provider: AIProvider): Promise<GoogleProvider> {
  return new GoogleProvider(provider);
}
