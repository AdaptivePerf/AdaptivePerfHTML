# AdaptivePerfHTML: tool for analysing AdaptivePerf results
# Copyright (C) 2023 CERN.
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; only version 2 of the License.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License along
# with this program; if not, write to the Free Software Foundation, Inc.,
# 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import sys
import shutil
import html
from pathlib import Path
from jinja2 import Template
from .results import ProfilingResults


def create_html(results_path):
    template = Template(
        (Path(__file__).resolve().parent / 'templates' / 'viewer.html')
        .read_text())

    ids = ProfilingResults.get_all_ids(results_path)

    index_html = template.render(ids=ids, local=True,
                                 get_tree=lambda x: html.escape(
                                     ProfilingResults(results_path,
                                                      x).get_json_tree(),
                                     quote=True))

    with (results_path / 'index.html').open(mode='w') as f:
        f.write(index_html)

    script_files = (Path(__file__).resolve().parent / 'static').glob(
        'vis-timeline-graph2d.min*')

    for script_file in script_files:
        shutil.copy(script_file, results_path)


def main():
    if len(sys.argv) != 2 or sys.argv[1] in ['-h', '--help']:
        print('Exactly one argument is required: the path to the "results" '
              'directory created by AdaptivePerf.', file=sys.stderr)
        print('You can also run adaptiveperf-html with "-h"/"--help" to print '
              'this message.', file=sys.stderr)
        sys.exit(1)

    path_str = sys.argv[1]
    path = Path(path_str)

    if not path.exists():
        print(f'{path} does not exist!', file=sys.stderr)
        sys.exit(1)

    create_html(path)

    print(f'Done! You can open {path.resolve() / "index.html"} '
          'in your web browser.', file=sys.stderr)


if __name__ == '__main__':
    main()
