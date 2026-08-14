"""Verification-only: reset E2E state rows in the verification PostgreSQL DB.

Deletes scans + dependent predictions for the E2E users so smoke suites can
run idempotently against a unique-file-hash constraint. Only touches rows
owned by the E2E users; never real data.
"""
import asyncio
import sys

import asyncpg


async def main() -> None:
    conn = await asyncpg.connect(
        host="127.0.0.1", port=5433, user="mediscan",
        password="mediscan", database="mediscan",
    )
    try:
        e2e_users = ("doctore2e", "staffe2e", "locktest", "ratetest",
                     "mprate", "mplock", "mpuser", "mpuser2")
        for username in e2e_users:
            uid = await conn.fetchval(
                "SELECT id FROM users WHERE username = $1", username
            )
            if not uid:
                continue
            scan_ids = await conn.fetch(
                "SELECT id FROM scans WHERE uploaded_by = $1", uid
            )
            for row in scan_ids:
                await conn.execute(
                    "DELETE FROM predictions WHERE scan_id = $1", row["id"]
                )
            await conn.execute(
                "DELETE FROM scans WHERE uploaded_by = $1", uid
            )
            print(f"  cleaned scans/predictions for {username} (uid={uid})")
        await conn.execute("TRUNCATE refresh_sessions")
        print("  truncated refresh_sessions")
    finally:
        await conn.close()


asyncio.run(main())
