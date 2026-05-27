# SPDX-FileCopyrightText: 2026 CERN
# SPDX-License-Identifier: LGPL-3.0-or-later

import json
import yaml
import random
import html
from abc import ABC, abstractmethod
from typing import Union, Self
from pathlib import Path
from collections import defaultdict


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
            raise ValueError(str(result / 'dirmeta.json') + ' does not exist!')

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

        return None

    @property
    def value(self):
        return str(self) + ': ' + str(self._path)

    @property
    def path(self):
        return self._path

    def __eq__(self, other):
        return self.value == other.value

    def __hash__(self):
        return hash(self.value)


class Module(ABC):
    @abstractmethod
    def get_name(self):
        pass


class Window(ABC):
    _ids = set()

    def get_arrgmt(windows: Union[Self, list[Self]]):
        pass

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

    def get_id(self):
        pass

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

    def to_json(self, identifier: str) -> str:
        to_return = {
            'id': identifier,
            'type': self.get_type(),
            'constr': self.get_constr_params(),
            'dependencies': [],
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

        return json.dumps(to_return)


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

        with (self._identifier.path / 'system' /
              'system.yml').open(mode='r') as f:
            self._system = yaml.safe_load(f)

        self._used_module_vers = defaultdict(lambda: defaultdict(dict))

        for entity_name, entity in self._system['entities'].items():
            for node, settings in entity['nodes'].items():
                for mod in settings['modules']:
                    name = mod['name']
                    mod_meta_path = self._identifier.path / 'system' / \
                        entity_name / node / name / 'dirmeta.json'

                    if not mod_meta_path.exists():
                        continue

                    with mod_meta_path.open(mode='r') as f:
                        mod_meta = json.load(f)

                    if 'version' not in mod_meta:
                        continue

                    self._used_module_vers[entity_name][node][name] = \
                        mod_meta['version']

        self._entity_colours = {}

        # TODO: Move entity colour assigning to Adaptyst itself or
        # remove it altogether

        # if (self._identifier.path / 'entity_colours.json').exists():
        #     with (self._identifier.path /
        #           'entity_colours.json').open(mode='r') as f:
        #         self._entity_colours = json.load(f)
        # else:
        #     self._entity_colours = {}

        self._entity_exit_codes = {}

        for entity_dir in (self._identifier.path / 'system').glob('*'):
            if not entity_dir.is_dir():
                continue

            if not (entity_dir / 'dirmeta.json').exists():
                continue

            with (entity_dir / 'dirmeta.json').open(mode='r') as f:
                metadata = json.load(f)

            self._entity_exit_codes[entity_dir.name] = \
                metadata.get('exit_code', -1)

    def _set_entity_colour(self, entity, colour):
        self._entity_colours[entity] = colour

        # TODO: Move entity colour assigning to Adaptyst itself or
        # remove it altogether

        # with (self._identifier.path /
        #       'entity_colours.json').open(mode='w') as f:
        #     f.write(json.dumps(self._entity_colours))

    def get_system_graph_json(self, json_type: str = 'sigma.js'):
        used_colours = set()
        entities = {}

        for entity in self._system['entities'].keys():
            exit_code = self._entity_exit_codes.get(entity, -1)
            entity = html.escape(entity)
            entities[entity] = [exit_code, '#808080']

            if entity in self._entity_colours:
                used_colours.add(self._entity_colours[entity])
                entities[entity][1] = self._entity_colours[entity]
            else:
                colour = (random.randrange(100, 181, 10),
                          random.randrange(100, 181, 10),
                          random.randrange(100, 181, 10))

                while colour in used_colours:
                    colour = (random.randrange(100, 181, 10),
                              random.randrange(100, 181, 10),
                              random.randrange(100, 181, 10))

                used_colours.add(colour)
                entities[entity][1] = \
                    f'#{colour[0]:02x}{colour[1]:02x}{colour[2]:02x}'
                self._set_entity_colour(entity, entities[entity][1])

        if json_type == 'sigma.js':
            return json.dumps({
                'entities': entities,
                'system': {
                    'options': {
                        'allowSelfLoops': False,
                        'multi': False,
                        'type': 'directed'
                    },
                    'nodes': [
                        {
                            'key': f'{entity}_{k}',
                            'attributes': {
                                'x': random.random(),
                                'y': random.random(),
                                'label': f'[{entity}] {k}',
                                'server_id': k,
                                'size': 40,
                                'color': entities[html.escape(entity)][1],
                                'entity': entity,
                                'backends': [[x['name'],
                                              self._used_module_vers[
                                                  entity][k].get(
                                                      x['name'], [])]
                                             for x in v['modules']]
                            }
                        }
                        for entity in self._system['entities'].keys()
                        for k, v in self._system['entities'][
                                entity]['nodes'].items()
                    ],
                    'edges': [
                        {
                            'key': f'{entity}_{k}',
                            'source': f'{entity}_{v["from"]}',
                            'target': f'{entity}_{v["to"]}',
                            'undirected': False,
                            'attributes': {
                                'label': k,
                                'size': 10
                            }
                        }
                        for entity in self._system['entities'].keys()
                        for k, v in self._system['entities'][
                                entity].get('edges', {}).items()
                    ] + [
                        {
                            'key': k,
                            'source': f'{v["from"]["entity"]}' +
                            f'_{v["from"]["node"]}',
                            'target': f'{v["to"]["entity"]}_{v["to"]["node"]}',
                            'undirected': False,
                            'attributes': {
                                'label': k,
                                'size': 10
                            }
                        }
                        for k, v in self._system.get('edges', {}).items()
                    ]
                }
            })
        else:
            raise ValueError('json_type must be one of: "sigma.js"')
