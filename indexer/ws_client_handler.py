import asyncio
import websockets
import concurrent.futures
import time
import json
import random
import os

def parse_env():
    """
    Parses worker configuration from environment variables.
    Returns a dictionary containing only the settings found in the environment.
    """
    env_config = {}

    # Read and parse SUBSCRIBED_EVENTS if it exists
    subscribed_events_str = os.environ.get("SUBSCRIBED_EVENTS")
    if subscribed_events_str:
        env_config["subscribed_events"] = [event.strip() for event in subscribed_events_str.split(",")]

    # Read and parse MAX_LATENCY_MS if it exists
    max_latency_ms_str = os.environ.get("MAX_LATENCY_MS")
    if max_latency_ms_str:
        try:
            env_config["max_latency_ms"] = int(max_latency_ms_str)
        except (ValueError, TypeError):
            print(f"Warning: Could not parse MAX_LATENCY_MS from environment variable. Value: '{max_latency_ms_str}'")
    
    return env_config

async def client_handler(heavy_ai_workload, worker_config):
    """
    Connects to the server with a robust, exponential backoff retry mechanism.
    """
    uri = "ws://localhost:8041"
    
    # --- Retry Logic Variables ---
    initial_delay = 1.0
    max_delay = 60.0
    reconnect_delay = initial_delay
    
    with concurrent.futures.ThreadPoolExecutor() as pool:
        while True:
            try:
                async with websockets.connect(uri) as websocket:
                    # If the connection is successful, print a confirmation
                    # and RESET the reconnect delay to its initial value.
                    print(f"[Main] Connection successful to {uri}.")
                    reconnect_delay = initial_delay
                    
                    # --- MERGED LOGIC HERE ---
                    # 1. Start with a copy of the base config passed to the function.
                    final_worker_config = worker_config.copy()
                    
                    # 2. Parse environment variables to get any overrides.
                    env_overrides = parse_env()
                    
                    # 3. Update the config, overwriting base values with env variables.
                    final_worker_config.update(env_overrides)
                    
                    # 4. Send the final, merged configuration.
                    print(f"[Main] Sending 'i_am_worker' message with final config: {final_worker_config}")
                    await websocket.send(json.dumps({"type": "i_am_worker", "worker_config": final_worker_config}))
                    
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
                
                await asyncio.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, max_delay) + random.uniform(0, 1)

            except Exception as e:
                print(f"[Main] An unexpected error occurred: {e}. Retrying in 5 seconds...")
                await asyncio.sleep(5)