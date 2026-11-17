# Disposable CI test image: PostgreSQL 16 + PostGIS 3.4 + pg_partman
# Used by Phase 4.1.4 to verify the full migration chain.
# NOT for production use.

FROM postgres:16-bookworm

USER root

# Install PostGIS, pg_partman from PGDG bookworm-pgdg repo
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      gnupg \
 && curl --http1.1 --retry 5 --retry-all-errors --retry-delay 2 -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /tmp/pgdg.asc \
 && gpg --dearmor -o /usr/share/keyrings/pgdg.gpg /tmp/pgdg.asc \
 && rm -f /tmp/pgdg.asc \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      postgresql-16-postgis-3 \
      postgresql-16-postgis-3-scripts \
      postgresql-16-partman \
 && rm -rf /var/lib/apt/lists/* \
 && test -f /usr/share/postgresql/16/extension/pg_partman.control \
 && echo "=== Installed packages ===" \
 && dpkg -l | grep -E "postgis|partman" \
 && echo "=== Extension control files ===" \
 && find /usr -name "*.control" 2>/dev/null | grep -E "postgis|partman" || echo "No control files found"
