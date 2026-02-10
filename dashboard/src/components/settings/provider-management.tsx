'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface Provider {
  id: string;
  providerType: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom';
  name: string;
  isEnabled: boolean;
  baseUrl?: string;
  hasApiKey: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProviderManagementProps {
  initialProviders: Provider[];
}

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI', color: 'bg-emerald-600' },
  { value: 'anthropic', label: 'Anthropic', color: 'bg-orange-600' },
  { value: 'google', label: 'Google', color: 'bg-blue-600' },
  { value: 'openrouter', label: 'OpenRouter', color: 'bg-purple-600' },
  { value: 'custom', label: 'Custom', color: 'bg-gray-600' },
] as const;

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250514'],
  google: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  openrouter: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.0-flash'],
  custom: [],
};

export function ProviderManagement({ initialProviders }: ProviderManagementProps) {
  const [providers, setProviders] = useState<Provider[]>(initialProviders);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);

  // Form state
  const [providerType, setProviderType] = useState<'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom'>('openai');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    if (editingProvider) {
      setProviderType(editingProvider.providerType);
      setName(editingProvider.name);
      setBaseUrl(editingProvider.baseUrl || '');
      setIsEnabled(editingProvider.isEnabled);
      setApiKey('');
      setTestStatus('idle');
      setTestMessage('');
    } else {
      resetForm();
    }
  }, [editingProvider, dialogOpen]);

  function resetForm() {
    setProviderType('openai');
    setName('');
    setApiKey('');
    setBaseUrl('');
    setIsEnabled(true);
    setTestStatus('idle');
    setTestMessage('');
  }

  async function handleSave() {
    if (!name.trim()) {
      setTestMessage('Name is required');
      setTestStatus('error');
      return;
    }

    startTransition(async () => {
      try {
        const url = editingProvider
          ? '/api/settings/providers'
          : '/api/settings/providers';

        const method = editingProvider ? 'PUT' : 'POST';

        const body: Record<string, unknown> = {
          providerType,
          name: name.trim(),
          isEnabled,
        };

        if (apiKey.trim()) {
          body.apiKey = apiKey.trim();
        }

        if (providerType === 'custom' || providerType === 'openrouter') {
          if (baseUrl.trim()) {
            body.baseUrl = baseUrl.trim();
          }
        }

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to save provider');
        }

        const result = await response.json();

        if (editingProvider) {
          setProviders(providers.map((p) =>
            p.id === editingProvider.id
              ? {
                  ...p,
                  name: result.name,
                  isEnabled: result.isEnabled,
                  baseUrl: result.baseUrl,
                  hasApiKey: result.hasApiKey,
                  updatedAt: new Date(),
                }
              : p
          ));
        } else {
          setProviders([
            {
              id: result.id,
              providerType: result.providerType,
              name: result.name,
              isEnabled: result.isEnabled,
              baseUrl: result.baseUrl,
              hasApiKey: result.hasApiKey,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            ...providers,
          ]);
        }

        setDialogOpen(false);
        setEditingProvider(null);
      } catch (error) {
        setTestStatus('error');
        setTestMessage(error instanceof Error ? error.message : 'Failed to save provider');
      }
    });
  }

  async function handleTest() {
    setTestStatus('testing');
    setTestMessage('');

    try {
      const body: Record<string, unknown> = {
        providerType,
        apiKey: apiKey.trim(),
      };

      if (providerType === 'custom' || providerType === 'openrouter') {
        if (baseUrl.trim()) {
          body.baseUrl = baseUrl.trim();
        }
      }

      if (editingProvider) {
        body.providerId = editingProvider.id;
        delete body.providerType;
        delete body.baseUrl;
      }

      const response = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (result.success) {
        setTestStatus('success');
        setTestMessage('Connection successful!');
      } else {
        setTestStatus('error');
        setTestMessage(result.error || 'Connection failed');
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage('Connection failed');
    }
  }

  async function handleToggleEnable(providerId: string, enabled: boolean) {
    startTransition(async () => {
      try {
        const response = await fetch('/api/settings/providers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: providerId, isEnabled: enabled }),
        });

        if (!response.ok) throw new Error('Failed to update provider');

        setProviders(providers.map((p) =>
          p.id === providerId ? { ...p, isEnabled: enabled } : p
        ));
      } catch (error) {
        console.error('Failed to toggle provider:', error);
      }
    });
  }

  async function handleDelete(providerId: string) {
    if (!confirm('Are you sure you want to delete this provider?')) return;

    startTransition(async () => {
      try {
        const response = await fetch(`/api/settings/providers?id=${providerId}`, {
          method: 'DELETE',
        });

        if (!response.ok) throw new Error('Failed to delete provider');

        setProviders(providers.filter((p) => p.id !== providerId));
      } catch (error) {
        console.error('Failed to delete provider:', error);
      }
    });
  }

  function getProviderTypeInfo(type: string) {
    return PROVIDER_TYPES.find((t) => t.value === type) || PROVIDER_TYPES[4];
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>AI Providers</CardTitle>
            <CardDescription>
              Manage API keys and connections for AI providers
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingProvider(null)}>
                Add Provider
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingProvider ? 'Edit Provider' : 'Add Provider'}
                </DialogTitle>
                <DialogDescription>
                  Configure an AI provider for agent model assignments
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="provider-type">Provider Type</Label>
                  <Select
                    value={providerType}
                    onValueChange={(value) =>
                      setProviderType(value as typeof providerType)
                    }
                    disabled={!!editingProvider}
                  >
                    <SelectTrigger id="provider-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDER_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My OpenAI Account"
                  />
                </div>

                {(providerType !== 'custom') && (
                  <div className="space-y-2">
                    <Label htmlFor="api-key">
                      API Key {editingProvider && '(leave blank to keep existing)'}
                    </Label>
                    <Input
                      id="api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                  </div>
                )}

                {providerType === 'custom' && (
                  <div className="space-y-2">
                    <Label htmlFor="api-key">
                      API Key (optional)
                    </Label>
                    <Input
                      id="api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Leave blank if not required"
                    />
                    <p className="text-xs text-muted-foreground">
                      Some local providers like LM Studio don't require an API key
                    </p>
                  </div>
                )}

                {(providerType === 'custom' || providerType === 'openrouter') && (
                  <div className="space-y-2">
                    <Label htmlFor="base-url">Base URL</Label>
                    <Input
                      id="base-url"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                    />
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Switch
                    id="enabled"
                    checked={isEnabled}
                    onCheckedChange={setIsEnabled}
                  />
                  <Label htmlFor="enabled">Enabled</Label>
                </div>

                {testStatus !== 'idle' && (
                  <div
                    className={`text-sm p-3 rounded-md ${
                      testStatus === 'testing'
                        ? 'bg-blue-950 border border-blue-800 text-blue-200'
                        : testStatus === 'success'
                        ? 'bg-green-950 border border-green-800 text-green-200'
                        : 'bg-red-950 border border-red-800 text-red-200'
                    }`}
                  >
                    {testStatus === 'testing' ? 'Testing connection...' : testMessage}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTest}
                  disabled={testStatus === 'testing' || isPending}
                >
                  {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                </Button>
                <Button onClick={handleSave} disabled={isPending}>
                  {isPending ? 'Saving...' : editingProvider ? 'Update' : 'Add'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {providers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No AI providers configured. Add a provider to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((provider) => {
                const typeInfo = getProviderTypeInfo(provider.providerType);
                return (
                  <TableRow key={provider.id}>
                    <TableCell className="font-medium">{provider.name}</TableCell>
                    <TableCell>
                      <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={provider.isEnabled}
                        onCheckedChange={(checked) =>
                          handleToggleEnable(provider.id, checked)
                        }
                        size="sm"
                      />
                    </TableCell>
                    <TableCell>
                      {provider.hasApiKey ? (
                        <Badge variant="secondary">Configured</Badge>
                      ) : provider.providerType === 'custom' ? (
                        <Badge variant="outline">Not required</Badge>
                      ) : (
                        <Badge variant="outline">Not set</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingProvider(provider);
                            setDialogOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(provider.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
