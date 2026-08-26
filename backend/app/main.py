from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import disruptions, terminal, plans

# --- Server Initialization ---
app = FastAPI(title="Port Disruption Recovery API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Route Registration (Section 8/9 split out into app/api/, per specs.md) ---
app.include_router(disruptions.router)
app.include_router(terminal.router)
app.include_router(plans.router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "PSA Hackathon Backend is running."}
