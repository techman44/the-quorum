import { Card, CardContent } from "@/components/ui/card";
import type { QuorumStats } from "@/lib/types";

interface StatItem {
  label: string;
  value: number;
  warning?: number;
  warningLabel?: string;
  color: string;
}

export function StatsCards({ stats }: { stats: QuorumStats }) {
  const items: StatItem[] = [
    {
      label: "Documents",
      value: stats.documents,
      warning: stats.unembedded_documents,
      warningLabel: "unembedded",
      color: "#3B82F6",
    },
    {
      label: "Events",
      value: stats.events,
      warning: stats.unembedded_events,
      warningLabel: "unembedded",
      color: "#8B5CF6",
    },
    {
      label: "Tasks",
      value: stats.tasks,
      color: "#EF4444",
    },
    {
      label: "Embeddings",
      value: stats.embeddings,
      color: "#10B981",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="py-4">
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm text-muted-foreground">{item.label}</span>
            </div>
            <div className="text-3xl font-bold tracking-tight">
              {item.value.toLocaleString()}
            </div>
            {item.warning != null && item.warning > 0 && (
              <span className="text-xs text-amber-500">
                {item.warning} {item.warningLabel}
              </span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
