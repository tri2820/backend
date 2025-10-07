#!/usr/bin/env bash
SESSION="backend"

# Kill old session if it exists
tmux kill-session -t $SESSION 2>/dev/null

tmux new-session -d -s $SESSION -n image_description
tmux send-keys -t $SESSION:image_description "cd indexer && uv run --env-file .env python -m worker_image_description" C-m

# tmux new-window -t $SESSION -n worker_summarize
# tmux send-keys -t $SESSION:worker_summarize "cd indexer && uv run --env-file .env python -m worker_summarize" C-m

# This one is for general indexing tasks
tmux new-window -t $SESSION -n worker_embedding
tmux send-keys -t $SESSION:worker_embedding "cd indexer && uv run --env-file .env python -m worker_embedding" C-m

# This one is for fast, reactive search tasks
tmux new-window -t $SESSION -n worker_fast_embedding
tmux send-keys -t $SESSION:worker_fast_embedding "cd indexer && SUBSCRIBED_EVENTS=\"fast_embedding\" MAX_LATENCY_MS=\"200\" RESULT_TYPE=\"fast_embedding_result\" uv run --env-file .env python -m worker_embedding" C-m

tmux new-window -t $SESSION -n distributor
tmux send-keys -t $SESSION:distributor "cd distributor && bun run index.ts" C-m


# Attach when ready
tmux attach -t $SESSION