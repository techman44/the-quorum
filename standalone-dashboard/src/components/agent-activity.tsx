"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import type { QuorumEvent } from "@/lib/types";

interface AgentActivityProps {
  events: QuorumEvent[];
}

const EVENT_TYPE_STYLES: Record<string, string> = {
  insight: "bg-purple-600 text-white",
  observation: "bg-blue-600 text-white",
  critique: "bg-amber-600 text-white",
  opportunity: "bg-green-600 text-white",
};

export function AgentActivity({ events }: AgentActivityProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No activity recorded yet for this agent.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const badgeClass =
          EVENT_TYPE_STYLES[event.event_type] ?? "bg-muted text-foreground";
        const isExpanded = expandedId === event.id;
        const description = event.description ?? "";
        const needsTruncation = description.length > 200;

        return (
          <div
            key={event.id}
            className="border rounded-lg p-4 space-y-2 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={badgeClass}>{event.event_type}</Badge>
                <span className="font-medium text-sm">{event.title}</span>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {timeAgo(new Date(event.created_at))}
              </span>
            </div>
            {description && (
              <div className="text-sm text-muted-foreground">
                <p className="whitespace-pre-wrap">
                  {isExpanded || !needsTruncation
                    ? description
                    : description.slice(0, 200) + "..."}
                </p>
                {needsTruncation && (
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : event.id)
                    }
                    className="text-primary text-xs mt-1 hover:underline"
                  >
                    {isExpanded ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
