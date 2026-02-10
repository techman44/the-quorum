#!/usr/bin/env bash
# The Quorum - Integration Manager
# Manage data source integrations for your Quorum agents.
#
# Usage:
#   ./scripts/manage_integrations.sh list              Show all integrations and status
#   ./scripts/manage_integrations.sh enable <name>     Enable an integration
#   ./scripts/manage_integrations.sh disable <name>    Disable an integration
#   ./scripts/manage_integrations.sh check             Validate all enabled integrations
#   ./scripts/manage_integrations.sh info <name>       Show details for an integration

set -euo pipefail

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/integrations/integrations.yaml"
ENV_FILE="$PROJECT_ROOT/.env"

# ── Colors ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Helpers ────────────────────────────────────────────────────────────────────

check_dependencies() {
    if ! command -v python3 &>/dev/null; then
        echo -e "${RED}Error: python3 is required but not found.${RESET}"
        exit 1
    fi
    if ! python3 -c "import yaml" &>/dev/null 2>&1; then
        echo -e "${RED}Error: PyYAML is required. Install with: pip install pyyaml${RESET}"
        exit 1
    fi
    if [ ! -f "$CONFIG_FILE" ]; then
        echo -e "${RED}Error: Config file not found at $CONFIG_FILE${RESET}"
        exit 1
    fi
}

# Use Python to read the YAML since bash can't parse YAML natively.
# This helper runs a small Python snippet and captures the output.
run_python() {
    python3 -c "
import yaml, os, sys

config_path = '$CONFIG_FILE'
with open(config_path) as f:
    config = yaml.safe_load(f)

integrations = config.get('integrations', {})

$1
"
}

# ── Commands ───────────────────────────────────────────────────────────────────

cmd_list() {
    echo ""
    echo -e "  ${BOLD}The Quorum - Available Integrations${RESET}"
    echo ""

    run_python "
for name, data in integrations.items():
    enabled = data.get('enabled', False)
    desc = data.get('description', '')
    agents = ', '.join(data.get('agents', []))
    setup = data.get('setup', {})
    env_var = setup.get('env_var', '')
    cred_type = setup.get('credentials_type', '')

    if enabled:
        # Check env var
        if env_var and not os.environ.get(env_var):
            status = 'MISCONFIGURED'
            color = '\033[1;33m'  # yellow
            symbol = '!'
        else:
            status = 'ACTIVE'
            color = '\033[0;32m'  # green
            symbol = '*'
    else:
        status = 'disabled'
        color = '\033[2m'  # dim
        symbol = '-'

    reset = '\033[0m'
    bold = '\033[1m'
    cyan = '\033[0;36m'

    print(f'  {color}{symbol} {name:<15} [{status}]{reset}')
    print(f'    {desc}')
    print(f'    {cyan}Agents:{reset} {agents}')
    if env_var:
        print(f'    {cyan}Env var:{reset} {env_var}')
    print()
"

    echo -e "  ${DIM}Use './scripts/manage_integrations.sh info <name>' for setup details.${RESET}"
    echo -e "  ${DIM}Use './scripts/manage_integrations.sh enable <name>' to enable.${RESET}"
    echo ""
}

