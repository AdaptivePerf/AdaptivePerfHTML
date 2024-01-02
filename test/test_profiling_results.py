# AdaptivePerfHTML: tool for analysing AdaptivePerf results
# Copyright (C) 2023 CERN.
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; only version 2 of the License.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License along
# with this program; if not, write to the Free Software Foundation, Inc.,
# 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import pytest
import json
from pathlib import Path
from treelib import Tree
from adaptiveperf import ProfilingResults, Identifier


@pytest.fixture()
def results_dir_and_identifier(tmp_path):
    identifier = '2023_12_10_11_13_14_test test2'
    (tmp_path / identifier).mkdir()

    with (tmp_path / identifier / 'new_proc_callchains.data').open(
            mode='w') as f:
        f.write('{}')

    return tmp_path, identifier


def test_get_all_ids_empty(tmp_path):
    assert len(ProfilingResults.get_all_ids(str(tmp_path))) == 0


def test_get_all_ids(tmp_path):
    expected_ids = [
        Identifier('2023_10_11_12_05_19_test test2'),
        Identifier('2021_04_30_23_59_58_another-test test.test.test'),
        Identifier('1999_01_02_00_05_computer command')
    ]

    for i in expected_ids:
        (tmp_path / i.value).mkdir()

    assert ProfilingResults.get_all_ids(str(tmp_path)) == expected_ids


def test_init_no_error():
    ProfilingResults(str(Path(__file__).parent / 'adaptiveperf_results'),
                     '2023_12_21_12_49_57_test-device a.out')


def test_get_json_tree_empty(results_dir_and_identifier, mocker):
    results = ProfilingResults(*results_dir_and_identifier)

    tree = Tree()

    mocker.patch.object(results, '_get_sampled_time', return_value=None)
    mocker.patch.object(results, 'get_thread_tree', return_value=tree)

    json_tree = results.get_json_tree()

    assert json_tree == '{}'


def test_get_json_tree_only_root(results_dir_and_identifier, mocker):
    results = ProfilingResults(*results_dir_and_identifier)

    tree = Tree()
    tree.create_node(
        ('test.out',
         '2394/129',
         [(2, 2412), (2415, 2)],
         1,
         21475), 129)

    mocker.patch.object(results, '_get_sampled_time', return_value=4)
    mocker.patch.object(results, 'get_thread_tree', return_value=tree)

    json_tree = results.get_json_tree()
    expected_tree = json.dumps({
        'id': '2394_129',
        'start_time': 0.000001,
        'runtime': 0.021475,
        'sampled_time': 4,
        'name': 'test.out',
        'pid_tid': '2394/129',
        'off_cpu': [(0.000002, 0.002412), (0.002415, 0.000002)],
        'start_callchain': [],
        'children': []
    })

    assert json_tree == expected_tree


def test_get_json_tree():
    results = ProfilingResults(str(Path(__file__).parent /
                                   'adaptiveperf_results'),
                               '2023_12_21_12_49_57_test-device a.out')

    json_tree = results.get_json_tree()
    expected_tree = json.dumps({
        'id': '23562_23562',
        'start_time': 0.0,
        'runtime': 14488.135576,
        'sampled_time': 14464.884542000002,
        'name': 'a.out',
        'pid_tid': '23562/23562',
        'off_cpu': [(18.489444, 12089.161765),
                    (12107.699221, 365.438977),
                    (12482.214823, 2005.753385)],
        'start_callchain': ['_Fork', 'make_child', 'execute_disk_command', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_in_subshell', 'execute_command_internal', 'execute_command_internal', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_command_internal', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command_internal', 'execute_function', 'execute_command_internal', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command', 'execute_connection', 'execute_command_internal', 'execute_command_internal', 'execute_function', 'execute_command_internal', 'execute_command', 'execute_command_internal', 'execute_connection', 'execute_command_internal', 'execute_command_internal', 'execute_function', 'execute_command_internal', 'execute_command', 'reader_loop', 'main', '__libc_start_call_main', '__libc_start_main@@GLIBC_2.34', '_start'],
        'children': [
            {
                'id': '23562_23563',
                'start_time': 5.403012,
                'runtime': 12102.167996,
                'sampled_time': 12100.0,
                'name': 'a.out',
                'pid_tid': '23562/23563',
                'off_cpu': [],
                'start_callchain': ['clone3', 'create_thread', 'pthread_create@GLIBC_2.2.5', 'create', 'main', '__libc_start_call_main', '__libc_start_main@@GLIBC_2.34', '_start'],
                'children': []
            },
            {
                'id': '23562_23564',
                'start_time': 8.493492,
                'runtime': 12464.564036,
                'sampled_time': 12457.30924,
                'name': 'a.out',
                'pid_tid': '23562/23564',
                'off_cpu': [(15.691478, 12457.309240)],
                'start_callchain': ['clone3', 'create_thread', 'pthread_create@GLIBC_2.2.5', 'create', 'main', '__libc_start_call_main', '__libc_start_main@@GLIBC_2.34', '_start'],
                'children': [
                    {
                        'id': '23562_23566',
                        'start_time': 15.750325,
                        'runtime': 12457.185335,
                        'sampled_time': 12400.0,
                        'name': 'a.out',
                        'pid_tid': '23562/23566',
                        'off_cpu': [],
                        'start_callchain': ['clone3', 'create_thread', 'pthread_create@GLIBC_2.2.5', 'test', 'start_thread', 'clone3'],
                        'children': []
                    }
                ]
            },
            {
                'id': '23562_23565',
                'start_time': 15.159860,
                'runtime': 12462.205691,
                'sampled_time': 12400.0,
                'name': 'a.out',
                'pid_tid': '23562/23565',
                'off_cpu': [],
                'start_callchain': ['clone3', 'create_thread', 'pthread_create@GLIBC_2.2.5', 'create', 'main', '__libc_start_call_main', '__libc_start_main@@GLIBC_2.34', '_start'],
                'children': []
            },
            {
                'id': '23562_23567',
                'start_time': 18.554273,
                'runtime': 12089.656353,
                'sampled_time': 12000.0,
                'name': 'a.out',
                'pid_tid': '23562/23567',
                'off_cpu': [],
                'start_callchain': ['clone3', 'create_thread', 'pthread_create@GLIBC_2.2.5', 'create', 'main', '__libc_start_call_main', '__libc_start_main@@GLIBC_2.34', '_start'],
                'children': []
            },
            {
                'id': '23568_23568',
                'start_time': 12485.907530,
                'runtime': 2001.064202,
                'sampled_time': 2000.121224,
                'name': 'sleep',
                'pid_tid': '23568/23568',
                'off_cpu': [(12486.776576, 2000.121224)],
                'start_callchain': ['clone3', '__spawnix', '__spawni', '(0x0)'],
                'children': []
            }
        ]
    })

    assert json_tree == expected_tree
