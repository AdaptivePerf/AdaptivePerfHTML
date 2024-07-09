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
    """
    Process a POST request relevant to a profiling session with
    a given identifier. The request should have one of the following
    arguments:
    * "tree" (with any value):
      This instructs AdaptivePerfHTML to return the thread/process
      tree obtained in the session.
    * "perf_map" (with any value):
      This instructs AdaptivePerfHTML to return perf symbol maps
      obtained in the session.
    * "pid" (with a numeric value) and "tid" (with a numeric value)
      and "threshold" (with a decimal value):
      This instructs AdaptivePerfHTML to return a flame graph of
      the thread/process with a given PID and TID to be rendered by
      d3-flame-graph, taking into account not to render blocks taking
      less than a specified share of total samples (e.g. if "threshold" is
      set to 0.10, blocks taking less than 10% of total samples
      will not be effectively rendered).
    * "callchain" (with any value):
      This instructs AdaptivePerfHTML to return the session dictionaries
      mapping compressed symbol names to full symbol names.

    :param str identifier: A profiling session identifier in the form
                           described in the Identifier class docstring.
    """
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
