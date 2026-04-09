
default:
  @just --list

# Build all Docker images
build:
  docker compose build

# Build with no cache
build-fresh:
  docker compose build --no-cache
