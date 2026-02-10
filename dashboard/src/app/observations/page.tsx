import { listObservations } from '@/lib/db';
import { ObservationsList } from '@/components/observations-list';
import type { QuorumObservation } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Observations - The Quorum',
  description: 'View and manage agent observations including critiques, risks, insights, and recommendations.',
};

export default async function ObservationsPage() {
  const observations = await listObservations({ limit: 200 });

  // Extract unique agent names from observations
  const allAgents = Array.from(
    new Set(observations.map((obs) => obs.source_agent))
  ).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Observations</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Agent outputs including critiques, risks, insights, and recommendations
          </p>
        </div>
      </div>

      {/* Observations List */}
      <ObservationsList
        initialObservations={observations as QuorumObservation[]}
        allAgents={allAgents}
      />
    </div>
  );
}
