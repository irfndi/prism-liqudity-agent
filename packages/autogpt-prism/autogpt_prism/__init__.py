"""AutoGPT plugin for Prism — autonomous Solana liquidity agent."""
from __future__ import annotations

import shutil
import subprocess
import sys
from typing import Any, Dict, List, Optional, Tuple, TypeVar, TypedDict

from auto_gpt_plugin_template import AutoGPTPluginTemplate

PromptGenerator = TypeVar("PromptGenerator")


class Message(TypedDict):
    role: str
    content: str


_INSTALL_URL = (
    "https://raw.githubusercontent.com/irfndi/prism-liquidity-agent"
    "/main/scripts/install.sh"
)


def _find_prism() -> str:
    """Locate the ``prism`` binary on PATH."""
    path = shutil.which("prism")
    if path is not None:
        return path
    raise FileNotFoundError(
        "prism CLI not found on PATH. Run the prism_install command first, "
        "or install Prism manually: "
        f"curl -fsSL {_INSTALL_URL} | bash"
    )


def _run_prism(*args: str, timeout: int = 120) -> str:
    """Run a prism CLI command and return combined stdout+stderr."""
    prism = _find_prism()
    cmd = [prism, *args]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        output = (result.stdout + result.stderr).strip()
        if result.returncode != 0:
            return f"Exit code {result.returncode}\n{output}" if output else (
                f"Exit code {result.returncode} (no output)"
            )
        return output or "(no output)"
    except subprocess.TimeoutExpired:
        return f"Command timed out after {timeout}s: prism {' '.join(args)}"
    except FileNotFoundError as exc:
        return str(exc)
    except OSError as exc:
        return f"Failed to execute prism: {exc}"


# ---------------------------------------------------------------------------
# Command callbacks
# ---------------------------------------------------------------------------

def _prism_install(**_kwargs: Any) -> str:
    """Run the Prism one-liner install script."""
    try:
        result = subprocess.run(
            ["bash", "-c", f"curl -fsSL {_INSTALL_URL} | bash"],
            capture_output=True,
            text=True,
            timeout=180,
        )
        output = (result.stdout + result.stderr).strip()
        if result.returncode != 0:
            return (
                f"Install failed (exit {result.returncode})\n{output}"
                if output
                else f"Install failed (exit {result.returncode})"
            )
        return (
            f"Prism installed successfully.\n{output}\n\n"
            "Run 'prism --help' to verify, then use prism_setup to configure."
        )
    except subprocess.TimeoutExpired:
        return "Install timed out after 180s. Check your network connection."
    except OSError as exc:
        return f"Failed to run installer: {exc}"


def _prism_setup(helius_key: str = "", **_kwargs: Any) -> str:
    """Run ``prism setup`` with the provided Helius API key."""
    if not helius_key or not helius_key.strip():
        return (
            "Error: helius_key is required. "
            "Get a free key at https://helius.dev"
        )
    return _run_prism(
        "setup", "--non-interactive", "--helius-key", helius_key.strip()
    )


