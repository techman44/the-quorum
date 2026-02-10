import { NextRequest, NextResponse } from 'next/server';
import { getAIProvider } from '@/lib/db';
import { decryptApiKey } from '@/lib/ai/encryption';
import { testProvider, type AIProvider as AIProviderConfig } from '@/lib/ai/providers';
import type { AIProvider } from '@/lib/types';

// POST /api/settings/test - Test a provider connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerId, providerType, apiKey, baseUrl } = body as {
      providerId?: string;
      providerType?: string;
      apiKey?: string;
      baseUrl?: string;
    };

    // Debug logging
    console.log('Test request body:', { providerId, providerType, hasApiKey: !!apiKey, baseUrl });

    let provider: AIProviderConfig | null = null;

    if (providerId) {
      // Test existing provider
      const dbProvider = await getAIProvider(providerId);
      if (!dbProvider) {
        return NextResponse.json(
          { error: 'Provider not found' },
          { status: 404 }
        );
      }

      // Decrypt API key
      let apiKeyDecrypted: string | undefined;
      if (dbProvider.apiKeyEncrypted) {
        try {
          apiKeyDecrypted = decryptApiKey(dbProvider.apiKeyEncrypted);
        } catch {
          return NextResponse.json(
            { error: 'Failed to decrypt API key' },
            { status: 500 }
          );
        }
      }

      // Use provided apiKey or baseUrl from body if given (override for testing)
      // This allows testing with different credentials or base URL
      const finalApiKey = apiKey || apiKeyDecrypted;
      const finalBaseUrl = baseUrl || dbProvider.baseUrl;

      provider = {
        id: dbProvider.id,
        type: dbProvider.providerType as AIProviderConfig['type'],
        name: dbProvider.name,
        isEnabled: dbProvider.isEnabled,
        apiKey: finalApiKey,
        baseUrl: finalBaseUrl,
        metadata: dbProvider.metadata,
      };
    } else if (providerType) {
      // Test new provider configuration
      // API key is optional for custom providers
      if (providerType !== 'custom' && !apiKey) {
        return NextResponse.json(
          { error: 'API key is required for this provider type' },
          { status: 400 }
        );
      }
      provider = {
        id: 'test',
        type: providerType as AIProviderConfig['type'],
        name: 'Test Provider',
        isEnabled: true,
        apiKey,
        baseUrl,
        metadata: {},
      };
    } else {
      return NextResponse.json(
        { error: 'Missing required fields: providerId OR (providerType)' },
        { status: 400 }
      );
    }

    const result = await testProvider(provider);

    return NextResponse.json({
      success: result,
      message: result ? 'Connection successful' : 'Connection failed',
    });
  } catch (err) {
    console.error('Provider test API error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
