# AdaptivePerfHTML: tool for analysing AdaptivePerf results
# Copyright (C) 2023 CERN.
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 2 of the License, or
# (at your option) any later version.
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
from adaptiveperf import Identifier


def test_incorrect_id_str1():
    with pytest.raises(ValueError):
        Identifier('blablabla')


def test_incorrect_id_str2():
    with pytest.raises(ValueError):
        Identifier('2023_10_11_15_18_33_blabla_blabla_test')


def test_incorrect_id_str3():
    with pytest.raises(ValueError):
        Identifier('2023_10_11_15_18_blabla_blabla_test')


def test_id_str_no_seconds():
    identifier = Identifier('2023_10_11_15_18_blabla_blabla test')

    assert str(identifier) == '[blabla_blabla] test (2023-10-11 15:18)'
    assert identifier.year == 2023
    assert identifier.month == 10
    assert identifier.day == 11
    assert identifier.hour == 15
    assert identifier.minute == 18
    assert identifier.second is None
    assert identifier.executor == 'blabla_blabla'
    assert identifier.name == 'test'
    assert identifier.value == '2023_10_11_15_18_blabla_blabla test'


def test_id_str_with_seconds():
    identifier = Identifier('2023_10_11_15_18_33_blabla_blabla test')

    assert str(identifier) == '[blabla_blabla] test (2023-10-11 15:18:33)'
    assert identifier.year == 2023
    assert identifier.month == 10
    assert identifier.day == 11
    assert identifier.hour == 15
    assert identifier.minute == 18
    assert identifier.second == 33
    assert identifier.executor == 'blabla_blabla'
    assert identifier.name == 'test'
    assert identifier.value == '2023_10_11_15_18_33_blabla_blabla test'
