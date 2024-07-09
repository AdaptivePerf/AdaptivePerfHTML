# AdaptivePerfHTML: Tool for producing HTML summary of AdaptivePerf results
# Copyright (C) CERN. See LICENSE for details.

import re
import sys
import json
from treelib import Tree
from pathlib import Path


class Identifier:
    """
    A class representing a profiling session identifier.

    The identifier takes form of
    "<year>_<month>_<day>_<hour>_<minute>_<executor>__<profiled filename>"
    or "<year>_<month>_<day>_<hour>_<minute>_<second>_<executor>__
    <profiled filename>". <executor> is the machine hostname / development
    branch where an executable named <profiled filename> was profiled.

    All folders in the profiling results directory correspond to profiling
    sessions and have the name matching one of the patterns above.

    Given this description, the properties of this class should be
    self-explanatory.
    """

    def __init__(self, id_str: str):
        """
        Construct an Identifier object, checking the correctness
        of the supplied identifier string.

        :param str id_str: A profiling session identifier string.
        :raises ValueError: When a provided identifier is incorrect.
        """
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
        """
        Return a user-friendly string representation of the identifier in
        form of "[<executor>] <profiled filename> (<year>-<month>-<day> <hour>:
        <minute>:<second>)" (or without ":<second>" if the seconds part
        of the time was not provided during the object construction).
        """
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
    """
    A class describing the results of a specific profiling session
    stored inside a given profiling results directory.
    """

    def get_all_ids(path_str: str) -> list:
        """
        Get the identifiers of all profiling sessions stored in
        a given profiling results directory.

        :param str path_str: The path string to a profiling
                             results directory.
        :return: The list of identifiers that can be used
                 for constructing a ProfilingResults object.
        """
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
        """
        Construct a ProfilingResults object.

        :param str profiling_storage: The path string to a profiling
                                      results directory.
        :param str identifier: The identifier of a profiling session
                               stored inside the results directory.
                               Call get_all_ids() for the list of all
                               valid identifiers.
        """
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
        """
        Get a flame graph of the thread/process with a given PID and TID
        to be rendered by d3-flame-graph, taking into account not to render
        blocks taking less than a specified share of total samples.

        :param int pid: The PID of a thread/process in the session.
        :param int tid: The TID of a thread/process in the session.
        :param float compress_threshold: A compression threshold. For
                                         example, if its value is 0.10,
                                         blocks taking less than 10% of
                                         total samples will not be
                                         effectively rendered.
        """
        p = self._path / 'processed' / f'{pid}_{tid}.json'

        def compress_result(result, total, time_ordered):
            children = result['children']
            new_children = []
            compressed_value = 0

            for child in children:
                if child['value'] < compress_threshold * total:
                    child['compressed'] = True

                    if not time_ordered:
                        compressed_value += child['value']
                else:
                    compress_result(child, total, time_ordered)

            for child in children:
                if time_ordered:
                    if child.get('compressed', False):
                        compressed_value += child['value']
                    else:
                        if compressed_value > 0:
                            new_children.append({
                                'name': '(compressed)',
                                'value': compressed_value,
                                'children': []
                            })
                            compressed_value = 0

                        new_children.append(child)
                elif not child.get('compressed', False):
                    new_children.append(child)

            if compressed_value > 0:
                new_children.append({
                    'name': '(compressed)',
                    'value': compressed_value,
                    'children': []
                })

            result['children'] = new_children

        if not p.exists():
            return None

        with p.open(mode='r') as f:
            data = json.load(f)

        for k, v in data.items():
            if len(v) != 2:
                raise RuntimeError(f'{k} in {pid}_{tid}.json should have '
                                   f'exactly 2 elements, but it has {len(v)}')

            compress_result(v[0], v[0]['value'], False)
            compress_result(v[1], v[1]['value'], True)

        return json.dumps(data)

    def get_callchain_mappings(self):
        """
        Get a JSON object string representing dictionaries mapping compressed
        callchain symbol names to full symbol names.

        Inside the object, the dictionaries are grouped by event types, e.g.
        "syscalls" has the mappings between compressed callchain symbol names
        captured during tree profiling and full symbol names.
        """
        paths = (self._path / 'processed').glob('*_callchains.json')
        result_dict = {}

        for path in paths:
            with path.open(mode='r') as f:
                result_dict[re.search(r'^(.+)_callchains\.json$',
                                      path.name).group(1)] = json.load(f)

        return json.dumps(result_dict)

    def get_thread_tree(self) -> Tree:
        """
        Get a treelib.Tree object representing the thread/process tree of
        the session.
        """
        if self._thread_tree is not None:
            return self._thread_tree

        tree = Tree()

        for n in self._metadata['thread_tree']:
            tree.create_node(**n)

        self._thread_tree = tree
        return tree

    def get_json_tree(self):
        """
        Get a JSON object string representing the thread/process tree of
        the session.

        The returned object is the root, which describes the very first
        process detected in the session along with its children.
        The object has the following keys:
        * "id": the unique identifier of a thread/process in form of
          "<PID>_<TID>".
        * "start_time": the timestamp of the moment when the thread/process
           was effectively started, in milliseconds.
        * "runtime": the number of milliseconds the thread/process was
          running for.
        * "sampled_time": the number of milliseconds the thread/process
          was running for, as sampled by "perf".
        * "name": the process name.
        * "pid_tid": the PID and TID pair string in form of "<PID>/<TID>".
        * "off_cpu": the list of intervals when the thread/process was
          off-CPU. Each interval is in form of (a, b), where a is the
          start time of an off-CPU interval and b is the length of such
          interval.
        * "start_callchain": the callchain spawning the thread/process.
        * "metrics": the JSON object mapping extra profiling metrics (in
          addition to on-CPU/off-CPU activity) to their website titles (e.g.
          "page-faults" -> "Page faults"). It can be empty.
        * "children": the list of all threads/processes spawned by the
          thread/process. Each element has the same structure as the root.
        """
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
        """
        Get a JSON object string representing perf symbol maps
        obtained in the session.

        Inside the object, symbol maps can be accessed through
        their original filenames, e.g. perf-1784.map.
        """
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
