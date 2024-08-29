// Window directory structure:
// {
//     '<div ID>': {
//         'type': '<analysis type, e.g. flame_graphs>',
//         'data': {
//             <data relevant to analysis type>
//         }
//     }
// }
var window_dict = {};

const flame_graph_window = `
<div class="window flamegraph_window">
  <div class="window_header">
    <span class="window_title">Flame graphs</span>
    <span class="window_close" onmousedown="onWindowCloseMouseDown(event)">
      <!-- This SVG is from Google Material Icons, originally licensed under
           Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0.txt
           (covered by GNU GPL v3 here) -->
      <svg xmlns="http://www.w3.org/2000/svg" height="24px"
           viewBox="0 -960 960 960"
           width="24px" fill="#ffffff">
        <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
      </svg>
    </span>
  </div>
  <div class="flamegraph_box window_content">
    <span class="collapse_info">
      Some blocks may be collapsed to speed up rendering, but you can expand
      them by clicking them.
    </span>
    <div class="flamegraph_choice">
      <div class="flamegraph_metric_choice">
        Metric:
        <select name="metric" class="flamegraph_metric" onchange="onMetricChange(event)">

        </select>
        <input type="checkbox" class="flamegraph_time_ordered" />
        <label class="flamegraph_time_ordered_label">Time-ordered</label>
      </div>
      <div class="flamegraph_remainder">
        <input type="text" class="flamegraph_search"
               placeholder="Search..." />
        <!-- This SVG is from Google Material Icons, originally licensed under
             Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0.txt
             (covered by GNU GPL v3 here) -->
        <svg class="pointer" xmlns="http://www.w3.org/2000/svg" height="24px"
             viewBox="0 -960 960 960" width="24px" fill="#000000"
             onclick="downloadFlameGraph()">
          <title>Download the current flame graph view as PNG</title>
          <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z" />
        </svg>
      </div>
    </div>
    <div class="flamegraph_search_results">
      <b>Search results:</b> <span class="flamegraph_search_blocks"></span> block(s) accounting for
      <span class="flamegraph_search_found"></span> unit(s) out of
      <span class="flamegraph_search_total"></span> (<span class="flamegraph_search_percentage"></span>%)
    </div>
    <div class="flamegraph scrollable">
      <p class="no_flamegraph">
        There is no flame graph associated with the selected process/thread,
        metric, and time order (or the flame graph could not be loaded)!
        This may be caused by the inability of capturing a specific event
        for that process/thread (it is a disadvantage of sampling-based
        profiling).
      </p>
      <div class="flamegraph_svg"></div>
    </div>
  </div>
</div>
`;

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
var item_list = [];
var group_list = [];
var item_dict = {};
var callchain_dict = {};
var metrics_dict = {};
var tooltip_dict = {};
var warning_dict = {};
var general_metrics_dict = {};

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
    $('#settings').hide();
    $('#block').hide();
    $('#loading').show();
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
                                       warning_dict, overall_end_time,
                                       general_metrics_dict) {
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

                json.runtime = json.runtime.toFixed(3);
                json.sampled_time = json.sampled_time.toFixed(3);

                var default_runtime;
                var default_sampled_time;
                var default_unit;

                if (json.runtime >= 1000 || json.sampled_time >= 1000) {
                    default_runtime = (json.runtime / 1000).toFixed(3);
                    default_sampled_time = (json.sampled_time / 1000).toFixed(3);
                    default_unit = 's';
                } else {
                    default_runtime = json.runtime;
                    default_sampled_time = json.sampled_time;
                    default_unit = 'ms';
                }

                item_dict[item.id] =
                    [json.name + ' (' + json.pid_tid +
                     '): ' + numf.format(default_runtime) +
                     ' ' + default_unit + ' (sampled: ~' +
                     numf.format(default_sampled_time) + ' ' + default_unit + ')',
                     json.name + ' (' + json.pid_tid +
                     '): ' + numf.format(json.runtime) +
                     ' ms (sampled: ~' +
                     numf.format(json.sampled_time) + ' ms)'];
                tooltip_dict[item.id] =
                    ['Runtime: ' +
                     numf.format(default_runtime) +
                     ' ' + default_unit + '<br /><span id="tooltip_sampled_runtime">' +
                     '(sampled: ~' +
                     numf.format(default_sampled_time) + ' ' + default_unit +
                     ')</span>',
                     'Runtime: ' +
                     numf.format(json.runtime) +
                     ' ms<br /><span id="tooltip_sampled_runtime">(sampled: ~' +
                     numf.format(json.sampled_time) + ' ms)</span>'];
                metrics_dict[item.id] = json.metrics;
                warning_dict[item.id] = [warning, sampled_diff];

                if ('general_metrics' in json && $.isEmptyObject(general_metrics_dict)) {
                    Object.assign(general_metrics_dict, json.general_metrics);
                }

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
                                      overall_end_time,
                                      general_metrics_dict);
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
                item_list = [];
                group_list = [];
                item_dict = {};
                callchain_dict = {};
                metrics_dict = {};
                tooltip_dict = {};
                warning_dict = {};
                general_metrics_dict = {};
                var overall_end_time = [0];

                from_json_to_item(JSON.parse(result), 0,
                                  item_list, group_list, item_dict,
                                  metrics_dict,
                                  callchain_dict, tooltip_dict,
                                  warning_dict, overall_end_time,
                                  general_metrics_dict);

                var container = $('#block')[0];
                container.innerHTML = '';

                $('#settings').show();
                $('#block').show();
                $('#loading').hide();

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

                timeline.on('contextmenu', function (props) {
                    if (props.group != null) {
                        if (props.group in callchain_dict) {
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
                            $('#callchain_item').show();
                        } else {
                            $('#callchain_item').hide();
                        }

                        var runtime_select = 0;

                        if ($('#always_ms').prop('checked')) {
                            runtime_select = 1;
                        }

                        $('#runtime').html(
                            tooltip_dict[props.group][runtime_select]);

                        $('#menu_items').empty();

                        var flame_graphs_present = false;

                        console.log(metrics_dict[props.group]);

                        for (const [k, v] of Object.entries(metrics_dict[props.group])) {
                            if (v.flame_graph) {
                                if (!flame_graphs_present) {
                                    flame_graphs_present = true;

                                    $(`<div class="menu_item"
                                        onclick="onMenuItemClick(event, 'flame_graphs',
                                        '${props.group}')">
                                          Flame graphs
                                       </div>`).appendTo('#menu_items');
                                }
                            } else {
                                $(`<div class="menu_item"
                                    onclick="onMenuItemClick(event, '${k}', '${props.group}')">
                                     ${v.title}
                                   </div>`).appendTo('#menu_items');
                            }
                        }

                        $('#menu_block').css('top', props.pageY);
                        $('#menu_block').css('left', props.pageX);
                        $('#menu_block').outerHeight('auto');
                        $('#menu_block').css('display', 'flex');

                        if (sampled_diff_dict[props.group] >
                            1.0 * parseFloat($('#runtime_diff_threshold_input').val()) / 100) {
                            $('#tooltip_sampled_runtime').css('color', 'red');
                            $('#sampled_diff').html(
                                (sampled_diff_dict[props.group] * 100).toFixed(2));
                            $('#runtime_diff_threshold').html(
                                parseFloat($('#runtime_diff_threshold_input').val()));
                            $('#runtime_warning').show();
                        } else {
                            $('#tooltip_sampled_runtime').css('color', 'black');
                            $('#runtime_warning').hide();
                        }

                        var height = $('#menu_block').outerHeight();
                        var width = $('#menu_block').outerWidth();

                        if (props.pageY + height > $(window).outerHeight() - 30) {
                            $('#menu_block').outerHeight(
                                $(window).outerHeight() - props.pageY - 30);
                        }

                        if (props.pageX + width > $(window).outerWidth() - 20) {
                            $('#menu_block').css(
                                'left', props.pageX - width);
                        }

                        props.event.preventDefault();
                    }
                });
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
                $('#loading').hide();
            });
    });
});

