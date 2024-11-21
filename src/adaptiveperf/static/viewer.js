// AdaptivePerfHTML: Tool for producing HTML summary of profiling results
// Copyright (C) CERN. See LICENSE for details.

// Window directory structure:
// {
//     '<div ID>': {
//         'type': '<analysis type, e.g. flame_graphs>',
//         'data': {
//             <data relevant to analysis type>
//         },
//         'collapsed': <whether the window is collapsed>,
//         'last_height': <last window height before becoming invisible, may be undefined>,
//         'min_height': <window minimum height, may be undefined>,
//         'last_focus': <last time the window was focused>
//     }
// }
var window_dict = {};

// (Profiling) session directory structure:
// {
//     '<session ID>': {
//         'label': ...,
//         'result_cache': ...,
//         'callchain_obj': ...,
//         'callchain_dict': ...,
//         'perf_maps_obj': ...,
//         'perf_maps_cache': ...,
//         'sampled_diff_dict': ...,
//         'item_list': ...,
//         'group_list': ...,
//         'item_dict': ...,
//         'callchain_dict': ...,
//         'metrics_dict': ...,
//         'tooltip_dict': ...,
//         'warning_dict': ...,
//         'general_metrics_dict': ...,
//         'overall_end_time': ...
//     }
// }
var session_dict = {};

// Window templates
function createWindowDOM(type, timeline_group_id) {
    const window_header = `
<div class="window_header">
    <span class="window_title"></span>
    <span class="window_close" onmousedown="windowStopPropagation(event)">
      <!-- This SVG is from Google Material Icons, originally licensed under
           Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0.txt
           (covered by GNU GPL v3 here) -->
      <svg xmlns="http://www.w3.org/2000/svg" height="24px"
           viewBox="0 -960 960 960" width="24px">
        <title>Close</title>
        <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
      </svg>
    </span>
   <span class="window_visibility" onmousedown="windowStopPropagation(event)">
      <!-- This SVG is from Google Material Icons, originally licensed under
           Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0.txt
           (covered by GNU GPL v3 here) -->
      <svg xmlns="http://www.w3.org/2000/svg" height="24px"
           viewBox="0 -960 960 960" width="24px">
        <title>Toggle visibility</title>
        <path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"/>
      </svg>
    </span>
  </div>
`;

    const type_dict = {
        roofline: `
<div class="roofline_box">
  <div class="roofline_settings">
    <fieldset class="roofline_type">
      <legend>Type</legend>
      <select name="roofline_type" class="roofline_type_select">
        <option value="" selected="selected" disabled="disabled">
          Select...
        </option>
      </select>
    </fieldset>
    <fieldset class="roofline_bounds">
      <legend>Bounds</legend>
      <div class="roofline_l1">
        <b>L1:</b> on
      </div>
      <div class="roofline_l2">
        <b>L2:</b> on
      </div>
      <div class="roofline_l3">
        <b>L3:</b> on
      </div>
      <div class="roofline_dram">
        <b>DRAM:</b> on
      </div>
      <div class="roofline_fp" title="There are two performance ceilings: FP_FMA (floating-point ops with FMA instructions) and FP (floating-point ops without FMA instructions). FP_FMA is used for plotting L1/L2/L3/DRAM bounds, but the lower FP ceiling can be plotted as an extra dashed black line since not all programs use FMA.">
        <b>FP:</b> on
      </div>
    </fieldset>
    <fieldset class="roofline_details">
      <legend>Details</legend>
      <span class="roofline_details_text">
        <i>Please select a roofline type first.</i>
      </span>
    </fieldset>
  </div>
  <div class="roofline">

  </div>
</div>
`,
        flame_graphs: `
<span class="collapse_info">
  Some blocks may be collapsed to speed up rendering, but you can expand
  them by clicking them.
</span>
<div class="flamegraph_choice">
  <div class="flamegraph_metric_choice">
    <select name="metric" class="flamegraph_metric">
      <option value="" disabled="disabled">
        Metric...
      </option>
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
    <svg class="pointer flamegraph_download" xmlns="http://www.w3.org/2000/svg" height="24px"
         viewBox="0 -960 960 960" width="24px" fill="#000000">
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
`,
        code: `
<div class="code_choice">
  <select name="file" class="code_file">
    <option value="" disabled="disabled">
      File to preview...
    </option>
  </select>
  <select name="type" class="code_type">
    <option value="" disabled="disabled">
      Code type...
    </option>
    <option value="original" selected="selected">
      Original
    </option>
  </select>
  <!-- This SVG is from Google Material Icons, originally licensed under
       Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0.txt
       (covered by GNU GPL v3 here) -->
  <svg class="pointer code_copy_all" xmlns="http://www.w3.org/2000/svg" height="24px"
       viewBox="0 -960 960 960" width="24px" fill="#000000">
    <title>Copy all code</title>
    <path d="M120-220v-80h80v80h-80Zm0-140v-80h80v80h-80Zm0-140v-80h80v80h-80ZM260-80v-80h80v80h-80Zm100-160q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480Zm40 240v-80h80v80h-80Zm-200 0q-33 0-56.5-23.5T120-160h80v80Zm340 0v-80h80q0 33-23.5 56.5T540-80ZM120-640q0-33 23.5-56.5T200-720v80h-80Zm420 80Z" />
  </svg>
</div>
<div class="code_container">
  <pre><code class="code_box"></code></pre>
</div>
`
    };

    var root = $('<div></div>');
    root.attr('class', 'window ' + type + '_window');
    root.append($(window_header));

    var content = $('<div></div>');
    content.attr('class', 'window_content ' + type + '_content');
    content.html(type_dict[type]);

    root.append(content);

    var session_id = $('#results_combobox').prop('selectedIndex');
    var index = 0;
    var new_window_id = undefined;

    if (timeline_group_id === undefined) {
        new_window_id =
            `w_${session_id}_${type}_${index}`;

        while (new_window_id in window_dict) {
            index++;
            new_window_id =
                `w_${session_id}_${type}_${index}`;
        }
    } else {
        new_window_id =
            `w_${session_id}_${type}_${timeline_group_id}_${index}`;

        while (new_window_id in window_dict) {
            index++;
            new_window_id =
                `w_${session_id}_${type}_${timeline_group_id}_${index}`;
        }
    }

    window_dict[new_window_id] = {
        'type': type,
        'data': {},
        'being_resized': false,
        'collapsed': false,
        'last_focus': Date.now()
    };

    root.attr('id', new_window_id);
    root.attr('onclick', 'changeFocus(\'' +
              root.attr('id') + '\')');
    root.attr('onmouseup', 'onWindowMouseUp(\'' +
              root.attr('id') + '\')');
    root.find('.window_header').attr('onmousedown', 'startDrag(event, \'' +
                                     root.attr('id') + '\')');
    root.find('.window_visibility').attr(
        'onclick', 'onWindowVisibilityClick(event, \'' +
            root.attr('id') + '\')');
    root.find('.window_close').attr(
        'onclick', 'onWindowCloseClick(\'' +
            root.attr('id') + '\')');

    return root;
}

