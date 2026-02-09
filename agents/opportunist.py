"""The Opportunist -- discovers quick wins, reusable work, and hidden value.

Scans recent documents, events, tasks, and conversations for opportunities
that others might miss, then creates opportunity events and suggests tasks.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import psycopg2.extras

from agents.base import QuorumAgent

logger = logging.getLogger("quorum.opportunist")

_PROMPT_PATH = Path(__file__).parent / "prompts" / "opportunist.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text() if _PROMPT_PATH.exists() else ""

_DEFAULT_LOOKBACK_HOURS = 48


class OpportunistAgent(QuorumAgent):
    """Finds quick wins, reusable work, and hidden value."""

    def __init__(self, lookback_hours: int = _DEFAULT_LOOKBACK_HOURS):
        super().__init__("opportunist")
        self.lookback_hours = lookback_hours

    # ------------------------------------------------------------------
    # Data gathering
    # ------------------------------------------------------------------

    def _recent_documents(self) -> list[dict]:
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        since = datetime.now(timezone.utc) - timedelta(hours=self.lookback_hours)

        cur.execute(
            """
            SELECT id, doc_type, source, title,
                   LEFT(content, 800) AS content_preview,
                   tags, metadata, created_at
            FROM documents
            WHERE created_at >= %s
            ORDER BY created_at DESC
            LIMIT 100
            """,
            [since],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _recent_events(self) -> list[dict]:
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        since = datetime.now(timezone.utc) - timedelta(hours=self.lookback_hours)

        cur.execute(
            """
            SELECT id, event_type, actor, title, description, metadata, created_at
            FROM events
            WHERE created_at >= %s
            ORDER BY created_at DESC
            LIMIT 100
            """,
            [since],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _open_tasks(self) -> list[dict]:
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            """
            SELECT id, title, description, status, priority, owner, due_at, created_at
            FROM tasks
            WHERE status NOT IN ('done', 'cancelled')
            ORDER BY priority, created_at
            LIMIT 100
            """
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _recent_conversation_context(self) -> list[dict]:
        """Pull a sample of recent conversation content for context."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        since = datetime.now(timezone.utc) - timedelta(hours=self.lookback_hours)

        cur.execute(
            """
            SELECT ct.id, ct.role, LEFT(ct.content, 500) AS content_preview,
                   ct.created_at
            FROM conversation_turns ct
            WHERE ct.created_at >= %s
            ORDER BY ct.created_at DESC
            LIMIT 80
            """,
            [since],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # LLM interaction
    # ------------------------------------------------------------------

    def _build_payload(self) -> str:
        return json.dumps(
            {
                "documents": self._recent_documents(),
                "events": self._recent_events(),
                "tasks": self._open_tasks(),
                "conversation_context": self._recent_conversation_context(),
            },
            default=str,
        )

    def _parse_response(self, raw: str) -> list[dict]:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            result = json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("Failed to parse opportunist response: %s", raw[:200])
            return []

        if not isinstance(result, list):
            return []
        return result

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    def run(self) -> str:
        payload = self._build_payload()
        raw = self.call_llm(SYSTEM_PROMPT, payload)
        opportunities = self._parse_response(raw)

        events_created = 0
        tasks_created = 0

        for opp in opportunities:
            # Store every opportunity as an event.
            event_id = self.store_event(
                event_type="opportunity",
                title=opp.get("title", "Untitled opportunity"),
                description=opp.get("description", ""),
                metadata={
                    "effort": opp.get("effort", "unknown"),
                    "impact": opp.get("impact", "medium"),
                    "time_sensitive": opp.get("time_sensitive", False),
                },
            )
            events_created += 1

            # If the opportunity includes a concrete suggested action, create a task.
            suggested = opp.get("suggested_action")
            if suggested:
                impact = opp.get("impact", "medium")
                priority_map = {"high": 2, "medium": 3, "low": 4}
                self.upsert_task(
                    title=suggested,
                    description=(
                        f"Opportunity: {opp.get('title', '')}\n"
                        f"{opp.get('description', '')}\n"
                        f"Estimated effort: {opp.get('effort', 'unknown')}"
                    ),
                    priority=priority_map.get(impact, 3),
                    metadata={"source_event_id": event_id},
                )
                tasks_created += 1

        summary = (
            f"Found {len(opportunities)} opportunities, "
            f"created {events_created} events and {tasks_created} tasks."
        )
        logger.info(summary)
        return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    agent = OpportunistAgent()
    agent.execute()
