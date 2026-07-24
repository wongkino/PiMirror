#!/bin/bash
# Compatibility wrapper → installers/mm.sh (local or client per MM_MODE)
exec "$(dirname "$0")/installers/mm.sh"
