# Isolated Butterbox browser/database test runner (built and started only by scripts/test-env.mjs).
# Mirrors the GitHub Actions "database" job: Ubuntu 24.04, Node.js 24.11.1 and Playwright-managed Chromium.
FROM ubuntu:24.04

ARG NODE_VERSION=24.11.1
ARG PLAYWRIGHT_VERSION=1.64.1
ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=true

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg xz-utils \
 && arch="$(dpkg --print-architecture)" \
 && case "$arch" in amd64) node_arch=x64 ;; arm64) node_arch=arm64 ;; *) echo "unsupported $arch" >&2; exit 1 ;; esac \
 && cd /tmp \
 && curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
 && curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" \
 && grep " node-v${NODE_VERSION}-linux-${node_arch}.tar.xz\$" SHASUMS256.txt | sha256sum -c - \
 && tar -xJf "node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" -C /usr/local --strip-components=1 --no-same-owner \
 && rm -f node-v*.tar.xz SHASUMS256.txt \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium \
 && chmod -R a+rX /ms-playwright \
 && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*

# The runner never receives a Docker socket: this shim only answers the disposable database lookups and psql
# sessions the test helpers make, pinned to the fixed test project.
COPY docker-shim.mjs /usr/local/bin/docker
COPY runner.mjs /opt/butterbox/runner.mjs
RUN chmod 0755 /usr/local/bin/docker && chmod 0644 /opt/butterbox/runner.mjs \
 && useradd --create-home --uid 10001 --shell /usr/sbin/nologin tester \
 && install -d -o tester -g tester /work /home/tester/.npm

USER tester
WORKDIR /work
ENTRYPOINT ["node", "/opt/butterbox/runner.mjs"]