function createWindowDOM(analysis_type) {
    if (analysis_type === 'flame_graphs') {
        return $(flame_graph_window);
    }
}

function onMenuItemClick(event, analysis_type, timeline_group_id) {
    $('#menu_block').hide();

    var index = 0;
    var new_window_id = `${analysis_type}_${timeline_group_id}_${index}`;

    while (new_window_id in window_dict) {
        index++;
        new_window_id = `${analysis_type}_${timeline_group_id}_${index}`;
    }

    window_dict[new_window_id] = {
        'type': analysis_type,
        'data': {}
    };

    var new_window = createWindowDOM(analysis_type);
    new_window.css('top', event.pageY + 'px');
    new_window.css('left', event.pageX + 'px');
    new_window.attr('id', new_window_id);
    new_window.attr('onmouseup', 'onWindowMouseUp(\'' +
                    new_window.attr('id') + '\')');
    new_window.find('.window_header').attr('onmousedown', 'startDrag(event, \'' +
                                           new_window.attr('id') + '\')');
    new_window.find('.window_close').attr(
        'onclick', 'onWindowCloseClick(event, \'' +
            new_window.attr('id') + '\')');
    new_window.appendTo('body');
    
    if (analysis_type === 'flame_graphs') {
        new_window.find('.flamegraph_time_ordered').attr(
            'id', new_window.attr('id') + '_time_ordered');
        new_window.find('.flamegraph_time_ordered_label').attr(
            'for', new_window.find('.flamegraph_time_ordered').attr('id'));
        new_window.find('.flamegraph_search').attr(
            'oninput', 'onSearchQueryChange(\'' + new_window.attr('id') + '\',' +
                'this.value)');
        new_window.find('.flamegraph_time_ordered').attr(
            'onchange', 'onTimeOrderedChange(\'' + new_window.attr('id') + '\', event)');

        var runtime_select = 0;

        if ($('#always_ms').prop('checked')) {
            runtime_select = 1;
        }

        new_window.find('.window_title').html(
            'Flame graphs for ' +
                item_dict[timeline_group_id][runtime_select]);
        new_window.find('.flamegraph_metric').empty();

        var dict = metrics_dict[timeline_group_id];
        for (const [k, v] of Object.entries(dict)) {
            new_window.find('.flamegraph_metric').append(
                new Option(v.title, k));
        }

        new_window.find('.flamegraph_metric').val('walltime');
        new_window.find('.flamegraph_time_ordered').prop('checked', false);
        new_window.find('.flamegraph').attr('data-id', timeline_group_id);

        if (timeline_group_id + '_' +
            parseFloat($('#threshold_input').val()) in result_cache) {
            result_obj = result_cache[
                timeline_group_id + '_' + parseFloat($(
                    '#threshold_input').val())];

            if (!('walltime' in result_obj)) {
                window_dict[window_id].data.flamegraph_obj = undefined;
                new_window.find('.flamegraph_svg').hide();
                new_window.find('.flamegraph_search').val('');
                new_window.find('.no_flamegraph').show();
            } else {
                openFlameGraph(new_window.attr('id'), 'walltime');
            }
        } else {
            var pid_tid = timeline_group_id.split('_');

            $.ajax({
                url: $('#block').attr('result_id') + '/',
                method: 'POST',
                dataType: 'json',
                data: {pid: pid_tid[0], tid: pid_tid[1],
                       threshold: 1.0 * parseFloat($(
                           '#threshold_input').val()) / 100}
            }).done(ajax_obj => {
                result_cache[
                    timeline_group_id + '_' + parseFloat($(
                        '#threshold_input').val())] = ajax_obj;
                result_obj = ajax_obj;

                if (!('walltime' in result_obj)) {
                    window_dict[window_id].data.flamegraph_obj = undefined;
                    new_window.find('.flamegraph_svg').hide();
                    new_window.find('.flamegraph_search').val('');
                    new_window.find('.no_flamegraph').show();
                } else {
                    openFlameGraph(new_window.attr('id'), 'walltime');
                }

                new_window.find('.window_loading').hide();
            }).fail(ajax_obj => {
                window_dict[window_id].data.flamegraph_obj = undefined;
                new_window.find('.flamegraph_svg').hide();
                new_window.find('.flamegraph_search').val('');
                new_window.find('.no_flamegraph').show();
                new_window.find('.window_loading').hide();
            });
        }

        new ResizeObserver(onFlameGraphWindowResize).observe(new_window[0]);
    }
}

