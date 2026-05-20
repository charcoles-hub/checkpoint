import os
import sqlite3

DATABASE_URL = os.getenv("DATABASE_URL")


class _PGConn:
    """sqlite3-compatible wrapper around psycopg2 so the rest of the app is unchanged."""

    def __init__(self, url: str):
        import psycopg2
        import psycopg2.extras
        from urllib.parse import urlparse, unquote

        p = urlparse(url)

        def esc(v: str) -> str:
            # Escape for key=value DSN single-quoted values (% safe here)
            return v.replace("\\", "\\\\").replace("'", "\\'")

        dsn = (
            f"host='{esc(p.hostname)}' "
            f"port={p.port or 5432} "
            f"dbname='{esc(p.path.lstrip('/'))}' "
            f"user='{esc(unquote(p.username or ''))}' "
            f"password='{esc(unquote(p.password or ''))}' "
            f"sslmode=require"
        )
        self._conn = psycopg2.connect(dsn, cursor_factory=psycopg2.extras.RealDictCursor)

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
    # Safe migrations
    for table, col, definition in [
        ("game_entries", "draft_notes", "TEXT"),
        ("game_entries", "playtime", "INTEGER"),
        ("users", "is_premium", "INTEGER NOT NULL DEFAULT 0"),
        ("users", "stripe_customer_id", "TEXT"),
        ("users", "stripe_subscription_id", "TEXT"),
        ("users", "steam_id", "TEXT"),
        ("users", "bio", "TEXT"),
        ("users", "google_id", "TEXT"),
        ("game_entries", "review", "TEXT"),
        ("users", "username_changed_at", "TIMESTAMP"),
        ("users", "avatar_color", "TEXT"),
        ("users", "avatar_icon", "TEXT"),
        ("users", "avatar_b64", "TEXT"),
        ("game_entries", "genres", "TEXT"),
        ("users", "last_steam_sync", "TIMESTAMP"),
    ]:
        try:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")
            db.commit()
        except Exception:
            pass
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id                     INTEGER PRIMARY KEY AUTOINCREMENT,
            username               TEXT UNIQUE NOT NULL,
            email                  TEXT UNIQUE NOT NULL,
            password_hash          TEXT NOT NULL,
            notify_ntfy            TEXT,
            is_premium             INTEGER NOT NULL DEFAULT 0,
            stripe_customer_id     TEXT,
            stripe_subscription_id TEXT,
            steam_id               TEXT,
            google_id              TEXT,
            created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            draft_notes TEXT,
            playtime    INTEGER,
            review      TEXT,
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
        CREATE TABLE IF NOT EXISTS follows (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(follower_id, following_id)
        );
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token      TEXT UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used       INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS suggestions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
            title      TEXT NOT NULL,
            body       TEXT,
            status     TEXT NOT NULL DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS suggestion_votes (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            suggestion_id   INTEGER NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(suggestion_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS price_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            steam_appid INTEGER NOT NULL,
            game_name   TEXT,
            price_eur   REAL NOT NULL,
            checked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS api_cache (
            key        TEXT PRIMARY KEY,
            data       TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL
        );
    """)
    db.commit()
    db.close()


def _init_pg():
    db = get_db()
    # Safe migrations for columns added after initial deploy
    migrations = [
        "ALTER TABLE game_entries ADD COLUMN IF NOT EXISTS draft_notes TEXT",
        "ALTER TABLE game_entries ADD COLUMN IF NOT EXISTS playtime INTEGER",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_id TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT",
        "ALTER TABLE game_entries ADD COLUMN IF NOT EXISTS review TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMP",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_icon TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_b64 TEXT",
        "ALTER TABLE game_entries ADD COLUMN IF NOT EXISTS genres TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_steam_sync TIMESTAMP",
    ]
    for m in migrations:
        try:
            db.execute(m)
        except Exception:
            pass
    db.commit()
    stmts = [
        """CREATE TABLE IF NOT EXISTS users (
            id                     SERIAL PRIMARY KEY,
            username               TEXT UNIQUE NOT NULL,
            email                  TEXT UNIQUE NOT NULL,
            password_hash          TEXT NOT NULL,
            notify_ntfy            TEXT,
            is_premium             INTEGER NOT NULL DEFAULT 0,
            stripe_customer_id     TEXT,
            stripe_subscription_id TEXT,
            steam_id               TEXT,
            google_id              TEXT,
            created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            draft_notes TEXT,
            playtime    INTEGER,
            review      TEXT,
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
        """CREATE TABLE IF NOT EXISTS follows (
            id           SERIAL PRIMARY KEY,
            follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(follower_id, following_id)
        )""",
        """CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id         SERIAL PRIMARY KEY,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token      TEXT UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used       INTEGER NOT NULL DEFAULT 0
        )""",
        """CREATE TABLE IF NOT EXISTS suggestions (
            id         SERIAL PRIMARY KEY,
            user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
            title      TEXT NOT NULL,
            body       TEXT,
            status     TEXT NOT NULL DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS suggestion_votes (
            id              SERIAL PRIMARY KEY,
            suggestion_id   INTEGER NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(suggestion_id, user_id)
        )""",
        """CREATE TABLE IF NOT EXISTS price_history (
            id          SERIAL PRIMARY KEY,
            steam_appid INTEGER NOT NULL,
            game_name   TEXT,
            price_eur   REAL NOT NULL,
            checked_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""",
    ]
    for stmt in stmts:
        db.execute(stmt)
    db.commit()
    db.close()