def _prism_start(**_kwargs: Any) -> str:
    """Start Prism in paper-trading mode (``prism dev``) as a background process."""
    try:
        prism = _find_prism()
        # Start in background so AutoGPT doesn't block forever
        proc = subprocess.Popen(
            [prism, "dev"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        return (
            f"Prism agent started in background (PID {proc.pid}). "
            "Use prism_status to verify it's running."
        )
    except FileNotFoundError as exc:
        return str(exc)
    except OSError as exc:
        return f"Failed to start agent: {exc}"


def _prism_status(**_kwargs: Any) -> str:
    """Get current Prism status."""
    try:
        prism = _find_prism()
        result = subprocess.run(
            [prism, "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return (result.stdout + result.stderr).strip() or "prism is installed"
    except FileNotFoundError as exc:
        return str(exc)
    except subprocess.TimeoutExpired:
        return "Status check timed out"
    except OSError as exc:
        return f"Failed to check status: {exc}"


def _prism_stop(**_kwargs: Any) -> str:
    """Stop the running Prism agent (best-effort)."""
    try:
        # prism doesn't have a dedicated stop command; kill the background process
        result = subprocess.run(
            ["pkill", "-f", "bun.*engine/index.ts"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return "Prism agent stopped."
        # Also try killing by the prism wrapper name
        result2 = subprocess.run(
            ["pkill", "-f", "prism dev"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result2.returncode == 0:
            return "Prism agent stopped."
        return (
            "No running Prism agent found. "
            "If Prism is running in another terminal, stop it manually."
        )
    except FileNotFoundError:
        # pkill not available (Windows)
        return (
            "Automatic stop is not supported on this platform. "
            "Stop Prism manually or close the terminal running 'prism dev'."
        )
    except OSError as exc:
        return f"Failed to stop agent: {exc}"


# ---------------------------------------------------------------------------
# Plugin class
# ---------------------------------------------------------------------------

class AutoGPTPrism(AutoGPTPluginTemplate):
    """AutoGPT plugin that exposes Prism liquidity-agent commands."""

    def __init__(self) -> None:
        super().__init__()
        self._name = "AutoGPT-Prism-Plugin"
        self._version = "0.1.0"
        self._description = (
            "AutoGPT Prism Plugin: Manage an autonomous Solana liquidity agent."
        )
        self.load_commands = True

    # -- prompt hooks --------------------------------------------------------

    def can_handle_post_prompt(self) -> bool:
        return True

    def post_prompt(self, prompt: PromptGenerator) -> PromptGenerator:
        """Register Prism commands with AutoGPT's prompt generator."""
        prompt.add_command(
            "Install Prism liquidity agent",
            "prism_install",
            {},
            _prism_install,
        )
        prompt.add_command(
            "Setup Prism with Helius API key",
            "prism_setup",
            {"helius_key": "<helius_api_key>"},
            _prism_setup,
        )
        prompt.add_command(
            "Start Prism in paper-trading mode",
            "prism_start",
            {},
            _prism_start,
        )
        prompt.add_command(
            "Get Prism status",
            "prism_status",
            {},
            _prism_status,
        )
        prompt.add_command(
            "Stop the Prism agent",
            "prism_stop",
            {},
            _prism_stop,
        )
        return prompt

    # -- stubs for remaining abstract methods --------------------------------

    def can_handle_on_response(self) -> bool:
        return False

    def on_response(self, response: str, *args: Any, **kwargs: Any) -> str:
        return response

    def can_handle_on_planning(self) -> bool:
        return False

    def on_planning(
        self, prompt: PromptGenerator, messages: List[Message]
    ) -> Optional[str]:
        return None

    def can_handle_post_planning(self) -> bool:
        return False

    def post_planning(self, response: str) -> str:
        return response

    def can_handle_pre_instruction(self) -> bool:
        return False

    def pre_instruction(self, messages: List[Message]) -> List[Message]:
        return messages

    def can_handle_on_instruction(self) -> bool:
        return False

    def on_instruction(self, messages: List[Message]) -> Optional[str]:
        return None

    def can_handle_post_instruction(self) -> bool:
        return False

    def post_instruction(self, response: str) -> str:
        return response

    def can_handle_pre_command(self) -> bool:
        return False

    def pre_command(
        self, command_name: str, arguments: Dict[str, Any]
    ) -> Tuple[str, Dict[str, Any]]:
        return command_name, arguments

    def can_handle_post_command(self) -> bool:
        return False

    def post_command(self, command_name: str, response: str) -> str:
        return response

    def can_handle_chat_completion(
        self,
        messages: Dict[Any, Any],
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> bool:
        return False

    def handle_chat_completion(
        self,
        messages: List[Message],
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        return ""

    def can_handle_text_embedding(self, text: str) -> bool:
        return False

    def handle_text_embedding(self, text: str) -> List[float]:
        return []

    def can_handle_user_input(self, user_input: str) -> bool:
        return False

    def user_input(self, user_input: str) -> str:
        return user_input

    def can_handle_report(self) -> bool:
        return False

    def report(self, message: str) -> None:
        return None
