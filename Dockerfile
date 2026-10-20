# config2mcp — MCP server container for Glama safety & quality checks.
#
# Runs the published npm package over stdio. Mount or copy your own YAML
# config to /config/tools.yaml to expose different CLI tools.
#
# Build:  docker build -t config2mcp .
# Run:    docker run -i --rm -v $PWD/tools.yaml:/config/tools.yaml:ro config2mcp
#         (or rely on the bundled read-only examples below)

FROM node:22-slim

# npm cache in a writable location; never touch ~/.npm
ENV npm_config_cache=/opt/npm-cache \
    NODE_ENV=production

# A safe default config: read-only file listing tools.
# Mount your own over /config/tools.yaml for anything else.
COPY examples/dsh-demo.yaml /config/tools.yaml

# Smoke test: pull and run the package once at build time to fail fast
# if the registry or the package is broken.
RUN npx -y config2mcp@latest validate /config/tools.yaml

# MCP stdio server. Glama connects over stdin/stdout.
ENTRYPOINT ["npx", "-y", "config2mcp@latest", "serve", "/config/tools.yaml"]
