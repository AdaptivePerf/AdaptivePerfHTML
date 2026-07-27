# SPDX-FileCopyrightText: 2026 CERN
# SPDX-License-Identifier: LGPL-3.0-or-later

import argparse
import sys
import subprocess
import os
import yaml
import shutil
import filecmp
import urllib.request
import getpass
from urllib.parse import urlparse
from pathlib import Path
from importlib import import_module
from importlib.metadata import version
from tempfile import NamedTemporaryFile


def main():
    parser = argparse.ArgumentParser(prog='adaptyst-analyser',
                                     description='Adaptyst Analyser web '
                                     'server')

    parser.add_argument('results', metavar='PATH', nargs='?',
                        help='relative or absolute path to a performance '
                        'analysis results '
                        'directory to inspect or an Adaptyst Analyser module '
                        'directory to install')
    parser.add_argument('--version', action='version', help='print '
                        'version and exit', version='v' + version(
                            'adaptyst-analyser'))
    parser.add_argument('-a',
                        metavar='ADDR',
                        dest='address',
                        help='address and port to bind to, '
                        'default: 127.0.0.1:8000',
                        default='127.0.0.1:8000')
    parser.add_argument('-s',
                        metavar='ADDR',
                        dest='database', type=str,
                        help='database to connect to for '
                        'storing arrangements (use the SQLAlchemy database URL syntax), '
                        'a user-local SQLite '
                        'database is created and used by default')
    parser.add_argument('-t',
                        metavar='TITLE', dest='title', type=str, default='',
                        help='custom title to be displayed alongside '
                        '"Adaptyst Analyser" (e.g. if set to XYZ, the '
                        'displayed entire title will be '
                        '"Adaptyst Analyser (XYZ)")')
    parser.add_argument('-b',
                        metavar='CSS', dest='background', type=str,
                        default='', help='custom background CSS of the '
                        'website (syntax is the same as in "background" in '
                        'CSS, do not use semicolons)')
    parser.add_argument('--force-install', dest='reinstall_js_deps',
                        action='store_true', help='(re)install all core JavaScript '
                        'dependencies even if they are already set up')
    parser.add_argument('-u', dest='update', action='store_true',
                        help='update/reinstall the module if it is already '
                        'installed')
    parser.add_argument('-d', dest='development',
                        action='store_true',
                        help='install the module in development mode')
    parser.add_argument('-l', dest='list', action='store_true',
                        help='list in detail all installed Adaptyst Analyser '
                        'modules')

    password_group = parser.add_mutually_exclusive_group()
    password_group.add_argument('--password-stdin',
                                action='store_true',
                                dest='password_stdin',
                                help='read database password from stdin (-s must be used)')
    password_group.add_argument('--password-env',
                                action='store_true',
                                dest='password_env',
                                help='read database password from the '
                                'ADAPTYST_ANALYSER_DB_PASSWORD '
                                'environment variable (-s must be used)')

    args = parser.parse_args()

    static_path = Path(__file__).parent / 'static'
    js_dependencies = {
        'jquery.min.js': 'https://code.jquery.com/jquery-3.7.1.min.js',
        'sigma-base.min.js': 'https://cdnjs.cloudflare.com/ajax/libs'
        '/sigma.js/3.0.2/sigma.min.js',
        'sigma-edge-curve.js': 'https://cernbox.cern.ch/remote.php/dav'
        '/public-files/GN8XhQhKJAfG1yH/sigma-edge-curve.js',
        'graphology.umd.min.js': 'https://cdnjs.cloudflare.com/ajax/libs'
        '/graphology/0.26.0/graphology.umd.min.js',
        'graphology-layout-forceatlas2.js': 'https://cernbox.cern.ch/'
        'remote.php/dav/public-files/U9mKr25SUKQfEsl'
        '/graphology-layout-forceatlas2.js'
    }

    if args.list:
        modules_path = Path(__file__).parent / 'modules'
        modules = []

        for module_dir in modules_path.glob('*'):
            metadata_path = module_dir / 'metadata.yml'

            if not metadata_path.exists():
                continue

            with metadata_path.open(mode='r') as f:
                metadata = yaml.safe_load(f)

            modules.append((metadata['name'],
                            metadata['version'],
                            metadata['short_desc']))

        modules.sort()

        if len(modules) > 0:
            print('Modules installed, listed alphabetically:')

            for name, ver, short_desc in modules:
                print(f'* {name} v{ver}: {short_desc}')
        else:
            print('No modules are installed.')

        return 0

    if args.reinstall_js_deps and args.results is None:
        for name, url in js_dependencies.items():
            print(f'Downloading {name} from {url}...',
                  file=sys.stderr)

            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Adaptyst Analyser)'
            })

            with urllib.request.urlopen(req) as data:
                with (static_path / name).open(mode='wb') as f:
                    shutil.copyfileobj(data, f)

        return 0

    if args.results is None:
        print('adaptyst-analyser: error: the following arguments '
              'are required: PATH', file=sys.stderr)
        return 1

    if ';' in args.background:
        print('adaptyst-analyser: error: semicolons are not allowed in -b',
              file=sys.stderr)
        return 1

    result_path = Path(args.results)

    if not result_path.exists():
        print(f'adaptyst-analyser: error: {args.results} does not exist',
              file=sys.stderr)
        return 1

    result_path = result_path.resolve()

    if not result_path.is_dir():
        print(f'adaptyst-analyser: error: {args.results} does not point '
              'to a directory', file=sys.stderr)
        return 1

    if (result_path / 'web').exists() and \
       (result_path / 'web').is_dir() and \
       (result_path / 'python').exists() and \
       (result_path / 'python').is_dir() and \
       (result_path / 'metadata.yml').exists() and \
       (result_path / 'metadata.yml').is_file():
        print('Adaptyst Analyser module directory detected, running in module '
              'install mode...', file=sys.stderr)

        module_path = result_path

        root_web_path = module_path / 'web'
        root_python_path = module_path / 'python'
        metadata_path = module_path / 'metadata.yml'

        if not root_web_path.exists():
            print(f'adaptyst-analyser: error: {str(root_web_path)} '
                  'does not exist', file=sys.stderr)
            return 2

        if not root_python_path.exists():
            print(f'adaptyst-analyser: error: {str(root_python_path)} '
                  'does not exist', file=sys.stderr)
            return 2

        if not metadata_path.exists():
            print(f'adaptyst-analyser: error: {str(metadata_path)} '
                  'does not exist', file=sys.stderr)
            return 2

        if not metadata_path.is_file():
            print(f'adaptyst-analyser: error: {str(metadata_path)} '
                  'does not point to a file', file=sys.stderr)
            return 2

        metadata_path_str = str(metadata_path)
        metadata_path = metadata_path.resolve()

        try:
            with metadata_path.open('r') as f:
                metadata = yaml.safe_load(f)
        except yaml.YAMLError as e:
            print(f'adaptyst-analyser: error: {metadata_path_str} '
                  f'is not a valid YAML file: {e}', file=sys.stderr)
            return 2

        if 'name' not in metadata:
            print(f'adaptyst-analyser: error: {metadata_path_str} '
                  'does not contain a "name" field', file=sys.stderr)
            return 2

        module_name = metadata['name']

        web_path = root_web_path / module_name
        python_path = root_python_path / module_name

        web_path_str = str(web_path)
        python_path_str = str(python_path)

        if not web_path.exists():
            print(f'adaptyst-analyser: error: {web_path_str} '
                  'does not exist', file=sys.stderr)
            return 2

        if not python_path.exists():
            print(f'adaptyst-analyser: error: {python_path_str} '
                  'does not exist', file=sys.stderr)
            return 2

        web_path = web_path.resolve()
        python_path = python_path.resolve()

        if not web_path.is_dir():
            print(f'adaptyst-analyser: error: {web_path_str} '
                  'does not point to a directory', file=sys.stderr)
            return 2

        if not python_path.is_dir():
            print(f'adaptyst-analyser: error: {python_path_str} '
                  'does not point to a directory', file=sys.stderr)
            return 2

        if not (python_path / '__init__.py').exists():
            print(f'adaptyst-analyser: error: {python_path_str} '
                  'does not contain an "__init__.py" file', file=sys.stderr)
            return 2

        if not (web_path / 'settings.html').exists():
            print(f'adaptyst-analyser: warning: {web_path_str} '
                  'does not contain a "settings.html" file, there will be '
                  'no settings available for this module on the client side',
                  file=sys.stderr)

        analyser_path = Path(import_module('adaptystanalyser').__file__).parent

        module_python_path = analyser_path / 'modules' / metadata['name']

        if module_python_path.exists():
            if args.update:
                shutil.rmtree(module_python_path)
            else:
                print(f'adaptyst-analyser: error: {metadata["name"]} '
                      'is already installed, use the -u flag',
                      file=sys.stderr)
                return 3

        module_python_path.mkdir(parents=True)

        module_web_path = analyser_path / 'static' / 'modules' / \
            metadata['name']
        global_deps_path = analyser_path / 'static' / 'deps'

        if module_web_path.exists():
            if args.update:
                shutil.rmtree(module_web_path)
            else:
                print(f'adaptyst-analyser: error: {metadata["name"]} '
                      'is already installed, use the -u flag',
                      file=sys.stderr)
                return 3

        module_web_path.mkdir(parents=True)
        global_deps_path.mkdir(parents=True, exist_ok=True)

        def install(item, module_path):
            if item.is_dir():
                shutil.copytree(item, module_path / item.name,
                                dirs_exist_ok=True, symlinks=True)
            else:
                shutil.copy2(item, module_path / item.name,
                             follow_symlinks=False)

        if 'python_dependencies' in metadata:
            pip_command = ['pip', 'install'] + \
                metadata['python_dependencies']

            try:
                subprocess.run(pip_command, check=True)
            except subprocess.CalledProcessError as e:
                print('adaptyst-analyser: error: could not install '
                      'module Python dependencies, pip exited with '
                      f'code {str(e.returncode)}', file=sys.stderr)
                return 2

        if 'js_dependencies' in metadata:
            deps_path = web_path / 'deps'

            for dep in metadata['js_dependencies']:
                item = deps_path / dep

                if not item.exists():
                    print('adaptyst-analyser: error: '
                          f'{dep} does not exist in deps',
                          file=sys.stderr)
                    return 2

                if (item.is_symlink() and not item.resolve().is_file()) or \
                   not item.is_file():
                    print('adaptyst-analyser: warning: '
                          f'skipping non-file {str(item)} in deps',
                          file=sys.stderr)
                    continue

                if item.suffix not in ['.js', '.cjs', '.css']:
                    print('adaptyst-analyser: warning: '
                          f'skipping file {str(item)} in deps as it is '
                          'neither .js, .cjs, nor .css',
                          file=sys.stderr)
                    continue

                if (global_deps_path / item.name).exists():
                    src_file = item
                    dst_file = global_deps_path / item.name

                    if (src_file.is_symlink() and dst_file.is_symlink() and
                        src_file.resolve() == dst_file.resolve()) or \
                        (src_file.is_file() and dst_file.is_file() and
                         filecmp.cmp(src_file, dst_file, shallow=False)):
                        continue
                    else:
                        answer = ''
                        while answer not in ['Y', 'y', 'N', 'n']:
                            answer = \
                                input(f'{str(dst_file)} already exists and is '
                                      'different than the file from the '
                                      'module you are installing. Do you '
                                      'want to replace the destination file? '
                                      '[Y/N] ')

                        if answer in ['N', 'n']:
                            continue

                if args.development:
                    (global_deps_path / item.name).symlink_to(
                        item.resolve())
                else:
                    install(item, global_deps_path)

        if 'js_url_dependencies' in metadata:
            for url in metadata['js_url_dependencies']:
                path = Path(urlparse(url).path)
                dst_file = global_deps_path / path.name

                if path.suffix not in ['.js', '.cjs', '.css']:
                    print('adaptyst-analyser: warning: '
                          f'skipping URL {url} as it is neither '
                          '.js, .cjs, nor .css', file=sys.stderr)
                    continue

                req = urllib.request.Request(url, headers={
                    'User-Agent': 'Mozilla/5.0 (Adaptyst Analyser)'
                })

                with urllib.request.urlopen(req) as data:
                    with NamedTemporaryFile(delete=False) as tf:
                        shutil.copyfileobj(data, tf)
                        tf_path = Path(tf.name)

                    if dst_file.exists() and \
                       (dst_file.is_symlink() or
                       not filecmp.cmp(tf_path, dst_file, shallow=False)):
                        answer = ''
                        while answer not in ['Y', 'y', 'N', 'n']:
                            answer = \
                                input(f'{str(dst_file)} already exists '
                                      'and is different than the file '
                                      'from the module you are '
                                      'installing. Do you want to replace '
                                      'the destination file? [Y/N] ')

                        if answer in ['N', 'n']:
                            tf_path.unlink()
                            continue

                    if (global_deps_path / path.name).exists():
                        (global_deps_path / path.name).unlink()

                    shutil.copy2(tf_path, global_deps_path / path.name)
                    tf_path.unlink()

        for item in web_path.iterdir():
            if item.name == 'deps':
                continue

            if args.development:
                (module_web_path / item.name).symlink_to(item.resolve())
            else:
                install(item, module_web_path)

        for item in python_path.iterdir():
            if args.development:
                (module_python_path / item.name).symlink_to(item.resolve())
            else:
                install(item, module_python_path)

        install(metadata_path, module_python_path)

        print(f'adaptyst-analyser: {metadata["name"]} '
              'installed successfully')
        return 0
    else:
        print('Adaptyst Analyser module directory not detected, running in '
              'performance analysis result inspection mode...',
              file=sys.stderr)

        if args.password_stdin:
            if args.database:
                password = getpass.getpass(prompt='Please enter your database '
                                           'password: ')
            else:
                print('--password-stdin requires -s, ignoring.',
                      file=sys.stderr)
                password = None
        elif args.password_env:
            if args.database:
                password = os.getenv('ADAPTYST_ANALYSER_DB_PASSWORD')

                if password is None:
                    print('No ADAPTYST_ANALYSER_DB_PASSWORD env variable detected, '
                          'ignoring.', file=sys.stderr)
                else:
                    print('Database password read from ADAPTYST_ANALYSER_DB_PASSWORD '
                          'env variable.', file=sys.stderr)
            else:
                print('--password-env requires -s, ignoring.',
                      file=sys.stderr)
                password = None
        else:
            password = None

        module_path = Path(__file__).parent / 'modules'

        if module_path.exists():
            modules = list(map(lambda x: x.name,
                               module_path.glob('*')))

            if len(modules) > 0:
                print(f'Modules installed: {modules}', file=sys.stderr)
            else:
                print('No modules installed')
        else:
            print('No modules installed')

        for name, url in js_dependencies.items():
            if args.reinstall_js_deps or not (static_path / name).exists():
                print(f'Downloading {name} from {url}...',
                      file=sys.stderr)

                req = urllib.request.Request(url, headers={
                    'User-Agent': 'Mozilla/5.0 (Adaptyst Analyser)'
                })

                with urllib.request.urlopen(req) as data:
                    with (static_path / name).open(mode='wb') as f:
                        shutil.copyfileobj(data, f)

        env = os.environ.copy()
        env.update({
            'FLASK_PERFORMANCE_ANALYSIS_STORAGE': str(result_path),
            'FLASK_CUSTOM_TITLE': args.title,
            'FLASK_BACKGROUND_CSS': args.background
        })

        if args.database:
            env['FLASK_DATABASE_URL'] = args.database

        if password:
            env['FLASK_DATABASE_PASSWORD'] = password

        try:
            return subprocess.run(['gunicorn', '-b', args.address,
                                   'adaptystanalyser.app:app'],
                                  env=env).returncode
        except KeyboardInterrupt:
            return 130
