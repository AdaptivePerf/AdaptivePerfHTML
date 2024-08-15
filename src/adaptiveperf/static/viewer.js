var flamegraph_obj = undefined;
var result_obj = undefined;
var result_cache = {};
var callchain_obj = undefined;
var perf_maps_obj = undefined;
var perf_maps_cache = {};
var sampled_diff_dict = {};
var flamegraph_block_being_resized = false;
var flamegraph_block_mouse_down = false;
var flamegraph_total = 0;

function getSymbolFromMap(elem) {
    if (elem in perf_maps_cache) {
        return perf_maps_cache[elem];
    }

    var regex = /^\((0x[0-9a-f]+);(.+)\)$/;
    var match = regex.exec(elem);
    var addr = parseInt(match[1], 16);
    var map_name = match[2];

    if (map_name in perf_maps_obj) {
        var data = perf_maps_obj[map_name];
        var start = 0;
        var end = data.length - 1;

        while (start <= end) {
            var middle = Math.floor((start + end) / 2);
            var addr1 = parseInt(data[middle][0], 16);
            var addr2 = parseInt(data[middle][1], 16);

            if (addr >= addr1 && addr <= addr2) {
                perf_maps_cache[elem] = data[middle][2];
                return data[middle][2];
            } else if (addr < addr1) {
                end = middle - 1;
            } else {
                start = middle + 1;
            }
        }
    }

    return elem;
}

