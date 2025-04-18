from fastapi import FastAPI, Request, HTTPException, APIRouter
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx # Use httpx for asynchronous requests
import json
import asyncio
import uuid

app = FastAPI()

# Add CORS middleware to allow requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for simplicity, restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes for static files
@app.get("/")
async def read_index():
    return FileResponse("index.html")

@app.get("/style.css")
async def read_css():
    return FileResponse("style.css")

@app.get("/script.js")
async def read_js():
    return FileResponse("script.js")

@app.get("/logo.png")
async def read_logo():
    return FileResponse("logo.png")

@app.get("/api/test")
async def test_api():
    return {"message": "API test endpoint is working"}


BACKEND_API_URL = "http://127.0.0.1:8000"

# --- Rate Limiting and Queuing ---
MAX_CONCURRENT_REQUESTS = 3
queue = asyncio.Queue()
concurrent_requests = 0
request_results = {} # To store results of processed requests for polling

async def process_queue():
    """Background task to process requests from the queue."""
    global concurrent_requests
    while True:
        if concurrent_requests < MAX_CONCURRENT_REQUESTS and not queue.empty():
            request_id, request_body = await queue.get()
            print(f"Processing request {request_id} from queue.")
            concurrent_requests += 1 # Increment concurrent_requests when processing from queue
            # Process the request in a separate task to not block the queue processing
            asyncio.create_task(process_synthesize_request(request_id, request_body))
        else:
            await asyncio.sleep(0.1) # Wait a bit before checking again

async def process_synthesize_request(request_id: str, request_body: dict):
    """Processes a single synthesize request and stores the result using httpx."""
    global concurrent_requests
    async with httpx.AsyncClient(timeout=60.0) as client: # Use async httpx client with a timeout
        try:
            response = await client.post(f"{BACKEND_API_URL}/tts/synthesize", json=request_body) # Use await client.post
            response.raise_for_status()

            # Store the successful response content and headers
            request_results[request_id] = {
                "status": "completed",
                "body": response.content, # response.content is bytes in httpx
                "headers": dict(response.headers)
            }
            print(f"Request {request_id} completed successfully.")

        except httpx.RequestError as e: # Catch httpx exceptions
            # Store the error details
            status_code = 500 # Default status code for request errors
            detail = f"Error forwarding request to backend: {e}"

            if e.response is not None:
                status_code = e.response.status_code
                if e.response.text:
                     try:
                         detail = e.response.json()
                     except json.JSONDecodeError:
                         detail = e.response.text
            else:
                 # Handle cases like ReadTimeout where e.response is None
                 detail = f"Request to backend timed out or failed: {e}"


            request_results[request_id] = {
                "status": "error",
                "status_code": status_code,
                "detail": detail
            }
            print(f"Request {request_id} failed: {detail}")

        finally:
            print(f"Before decrement (finally): {concurrent_requests}") # Log before decrement
            concurrent_requests -= 1
            print(f"After decrement (finally): {concurrent_requests}") # Log after decrement

# --- TTS API Router ---
tts_router = APIRouter(prefix="/api/tts")

@tts_router.get("/models")
async def get_models():
    """
    Forward request to backend /tts/models endpoint using httpx.
    """
    async with httpx.AsyncClient() as client: # Use async httpx client
        try:
            response = await client.get(f"{BACKEND_API_URL}/tts/models") # Use await client.get
            response.raise_for_status() # Raise an exception for bad status codes
            return response.json()
        except httpx.RequestError as e: # Catch httpx exceptions
            raise HTTPException(status_code=500, detail=f"Error forwarding request to backend: {e}")

@tts_router.post("/synthesize")
async def synthesize_text(request: Request):
    """
    Handle TTS synthesize requests with queuing.
    """
    global concurrent_requests # Declare concurrent_requests as global
    request_id = str(uuid.uuid4())
    try:
        request_body = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in request body")

    if concurrent_requests < MAX_CONCURRENT_REQUESTS:
        print(f"Processing request {request_id} immediately.")
        concurrent_requests += 1 # Increment concurrent_requests for immediate processing
        # Process the request immediately and wait for it to complete
        await process_synthesize_request(request_id, request_body)
        # After processing, the result is in request_results, and status is "completed"
        # The frontend will poll and get the completed status and result
        return {"request_id": request_id, "status": "completed"} # Return completed status immediately
    else:
        await queue.put((request_id, request_body))
        queue_position = queue.qsize()
        print(f"Request {request_id} queued. Position: {queue_position}")
        return {"request_id": request_id, "status": "queued", "position": queue_position}

@tts_router.get("/status/{request_id}")
async def get_request_status(request_id: str):
    """
    Get the status of a queued or processing request.
    """
    if request_id in request_results:
        result = request_results[request_id]
        if result["status"] == "completed":
            # For completed requests, return the actual audio data
            # Remove from results after sending to avoid memory issues
            del request_results[request_id]
            # Manually set Content-Type header
            headers = {"Content-Type": "audio/wav"} # Assuming WAV audio
            # Wrap the bytes content in a list to yield it as a single chunk
            return StreamingResponse(content=[result["body"]], headers=headers)
        elif result["status"] == "error":
             # For failed requests, return the error details
             del request_results[request_id]
             raise HTTPException(status_code=result["status_code"], detail=result["detail"])
        else:
             # Should not happen with current statuses, but as a fallback
             return {"request_id": request_id, "status": result["status"]}


    # Check if the request is in the queue
    # Note: Checking position in asyncio.Queue is not direct,
    #       this is a simplified representation.
    #       A more robust solution would track requests in a list/dict before queuing.
    #       For this example, we'll just indicate if it's still queued.
    is_queued = any(req_id == request_id for req_id, _ in list(queue._queue)) # Accessing internal _queue for demo
    if is_queued:
         # Attempt to find position - this is inefficient for large queues
         position = -1
         for i, (req_id, _) in enumerate(list(queue._queue)):
             if req_id == request_id:
                 position = i + 1
                 break
         return {"request_id": request_id, "status": "queued", "position": position}


    # If not in results and not in queue, it might have been processed and result already retrieved,
    # or the request_id is invalid/expired.
    raise HTTPException(status_code=404, detail="Request ID not found or expired")

# Include the TTS router in the main app
app.include_router(tts_router)


@app.on_event("startup")
async def startup_event():
    """Start the queue processing background task."""
    asyncio.create_task(process_queue())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
