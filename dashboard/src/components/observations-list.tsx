'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { QuorumObservation } from '@/lib/types';

const categoryConfig: Record<string, { color: string; label: string; icon: string }> = {
  critique: {
    color: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
    label: 'Critique',
    icon: '',
  },
  risk: {
    color: 'bg-red-500/15 text-red-700 dark:text-red-400',
    label: 'Risk',
    icon: '',
  },
  insight: {
    color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    label: 'Insight',
    icon: '',
  },
  recommendation: {
    color: 'bg-green-500/15 text-green-700 dark:text-green-400',
    label: 'Recommendation',
    icon: '',
  },
  issue: {
    color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
    label: 'Issue',
    icon: '',
  },
  improvement: {
    color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
    label: 'Improvement',
    icon: '',
  },
  other: {
    color: 'bg-gray-500/15 text-gray-700 dark:text-gray-400',
    label: 'Other',
    icon: '',
  },
};

const severityConfig: Record<string, { color: string; label: string }> = {
  info: { color: 'bg-gray-500/15 text-gray-700 dark:text-gray-400', label: 'Info' },
  low: { color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', label: 'Low' },
  medium: { color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400', label: 'Medium' },
  high: { color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400', label: 'High' },
  critical: { color: 'bg-red-500/15 text-red-700 dark:text-red-400', label: 'Critical' },
};

const statusConfig: Record<string, { color: string; label: string }> = {
  open: { color: 'bg-zinc-700 text-white', label: 'Open' },
  acknowledged: { color: 'bg-blue-600 text-white', label: 'Acknowledged' },
  addressed: { color: 'bg-green-600 text-white', label: 'Addressed' },
  dismissed: { color: 'bg-gray-600 text-white', label: 'Dismissed' },
};

interface ObservationsListProps {
  initialObservations: QuorumObservation[];
  allAgents: string[];
}

export function ObservationsList({
  initialObservations,
  allAgents,
}: ObservationsListProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [observations] = useState<QuorumObservation[]>(initialObservations);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');

  const filteredObservations = observations.filter((obs) => {
    if (filterCategory !== 'all' && obs.category !== filterCategory) return false;
    if (filterStatus !== 'all' && obs.status !== filterStatus) return false;
    if (filterSeverity !== 'all' && obs.severity !== filterSeverity) return false;
    if (filterAgent !== 'all' && obs.source_agent !== filterAgent) return false;
    return true;
  });

  const updateStatus = async (id: string, newStatus: string) => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/observations/${id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });

        if (response.ok) {
          router.refresh();
        }
      } catch (error) {
        console.error('Failed to update status:', error);
      }
    });
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(date));
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4 bg-zinc-900 border-zinc-800">
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Category</label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[160px] h-9 bg-zinc-950 border-zinc-700">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-700">
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(categoryConfig).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Status</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px] h-9 bg-zinc-950 border-zinc-700">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-700">
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(statusConfig).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Severity</label>
            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-[160px] h-9 bg-zinc-950 border-zinc-700">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-700">
                <SelectItem value="all">All Severities</SelectItem>
                {Object.entries(severityConfig).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Agent</label>
            <Select value={filterAgent} onValueChange={setFilterAgent}>
              <SelectTrigger className="w-[160px] h-9 bg-zinc-950 border-zinc-700">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-700">
                <SelectItem value="all">All Agents</SelectItem>
                {allAgents.map((agent) => (
                  <SelectItem key={agent} value={agent}>
                    {agent}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-end">
            <div className="text-sm text-zinc-400">
              Showing {filteredObservations.length} of {observations.length} observations
            </div>
          </div>
        </div>
      </Card>

      {/* Observations List */}
      <div className="space-y-3">
        {filteredObservations.length === 0 ? (
          <Card className="p-8 bg-zinc-900 border-zinc-800">
            <div className="text-center text-zinc-500">
              <p className="text-lg font-medium">No observations found</p>
              <p className="text-sm mt-1">Try adjusting your filters or create a new observation.</p>
            </div>
          </Card>
        ) : (
          filteredObservations.map((obs) => (
            <Card
              key={obs.id}
              className="p-4 bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* Category Badge */}
                <Badge
                  className={`shrink-0 ${
                    categoryConfig[obs.category]?.color ?? categoryConfig.other.color
                  }`}
                >
                  {categoryConfig[obs.category]?.label ?? 'Other'}
                </Badge>

                <div className="flex-1 min-w-0">
                  {/* Header: Source Agent & Time */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-zinc-300">{obs.source_agent}</span>
                    <span className="text-zinc-600">-</span>
                    <span className="text-xs text-zinc-500">{formatDate(obs.created_at)}</span>
                    {obs.ref_id && (
                      <>
                        <span className="text-zinc-600">-</span>
                        <span className="text-xs text-zinc-500">
                          Ref: {obs.ref_type}/{obs.ref_id.slice(0, 8)}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Content */}
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{obs.content}</p>

                  {/* Footer: Severity, Status, Actions */}
                  <div className="flex items-center gap-3 mt-3">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        severityConfig[obs.severity]?.color ?? severityConfig.info.color
                      }`}
                    >
                      {severityConfig[obs.severity]?.label ?? 'Info'}
                    </Badge>

                    <Select
                      value={obs.status}
                      onValueChange={(newStatus) => updateStatus(obs.id, newStatus)}
                    >
                      <SelectTrigger className="h-7 w-[140px] text-xs bg-zinc-950 border-zinc-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-700">
                        {Object.entries(statusConfig).map(([key, { label }]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