$(document).on('change', '#results_combobox', function() {
    $('#please_wait_background').show();
    $('#results_combobox option:selected').each(function() {
        var value = $(this).val();
        var ajaxPostOptions = {
            url: value + '/',
            method: 'POST',
            data: {tree: true}
        };

        function parseResult(result) {
            function from_json_to_item(json, level,
                                       item_list, group_list,
                                       item_dict, metrics_dict,
                                       callchain_dict, tooltip_dict,
                                       warning_dict, overall_end_time) {
                var item = {
                    id: json.id,
                    group: json.id,
                    type: 'background',
                    content: '',
                    start: json.start_time,
                    end: json.start_time + json.runtime,
                    style: 'background-color:#aa0000; z-index:-1'
                };

                overall_end_time[0] = Math.max(overall_end_time[0],
                                               json.start_time + json.runtime);

                var sampled_diff = (1.0 * Math.abs(
                    json.runtime - json.sampled_time)) / json.runtime;
                sampled_diff_dict[item.id] = sampled_diff;
                var warning =
                    sampled_diff > 1.0 * parseFloat(
                        $('#runtime_diff_threshold_input').val()) / 100;

                var group = {
                    id: json.id,
                    content: json.name + ' (' + json.pid_tid + ')',
                    style: 'padding-left: ' + (level * 25) + 'px;',
                    showNested: false
                };

                var nestedGroups = [];

                for (var i = 0; i < json.children.length; i++) {
                    nestedGroups.push(json.children[i].id);
                }

                if (nestedGroups.length > 0) {
                    group.nestedGroups = nestedGroups;
                }

                item_list.push(item);
                group_list.push(group);

                var numf = new Intl.NumberFormat('en-US');

                item_dict[item.id] = json.name + ' (' + json.pid_tid +
                    '): ' + numf.format(json.runtime) +
                    ' ms <span id="sampled_runtime">(sampled: ~' +
                    numf.format(json.sampled_time) + ' ms)</span>';
                tooltip_dict[item.id] = 'Runtime: ' +
                    numf.format(json.runtime) +
                    ' ms <span id="tooltip_sampled_runtime">(sampled: ~' +
                    numf.format(json.sampled_time) + ' ms)</span>';
                metrics_dict[item.id] = json.metrics;
                warning_dict[item.id] = [warning, sampled_diff];

                if (level > 0) {
                    callchain_dict[item.id] = json.start_callchain;
                }

                for (var i = 0; i < json.off_cpu.length; i++) {
                    var start = json.off_cpu[i][0];
                    var end = start + json.off_cpu[i][1];
                    var offcpu_sampling =
                        $('#viewer_script').attr('data-offcpu-sampling');
                    
                    if (start % offcpu_sampling === 0 ||
                        end % offcpu_sampling === 0 ||
                        Math.floor(start / offcpu_sampling) != Math.floor(
                            end / offcpu_sampling)) {
                        var off_cpu_item = {
                            id: json.id + '_offcpu' + i,
                            group: json.id,
                            type: 'background',
                            content: '',
                            start: json.off_cpu[i][0],
                            end: json.off_cpu[i][0] + json.off_cpu[i][1],
                            style: 'background-color:#0294e3'
                        };

                        item_list.push(off_cpu_item);
                    }
                }

                for (var i = 0; i < json.children.length; i++) {
                    from_json_to_item(json.children[i],
                                      level + 1,
                                      item_list,
                                      group_list,
                                      item_dict,
                                      metrics_dict,
                                      callchain_dict,
                                      tooltip_dict,
                                      warning_dict,
                                      overall_end_time);
                }
            }

            function part2() {
                $.ajax({
                    url: $('#block').attr('result_id') + '/',
                    method: 'POST',
                    dataType: 'json',
                    data: {perf_map: true}
                }).done(ajax_obj => {
                    perf_maps_obj = ajax_obj;
                    part3();
                }).fail(ajax_obj => {
                    alert('Could not obtain the perf symbol maps! You ' +
                          'will not get meaningful names when checking ' +
                          'stack traces e.g. for JIT-ed codes.');
                    part3();
                });
            }

            function part3() {
                var item_list = [];
                var group_list = [];
                var item_dict = {};
                var callchain_dict = {};
                var metrics_dict = {};
                var tooltip_dict = {};
                var warning_dict = {};
                var overall_end_time = [0];

                from_json_to_item(JSON.parse(result), 0,
                                  item_list, group_list, item_dict,
                                  metrics_dict,
                                  callchain_dict, tooltip_dict,
                                  warning_dict, overall_end_time);

                var container = $('#block')[0];
                container.innerHTML = '';

                var timeline = new vis.Timeline(
                    container,
                    item_list,
                    group_list,
                    {
                        format: {
                            minorLabels: {
                                millisecond:'x [ms]',
                                second:     'X [s]',
                                minute:     'X [s]',
                                hour:       'X [s]',
                                weekday:    'X [s]',
                                day:        'X [s]',
                                week:       'X [s]',
                                month:      'X [s]',
                                year:       'X [s]'
                            }
                        },
                        showMajorLabels: false,
                        min: 0,
                        max: 2 * overall_end_time[0]
                    }
                );

                timeline.on('doubleClick', function (props) {
                    if (props.group != null) {
                        $('#please_wait_background').show();
                        $('#result_title').html(item_dict[props.group]);

                        if (sampled_diff_dict[props.group] >
                            1.0 * parseFloat($('#runtime_diff_threshold_input').val()) / 100) {
                            $('#sampled_time_warning').show();
                            $('#sampled_runtime').css('color', 'red');
                            $('#sampled_diff').html(
                                (sampled_diff_dict[props.group] * 100).toFixed(2));
                            $('#runtime_diff_threshold').html(
                                parseFloat($('#runtime_diff_threshold_input').val()));
                        } else {
                            $('#sampled_runtime').css('color', 'black');
                            $('#sampled_time_warning').hide();
                        }

                        $('#metric').empty();
                        $('#metric').append(new Option('Wall time (ns)',
                                                       'walltime'));

                        var dict = metrics_dict[props.group];
                        for (var metric_value in dict) {
                            $('#metric').append(new Option(dict[metric_value],
                                                           metric_value));
                        }

                        $('#metric').val('walltime');
                        $('#time_ordered').prop('checked', false);
                        $('#flamegraph').attr('data-id', props.group);

                        if (props.group + '_' +
                            parseFloat($('#threshold_input').val()) in result_cache) {
                            result_obj = result_cache[
                                props.group + '_' + parseFloat($(
                                    '#threshold_input').val())];

                            if (!('walltime' in result_obj)) {
                                flamegraph_obj = undefined;
                                $('#svg').hide();
                                $('#search').val('');
                                $('#no_flamegraph').show();
                                $('#result_background').show();
                            } else {
                                openFlameGraph('walltime');
                            }

                            $('#please_wait_background').hide();
                        } else {
                            var pid_tid = props.group.split('_');

                            $.ajax({
                                url: $('#block').attr('result_id') + '/',
                                method: 'POST',
                                dataType: 'json',
                                data: {pid: pid_tid[0], tid: pid_tid[1],
                                       threshold: 1.0 * parseFloat($(
                                           '#threshold_input').val()) / 100}
                            }).done(ajax_obj => {
                                result_cache[
                                    props.group + '_' + parseFloat($(
                                        '#threshold_input').val())] = ajax_obj;
                                result_obj = ajax_obj;

                                if (!('walltime' in result_obj)) {
                                    flamegraph_obj = undefined;
                                    $('#svg').hide();
                                    $('#search').val('');
                                    $('#no_flamegraph').show();
                                    $('#result_background').show();
                                } else {
                                    openFlameGraph('walltime');
                                }

                                $('#please_wait_background').hide();
                            }).fail(ajax_obj => {
                                flamegraph_obj = undefined;
                                $('#svg').hide();
                                $('#search').val('');
                                $('#no_flamegraph').show();
                                $('#result_background').show();
                                $('#please_wait_background').hide();
                            });
                        }
                    }
                });

                timeline.on('contextmenu', function (props) {
                    if (props.group != null && props.group in callchain_dict) {
                        $('#callchain').text(callchain_dict[props.group].map(elem => {
                            if (callchain_obj !== undefined &&
                                elem in callchain_obj['syscall']) {
                                return callchain_obj['syscall'][elem];
                            } else if (/^\(0x[0-9a-f]+;.+\)$/.test(elem)) {
                                return getSymbolFromMap(elem);
                            } else if (/^\[.+\]$/.test(elem) ||
                                       /^\(0x[0-9a-f]+\)$/.test(elem)) {
                                return elem;
                            } else {
                                return elem +
                                    ' (not-yet-loaded or missing ' +
                                    'callchain dictionary)';
                            }
                        }).join('\n'));
                        $('#callchain').html(
                            $('#callchain').html().replace(/\n/g, '<br />'));
                        $('#callchain_block_title').html(
                            tooltip_dict[props.group]);
                        $('#callchain_block').css('top', props.pageY);
                        $('#callchain_block').css('left', props.pageX);
                        $('#callchain_block').outerHeight('auto');
                        $('#callchain_block').css('display', 'flex');

                        if (sampled_diff_dict[props.group] >
                            1.0 * parseFloat($('#runtime_diff_threshold_input').val()) / 100) {
                            $('#tooltip_sampled_runtime').css('color', 'red');
                        } else {
                            $('#tooltip_sampled_runtime').css('color', 'black');
                        }

                        var height = $('#callchain_block').outerHeight();
                        var width = $('#callchain_block').outerWidth();

                        if (props.pageY + height > $(window).outerHeight() - 30) {
                            $('#callchain_block').outerHeight(
                                $(window).outerHeight() - props.pageY - 30);
                        }

                        if (props.pageX + width > $(window).outerWidth() - 20) {
                            $('#callchain_block').css(
                                'left', props.pageX - width);
                        }

                        props.event.preventDefault();
                    }
                });

                $('#settings').show();
                $('#please_wait_background').hide();
            }

            $('#block').attr('result_id', value);

            $.ajax({
                url: $('#block').attr('result_id') + '/',
                method: 'POST',
                dataType: 'json',
                data: {callchain: true}
            }).done(ajax_obj => {
                callchain_obj = ajax_obj;
                part2();
            }).fail(ajax_obj => {
                alert('Could not obtain the callchain mappings! You ' +
                      'will not get meaningful names when checking ' +
                      'any stack traces.');
                part3();
            });
        }

        $.ajax(ajaxPostOptions)
            .done(parseResult)
            .fail(function(ajax_obj) {
                if (ajax_obj.status === 500) {
                    alert('Could not load the session because of an ' +
                          'error on the server side!');
                } else {
                    alert('Could not load the session! (HTTP code ' +
                          ajax_obj.status + ')');
                }
                $('#please_wait_background').hide();
            });
    });
});

