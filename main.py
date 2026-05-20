import asyncio
import os
import re
import secrets
import stripe
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Depends, HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
import httpx
from dotenv import load_dotenv
from database import get_db, init_db
from auth import hash_pw, verify_pw, make_token, current_user, require_auth
from alerts import check_alerts, check_wishlist_prices

load_dotenv()

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv("RESEND_FROM", "Checkpoint <noreply@mycheckpoint.games>")

def send_email(to: str, subject: str, body: str):
    if not RESEND_API_KEY:
        print(f"[email] Resend not configured. Would send to {to}: {subject}")
        return
    try:
        import resend as _resend
        _resend.api_key = RESEND_API_KEY
        _resend.Emails.send({
            "from": RESEND_FROM,
            "to": [to],
            "subject": subject,
            "text": body,
        })
    except ImportError:
        print("[email] resend package not installed. Run: pip install resend")


def get_real_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=get_real_ip)

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
APP_URL = os.getenv("APP_URL", "https://mycheckpoint.games")
STEAM_API_KEY = os.getenv("STEAM_API_KEY", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "")
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    asyncio.create_task(alert_loop())
    asyncio.create_task(wishlist_price_loop())
    yield


app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; "
            "img-src 'self' https://cdn.akamai.steamstatic.com https://media.steampowered.com "
            "https://steamcdn-a.akamaihd.net https://shared.steamstatic.com data: blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)

STEAM = "https://store.steampowered.com/api"
STEAMSPY = "https://steamspy.com/api.php"
CDN = "https://cdn.akamai.steamstatic.com/steam/apps"


def img(appid): return f"{CDN}/{appid}/header.jpg"

def fmt_price(po):
    if not po: return None
    return po.get("final_formatted") or f"{po['final']/100:.2f}€"

def raw_price(po):
    if not po: return None
    return po["final"] / 100

def fmt_spy_price(g):
    try:
        price = int(g.get("price") or 0)
    except (ValueError, TypeError):
        return None
    if price == 0: return "Gratis"
    disc = int(g.get("discount") or 0)
    formatted = f"{price / 100:.2f}€"
    return f"-{disc}% {formatted}" if disc else formatted

def platforms(p: dict):
    m = {"windows": "PC", "mac": "Mac", "linux": "Linux"}
    return [m[k] for k, v in p.items() if v and k in m]


async def get(url, params=None):
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
        r = await c.get(url, params=params)
        r.raise_for_status()
        return r.json()


# ── Games ──────────────────────────────────────────────
@app.get("/api/games")
async def list_games(search: str = "", page: int = 1):
    if search:
        data = await get(f"{STEAM}/storesearch/", {"term": search, "l": "english", "cc": "US"})
        return {"results": [
            {"id": g["id"], "name": g["name"],
             "image": g.get("tiny_image") or img(g["id"]),
             "platforms": platforms(g.get("platforms", {})),
             "price": fmt_price(g.get("price"))}
            for g in data.get("items", []) if g.get("type") == "app"
        ], "count": data.get("total", 0)}

    data = await get(STEAMSPY, {"request": "top100in2weeks"})
    all_g = list(data.values())
    ps = 24; s = (page - 1) * ps
    return {"results": [
        {"id": g["appid"], "name": g["name"], "image": img(g["appid"]),
         "playtime": round(g.get("average_forever", 0) / 60, 1),
         "price": fmt_spy_price(g)}
        for g in all_g[s:s + ps]
    ], "count": len(all_g)}


@app.get("/api/games/{game_id}")
async def game_detail(game_id: int):
    data = await get(f"{STEAM}/appdetails", {"appids": game_id, "l": "english", "cc": "es"})
    entry = data.get(str(game_id), {})
    if not entry.get("success"):
        raise HTTPException(404, "Juego no encontrado")
    g = entry["data"]
    po = g.get("price_overview")
    return {
        "id": game_id,
        "name": g.get("name"),
        "description": g.get("short_description", ""),
        "image": img(game_id),
        "genres": [x["description"] for x in g.get("genres", [])],
        "platforms": [k for k, v in g.get("platforms", {}).items() if v],
        "metacritic": g.get("metacritic", {}).get("score"),
        "release_date": g.get("release_date", {}).get("date"),
        "developers": g.get("developers", []),
        "price": fmt_price(po) or "Gratis",
        "price_eur": raw_price(po),
        "discount": po.get("discount_percent") if po else None,
    }


# ── Auth ───────────────────────────────────────────────
class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    email: str = Field(max_length=254)
    password: str = Field(min_length=6, max_length=128)

class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


