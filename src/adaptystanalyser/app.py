# SPDX-FileCopyrightText: 2026 CERN
# SPDX-License-Identifier: LGPL-3.0-or-later

import traceback
import yaml
import json
from . import Session
from . import arrangements as arrgmts
from flask import Flask, render_template, request
from pathlib import Path
from importlib.metadata import version


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


def load_session(identifier):
    return Session(
        Path(app.config['PERFORMANCE_ANALYSIS_STORAGE']) / identifier)


@app.get('/get/<identifier>/')
def get(identifier):
    try:
        session = load_session(identifier)
        return session.get_system_graph_json()
    except FileNotFoundError:
        traceback.print_exc()
        return '', 404


def post(identifier, entity, node_or_edge, module):
    try:
        session = load_session(identifier)
        return session.process_post_request(request.values,
                                            entity, node_or_edge,
                                            module)
    except ModuleNotFoundError:
        traceback.print_exc()
        return '', 404
    except FileNotFoundError:
        traceback.print_exc()
        return '', 404
    except ValueError:
        traceback.print_exc()
        return '', 404
    except ImportError:
        traceback.print_exc()
        return '', 500


@app.post('/process/<identifier>/<entity>/<node_or_edge>/<module>')
def post1(identifier, entity, node_or_edge, module):
    post(identifier, entity, node_or_edge, module)


@app.post('/process/<identifier>/<edge>/<module>')
def post2(identifier, edge, module):
    post(identifier, None, edge, module)


@app.post('/arrgmt')
def arrgmt_post():
    vals = request.values

    if 'type' not in vals:
        return '', 401

    req_type = vals['type']
    db_url = app.config.get('DATABASE_URL', None)
    db_pass = app.config.get('DATABASE_PASSWORD', None)

    with arrgmts.Context(db_url, db_pass) as cxt:
        if req_type == 'check_name':
            if 'name' not in vals:
                return '', 401

            return json.dumps({
                'exists': cxt.check_name(vals['name'])
            }), 200
        elif req_type == 'save':
            if 'name' not in vals or \
               'data' not in vals:
                return '', 401

            try:
                identifier, token = cxt.save(
                    vals['name'], vals['data'],
                    Path(app.config['PERFORMANCE_ANALYSIS_STORAGE']))

                return json.dumps({
                    'id': identifier,
                    'token': token
                }), 200
            except FileExistsError:
                return '', 409
        elif req_type == 'edit_name':
            if 'name' not in vals or \
               'new_name' not in vals:
                return '', 401

            if 'token' not in vals:
                return '', 403

            try:
                cxt.edit_name(vals['name'], vals['new_name'],
                              vals['token'])
                return '{}', 200
            except FileExistsError:
                return '', 409
            except FileNotFoundError:
                return '', 404
            except PermissionError:
                return '', 403
        elif req_type == 'delete':
            if 'name' not in vals:
                return '', 401

            if 'token' not in vals:
                return '', 403

            try:
                cxt.delete(vals['name'], vals['token'])
                return '{}', 200
            except FileNotFoundError:
                return '', 404
            except PermissionError:
                return '', 403
        elif req_type == 'get':
            if ('id' not in vals and 'name' not in vals) or \
               ('id' in vals and 'name' in vals):
                return '', 401

            storage_path = Path(app.config['PERFORMANCE_ANALYSIS_STORAGE'])

            try:
                if 'id' in vals:
                    data = cxt.get_by_id(vals['id'], storage_path)
                else:
                    data = cxt.get_by_name(vals['name'], storage_path)

                return data, 200
            except FileNotFoundError:
                return '', 404
            except ValueError as e:
                return json.dumps({
                    'session_invalid': str(e)
                }), 422
        elif req_type == 'list':
            try:
                cnt, pages, lst = cxt.get_list(vals.get('search', None),
                                               vals.get('limit', 10),
                                               vals.get('page', 1),
                                               vals.get('sort', 'last_update_desc'),
                                               vals.get('types', 'both'))

                return json.dumps({
                    'general_total_cnt': cnt,
                    'general_total_pages': pages,
                    'list': lst
                }), 200
            except ValueError:
                return '', 401
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
