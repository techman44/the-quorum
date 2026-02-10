#!/usr/bin/env bash
# Run schema migrations in order against the database.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Colour helpers ─────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

info()    { printf "${BLUE}[INFO]${NC}  %s\n" "$*"; }
success() { printf "${GREEN}[OK]${NC}    %s\n" "$*"; }
error()   { printf "${RED}[ERROR]${NC} %s\n" "$*"; }

# ── Load environment variables ─────────────────────────────────────────────
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_DIR/.env"
    set +a
else
    error ".env file not found at $PROJECT_DIR/.env"
    error "Copy .env.example to .env and fill in your database credentials."
    exit 1
fi

# ── Validate required variables ────────────────────────────────────────────
for var in DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME; do
    if [ -z "${!var:-}" ]; then
        error "Required variable $var is not set in .env"
        exit 1
    fi
done

# ── Check for psql ─────────────────────────────────────────────────────────
if ! command -v psql &>/dev/null; then
    error "psql not found. Install the PostgreSQL client tools."
    exit 1
fi

# ── Check for schema files ────────────────────────────────────────────────
SCHEMA_DIR="$PROJECT_DIR/schema"
shopt -s nullglob
SQL_FILES=("$SCHEMA_DIR"/*.sql)
shopt -u nullglob

if [ ${#SQL_FILES[@]} -eq 0 ]; then
    info "No SQL files found in $SCHEMA_DIR -- nothing to do."
    exit 0
fi

# ── Run migrations ─────────────────────────────────────────────────────────
info "Running schema migrations..."
info "Database: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo ""

FAILED=0
for f in "${SQL_FILES[@]}"; do
    printf "  Applying %-40s" "$(basename "$f")..."
    if PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -f "$f" \
        -v ON_ERROR_STOP=1 \
        --quiet \
        2>&1; then
        printf " ${GREEN}done${NC}\n"
    else
        printf " ${RED}FAILED${NC}\n"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
if [ $FAILED -gt 0 ]; then
    error "$FAILED migration(s) failed. Review the output above."
    exit 1
else
    success "All migrations applied successfully."
fi
