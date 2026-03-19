#!/bin/sh
# Generate runtime config from environment variables.
# This runs at container start, BEFORE nginx serves files,
# so users can change URLs without rebuilding the image.

API_BASE_URL="${API_BASE_URL:-}"
WS_BASE_URL="${WS_BASE_URL:-}"

cat > /usr/share/nginx/html/env-config.js << EOF
window.__DOCKER_ENV__ = {
  API_URL: "${API_BASE_URL}/api",
  BASE_URL: "${API_BASE_URL}",
  WS_BASE_URL: "${WS_BASE_URL}"
};
EOF

# Inject the env-config.js script tag into index.html if not already present
if ! grep -q "env-config.js" /usr/share/nginx/html/index.html; then
  sed -i 's|<head>|<head><script src="/env-config.js"></script>|' /usr/share/nginx/html/index.html
fi

exec "$@"
