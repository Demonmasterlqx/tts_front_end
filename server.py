from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import requests
import json

app = FastAPI()

# Add CORS middleware to allow requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for simplicity, restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("index.html", "r", encoding="utf-8") as f:
        return f.read()

# Mount static files
app.mount("/static", StaticFiles(directory="."), name="static")

BACKEND_API_URL = "http://127.0.0.1:8000"

@app.get("/api/tts/models")
async def get_models():
    """
    Forward request to backend /tts/models endpoint.
    """
    try:
        response = requests.get(f"{BACKEND_API_URL}/tts/models")
        response.raise_for_status() # Raise an exception for bad status codes
        return response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error forwarding request to backend: {e}")

@app.post("/api/tts/synthesize")
async def synthesize_text(request: Request):
    """
    Forward request to backend /tts/synthesize endpoint.
    """
    try:
        body = await request.json()
        response = requests.post(f"{BACKEND_API_URL}/tts/synthesize", json=body, stream=True)
        response.raise_for_status() # Raise an exception for bad status codes

        # Return streaming response to handle potentially large audio data
        return StreamingResponse(response.iter_content(chunk_size=8192), media_type=response.headers['Content-Type'])

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error forwarding request to backend: {e}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in request body")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001) # Run on a different port than the backend
