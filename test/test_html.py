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

import pytest
from pathlib import Path
from adaptiveperf.html import create_html


@pytest.fixture()
def results_dir():
    # Pointing to the incomplete results directory, but
    # that's OK: the local HTML producer cares only for
    # the names of folders inside along with
    # syscalls.data, offcpu.data, and new_proc_callchains.data.

    dir = Path(__file__).parent / 'adaptiveperf_results'

    yield dir

    (dir / 'index.html').unlink(missing_ok=True)
    (dir / 'vis-timeline-graph2d.min.js').unlink(missing_ok=True)
    (dir / 'vis-timeline-graph2d.min.css').unlink(missing_ok=True)


def test_page_created(results_dir):
    create_html(results_dir)

    assert (results_dir / 'index.html').exists()
    assert len((results_dir / 'index.html').read_text().strip()) > 0
    assert (results_dir / 'vis-timeline-graph2d.min.js').exists()
    assert (results_dir / 'vis-timeline-graph2d.min.css').exists()
