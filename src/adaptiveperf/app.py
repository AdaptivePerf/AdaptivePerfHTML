import os
from flask import Flask, render_template, request, send_from_directory
from . import ProfilingResults

# Set the path to the profiling results storage here.
PROFILING_STORAGE = '/eos/user/m/mgraczyk/syclops-profiling'

app = Flask(__name__)

@app.get('/<identifier>/<path:path>')
def get(identifier, path):
    if ProfilingResults.is_identifier(identifier):
        return send_from_directory(os.path.join(PROFILING_STORAGE,
                                                'processed',
                                                identifier),
                                   path)
    else:
        return '', 404

@app.post('/<identifier>/')
def post(identifier):
    if 'tree' in request.values:
        return ProfilingResults(PROFILING_STORAGE, identifier).get_json_tree()
    else:
        return '', 400

@app.route('/')
def main():
    return render_template('viewer.html',
                           ids=ProfilingResults.get_all_ids(PROFILING_STORAGE),
                           local=False)
