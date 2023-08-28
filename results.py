import re
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
        self._syscalls_data = ''
        path = Path(PROFILING_STORAGE) / identifier

        with (path / 'syscalls.data').open(mode='r') as f:
            for line in f:
                self._syscalls_data += line

        self._thread_tree = None

    def get_thread_tree(self) -> Tree:
        if self._thread_tree is not None:
            return self._thread_tree

        start_time = None
        tree = Tree()

        tmp_dict = {}
        pid_dict = {}

        for line in self._syscalls_data.split('\n'):
            line = line.strip()
            if line.startswith('?') or len(line) == 0:
                continue

            match = re.search(r'^\s*([0-9\.]+).+?\:\s*(.+?)/([0-9]+)\s*([a-z0-9]+|\.\.\.)(.+)', line)

            if match is None:
                raise RuntimeError(line)

            t = int(match.group(1).replace('.', ''))
            name = match.group(2)
            pid = int(match.group(3))
            syscall = match.group(4)
            body = match.group(5)

            if name not in ['perf', 'python3.12']:
                continue

            if syscall == '...':
                if pid not in tmp_dict:
                    raise RuntimeError((line, pid))

                syscall = tmp_dict[pid][0]
                body = tmp_dict[pid][1] + re.sub(r'\s*\[continued\]\:\s*[a-z0-9]+\(.*?\)\)', '', body)
                line += ' ***AND*** ' + tmp_dict[pid][2]
            elif body.endswith('...'):
                tmp_dict[pid] = (syscall, body[:-3], line)
                continue

            if syscall != 'clone':
                raise RuntimeError((line, syscall))

            match_flags = re.search(r'clone_flags\: (\S+)', body)

            if match_flags is None:
                raise RuntimeError((line, body))

            flags = match_flags.group(1).replace(',', '').split('|')

            return_match = re.search(r'\s*\=\s*([0-9]+)(?:\s*\(\S*\))?$', body)

            if return_match is None:
                raise RuntimeError((line, body))

            return_val = int(return_match.group(1))

            if name == 'perf' and '0x11' in flags:
                start_time = t
                code = f'{return_val}/{return_val}'
                pid_dict[return_val] = code
                tree.create_node(f'{code} (at 0 &micro;s)', code)
                tree.root = code
            elif name == 'python3.12':
                calling = pid_dict[pid]

                if 'THREAD' in flags:
                    code = f'{calling.split("/")[0]}/{return_val}'
                else:
                    code = f'{return_val}/{return_val}'

                if 'PARENT' in flags:
                    raise NotImplementedError(line)

                pid_dict[return_val] = code
                tree.create_node(f'{code} (at {t - start_time:,} &micro;s)', code, parent=calling)

        self._thread_tree = tree
        return tree

    def get_thread(self, pid: int, tid: int) -> ProfilingThread:
        pass