function updateFlameGraph(window_id, data, always_change_height) {
    var window_obj = $('#' + window_id);
    var flamegraph_obj = window_dict[window_id].data.flamegraph_obj;
    if (flamegraph_obj !== undefined) {
        var update_height = function() {
            var flamegraph_svg = window_obj.find('.flamegraph_svg').children()[0];

            if (flamegraph_svg !== undefined) {
                var target_height = flamegraph_svg.getBBox().height;
                console.log(target_height);

                if (always_change_height || target_height > window_obj.find('.flamegraph_svg').height()) {
                    window_obj.find('.flamegraph_svg').height(target_height);
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

function openFlameGraph(window_id, metric) {
    var window_obj = $('#' + window_id);
    window_dict[window_id].data.flamegraph_obj = flamegraph();
    var flamegraph_obj = window_dict[window_id].data.flamegraph_obj;
    flamegraph_obj.inverted(true);
    flamegraph_obj.sort(window_obj.find('.flamegraph_time_ordered').prop('checked') ? false : true);
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
        if (node.data.name in callchain_obj[window_obj.find('.flamegraph_metric').val()]) {
            return callchain_obj[window_obj.find('.flamegraph_metric').val()][node.data.name];
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
            updateFlameGraph(window_id, d3.select('#' + window_obj.find('.flamegraph_svg').attr('id')).datum().data, false);
        }
    });
    flamegraph_obj.setSearchHandler(function(results, sum, total) {
        window_obj.find('.flamegraph_search_blocks').html(results.length.toLocaleString());
        window_obj.find('.flamegraph_search_found').html(sum.toLocaleString());
        window_obj.find('.flamegraph_search_total').html(window_dict[window_id].data.total.toLocaleString());
        window_obj.find('.flamegraph_search_percentage').html(
            (1.0 * sum / window_dict[window_id].data.total * 100).toFixed(2));
    });

    if (metric === 'walltime') {
        flamegraph_obj.setColorHue('warm');
    } else {
        flamegraph_obj.setColorHue('green');
    }

    window_obj.find('.no_flamegraph').hide();
    window_obj.find('.flamegraph_svg').html('');
    window_obj.find('.flamegraph_search').val('');
    window_obj.find('.flamegraph_search_results').hide();
    window_obj.find('.flamegraph_svg').attr(
        'id', window_obj.attr('id') + '_flamegraph_svg');
    window_obj.find('.flamegraph_svg').show();
    flamegraph_obj.width(window_obj.find('.flamegraph').width());
    d3.select('#' + window_obj.find('.flamegraph_svg').attr('id')).datum(structuredClone(
        result_obj[metric][
            window_obj.find('.flamegraph_time_ordered').prop('checked') ? 1 : 0])).call(
                flamegraph_obj);
    window_dict[window_id].data.total =
        d3.select('#' + window_obj.find('.flamegraph_svg').attr('id')).datum().data['value'];
    updateFlameGraph(window_id, null, true);
    flamegraph_obj.width(window_obj.find('.flamegraph_svg').width());
    flamegraph_obj.update();

    window_obj.find('.flamegraph')[0].scrollTop = 0;
}

function onBackgroundClick(event) {
    if (!document.getElementById('menu_block').contains(event.target)) {
        $('#menu_block').hide();
    }

    if (!document.getElementById('settings_block').contains(event.target)) {
        $('#settings_block').hide();
    }
}

function onWindowCloseMouseDown(event) {
    event.stopPropagation();
    event.preventDefault();
}

function onWindowCloseClick(event, window_id) {
    $('#' + window_id).remove();
    delete window_dict[window_id];
}

function onMetricChange(window_id, event) {
    var flamegraph_obj = window_dict[window_id].data.flamegraph_obj;
    if ($('#result_background').is(':visible') ||
        flamegraph_obj !== undefined) {
        var metric = event.currentTarget.value;

        flamegraph_obj = undefined;
        $('#time_ordered').prop('checked', false);

        if (metric in result_obj) {
            openFlameGraph(window_id, metric);
        } else {
            $('#search').val('');
            $('#search_results').hide();
            $('#svg').hide();
            $('#no_flamegraph').show();
        }
    }
}

function onTimeOrderedChange(window_id, event) {
    var window_obj = $('#' + window_id);
    var flamegraph_obj = window_dict[window_id].data.flamegraph_obj;
    if (flamegraph_obj !== undefined) {
        flamegraph_obj.sort(!event.currentTarget.checked);
        updateFlameGraph(window_id, structuredClone(
            result_obj[window_obj.find('.flamegraph_metric').val()][
                event.currentTarget.checked ? 1 : 0]), true);

        window_obj.find('.flamegraph_search').val('');
        window_obj.find('.flamegraph_search_results').hide();
    }
}

function onSearchQueryChange(window_id, value) {
    var window_obj = $('#' + window_id);
    var flamegraph_obj = window_dict[window_id].data.flamegraph_obj;
    if (flamegraph_obj !== undefined) {
        if (value === undefined || value === "") {
            window_obj.find('.flamegraph_search_results').hide();
        } else {
            window_obj.find('.flamegraph_search_results').show();
        }

        flamegraph_obj.search(value);
    }
}

function onWindowMouseUp(window_id) {
    var window_obj = $('#' + window_id);
    var flamegraph_obj = window_dict[window_id].data.flamegraph_obj;
    if (window_dict[window_id].data.being_resized) {
        flamegraph_obj.width(window_obj.find('.flamegraph_svg').width());
        flamegraph_obj.update();
        window_dict[window_id].data.being_resized = false;
    }
}

function onFlameGraphWindowResize(windows) {
    for (var window of windows) {
        var target = window.target;

        if (target === null) {
            continue;
        }
        
        var window_id = $(target).attr('id');
        while (target !== null && !(window_id in window_dict)) {
            target = target.parentElement;
            window_id = $(target).attr('id');
        }

        if (target === null) {
            continue;
        }

        if (window_dict[window_id].data.flamegraph_obj !== undefined) {
            window_dict[window_id].data.being_resized = true;
        }
    }
}

// downloadFlameGraph() is based on https://stackoverflow.com/a/28226736
// (originally CC BY-SA 4.0, covered by GNU GPL v3 here)
function downloadFlameGraph(window_id) {
    var window_obj = $('#' + window_id);
    var filename = window.prompt(
        'What filename do you want? ' +
            '(".png" will be added automatically)');

    if (filename === null || filename === "") {
        return;
    }

    var svg = window_obj.find('.flamegraph_svg').children()[0].cloneNode(true);
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
    };
    image.onerror = function() {
        window.alert("Could not download the flame graph because " +
                     "of an error!");
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

function startDrag(event, window_id) {
    event.stopPropagation();
    event.preventDefault();

    var dragged = document.getElementById(window_id);
    var startX = event.offsetX;
    var startY = event.offsetY;

    $('body').mousemove(function(event) {
        event.stopPropagation();
        event.preventDefault();
        var newX = event.pageX - startX;
        var newY = event.pageY - startY;
        var dragged_rect = dragged.getBoundingClientRect();

        dragged.style.left = newX + 'px';
        dragged.style.top = newY + 'px';
    });

    $('body').mouseup(function(event) {
        $('body').off('mousemove');
        $('body').off('mouseup');
    });
}

function onSettingsClick(event) {
    $('#settings_block').css('top', event.clientY);
    $('#settings_block').css('left', event.clientX);
    $('#settings_block').show();

    var height = $('#settings_block').outerHeight();
    var width = $('#settings_block').outerWidth();

    if (event.clientY + height > $(window).outerHeight() - 30) {
        $('#settings_block').outerHeight(
            $(window).outerHeight() - props.pageY - 30);
    }

    if (event.clientX + width > $(window).outerWidth() - 20) {
        $('#settings_block').css(
            'left', props.pageX - width);
    }

    event.preventDefault();
    event.stopPropagation();
}

function onGeneralAnalysesClick(event) {

}
