import os
import sys

# Vercel builds this file as the serverless function entry point, but app.py (and its sibling
# modules — grading.py, charts.py, cases.json) lives one directory up, at the project root.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import app  # noqa: E402  (import after sys.path fix, on purpose)
