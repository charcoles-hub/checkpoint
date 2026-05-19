import os
import sqlite3

DATABASE_URL = os.getenv("DATABASE_URL")


class _PGConn:
    """sqlite3-compatible wrapper around psycopg2 so the rest of the app is unchanged."""

    def __init__(self, url: str):
        import psycopg2
        import psycopg2.extras
        from urllib.parse import urlparse, unquote
        # Parse URL manually so special chars in password (^, %) work correctly
        p = urlparse(url)
        self._conn = psycopg2.connect(
            host=p.hostname,
            port=p.port or 5432,
            dbname=p.path.lstrip('/'),
            user=unquote(p.username or ''),
            password=unquote(p.password or ''),
            sslmode="require",
            cursor_factory=psycopg2.extras.RealDictCursor
        )

    def execute(self, sql: str, params=()):
        sql = sql.replace("?", "%s")
        cur = self._conn.cursor()
        cur.execute(sql, params or ())
        return cur

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def get_db():
    if DATABASE_URL:
        return _PGConn(DATABASE_URL)
    conn = sqlite3.connect(os.getenv("DB_PATH", "gametracker.db"))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    if DATABASE_URL:
        _init_pg()
    else:
        _init_sqlite()


def _init_sqlite():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            email         TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            notify_ntfy   TEXT,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS game_entries (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            steam_appid INTEGER NOT NULL,
            game_name   TEXT NOT NULL,
            game_image  TEXT,
            status      TEXT NOT NULL DEFAULT 'wishlist',
            rating      INTEGER CHECK(rating BETWEEN 1 AND 10),
            notes       TEXT,
            added_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, steam_appid)
        );
        CREATE TABLE IF NOT EXISTS price_alerts (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            steam_appid   INTEGER NOT NULL,
            game_name     TEXT NOT NULL,
            game_image    TEXT,
            target_price  REAL NOT NULL,
            current_price REAL,
            triggered     INTEGER NOT NULL DEFAULT 0,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            triggered_at  TIMESTAMP,
            UNIQUE(user_id, steam_appid)
        );
    """)
    db.commit()
    db.close()


def _init_pg():
    db = get_db()
    stmts = [
        """CREATE TABLE IF NOT EXISTS users (
            id            SERIAL PRIMARY KEY,
            username      TEXT UNIQUE NOT NULL,
            email         TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            notify_ntfy   TEXT,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS game_entries (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            steam_appid INTEGER NOT NULL,
            game_name   TEXT NOT NULL,
            game_image  TEXT,
            status      TEXT NOT NULL DEFAULT 'wishlist',
            rating      INTEGER CHECK(rating BETWEEN 1 AND 10),
            notes       TEXT,
            added_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, steam_appid)
        )""",
        """CREATE TABLE IF NOT EXISTS price_alerts (
            id            SERIAL PRIMARY KEY,
            user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            steam_appid   INTEGER NOT NULL,
            game_name     TEXT NOT NULL,
            game_image    TEXT,
            target_price  REAL NOT NULL,
            current_price REAL,
            triggered     INTEGER NOT NULL DEFAULT 0,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            triggered_at  TIMESTAMP,
            UNIQUE(user_id, steam_appid)
        )""",
    ]
    for stmt in stmts:
        db.execute(stmt)
    db.commit()
    db.close()
