# SPDX-FileCopyrightText: 2026 CERN
# SPDX-License-Identifier: LGPL-3.0-or-later

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'src'))

project = 'Adaptyst Analyser'
extensions = ['sphinx.ext.autodoc']
templates_path = []
exclude_patterns = ['_build']

html_theme = 'alabaster'