var current_focused_window_id = undefined;
var largest_z_index = 0;
var code_styles = {};

function getSymbolFromMap(addr, map_name) {
    var session = session_dict[$('#results_combobox').val()];
    if ([addr, map_name] in session.perf_maps_cache) {
        return session.perf_maps_cache[[addr, map_name]];
    }

    var regex = /^\[(0x[0-9a-f]+)\]$/;
    var match = regex.exec(addr);

    if (match == null) {
        return addr;
    }

    var addr_int = parseInt(match[1], 16);

    if (map_name in session.perf_maps_obj) {
        var data = session.perf_maps_obj[map_name];
        var start = 0;
        var end = data.length - 1;

        while (start <= end) {
            var middle = Math.floor((start + end) / 2);
            var addr1 = parseInt(data[middle][0], 16);
            var addr2 = parseInt(data[middle][1], 16);

            if (addr_int >= addr1 && addr_int <= addr2) {
                session.perf_maps_cache[[addr, map_name]] = data[middle][2];
                return data[middle][2];
            } else if (addr_int < addr1) {
                end = middle - 1;
            } else {
                start = middle + 1;
            }
        }
    }

    return addr;
}

$(document).on('change', '#results_combobox', function() {
    $('#settings').hide();
    $('#block').hide();
    $('#loading').show();
    $('#results_combobox option:selected').each(function() {
        var value = $(this).val();
        var label = $(this).attr('data-label');
        var session_init = false;

        if (!(value in session_dict)) {
            session_init = true;
            session_dict[value] = {};
        }

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
                                       general_metrics_dict,
                                       sampled_diff_dict,
                                       src_dict, src_index_dict) {
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

                item_dict[item.id] = json.name + ' (' + json.pid_tid + ')';
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

                if ('src' in json && $.isEmptyObject(src_dict)) {
                    Object.assign(src_dict, json.src);
                }

                if ('src_index' in json && $.isEmptyObject(src_index_dict)) {
                    Object.assign(src_index_dict, json.src_index);
                }

                if (level > 0) {
                    callchain_dict[item.id] = json.start_callchain;
                }

                for (var i = 0; i < json.off_cpu.length; i++) {
                    var start = json.off_cpu[i][0];
                    var end = start + json.off_cpu[i][1];
                    var offcpu_sampling = parseInt(
                        $('#viewer_script').attr('data-offcpu-sampling'));

                    if (offcpu_sampling === 0 ||
                        start % offcpu_sampling === 0 ||
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
                                      general_metrics_dict,
                                      sampled_diff_dict,
                                      src_dict,
                                      src_index_dict);
                }
            }

            function part2() {
                $.ajax({
                    url: $('#block').attr('result_id') + '/',
                    method: 'POST',
                    dataType: 'json',
                    data: {perf_map: true}
                }).done(ajax_obj => {
                    session_dict[value].perf_maps_obj = ajax_obj;
                    part3(true);
                }).fail(ajax_obj => {
                    session_dict[value].perf_maps_obj = {};
                    alert('Could not obtain the perf symbol maps! You ' +
                          'will not get meaningful names when checking ' +
                          'stack traces e.g. for JIT-ed codes.');
                    part3(true);
                });
            }

            function part3(init) {
                if (init) {
                    session_dict[value].label = label;
                    session_dict[value].item_list = [];
                    session_dict[value].group_list = [];
                    session_dict[value].item_dict = {};
                    session_dict[value].callchain_dict = {};
                    session_dict[value].metrics_dict = {};
                    session_dict[value].tooltip_dict = {};
                    session_dict[value].warning_dict = {};
                    session_dict[value].general_metrics_dict = {};
                    session_dict[value].perf_maps_cache = {};
                    session_dict[value].result_cache = {};
                    session_dict[value].sampled_diff_dict = {};
                    session_dict[value].src_dict = {};
                    session_dict[value].src_index_dict = {};
                    session_dict[value].overall_end_time = [0];
                    session_dict[value].src_cache = {};

                    from_json_to_item(JSON.parse(result), 0,
                                      session_dict[value].item_list,
                                      session_dict[value].group_list,
                                      session_dict[value].item_dict,
                                      session_dict[value].metrics_dict,
                                      session_dict[value].callchain_dict,
                                      session_dict[value].tooltip_dict,
                                      session_dict[value].warning_dict,
                                      session_dict[value].overall_end_time,
                                      session_dict[value].general_metrics_dict,
                                      session_dict[value].sampled_diff_dict,
                                      session_dict[value].src_dict,
                                      session_dict[value].src_index_dict);
                }

                var container = $('#block')[0];
                container.innerHTML = '';

                $('#settings').show();
                $('#block').show();
                $('#loading').hide();

                var timeline = new vis.Timeline(
                    container,
                    session_dict[value].item_list,
                    session_dict[value].group_list,
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
                        max: 2 * session_dict[value].overall_end_time[0]
                    }
                );

                timeline.on('contextmenu', function (props) {
                    if (props.group != null) {
                        var item_list = session_dict[value].item_list;
                        var group_list = session_dict[value].group_list;
                        var item_dict = session_dict[value].item_dict;
                        var callchain_dict = session_dict[value].callchain_dict;
                        var callchain_obj = session_dict[value].callchain_obj;
                        var metrics_dict = session_dict[value].metrics_dict;
                        var tooltip_dict = session_dict[value].tooltip_dict;
                        var warning_dict = session_dict[value].warning_dict;
                        var general_metrics_dict = session_dict[value].general_metrics_dict;
                        var sampled_diff_dict = session_dict[value].sampled_diff_dict;
                        var src_dict = session_dict[value].src_dict;
                        var src_index_dict = session_dict[value].src_index_dict;

                        if (props.group in callchain_dict) {
                            $('#callchain').html('');

                            var first = true;
                            for (const [name, offset] of callchain_dict[props.group]) {
                                var new_span = $('<span></span>');
                                new_span.css('cursor', 'help');

                                if (callchain_obj !== undefined &&
                                    name in callchain_obj['syscall']) {
                                    var symbol = callchain_obj['syscall'][name];
                                    new_span.text(getSymbolFromMap(symbol[0], symbol[1]));

                                    if (symbol[1] in src_dict.syscall &&
                                        offset in src_dict.syscall[symbol[1]]) {
                                        var src = src_dict.syscall[symbol[1]][offset];
                                        new_span.attr('title', src.file + ':' + src.line);

                                        if (src.file in src_index_dict) {
                                            new_span.css('color', 'green');
                                            new_span.css('font-weight', 'bold');
                                            new_span.css('text-decoration', 'underline');
                                            new_span.css('cursor', 'pointer');

                                            new_span.on(
                                                'click', {file: src.file,
                                                          filename: src_index_dict[src.file],
                                                          line: src.line},
                                                function(event) {
                                                    var data = {};
                                                    data[event.data.file] = {}
                                                    data[event.data.file][
                                                        event.data.line] = 'exact';
                                                    closeAllMenus();
                                                    openCode(data, event.data.file);
                                            });
                                        }
                                    } else {
                                        new_span.attr('title', symbol[1] + '+' + offset);
                                    }
                                } else {
                                    new_span.text(name +
                                                  ' (not-yet-loaded or missing ' +
                                                  'callchain dictionary)');
                                }

                                if (first) {
                                    first = false;
                                } else {
                                    $('#callchain').append('<br />');
                                }

                                $('#callchain').append(new_span);
                            }
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

                        $('#thread_menu_items').empty();

                        var flame_graphs_present = false;

                        for (const [k, v] of Object.entries(metrics_dict[props.group])) {
                            if (v.flame_graph) {
                                if (!flame_graphs_present) {
                                    flame_graphs_present = true;

                                    $(`<div class="menu_item"
                                        onclick="onMenuItemClick(event, 'flame_graphs',
                                        '${props.group}')">
                                          Flame graphs
                                       </div>`).appendTo('#thread_menu_items');
                                }
                            } else {
                                $(`<div class="menu_item"
                                    onclick="onMenuItemClick(event, '${k}', '${props.group}')">
                                     ${v.title}
                                   </div>`).appendTo('#thread_menu_items');
                            }
                        }

                        $('#thread_menu_block').css('top', props.pageY);
                        $('#thread_menu_block').css('left', props.pageX);
                        $('#thread_menu_block').outerHeight('auto');
                        $('#thread_menu_block').css('display', 'flex');

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

                        var height = $('#thread_menu_block').outerHeight();
                        var width = $('#thread_menu_block').outerWidth();

                        if (props.pageY + height > $(window).outerHeight() - 30) {
                            $('#thread_menu_block').outerHeight(
                                $(window).outerHeight() - props.pageY - 30);
                        }

                        if (props.pageX + width > $(window).outerWidth() - 20) {
                            $('#thread_menu_block').css(
                                'left', props.pageX - width);
                        }

                        props.event.preventDefault();
                        props.event.stopPropagation();

                        closeAllMenus(props.event, 'thread_menu_block');
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
                session_dict[value].callchain_obj = ajax_obj;
                part2();
            }).fail(ajax_obj => {
                alert('Could not obtain the callchain mappings! You ' +
                      'will not get meaningful names when checking ' +
                      'any stack traces.');
                part3(true);
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

function closeAllMenus() {
    $('#thread_menu_block').hide();
    $('#general_analysis_menu_block').hide();
}

function setupWindow(window_obj, type, data) {
    var loading_jquery = $('#loading').clone();
    loading_jquery.removeAttr('id');
    loading_jquery.attr('class', 'loading');
    loading_jquery.prependTo(window_obj.find('.window_content'));
    loading_jquery.show();

    window_obj.appendTo('body');
    changeFocus(window_obj.attr('id'));

    var session = session_dict[$('#results_combobox').val()];
    if (type === 'flame_graphs') {
        window_obj.find('.flamegraph_time_ordered').attr(
            'id', window_obj.attr('id') + '_time_ordered');
        window_obj.find('.flamegraph_time_ordered_label').attr(
            'for', window_obj.find('.flamegraph_time_ordered').attr('id'));
        window_obj.find('.flamegraph_search').attr(
            'oninput', 'onSearchQueryChange(\'' + window_obj.attr('id') + '\',' +
                'this.value)');
        window_obj.find('.flamegraph_time_ordered').attr(
            'onchange', 'onTimeOrderedChange(\'' + window_obj.attr('id') + '\', event)');
        window_obj.find('.flamegraph_metric').attr(
            'onchange', 'onMetricChange(\'' + window_obj.attr('id') + '\', event)');
        window_obj.find('.flamegraph_download').attr(
            'onclick', 'downloadFlameGraph(\'' + window_obj.attr('id') + '\')');

        window_obj.find('.window_title').html(
            '[Session: ' + session.label + '] ' +
                'Flame graphs for ' +
                session.item_dict[data.timeline_group_id]);
        var to_remove = [];
        window_obj.find('.flamegraph_metric > option').each(function() {
            if (!this.disabled) {
                to_remove.push($(this));
            }
        });

        for (const opt of to_remove) {
            opt.remove();
        }

        var dict = session.metrics_dict[data.timeline_group_id];
        for (const [k, v] of Object.entries(dict)) {
            window_obj.find('.flamegraph_metric').append(
                new Option(v.title, k));
        }

        window_obj.find('.flamegraph_metric').val('walltime');
        window_obj.find('.flamegraph_time_ordered').prop('checked', false);
        window_obj.find('.flamegraph').attr('data-id', data.timeline_group_id);

        var window_id = window_obj.attr('id');

        if (data.timeline_group_id + '_' +
            parseFloat($('#threshold_input').val()) in session.result_cache) {
            window_dict[window_id].data.result_obj = session.result_cache[
                data.timeline_group_id + '_' + parseFloat($(
                    '#threshold_input').val())];

            if (!('walltime' in window_dict[window_id].data.result_obj)) {
                window_dict[window_id].data.flamegraph_obj = undefined;
                window_obj.find('.flamegraph_svg').hide();
                window_obj.find('.flamegraph_search').val('');
                window_obj.find('.no_flamegraph').show();
            } else {
                openFlameGraph(window_obj.attr('id'), 'walltime');
            }

            loading_jquery.hide();
        } else {
            var pid_tid = data.timeline_group_id.split('_');

            $.ajax({
                url: $('#block').attr('result_id') + '/',
                method: 'POST',
                dataType: 'json',
                data: {pid: pid_tid[0], tid: pid_tid[1],
                       threshold: 1.0 * parseFloat($(
                           '#threshold_input').val()) / 100}
            }).done(ajax_obj => {
                session.result_cache[
                    data.timeline_group_id + '_' + parseFloat($(
                        '#threshold_input').val())] = ajax_obj;
                window_dict[window_id].data.result_obj = ajax_obj;

                if (!('walltime' in window_dict[window_id].data.result_obj)) {
                    window_dict[window_id].data.flamegraph_obj = undefined;
                    window_obj.find('.flamegraph_svg').hide();
                    window_obj.find('.flamegraph_search').val('');
                    window_obj.find('.no_flamegraph').show();
                } else {
                    openFlameGraph(window_obj.attr('id'), 'walltime');
                }

                loading_jquery.hide();
            }).fail(ajax_obj => {
                window_dict[window_id].data.flamegraph_obj = undefined;
                window_obj.find('.flamegraph_svg').hide();
                window_obj.find('.flamegraph_search').val('');
                window_obj.find('.no_flamegraph').show();
                loading_jquery.hide();
            });
        }

        new ResizeObserver(onWindowResize).observe(window_obj[0]);
    } else if (type === 'roofline') {
        window_obj.find('.window_title').html(
            '[Session: ' + session.label + '] ' + 'Cache-aware roofline model');
        window_obj.find('.roofline_type_select').attr(
            'onchange', 'onRooflineTypeChange(event, ' +
                '\'' + window_obj.attr('id') + '\')');
        window_obj.find('.roofline_l1').attr(
            'onclick', 'onRooflineBoundsChange(\'l1\', \'' +
                window_obj.attr('id') + '\')');
        window_obj.find('.roofline_l2').attr(
            'onclick', 'onRooflineBoundsChange(\'l2\', \'' +
                window_obj.attr('id') + '\')');
        window_obj.find('.roofline_l3').attr(
            'onclick', 'onRooflineBoundsChange(\'l3\', \'' +
                window_obj.attr('id') + '\')');
        window_obj.find('.roofline_dram').attr(
            'onclick', 'onRooflineBoundsChange(\'dram\', \'' +
                window_obj.attr('id') + '\')');
        window_obj.find('.roofline_fp').attr(
            'onclick', 'onRooflineBoundsChange(\'fp\', \'' +
                window_obj.attr('id') + '\')');

        if (type in session.result_cache) {
            window_dict[window_obj.attr('id')].data =
                session.result_cache[type];
            openRooflinePlot(window_obj,
                             session.result_cache[type]);
            loading_jquery.hide();
        } else {
            $.ajax({
                url: $('#block').attr('result_id') + '/',
                method: 'POST',
                dataType: 'json',
                data: {general_analysis: type}
            }).done(ajax_obj => {
                session.result_cache[type] = ajax_obj;
                window_dict[window_obj.attr('id')].data = ajax_obj;
                openRooflinePlot(window_obj, ajax_obj);
                loading_jquery.hide();
            }).fail(ajax_obj => {
                window.alert('Could not load the roofline model!');
                loading_jquery.hide();
                onWindowCloseClick(window_obj.attr('id'));
            });
        }
    } else if (type === 'code') {
        window_obj.find('.window_title').html(
            '[Session: ' + session.label + '] ' +
                'Code preview');

        window_obj.find('.code_box').text(data.code);
        for (const f of Object.keys(data.files_and_lines)) {
            window_obj.find('.code_file').append(
                new Option(f, f));
        }
        window_obj.find('.code_file').val(data.default_file);
        window_obj.find('.code_copy_all').on('click', {
            code: data.code
        }, function(event) {
            navigator.clipboard.writeText(event.data.code);
            window.alert('Code copied to clipboard!');
        });

        var styles = [];

        for (const [line, how] of Object.entries(
            data.files_and_lines[data.default_file])) {

            if (how === 'exact') {
                styles.push('#' + window_obj.attr('id') +
                            ' .hljs-ln-code[data-line-number="' +
                            line + '"] { background-color: lightblue; }');
            }
        }

        if (styles.length > 0) {
            var style = $('<style>' + styles.join('\n') + '</style>');
            code_styles[window_obj.attr('id')] = style;
            $('html > head').append(style);
        }

        hljs.highlightElement(window_obj.find('.code_box')[0]);
        hljs.initLineNumbersOnLoad();
        loading_jquery.hide();
    }
}

// Data should have the following form:
// {
//     '<path>': {
//         '<line number>': '<"exact" or "sampled">'
//     }
// }
//
// default_path corresponds to <path> to be displayed first
// when a code preview window is shown.
function openCode(data, default_path) {
    var session = session_dict[$('#results_combobox').val()];
    var load = function(code) {
        var new_window = createWindowDOM('code');
        new_window.css('top', 'calc(50% - 275px)');
        new_window.css('left', 'calc(50% - 375px)');
        setupWindow(new_window, 'code', {
            code: code,
            files_and_lines: data,
            default_file: default_path,
        });
    };

    if (default_path in session.src_cache) {
        load(session.src_cache[default_path]);
    } else {
        $.ajax({
            url: $('#block').attr('result_id') + '/',
            method: 'POST',
            dataType: 'text',
            data: {src: session.src_index_dict[default_path]}
        }).done(src_code => {
            session.src_cache[default_path] = src_code;
            load(src_code);
        }).fail(ajax_obj => {

        });
    }
}

function openRooflinePlot(window_obj, roofline_obj) {
    for (var i = 0; i < roofline_obj.models.length; i++) {
        window_obj.find('.roofline_type_select').append(
            new Option(roofline_obj.models[i].isa, i));
    }

    var plot_container = window_obj.find('.roofline');
    var plot_id = window_obj.attr('id') + '_roofline';
    plot_container.attr('id', plot_id);

    roofline_obj.bounds = {
        'l1': true,
        'l2': true,
        'l3': true,
        'dram': true,
        'fp': true
    };

    new ResizeObserver(onWindowResize).observe(window_obj[0]);
}

function onRooflineBoundsChange(bound, window_id) {
    var window_obj = $('#' + window_id);
    var plot_present = window_obj.find('.roofline_type_select').val() != null;
    var roofline_obj = window_dict[window_id].data;
    roofline_obj.bounds[bound] = !roofline_obj.bounds[bound];

    var model = plot_present ?
        roofline_obj.models[
            window_obj.find('.roofline_type_select').val()] : undefined;
    var plot_data = [];
    var for_turning_x = [];

    if (roofline_obj.bounds.l1) {
        if (plot_present) {
            plot_data.push(roofline_obj.l1_func);
            for_turning_x.push(model.l1.gbps);
        }

        window_obj.find('.roofline_l1').html('<b>L1:</b> on');
    } else {
        window_obj.find('.roofline_l1').html('<b>L1:</b> off');
    }

    if (roofline_obj.bounds.l2) {
        if (plot_present) {
            plot_data.push(roofline_obj.l2_func);
            for_turning_x.push(model.l2.gbps);
        }

        window_obj.find('.roofline_l2').html('<b>L2:</b> on');
    } else {
        window_obj.find('.roofline_l2').html('<b>L2:</b> off');
    }

    if (roofline_obj.bounds.l3) {
        if (plot_present) {
            plot_data.push(roofline_obj.l3_func);
            for_turning_x.push(model.l3.gbps);
        }

        window_obj.find('.roofline_l3').html('<b>L3:</b> on');
    } else {
        window_obj.find('.roofline_l3').html('<b>L3:</b> off');
    }

    if (roofline_obj.bounds.dram) {
        if (plot_present) {
            plot_data.push(roofline_obj.dram_func);
            for_turning_x.push(model.dram.gbps);
        }

        window_obj.find('.roofline_dram').html('<b>DRAM:</b> on');
    } else {
        window_obj.find('.roofline_dram').html('<b>DRAM:</b> off');
    }

    if (roofline_obj.bounds.fp) {
        if (plot_present) {
            plot_data.push(roofline_obj.fp_func);
        }

        window_obj.find('.roofline_fp').html('<b>FP:</b> on');
    } else {
        window_obj.find('.roofline_fp').html('<b>FP:</b> off');
    }

    if (plot_present) {
        var turning_x = model.fp_fma.gflops / Math.min(...for_turning_x);
        roofline_obj.plot_config.data = plot_data;
        roofline_obj.plot_config.xAxis.domain = [0, 1.5 * turning_x];
        functionPlot(roofline_obj.plot_config);
    }
}

function onRooflineTypeChange(event, window_id) {
    var window_obj = $('#' + window_id);
    var type_index = event.currentTarget.value;
    var roofline_obj = window_dict[window_id].data;
    var model = roofline_obj.models[type_index];

    window_obj.find('.roofline_details_text').html(`
        <b>Precision:</b> ${model.precision}<br />
        <b>Threads:</b> ${model.threads}<br />
        <b>Loads:</b> ${model.loads}<br />
        <b>Stores:</b> ${model.stores}<br />
        <b>Interleaved:</b> ${model.interleaved}<br />
        <b>L1 bytes:</b> ${roofline_obj.l1}<br />
        <b>L2 bytes:</b> ${roofline_obj.l2}<br />
        <b>L3 bytes:</b> ${roofline_obj.l3}<br />
        <b>DRAM bytes:</b> ${model.dram_bytes}
    `);

    roofline_obj.l1_func = {
        fn: `min(x * ${model.l1.gbps}, ${model.fp_fma.gflops})`,
        color: 'darkred'
    };

    roofline_obj.l2_func = {
        fn: `min(x * ${model.l2.gbps}, ${model.fp_fma.gflops})`,
        color: 'darkgreen'
    };

    roofline_obj.l3_func = {
        fn: `min(x * ${model.l3.gbps}, ${model.fp_fma.gflops})`,
        color: 'darkblue'
    };

    roofline_obj.dram_func = {
        fn: `min(x * ${model.dram.gbps}, ${model.fp_fma.gflops})`,
        color: 'darkgrey'
    };

    roofline_obj.fp_func = {
        fn: model.fp.gflops,
        color: 'black',
        graphType: 'scatter',
        nSamples: 100
    }

    var plot_data = [];
    var for_turning_x = [];

    if (roofline_obj.bounds.l1) {
        plot_data.push(roofline_obj.l1_func);
        for_turning_x.push(model.l1.gbps);
    }

    if (roofline_obj.bounds.l2) {
        plot_data.push(roofline_obj.l2_func);
        for_turning_x.push(model.l2.gbps);
    }

    if (roofline_obj.bounds.l3) {
        plot_data.push(roofline_obj.l3_func);
        for_turning_x.push(model.l3.gbps);
    }

    if (roofline_obj.bounds.dram) {
        plot_data.push(roofline_obj.dram_func);
        for_turning_x.push(model.dram.gbps);
    }

    if (roofline_obj.bounds.fp) {
        plot_data.push(roofline_obj.fp_func);
    }

    var turning_x = model.fp_fma.gflops / Math.min(...for_turning_x);

    var container = window_obj.find('.roofline');

    roofline_obj.plot_config = {
        target: '#' + window_id + '_roofline',
        width: container.width() - 10,
        height: container.height() - 10,
        xAxis: {
            label: 'Arithmetic intensity (flop/byte)',
            domain: [0.00390625, 1.5 * turning_x]
        },
        yAxis: {
            label: 'Performance (Gflop/s)',
            domain: [0, 1.25 * model.fp_fma.gflops]
        },
        disableZoom: true,
        data: plot_data
    };

    functionPlot(roofline_obj.plot_config);
}

function onMenuItemClick(event, analysis_type, timeline_group_id) {
    $('#thread_menu_block').hide();
    $('#general_analysis_menu_block').hide();

    var new_window = createWindowDOM(analysis_type, timeline_group_id);
    new_window.css('top', event.pageY + 'px');
    new_window.css('left', event.pageX + 'px');

    setupWindow(new_window, analysis_type, {
        timeline_group_id: timeline_group_id
    });
}

function changeFocus(window_id) {
    if (window_id === undefined) {
        var keys = Object.keys(window_dict);

        if (keys.length === 0) {
            return;
        }

        keys.sort(function comp(a, b) {
            return window_dict[b].last_focus - window_dict[a].last_focus;
        });
        window_id = keys[0];
    }

    if (!(window_id in window_dict)) {
        return;
    }

    var current_window = $('#' + window_id);
    var window_header = current_window.find('.window_header');

    if (current_focused_window_id !== window_id) {
        if (window_id !== undefined) {
            if (largest_z_index >= 10000) {
                var z_index_arr = [];

                for (const k of Object.keys(window_dict)) {
                    z_index_arr.push({'index': $('#' + k).css('z-index'),
                                      'id': k});
                }

                z_index_arr.sort((a, b) => {
                    if (a.index === undefined) {
                        return -1;
                    } else if (b.index === undefined) {
                        return 1;
                    } else {
                        return a.index - b.index;
                    }
                });

                var index = 1;
                for (const obj of z_index_arr) {
                    $('#' + obj.id).css('z-index', index);
                    index += 1;
                }

                current_window.css('z-index', index);
                largest_z_index = index;
            } else {
                largest_z_index += 1;
                current_window.css('z-index', largest_z_index);
            }

            window_header.css('background-color', 'black');
            window_header.css('color', 'white');
            window_header.css('fill', 'white');
        }

        for (const k of Object.keys(window_dict)) {
            if (k !== window_id) {
                var unfocused_window = $('#' + k);
                var unfocused_header = unfocused_window.find('.window_header');

                unfocused_header.css('background-color', 'lightgray');
                unfocused_header.css('color', 'black');
                unfocused_header.css('fill', 'black');
            }
        }

        current_focused_window_id = window_id;
        window_dict[window_id].last_focus = Date.now();
    }
}

function onWindowVisibilityClick(event, window_id) {
    windowStopPropagation(event);

    var current_window = $('#' + window_id);
    var window_entry = window_dict[window_id];
    var window_content = current_window.find('.window_content');
    var window_header = current_window.find('.window_header');

    if (!window_entry.collapsed) {
        window_entry.collapsed = true;
        window_entry.min_height = current_window.css('min-height');
        window_entry.last_height = current_window.outerHeight();
        current_window.css('min-height', '0');
        current_window.css('resize', 'horizontal');
        current_window.height(window_header.outerHeight());
    } else {
        window_entry.collapsed = false;
        current_window.height(window_entry.last_height);
        current_window.css('min-height', window_entry.min_height);
        current_window.css('resize', 'both');
        current_window.css('opacity', '');
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

                if (always_change_height || target_height > window_obj.find('.flamegraph_svg').outerHeight()) {
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
    var session = session_dict[$('#results_combobox').val()];
    var window_obj = $('#' + window_id);
    var result_obj = window_dict[window_id].data.result_obj;
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
        if (node.data.name in session.callchain_obj[window_obj.find('.flamegraph_metric').val()]) {
            var symbol = session.callchain_obj[window_obj.find('.flamegraph_metric').val()][node.data.name];
            return getSymbolFromMap(symbol[0], symbol[1]);
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
    flamegraph_obj.width(window_obj.find('.flamegraph').outerWidth());
    d3.select('#' + window_obj.find('.flamegraph_svg').attr('id')).datum(structuredClone(
        result_obj[metric][
            window_obj.find('.flamegraph_time_ordered').prop('checked') ? 1 : 0])).call(
                flamegraph_obj);
    window_dict[window_id].data.total =
        d3.select('#' + window_obj.find('.flamegraph_svg').attr('id')).datum().data['value'];
    updateFlameGraph(window_id, null, true);
    flamegraph_obj.width(window_obj.find('.flamegraph_svg').outerWidth());
    flamegraph_obj.update();

    window_obj.find('.flamegraph')[0].scrollTop = 0;
}

function closeAllMenus(event, exclude) {
    if (exclude !== 'thread_menu_block' &&
        (event === undefined ||
         !document.getElementById('thread_menu_block').contains(event.target))) {
        $('#thread_menu_block').hide();
    }

    if (exclude !== 'settings_block' &&
        (event === undefined ||
         !document.getElementById('settings_block').contains(event.target))) {
        $('#settings_block').hide();
    }

    if (exclude !== 'general_analysis_menu_block' &&
        (event === undefined ||
         !document.getElementById('general_analysis_menu_block').contains(event.target))) {
        $('#general_analysis_menu_block').hide();
    }
}

function windowStopPropagation(event) {
    event.stopPropagation();
    event.preventDefault();
}

function onWindowCloseClick(window_id) {
    $('#' + window_id).remove();
    delete window_dict[window_id];
    changeFocus();
}

function onMetricChange(window_id, event) {
    var window_obj = $('#' + window_id);
    var result_obj = window_dict[window_id].data.result_obj;
    var metric = event.currentTarget.value;

    window_dict[window_id].data.flamegraph_obj = undefined;
    window_obj.find('.flamegraph_time_ordered').prop('checked', false);

    if (metric in result_obj) {
        openFlameGraph(window_id, metric);
    } else {
        window_obj.find('.flamegraph_search').val('');
        window_obj.find('.flamegraph_search_results').hide();
        window_obj.find('.flamegraph_svg').hide();
        window_obj.find('.no_flamegraph').show();
    }
}

function onTimeOrderedChange(window_id, event) {
    var window_obj = $('#' + window_id);
    var flamegraph_obj = window_dict[window_id].data.flamegraph_obj;
    var result_obj = window_dict[window_id].data.result_obj;
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
    if (window_dict[window_id].being_resized) {
        if (window_dict[window_id].type === 'flame_graphs') {
            var flamegraph_obj = window_dict[window_id].data.flamegraph_obj;
            flamegraph_obj.width(window_obj.find('.flamegraph_svg').outerWidth());
            flamegraph_obj.update();
        } else if (window_dict[window_id].type === 'roofline' &&
                   window_dict[window_id].data.plot_config !== undefined) {
            window_obj.find('.roofline').html('');

            var plot_config = window_dict[window_id].data.plot_config;
            plot_config.width = window_obj.find('.roofline').outerWidth() - 10;
            plot_config.height = window_obj.find('.roofline').outerHeight() - 10;
            functionPlot(plot_config);
        }
        window_dict[window_id].being_resized = false;
    }
}

function onWindowResize(windows) {
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
            window_dict[window_id].being_resized = true;
        } else if (window_dict[window_id].type === 'roofline') {
            window_dict[window_id].being_resized = true;
            $(target).find('.roofline').html('');
        }
    }
}

// downloadFlameGraph() is based on https://stackoverflow.com/a/28226736
// (originally CC BY-SA 4.0, covered by GNU GPL v3 here)
function downloadFlameGraph(window_id) {
    var window_obj = $('#' + window_id);
    var flamegraph_obj = window_dict[window_id].data.flamegraph_obj;

    if (flamegraph_obj === undefined) {
        return;
    }

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
    windowStopPropagation(event);
    changeFocus(window_id);

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

    closeAllMenus(event, 'settings_block');
}

function onGeneralAnalysesClick(event) {
    var session = session_dict[$('#results_combobox').val()];
    var metrics_dict = session.general_metrics_dict;
    $('#general_analysis_menu_items').empty();

    for (const [k, v] of Object.entries(metrics_dict)) {
        $(`<div class="menu_item"
            onclick="onMenuItemClick(event, '${k}')">
             ${v.title}
           </div>`).appendTo('#general_analysis_menu_items');
    }

    $('#general_analysis_menu_block').css('top', event.clientY);
    $('#general_analysis_menu_block').css('left', event.clientX);
    $('#general_analysis_menu_block').outerHeight('auto');
    $('#general_analysis_menu_block').css('display', 'flex');

    event.preventDefault();
    event.stopPropagation();

    closeAllMenus(event, 'general_analysis_menu_block');
}
