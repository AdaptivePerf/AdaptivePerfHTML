# AdaptivePerfHTML: Tool for producing HTML summary of profiling results
# Copyright (C) CERN. See LICENSE for details.

import re
import sys
import json
import csv
from zipfile import ZipFile
from zipfile import Path as ZipFilePath
from treelib import Tree
from pathlib import Path
from collections import deque


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
        self._label = None

    def __str__(self):
        """
        Return a user-friendly string representation of the identifier in
        form of "<label>: [<executor>] <profiled filename>
        (<year>-<month>-<day> <hour>:<minute>:<second>)" (or without
        ":<second>" if the seconds part of the time was not provided during
        the object construction).
        """
        if self._second is None:
            return f'{self._label}: [{self._executor}] {self._name} ' \
                f'({self._year}-{self._month}-{self._day} ' \
                f'{self._hour}:{self._minute})'
        else:
            return f'{self._label}: [{self._executor}] {self._name} ' \
                f'({self._year}-{self._month}-{self._day} ' \
                f'{self._hour}:{self._minute}:{self._second})'

    def set_label_if_none(self, label):
        if self._label is None:
            self._label = label

        return self

    @property
    def label(self):
        return self._label

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
                                 identifier.name,
                                 '' if identifier.label is None
                                 else identifier.label)))

        return list(
            map(lambda x:
                Identifier(x[1][0]).set_label_if_none(str(x[0])),
                enumerate(sorted(id_str_list, key=lambda x: x[1]))))

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

        metrics_path = self._path / 'processed' / 'event_dict.data'

        if not metrics_path.exists():
            metrics_path = self._path / 'out' / 'event_dict.data'

        self._metrics = {
            'walltime': {
                'title': 'Wall time (ns)',
                'flame_graph': True
            }
        }

        if metrics_path.exists():
            with metrics_path.open(mode='r') as f:
                for line in f:
                    match = re.search(r'^(\S+) (.+)$',  line.strip())
                    self._metrics[match.group(1)] = {
                        'title': match.group(2),
                        'flame_graph': True
                    }

        self._general_metrics = {}

        if (self._path / 'processed' / 'roofline.csv').exists():
            self._general_metrics['roofline'] = {
                'title': 'Cache-aware roofline model'
            }

        self._sources = {}
        self._source_index = {}
        self._source_zip_path = None

        source_json_files = (self._path / 'processed').glob('*_sources.json')

        for p in source_json_files:
            name = re.search(r'(.+)_sources\.json', p.name).group(1)
            with p.open(mode='r') as f:
                self._sources[name] = json.load(f)

        if (self._path / 'processed' / 'src.zip').exists():
            self._source_zip_path = self._path / 'processed' / 'src.zip'
            src_index_path = self._path / 'processed' / 'src_index.json'

            if src_index_path.exists():
                with src_index_path.open(mode='r') as f:
                    self._source_index = json.load(f)
            else:
                with ZipFile(self._source_zip_path) as zip:
                    path = ZipFilePath(zip, 'index.json')

                    if path.exists():
                        with path.open(mode='r') as f:
                            index_str = f.read()

                        self._source_index = json.loads(index_str)
                        with src_index_path.open(mode='w') as f:
                            f.write(index_str)

    def get_general_analysis(self, analysis_type):
        """
        Get general analysis data of a specified type. If the type
        does not exist, None is returned.

        :param str analysis_type: The type of a general analysis which
                                  data should be returned for, e.g.
                                  "roofline" for a cache-aware roofline
                                  model.
        """
        if analysis_type == 'roofline':
            p = self._path / 'processed' / 'roofline.csv'

            if not p.exists():
                return None

            data = {
                'type': analysis_type,
                'l1': None,
                'l2': None,
                'l3': None,
                'models': []
            }

            with p.open(mode='r', newline='') as f:
                reader = csv.reader(f)

                first_header = next(reader)

                if len(first_header) != 21 or \
                   [first_header[0], first_header[2],
                    first_header[4], first_header[6]] + \
                    first_header[9:] != \
                    ['Name:', 'L1 Size:', 'L2 Size:',
                     'L3 Size:', 'L1', 'L1', 'L2', 'L2',
                     'L3', 'L3', 'DRAM', 'DRAM',
                     'FP', 'FP', 'FP FMA', 'FP_FMA']:
                    return None

                second_header = next(reader)

                if second_header != \
                    ['Date', 'ISA', 'Precision', 'Threads',
                     'Loads', 'Stores', 'Interleaved', 'DRAM Bytes',
                     'FP Inst.', 'GB/s', 'I/Cycle', 'GB/s',
                     'I/Cycle', 'GB/s', 'I/Cycle', 'GB/s',
                     'I/Cycle', 'Gflop/s', 'I/Cycle', 'Gflop/s',
                     'I/Cycle']:
                    return None

                data['l1'] = int(first_header[3])
                data['l2'] = int(first_header[5])
                data['l3'] = int(first_header[7])

                for row in reader:
                    if row is None or len(row) != 21:
                        continue

                    data['models'].append({
                        'isa': row[1],
                        'precision': row[2],
                        'threads': row[3],
                        'loads': row[4],
                        'stores': row[5],
                        'interleaved': row[6],
                        'dram_bytes': row[7],
                        'fp_inst': row[8],
                        'l1': {
                            'gbps': row[9],
                            'instpc': row[10]
                        },
                        'l2': {
                            'gbps': row[11],
                            'instpc': row[12]
                        },
                        'l3': {
                            'gbps': row[13],
                            'instpc': row[14]
                        },
                        'dram': {
                            'gbps': row[15],
                            'instpc': row[16]
                        },
                        'fp': {
                            'gflops': row[17],
                            'instpc': row[18]
                        },
                        'fp_fma': {
                            'gflops': row[19],
                            'instpc': row[20]
                        }
                    })

            return data
        else:
            return None

    def get_flame_graph(self, pid, tid, compress_threshold):
        """
        Get a flame graph of the thread/process with a given PID and TID
        to be rendered by d3-flame-graph, taking into account to collapse
        blocks taking less than a specified share of total samples.

        :param int pid: The PID of a thread/process in the session.
        :param int tid: The TID of a thread/process in the session.
        :param float compress_threshold: A compression threshold. For
                                         example, if its value is 0.10,
                                         blocks taking less than 10% of
                                         total samples will be collapsed.
        """
        p = self._path / 'processed' / f'{pid}_{tid}.json'

        if not p.exists():
            return None

        with p.open(mode='r') as f:
            data = json.load(f)

        for k, v in data.items():
            if len(v) != 2:
                raise RuntimeError(f'{k} in {pid}_{tid}.json should have '
                                   f'exactly 2 elements, but it has {len(v)}')

            compressed_blocks_lists = [[], []]
            queue = deque([(v[0], v[0]['value'], False, False,
                            compressed_blocks_lists[0]),
                           (v[1], v[1]['value'], True, False,
                            compressed_blocks_lists[1])])

            while len(queue) > 0:
                result, total, time_ordered, parent_is_compressed, \
                    compressed_blocks = queue.pop()

                children = result['children']
                new_children = []
                compressed_value = 0
                hidden_children = []
                compressed_children = set()

                for i, child in enumerate(children):
                    if child['value'] < compress_threshold * total:
                        compressed_children.add(i)
                    else:
                        queue.append((child, total, time_ordered, False,
                                      compressed_blocks))

                for i, child in enumerate(children):
                    if time_ordered:
                        if i in compressed_children:
                            compressed_value += child['value']
                            hidden_children.append(child)
                        else:
                            if compressed_value > 0:
                                if compressed_value == total \
                                   and parent_is_compressed:
                                    new_children += hidden_children
                                else:
                                    new_child = {
                                        'name': '(compressed)',
                                        'value': compressed_value,
                                        'children': hidden_children,
                                        'compressed_id': len(compressed_blocks)
                                    }

                                    queue.append((new_child,
                                                  compressed_value,
                                                  time_ordered,
                                                  True,
                                                  compressed_blocks))

                                    compressed_blocks.append(new_child)
                                    new_children.append(new_child)

                                compressed_value = 0
                                hidden_children = []

                            new_children.append(child)
                    else:
                        if i in compressed_children:
                            compressed_value += child['value']
                            hidden_children.append(child)
                        else:
                            new_children.append(child)

                if compressed_value > 0:
                    if len(hidden_children) == 1 and \
                       len(hidden_children[0]['children']) == 0:
                        new_children += hidden_children
                    elif compressed_value == total and parent_is_compressed:
                        if len(hidden_children) > 1:
                            part1_cnt = len(hidden_children) // 2

                            compressed_value_part1 = 0
                            for i in range(part1_cnt):
                                compressed_value_part1 += \
                                    hidden_children[i]['value']

                            compressed_value_part2 = compressed_value - \
                                compressed_value_part1

                            new_child1 = {
                                'name': '(compressed)',
                                'value': compressed_value_part1,
                                'children': hidden_children[:part1_cnt],
                                'compressed_id': len(compressed_blocks)
                            }

                            new_child2 = {
                                'name': '(compressed)',
                                'value': compressed_value_part2,
                                'children': hidden_children[part1_cnt:],
                                'compressed_id': len(compressed_blocks) + 1
                            }

                            queue.append((new_child1, compressed_value_part1,
                                          time_ordered, True,
                                          compressed_blocks))
                            queue.append((new_child2, compressed_value_part2,
                                          time_ordered, True,
                                          compressed_blocks))

                            compressed_blocks.append(new_child1)
                            compressed_blocks.append(new_child2)

                            new_children.append(new_child1)
                            new_children.append(new_child2)
                        else:
                            new_children += hidden_children
                    else:
                        new_child = {
                            'name': '(compressed)',
                            'value': compressed_value,
                            'children': hidden_children,
                            'compressed_id': len(compressed_blocks)
                        }

                        queue.append((new_child, compressed_value,
                                      time_ordered, True,
                                      compressed_blocks))

                        compressed_blocks.append(new_child)
                        new_children.append(new_child)

                if 'compressed_id' in result:
                    result['children'] = []
                    result['hidden_children'] = new_children
                else:
                    result['children'] = new_children

            for compressed_blocks in compressed_blocks_lists:
                deleted_block_ids = set()
                for block in compressed_blocks:
                    if block['compressed_id'] in deleted_block_ids:
                        continue

                    while (len(block['hidden_children']) == 1 and
                           'hidden_children' in block['hidden_children'][0]):
                        deleted_block_ids.add(
                            block['hidden_children'][0]['compressed_id'])
                        block['hidden_children'] = \
                            block['hidden_children'][0]['hidden_children']

        return json.dumps(data)

    def get_callchain_mappings(self):
        """
        Get a JSON object string representing dictionaries mapping compressed
        callchain names to full symbol and library/executable names.

        Inside the object, the dictionaries are grouped by event types, e.g.
        "syscalls" has the mappings between compressed callchain names
        captured during tree profiling and full symbol and
        library/executable names.
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
        * "metrics": the JSON object mapping extra per-thread profiling metrics
          (in addition to on-CPU/off-CPU activity) to their website titles
          and their type (i.e. flame-graph-related or not flame-graph-related).
          An example object is {"page-faults": {"title": "Page faults",
          "flame_graph": true}}. The structure can also be empty.
        * "general_metrics": the JSON object mapping general profiling
          metrics to their website titles and other auxiliary data (e.g.
          {"roofline": {"title": "Roofline model", ...}). This is set
          only for the root and it can be empty.
        * "src": the JSON object mapping library/executable offsets to
          lines within source code files. This is set only for the root
          and it can be empty. The structure is as follows:
          {"<event type>": {"<library/executable path>":
          {"<hex offset>": {"file": "<path>", "line": <number>}}}}.
          <event type> can be one of: "syscall" (for thread/process tree
          tracing), "walltime" (for on-CPU/off-CPU profiling), or the name
          of a custom event specified by the user. Refer to "src_index"
          (which is also returned by get_json_tree()) and use get_source_code()
          to obtain a source code corresponding to <path>.
        * "src_index": the JSON object mapping source code paths inside
          "src" to shortened filenames that should be provided to
          get_source_code(). This is set only for the root and it can be empty.
        * "children": the list of all threads/processes spawned by the
          thread/process. Each element has the same structure as the root
          except for "general_metrics" which is absent.
        """
        def to_ms(num):
            return None if num is None else num / 1000000

        tree = self.get_thread_tree()

        def node_to_dict(node, is_root):
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

            if is_root:
                to_return['general_metrics'] = self._general_metrics
                to_return['src'] = self._sources
                to_return['src_index'] = self._source_index

            children = tree.children(node.identifier)

            if len(children) > 0:
                for child in children:
                    to_return['children'].append(node_to_dict(child,
                                                              False))

            return to_return

        if tree.root is None:
            return json.dumps({})
        else:
            return json.dumps(node_to_dict(tree.get_node(tree.root),
                                           True))

    def get_source_code(self, filename):
        """
        Get a source code stored in the session under a specified
        name.

        :param str filename: The name of a source code to be
                             obtained. It must come from "src_index"
                             produced by get_thread_tree().
        """
        if self._source_zip_path is None:
            return None

        with ZipFile(self._source_zip_path) as zip:
            path = ZipFilePath(zip, filename)

            if not path.exists():
                return None

            with path.open() as f:
                return f.read()

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
                        continue

                    data.append(('0x' + match.group(1),
                                 hex(int(match.group(1), 16) +
                                     int(match.group(2), 16) - 1),
                                 match.group(3)))

            data.sort(key=lambda x: int(x[0], 16))
            result_dict[map_path.name] = data

        return json.dumps(result_dict)