function updateFlameGraph(data, always_change_height) {
    if (flamegraph_obj !== undefined) {
        var update_height = function() {
            var flamegraph_svg = $('#svg').children()[0];

            if (flamegraph_svg !== undefined) {
                var target_height = flamegraph_svg.getBBox().height;

                if (always_change_height || target_height > $('#svg').height()) {
                    $('#svg').height(target_height);
                    flamegraph_svg.setAttribute('height', target_height);
                }
            }
        };

        if (data !== null) {
            flamegraph_total = data['value'];
            flamegraph_obj.update(data, update_height);
        } else {
            update_height();
        }
    }
}

function openFlameGraph(metric) {
    flamegraph_obj = flamegraph();
    flamegraph_obj.inverted(true);
    flamegraph_obj.sort($('#time_ordered').prop('checked') ? false : true);
    flamegraph_obj.color(function(node, original_color) {
        if (node.highlight) {
            return original_color;
        } else if (node.data.cold) {
            return '#039dfc';
        } else if (node.data.name === "(compressed)") {
            return '#cc99ff';
        } else {
            return original_color;
        }
    });
    flamegraph_obj.getName(function(node) {
        if (node.data.name in callchain_obj[$('#metric').val()]) {
            return callchain_obj[$('#metric').val()][node.data.name];
        } else if (/^\(0x[0-9a-f]+;.+\)$/.test(node.data.name)) {
            return getSymbolFromMap(node.data.name);
        } else {
            return node.data.name;
        }
    });
    flamegraph_obj.onClick(function(node) {
        if ("hidden_children" in node.data) {
            var parent = node.parent.data;
            var new_children = [];

            for (var i = 0; i < parent.children.length; i++) {
                if ("compressed_id" in parent.children[i] &&
                    parent.children[i].compressed_id === node.data.compressed_id) {
                    for (var j = 0; j < node.data.hidden_children.length; j++) {
                        new_children.push(node.data.hidden_children[j]);
                    }
                } else {
                    new_children.push(parent.children[i]);
                }
            }

            parent.children = new_children;
            updateFlameGraph(d3.select('#svg').datum().data, false);
        }
    });
    flamegraph_obj.setSearchHandler(function(results, sum, total) {
        $('#search_blocks').html(results.length.toLocaleString());
        $('#search_found').html(sum.toLocaleString());
        $('#search_total').html(flamegraph_total.toLocaleString());
        $('#search_percentage').html((1.0 * sum / flamegraph_total * 100).toFixed(2));
    });

    if (metric === 'walltime') {
        flamegraph_obj.setColorHue('warm');
    } else {
        flamegraph_obj.setColorHue('green');
    }

    $('#no_flamegraph').hide();
    $('#svg').html('');
    $('#search').val('');
    $('#search_results').hide();
    $('#flamegraph_window').show();
    $('#svg').show();
    $('#result_background').show();
    flamegraph_obj.width($('#result_block').width());
    d3.select('#svg').datum(structuredClone(
        result_obj[metric][
            $('#time_ordered').prop('checked') ? 1 : 0])).call(
                flamegraph_obj);
    flamegraph_total = d3.select('#svg').datum().data['value'];
    updateFlameGraph(null, true);
    flamegraph_obj.width($('#svg').width());
    flamegraph_obj.update();

    var pos = $('#flamegraph_window').position();
    $('#flamegraph_window').css('max-height', ($('#result_area').height() - pos.top) + 'px');
    $('#flamegraph_window').css('max-width', ($('#result_area').width() - pos.left) + 'px');

    $('.window').hide();
    $('.analysis_type').prop('checked', false);
    $('#flamegraph')[0].scrollTop = 0;
}

