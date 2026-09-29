#!/bin/sh
set -e

# Datenbank-Migrationen anwenden (mehrere Container gleichzeitig sind unkritisch –
# Prisma sperrt die Migrationstabelle). Mit RUN_MIGRATIONS=false abschaltbar.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Wende Datenbank-Migrationen an…"
  n=0
  until prisma migrate deploy --schema ./prisma/schema.prisma; do
    n=$((n + 1))
    if [ "$n" -ge 20 ]; then
      echo "Datenbank nicht erreichbar – Abbruch." >&2
      exit 1
    fi
    echo "Datenbank noch nicht bereit, neuer Versuch in 3s ($n/20)…"
    sleep 3
  done
fi

exec "$@"