@app.post("/api/auth/register")
@limiter.limit("5/minute")
def register(request: Request, body: RegisterIn):
    if len(body.password) < 6:
        raise HTTPException(400, "La contraseña debe tener al menos 6 caracteres")
    db = get_db()
    if db.execute("SELECT id FROM users WHERE email=? OR LOWER(username)=LOWER(?)", (body.email, body.username)).fetchone():
        db.close(); raise HTTPException(400, "Email o usuario ya en uso")
    db.execute("INSERT INTO users (username, email, password_hash) VALUES (?,?,?)",
               (body.username, body.email, hash_pw(body.password)))
    db.commit()
    user = dict(db.execute("SELECT * FROM users WHERE email=?", (body.email,)).fetchone())
    db.close()
    return {"token": make_token(user["id"]), "user": _pub(user)}


@app.post("/api/auth/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginIn):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE email=?", (body.email,)).fetchone()
    db.close()
    if not row or not verify_pw(body.password, row["password_hash"]):
        raise HTTPException(401, "Email o contraseña incorrectos")
    user = dict(row)
    return {"token": make_token(user["id"]), "user": _pub(user)}


class ForgotIn(BaseModel):
    email: str = Field(max_length=254)

class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=6, max_length=128)


@app.post("/api/auth/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, body: ForgotIn):
    db = get_db()
    try:
        row = db.execute("SELECT id, email FROM users WHERE email=?", (body.email,)).fetchone()
        if not row:
            return {"ok": True}  # No revelar si el email existe
        token = secrets.token_urlsafe(32)
        expires = datetime.utcnow() + timedelta(hours=1)
        db.execute(
            "DELETE FROM password_reset_tokens WHERE user_id=?", (row["id"],)
        )
        db.execute(
            "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?,?,?)",
            (row["id"], token, expires.isoformat())
        )
        db.commit()
    finally:
        db.close()
    reset_url = f"{APP_URL}/reset-password?token={token}"
    send_email(
        body.email,
        "Restablecer contraseña · Checkpoint",
        f"Hola,\n\nHaz clic en este enlace para crear una nueva contraseña:\n{reset_url}\n\nExpira en 1 hora. Si no lo pediste, ignora este email.\n\nCheckpoint"
    )
    return {"ok": True}


@app.post("/api/auth/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, body: ResetIn):
    db = get_db()
    try:
        row = db.execute(
            "SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token=?",
            (body.token,)
        ).fetchone()
        if not row or row["used"]:
            raise HTTPException(400, "Enlace inválido o ya utilizado")
        if datetime.utcnow() > datetime.fromisoformat(str(row["expires_at"])):
            raise HTTPException(400, "El enlace ha expirado. Solicita uno nuevo")
        db.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_pw(body.password), row["user_id"]))
        db.execute("UPDATE password_reset_tokens SET used=1 WHERE token=?", (body.token,))
        db.commit()
    finally:
        db.close()
    return {"ok": True}


@app.get("/api/auth/me")
def me(user=Depends(require_auth)):
    return _pub(user)


