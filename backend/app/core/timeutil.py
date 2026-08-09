"""Time helpers.

The whole application stores UTC timestamps. Database ``DateTime`` columns are
kept timezone-naive so values round-trip cleanly through both SQLite
(dev/tests — its dialect cannot parse ``+00:00`` offsets) and PostgreSQL
(production — naive ``timestamp without time zone``). We therefore work in
naive UTC internally and only produce explicit offsets in audit output.
"""

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Current UTC time as a timezone-naive datetime (safe for DB storage)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utcnow_aware() -> datetime:
    """Current UTC time as a timezone-aware datetime (for logs/claims)."""
    return datetime.now(timezone.utc)
