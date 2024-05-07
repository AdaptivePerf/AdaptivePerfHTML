# AdaptivePerfHTML: Tool for producing HTML summary of AdaptivePerf results
# Copyright (C) CERN. See LICENSE for details.

from flask import Flask, render_template, request
from . import ProfilingResults, Identifier


app = Flask(__name__)
app.config.from_prefixed_env()


if 'PROFILING_STORAGE' not in app.config:
    raise RuntimeError('Please set FLASK_PROFILING_STORAGE environment '
                       'variable to the absolute path to a directory where '
                       'AdaptivePerf profiling results are stored '
                       '(usually "results").')


@app.post('/<identifier>/')
def post(identifier):
    try:
        # Check if identifier is correct by verifying that ValueError
        # is not raised
        Identifier(identifier)

        if 'tree' in request.values or 'perf_map' in request.values or \
           ('pid' in request.values and 'tid' in request.values and
            'threshold' in request.values) or \
           'callchain' in request.values:
            results = ProfilingResults(app.config['PROFILING_STORAGE'],
                                       identifier)

            if 'tree' in request.values:
                return results.get_json_tree()
            elif 'perf_map' in request.values:
                return results.get_perf_maps()
            elif 'pid' in request.values and 'tid' in request.values and \
                 'threshold' in request.values:
                json_data = results.get_flame_graph(
                    request.values['pid'],
                    request.values['tid'],
                    float(request.values['threshold']))

                if json_data is None:
                    return '', 404
                else:
                    return json_data
            elif 'callchain' in request.values:
                return results.get_callchain_mappings()
        else:
            return '', 400
    except ValueError:
        return '', 404


@app.route('/')
def main():
    return render_template('viewer.html',
                           ids=ProfilingResults.get_all_ids(
                               app.config['PROFILING_STORAGE']),
                           offcpu_sampling=app.config.get(
                               'OFFCPU_SAMPLING', 500))