class ProfileIn(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    bio: str = Field(default="", max_length=160)

@app.patch("/api/auth/profile")
@limiter.limit("10/minute")
def update_profile(request: Request, body: ProfileIn, user=Depends(require_auth)):
    db = get_db()
    username_changing = body.username != user["username"]
    if username_changing:
        existing = db.execute("SELECT id FROM users WHERE LOWER(username)=LOWER(?) AND id!=?", (body.username, user["id"])).fetchone()
        if existing:
            db.close()
            raise HTTPException(409, "Ese nombre de usuario ya está en uso")
        changed_at = _parse_dt(user.get("username_changed_at"))
        if changed_at and (datetime.now(timezone.utc) - changed_at) < timedelta(days=7):
            next_change = changed_at + timedelta(days=7)
            db.close()
            raise HTTPException(429, f"Puedes cambiar tu nombre de nuevo el {next_change.strftime('%d/%m/%Y')}")
    if username_changing:
        db.execute("UPDATE users SET username=?, bio=?, username_changed_at=CURRENT_TIMESTAMP WHERE id=?", (body.username, body.bio, user["id"]))
    else:
        db.execute("UPDATE users SET bio=? WHERE id=?", (body.bio, user["id"]))
    db.commit(); db.close()
    changed_at_new = datetime.now(timezone.utc).isoformat() if username_changing else _dt_str(user.get("username_changed_at"))
    return _pub({**user, "username": body.username, "bio": body.bio, "username_changed_at": changed_at_new})

@app.patch("/api/auth/settings")
def update_settings(body: dict, user=Depends(require_auth)):
    allowed = {"notify_ntfy", "steam_id"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates: raise HTTPException(400, "Nada que actualizar")
    db = get_db()
    sets = ", ".join(f"{k}=?" for k in updates)
    db.execute(f"UPDATE users SET {sets} WHERE id=?", (*updates.values(), user["id"]))
    db.commit(); db.close()
    return {"ok": True}


def _pub(u): return {"id": u["id"], "username": u["username"], "email": u["email"], "notify_ntfy": u.get("notify_ntfy"), "is_premium": bool(u.get("is_premium", 0)), "steam_id": u.get("steam_id"), "bio": u.get("bio") or "", "username_changed_at": _dt_str(u.get("username_changed_at"))}


def _parse_dt(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.replace(tzinfo=timezone.utc) if val.tzinfo is None else val
    try:
        return datetime.fromisoformat(str(val)).replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _dt_str(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


def _unique_username(db, base: str) -> str:
    base = re.sub(r'[^a-zA-Z0-9_]', '', base)[:20] or "user"
    username = base
    n = 1
    while db.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone():
        username = f"{base}{n}"
        n += 1
    return username


# ── Public profiles ────────────────────────────────────
@app.get("/api/users/search")
def search_users(q: str = "", user=Depends(current_user)):
    if len(q) < 2:
        return []
    db = get_db()
    exclude_id = user["id"] if user else -1
    rows = db.execute(
        "SELECT id, username FROM users WHERE username LIKE ? AND id != ? LIMIT 10",
        (f"%{q}%", exclude_id)
    ).fetchall()
    results = []
    for row in [dict(r) for r in rows]:
        count = db.execute("SELECT COUNT(*) as c FROM game_entries WHERE user_id=?", (row["id"],)).fetchone()
        row["total_games"] = count["c"] if count else 0
        if user:
            f = db.execute("SELECT COUNT(*) as c FROM follows WHERE follower_id=? AND following_id=?", (user["id"], row["id"])).fetchone()
            row["is_following"] = (f["c"] > 0) if f else False
        else:
            row["is_following"] = False
        results.append(row)
    db.close()
    return results


@app.get("/api/users/{username}")
def public_profile(username: str, user=Depends(current_user)):
    db = get_db()
    target = db.execute("SELECT id, username, created_at FROM users WHERE username=?", (username,)).fetchone()
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    target = dict(target)
    entries = db.execute(
        "SELECT * FROM game_entries WHERE user_id=? ORDER BY added_at DESC", (target["id"],)
    ).fetchall()
    entries = [dict(e) for e in entries]
    played = [e for e in entries if e["status"] == "played"]
    rated  = [e for e in played if e["rating"]]
    best = max(rated, key=lambda e: e["rating"]) if rated else None
    stats = {
        "total": len(entries),
        "played": len(played),
        "playing": sum(1 for e in entries if e["status"] == "playing"),
        "wishlist": sum(1 for e in entries if e["status"] == "wishlist"),
        "abandoned": sum(1 for e in entries if e["status"] == "abandoned"),
        "avg_rating": round(sum(e["rating"] for e in rated) / len(rated), 1) if rated else None,
        "total_playtime": sum(e["playtime"] or 0 for e in entries),
        "best_game": best["game_name"] if best else None,
        "best_rating": best["rating"] if best else None,
    }
    followers_count = db.execute("SELECT COUNT(*) as c FROM follows WHERE following_id=?", (target["id"],)).fetchone()["c"]
    following_count = db.execute("SELECT COUNT(*) as c FROM follows WHERE follower_id=?", (target["id"],)).fetchone()["c"]
    is_following = False
    is_own = user is not None and user["id"] == target["id"]
    if user and not is_own:
        f = db.execute("SELECT COUNT(*) as c FROM follows WHERE follower_id=? AND following_id=?", (user["id"], target["id"])).fetchone()
        is_following = (f["c"] > 0) if f else False
    db.close()
    return {
        "user": {**target, "followers": followers_count, "following": following_count},
        "entries": entries, "stats": stats,
        "is_following": is_following, "is_own": is_own,
    }


# ── Follow system ─────────────────────────────────────
@app.post("/api/follow/{username}")
def follow_user(username: str, user=Depends(require_auth)):
    db = get_db()
    target = db.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    if target["id"] == user["id"]:
        raise HTTPException(400, "No puedes seguirte a ti mismo")
    db.execute(
        "INSERT INTO follows (follower_id, following_id) VALUES (?,?) ON CONFLICT(follower_id, following_id) DO NOTHING",
        (user["id"], target["id"])
    )
    db.commit(); db.close()
    return {"ok": True}


@app.delete("/api/follow/{username}")
def unfollow_user(username: str, user=Depends(require_auth)):
    db = get_db()
    target = db.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    if not target:
        raise HTTPException(404, "Usuario no encontrado")
    db.execute("DELETE FROM follows WHERE follower_id=? AND following_id=?", (user["id"], target["id"]))
    db.commit(); db.close()
    return {"ok": True}


@app.get("/api/following")
def get_following(user=Depends(require_auth)):
    db = get_db()
    following = db.execute("""
        SELECT u.id, u.username FROM follows f
        JOIN users u ON u.id = f.following_id
        WHERE f.follower_id=? ORDER BY f.created_at DESC
    """, (user["id"],)).fetchall()
    following = [dict(u) for u in following]
    feed = []
    if following:
        ids = [u["id"] for u in following]
        placeholders = ",".join("?" * len(ids))
        rows = db.execute(f"""
            SELECT ge.*, u.username as player
            FROM game_entries ge JOIN users u ON u.id = ge.user_id
            WHERE ge.user_id IN ({placeholders})
            ORDER BY ge.added_at DESC LIMIT 30
        """, ids).fetchall()
        feed = [dict(r) for r in rows]
    db.close()
    return {"following": following, "feed": feed}


# ── Community ranking ──────────────────────────────────
@app.get("/api/ranking")
def ranking():
    db = get_db()
    rows = db.execute("""
        SELECT steam_appid, game_name, game_image,
               ROUND(AVG(rating), 1) as avg_rating,
               COUNT(*) as votes
        FROM game_entries
        WHERE rating IS NOT NULL AND status = 'played'
        GROUP BY steam_appid, game_name, game_image
        ORDER BY avg_rating DESC, votes DESC
        LIMIT 50
    """).fetchall()
    db.close()
    return [dict(r) for r in rows]


# ── Suggestions (roadmap) ─────────────────────────────
class SuggestionIn(BaseModel):
    title: str = Field(min_length=5, max_length=100)
    body: str | None = Field(None, max_length=500)


@app.get("/api/suggestions")
def list_suggestions(user=Depends(current_user)):
    db = get_db()
    rows = db.execute("""
        SELECT s.id, s.title, s.body, s.status, s.created_at,
               u.username as author,
               (SELECT COUNT(*) FROM suggestion_votes sv WHERE sv.suggestion_id = s.id) as votes
        FROM suggestions s
        LEFT JOIN users u ON u.id = s.user_id
        ORDER BY votes DESC, s.created_at DESC
    """).fetchall()
    user_votes = set()
    if user:
        voted = db.execute(
            "SELECT suggestion_id FROM suggestion_votes WHERE user_id=?", (user["id"],)
        ).fetchall()
        user_votes = {r["suggestion_id"] for r in voted}
    db.close()
    is_admin = bool(ADMIN_USERNAME and user and user.get("username") == ADMIN_USERNAME)
    return {
        "is_admin": is_admin,
        "suggestions": [{**dict(r), "voted": r["id"] in user_votes} for r in rows],
    }


@app.post("/api/suggestions")
@limiter.limit("5/hour")
def create_suggestion(request: Request, body: SuggestionIn, user=Depends(require_auth)):
    db = get_db()
    db.execute(
        "INSERT INTO suggestions (user_id, title, body) VALUES (?,?,?)",
        (user["id"], body.title.strip(), body.body.strip() if body.body else None),
    )
    db.commit(); db.close()
    return {"ok": True}


@app.post("/api/suggestions/{sid}/vote")
@limiter.limit("120/minute")
def toggle_vote(request: Request, sid: int, user=Depends(require_auth)):
    db = get_db()
    existing = db.execute(
        "SELECT id FROM suggestion_votes WHERE suggestion_id=? AND user_id=?", (sid, user["id"])
    ).fetchone()
    if existing:
        db.execute("DELETE FROM suggestion_votes WHERE suggestion_id=? AND user_id=?", (sid, user["id"]))
        voted = False
    else:
        db.execute("INSERT INTO suggestion_votes (suggestion_id, user_id) VALUES (?,?)", (sid, user["id"]))
        voted = True
    db.commit()
    count = db.execute(
        "SELECT COUNT(*) as c FROM suggestion_votes WHERE suggestion_id=?", (sid,)
    ).fetchone()["c"]
    db.close()
    return {"voted": voted, "count": count}


@app.patch("/api/suggestions/{sid}")
def update_suggestion(sid: int, body: dict, user=Depends(require_auth)):
    if not ADMIN_USERNAME or user.get("username") != ADMIN_USERNAME:
        raise HTTPException(403, "No autorizado")
    status = body.get("status", "open")
    if status not in ("open", "planned", "done"):
        raise HTTPException(400, "Estado inválido")
    db = get_db()
    db.execute("UPDATE suggestions SET status=? WHERE id=?", (status, sid))
    db.commit(); db.close()
    return {"ok": True}


# ── Game list ──────────────────────────────────────────
class EntryIn(BaseModel):
    steam_appid: int
    game_name: str
    game_image: str | None = None
    status: str = "wishlist"
    rating: int | None = None
    notes: str | None = None
    draft_notes: str | None = None
    review: str | None = None


@app.get("/api/list")
def get_list(user=Depends(require_auth)):
    db = get_db()
    rows = db.execute("SELECT * FROM game_entries WHERE user_id=? ORDER BY added_at DESC", (user["id"],)).fetchall()
    db.close()
    return [dict(r) for r in rows]


@app.get("/api/list/{appid}")
def get_entry(appid: int, user=Depends(require_auth)):
    db = get_db()
    row = db.execute("SELECT * FROM game_entries WHERE user_id=? AND steam_appid=?", (user["id"], appid)).fetchone()
    db.close()
    return dict(row) if row else None


@app.post("/api/list")
def add_to_list(body: EntryIn, user=Depends(require_auth)):
    db = get_db()
    db.execute("""
        INSERT INTO game_entries (user_id, steam_appid, game_name, game_image, status, rating, notes, draft_notes, review)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id, steam_appid) DO UPDATE SET
            status=excluded.status, rating=excluded.rating, notes=excluded.notes,
            draft_notes=COALESCE(excluded.draft_notes, game_entries.draft_notes),
            review=COALESCE(excluded.review, game_entries.review)
    """, (user["id"], body.steam_appid, body.game_name, body.game_image, body.status, body.rating, body.notes, body.draft_notes, body.review))
    db.commit(); db.close()
    return {"ok": True}


@app.patch("/api/list/{appid}/review")
@limiter.limit("30/minute")
def save_review(request: Request, appid: int, body: dict, user=Depends(require_auth)):
    review = (body.get("review") or "").strip()[:2000] or None
    db = get_db()
    db.execute("UPDATE game_entries SET review=? WHERE user_id=? AND steam_appid=?", (review, user["id"], appid))
    db.commit(); db.close()
    return {"ok": True}


@app.get("/api/games/{appid}/reviews")
def get_game_reviews(appid: int):
    db = get_db()
    rows = db.execute("""
        SELECT ge.review, ge.rating, ge.added_at, u.username
        FROM game_entries ge JOIN users u ON ge.user_id = u.id
        WHERE ge.steam_appid=? AND ge.review IS NOT NULL AND ge.review != ''
        ORDER BY ge.added_at DESC LIMIT 20
    """, (appid,)).fetchall()
    db.close()
    return [dict(r) for r in rows]


@app.delete("/api/list/{appid}")
def remove_from_list(appid: int, user=Depends(require_auth)):
    db = get_db()
    db.execute("DELETE FROM game_entries WHERE user_id=? AND steam_appid=?", (user["id"], appid))
    db.commit(); db.close()
    return {"ok": True}


@app.get("/api/stats/me")
def my_stats(user=Depends(require_auth)):
    db = get_db()
    rows = db.execute(
        "SELECT status, rating, added_at, playtime, game_name FROM game_entries WHERE user_id=?",
        (user["id"],)
    ).fetchall()
    entries = [dict(r) for r in rows]
    db.close()

    rated = [e for e in entries if e.get("rating")]

    rating_hist = {}
    for e in rated:
        r = e["rating"]
        rating_hist[r] = rating_hist.get(r, 0) + 1

    now = datetime.utcnow()
    months = []
    for i in range(11, -1, -1):
        year, month = now.year, now.month - i
        while month <= 0:
            month += 12; year -= 1
        month_str = f"{year:04d}-{month:02d}"
        count = sum(1 for e in entries if (e.get("added_at") or "")[:7] == month_str)
        months.append({"month": month_str, "count": count})

    top_played = sorted(
        [e for e in entries if (e.get("playtime") or 0) > 0],
        key=lambda e: e["playtime"], reverse=True
    )[:5]

    from collections import Counter
    status_counts = dict(Counter(e["status"] for e in entries))

    return {
        "total": len(entries),
        "status_counts": status_counts,
        "avg_rating": round(sum(e["rating"] for e in rated) / len(rated), 1) if rated else None,
        "rating_histogram": [{"rating": r, "count": rating_hist[r]} for r in sorted(rating_hist)],
        "monthly": months,
        "total_playtime": sum(e.get("playtime") or 0 for e in entries),
        "top_played": [{"game_name": e["game_name"], "playtime": e["playtime"]} for e in top_played],
    }


# ── Price alerts ───────────────────────────────────────
class AlertIn(BaseModel):
    steam_appid: int
    game_name: str
    game_image: str | None = None
    target_price: float


@app.get("/api/alerts")
def get_alerts(user=Depends(require_auth)):
    db = get_db()
    rows = db.execute("SELECT * FROM price_alerts WHERE user_id=? ORDER BY created_at DESC", (user["id"],)).fetchall()
    db.close()
    return [dict(r) for r in rows]


FREE_ALERT_LIMIT = 3

@app.post("/api/alerts")
def set_alert(body: AlertIn, user=Depends(require_auth)):
    if body.target_price <= 0:
        raise HTTPException(400, "El precio objetivo debe ser mayor que 0")
    if body.target_price > 9999:
        raise HTTPException(400, "El precio objetivo no puede superar 9999€")
    db = get_db()
    try:
        if not user.get("is_premium"):
            count = db.execute(
                "SELECT COUNT(*) as c FROM price_alerts WHERE user_id=? AND triggered=0", (user["id"],)
            ).fetchone()
            if count["c"] >= FREE_ALERT_LIMIT:
                raise HTTPException(403, f"Límite de {FREE_ALERT_LIMIT} alertas gratuitas alcanzado. Hazte Premium para añadir más.")
        db.execute("""
            INSERT INTO price_alerts (user_id, steam_appid, game_name, game_image, target_price)
            VALUES (?,?,?,?,?)
            ON CONFLICT(user_id, steam_appid) DO UPDATE SET
                target_price=excluded.target_price, triggered=0, triggered_at=NULL
        """, (user["id"], body.steam_appid, body.game_name, body.game_image, body.target_price))
        db.commit()
    finally:
        db.close()
    return {"ok": True}


@app.delete("/api/alerts/{appid}")
def delete_alert(appid: int, user=Depends(require_auth)):
    db = get_db()
    db.execute("DELETE FROM price_alerts WHERE user_id=? AND steam_appid=?", (user["id"], appid))
    db.commit(); db.close()
    return {"ok": True}


@app.get("/api/games/{appid}/price-history")
def price_history(appid: int, user=Depends(require_auth)):
    if not user.get("is_premium"):
        raise HTTPException(403, "Feature exclusiva de Premium")
    db = get_db()
    rows = db.execute(
        "SELECT price_eur AS price, checked_at AS date FROM price_history "
        "WHERE steam_appid=? ORDER BY checked_at ASC",
        (appid,)
    ).fetchall()
    db.close()
    return {"history": [dict(r) for r in rows], "source": "internal"}


# ── Google OAuth ──────────────────────────────────────
@app.get("/api/auth/google")
async def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google login no configurado")
    from urllib.parse import urlencode
    from fastapi.responses import RedirectResponse
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": f"{APP_URL}/api/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
    }
    return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params))


@app.get("/api/auth/google/callback")
async def google_callback(code: str = "", error: str = ""):
    from fastapi.responses import RedirectResponse
    if error or not code:
        return RedirectResponse(f"{APP_URL}/?auth_error=cancelled")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_resp = await client.post("https://oauth2.googleapis.com/token", data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": f"{APP_URL}/api/auth/google/callback",
                "grant_type": "authorization_code",
            })
            token_data = token_resp.json()
            access_token = token_data.get("access_token")
            if not access_token:
                return RedirectResponse(f"{APP_URL}/?auth_error=google_failed")
            user_resp = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            google_user = user_resp.json()
    except Exception as e:
        print(f"[google_oauth] error: {e}")
        return RedirectResponse(f"{APP_URL}/?auth_error=google_failed")

    email = google_user.get("email", "")
    google_id = str(google_user.get("id", ""))
    name = google_user.get("name") or google_user.get("given_name") or email.split("@")[0]

    if not email or not google_id:
        return RedirectResponse(f"{APP_URL}/?auth_error=google_no_email")

    db = get_db()
    try:
        user = db.execute("SELECT * FROM users WHERE google_id=?", (google_id,)).fetchone()
        if not user:
            existing = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
            if existing:
                db.execute("UPDATE users SET google_id=? WHERE id=?", (google_id, dict(existing)["id"]))
                db.commit()
                user = db.execute("SELECT * FROM users WHERE id=?", (dict(existing)["id"],)).fetchone()
            else:
                username = _unique_username(db, name)
                db.execute(
                    "INSERT INTO users (username, email, password_hash, google_id) VALUES (?,?,?,?)",
                    (username, email, "", google_id)
                )
                db.commit()
                user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        jwt_token = make_token(dict(user)["id"])
    finally:
        db.close()

    return RedirectResponse(f"{APP_URL}/?gl_token={jwt_token}")


