"""Basic tests for the langchain-prism tool."""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import pytest

from langchain_prism import PrismTool, _find_prism_binary, run_prism


class TestFindPrism:
    """Test the binary resolution logic."""

    def test_finds_prism_on_path(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """If prism is on PATH, _find_prism returns it."""
        fake_dir = Path(__file__).parent / ".fake-bin"
        fake_dir.mkdir(exist_ok=True)
        fake_prism = fake_dir / "prism"
        fake_prism.write_text("#!/bin/sh\necho prism 0.0.8")
        fake_prism.chmod(0o755)

        monkeypatch.setenv("PATH", str(fake_dir), prepend=os.pathsep)
        result = _find_prism_binary()
        assert result.endswith("prism")

        fake_prism.unlink()
        fake_dir.rmdir()

    def test_raises_when_not_found(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """If prism is not on PATH, _find_prism_binary raises FileNotFoundError."""
        monkeypatch.setenv("PATH", "/nonexistent")
        with pytest.raises(FileNotFoundError):
            _find_prism_binary()


class TestRunPrism:
    """Test the low-level run_prism helper."""

    def test_returns_json_error_when_not_found(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """run_prism returns a JSON error when the binary is missing."""
        monkeypatch.setenv("PRISM_BIN", "/nonexistent/prism")
        result = run_prism(["--version"])
        assert not result.ok
        assert "not found" in result.stderr.lower() or "does not exist" in result.stderr.lower()


class TestPrismTool:
    """Test the LangChain tool interface."""

    def test_tool_name(self) -> None:
        """The tool has the correct name."""
        tool = PrismTool()
        assert tool.name == "prism"

    def test_tool_description(self) -> None:
        """The tool has a non-empty description."""
        tool = PrismTool()
        assert len(tool.description) > 0
        assert "prism" in tool.description.lower()

    def test_run_returns_string(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """run() always returns a string even when the binary is missing."""
        monkeypatch.setenv("PATH", "/nonexistent")
        tool = PrismTool()
        result = tool.run("status")
        assert isinstance(result, str)
        # Should be a JSON error object
        parsed = json.loads(result)
        assert "error" in parsed
