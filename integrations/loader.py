"""Integration loader for The Quorum.

Loads integration configuration from integrations.yaml, validates that
required environment variables are set for enabled integrations, and
provides a simple API for agents to check integration availability.

Usage:
    from integrations.loader import integration_available, get_enabled_integrations

    if integration_available("gmail"):
        # proceed with Gmail access
        ...

    enabled = get_enabled_integrations()
    for name, config in enabled.items():
        print(f"{name}: {config['description']}")

Run directly to see integration status:
    python -m integrations.loader
"""
import os
import yaml
from pathlib import Path


def load_integrations(config_path: str = None) -> dict:
    """Load and validate integration configuration.

    Args:
        config_path: Path to integrations.yaml. Defaults to the file
                     in the same directory as this module.

    Returns:
        Dictionary of all integrations keyed by name.
    """
    if config_path is None:
        config_path = Path(__file__).parent / "integrations.yaml"

    with open(config_path) as f:
        config = yaml.safe_load(f)

    return config.get("integrations", {})


def get_enabled_integrations(config_path: str = None) -> dict:
    """Return only enabled integrations.

    Args:
        config_path: Path to integrations.yaml.

    Returns:
        Dictionary of enabled integrations keyed by name.
    """
    all_integrations = load_integrations(config_path)
    return {k: v for k, v in all_integrations.items() if v.get("enabled", False)}


def get_integrations_for_agent(agent_name: str, config_path: str = None) -> dict:
    """Return enabled integrations available to a specific agent.

    Args:
        agent_name: The agent identifier (e.g. 'connector', 'executor').
        config_path: Path to integrations.yaml.

    Returns:
        Dictionary of integrations this agent can use.
    """
    enabled = get_enabled_integrations(config_path)
    return {
        k: v for k, v in enabled.items()
        if agent_name in v.get("agents", [])
    }


def validate_integrations(config_path: str = None) -> list[dict]:
    """Check that enabled integrations have their required env vars set.

    Args:
        config_path: Path to integrations.yaml.

    Returns:
        List of issue dicts, each with 'integration', 'issue', and
        'instructions' keys. Empty list means all enabled integrations
        are properly configured.
    """
    issues = []
    enabled = get_enabled_integrations(config_path)

    for name, integration in enabled.items():
        setup = integration.get("setup", {})
        env_var = setup.get("env_var")
        if env_var and not os.getenv(env_var):
            issues.append({
                "integration": name,
                "issue": f"Missing environment variable: {env_var}",
                "instructions": setup.get("instructions", ""),
            })

    return issues


def integration_available(name: str, config_path: str = None) -> bool:
    """Check if a specific integration is enabled and configured.

    This is the primary function agents should call before attempting
    to use an integration. It checks both that the integration is
    enabled in the config and that all required environment variables
    are present.

    Args:
        name: Integration identifier (e.g. 'gmail', 'slack').
        config_path: Path to integrations.yaml.

    Returns:
        True if the integration is enabled and all required env vars are set.
    """
    enabled = get_enabled_integrations(config_path)
    if name not in enabled:
        return False
    issues = [i for i in validate_integrations(config_path) if i["integration"] == name]
    return len(issues) == 0


def get_integration_config(name: str, config_path: str = None) -> dict | None:
    """Get the config block for a specific enabled integration.

    Args:
        name: Integration identifier.
        config_path: Path to integrations.yaml.

    Returns:
        The integration's config dict, or None if not enabled.
    """
    enabled = get_enabled_integrations(config_path)
    if name not in enabled:
        return None
    return enabled[name].get("config", {})


def print_integration_status(config_path: str = None):
    """Print a formatted status of all integrations."""
    all_integrations = load_integrations(config_path)
    enabled = get_enabled_integrations(config_path)
    issues = validate_integrations(config_path)
    issue_names = {i["integration"] for i in issues}

    print("\n  The Quorum - Integration Status\n")
    print(f"  {'Integration':<15} {'Status':<15} {'Benefit'}")
    print(f"  {'-'*15} {'-'*15} {'-'*50}")

    for name, integration in all_integrations.items():
        if name in enabled:
            if name in issue_names:
                status = "MISCONFIGURED"
            else:
                status = "ACTIVE"
        else:
            status = "disabled"

        benefit = integration.get("benefit", "")[:50]
        print(f"  {name:<15} {status:<15} {benefit}")

    if issues:
        print(f"\n  Issues:")
        for issue in issues:
            print(f"    - {issue['integration']}: {issue['issue']}")
            print(f"      {issue['instructions']}")

    print()


if __name__ == "__main__":
    print_integration_status()
