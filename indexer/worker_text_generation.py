import asyncio
from ws_client_handler import client_handler
import time
import json
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
import os
import re

"""
BATCH INPUT/OUTPUT SHAPE FOR worker_text_generation:

BATCH INPUT FORMAT (Simplified):
{
  "inputs": [
    {
      "id": "req_001",
      "prompt": "person"
    },
    {
      "id": "req_002",
      "prompt": "car near entrance"
    }
  ]
}

BATCH OUTPUT FORMAT (A single response parsed into 5 items):
{
  "type": "text_generation_result",
  "output": [
    {
      "id": "req_001",
      "generated_texts": [
        "person carrying suspicious package",
        "person loitering in restricted area",
        "person acting erratically",
        "person wearing a disguise",
        "person looking into vehicles"
      ]
    },
    {
      "id": "req_002",
      "generated_texts": ["..."]
    }
  ]
}
"""

def parse_json_from_string(text: str) -> list:
    """
    Flexibly extracts and parses a JSON array from a raw string,
    even if it's embedded in markdown code blocks or other text.
    """
    # Use regex to find content between the first '[' and the last ']'
    # re.DOTALL allows '.' to match newline characters
    match = re.search(r'\[.*\]', text, re.DOTALL)
    
    if match:
        json_str = match.group(0)
        try:
            result = json.loads(json_str)
            if isinstance(result, list):
                return result
            else:
                # Handle cases where the parsed JSON is not a list
                return [str(result)]
        except json.JSONDecodeError:
            # The extracted string is not valid JSON
            return []
    else:
        # No JSON array found in the string
        return []

def load_ai_model():
    """
    Initializes the Phi-3 model and returns a worker function that uses few-shot prompting
    to generate a JSON list of investigative query suggestions.
    """
    device = "cuda" if torch.cuda.is_available() else "cpu"
    # Using Phi-3 4k instruct, a powerful and available model.
    model_name = "microsoft/Phi-3-mini-4k-instruct"
    
    print(f"Loading {model_name} model on {device}...")

    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        device_map="auto",
        torch_dtype="auto", 
        trust_remote_code=False,
    )
    tokenizer = AutoTokenizer.from_pretrained(model_name)

    pipe = pipeline(
        "text-generation",
        model=model,
        tokenizer=tokenizer,
    )

    def worker_text_generation(data):
        """
        Processes a batch of prompts using Phi-3 with few-shot examples
        to generate a high-quality JSON list of 5 items.
        """
        print(f"[Text Generation Thread] Starting batch text generation workload...")

        inputs = data.get('inputs')
        if not inputs or not isinstance(inputs, list):
            raise ValueError("Input data must contain a list of jobs under the 'inputs' key.")

        batch_chat_prompts = []
        original_ids = []
        for job in inputs:
            if job.get('id') and job.get('prompt'):
                original_ids.append(job['id'])
                
                # --- NEW: Few-Shot Prompting Structure ---
                messages = [
                    {
                        "role": "system", 
                        "content": (
                            "You are an expert security and threat assessment assistant. Your task is to refine a user's keyword into "
                            "5 specific, actionable search queries with an investigative mindset. Respond ONLY with a single, valid "
                            "JSON array of 5 strings. Do not include explanations or markdown."
                        )
                    },
                    # --- Example 1 ---
                    {
                        "role": "user",
                        "content": "Refine the following keyword: \"person\""
                    },
                    {
                        "role": "assistant",
                        "content": """["person carrying suspicious package", "person loitering in restricted area", "person acting erratically", "person looking into vehicles", "person wearing a disguise"]"""
                    },
                    # --- Example 2 ---
                    {
                        "role": "user",
                        "content": "Refine the following keyword: \"car\""
                    },
                    {
                        "role": "assistant",
                        "content": """["car parked in no-parking zone", "car circling the block", "car with obscured license plate", "unattended vehicle near entrance", "driver slumped over steering wheel"]"""
                    },
                    # --- Actual User Request ---
                    {
                        "role": "user", 
                        "content": f"Refine the following keyword: \"{job['prompt']}\""
                    }
                ]
                batch_chat_prompts.append(messages)

        if not batch_chat_prompts:
            print("No valid jobs in the batch to process.")
            return json.dumps({"type": "text_generation_result", "output": []})

        generation_args = {
            "max_new_tokens": 350,
            "return_full_text": False,
            "do_sample": False,
        }

        print(f"Processing a batch of {len(batch_chat_prompts)} prompts with Phi-3...")
        batch_outputs = pipe(batch_chat_prompts, **generation_args)

        results = []
        for i, output in enumerate(batch_outputs):
            raw_text = output[0]['generated_text']
            # Use the dedicated parsing function
            generated_texts = parse_json_from_string(raw_text)
            
            if not generated_texts: # Log a warning if parsing failed
                 print(f"Warning: Could not parse JSON for request {original_ids[i]}. Raw output: '{raw_text}'")

            results.append({
                "id": original_ids[i],
                "generated_texts": generated_texts
            })

        result_type = os.environ.get("RESULT_TYPE", "text_generation_result")
        final_result = { "type": result_type, "output": results }
        
        print("[Text Generation Thread] Batch text generation workload finished.")
        return json.dumps(final_result)

    return worker_text_generation

if __name__ == "__main__":
    worker_function = load_ai_model()
    asyncio.run(client_handler(worker_function, {"subscribed_events": ["text_generation"], "max_latency_ms": 300, "max_batch_size": 8}))