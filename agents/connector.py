"""The Connector -- finds hidden relationships between pieces of information.

Scans recent conversation turns that haven't been processed, searches memory
for related past documents and events, and surfaces non-obvious connections
as events.
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import psycopg2.extras

from agents.base import QuorumAgent

logger = logging.getLogger("quorum.connector")

# Load the system prompt from the prompts directory.
_PROMPT_PATH = Path(__file__).parent / "prompts" / "connector.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text() if _PROMPT_PATH.exists() else ""

# Minimum cosine-similarity score to consider a match relevant.
_MIN_SCORE = 0.35

# How many recent turns to process per run.
_BATCH_SIZE = 50


class ConnectorAgent(QuorumAgent):
    """Surfaces connections between recent conversation turns and stored memory."""

    def __init__(self):
        super().__init__("connector")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_unprocessed_turns(self, limit: int = _BATCH_SIZE) -> list[dict]:
        """Fetch recent conversation turns that the Connector has not yet examined.

        We track processing by looking at events created by this agent:
        any turn whose ID already appears in a connection event's ref_ids
        is considered processed.
        """
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            """
            SELECT ct.*
            FROM conversation_turns ct
            WHERE ct.id NOT IN (
                SELECT UNNEST(ref_ids) FROM events
                WHERE actor = 'connector' AND event_type = 'connection'
            )
            ORDER BY ct.created_at DESC
            LIMIT %s
            """,
            [limit],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _get_other_agent_context(self) -> list[dict]:
        """Fetch recent findings from other agents to inform connection-finding."""
        return self.get_other_agent_events(
            agent_names=["executor", "strategist", "devils_advocate", "opportunist"],
            hours=1,
            limit=15,
        )

    def _build_llm_payload(self, turn: dict, candidates: list[dict], other_agent_findings: list[dict] = None, flagged_for_you: list[dict] = None) -> str:
        """Assemble the user-message payload for the LLM."""
        payload = {
            "turn": {
                "id": str(turn["id"]),
                "role": turn["role"],
                "content": turn["content"],
                "created_at": turn["created_at"].isoformat() if turn.get("created_at") else None,
            },
            "candidates": [
                {
                    "ref_type": c["ref_type"],
                    "ref_id": str(c["ref_id"]),
                    "score": round(c["score"], 4),
                    "title": c.get("title", ""),
                    "content": (c.get("content") or "")[:1000],
                }
                for c in candidates
            ],
            "other_agent_findings": [
                {
                    "agent": f.get("actor", ""),
                    "event_type": f.get("event_type", ""),
                    "title": f.get("title", ""),
                    "description": (f.get("description") or "")[:500],
                    "created_at": f["created_at"].isoformat() if f.get("created_at") else None,
                }
                for f in (other_agent_findings or [])
            ],
            "flagged_for_you": [
                {
                    "agent": f.get("actor", ""),
                    "event_type": f.get("event_type", ""),
                    "title": f.get("title", ""),
                    "description": (f.get("description") or "")[:500],
                    "created_at": f["created_at"].isoformat() if f.get("created_at") else None,
                }
                for f in (flagged_for_you or [])
            ],
        }
        return json.dumps(payload, default=str)

    def _parse_llm_response(self, raw: str) -> list[dict]:
        """Parse the LLM response into a list of connection dicts."""
        # Strip markdown code fences if present.
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            connections = json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("Failed to parse LLM response as JSON: %s", raw[:200])
            return []

        if not isinstance(connections, list):
            return []
        return connections

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    def run(self) -> str:
        turns = self._get_unprocessed_turns()
        if not turns:
            logger.info("No unprocessed turns found.")
            return "No unprocessed turns."

        # Gather recent findings from other agents to enrich connection-finding.
        other_agent_findings = self._get_other_agent_context()
        if other_agent_findings:
            logger.info(
                "Loaded %d recent findings from other agents.", len(other_agent_findings)
            )

        # Check for events specifically flagged for the Connector by other agents.
        flagged_for_me = self.get_events_flagged_for_me(hours=24)
        if flagged_for_me:
            logger.info("Found %d events flagged for %s by other agents", len(flagged_for_me), self.agent_name)

        total_connections = 0
        all_connection_titles = []

        for turn in turns:
            # Search memory for content related to this turn.
            candidates = self.search_memory(
                turn["content"][:2000], limit=15, ref_type=None
            )

            # Filter out low-relevance hits and the turn itself.
            candidates = [
                c
                for c in candidates
                if c["score"] >= _MIN_SCORE and str(c["ref_id"]) != str(turn["id"])
            ]

            if not candidates:
                continue

            # Ask the LLM to find non-obvious connections, including other agents' context.
            payload = self._build_llm_payload(turn, candidates, other_agent_findings, flagged_for_me)
            raw_response = self.call_llm(SYSTEM_PROMPT, payload)
            connections = self._parse_llm_response(raw_response)

            for conn_data in connections:
                confidence = conn_data.get("confidence", 0)
                if confidence < 0.5:
                    continue

                related_ids = [str(turn["id"])] + [
                    str(rid) for rid in conn_data.get("related_ids", [])
                ]

                considered_agents = conn_data.get("considered_agents", ["strategist", "executor"])
                self.store_event(
                    event_type="connection",
                    title=conn_data.get("title", "Untitled connection"),
                    description=conn_data.get("description", ""),
                    metadata={"confidence": confidence, "source": "connector", "considered_agents": considered_agents},
                    ref_ids=related_ids,
                )
                total_connections += 1
                all_connection_titles.append(conn_data.get("title", "Untitled"))

        # Store a summary document so other agents can find what the Connector discovered.
        if all_connection_titles:
            summary_content = (
                f"Connector auto-summary: processed {len(turns)} turns, "
                f"found {total_connections} connections.\n\n"
                "Connections found:\n"
                + "\n".join(f"- {t}" for t in all_connection_titles)
            )
            self.store_document(
                doc_type="summary",
                title=f"Connector Run Summary ({datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')})",
                content=summary_content,
                metadata={"source": "connector", "connection_count": total_connections},
                tags=["connector", "auto-summary"],
            )

        summary = f"Processed {len(turns)} turns, created {total_connections} connections."
        logger.info(summary)
        return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    agent = ConnectorAgent()
    agent.execute()
