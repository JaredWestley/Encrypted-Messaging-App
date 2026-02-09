# main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded

from app.routes import router
from app.database import init_db
from app.rate_limit import limiter

app = FastAPI()

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

# CORS setup
from fastapi.middleware.cors import CORSMiddleware
origins = ["http://localhost:8081"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
def on_startup():
    init_db()