# ── Steam integration ─────────────────────────────────
STEAM_API = "https://api.steampowered.com"

async def _resolve_steam_id(steam_id: str) -> str:
    if steam_id.isdigit() and len(steam_id) == 17:
        return steam_id
    data = await get(f"{STEAM_API}/ISteamUser/ResolveVanityURL/v1/",
                     {"key": STEAM_API_KEY, "vanityurl": steam_id})
    r = data.get("response", {})
    if r.get("success") != 1:
        raise HTTPException(404, "Perfil de Steam no encontrado. Comprueba el nombre de usuario.")
    return r["steamid"]


@app.get("/api/steam/preview")
async def steam_preview(steam_id: str = "", user=Depends(require_auth)):
    sid = steam_id or user.get("steam_id", "")
    if not sid:
        raise HTTPException(400, "Introduce tu Steam ID o nombre de usuario")
    if not STEAM_API_KEY:
        raise HTTPException(503, "Steam API no configurada")
    sid = await _resolve_steam_id(sid.strip())
    try:
        data = await get(f"{STEAM_API}/IPlayerService/GetOwnedGames/v1/", {
            "key": STEAM_API_KEY, "steamid": sid,
            "include_appinfo": "true", "include_played_free_games": "true",
        })
    except Exception:
        raise HTTPException(403, "No se pudo acceder. Asegúrate de que tu perfil de Steam es público.")
    games = data.get("response", {}).get("games", [])
    if not games:
        raise HTTPException(404, "No se encontraron juegos. El perfil debe ser público.")
    games_sorted = sorted(games, key=lambda g: g.get("playtime_forever", 0), reverse=True)
    return {
        "steam_id": sid,
        "total": len(games_sorted),
        "games": [{"appid": g["appid"], "name": g.get("name", f"App {g['appid']}"),
                   "playtime": g.get("playtime_forever", 0)} for g in games_sorted],
    }


