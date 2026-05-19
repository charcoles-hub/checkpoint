import httpx
import smtplib
import os
from email.mime.text import MIMEText
from database import get_db

STEAM = "https://store.steampowered.com/api"


async def get_price(appid: int) -> float | None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{STEAM}/appdetails", params={
                "appids": appid, "filters": "price_overview", "cc": "es"
            })
            entry = r.json().get(str(appid), {})
            if not entry.get("success"):
                return None
            po = entry.get("data", {}).get("price_overview")
            return po["final"] / 100 if po else None
    except Exception:
        return None


async def notify_ntfy(topic: str, game_name: str, appid: int, target: float, price: float):
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                f"https://ntfy.sh/{topic}",
                content=f"{game_name} ahora cuesta {price:.2f}€ (tu objetivo: {target:.2f}€)\nhttps://store.steampowered.com/app/{appid}/",
                headers={"Title": f"🎮 Oferta: {game_name}", "Priority": "high", "Tags": "game_die"}
            )
    except Exception as e:
        print(f"[alerts] ntfy error: {e}")


def notify_email(to: str, game_name: str, appid: int, target: float, price: float):
    host = os.getenv("SMTP_HOST")
    user = os.getenv("SMTP_USER")
    pw = os.getenv("SMTP_PASS")
    if not all([host, user, pw]):
        return
    msg = MIMEText(
        f"¡{game_name} ahora cuesta {price:.2f}€!\n"
        f"Tu precio objetivo era {target:.2f}€.\n\n"
        f"Ver en Steam: https://store.steampowered.com/app/{appid}/"
    )
    msg["Subject"] = f"🎮 Oferta detectada: {game_name}"
    msg["From"] = user
    msg["To"] = to
    try:
        with smtplib.SMTP_SSL(host, 465) as s:
            s.login(user, pw)
            s.send_message(msg)
    except Exception as e:
        print(f"[alerts] email error: {e}")


async def check_alerts():
    db = get_db()
    alerts = db.execute(
        "SELECT pa.*, u.email, u.notify_ntfy FROM price_alerts pa "
        "JOIN users u ON pa.user_id = u.id WHERE pa.triggered = 0"
    ).fetchall()

    for a in [dict(r) for r in alerts]:
        price = await get_price(a["steam_appid"])
        if price is None:
            continue
        db.execute("UPDATE price_alerts SET current_price = ? WHERE id = ?", (price, a["id"]))
        if price <= a["target_price"]:
            db.execute(
                "UPDATE price_alerts SET triggered = 1, triggered_at = CURRENT_TIMESTAMP WHERE id = ?",
                (a["id"],)
            )
            print(f"[alerts] triggered: {a['game_name']} @ {price:.2f}€ for user {a['user_id']}")
            if a.get("notify_ntfy"):
                await notify_ntfy(a["notify_ntfy"], a["game_name"], a["steam_appid"], a["target_price"], price)
            notify_email(a["email"], a["game_name"], a["steam_appid"], a["target_price"], price)

    db.commit()
    db.close()
