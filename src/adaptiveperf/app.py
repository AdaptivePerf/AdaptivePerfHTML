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

import os
from flask import Flask, render_template, request, send_from_directory
from . import ProfilingResults, Identifier


app = Flask(__name__)
app.config.from_prefixed_env()


if 'PROFILING_STORAGE' not in app.config:
    raise RuntimeError('Please set FLASK_PROFILING_STORAGE environment '
                       'variable to the absolute path to a directory where '
                       'AdaptivePerf profiling results are stored '
                       '(usually "results").')


@app.get('/<identifier>/<path:path>')
def get(identifier, path):
    try:
        # Check if identifier is correct by verifying that ValueError
        # is not raised
        Identifier(identifier)

        return send_from_directory(os.path.join(
            app.config['PROFILING_STORAGE'],
            identifier,
            'processed'), path)
    except ValueError:
        return '', 404


@app.post('/<identifier>/')
def post(identifier):
    try:
        # Check if identifier is correct by verifying that ValueError
        # is not raised
        Identifier(identifier)

        if 'tree' in request.values:
            return ProfilingResults(
                app.config['PROFILING_STORAGE'], identifier).get_json_tree()
        else:
            return '', 400
    except ValueError:
        return '', 404


@app.route('/')
def main():
    return render_template('viewer.html',
                           ids=ProfilingResults.get_all_ids(
                               app.config['PROFILING_STORAGE']),
                           local=False)
