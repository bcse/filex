docker buildx build --platform linux/amd64,linux/arm64 -f Dockerfile -t ghcr.io/bcse/filex --load ..
docker push ghcr.io/bcse/filex:latest