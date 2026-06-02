#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"
python3 -m pip show Pillow >/dev/null 2>&1 || python3 -m pip install Pillow
python3 ascii.py "$@"
