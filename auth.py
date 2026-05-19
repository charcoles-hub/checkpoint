import os
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from database import get_db

SECRET = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
ALGO = "HS256"
DAYS = 7

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def hash_pw(password: str) -> str:
    return pwd.hash(password)


def verify_pw(plain: str, hashed: str) -> bool:
    return pwd.verify(plain, hashed)


def make_token(user_id: int) -> str:
    exp = datetime.utcnow() + timedelta(days=DAYS)
    return jwt.encode({"sub": str(user_id), "exp": exp}, SECRET, ALGO)


def current_user(token: str = Depends(oauth2)):
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGO])
        uid = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    db.close()
    return dict(row) if row else None


def require_auth(user=Depends(current_user)):
    if not user:
        raise HTTPException(401, "Debes iniciar sesión")
    return user