function onAnalysisCheckBoxClick(event) {
    var checkbox = event.target;
    var id = checkbox.value + '_window';

    if (checkbox.checked) {
        $('#' + id).show();
    } else {
        $('#' + id).hide();
    }
}

function onBackgroundClick() {
    $('#callchain_block').hide();
}

function onBlockClick(event) {
    event.stopPropagation();
    event.preventDefault();
}

function onResultCloseClick() {
    $('#svg').html('');
    $('#result_background').hide();
}

function onWindowCloseClick(event) {
    var target = event.target;

    while (!target.classList.contains('window')) {
        target = target.parentElement;
    }

    $(target).hide();
    $('#' + target.id.replace('_window', '_checkbox')).prop('checked', false);
}

function onMetricChange(event) {
    if ($('#result_background').is(':visible') ||
        flamegraph_obj !== undefined) {
        var metric = event.currentTarget.value;

        flamegraph_obj = undefined;
        $('#time_ordered').prop('checked', false);

        if (metric in result_obj) {
            openFlameGraph(metric);
        } else {
            $('#search').val('');
            $('#search_results').hide();
            $('#svg').hide();
            $('#no_flamegraph').show();
        }
    }
}

function onTimeOrderedChange(event) {
    if (flamegraph_obj !== undefined) {
        flamegraph_obj.sort(!event.currentTarget.checked);
        updateFlameGraph(structuredClone(
            result_obj[$('#metric').val()][
                event.currentTarget.checked ? 1 : 0]), true);

        $('#search').val('');
        $('#search_results').hide();
    }
}

function onSearchQueryChange(value) {
    if (flamegraph_obj !== undefined) {
        if (value === undefined || value === "") {
            $('#search_results').hide();
        } else {
            $('#search_results').show();
        }

        flamegraph_obj.search(value);
    }
}