class SteamImportIn(BaseModel):
    steam_id: str
    games: list[dict]
    only_played: bool = True


@app.post("/api/steam/import")
def steam_import(body: SteamImportIn, user=Depends(require_auth)):
    db = get_db()
    imported = 0
    try:
        db.execute("UPDATE users SET steam_id=? WHERE id=?", (body.steam_id, user["id"]))
        for g in body.games:
            playtime = g.get("playtime", 0)
            if body.only_played and playtime == 0:
                continue
            image = f"{CDN}/{g['appid']}/header.jpg"
            db.execute("""
                INSERT INTO game_entries (user_id, steam_appid, game_name, game_image, status, playtime)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(user_id, steam_appid) DO UPDATE SET playtime=excluded.playtime
            """, (user["id"], g["appid"], g["name"], image, "library", playtime))
            imported += 1
        db.commit()
    finally:
        db.close()
    return {"imported": imported}


@app.get("/api/steam/achievements/{appid}")
async def get_achievements(appid: int, user=Depends(require_auth)):
    steam_id = user.get("steam_id")
    if not steam_id or not STEAM_API_KEY:
        return {"total": 0, "achieved": 0, "achievements": []}
    try:
        data = await get(f"{STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/",
                         {"appid": appid, "key": STEAM_API_KEY, "steamid": steam_id, "l": "spanish"})
        achievements = data.get("playerstats", {}).get("achievements", [])
        achieved = sum(1 for a in achievements if a.get("achieved"))
        unlocked = [a for a in achievements if a.get("achieved")]
        unlocked.sort(key=lambda a: a.get("unlocktime", 0), reverse=True)
        return {"total": len(achievements), "achieved": achieved, "achievements": unlocked[:8]}
    except Exception:
        return {"total": 0, "achieved": 0, "achievements": []}


