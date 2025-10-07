"""
BATCH INPUT/OUTPUT SHAPE FOR worker_text_generation:

BATCH INPUT FORMAT (Accepts multiple file paths AND multiple text prompts per input):
{
  "inputs": [
    {
      "id": "req_001",
      "filepaths": ["/path/to/person.jpg", "/path/to/package.png"],
      "texts": ["What is the person doing with the package?", "Are they in a restricted area?"]
    },
    {
      "id": "req_002",
      "filepaths": ["/path/to/car.jpg", "/path/to/entrance.jpg"],
      "texts": ["Describe the vehicle.", "Is the entrance blocked?"]
    }
  ]
}

BATCH OUTPUT FORMAT (A single description is generated in response to all images/texts for an ID):
{
  "output": [
    {
      "id": "req_001",
      "description": "The model's answer based on the person/package images and the two questions."
    },
    {
      "id": "req_002",
      "description": "The model's answer based on the car/entrance images and the two questions."
    }
  ]
}
"""

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

        # Prepare optimized batch of messages and collect image names
        messages = []
        message_inputs = data.get('inputs', [])
        for inp in  message_inputs:
            # --- MODIFICATION START ---
            # Initialize an empty list for user content
            user_content = []
            
            if inp.get('filepaths'):
              # Add all image paths from the input
              # inp['filepaths'] is expected to be a list of paths
              for filepath in inp['filepaths']:
                  user_content.append({"type": "image", "image": str(filepath)})

            if inp.get('texts'):
              # Add all text prompts from the input
              # inp['texts'] is expected to be a list of strings
              for text_prompt in inp['texts']:
                  user_content.append({"type": "text", "text": text_prompt})
            # --- MODIFICATION END ---
            
            message = [
                {
                    "role": "system",
                    "content": [{"type": "text", "text": "You are a helpful assistant that can understand images."}]
                },
                {
                    "role": "user",
                    "content": user_content # Use the dynamically built content list
                }
            ]
            messages.append(message)

        # Build inputs (processor returns a dict of tensors)
        inputs = processor.apply_chat_template(
            messages,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
            padding=True,
        )

        inputs = inputs.to('cuda')

        raw_outputs = model.generate(**inputs, max_new_tokens=256)

        outputs = []
        i = 0
        for raw_output in raw_outputs:
            tok_ids = raw_output.cpu().tolist()
            raw_text = processor.decode(tok_ids, skip_special_tokens=True)
            # Keep previous logic for extracting assistant reply
            description = raw_text.split("Assistant: ")[-1].strip()
            # Include image name in output
            outputs.append({
                "id": message_inputs[i]['id'],
                "description": description
            })
            i += 1

        result = { "output": outputs }
        print("[AI Thread] Heavy AI workload finished.")
        return json.dumps(result)

    return worker_function

if __name__ == "__main__":
    worker_function = load_ai_model()
    asyncio.run(client_handler(worker_function))