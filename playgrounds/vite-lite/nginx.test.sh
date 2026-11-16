#!/usr/bin/env bash
# Routing test for the studio nginx.conf. Serves a fixture site with the same
# nginx image the Dockerfile uses and checks what each path returns, both
# through the load balancer (which strips /studio) and on direct Cloud Run access.
# Usage: playgrounds/vite-lite/nginx.test.sh   (needs docker and curl)
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
image=nginx:alpine
port=${NGINX_TEST_PORT:-18080}
site=$(mktemp -d)
name=studio-nginx-test-$$
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$site"' EXIT

mkdir -p "$site/assets" "$site/widget-assets"
echo 'index page' >"$site/index.html"
echo 'widget page' >"$site/widget.html"
echo 'healthy' >"$site/health"
echo 'app js' >"$site/assets/app-abc123.js"
echo 'app css' >"$site/assets/app-abc123.css"
echo 'logo png' >"$site/assets/logo.png"
echo 'widget js' >"$site/widget-assets/swapkit-widget.js"
chmod -R a+rX "$site"

docker run -d --name "$name" -p "127.0.0.1:$port:8080" \
  -v "$here/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$site:/usr/share/nginx/html:ro" "$image" >/dev/null

for _ in $(seq 1 50); do
  curl -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1 && break
  sleep 0.2
done

failures=0
# expect PATH STATUS BODY   (BODY '*' accepts any body)
expect() {
  local path=$1 status=$2 body=$3 got_status got_body
  got_body=$(curl -sS -o - -w '\n%{http_code}' "http://127.0.0.1:$port$path")
  got_status=${got_body##*$'\n'}
  got_body=${got_body%$'\n'*}
  if [[ $got_status == "$status" && ($body == '*' || $got_body == "$body") ]]; then
    echo "ok   $path -> $got_status"
  else
    echo "FAIL $path -> $got_status '$got_body' (want $status '$body')"
    failures=$((failures + 1))
  fi
}

# Through the LB: /studio is already stripped.
expect / 200 'index page'
expect /assets/app-abc123.js 200 'app js'
expect /assets/app-abc123.css 200 'app css'
expect /widget.html 200 'widget page'
expect /widget-assets/swapkit-widget.js 200 'widget js'
expect /some/client/route 200 'index page'
expect /assets/missing.js 404 '*'

# Direct Cloud Run access: the /studio prefix must be stripped by nginx.
expect /studio 200 'index page'
expect /studio/ 200 'index page'
expect /studio/assets/app-abc123.js 200 'app js'
expect /studio/assets/app-abc123.css 200 'app css'
expect /studio/assets/logo.png 200 'logo png'
expect /studio/widget.html 200 'widget page'
expect /studio/widget-assets/swapkit-widget.js 200 'widget js'

docker logs "$name" 2>&1 | grep -E '\[(emerg|crit|alert)\]' && failures=$((failures + 1))
if ((failures)); then
  echo "$failures failure(s)"
  exit 1
fi
echo 'all routes ok'
