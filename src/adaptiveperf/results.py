import re
import pickle
import subprocess
import json
from treelib import Tree
from pathlib import Path


class Identifier:
    def __init__(self, id_str: str):
        self._id_str = id_str

    def __str__(self):
        match = re.search(r'(\d+)_(\d+)_(\d+)_(\d+)_(\d+)_(.+)',
                          self._id_str)

        year, month, day, hour, minute, name = \
            match.group(1), match.group(2), match.group(3), match.group(4), \
            match.group(5), match.group(6)

        return f'{name} ({year}-{month}-{day} {hour}:{minute})'

    @property
    def value(self):
        return self._id_str


class ProfilingResults:
    def is_identifier(identifier) -> bool:
        return re.search(r'(\d+)_(\d+)_(\d+)_(\d+)_(\d+)_(.+)',
                         identifier) is not None

    def get_all_ids(path_str: str) -> list:
        id_str_list = []
        path = Path(path_str)

        for x in filter(Path.is_dir, path.glob('*')):
            match = re.search(r'(\d+)_(\d+)_(\d+)_(\d+)_(\d+)_(.+)',
                              x.name)

            if match is None:
                continue

            id_str_list.append((x.name,
                                (-int(match.group(1)),
                                 -int(match.group(2)),
                                 -int(match.group(3)),
                                 -int(match.group(4)),
                                 -int(match.group(5)),
                                 match.group(6))))

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
                            Path(__file__).resolve().parent / 'perf_script.py'],
                           cwd=self._path, stdout=subprocess.PIPE)

        r.check_returncode()

        tree = pickle.loads(r.stdout)
        l = list(map(lambda x: x.tag[-1],
                     tree.all_nodes_itr()))
        minimum, maximum = min(l), max(l)

        for n in tree.all_nodes_itr():
            if n.tag[-1] == -1 or minimum == maximum:
                n.tag += (0,)
            else:
                n.tag += (round((n.tag[-1] - minimum) * 510 / (maximum - minimum)),)

        self._thread_tree = tree
        return tree

    def get_json_tree(self):
        tree = self.get_thread_tree()

        def node_to_dict(node):
            # process name, PID/TID, ordered off-CPU time regions,
            # start time in ns, runtime in ns, runtime color code
            a, b, g, c, d, e = node.tag

            # Convert times to milliseconds
            c /= 1000000
            if d != -1:
                d /= 1000000

            g = list(map(lambda x: (x[0] / 1000000, x[1] / 1000000), g))

            sampled_time_path = self._path / 'processed' / \
                f'{b.replace("/", "_")}_sampled_time.data'
            data_path = self._path / 'processed' / \
                         f'{b.replace("/", "_")}.data'

            if sampled_time_path.exists() and \
               len(sampled_time_path.read_text()) > 0:
                total_sampled_time = float(sampled_time_path.read_text())
            elif data_path.exists():
                total_sampled_time = 0

                with data_path.open(mode='r') as f:
                    for line in f:
                        total_sampled_time += float(line.strip().split(' ')[-1])

                total_sampled_time /= 1000

                with sampled_time_path.open(mode='w') as f:
                    f.write(str(total_sampled_time))
            else:
                total_sampled_time = d

            # Convert runtime color code to red and green codes in RGB
            # (blue is always 0)
            red, green = min(e, 255), min(510 - e, 255)

            to_return = {
                'id': b.replace('/', '_'),
                'start_time': c,
                'runtime': d,
                'sampled_time': total_sampled_time,
                'name': a,
                'pid_tid': b,
                'color': f'#{red:0{2}x}{green:0{2}x}00',
                'off_cpu': g,
                'start_callchain': self._start_callchains[b.split('/')[1]],
                'children': []
            }

            children = tree.children(node.identifier)

            if len(children) > 0:
                for child in children:
                    to_return['children'].append(node_to_dict(child))

            return to_return

        return json.dumps(node_to_dict(tree.get_node(tree.root)))
