"""The Strategist -- periodic reflection and pattern recognition.

Performs daily or weekly reflections over recent memory, identifies recurring
themes, blocked work, and strategic misalignment, then writes reflection
documents back into the memory system.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import psycopg2.extras

from agents.base import QuorumAgent

logger = logging.getLogger("quorum.strategist")

_PROMPT_PATH = Path(__file__).parent / "prompts" / "strategist.txt"
SYSTEM_PROMPT = _PROMPT_PATH.read_text() if _PROMPT_PATH.exists() else ""

# Lookback windows for each reflection type.
_DAILY_HOURS = 24
_WEEKLY_HOURS = 168  # 7 days


class StrategistAgent(QuorumAgent):
    """Produces strategic reflections over recent memory activity."""

    def __init__(self, reflection_type: str = "daily"):
        super().__init__("strategist")
        if reflection_type not in ("daily", "weekly"):
            raise ValueError(f"reflection_type must be 'daily' or 'weekly', got '{reflection_type}'")
        self.reflection_type = reflection_type
        self.lookback_hours = _DAILY_HOURS if reflection_type == "daily" else _WEEKLY_HOURS

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
                   LEFT(content, 500) AS content_preview,
                   tags, created_at
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
            SELECT id, event_type, actor, title, description, created_at
            FROM events
            WHERE created_at >= %s
            ORDER BY created_at DESC
            LIMIT 200
            """,
            [since],
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _task_snapshot(self) -> list[dict]:
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cur.execute(
            """
            SELECT id, title, status, priority, owner, due_at, created_at, updated_at
            FROM tasks
            WHERE status NOT IN ('done', 'cancelled')
            ORDER BY priority, created_at
            LIMIT 200
            """
        )
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]

    def _conversation_summaries(self) -> list[dict]:
        """Get a brief summary of each conversation in the window."""
        conn = self.connect_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        since = datetime.now(timezone.utc) - timedelta(hours=self.lookback_hours)

        cur.execute(
            """
            SELECT c.id, c.title, c.source, c.created_at,
                   COUNT(ct.id) AS turn_count,
                   MAX(ct.created_at) AS last_turn_at
            FROM conversations c
            LEFT JOIN conversation_turns ct ON ct.conversation_id = c.id
            WHERE c.created_at >= %s
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT 50
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
        documents = self._recent_documents()
        events = self._recent_events()
        tasks = self._task_snapshot()
        conversations = self._conversation_summaries()

        return json.dumps(
            {
                "reflection_type": self.reflection_type,
                "period_hours": self.lookback_hours,
                "documents": documents,
                "events": events,
                "tasks": tasks,
                "conversations": conversations,
            },
            default=str,
        )

    def _parse_response(self, raw: str) -> dict:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("Failed to parse strategist response: %s", raw[:200])
            return {}

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    def run(self) -> str:
        payload = self._build_payload()
        raw = self.call_llm(SYSTEM_PROMPT, payload)
        parsed = self._parse_response(raw)

        if not parsed:
            return "LLM returned no parseable reflection."

        # Build the reflection document content.
        title = parsed.get("title", f"{self.reflection_type.capitalize()} Reflection")
        observations = parsed.get("observations", [])
        blocked = parsed.get("blocked_items", [])
        focus = parsed.get("suggested_focus", [])

        lines = [f"# {title}\n"]

        if observations:
            lines.append("## Observations\n")
            for obs in observations:
                lines.append(f"**{obs.get('theme', 'Observation')}**: {obs.get('detail', '')}")
                if obs.get("evidence"):
                    lines.append(f"  Evidence: {obs['evidence']}")
                lines.append("")

        if blocked:
            lines.append("## Blocked Items\n")
            for b in blocked:
                lines.append(f"- **{b.get('title', 'Unknown')}**: {b.get('hypothesis', '')}")
            lines.append("")

        if focus:
            lines.append("## Suggested Focus\n")
            for f_item in focus:
                lines.append(f"- {f_item}")
            lines.append("")

        content = "\n".join(lines)

        # Store as a reflection document.
        doc_id = self.store_document(
            doc_type="reflection",
            title=title,
            content=content,
            metadata={
                "reflection_type": self.reflection_type,
                "observation_count": len(observations),
                "blocked_count": len(blocked),
            },
            tags=[self.reflection_type, "reflection", "strategist"],
        )

        # Also store as an insight event for visibility.
        self.store_event(
            event_type="insight",
            title=title,
            description=content[:2000],
            metadata={"document_id": doc_id, "reflection_type": self.reflection_type},
        )

        summary = (
            f"Created {self.reflection_type} reflection with "
            f"{len(observations)} observations, {len(blocked)} blocked items, "
            f"{len(focus)} focus areas."
        )
        logger.info(summary)
        return summary


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Run the Strategist agent")
    parser.add_argument(
        "--type",
        choices=["daily", "weekly"],
        default="daily",
        help="Reflection type (default: daily)",
    )
    args = parser.parse_args()

    agent = StrategistAgent(reflection_type=args.type)
    agent.execute()
