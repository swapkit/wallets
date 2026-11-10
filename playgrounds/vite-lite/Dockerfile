FROM oven/bun:1.3.13 AS builder
RUN apt-get update && apt-get install -y \
    python3 make gcc g++ git \
    linux-libc-dev libudev-dev libusb-dev \
    && rm -rf /var/lib/apt/lists/*
RUN git config --global user.email "docker@build.local" && \
    git config --global user.name "Docker Build"
WORKDIR /app
COPY . .
RUN git init && git add -A && git commit -m "initial" || true
RUN bun install --frozen-lockfile
RUN bun --cwd=packages/ui run build:widget
RUN VITE_BASE_PATH=/studio/ bun --cwd=playgrounds/vite-lite run build
RUN ls -la playgrounds/vite-lite/dist/ && \
    test -f playgrounds/vite-lite/dist/index.html || \
    (echo "Build failed" && exit 1)
RUN ls -la packages/ui/dist/widget/ && \
    test -f packages/ui/dist/widget/swapkit-widget.js || \
    (echo "Widget build failed" && exit 1)
FROM nginx:alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY --from=builder /app/playgrounds/vite-lite/dist /usr/share/nginx/html
COPY --from=builder /app/playgrounds/vite-lite/public/widget.html /usr/share/nginx/html/widget.html
COPY --from=builder /app/packages/ui/dist/widget /usr/share/nginx/html/widget-assets
COPY --from=builder /app/playgrounds/vite-lite/nginx.conf /etc/nginx/conf.d/default.conf
RUN echo "healthy" > /usr/share/nginx/html/health
RUN chmod -R 644 /usr/share/nginx/html/*.html && chmod -R 755 /usr/share/nginx/html/widget-assets
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
