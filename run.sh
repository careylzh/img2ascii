#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

VENV_DIR=".venv"

if [ ! -x "$VENV_DIR/bin/python" ]; then
    python3 -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip show Pillow >/dev/null 2>&1 || "$VENV_DIR/bin/python" -m pip install Pillow
"$VENV_DIR/bin/python" ascii.py "$@"
