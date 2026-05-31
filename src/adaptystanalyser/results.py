# SPDX-FileCopyrightText: 2026 CERN
# SPDX-License-Identifier: LGPL-3.0-or-later

import json
import yaml
import random
from abc import ABC, abstractmethod
from typing import Union, Self
from pathlib import Path
from importlib import import_module
from . import arrangements as arrgmts


class Identifier:
    """
    A class representing a performance analysis session identifier.
    """

    def __init__(self, result: Path):
        """
        Construct an Identifier object, checking the correctness
        of the supplied result folder.

        :param pathlib.Path result: A performance analysis session folder.
        :raises ValueError: When a provided folder doesn't exist or is
                            incorrect.
        """
        if not (result / 'dirmeta.json').exists():
            raise FileNotFoundError(str(result / 'dirmeta.json') + ' does not exist!')

        with (result / 'dirmeta.json').open(mode='r') as f:
            metadata = json.load(f)

        if 'year' not in metadata or \
           'month' not in metadata or \
           'day' not in metadata or \
           'hour' not in metadata or \
           'minute' not in metadata or \
           'second' not in metadata or \
           'label' not in metadata:
            raise ValueError('The metadata do not have all the required '
                             'fields!')

        self._year, self._month, self._day, self._hour, self._minute, \
            self._second, self._label = metadata['year'], \
            metadata['month'], \
            metadata['day'], metadata['hour'], metadata['minute'], \
            metadata['second'], metadata['label']

        if self._month < 10:
            self._month = '0' + str(self._month)
        else:
            self._month = str(self._month)

        if self._day < 10:
            self._day = '0' + str(self._day)
        else:
            self._day = str(self._day)

        if self._hour < 10:
            self._hour = '0' + str(self._hour)
        else:
            self._hour = str(self._hour)

        if self._minute < 10:
            self._minute = '0' + str(self._minute)
        else:
            self._minute = str(self._minute)

        if self._second < 10:
            self._second = '0' + str(self._second)
        else:
            self._second = str(self._second)

        self._path = result.resolve()

    def __str__(self):
        """
        Return a user-friendly string representation of the identifier in
        form of "<label> ( <year>-<month>-<day> <hour>:<minute>:<second>)".
        """
        return f'{self._label} (' \
            f'{self._year}-{self._month}-{self._day} ' \
            f'{self._hour}:{self._minute}:{self._second})'

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

        return []

    @property
    def value(self):
        return self._path.name

    @property
    def path(self):
        return self._path

    def __eq__(self, other):
        return str(self) == str(other) and \
            str(self.path) == str(other.path)

    def __hash__(self):
        return hash(str(self) + str(self.path))


class Module(ABC):
    @abstractmethod
    def get_name(self):
        pass

    def set_version_used(self, ver_code: list[int]):
        self._version_used = ver_code

    def get_version_used(self) -> list[int]:
        if hasattr(self, '_version_used'):
            return self._version_used

        return None


class Analysable:
    def __init__(self, name: str, modules: list[Module]):
        self._name = name
        self._modules = {
            m.get_name(): m for m in modules
        }

    @property
    def name(self):
        return self._name

    def get_module(self, name: str) -> Module:
        return self._modules.get(name, None)

    def get_modules_iterable(self):
        return self._modules.values()

    def __hash__(self):
        return hash(self._name)


class Edge(Analysable):
    def __init__(self, start, end, name: str, modules: list[Module] = []):
        super().__init__(name, modules)
        self._start = start
        self._end = end

    @property
    def start(self):
        return self._start

    @property
    def end(self):
        return self._end

    def get_export_name(self):
        if self.start.entity == self.end.entity:
            return f'{self.start.entity.name}_{self.name}'
        else:
            return self.name


class Node(Analysable):
    def __init__(self, name: str, entity, modules: list[Module] = []):
        super().__init__(name, modules)
        self._out_edges = {}
        self._entity = entity

    def add_out_edge(self, edge: Edge):
        if edge.name in self._out_edges:
            raise ValueError(f'Edge "{edge.name}" already exists!')

        self._out_edges[edge.name] = edge

    def remove_out_edge(self, name: str) -> bool:
        if name in self._out_edges:
            del self._out_edges[name]
            return True

        return False

    def get_out_edge(self, name: str) -> Edge:
        return self._out_edges.get(name, None)

    def get_out_edges_iterable(self):
        return self._out_edges.values()

    @property
    def entity(self):
        return self._entity

    def get_export_name(self):
        return f'{self.entity.name}_{self.name}'


