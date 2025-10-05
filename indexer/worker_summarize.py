import asyncio
from ws_client_handler import client_handler
import time
import json
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
import os

"""
BATCH INPUT/OUTPUT SHAPE FOR worker_summarize:

BATCH INPUT FORMAT:
{
  "inputs": [
    {
      "id": "req_001",
      "query": "What are the benefits of the Phoenix framework?",
      "passages": ["...", "..."]
    },
    {
      "id": "req_002",
      "query": "When was Phoenix released?",
      "passages": ["...", "..."]
    }
  ]
}

BATCH OUTPUT FORMAT:
{
  "type": "summarize_result",
  "output": [
    {
      "id": "req_001",
      "answer": "The key benefits are performance, security, and developer productivity."
    },
    {
      "id": "req_002",
      "answer": "The provided context does not contain the answer to this question."
    }
  ]
}
"""

def load_ai_model():
    """
    Initializes the Phi-3 instruction-tuned model and returns the
    worker_summarize function capable of handling batches.
    """
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_name = "microsoft/Phi-3-mini-128k-instruct"
    
    print(f"Loading {model_name} model on {device}...")

    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        device_map=device,
        torch_dtype="auto",
        trust_remote_code=False,
    )
    tokenizer = AutoTokenizer.from_pretrained(model_name)

    # The pipeline is optimized for batch processing
    pipe = pipeline(
        "text-generation",
        model=model,
        tokenizer=tokenizer,
    )

    def worker_summarize(data):
        """
        Processes a batch of queries and passages to generate factual answers,
        avoiding hallucination.
        """
        print(f"[Summarize Thread] Starting batch summarization workload...")

        # --- 1. Validate and Extract Batch Input ---
        inputs = data.get('inputs')
        if not inputs or not isinstance(inputs, list):
            raise ValueError("Input data must contain a list of jobs under the 'inputs' key.")

        batch_prompts = []
        original_ids = []

        # --- 2. Construct Prompts for Each Job in the Batch ---
        for job in inputs:
            request_id = job.get('id')
            query = job.get('query')
            passages = job.get('passages')

            if not all([request_id, query, passages]):
                # Skip invalid entries or raise an error
                print(f"Skipping invalid job in batch: {job}")
                continue

            original_ids.append(request_id)
            context = "\n\n".join(passages)
            
            # The same robust, anti-hallucination prompt structure
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a highly precise and factual AI assistant. Your task is to answer the user's query based "
                        "ONLY on the provided context. Do not use any external knowledge. If the information to answer the "
                        "query is not in the context, you must explicitly state: "
                        "'The provided context does not contain the answer to this question.'."                         
                        "Provide a summary of the event, from which time to which time. Do not be repetitive."
                        "Example answer:"
                        "From 9 AM to 5 PM, there is a person wearing a red hat. Walking towards the gate. The same person is seen again at 6 PM holding an umbrella."
                    ),
                },
                {
                    "role": "user",
                    "content": f"**Context:**\n---\n{context}\n---\n\n**Query:** {query}",
                },
            ]
            batch_prompts.append(messages)

        # --- 3. Define Generation Arguments ---
        generation_args = {
            "max_new_tokens": 500,
            "return_full_text": False,
            "do_sample": False,
        }

        # --- 4. Generate Answers for the Entire Batch ---
        # The pipeline efficiently handles the list of prompts
        batch_outputs = pipe(batch_prompts, **generation_args)

        # --- 5. Format the Batch Output ---
        results = []
        for i, output in enumerate(batch_outputs):
            answer = output[0]['generated_text'].strip()
            results.append({
                "id": original_ids[i],
                "answer": answer
            })

        result_type = os.environ.get("RESULT_TYPE", "summarize_result")
        final_result = {
            "type": result_type,
            "output": results
        }
        
        print("[Summarize Thread] Batch summarization workload finished.")
        return json.dumps(final_result)

    return worker_summarize

if __name__ == "__main__":
    # Load the model and get the configured worker function
    worker_function = load_ai_model()

    # # --- Test with a Batch of Requests ---
    # print("\n--- Running Batch Test ---")
    # batch_data = {
    #     "inputs": [
    #         {
    #             "id": "req_001",
    #             "query": "What are the key benefits of using the new framework?",
    #             "passages": [
    #                 "The latest framework, 'Phoenix', introduces a significant performance boost, reducing rendering times by up to 40%.",
    #                 "Additionally, Phoenix offers enhanced security protocols, including built-in protection against common web vulnerabilities.",
    #                 "Developer productivity is also a major focus, with a simplified API and more intuitive debugging tools."
    #             ]
    #         },
    #         {
    #             "id": "req_002",
    #             "query": "What is the release date of the 'Phoenix' framework?",
    #             "passages": [
    #                 "The latest framework, 'Phoenix', introduces a significant performance boost.",
    #                 "It also offers enhanced security protocols and a simplified API for developers."
    #             ]
    #         },
    #         {
    #             "id": "req_003",
    #             "query": "What is the primary focus of the Phoenix API?",
    #             "passages": [
    #                 "The framework's API was designed with simplicity and ease-of-use in mind, aiming to improve developer productivity."
    #             ]
    #         }
    #     ]
    # }
    
    # # Process the entire batch in one call
    # batch_result_json = worker_function(batch_data)
    
    # # Pretty-print the JSON result
    # print("Batch Result:", json.dumps(json.loads(batch_result_json), indent=2))

    # --- Simulate client_handler integration ---
    # print("\n--- Simulating client_handler integration ---")
    asyncio.run(client_handler(worker_function, {"subscribed_events": ["summarize"], "max_latency_ms": 300, "max_batch_size": 4}))