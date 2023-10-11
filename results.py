import re
import pickle
import subprocess
from treelib import Tree
from pathlib import Path

# Set the path to the profiling results storage here.
PROFILING_STORAGE = '/eos/user/m/mgraczyk/syclops-profiling'

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

class ProfilingThread:
    def __init__(self):
        pass

class ProfilingResults:
    def is_identifier(identifier) -> bool:
        return re.search(r'(\d+)_(\d+)_(\d+)_(\d+)_(\d+)_(.+)',
                         identifier) is not None

    def get_all_ids() -> list:
        path = Path(PROFILING_STORAGE)
        id_str_list = []

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

    def __init__(self, identifier: str):
        self._path = Path(PROFILING_STORAGE) / identifier
        self._thread_tree = None

    def get_thread_tree(self) -> Tree:
        if self._thread_tree is not None:
            return self._thread_tree

        r = subprocess.run(['/data/mgraczyk/linux/tools/perf/perf', 'script', '-i',
                            'syscalls.data', '-s',
                            Path(__file__).resolve().parent / 'perf-script.py'],
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

    def get_thread(self, pid: int, tid: int) -> ProfilingThread:
        pass