class Entity:
    _used_colours = set()

    def __init__(self, name: str):
        self._name = name
        self._nodes = {}
        self._exit_code = -1

        # TODO: Move entity colour assigning to Adaptyst itself or
        # remove it altogether
        colour = (random.randrange(100, 181, 10),
                  random.randrange(100, 181, 10),
                  random.randrange(100, 181, 10))

        while colour in Entity._used_colours:
            colour = (random.randrange(100, 181, 10),
                      random.randrange(100, 181, 10),
                      random.randrange(100, 181, 10))

        Entity._used_colours.add(colour)
        self._colour = colour

    def add_node(self, node: Node):
        if node.name in self._nodes:
            raise ValueError(f'Node "{node.name}" already exists')

        self._nodes[node.name] = node

    def remove_node(self, name: str) -> bool:
        if name in self._nodes:
            del self._nodes[name]
            return True

        return False

    def get_node(self, name: str) -> Node:
        return self._nodes.get(name, None)

    def get_nodes_iterable(self):
        return self._nodes.values()

    def get_hex_colour(self):
        colour = self._colour
        return f'#{colour[0]:02x}{colour[1]:02x}{colour[2]:02x}'

    def set_exit_code(self, exit_code: int):
        self._exit_code = exit_code

    def get_exit_code(self) -> int:
        return self._exit_code

    @property
    def name(self):
        return self._name

    def __eq__(self, other):
        return self.name == other.name


class Session:
    """
    A class describing a specific performance analysis session.
    """

    def get_all_sessions(path_str: str) -> list:
        """
        Get the identifiers of all performance analysis sessions stored in
        a given directory.

        :param str path_str: The string path to a directory.
        :return: The list of all session identifiers (in form of Identifier
                 objects) detected inside the provided directory.
        """
        ids = []
        path = Path(path_str)

        for x in filter(Path.is_dir, path.glob('*')):
            try:
                identifier = Identifier(x)
            except FileNotFoundError:
                continue
            except ValueError:
                continue

            ids.append(identifier)

        return list(sorted(ids, key=lambda x: (-x.year,
                                               -x.month,
                                               -x.day,
                                               -x.hour,
                                               -x.minute,
                                               -x.second,
                                               x.label)))

    def __init__(self, identifier: Union[Identifier, Path, str]):
        """
        Construct a Session object.

        :param identifier: The identifier of a performance analysis
                           session to be loaded. It can be either
                           an Identifier object obtained from
                           get_all_sessions(), a pathlib.Path object
                           representing the path to a performance
                           analysis session folder, or a string path
                           to the same folder.
        """
        if isinstance(identifier, Identifier):
            self._identifier = identifier
        elif isinstance(identifier, Path):
            self._identifier = Identifier(identifier)
        elif isinstance(identifier, str):
            self._identifier = Identifier(Path(identifier))
        else:
            raise ValueError('identifier must be of type Identifier, '
                             'pathlib.Path, or str!')

        self._entities = {}

        with (self._identifier.path / 'system' /
              'system.yml').open(mode='r') as f:
            system_yaml = yaml.safe_load(f)

        def process_mod(module_dict, mod_meta_path_prefix,
                        module_list, entity, node):
            name = module_dict['name']
            module_obj = \
                import_module(f'adaptystanalyser.modules.{name}').get_mod_obj(
                    self._identifier, entity, node, module_dict.get('options', None))

            mod_meta_path = mod_meta_path_prefix / name / 'dirmeta.json'

            if not mod_meta_path.exists():
                return

            with mod_meta_path.open(mode='r') as f:
                mod_meta = json.load(f)

            if 'version' not in mod_meta:
                return

            module_obj.set_version_used(mod_meta['version'])
            modules.append(module_obj)

        for entity_name, entity in system_yaml['entities'].items():
            self._entities[entity_name] = Entity(entity_name)
            entity_obj = self._entities[entity_name]

            for node, settings in entity.get('nodes', {}).items():
                modules = []

                for mod in settings.get('modules', []):
                    process_mod(mod,
                                self._identifier.path / 'system' /
                                entity_name / node,
                                modules, entity_name, node)

                entity_obj.add_node(Node(node, entity_obj, modules))

            for edge, settings in entity.get('edges', {}).items():
                start_obj = entity_obj.get_node(settings['from'])
                end_obj = entity_obj.get_node(settings['to'])
                modules = []

                for mod in settings.get('modules', []):
                    process_mod(mod,
                                self._identifier.path / 'system' /
                                entity_name / edge,
                                modules, entity_name, edge)

                start_obj.add_out_edge(Edge(start_obj, end_obj, edge, modules))

        for edge, settings in system_yaml.get('edges', {}).items():
            start_obj = self._entities[settings['from']['entity']].get_node(
                settings['from']['node'])
            end_obj = self._entities[settings['to']['entity']].get_node(
                settings['to']['node'])
            modules = []

            for mod in settings.get('modules', []):
                process_mod(mod,
                            self._identifier.path / 'system' / edge,
                            modules, None, edge)

            start_obj.add_out_edge(Edge(start_obj, end_obj, edge, modules))

        for entity_dir in (self._identifier.path / 'system').glob('*'):
            if not entity_dir.is_dir():
                continue

            if not (entity_dir / 'dirmeta.json').exists():
                continue

            with (entity_dir / 'dirmeta.json').open(mode='r') as f:
                metadata = json.load(f)

            self._entities[entity_dir.name].set_exit_code(
                metadata.get('exit_code', -1))

    @property
    def identifier(self):
        return self._identifier

    def get_system_graph_json(self, json_type: str = 'sigma.js'):
        entity_metadata = {
            k: [e.get_exit_code(), e.get_hex_colour()]
            for k, e in self._entities.items()
        }

        if json_type == 'sigma.js':
            return json.dumps({
                'entities': entity_metadata,
                'system': {
                    'options': {
                        'allowSelfLoops': False,
                        'multi': False,
                        'type': 'directed'
                    },
                    'nodes': [
                        {
                            'key': node.get_export_name(),
                            'attributes': {
                                'x': random.random(),
                                'y': random.random(),
                                'label': f'[{entity.name}] {node.name}',
                                'server_id': node.name,
                                'size': 40,
                                'color': entity.get_hex_colour(),
                                'entity': entity.name,
                                'backends':
                                [[x.get_name(), x.get_version_used()]
                                 for x in node.get_modules_iterable()]
                            }
                        }
                        for entity in self._entities.values()
                        for node in entity.get_nodes_iterable()
                    ],
                    'edges': [
                        {
                            'key': edge.get_export_name(),
                            'source': edge.start.get_export_name(),
                            'target': edge.end.get_export_name(),
                            'undirected': False,
                            'attributes': {
                                'label': edge.name,
                                'size': 10
                            }
                        }
                        for entity in self._entities.values()
                        for node in entity.get_nodes_iterable()
                        for edge in node.get_out_edges_iterable()
                    ]
                }
            })
        else:
            raise ValueError('json_type must be one of: "sigma.js"')


