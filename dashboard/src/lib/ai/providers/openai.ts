// OpenAI provider implementation
import OpenAI from 'openai';
import type { ChatMessage, ChatOptions, AIProvider } from './base';

export interface OpenAICompletionResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export class OpenAIProvider {
  private client: OpenAI;
  private provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
    this.client = new OpenAI({
      apiKey: provider.apiKey || process.env.OPENAI_API_KEY,
      baseURL: provider.baseUrl || 'https://api.openai.com/v1',
    });
  }

  /**
   * Generate a chat completion (non-streaming)
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<OpenAICompletionResult> {
    const response = await this.client.chat.completions.create({
      model: this.provider.metadata?.model as string || 'gpt-4o',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP,
      stream: false,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  /**
   * Generate a streaming chat completion
   */
  async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: this.provider.metadata?.model as string || 'gpt-4o',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        yield content;
      }
    }
  }

  /**
   * Test the connection
   */
  async test(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.provider.metadata?.model as string || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export async function createOpenAIProvider(provider: AIProvider): Promise<OpenAIProvider> {
  return new OpenAIProvider(provider);
}
