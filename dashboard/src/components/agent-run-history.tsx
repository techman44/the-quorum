"use client";

import { useState } from "react";
import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { QuorumAgentRun } from "@/lib/types";

interface AgentRunHistoryProps {
  runs: QuorumAgentRun[];
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString();
}

function formatDuration(
  startedAt: Date,
  completedAt: Date | null
): string {
  if (!completedAt) return "running...";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainSec}s`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}h ${remainMin}m`;
}

function statusBadge(status: string) {
  switch (status) {
    case "running":
      return <Badge className="bg-blue-600 text-white">Running</Badge>;
    case "completed":
      return <Badge className="bg-green-600 text-white">Completed</Badge>;
    case "failed":
      return <Badge className="bg-red-600 text-white">Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function AgentRunHistory({ runs }: AgentRunHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (runs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No runs recorded yet. This agent has not been executed.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Started</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Summary</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <React.Fragment key={run.id}>
            <TableRow
              className="cursor-pointer"
              onClick={() =>
                setExpandedId(expandedId === run.id ? null : run.id)
              }
            >
              <TableCell>{formatDateTime(run.started_at)}</TableCell>
              <TableCell>
                {formatDuration(run.started_at, run.completed_at)}
              </TableCell>
              <TableCell>{statusBadge(run.status)}</TableCell>
              <TableCell className="max-w-md truncate">
                {run.summary
                  ? run.summary.length > 100
                    ? run.summary.slice(0, 100) + "..."
                    : run.summary
                  : "No summary"}
              </TableCell>
            </TableRow>
            {expandedId === run.id && (
              <TableRow>
                <TableCell colSpan={4} className="bg-muted/30">
                  <div className="space-y-3 py-2">
                    {run.summary && (
                      <div>
                        <p className="text-sm font-medium mb-1">
                          Full Summary
                        </p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {run.summary}
                        </p>
                      </div>
                    )}
                    {run.metadata &&
                      Object.keys(run.metadata).length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-1">
                            Metadata
                          </p>
                          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-60">
                            {JSON.stringify(run.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </React.Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