cmd_enable() {
    local name="$1"

    # Verify integration exists
    exists=$(run_python "
print('yes' if '$name' in integrations else '')
")
    if [ -z "$exists" ]; then
        echo -e "${RED}Error: Unknown integration '$name'.${RESET}"
        echo -e "${DIM}Run './scripts/manage_integrations.sh list' to see available integrations.${RESET}"
        exit 1
    fi

    # Check if already enabled
    already=$(run_python "
data = integrations.get('$name', {})
print('yes' if data.get('enabled', False) else 'no')
")
    if [ "$already" = "yes" ]; then
        echo -e "${YELLOW}Integration '$name' is already enabled.${RESET}"
        exit 0
    fi

    # Use Python to update the YAML properly
    python3 -c "
import yaml

config_path = '$CONFIG_FILE'
with open(config_path) as f:
    content = f.read()

with open(config_path) as f:
    config = yaml.safe_load(f)

config['integrations']['$name']['enabled'] = True

# Use sed-like approach to preserve comments and formatting
# Find the line '  $name:' then find 'enabled: false' and replace
lines = content.split('\n')
in_section = False
for i, line in enumerate(lines):
    stripped = line.strip()
    # Check if we're entering the target integration section
    if stripped == '$name:' or stripped == '$name: ':
        in_section = True
        continue
    # Check if we've left the section (new top-level integration key)
    if in_section and stripped and not stripped.startswith('#') and not line.startswith('    ') and not line.startswith('\t\t'):
        if not line.startswith('  ') or (len(line) - len(line.lstrip())) <= 2:
            if ':' in stripped and not stripped.startswith('-') and not stripped.startswith('#'):
                in_section = False
                continue
    # Replace enabled: false with enabled: true in the target section
    if in_section and 'enabled:' in stripped and 'false' in stripped:
        lines[i] = line.replace('false', 'true')
        break

with open(config_path, 'w') as f:
    f.write('\n'.join(lines))
"

    echo -e "${GREEN}Enabled integration: ${BOLD}$name${RESET}"

    # Show setup instructions
    run_python "
data = integrations.get('$name', {})
setup = data.get('setup', {})
env_var = setup.get('env_var', '')
instructions = setup.get('instructions', '')
cred_type = setup.get('credentials_type', '')

cyan = '\033[0;36m'
yellow = '\033[1;33m'
reset = '\033[0m'

if env_var:
    env_set = bool(os.environ.get(env_var))
    if not env_set:
        print(f'\n  {yellow}Next step:{reset} Set the required environment variable:')
        print(f'    {cyan}{env_var}{reset}')
        print(f'    {instructions}')
    else:
        print(f'\n  Environment variable {env_var} is set.')
elif instructions:
    print(f'\n  {cyan}Setup:{reset} {instructions}')

print()
"
}

cmd_disable() {
    local name="$1"

    # Verify integration exists
    exists=$(run_python "
print('yes' if '$name' in integrations else '')
")
    if [ -z "$exists" ]; then
        echo -e "${RED}Error: Unknown integration '$name'.${RESET}"
        exit 1
    fi

    # Check if already disabled
    already=$(run_python "
data = integrations.get('$name', {})
print('yes' if not data.get('enabled', False) else 'no')
")
    if [ "$already" = "yes" ]; then
        echo -e "${YELLOW}Integration '$name' is already disabled.${RESET}"
        exit 0
    fi

    # Use Python to update the YAML while preserving formatting
    python3 -c "
config_path = '$CONFIG_FILE'
with open(config_path) as f:
    content = f.read()

lines = content.split('\n')
in_section = False
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped == '$name:' or stripped == '$name: ':
        in_section = True
        continue
    if in_section and stripped and not stripped.startswith('#') and not line.startswith('    ') and not line.startswith('\t\t'):
        if not line.startswith('  ') or (len(line) - len(line.lstrip())) <= 2:
            if ':' in stripped and not stripped.startswith('-') and not stripped.startswith('#'):
                in_section = False
                continue
    if in_section and 'enabled:' in stripped and 'true' in stripped:
        lines[i] = line.replace('true', 'false')
        break

with open(config_path, 'w') as f:
    f.write('\n'.join(lines))
"

    echo -e "${GREEN}Disabled integration: ${BOLD}$name${RESET}"
    echo ""
}

cmd_check() {
    echo ""
    echo -e "  ${BOLD}The Quorum - Integration Validation${RESET}"
    echo ""

    run_python "
enabled = {k: v for k, v in integrations.items() if v.get('enabled', False)}

if not enabled:
    print('  No integrations are currently enabled.')
    print('  Run ./scripts/manage_integrations.sh list to see available integrations.')
    print()
    sys.exit(0)

green = '\033[0;32m'
red = '\033[0;31m'
yellow = '\033[1;33m'
cyan = '\033[0;36m'
bold = '\033[1m'
reset = '\033[0m'

has_issues = False

for name, data in enabled.items():
    setup = data.get('setup', {})
    env_var = setup.get('env_var', '')
    cred_type = setup.get('credentials_type', '')
    instructions = setup.get('instructions', '')

    issues = []

    # Check env var
    if env_var and not os.environ.get(env_var):
        issues.append(f'Missing env var: {env_var}')

    # Check filesystem paths
    config = data.get('config', {})
    if cred_type == 'filesystem':
        vault_path = config.get('vault_path', '')
        if not vault_path:
            issues.append('No vault_path configured in integrations.yaml')

    if issues:
        has_issues = True
        print(f'  {red}FAIL{reset}  {bold}{name}{reset}')
        for issue in issues:
            print(f'         {issue}')
        if instructions:
            print(f'         {cyan}Setup:{reset} {instructions}')
    else:
        print(f'  {green}OK{reset}    {bold}{name}{reset}')

print()

if has_issues:
    print(f'  {yellow}Some integrations need attention. See above for details.{reset}')
else:
    print(f'  {green}All enabled integrations are properly configured.{reset}')
print()
"
}

cmd_info() {
    local name="$1"

    exists=$(run_python "
print('yes' if '$name' in integrations else '')
")
    if [ -z "$exists" ]; then
        echo -e "${RED}Error: Unknown integration '$name'.${RESET}"
        exit 1
    fi

    echo ""
    run_python "
data = integrations.get('$name', {})
enabled = data.get('enabled', False)
desc = data.get('description', '')
benefit = data.get('benefit', '')
agents = ', '.join(data.get('agents', []))
setup = data.get('setup', {})
env_var = setup.get('env_var', '')
cred_type = setup.get('credentials_type', '')
instructions = setup.get('instructions', '')
config = data.get('config', {})

green = '\033[0;32m'
red = '\033[0;31m'
yellow = '\033[1;33m'
cyan = '\033[0;36m'
bold = '\033[1m'
dim = '\033[2m'
reset = '\033[0m'

status_color = green if enabled else dim
status_text = 'ENABLED' if enabled else 'DISABLED'

print(f'  {bold}{\"$name\".upper()}{reset}  [{status_color}{status_text}{reset}]')
print()
print(f'  {cyan}Description:{reset}')
print(f'    {desc}')
print()
print(f'  {cyan}Benefit:{reset}')
print(f'    {benefit}')
print()
print(f'  {cyan}Available to agents:{reset}')
print(f'    {agents}')
print()
print(f'  {cyan}Authentication:{reset}')
print(f'    Type: {cred_type}')
if env_var:
    env_set = bool(os.environ.get(env_var))
    env_status = f'{green}SET{reset}' if env_set else f'{red}NOT SET{reset}'
    print(f'    Env var: {env_var} [{env_status}]')
print()
print(f'  {cyan}Setup instructions:{reset}')
print(f'    {instructions}')
print()
if config:
    print(f'  {cyan}Configuration:{reset}')
    for k, v in config.items():
        print(f'    {k}: {v}')
    print()
"
}

cmd_help() {
    echo ""
    echo -e "  ${BOLD}The Quorum - Integration Manager${RESET}"
    echo ""
    echo -e "  ${CYAN}Usage:${RESET}"
    echo -e "    $0 ${GREEN}list${RESET}              Show all integrations and their status"
    echo -e "    $0 ${GREEN}enable${RESET} <name>     Enable an integration"
    echo -e "    $0 ${GREEN}disable${RESET} <name>    Disable an integration"
    echo -e "    $0 ${GREEN}check${RESET}             Validate all enabled integrations"
    echo -e "    $0 ${GREEN}info${RESET} <name>       Show detailed info for an integration"
    echo -e "    $0 ${GREEN}help${RESET}              Show this help message"
    echo ""
    echo -e "  ${CYAN}Available integrations:${RESET}"
    echo -e "    gmail, calendar, slack, telegram, paperless, obsidian,"
    echo -e "    location, weather, crm, github, n8n"
    echo ""
    echo -e "  ${CYAN}Examples:${RESET}"
    echo -e "    $0 enable gmail        ${DIM}# Enable Gmail integration${RESET}"
    echo -e "    $0 info slack          ${DIM}# See Slack setup instructions${RESET}"
    echo -e "    $0 check               ${DIM}# Verify all enabled integrations${RESET}"
    echo ""
}

# ── Main ───────────────────────────────────────────────────────────────────────

check_dependencies

case "${1:-help}" in
    list)
        cmd_list
        ;;
    enable)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Please specify an integration name.${RESET}"
            echo -e "${DIM}Usage: $0 enable <name>${RESET}"
            exit 1
        fi
        cmd_enable "$2"
        ;;
    disable)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Please specify an integration name.${RESET}"
            echo -e "${DIM}Usage: $0 disable <name>${RESET}"
            exit 1
        fi
        cmd_disable "$2"
        ;;
    check)
        cmd_check
        ;;
    info)
        if [ -z "${2:-}" ]; then
            echo -e "${RED}Error: Please specify an integration name.${RESET}"
            echo -e "${DIM}Usage: $0 info <name>${RESET}"
            exit 1
        fi
        cmd_info "$2"
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${RESET}"
        cmd_help
        exit 1
        ;;
esac
