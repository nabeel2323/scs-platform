#!/bin/bash
set -e
# Retain the historical entry point, but delegate to the atomic, guarded runner.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/a2_apply_migrations.sh"
