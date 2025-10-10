#!/usr/bin/env bash

# --- Configuration ---
# Set the session name
SESSION="backend"

# Define the full path to your project's root directory
# This makes the script runnable from anywhere
PROJECT_DIR="/home/tri/backend" # IMPORTANT: Change this to your actual project path

# Path to the Python shared library
# Ensures the correct Python version is used by Bun
BUN_PYTHON_PATH="/home/tri/.pyenv/versions/3.13.0/lib/libpython3.so"

# --- Script Body ---
# Kill any existing tmux session with the same name
tmux kill-session -t "$SESSION" 2>/dev/null

# Create a new, detached tmux session with the first window named "distributor"
tmux new-session -d -s "$SESSION" -n distributor -c "$PROJECT_DIR"

# Send the command to start the distributor service
# Using an environment variable for clarity
DISTRIBUTOR_CMD="cd distributor && BUN_PYTHON_PATH=\"$BUN_PYTHON_PATH\" bun index.ts"
tmux send-keys -t "$SESSION:distributor" "$DISTRIBUTOR_CMD" C-m

# --- Worker Panes ---

# Create and run the embedding worker
tmux new-window -t "$SESSION" -n worker_embedding -c "$PROJECT_DIR/indexer"
EMBEDDING_CMD="WORKER_TYPE=\"embedding\" MAX_LATENCY_MS=\"10000\" uv run --env-file .env python -m worker_embedding"
tmux send-keys -t "$SESSION:worker_embedding" "$EMBEDDING_CMD" C-m

# Create and run the fast embedding worker
tmux new-window -t "$SESSION" -n worker_fast_embedding -c "$PROJECT_DIR/indexer"
FAST_EMBEDDING_CMD="WORKER_TYPE=\"fast_embedding\" MAX_LATENCY_MS=\"200\" uv run --env-file .env python -m worker_embedding"
tmux send-keys -t "$SESSION:worker_fast_embedding" "$FAST_EMBEDDING_CMD" C-m

# Create and run the text generation worker
tmux new-window -t "$SESSION" -n worker_text_generation -c "$PROJECT_DIR/indexer"
TEXT_GEN_CMD="WORKER_TYPE=\"text_generation\" MAX_LATENCY_MS=\"200\" uv run --env-file .env python -m worker_text_generation"
tmux send-keys -t "$SESSION:worker_text_generation" "$TEXT_GEN_CMD" C-m

# Create and run the VLM Q&A worker
tmux new-window -t "$SESSION" -n worker_qa_vlm -c "$PROJECT_DIR/indexer"
QA_VLM_CMD="WORKER_TYPE=\"qa_vlm\" MODEL_ID=\"HuggingFaceTB/SmolVLM2-2.2B-Instruct\" MAX_LATENCY_MS=\"200\" uv run --env-file .env python -m worker_vlm"
tmux send-keys -t "$SESSION:worker_qa_vlm" "$QA_VLM_CMD" C-m

# Create and run the general VLM worker
tmux new-window -t "$SESSION" -n worker_vlm -c "$PROJECT_DIR/indexer"
VLM_CMD="WORKER_TYPE=\"vlm\" MAX_LATENCY_MS=\"10000\" uv run --env-file .env python -m worker_vlm"
tmux send-keys -t "$SESSION:worker_vlm" "$VLM_CMD" C-m

# --- Finalization ---
# Select the 'distributor' window by default
tmux select-window -t "$SESSION:distributor"

# Attach to the newly created tmux session
echo "Attaching to tmux session '$SESSION'. To detach, press Ctrl+B then D."
tmux attach -t "$SESSION"