function onFlameGraphBlockMouseDown() {
    flamegraph_block_mouse_down = true;
}

function onFlameGraphBlockMouseUp() {
    flamegraph_block_mouse_down = false;

    if (flamegraph_block_being_resized) {
        flamegraph_obj.width($('#svg').width());
        flamegraph_obj.update();
        flamegraph_block_being_resized = false;
    }
}

function onFlameGraphBlockResize() {
    if (flamegraph_obj !== undefined && flamegraph_block_mouse_down) {
        flamegraph_block_being_resized = true;
    }
}

// downloadFlameGraph() is based on https://stackoverflow.com/a/28226736
// (originally CC BY-SA 4.0, covered by GNU GPL v3 here)
function downloadFlameGraph() {
    var filename = window.prompt(
        'What filename do you want? ' +
            '(".png" will be added automatically)');

    if (filename === null || filename === "") {
        return;
    }

    $('#please_wait_background').show();

    var svg = $('#svg').children()[0].cloneNode(true);
    var style = document.createElement('style');

    style.innerHTML = $('#viewer_script').attr('data-d3-flamegraph-css');

    svg.insertBefore(style, svg.firstChild);

    var url = URL.createObjectURL(new Blob(
        [(new XMLSerializer()).serializeToString(svg)],
        { type: 'image/svg+xml;charset=utf-8' }));

    var image = new Image();
    image.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext('2d').drawImage(image, 0, 0);

        URL.revokeObjectURL(url);

        var a = document.createElement('a');
        a.download = filename;
        a.target = '_blank';
        a.href = canvas.toDataURL('image/png');
        a.addEventListener('click', function(event) {
            event.stopPropagation();
        });
        a.click();

        $('#please_wait_background').hide();
    };
    image.onerror = function() {
        window.alert("Could not download the flame graph because " +
                     "of an error!");
        $('#please_wait_background').hide();
    };
    image.width = svg.width.baseVal.value;
    image.height = svg.height.baseVal.value;
    image.src = url;
}

function checkValidPercentage(event) {
    var input = event.target;

    if (input.value === '' || input.value === undefined) {
        input.value = '0';
    } else {
        var number = parseFloat(input.value);

        if (isNaN(number)) {
            input.value = '0';
        } else if (input.min !== undefined && input.min !== '' &&
                   number < input.min) {
            input.value = input.min;
        } else if (input.max !== undefined && input.max !== '' &&
                   number > input.max) {
            input.value = input.max;
        } else if (event.key === 'Enter') {
            input.value = number;
        }
    }
}

function insertValidPercentage(input) {
    var number = parseFloat(input.value);

    if (isNaN(number)) {
        input.value = '0';
    } else {
        input.value = number;
    }
}

function startDrag(event) {
    event.stopPropagation();
    event.preventDefault();

    var dragged = event.target.parentElement;
    var startX = event.offsetX;
    var startY = event.offsetY;
    var rect = $('#result_area').offset();

    $('body').mousemove(function(event) {
        event.stopPropagation();
        event.preventDefault();
        var newX = event.pageX - rect.left - startX;
        var newY = event.pageY - rect.top - startY;
        var dragged_rect = dragged.getBoundingClientRect();

        if (newX >= 0 && newX + dragged_rect.width <= $('#result_area').width()) {
            dragged.style.left = newX + 'px';
        }

        if (newY >= 0 && newY + dragged_rect.height <= $('#result_area').height()) {
            dragged.style.top = newY + 'px';
        }
    });

    $('body').mouseup(function(event) {
        $('body').off('mousemove');
        $('body').off('mouseup');

        var new_max_height = $('#result_area').height() - dragged.offsetTop;
        var new_max_width = $('#result_area').width() - dragged.offsetLeft;

        if (parseFloat(dragged.style.width) > parseFloat(dragged.style.maxWidth)) {
            dragged.style.width = dragged.style.maxWidth;
        }

        if (parseFloat(dragged.style.height) > parseFloat(dragged.style.maxHeight)) {
            dragged.style.height = dragged.style.maxHeight;
        }

        dragged.style.maxHeight = new_max_height + 'px';
        dragged.style.maxWidth = new_max_width + 'px';
    });
}

$(document).ready(function() {
    new ResizeObserver(onFlameGraphBlockResize).observe($('#flamegraph_window')[0]);
});