# ── Billing (Stripe) ──────────────────────────────────
@app.post("/api/billing/checkout")
def create_checkout(user=Depends(require_auth)):
    if not STRIPE_SECRET_KEY or not STRIPE_PRICE_ID:
        raise HTTPException(503, "Pagos no configurados")
    db = get_db()
    try:
        row = db.execute("SELECT is_premium, stripe_customer_id FROM users WHERE id=?", (user["id"],)).fetchone()
    finally:
        db.close()
    if row and row["is_premium"]:
        raise HTTPException(400, "Ya eres premium")
    params = {
        "mode": "subscription",
        "line_items": [{"price": STRIPE_PRICE_ID, "quantity": 1}],
        "success_url": f"{APP_URL}/?premium=success",
        "cancel_url": f"{APP_URL}/?premium=cancel",
        "metadata": {"user_id": str(user["id"])},
    }
    customer_id = row["stripe_customer_id"] if row else None
    if customer_id:
        params["customer"] = customer_id
    else:
        params["customer_email"] = user["email"]
    try:
        session = stripe.checkout.Session.create(**params)
    except stripe.error.StripeError as e:
        raise HTTPException(502, f"Error de pago: {e.user_message or str(e)}")
    return {"url": session.url}


@app.post("/api/billing/portal")
def billing_portal(user=Depends(require_auth)):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Pagos no configurados")
    db = get_db()
    row = db.execute("SELECT stripe_customer_id FROM users WHERE id=?", (user["id"],)).fetchone()
    db.close()
    if not row or not row["stripe_customer_id"]:
        raise HTTPException(400, "Tu cuenta premium fue activada manualmente y no tiene suscripción de Stripe asociada")
    session = stripe.billing_portal.Session.create(
        customer=row["stripe_customer_id"],
        return_url=f"{APP_URL}/mi-perfil",
    )
    return {"url": session.url}


