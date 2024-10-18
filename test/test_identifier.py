# AdaptivePerfHTML: Tool for producing HTML summary of profiling results
# Copyright (C) CERN. See LICENSE for details.

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


def test_id_str_no_seconds_no_label():
    identifier = Identifier('2023_10_11_15_18_blabla_blabla__test')

    assert str(identifier) == 'None: [blabla_blabla] test (2023-10-11 15:18)'
    assert identifier.year == 2023
    assert identifier.month == 10
    assert identifier.day == 11
    assert identifier.hour == 15
    assert identifier.minute == 18
    assert identifier.second is None
    assert identifier.executor == 'blabla_blabla'
    assert identifier.name == 'test'
    assert identifier.value == '2023_10_11_15_18_blabla_blabla__test'


def test_id_str_no_seconds_with_label():
    identifier = Identifier('2023_10_11_15_18_blabla_blabla__test')
    identifier.set_label_if_none('test_label')

    assert str(identifier) == 'test_label: [blabla_blabla] test (2023-10-11 15:18)'
    assert identifier.year == 2023
    assert identifier.month == 10
    assert identifier.day == 11
    assert identifier.hour == 15
    assert identifier.minute == 18
    assert identifier.second is None
    assert identifier.executor == 'blabla_blabla'
    assert identifier.name == 'test'
    assert identifier.value == '2023_10_11_15_18_blabla_blabla__test'


def test_id_str_with_seconds_no_label():
    identifier = Identifier('2023_10_11_15_18_33_blabla_blabla__test')

    assert str(identifier) == 'None: [blabla_blabla] test (2023-10-11 15:18:33)'
    assert identifier.year == 2023
    assert identifier.month == 10
    assert identifier.day == 11
    assert identifier.hour == 15
    assert identifier.minute == 18
    assert identifier.second == 33
    assert identifier.executor == 'blabla_blabla'
    assert identifier.name == 'test'
    assert identifier.value == '2023_10_11_15_18_33_blabla_blabla__test'


def test_id_str_with_seconds_with_label():
    identifier = Identifier('2023_10_11_15_18_33_blabla_blabla__test')
    identifier.set_label_if_none('test_label')

    assert str(identifier) == 'test_label: [blabla_blabla] test (2023-10-11 15:18:33)'
    assert identifier.year == 2023
    assert identifier.month == 10
    assert identifier.day == 11
    assert identifier.hour == 15
    assert identifier.minute == 18
    assert identifier.second == 33
    assert identifier.executor == 'blabla_blabla'
    assert identifier.name == 'test'
    assert identifier.value == '2023_10_11_15_18_33_blabla_blabla__test'
