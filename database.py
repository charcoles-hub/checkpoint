import sqlite3
import os

DB = os.getenv("DB_PATH", "gametracker.db")


def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
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