class Window(ABC):
    _ids = set()

    def get_arrgmt_json(windows: Union[Self, list[Self]],
                        session: Session = None):
        if isinstance(windows, list):
            if session is None:
                raise ValueError('"session" must not be None '
                                 'if "windows" is a list!')

            return json.dumps({
                'session': session.identifier.raw_name,
                'windows': {
                    w.get_id(): w.to_dict() for w in windows
                }
            })
        else:
            cur_dependencies = set(windows.get_dependencies())
            all_dependencies = set(cur_dependencies)

            while len(cur_dependencies) > 0:
                new_dependencies = set()

                for d in cur_dependencies:
                    for wd in d.get_dependencies():
                        new_dependencies.add(wd)

                for d in new_dependencies:
                    all_dependencies.add(d)

                cur_dependencies = new_dependencies

            to_return = {
                'main_window': windows.to_dict(),
                'other_windows': {
                    w.get_id(): w.to_dict() for w in all_dependencies
                }
            }

            if session is not None:
                to_return['session'] = session.identifier.raw_name

            return json.dumps(to_return)

    @abstractmethod
    def get_module(self) -> Module:
        pass

    @abstractmethod
    def get_type(self) -> str:
        pass

    @abstractmethod
    def get_constr_params(self) -> list:
        pass

    @abstractmethod
    def get_dependencies(self) -> list[Self]:
        pass

    @abstractmethod
    def get_data(self):
        pass

    @abstractmethod
    def get_session(self) -> Session:
        pass

    def set_id(self, identifier):
        if identifier in Window._ids:
            raise ValueError(f'"{identifier}" is already set '
                             'for a different Window instance')

        if hasattr(self, '_id'):
            Window._ids.remove(self._id)

        self._id = identifier
        Window._ids.add(identifier)

    def get_id(self):
        if not hasattr(self, '_id'):
            session = self.get_session()
            t = self.get_type()
            index = 0

            if session is None:
                identifier = f'w_{t}_{index}'

                while identifier in Window._ids:
                    index += 1
                    identifier = f'w_{t}_{index}'
            else:
                identifier = f'w_{session.identifier.label}_{t}_{index}'

                while identifier in Window._ids:
                    index += 1
                    identifier = f'w_{session.identifier.label}_{t}_{index}'

            self._id = identifier
            Window._ids.add(identifier)

        return self._id

    def set_custom_title(self, title: str):
        self._custom_title = title

    def get_custom_title(self):
        if hasattr(self, '_custom_title'):
            return self._custom_title
        else:
            return None

    def is_collapsed(self):
        if hasattr(self, '_collapsed') and \
           self._collapsed is not None:
            return self._collapsed
        else:
            return False

    def set_collapsed(self, collapsed: bool):
        self._collapsed = collapsed

    def to_dict(self):
        to_return = {
            'id': self.get_id(),
            'type': self.get_type(),
            'constr': self.get_constr_params(),
            'dependencies': list(map(Window.get_id,
                                     self.get_dependencies())),
            'collapsed': self.is_collapsed()
        }

        module = self.get_module()
        custom_title = self.get_custom_title()
        data = self.get_data()

        if module is not None:
            to_return['module'] = module.get_name()

        if custom_title is not None:
            to_return['custom_title'] = custom_title

        if data is not None:
            to_return['data'] = data

        return to_return
