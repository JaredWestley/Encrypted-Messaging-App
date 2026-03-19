#!/bin/bash
# Patch expo-constants scripts to handle paths with spaces
# This fixes iOS builds when the project path contains spaces

SCRIPT="node_modules/expo-constants/scripts/get-app-config-ios.sh"

# Fix unquoted $PROJECT_DIR in basename call
if [ -f "$SCRIPT" ]; then
  sed -i '' 's/basename $PROJECT_DIR)/basename "$PROJECT_DIR")/' "$SCRIPT" 2>/dev/null
fi

# Fix unquoted path in podspec (uses Python to avoid shell escaping issues)
python3 scripts/patch-podspec.py

echo "Expo scripts patched for paths with spaces"
