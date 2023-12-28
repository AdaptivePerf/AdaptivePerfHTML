# perf script event handlers, generated by perf script -g python
# Licensed under the terms of the GNU GPL License version 2

# The common_* event handler fields are the most useful fields common to
# all events.  They don't necessarily correspond to the 'common_*' fields
# in the format files.  Those fields not available as handler params can
# be retrieved using Python functions of the form common_*(context).
# See the perf-script-python Documentation for the list of available functions.

from __future__ import print_function

import os
import sys
import re
import json
from pathlib import Path
from collections import defaultdict

sys.path.append(os.environ['PERF_EXEC_PATH'] +
                '/scripts/python/Perf-Trace-Util/lib/Perf/Trace')

combo_dict = {}
process_group_dict = defaultdict(list)
time_dict = {}
exit_time_dict = {}
name_dict = {}

tree = {}
added_list = []

profiled_filename = re.search(r'^\S+\s+(.+)$', Path().resolve().name).group(1)
profile_start = False


def common_callback(comm_name, pid, tid, time, ret_value):
    global tree, profile_start

    if comm_name == profiled_filename:
        profile_start = True
    elif not profile_start:
        return

    if ret_value == 0:
        combo_dict[tid] = f'{pid}/{tid}'
        process_group_dict[pid].append(tid)
        time_dict[tid] = time
        name_dict[tid] = comm_name
    else:
        if tid not in tree:
            tree[tid] = None
            added_list.append(tid)

            combo_dict[tid] = f'{pid}/{tid}'
            process_group_dict[pid].append(tid)
            name_dict[tid] = comm_name

        if ret_value not in tree:
            tree[ret_value] = tid
            added_list.append(ret_value)


def execve_callback(comm_name, pid, tid, time, ret_value):
    global profile_start

    if comm_name == profiled_filename:
        profile_start = True
    elif not profile_start:
        return

    time_dict[tid] = time
    name_dict[tid] = comm_name


def exit_callback(comm_name, pid, tid, time, exit_group):
    if exit_group:
        for t in process_group_dict[pid]:
            if t not in exit_time_dict:
                exit_time_dict[t] = time
    else:
        exit_time_dict[tid] = time


def trace_end():
    if len(time_dict) == 0:
        print(json.dumps([]))
        return

    start_time = min(time_dict.values())
    off_cpu_dict = defaultdict(list)
    off_cpu_path = Path('offcpu.data')

    if off_cpu_path.exists():
        with off_cpu_path.open(mode='r') as f:
            for line in f:
                if len(line.strip()) == 0:
                    continue

                pid, tid, time, length = line.strip().split(' ')

                if time == '18446744069.414584320':
                    continue

                pid = int(pid)
                tid = int(tid)
                time = int(float(time) * 1000000000)
                length = int(length)

                off_cpu_dict[tid].append((time - start_time, length))

    result = []

    for i in added_list:
        p = tree[i]
        result.append({
            'identifier': i,
            'tag': [name_dict[i], combo_dict[i], off_cpu_dict[i],
                    time_dict[i] - start_time,
                    exit_time_dict[i] -
                    time_dict[i] if i in exit_time_dict else -1],
            'parent': p
        })

    print(json.dumps(result))


def syscalls__sys_exit_clone3(event_name, context, common_cpu, common_secs,
                              common_nsecs, common_pid, common_comm,
                              common_callchain, __syscall_nr, ret,
                              perf_sample_dict):
    common_callback(common_comm, perf_sample_dict['sample']['pid'],
                    perf_sample_dict['sample']['tid'],
                    perf_sample_dict['sample']['time'], ret)


def syscalls__sys_exit_clone(event_name, context, common_cpu, common_secs,
                             common_nsecs, common_pid, common_comm,
                             common_callchain, __syscall_nr, ret,
                             perf_sample_dict):
    common_callback(common_comm, perf_sample_dict['sample']['pid'],
                    perf_sample_dict['sample']['tid'],
                    perf_sample_dict['sample']['time'], ret)


def syscalls__sys_exit_vfork(event_name, context, common_cpu, common_secs,
                             common_nsecs, common_pid, common_comm,
                             common_callchain, __syscall_nr, ret,
                             perf_sample_dict):
    common_callback(common_comm, perf_sample_dict['sample']['pid'],
                    perf_sample_dict['sample']['tid'],
                    perf_sample_dict['sample']['time'], ret)


def syscalls__sys_exit_fork(event_name, context, common_cpu, common_secs,
                            common_nsecs, common_pid, common_comm,
                            common_callchain, __syscall_nr, ret,
                            perf_sample_dict):
    common_callback(common_comm, perf_sample_dict['sample']['pid'],
                    perf_sample_dict['sample']['tid'],
                    perf_sample_dict['sample']['time'], ret)


def syscalls__sys_exit_execve(event_name, context, common_cpu, common_secs,
                              common_nsecs, common_pid, common_comm,
                              common_callchain, __syscall_nr, ret,
                              perf_sample_dict):
    execve_callback(common_comm, perf_sample_dict['sample']['pid'],
                    perf_sample_dict['sample']['tid'],
                    perf_sample_dict['sample']['time'], ret)


def syscalls__sys_enter_exit(event_name, context, common_cpu, common_secs,
                             common_nsecs, common_pid, common_comm,
                             common_callchain, __syscall_nr, error_code,
                             perf_sample_dict):
    exit_callback(common_comm, perf_sample_dict['sample']['pid'],
                  perf_sample_dict['sample']['tid'],
                  perf_sample_dict['sample']['time'], False)


def syscalls__sys_enter_exit_group(event_name, context, common_cpu,
                                   common_secs, common_nsecs, common_pid,
                                   common_comm, common_callchain, __syscall_nr,
                                   error_code, perf_sample_dict):
    exit_callback(common_comm, perf_sample_dict['sample']['pid'],
                  perf_sample_dict['sample']['tid'],
                  perf_sample_dict['sample']['time'], True)
