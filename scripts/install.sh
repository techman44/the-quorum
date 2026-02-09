#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# The Quorum -- Install Script
# Checks prerequisites, sets up the database, Python venv, and cron jobs.
# Safe to run multiple times (idempotent).
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Colour helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No colour

info()    { printf "${BLUE}[INFO]${NC}  %s\n" "$*"; }
success() { printf "${GREEN}[OK]${NC}    %s\n" "$*"; }
warn()    { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
error()   { printf "${RED}[ERROR]${NC} %s\n" "$*"; }
header()  { printf "\n${BOLD}${CYAN}── %s${NC}\n" "$*"; }

# ── Trap: print a helpful message on unexpected failure ────────────────────
cleanup() {
    if [ $? -ne 0 ]; then
        echo ""
        error "Installation did not complete successfully."
        error "Review the output above for details, fix the issue, and re-run this script."
    fi
}
trap cleanup EXIT

# ── Helper: ask yes/no ─────────────────────────────────────────────────────
confirm() {
    local prompt="${1:-Continue?}"
    local default="${2:-y}"
    if [ "$default" = "y" ]; then
        read -rp "$(printf "${BOLD}%s [Y/n]: ${NC}" "$prompt")" answer
        answer="${answer:-y}"
    else
        read -rp "$(printf "${BOLD}%s [y/N]: ${NC}" "$prompt")" answer
        answer="${answer:-n}"
    fi
    [[ "$answer" =~ ^[Yy] ]]
}

# ═══════════════════════════════════════════════════════════════════════════
header "The Quorum -- Installation"
# ═══════════════════════════════════════════════════════════════════════════

echo ""
info "Project directory: $PROJECT_DIR"
echo ""

# ── 1. Check prerequisites ─────────────────────────────────────────────────
header "Checking prerequisites"

MISSING=()

# Python 3
if command -v python3 &>/dev/null; then
    PY_VERSION="$(python3 --version 2>&1)"
    success "python3 found ($PY_VERSION)"
else
    MISSING+=("python3")
    error "python3 not found"
fi

# pip (via python3 -m pip)
if python3 -m pip --version &>/dev/null 2>&1; then
    success "pip found ($(python3 -m pip --version 2>&1 | head -1))"
else
    MISSING+=("pip")
    error "pip not found (try: python3 -m ensurepip --upgrade)"
fi

# psql or docker -- at least one is required
HAS_PSQL=false
HAS_DOCKER=false

if command -v psql &>/dev/null; then
    HAS_PSQL=true
    success "psql found ($(psql --version 2>&1 | head -1))"
fi
if command -v docker &>/dev/null; then
    HAS_DOCKER=true
    success "docker found ($(docker --version 2>&1 | head -1))"
fi

if ! $HAS_PSQL && ! $HAS_DOCKER; then
    MISSING+=("psql or docker")
    error "Neither psql nor docker found. Install PostgreSQL or Docker to continue."
fi

if [ ${#MISSING[@]} -gt 0 ]; then
    echo ""
    error "Missing prerequisites: ${MISSING[*]}"
    error "Install the missing tools and re-run this script."
    exit 1
fi

# ── 2. Database setup ──────────────────────────────────────────────────────
header "Database setup"

USE_DOCKER="n"
if $HAS_DOCKER; then
    echo ""
    echo "How do you want to run PostgreSQL?"
    echo "  1) Docker (recommended -- uses docker-compose with pgvector)"
    echo "  2) Existing PostgreSQL instance"
    echo ""
    read -rp "$(printf "${BOLD}Choose [1/2]: ${NC}")" db_choice
    db_choice="${db_choice:-1}"

    if [ "$db_choice" = "1" ]; then
        USE_DOCKER="y"
    fi
else
    info "Docker not found; will use your existing PostgreSQL instance."
fi

if [ "$USE_DOCKER" = "y" ]; then
    info "Starting PostgreSQL via docker-compose..."

    # Make sure .env exists before docker-compose reads it
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
        warn "Created .env from .env.example -- remember to edit it later."
    fi

    # Prefer 'docker compose' (v2) but fall back to 'docker-compose' (v1)
    if docker compose version &>/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &>/dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        error "docker-compose not found. Install the Docker Compose plugin."
        exit 1
    fi

    (cd "$PROJECT_DIR" && $COMPOSE_CMD up -d)
    success "PostgreSQL container is running."
    info "Waiting 5 seconds for the database to accept connections..."
    sleep 5
else
    echo ""
    info "Enter your existing PostgreSQL connection details."
    info "Press Enter to accept the default shown in [brackets]."
    echo ""

    read -rp "  DB host [localhost]: " input_host
    read -rp "  DB port [5432]: "      input_port
    read -rp "  DB user [quorum]: "    input_user
    read -rsp "  DB password [changeme]: " input_pass
    echo ""
    read -rp "  DB name [quorum]: "    input_name

    DB_HOST="${input_host:-localhost}"
    DB_PORT="${input_port:-5432}"
    DB_USER="${input_user:-quorum}"
    DB_PASSWORD="${input_pass:-changeme}"
    DB_NAME="${input_name:-quorum}"

    # We will write these into .env in the next step if the file does not exist.
    CUSTOM_DB_VARS=true
fi

# ── 3. Environment file ───────────────────────────────────────────────────
header "Environment configuration"

if [ -f "$PROJECT_DIR/.env" ]; then
    success ".env already exists -- skipping copy."
else
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    success "Created .env from .env.example."
fi

# Patch in custom DB vars if the user entered them manually
if [ "${CUSTOM_DB_VARS:-false}" = "true" ]; then
    # Use portable sed that works on both macOS and Linux
    _sed_inplace() {
        if sed --version 2>/dev/null | grep -q GNU; then
            sed -i "$@"
        else
            sed -i '' "$@"
        fi
    }
    _sed_inplace "s|^DB_HOST=.*|DB_HOST=${DB_HOST}|"         "$PROJECT_DIR/.env"
    _sed_inplace "s|^DB_PORT=.*|DB_PORT=${DB_PORT}|"         "$PROJECT_DIR/.env"
    _sed_inplace "s|^DB_USER=.*|DB_USER=${DB_USER}|"         "$PROJECT_DIR/.env"
    _sed_inplace "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD}|" "$PROJECT_DIR/.env"
    _sed_inplace "s|^DB_NAME=.*|DB_NAME=${DB_NAME}|"         "$PROJECT_DIR/.env"
    success "Database credentials written to .env."
fi

warn "Review $PROJECT_DIR/.env and set your LLM / embedding provider keys."

# ── 4. Python virtual environment ─────────────────────────────────────────
header "Python virtual environment"

VENV_DIR="$PROJECT_DIR/.venv"
if [ -d "$VENV_DIR" ]; then
    success "Virtual environment already exists at .venv/"
else
    info "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
    success "Virtual environment created at .venv/"
fi

info "Installing Python dependencies..."
"$VENV_DIR/bin/pip" install --upgrade pip --quiet
"$VENV_DIR/bin/pip" install -r "$PROJECT_DIR/requirements.txt" --quiet
success "Python dependencies installed."

# ── 5. Create logs directory ───────────────────────────────────────────────
mkdir -p "$PROJECT_DIR/logs"
success "logs/ directory ready."

# ── 6. Run schema migrations ──────────────────────────────────────────────
header "Database migrations"

# Source .env so the migrate script picks up the correct vars
set -a
# shellcheck disable=SC1091
source "$PROJECT_DIR/.env"
set +a

if $HAS_PSQL; then
    info "Running schema migrations..."
    chmod +x "$SCRIPT_DIR/migrate.sh"
    "$SCRIPT_DIR/migrate.sh"
    success "Schema migrations applied."
else
    warn "psql not found locally -- skipping migrations."
    if [ "$USE_DOCKER" = "y" ]; then
        info "The Docker container automatically applies schema files on first start"
        info "(they are mounted into /docker-entrypoint-initdb.d)."
    else
        warn "You will need to run scripts/migrate.sh manually once psql is available."
    fi
fi

# ── 7. Cron jobs ──────────────────────────────────────────────────────────
header "Cron schedule"

echo ""
if confirm "Set up cron jobs for the agents?" "y"; then
    chmod +x "$SCRIPT_DIR/setup_cron.sh"
    "$SCRIPT_DIR/setup_cron.sh"
else
    info "Skipping cron setup. You can run scripts/setup_cron.sh later."
fi

# ── Done ──────────────────────────────────────────────────────────────────
header "Installation complete"

echo ""
success "The Quorum is ready."
echo ""
info "Next steps:"
echo "  1. Edit ${PROJECT_DIR}/.env with your LLM and embedding provider keys."
echo "  2. Make sure your embedding model is available"
echo "     (e.g. ollama pull mxbai-embed-large)."
echo "  3. Test an agent manually:"
echo "     cd ${PROJECT_DIR} && .venv/bin/python -m agents.connector"
echo "  4. Check logs in ${PROJECT_DIR}/logs/"
echo ""
info "Documentation: ${PROJECT_DIR}/docs/deployment.md"
echo ""
