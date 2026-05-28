# SPDX-FileCopyrightText: 2026 CERN
# SPDX-License-Identifier: LGPL-3.0-or-later

import traceback
import yaml
import json
from . import arrangements as arrgmts
from flask import Flask, render_template, request
from pathlib import Path
from . import Session
from importlib.metadata import version
from importlib import import_module


app = Flask(__name__)
app.config.from_prefixed_env()


if 'PERFORMANCE_ANALYSIS_STORAGE' not in app.config:
    raise RuntimeError('Please set FLASK_PERFORMANCE_ANALYSIS_STORAGE environment '
                       'variable to the absolute path to a directory where '
                       'Adaptyst performance analysis results are stored.')


static_path = Path(app.root_path) / 'static'
scripts = ['jquery.min.js'] + \
    list(sorted(filter(lambda x: x != 'jquery.min.js',
                       map(lambda x: x.name,
                           static_path.glob('*.js'))))) + \
    list(sorted(map(lambda x: 'deps/' + x.name,
                    static_path.glob('deps/*.js')))) + \
    list(sorted(map(lambda x: 'deps/' + x.name,
                    static_path.glob('deps/*.cjs'))))
stylesheets = \
    list(sorted(map(lambda x: 'modules/' + x.parent.name + '/settings.css',
                    static_path.glob('modules/*/settings.css')))) + \
    list(sorted(map(lambda x: 'deps/' + x.name,
                    static_path.glob('deps/*.css'))))

backends = []

for p in static_path.glob('modules/*/settings.html'):
    backend = {}
    backend['name'] = p.parent.name
    backend['settings_code'] = p.read_text()
    backends.append(backend)

min_mod_vers = {}

for p in Path(app.root_path).glob('modules/*/metadata.yml'):
    mod_id = p.parent.name
    with p.open(mode='r') as f:
        metadata = yaml.safe_load(f)
    min_mod_vers[mod_id] = metadata.get('min_module_version', [])

arrgmts.Base.initialize(app.config.get('DATABASE_URL', None),
                        app.config.get('DATABASE_PASSWORD', None))


@app.get('/<identifier>/')
def get(identifier):
    try:
        results = Session(
            Path(app.config['PERFORMANCE_ANALYSIS_STORAGE']) / identifier)
        return results.get_system_graph_json()
    except ValueError:
        return '', 404


@app.post('/<identifier>/<entity>/<node>/<module>')
def post(identifier, entity, node, module):
    try:
        try:
            backend = import_module(f'adaptystanalyser.modules.{module}')
        except ModuleNotFoundError:
            traceback.print_exc()
            return '', 404

        return backend.process(app.config['PERFORMANCE_ANALYSIS_STORAGE'],
                               identifier, entity, node, request.values)
    except ValueError:
        traceback.print_exc()
        return '', 404
    except ImportError:
        traceback.print_exc()
        return '', 500


@app.post('/arrgmt')
def arrgmt_post():
    if 'type' not in request.values:
        return '', 401

    req_type = request.values['type']

    if req_type == 'check_name':
        return arrgmts.Arrangement.req_check_name(request.values)
    elif req_type == 'save':
        return arrgmts.Arrangement.req_save(
            request.values, Path(app.config['PERFORMANCE_ANALYSIS_STORAGE']))
    elif req_type == 'edit_name':
        return arrgmts.Arrangement.req_edit_name(request.values)
    elif req_type == 'delete':
        return arrgmts.Arrangement.req_delete(request.values)
    elif req_type == 'get':
        return arrgmts.Arrangement.req_get(
            request.values, Path(app.config['PERFORMANCE_ANALYSIS_STORAGE']))
    elif req_type == 'list':
        return arrgmts.Arrangement.req_list(request.values)
    else:
        return '', 401


@app.get('/')
def main():
    if 'CUSTOM_TITLE' in app.config and len(app.config.get('CUSTOM_TITLE')) > 0:
        title = 'Adaptyst Analyser (' + app.config.get('CUSTOM_TITLE') + ')'
    else:
        title = 'Adaptyst Analyser'

    if 'BACKGROUND_CSS' in app.config and len(app.config.get('BACKGROUND_CSS')) > 0:
        background = app.config.get('BACKGROUND_CSS')
    else:
        background = 'gray'

    ids = Session.get_all_sessions(
        app.config['PERFORMANCE_ANALYSIS_STORAGE'])

    arrgmt = request.values.get('arrgmt', None)
    session = None

    if arrgmt is None:
        session = request.values.get('session', None)

        if session is not None and \
           session not in map(lambda x: x.value, ids):
            session = None

    if request.values.get('compact', False) and \
       (session is None and arrgmt is None):
        code = 400
    else:
        code = 200

    return render_template(
        'viewer.html',
        ids=ids,
        scripts=scripts,
        stylesheets=stylesheets,
        version='v' + version('adaptyst-analyser'),
        title=title,
        background=background,
        backends=backends,
        min_mod_vers=json.dumps(min_mod_vers),
        compact=request.values.get('compact', False),
        session=session,
        arrgmt=arrgmt,
        hide_header=request.values.get('hide_header', False),
        hide_footer=request.values.get('hide_footer', False)), code