@app.post("/api/billing/webhook")
async def stripe_webhook(request: Request):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(503, "Webhook no configurado")
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        raise HTTPException(400, str(e))
    db = get_db()
    try:
        if event["type"] == "checkout.session.completed":
            s = event["data"]["object"]
            user_id = int(s["metadata"]["user_id"])
            db.execute(
                "UPDATE users SET is_premium=1, stripe_customer_id=?, stripe_subscription_id=? WHERE id=?",
                (s["customer"], s["subscription"], user_id)
            )
            db.commit()
        elif event["type"] == "customer.subscription.deleted":
            sub = event["data"]["object"]
            db.execute("UPDATE users SET is_premium=0 WHERE stripe_customer_id=?", (sub["customer"],))
            db.commit()
        elif event["type"] == "customer.subscription.updated":
            sub = event["data"]["object"]
            active = 1 if sub["status"] in ("active", "trialing") else 0
            db.execute("UPDATE users SET is_premium=? WHERE stripe_customer_id=?", (active, sub["customer"]))
            db.commit()
    finally:
        db.close()
    return {"ok": True}


# ── Background price checker ───────────────────────────
async def alert_loop():
    await asyncio.sleep(60)
    while True:
        print("[alerts] checking prices...")
        try:
            await check_alerts()
        except Exception as e:
            print(f"[alerts] error: {e}")
        await asyncio.sleep(6 * 3600)


