#!/bin/bash
set -e
cd /migrations
for f in $(ls *.sql | grep -v analytics | sort); do
  echo "=== Applying $f ==="
  psql -U postgres -d m73a_verify -f "$f" 2>&1 | tail -3
  echo ""
done
echo "=== ALL MIGRATIONS COMPLETE ==="
