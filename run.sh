#!/usr/bin/env bash
SESSION="backend"

# Kill old session if it exists
tmux kill-session -t $SESSION 2>/dev/null

# Start new detached session with the server
tmux new-session -d -s $SESSION -n image_description
tmux send-keys -t $SESSION:image_description "cd indexer && source .venv/bin/activate && python -m worker_image_description" C-m

# Object detection worker
tmux new-window -t $SESSION -n distributor
tmux send-keys -t $SESSION:distributor "cd distributor && bun run index.ts" C-m

# Attach when ready
tmux attach -t $SESSION