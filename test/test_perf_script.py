import subprocess
import pickle
import adaptiveperf
from pathlib import Path
from treelib import Tree


def test_correct_tree_produced():
    expected_tree = Tree()
    expected_tree.create_node(
        ('a.out',
         '23562/23562',
         [
             (18489444, 12089161765),
             (12107699221, 365438977),
             (12482214823, 2005753385)
         ],
         0,
         14488135576), 23562)
    expected_tree.create_node(
        ('a.out',
         '23562/23563',
         [],
         5403012,
         12102167996), 23563,
        parent=23562)
    expected_tree.create_node(
        ('a.out',
         '23562/23564',
         [
             (15691478, 12457309240)
         ],
         8493492,
         12464564036), 23564,
        parent=23562)
    expected_tree.create_node(
        ('a.out',
         '23562/23565',
         [],
         15159860,
         12462205691), 23565,
        parent=23562)
    expected_tree.create_node(
        ('a.out',
         '23562/23566',
         [],
         15750325,
         12457185335), 23566,
        parent=23564)
    expected_tree.create_node(
        ('a.out',
         '23562/23567',
         [],
         18554273,
         12089656353), 23567,
        parent=23562)
    expected_tree.create_node(
        ('sleep',
         '23568/23568',
         [
             (12486776576, 2000121224)
         ],
         12485907530,
         2001064202), 23568,
        parent=23562)

    r = subprocess.run(['perf', 'script', '-f', '-i',
                        'syscalls.data', '-s',
                        Path(adaptiveperf.__file__).resolve().parent /
                        'perf_script.py'],
                       cwd=Path(__file__).resolve().parent /
                       'adaptiveperf_results' /
                       '2023_12_21_12_49_57_test-device a.out',
                       stdout=subprocess.PIPE)

    r.check_returncode()

    tree = pickle.loads(r.stdout)

    nodes = tree.all_nodes()
    expected_nodes = expected_tree.all_nodes()

    # Check tags and identifiers
    assert list(map(lambda x: (x.tag, x.identifier), nodes)) == \
        list(map(lambda x: (x.tag, x.identifier), expected_nodes))

    # Check tree structures themselves
    for n in tree.all_nodes_itr():
        n.tag = n.identifier

    for n in expected_tree.all_nodes_itr():
        n.tag = n.identifier

    assert tree.to_dict() == expected_tree.to_dict()
