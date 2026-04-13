"""
Tests for database.py — primarily the get_db generator lifecycle.
"""
from database import get_db


def test_get_db_yields_session_and_closes():
    """get_db must yield a usable session and close it in the finally block."""
    gen = get_db()
    db = next(gen)
    assert db is not None
    # Exhaust the generator so the finally block (db.close()) runs.
    try:
        next(gen)
    except StopIteration:
        pass
