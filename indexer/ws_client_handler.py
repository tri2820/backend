import asyncio
import websockets
import concurrent.futures
import time
import json
import random

async def client_handler(heavy_ai_workload):
    """
    Connects to the server with a robust, exponential backoff retry mechanism.
    """
    uri = "ws://localhost:8040"
    
    # --- Retry Logic Variables ---
    initial_delay = 1.0  # Initial delay of 1 second
    max_delay = 60.0     # Maximum delay of 60 seconds
    reconnect_delay = initial_delay
    
    with concurrent.futures.ThreadPoolExecutor() as pool:
        while True:
            try:
                async with websockets.connect(uri) as websocket:
                    # If the connection is successful, print a confirmation
                    # and RESET the reconnect delay to its initial value.
                    print(f"[Main] Connection successful to {uri}.")
                    reconnect_delay = initial_delay
                    
                    async for message in websocket:
                        print(f"[Main] Received task from server: {message}")
                        task_data = json.loads(message)
                        loop = asyncio.get_running_loop()
                        
                        print("[Main] Offloading AI task to executor thread...")
                        result_json = await loop.run_in_executor(
                            pool, heavy_ai_workload, task_data
                        )
                        
                        print(f"[Main] Sending result to server: {result_json}")
                        await websocket.send(result_json)
            
            except (websockets.exceptions.ConnectionClosedError, ConnectionRefusedError) as e:
                print(f"[Main] Connection failed: {e}")
                print(f"Attempting to reconnect in {reconnect_delay:.2f} seconds...")
                
                # Wait for the calculated delay period
                await asyncio.sleep(reconnect_delay)
                
                # --- Calculate the next delay (Exponential Backoff + Jitter) ---
                # Double the delay for the next attempt
                reconnect_delay *= 2
                # Cap the delay at the maximum value
                reconnect_delay = min(reconnect_delay, max_delay)
                # Add a small random jitter to prevent thundering herd
                reconnect_delay += random.uniform(0, 1)

            except Exception as e:
                print(f"[Main] An unexpected error occurred: {e}. Retrying in 5 seconds...")
                await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(client_handler())