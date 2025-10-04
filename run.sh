#!/usr/bin/env bash
SESSION="backend"

# Kill old session if it exists
tmux kill-session -t $SESSION 2>/dev/null


tmux new-session -d -s $SESSION -n image_description
tmux send-keys -t $SESSION:image_description "cd indexer && source .venv/bin/activate && python -m worker_image_description" C-m

tmux new-window -t $SESSION -n distributor
tmux send-keys -t $SESSION:distributor "cd distributor && bun run index.ts" C-m

# This one is for general indexing tasks
tmux new-window -t $SESSION -n worker_embedding
tmux send-keys -t $SESSION:worker_embedding "cd indexer && source .venv/bin/activate && python -m worker_embedding" C-m

# This one is for fast, reactive search tasks
tmux new-window -t $SESSION -n worker_embedding_search
tmux send-keys -t $SESSION:worker_embedding_search "cd indexer && source .venv/bin/activate && SUBSCRIBED_EVENTS=\"search\" MAX_LATENCY_MS=\"500\" python -m worker_embedding" C-m

# Attach when ready
tmux attach -t $SESSION