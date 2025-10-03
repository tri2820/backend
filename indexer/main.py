import asyncio
from ws_client_handler import client_handler
import time
import json

import torch
from transformers import AutoProcessor, AutoModelForImageTextToText
from PIL import Image
import os
import cv2

def load_ai_model():
    # Load model with optimizations
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_name = "HuggingFaceTB/SmolVLM2-256M-Video-Instruct"
    print(f"Loading {model_name} model on {device}...")
    
    processor = AutoProcessor.from_pretrained(model_name)
    
    # Reduce image size while maintaining aspect ratio
    print(f"Original image size: {processor.image_processor.size}")
    # Reduce image size for faster processing
    processor.image_processor.size = {"longest_edge": 600}
    print(f"Optimized image size: {processor.image_processor.size}")

    # Optimization trick: Optimal model configuration with float16
    model = AutoModelForImageTextToText.from_pretrained(
        model_name,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32
    ).to(device)
    
    def worker_function(data):
        """Simulates a long-running, CPU/GPU-intensive task on the client machine."""
        print(f"[AI Thread] Starting heavy AI workload with data: {data}")
        model_input = data.get('input', None)
        time.sleep(5)

        result = {"status": "complete", "output": f"Client processed data: {model_input}"}
        print("[AI Thread] Heavy AI workload finished.")
        return json.dumps(result)

    return worker_function

if __name__ == "__main__":
    worker_function = load_ai_model()
    asyncio.run(client_handler(worker_function))