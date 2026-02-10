#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# The Quorum -- Cron Setup Script
# Adds (or removes) cron entries for all agents.
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VENV_PYTHON="$PROJECT_DIR/.venv/bin/python"
LOG_DIR="$PROJECT_DIR/logs"

# ── Colour helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { printf "${BLUE}[INFO]${NC}  %s\n" "$*"; }
success() { printf "${GREEN}[OK]${NC}    %s\n" "$*"; }
warn()    { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
error()   { printf "${RED}[ERROR]${NC} %s\n" "$*"; }

# ── Marker used to identify our cron entries ───────────────────────────────
CRON_MARKER="# the-quorum-managed"

# ── Define the schedule ────────────────────────────────────────────────────
build_cron_entries() {
    cat <<EOF
# The Quorum - Agent Schedule ${CRON_MARKER}
*/10 * * * * cd ${PROJECT_DIR} && ${VENV_PYTHON} -m agents.connector >> ${LOG_DIR}/connector.log 2>&1 ${CRON_MARKER}
0 * * * * cd ${PROJECT_DIR} && ${VENV_PYTHON} -m agents.executor >> ${LOG_DIR}/executor.log 2>&1 ${CRON_MARKER}
0 3 * * * cd ${PROJECT_DIR} && ${VENV_PYTHON} -m agents.strategist >> ${LOG_DIR}/strategist.log 2>&1 ${CRON_MARKER}
0 */4 * * * cd ${PROJECT_DIR} && ${VENV_PYTHON} -m agents.devils_advocate >> ${LOG_DIR}/devils_advocate.log 2>&1 ${CRON_MARKER}
0 */6 * * * cd ${PROJECT_DIR} && ${VENV_PYTHON} -m agents.opportunist >> ${LOG_DIR}/opportunist.log 2>&1 ${CRON_MARKER}
*/30 * * * * cd ${PROJECT_DIR} && ${VENV_PYTHON} -m agents.data_collector >> ${LOG_DIR}/data_collector.log 2>&1 ${CRON_MARKER}
EOF
}

# ── Remove existing Quorum cron entries ────────────────────────────────────
remove_cron_entries() {
    local current
    current="$(crontab -l 2>/dev/null || true)"

    if echo "$current" | grep -q "$CRON_MARKER"; then
        echo "$current" | grep -v "$CRON_MARKER" | crontab -
        success "Removed all The Quorum cron entries."
    else
        info "No existing Quorum cron entries found."
    fi
}

# ── Handle --remove flag ──────────────────────────────────────────────────
if [ "${1:-}" = "--remove" ]; then
    remove_cron_entries
    exit 0
fi

# ── Ensure logs directory exists ───────────────────────────────────────────
mkdir -p "$LOG_DIR"

# ── Show the user what will be added ──────────────────────────────────────
echo ""
info "The following cron entries will be installed:"
echo ""
printf "${CYAN}"
build_cron_entries | grep -v "^$"
printf "${NC}"
echo ""

info "Schedule summary:"
echo "  Connector        : every 10 minutes"
echo "  Executor          : every hour"
echo "  Strategist        : daily at 3:00 AM"
echo "  Devil's Advocate  : every 4 hours"
echo "  Opportunist       : every 6 hours"
echo "  Data Collector    : every 30 minutes"
echo ""

# ── Ask for confirmation ──────────────────────────────────────────────────
read -rp "$(printf "${BOLD}Install these cron entries? [Y/n]: ${NC}")" answer
answer="${answer:-y}"

if [[ ! "$answer" =~ ^[Yy] ]]; then
    info "Cron setup cancelled. You can run this script again later."
    exit 0
fi

# ── Remove any previous Quorum entries first (idempotent) ─────────────────
remove_cron_entries

# ── Install new entries ───────────────────────────────────────────────────
EXISTING="$(crontab -l 2>/dev/null || true)"
NEW_ENTRIES="$(build_cron_entries)"

# Combine existing crontab with new entries
{
    if [ -n "$EXISTING" ]; then
        echo "$EXISTING"
        echo ""
    fi
    echo "$NEW_ENTRIES"
} | crontab -

success "Cron entries installed."
echo ""
info "Verify with: crontab -l"
info "Remove with: $SCRIPT_DIR/setup_cron.sh --remove"
echo ""
