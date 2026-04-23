"""chatviz — real-time AI chat proxy visualizer."""
from importlib.metadata import version, PackageNotFoundError

try:
    __version__ = version("chatviz")
except PackageNotFoundError:
    __version__ = "unknown"
