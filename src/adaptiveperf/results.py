import re
import pickle
import subprocess
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

        match = re.search(r'^(\S+) (.+)$', executor_and_name)

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

        with (self._path / 'new_proc_callchains.data').open(mode='r') as f:
            self._start_callchains = json.load(f)

    def get_thread_tree(self) -> Tree:
        if self._thread_tree is not None:
            return self._thread_tree

        r = subprocess.run(['perf', 'script', '-f', '-i',
                            'syscalls.data', '-s',
                            Path(__file__).resolve().parent /
                            'perf_script.py'],
                           cwd=self._path, stdout=subprocess.PIPE)

        r.check_returncode()

        tree = pickle.loads(r.stdout)

        self._thread_tree = tree
        return tree

    def _get_sampled_time(self, pid_tid):
        sampled_time_path = self._path / 'processed' / \
            f'{pid_tid.replace("/", "_")}_sampled_time.data'

        if sampled_time_path.exists() and \
           len(sampled_time_path.read_text()) > 0:
            return float(sampled_time_path.read_text())
        else:
            return None

    def get_json_tree(self):
        tree = self.get_thread_tree()

        def node_to_dict(node):
            process_name, pid_tid, offcpu_regions, \
                start_time, runtime = node.tag

            # Convert times to milliseconds
            start_time /= 1000000
            if runtime != -1:
                runtime /= 1000000
            # End

            offcpu_regions = list(map(lambda x: (x[0] / 1000000,
                                                 x[1] / 1000000),
                                      offcpu_regions))

            total_sampled_time = self._get_sampled_time(pid_tid)

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
                'start_callchain': self._start_callchains.get(
                    pid_tid.split('/')[1], []),
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
