# AdaptivePerfHTML: Tool for producing HTML summary of AdaptivePerf results
# Copyright (C) CERN. See LICENSE for details.

import re
import sys
import json
from treelib import Tree
from pathlib import Path


class Identifier:
    def __init__(self, id_str: str):
        self._id_str = id_str

        match = re.search(r'^(\d+)_(\d+)_(\d+)_(\d+)_(\d+)_(.+)$',
                          self._id_str)

        if match is None:
            raise ValueError('Invalid id_str (not enough numbers)!')

        self._year, self._month, self._day, self._hour, self._minute, \
            remainder = match.group(1), match.group(2), match.group(3), \
            match.group(4), match.group(5), match.group(6)

        match = re.search(r'^(\d+)_(.+)$', remainder)

        if match is None:
            self._second = None
            executor_and_name = remainder
        else:
            self._second = match.group(1)
            executor_and_name = match.group(2)

        match = re.search(r'^(\S+)__(.+)$', executor_and_name)

        if match is None:
            raise ValueError('Invalid id_str (incorrect executor and name)!')

        self._executor = match.group(1)
        self._name = match.group(2)

    def __str__(self):
        if self._second is None:
            return f'[{self._executor}] {self._name} ' \
                f'({self._year}-{self._month}-{self._day} ' \
                f'{self._hour}:{self._minute})'
        else:
            return f'[{self._executor}] {self._name} ' \
                f'({self._year}-{self._month}-{self._day} ' \
                f'{self._hour}:{self._minute}:{self._second})'

    @property
    def year(self):
        return int(self._year)

    @property
    def month(self):
        return int(self._month)

    @property
    def day(self):
        return int(self._day)

    @property
    def hour(self):
        return int(self._hour)

    @property
    def minute(self):
        return int(self._minute)

    @property
    def second(self):
        if self._second is not None:
            return int(self._second)

        return None

    @property
    def executor(self):
        return self._executor

    @property
    def name(self):
        return self._name

    @property
    def value(self):
        return self._id_str

    def __eq__(self, other):
        return self.value == other.value

    def __hash__(self):
        return hash(self.value)


class ProfilingResults:
    def get_all_ids(path_str: str) -> list:
        id_str_list = []
        path = Path(path_str)

        for x in filter(Path.is_dir, path.glob('*')):
            try:
                identifier = Identifier(x.name)
            except ValueError:
                continue

            id_str_list.append((x.name,
                                (-identifier.year,
                                 -identifier.month,
                                 -identifier.day,
                                 -identifier.hour,
                                 -identifier.minute,
                                 0 if identifier.second is None
                                 else -identifier.second,
                                 identifier.executor,
                                 identifier.name)))

        return list(map(lambda x: Identifier(x[0]),
                        sorted(id_str_list, key=lambda x: x[1])))

    def __init__(self, profiling_storage: str, identifier: str):
        self._path = Path(profiling_storage) / identifier
        self._thread_tree = None

        with (self._path / 'processed' / 'metadata.json').open(mode='r') as f:
            self._metadata = json.load(f)

        metrics_path = self._path / 'out' / 'event_dict.data'

        self._metrics = {}

        if metrics_path.exists():
            with metrics_path.open(mode='r') as f:
                for line in f:
                    match = re.search(r'^(\S+) (.+)$',  line.strip())
                    self._metrics[match.group(1)] = match.group(2)

    def get_flame_graph(self, pid, tid, compress_threshold):
        p = self._path / 'processed' / f'{pid}_{tid}.json'

        def compress_result(result, total):
            children = result['children']

            for i in range(len(children) - 1, -1, -1):
                if children[i]['value'] < compress_threshold * total:
                    del children[i]
                else:
                    compress_result(children[i], total)

        if not p.exists():
            return None

        with p.open(mode='r') as f:
            data = json.load(f)

        for k, v in data.items():
            for result in v:
                compress_result(result, result['value'])

        return json.dumps(data)

    def get_callchain_mappings(self):
        paths = (self._path / 'processed').glob('*_callchains.json')
        result_dict = {}

        for path in paths:
            with path.open(mode='r') as f:
                result_dict[re.search(r'^(.+)_callchains\.json$',
                                      path.name).group(1)] = json.load(f)

        return json.dumps(result_dict)

    def get_thread_tree(self) -> Tree:
        if self._thread_tree is not None:
            return self._thread_tree

        tree = Tree()

        for n in self._metadata['thread_tree']:
            tree.create_node(**n)

        self._thread_tree = tree
        return tree

    def get_json_tree(self):
        def to_ms(num):
            return None if num is None else num / 1000000

        tree = self.get_thread_tree()

        def node_to_dict(node):
            process_name, pid_tid, start_time, runtime = node.tag
            pid_tid_code = pid_tid.replace('/', '_')

            start_time = to_ms(start_time)
            if runtime != -1:
                runtime = to_ms(runtime)

            offcpu_regions = list(
                map(lambda x: (to_ms(x[0] -
                                     self._metadata.get('start_time', 0)),
                               to_ms(x[1])),
                    self._metadata['offcpu_regions'].get(pid_tid_code, [])))

            total_sampled_time = \
                to_ms(self._metadata['sampled_times'].get(pid_tid_code, None))

            if total_sampled_time is None:
                total_sampled_time = runtime

            to_return = {
                'id': pid_tid.replace('/', '_'),
                'start_time': start_time,
                'runtime': runtime,
                'sampled_time': total_sampled_time,
                'name': process_name,
                'pid_tid': pid_tid,
                'off_cpu': offcpu_regions,
                'start_callchain': self._metadata['callchains'].get(
                    pid_tid.split('/')[1], []),
                'metrics': self._metrics,
                'children': []
            }

            children = tree.children(node.identifier)

            if len(children) > 0:
                for child in children:
                    to_return['children'].append(node_to_dict(child))

            return to_return

        if tree.root is None:
            return json.dumps({})
        else:
            return json.dumps(node_to_dict(tree.get_node(tree.root)))

    def get_perf_maps(self):
        map_paths = (self._path / 'processed').glob('perf-*.map')
        result_dict = {}

        for map_path in map_paths:
            data = []
            with map_path.open(mode='r') as f:
                for i, line in enumerate(f, 1):
                    match = re.search(
                        r'^([0-9a-fA-F]+)\s+([0-9a-fA-F]+)\s+(.+)$',
                        line.strip())

                    if match is None:
                        print(f'Line {i}, {map_path}: '
                              'incorrect syntax, ignoring.',
                              file=sys.stderr)

                    data.append(('0x' + match.group(1),
                                 hex(int(match.group(1), 16) +
                                     int(match.group(2), 16) - 1),
                                 match.group(3)))

            data.sort(key=lambda x: int(x[0], 16))
            result_dict[map_path.name] = data

        return json.dumps(result_dict)
