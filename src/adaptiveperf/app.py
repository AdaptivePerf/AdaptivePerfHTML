# AdaptivePerfHTML: Tool for producing HTML summary of AdaptivePerf results
# Copyright (C) CERN. See LICENSE for details.

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
            identifier), path)
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
                           local=False, tolerance=0.5)
