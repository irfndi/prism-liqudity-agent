"""Basic tests for the autogpt-prism plugin."""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

from autogpt_prism import _find_prism, _prism_status


class TestFindPrism:
    """Test the binary resolution logic."""

    def test_finds_prism_on_path(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """If prism is on PATH, _find_prism returns it."""
        fake_path = shutil.which("python") or "/usr/bin/python"
        # Create a fake prism binary in a temp dir on PATH
        fake_dir = Path(__file__).parent / ".fake-bin"
        fake_dir.mkdir(exist_ok=True)
        fake_prism = fake_dir / "prism"
        fake_prism.write_text("#!/bin/sh\necho prism 0.0.8")
        fake_prism.chmod(0o755)

        monkeypatch.setenv("PATH", str(fake_dir), prepend=os.pathsep)
        result = _find_prism()
        assert result.endswith("prism")

        fake_prism.unlink()
        fake_dir.rmdir()

    def test_raises_when_not_found(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """If prism is not on PATH, _find_prism raises FileNotFoundError."""
        monkeypatch.setenv("PATH", "/nonexistent")
        with pytest.raises(FileNotFoundError):
            _find_prism()


class TestPrismStatus:
    """Test the status command (safe, read-only)."""

    def test_returns_string(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """_prism_status always returns a string."""
        # Force FileNotFoundError path
        monkeypatch.setenv("PATH", "/nonexistent")
        result = _prism_status()
        assert isinstance(result, str)
        assert "not found" in result.lower() or "install" in result.lower()


class TestPluginClass:
    """Test that the plugin class can be imported and instantiated."""

    def test_import_and_init(self) -> None:
        """AutoGPTPrism can be imported and instantiated."""
        from autogpt_prism import AutoGPTPrism

        plugin = AutoGPTPrism()
        assert plugin._name == "AutoGPT-Prism-Plugin"
        assert plugin._version == "0.1.0"

    def test_can_handle_post_prompt(self) -> None:
        """The plugin claims it can handle post_prompt."""
        from autogpt_prism import AutoGPTPrism

        plugin = AutoGPTPrism()
        assert plugin.can_handle_post_prompt() is True
