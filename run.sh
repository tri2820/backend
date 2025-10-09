#!/usr/bin/env bash
SESSION="backend"

# Kill any old session if it exists
tmux kill-session -t $SESSION 2>/dev/null

# 1. CREATE the new detached session, naming the FIRST window "distributor"
tmux new-session -d -s $SESSION -n distributor
tmux send-keys -t $SESSION:distributor "cd distributor && BUN_PYTHON_PATH=\"/home/tri/.pyenv/versions/3.13.0/lib/libpython3.so\" bun index.ts" C-m

# 2. ADD all other windows to the session that now exists

# # This one is for general indexing tasks with Jina embeddings
tmux new-window -t $SESSION -n worker_embedding
tmux send-keys -t $SESSION:worker_embedding "cd indexer && WORKER_TYPE=\"embedding\" MAX_LATENCY_MS=\"10000\" uv run --env-file .env python -m worker_embedding" C-m

# This one is for fast, reactive search tasks with Jina embeddings
tmux new-window -t $SESSION -n worker_fast_embedding
tmux send-keys -t $SESSION:worker_fast_embedding "cd indexer && WORKER_TYPE=\"fast_embedding\" MAX_LATENCY_MS=\"200\" uv run --env-file .env python -m worker_embedding" C-m

# This one is for fast, reactive text suggestion with Phi 4
tmux new-window -t $SESSION -n worker_text_generation
tmux send-keys -t $SESSION:worker_text_generation "cd indexer && WORKER_TYPE=\"text_generation\" MAX_LATENCY_MS=\"200\" uv run --env-file .env python -m worker_text_generation" C-m

# This one is for fast Q & A / summary with VLM
tmux new-window -t $SESSION -n worker_qa_vlm
tmux send-keys -t $SESSION:worker_qa_vlm "cd indexer && WORKER_TYPE=\"qa_vlm\" MODEL_ID=\"HuggingFaceTB/SmolVLM2-2.2B-Instruct\" MAX_LATENCY_MS=\"200\" uv run --env-file .env python -m worker_vlm" C-m

# This one is for general indexing tasks
tmux new-window -t $SESSION -n worker_vlm
tmux send-keys -t $SESSION:worker_vlm "cd indexer && WORKER_TYPE=\"vlm\" MAX_LATENCY_MS=\"10000\" uv run --env-file .env python -m worker_vlm" C-m

# 3. SELECT the distributor window to make it the active one
tmux select-window -t $SESSION:distributor

# 4. Attach to the session, which will now open on the selected window
tmux attach -t $SESSION