async def wishlist_price_loop():
    await asyncio.sleep(3600 * 6)  # primera ejecución 6h tras arranque
    while True:
        print("[prices] recording wishlist prices...")
        try:
            await check_wishlist_prices()
        except Exception as e:
            print(f"[prices] error: {e}")
        await asyncio.sleep(3600 * 24)



# SPA fallback — serve index.html for client-side routes
from fastapi.responses import FileResponse
from urllib.parse import unquote

GENRES = [
    {"name": "Acción",       "key": "Action",               "emoji": "⚔️"},
    {"name": "Aventura",     "key": "Adventure",             "emoji": "🗺️"},
    {"name": "RPG",          "key": "RPG",                   "emoji": "🧙"},
    {"name": "Estrategia",   "key": "Strategy",              "emoji": "♟️"},
    {"name": "Simulación",   "key": "Simulation",            "emoji": "🎮"},
    {"name": "Deportes",     "key": "Sports",                "emoji": "⚽"},
    {"name": "Indie",        "key": "Indie",                 "emoji": "🎨"},
    {"name": "Puzzle",       "key": "Puzzle",                "emoji": "🧩"},
    {"name": "Carreras",     "key": "Racing",                "emoji": "🏎️"},
    {"name": "Multijugador", "key": "Massively Multiplayer", "emoji": "🌐"},
    {"name": "Gratis",       "key": "Free to Play",          "emoji": "🎁"},
]


@app.get("/api/genres")
def list_genres():
    return GENRES


@app.get("/api/genres/{genre_key}")
async def games_by_genre(genre_key: str, page: int = 1):
    genre_key = unquote(genre_key)
    try:
        data = await get(STEAMSPY, {"request": "genre", "genre": genre_key})
    except Exception:
        return {"results": [], "count": 0}

    def parse_owners(s):
        try: return int(s.split("..")[0].replace(",", "").replace(" ", "").strip())
        except: return 0

    all_g = sorted(data.values(), key=lambda g: parse_owners(g.get("owners", "0")), reverse=True)
    ps = 24
    chunk = all_g[(page - 1) * ps: page * ps]
    appids = [g["appid"] for g in chunk]

    db = get_db()
    community = {}
    for appid in appids:
        row = db.execute(
            "SELECT ROUND(AVG(rating),1) as avg_rating, COUNT(*) as votes "
            "FROM game_entries WHERE steam_appid=? AND rating IS NOT NULL AND status='played'",
            (appid,)
        ).fetchone()
        if row and row["votes"]:
            community[appid] = {"avg_rating": row["avg_rating"], "votes": row["votes"]}
    db.close()

    return {"results": [
        {"id": g["appid"], "name": g["name"], "image": img(g["appid"]),
         "playtime": round(g.get("average_forever", 0) / 60, 1),
         "price": fmt_spy_price(g),
         **community.get(g["appid"], {})}
        for g in chunk
    ], "count": len(all_g)}


@app.get("/u/{username}")
@app.get("/ranking")
@app.get("/mi-perfil")
@app.get("/mylist")
@app.get("/wishlist")
@app.get("/explore")
@app.get("/explore/{genre_key}")
@app.get("/reset-password")
@app.get("/community")
async def spa_fallback():
    return FileResponse("static/index.html")


app.mount("/", StaticFiles(directory="static", html=True), name="static")
