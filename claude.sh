sudo docker run -it --rm \
  -v ~/.claude:/home/claude/.claude \
  -v "$(pwd)":/workspace \
  -w /workspace \
  claude-code-sandbox
