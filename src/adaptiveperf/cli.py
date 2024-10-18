import argparse
import sys
import subprocess
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(prog='adaptiveperfhtml',
                                     description='AdaptivePerfHTML web server')

    parser.add_argument('results', metavar='PATH',
                        help='path to a profiling results directory '
                        '(relative or absolute)')
    parser.add_argument('-a',
                        metavar='ADDR',
                        dest='address',
                        help='address and port to bind to, '
                        'default: 127.0.0.1:8000',
                        default='127.0.0.1:8000')
    parser.add_argument('-o',
                        metavar='PERIOD',
                        dest='off_cpu_sampling',
                        help='sampling period in ms for rendering captured '
                        'off-CPU regions in the timeline view (sampling is '
                        'done in a similar way as off-CPU sampling is in '
                        'AdaptivePerf, 0 disables sampling and makes the '
                        'website display all captured off-CPU regions), '
                        'default: 0',
                        default=0)

    args = parser.parse_args()

    result_path = Path(args.results)

    if not result_path.exists():
        print(f'adaptiveperfhtml: error: {result_path} does not exist',
              file=sys.stderr)
        return 1
    elif not result_path.is_dir():
        print(f'adaptiveperfhtml: error: {result_path} is not a directory',
              file=sys.stderr)
        return 1

    result_path = result_path.resolve()

    env = os.environ.copy()
    env.update({
        'FLASK_PROFILING_STORAGE': str(result_path),
        'FLASK_OFFCPU_SAMPLING': str(args.off_cpu_sampling)
    })

    try:
        return subprocess.run(['gunicorn', '-b', args.address,
                               'adaptiveperf.app:app'],
                              env=env).returncode
    except KeyboardInterrupt:
        return 130
