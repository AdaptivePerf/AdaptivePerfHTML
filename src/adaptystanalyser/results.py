# SPDX-FileCopyrightText: 2026 CERN
# SPDX-License-Identifier: LGPL-3.0-or-later

import json
import yaml
import random
import friendly_names
from . import arrangements as arrgmts
from abc import ABC, abstractmethod
from functools import wraps
from typing import Union
from pathlib import Path
from importlib import import_module


class Identifier:
    """
    A class representing a performance analysis session identifier/metadata.
    """

    def __init__(self, result: Path):
        """
        Construct an Identifier object, checking the correctness
        of the supplied result folder.

        :param pathlib.Path result: Performance analysis session folder.
        :raises FileNotFoundError: When the provided folder does not contain
                                   a dirmeta.json file.
        :raises ValueError: When a provided folder doesn't exist or is
                            incorrect.
        """
        if not (result / 'dirmeta.json').exists():
            raise FileNotFoundError(str(result / 'dirmeta.json') +
                                    ' does not exist!')

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
        Return a user-friendly string representation of the metadata in
        form of "<label> (<year>-<month>-<day> <hour>:<minute>:<second>)".
        """
        return f'{self._label} (' \
            f'{self._year}-{self._month}-{self._day} ' \
            f'{self._hour}:{self._minute}:{self._second})'

    def get_detailed_path(self, entity=None,
                          analysable=None, module=None):
        """
        Get a path to a specific component of the performance analysis
        session.

        :param entity: Entity object or entity name.
        :param analysable: Analysable object or name of an analysable.
        :param module: Module object or module name.
        """
        if isinstance(entity, Entity):
            entity = entity.name

        if isinstance(analysable, Analysable):
            analysable = analysable.name

        if isinstance(module, Module):
            module = module.get_name()

        to_return = self._path / 'system'

        if entity is not None:
            to_return = to_return / entity

        if analysable is not None:
            to_return = to_return / analysable

        if module is not None:
            to_return = to_return / module

        return to_return

    @property
    def label(self):
        """
        Return the label of the performance analysis session.
        """
        return self._label

    @property
    def year(self):
        """
        Return the year in which the performance analysis session started.
        """
        return int(self._year)

    @property
    def month(self):
        """
        Return the month in which the performance analysis session started.
        """
        return int(self._month)

    @property
    def day(self):
        """
        Return the day on which the performance analysis session started.
        """
        return int(self._day)

    @property
    def hour(self):
        """
        Return the hour at which the performance analysis session started.
        """
        return int(self._hour)

    @property
    def minute(self):
        """
        Return the minute at which the performance analysis session started.
        """
        return int(self._minute)

    @property
    def second(self):
        """
        Return the second at which the performance analysis session started.
        """
        if self._second is not None:
            return int(self._second)

        return []

    @property
    def value(self):
        """
        Return the name of the performance analysis session directory.
        """
        return self._path.name

    @property
    def path(self):
        """
        Return the resolved path to the performance analysis session.
        """
        return self._path

    def __eq__(self, other):
        return str(self) == str(other) and \
            str(self.path) == str(other.path)

    def __hash__(self):
        return hash(str(self) + str(self.path))


class Module(ABC):
    """
    An abstract base class for an Adaptyst Analyser module.
    """

    def needs_loading(method):
        """
        Decorate a method to call Module.load() before executing
        the method.

        :param callable method: Module method to decorate.
        """
        @wraps(method)
        def load_internals_and_run(self, *args, **kwargs):
            self.load()
            return method(self, *args, **kwargs)

        return load_internals_and_run

    @abstractmethod
    def get_name(self):
        """
        Return the name of the module.
        """
        pass

    @abstractmethod
    def process_post_request(self, data):
        """
        Process a POST request addressed to the module.
        The return value must be either a (<response data>,
        <HTTP status code>) tuple or just response data (the
        200 HTTP status code is assumed then).

        :param data: Data supplied in the POST request.
        """
        pass

    @abstractmethod
    def _load(self):
        """
        Load the internal data required by the module. All
        time- and/or resource-consuming code must be implemented
        here.
        """
        pass

    def load(self):
        """
        Load module data if it has not been loaded yet.

        :raises RuntimeError: When no Analysable or Session object
                              has been assigned to the module.
        """
        if self.is_loaded():
            return

        if not hasattr(self, '_analysable') or \
           self._analysable is None:
            raise RuntimeError('set_analysable() must be ' +
                               'called before calling load()')

        if not hasattr(self, '_session') or \
           self._session is None:
            raise RuntimeError('set_session() must be ' +
                               'called before calling load()')

        self._load()
        self._loaded = True

    def is_loaded(self):
        """
        Return whether the module data have been loaded.
        """
        if hasattr(self, '_loaded'):
            return self._loaded

        return False

    def set_analysable(self, analysable):
        """
        Set an Analysable object to which the module belongs.

        :param Analysable analysable: Owning Analysable object.
        """
        self._analysable = analysable

    def get_analysable(self):
        """
        Return the Analysable object to which the module belongs.
        If it isn't set, None is returned.
        """
        if hasattr(self, '_analysable'):
            return self._analysable

        return None

    def set_session(self, session):
        """
        Set a Session object to which the module belongs.

        :param Session session: Owning Session object.
        """
        self._session = session

    def get_session(self):
        """
        Return the Session object to which the module belongs.
        If it isn't set, None is returned.
        """
        if hasattr(self, '_session'):
            return self._session

        return None

    def set_version_used(self, ver_code: list[int]):
        """
        Set the version code of the module that produced the
        results.

        See https://adaptyst.web.cern.ch/docs/adaptyst/module-development
        for details of module versioning on the Adaptyst and
        Adaptyst Analyser side.

        :param list[int] ver_code: Module version code.
        """
        self._version_used = ver_code

    def get_version_used(self) -> list[int]:
        """
        Return the version code of the module that produced
        the results. If it's not set, None is returned.

        See https://adaptyst.web.cern.ch/docs/adaptyst/module-development
        for details of module versioning on the Adaptyst and
        Adaptyst Analyser side.
        """
        if hasattr(self, '_version_used'):
            return self._version_used

        return None


class Analysable:
    """
    A class describing an element of a system graph that one or more
    modules can be attached to for analysis.
    """

    def __init__(self, name: str, modules: list[Module],
                 entity=None):
        """
        Construct an Analysable object.

        :param str name: Name of the component.
        :param list[Module] modules: Modules attached to the component.
        :param Entity entity: Entity to which the component belongs.
        """
        self._name = name
        self._modules = {}
        self._entity = entity

        for m in modules:
            m.set_analysable(self)
            self._modules[m.get_name()] = m

    @property
    def name(self):
        """
        Return the name of the component.
        """
        return self._name

    def get_module(self, name: str) -> Module:
        """
        Return a Module object attached to the component by name.
        If it doesn't exist, None is returned.

        :param str name: Module name.
        """
        return self._modules.get(name, None)

    def get_modules_iterable(self):
        """
        Return an iterable of modules attached to the component.
        """
        return self._modules.values()

    @property
    def entity(self):
        """
        Return the entity to which the component belongs.
        """
        return self._entity

    def __hash__(self):
        return hash(self._name)


class Edge(Analysable):
    """
    A class describing a directed connection between two nodes
    in a system graph.
    """

    def __init__(self, start, end, name: str, modules: list[Module] = []):
        """
        Construct an Edge object.

        :param Node start: Node at which the edge starts.
        :param Node end: Node at which the edge ends.
        :param str name: Name of the edge.
        :param list[Module] modules: Modules attached to the edge.
        """
        super().__init__(name, modules)
        self._start = start
        self._end = end

    @property
    def start(self):
        """
        Return the Node object at which the edge starts.
        """
        return self._start

    @property
    def end(self):
        """
        Return the Node object at which the edge ends.
        """
        return self._end

    def get_export_name(self):
        """
        Return the graph-unique export name of the edge.
        """
        if self.start.entity == self.end.entity:
            return f'{self.start.entity.name}_{self.name}'
        else:
            return self.name


class Node(Analysable):
    """
    A class describing a system graph node.
    """

    def __init__(self, name: str, entity, modules: list[Module] = []):
        """
        Construct a Node object.

        :param str name: Name of the node.
        :param Entity entity: Entity to which the node belongs.
        :param list[Module] modules: Modules attached to the node.
        """
        super().__init__(name, modules, entity)
        self._out_edges = {}

    def add_out_edge(self, edge: Edge):
        """
        Add an outgoing edge to the node.

        :param Edge edge: Edge to add.
        :raises ValueError: When an edge with the same name already exists.
        """
        if edge.name in self._out_edges:
            raise ValueError(f'Edge "{edge.name}" already exists!')

        self._out_edges[edge.name] = edge

    def remove_out_edge(self, name: str) -> bool:
        """
        Remove an outgoing edge from the node by name.
        The return value is a boolean indicating whether the edge
        has been removed.

        :param str name: Name of the edge to remove.
        """
        if name in self._out_edges:
            del self._out_edges[name]
            return True

        return False

    def get_out_edge(self, name: str) -> Edge:
        """
        Return an outgoing edge by name. If it doesn't exist,
        None is returned.

        :param str name: Name of the edge.
        """
        return self._out_edges.get(name, None)

    def get_out_edges_iterable(self):
        """
        Return an iterable of outgoing edges.
        """
        return self._out_edges.values()

    def get_export_name(self):
        """
        Return the graph-unique export name of the node.
        """
        return f'{self.entity.name}_{self.name}'


class Entity:
    """
    A class describing an entity in a system graph.
    """

    _used_colours = set()

    def __init__(self, name: str):
        """
        Construct an Entity object.

        :param str name: Name of the entity.
        """
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
        """
        Add a node to the entity.

        :param Node node: Node to add.
        :raises ValueError: When a node with the same name already exists.
        """
        if node.name in self._nodes:
            raise ValueError(f'Node "{node.name}" already exists')

        self._nodes[node.name] = node

    def remove_node(self, name: str) -> bool:
        """
        Remove a node from the entity by name. The return value
        is a boolean indicating whether the node has been removed.

        :param str name: Name of the node to remove.
        """
        if name in self._nodes:
            del self._nodes[name]
            return True

        return False

    def get_node(self, name: str) -> Node:
        """
        Return a node in the entity by name.

        :param str name: Name of the node.
        """
        return self._nodes.get(name, None)

    def get_nodes_iterable(self):
        """
        Return an iterable of nodes in the entity.
        """
        return self._nodes.values()

    def get_hex_colour(self):
        """
        Return the colour assigned to the entity in hexadecimal form.
        """
        colour = self._colour
        return f'#{colour[0]:02x}{colour[1]:02x}{colour[2]:02x}'

    def set_exit_code(self, exit_code: int):
        """
        Set the exit code of the entity.

        :param int exit_code: Entity exit code.
        """
        self._exit_code = exit_code

    def get_exit_code(self) -> int:
        """
        Return the exit code of the entity.
        """
        return self._exit_code

    @property
    def name(self):
        """
        Return the name of the entity.
        """
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
        a given directory. The return value is a list of Identifier objects.

        :param str path_str: String path to a directory.
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

        :param identifier: Identifier of a performance analysis
                           session to be loaded. It can be either
                           an Identifier object obtained from
                           get_all_sessions(), a pathlib.Path object
                           representing the path to a performance
                           analysis session folder, or a string path
                           to the same folder.
        :raises ValueError: When the identifier is not a string or
                            an Identifier/pathlib.Path object.
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
                    self._identifier, entity, node,
                    module_dict.get('options', None))

            mod_meta_path = mod_meta_path_prefix / name / 'dirmeta.json'

            if not mod_meta_path.exists():
                return

            with mod_meta_path.open(mode='r') as f:
                mod_meta = json.load(f)

            if 'version' not in mod_meta:
                return

            module_obj.set_version_used(mod_meta['version'])
            module_obj.set_session(self)
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
        """
        Return the identifier of the performance analysis session.
        """
        return self._identifier

    def get_url(self, compact: bool = False,
                hide_header: bool = False,
                hide_footer: bool = False):
        """
        Get the URL suffix used to open the performance analysis session
        in an Adaptyst Analyser web server.

        :param bool compact: Whether to use the compact mode.
        :param bool hide_header: Whether to hide the header in compact mode.
        :param bool hide_footer: Whether to hide the footer in compact mode.
        """
        url_end = '/?session=' + self._identifier.value

        if compact:
            url_end += '&compact=1'

            if hide_header:
                url_end += '&hide_header=1'

            if hide_footer:
                url_end += '&hide_footer=1'

        return url_end

    def get_entity(self, name: str) -> Entity:
        """
        Return an entity in the performance analysis session by name.
        If it doesn't exist, None is returned.

        :param str name: Name of the entity.
        """
        return self._entities.get(name, None)

    def get_entities_iterable(self):
        """
        Return an iterable of entities in the performance analysis session.
        """
        return self._entities.values()

    def process_post_request(self, data, entity, analysable, module):
        """
        Process a POST request addressed to a module in the session
        and return the response produced by the module.

        :param data: Data supplied in the POST request.
        :param str entity: Name of the target entity.
        :param str analysable: Name of the target analysable.
        :param str module: Name of the target module.
        :raises NotImplementedError: When the request targets no entity.
        :raises FileNotFoundError: When the target entity, analysable, or
                                   module does not exist.
        """
        if entity is None:
            raise NotImplementedError

        if entity not in self._entities:
            raise FileNotFoundError

        entity_obj = self._entities[entity]
        node = entity_obj.get_node(analysable)

        if node is None:
            for n in entity_obj.get_nodes_iterable():
                for e in n.get_out_edges_iterable():
                    if e.name == analysable:
                        mod = e.get_module(module)

                        if mod is None:
                            raise FileNotFoundError

                        return mod.process_post_request(data)

            raise FileNotFoundError
        else:
            mod = node.get_module(module)

            if mod is None:
                raise FileNotFoundError

            return mod.process_post_request(data)

    def get_system_graph_json(self, json_type: str = 'sigma.js'):
        """
        Return the performance analysis system graph as JSON data.

        :param str json_type: Requested graph JSON format. Only
                              "sigma.js" is supported at the moment.
        :raises ValueError: When the requested JSON format is unsupported.
        """
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
    """
    An abstract class for a window/tab shown at a website
    from an Adaptyst Analyser web server.
    """

    _ids = set()

    def get_arrgmt_json(windows,
                        session: Session = None,
                        return_session_storage_paths: bool = False):
        """
        Return the JSON data describing a window arrangement that can
        be saved by calling adaptystanalyser.arrangements.Context.save().
        This is a low-level method, you can also use Window.save_arrgmt().

        Optionally, if return_session_storage_paths is set to True,
        a set of parent paths of sessions used by the window(s) is also
        returned (the return value is a (<data>, <paths>) tuple then).

        :param windows: Window or list of windows to serialise. If you
                        provide a single window, a single window arrangement
                        is generated (the dependencies of the provided
                        window are obtained and added automatically).
                        Otherwise, a window arrangement is produced, where
                        you must take care of including all dependencies
                        of all windows there.
        :param Session session: Session associated with the arrangement.
                                It can be None.
        :param bool return_session_storage_paths: Whether to also return the
                                                  parent paths of sessions
                                                  used by the windows.
        :raises ValueError: When no session can be determined for a window
                            arrangement or one or more window
                            dependencies are missing.
        """
        cur_x = 10
        cur_y = 10

        def get_x():
            nonlocal cur_x
            to_return = cur_x
            cur_x += 10
            return to_return

        def get_y():
            nonlocal cur_y
            to_return = cur_y
            cur_y += 10
            return to_return

        if isinstance(windows, list):
            if session is None:
                for w in windows:
                    session = w.get_session()

                    if session is not None:
                        break

                if session is None:
                    raise ValueError('A window arrangement must have ' +
                                     'a session assigned and no session ' +
                                     'could be extracted from the ' +
                                     'provided windows!')

            dictionary = {
                'session': session.identifier.value,
                'windows': {
                    w.get_id(): w.to_dict(get_x(), get_y()) for w in windows
                }
            }

            for w in windows:
                for d in w.get_dependencies():
                    if d.get_id() not in dictionary['windows']:
                        raise ValueError('No window "' + d.get_id() + '" ' +
                                         'found which is a dependency of ' +
                                         'another window!')

            if return_session_storage_paths:
                paths = set()
                for w in windows:
                    s = w.get_session()

                    if s is not None:
                        paths.add(s.identifier.path.parent)

                return json.dumps(dictionary), paths
            else:
                return json.dumps(dictionary)
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

            if session is None:
                session = windows.get_session()

                if session is None:
                    for w in all_dependencies:
                        session = w.get_session()

                        if session is not None:
                            break

            to_return = {
                'main_window': windows.to_dict(),
                'other_windows': {
                    w.get_id(): w.to_dict(get_x(), get_y(), True)
                    for w in all_dependencies
                }
            }

            if session is not None:
                to_return['session'] = session.identifier.value

            if return_session_storage_paths:
                paths = set()

                s = windows.get_session()

                if s is not None:
                    paths.add(s.identifier.path.parent)

                for w in all_dependencies:
                    s = w.get_session()

                    if s is not None:
                        paths.add(s.identifier.path.parent)

                return json.dumps(to_return), paths
            else:
                return json.dumps(to_return)

    def save_arrgmt(windows,
                    name: str = None,
                    session: Session = None,
                    db_url: str = None,
                    db_pass: str = None):
        """
        Save an arrangement in the database.

        If no name is supplied, a tuple (<arrangement identifier>,
        <arrangement update token>, <random human-friendly arrangement
        name>) is returned. Otherwise, the return value is a tuple
        (<arrangement identifier>, <arrangement update token>).

        :param windows: Window or list of windows to save. If you
                        provide a single window, a single window arrangement
                        is generated (the dependencies of the provided
                        window are obtained and added automatically).
                        Otherwise, a window arrangement is produced, where
                        you must take care of including all dependencies
                        of all windows there.
        :param str name: Name to assign to the arrangement. It can be
                         None, then a random human-friendly name is generated.
        :param Session session: Session associated with the arrangement.
        :param str db_url: Database URL to use. Use the SQLAlchemy syntax.
                           It can be None, a default SQLite database is used
                           then.
        :param str db_pass: Database password to use. It can be None.
        :raises NotImplementedError: When the windows refer to sessions stored
                                     in more than one parent directory.
        """
        to_save, storage_paths = Window.get_arrgmt_json(windows, session, True)

        if len(storage_paths) == 0:
            storage_path = None
        elif len(storage_paths) > 1:
            raise NotImplementedError(
                'At the moment, all sessions which windows to be saved ' +
                'relate to must be stored in the same path.')
        else:
            storage_path = next(iter(storage_paths))

        with arrgmts.Context(db_url, db_pass) as cxt:
            if name is None:
                while True:
                    try:
                        name = friendly_names.generate(separator=' ')
                        return *(cxt.save(name, to_save, storage_path)), name
                    except FileExistsError:
                        pass
            else:
                return cxt.save(name, to_save, storage_path)

    def get_arrgmt_url(identifier: int,
                       compact: bool = True,
                       hide_header: bool = True,
                       hide_footer: bool = True):
        """
        Get the URL suffix used to open a saved window arrangement
        in an Adaptyst Analyser web server.

        :param int identifier: Identifier of the saved arrangement.
        :param bool compact: Whether to use the compact mode.
        :param bool hide_header: Whether to hide the header in compact mode.
        :param bool hide_footer: Whether to hide the footer in compact mode.
        """
        url_end = '/?arrgmt=' + str(identifier)
        if compact:
            url_end += '&compact=1'

            if hide_header:
                url_end += '&hide_header=1'

            if hide_footer:
                url_end += '&hide_footer=1'

        return url_end

    @abstractmethod
    def get_module(self) -> Module:
        """
        Return the Module object associated with the window.
        """
        pass

    @abstractmethod
    def get_type(self) -> str:
        """
        Return the type identifier of the window. On the client
        side in JavaScript, this must match the return value of
        getType() in the corresponding module class and be recognised by
        getWindowClass().
        """
        pass

    @abstractmethod
    def get_constr_args(self) -> list:
        """
        Return the arguments required to construct the window.
        """
        pass

    @abstractmethod
    def get_dependencies(self) -> list:
        """
        Return the Window objects on which this window depends.
        """
        pass

    @abstractmethod
    def get_init_data(self):
        """
        Return the initialisation data required by the window.
        """
        pass

    @abstractmethod
    def get_data(self):
        """
        Return the data stored by the window.
        """
        pass

    @abstractmethod
    def get_session(self) -> Session:
        """
        Return the performance analysis session associated with the window.
        """
        pass

    @abstractmethod
    def get_analysable(self) -> Analysable:
        """
        Return the Analysable object associated with the window.
        """
        pass

    def set_id(self, identifier):
        """
        Set the unique identifier of the window.

        :param identifier: Identifier to assign to the window.
        :raises ValueError: When the identifier is assigned to another
                            Window instance.
        """
        if identifier in Window._ids:
            raise ValueError(f'"{identifier}" is already set '
                             'for a different Window instance')

        if hasattr(self, '_id'):
            Window._ids.remove(self._id)

        self._id = identifier
        Window._ids.add(identifier)

    def get_id(self):
        """
        Return the unique identifier of the window.

        An identifier is generated from the session and window type if one
        has not been assigned.
        """
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
        """
        Set a custom title for the window.

        :param str title: Title to assign to the window.
        """
        self._custom_title = title

    def get_custom_title(self):
        """
        Return the custom title of the window. If it's not
        set, None is returned.
        """
        if hasattr(self, '_custom_title'):
            return self._custom_title
        else:
            return None

    def is_collapsed(self):
        """
        Return whether the window is collapsed.
        """
        if hasattr(self, '_collapsed') and \
           self._collapsed is not None:
            return self._collapsed
        else:
            return False

    def set_collapsed(self, collapsed: bool):
        """
        Set whether the window is collapsed.

        :param bool collapsed: Whether the window is collapsed.
        """
        self._collapsed = collapsed

    def set_x(self, x: float):
        """
        Set the horizontal position of the window in pixels.

        :param float x: Horizontal position.
        """
        self._x = x

    def set_y(self, y: float):
        """
        Set the vertical position of the window in pixels.

        :param float y: Vertical position.
        """
        self._y = y

    def to_dict(self, x=None, y=None, collapsed=None):
        """
        Return a dictionary representation of the window.

        x- and y-coordinate arguments are used only when the
        corresponding values have not been assigned to the window elsewhere.
        On the other hand, if an explicit "collapsed" argument is
        set, it always overrides whatever collapsed state has been
        assigned before.

        :param x: Fallback horizontal position of the window in pixels.
        :param y: Fallback vertical position of the window in pixels.
        :param bool collapsed: Override collapsed state of the window.
        """
        to_return = {
            'id': self.get_id(),
            'type': self.get_type(),
            'constr': self.get_constr_args(),
            'dependencies': list(map(Window.get_id,
                                     self.get_dependencies())),
            'collapsed': self.is_collapsed()
            if collapsed is None else collapsed
        }

        if hasattr(self, '_x') and self._x is not None:
            to_return['x'] = self._x
        elif x is not None:
            to_return['x'] = x

        if hasattr(self, '_y') and self._y is not None:
            to_return['y'] = self._y
        elif y is not None:
            to_return['y'] = y

        module = self.get_module()
        custom_title = self.get_custom_title()
        data = self.get_data()

        init_data = self.get_init_data()
        session = self.get_session()
        analysable = self.get_analysable()

        if module is not None:
            to_return['module'] = module.get_name()

        if custom_title is not None:
            to_return['custom_title'] = custom_title

        if data is not None:
            to_return['data'] = data

        if init_data is not None:
            to_return['init_data'] = init_data

        if session is not None:
            to_return['session'] = session.identifier.value

        if analysable is not None:
            to_return['analysable'] = analysable.name

            if analysable.entity is not None:
                to_return['entity'] = analysable.entity.name

        return to_return
