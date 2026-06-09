// SPDX-FileCopyrightText: 2026 CERN
// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 *  This class represents a performance analysis session.
 */
class Session {
    /**
     *  Static dictionary storing all instances of a Session
     *  class under their IDs.
     *
     *  @static
     */
    static instances = {};

    /**
     *  Constructs a Session object, which is the main
     *  place for storing all information about a performance
     *  analysis session.
     *
     *  @constructor
     *  @param {String} id ID of a session as known by the server.
     *  @param {String} label Human-readable label of a session.
     */
    constructor(id, label) {
        this.id = id;
        this.label = label;
        Session.instances[id] = this;
    }

    /**
     *  Sends a request to the server side of Adaptyst Analyser.
     *  The request will be handled by the Python code of a
     *  corresponding Adaptyst Analyser module.
     *
     *  Use Window.sendRequest() to send requests if you can.
     *  Calling Session.sendRequest() is preferred only in case
     *  you don't have an eligible Window-inheriting object and
     *  don't want to create one.
     *
     *  @param {String} entity ID of an entity.
     *  @param {String} node ID of a node.
     *  @param {String} module Name of a module.
     *  @param {Object} data Data to be sent in form of JSON.
     *  @param done_func Function to be called when the request
     *  succeeds. The function must take exactly one argument
     *  which is the content returned by the server side.
     *  @param fail_func Function to be called when the request
     *  fails for any reason. The function must take exactly the
     *  arguments described in the "error" entry of "settings"
     *  in the jQuery.ajax() documentation
     *  [here](https://api.jquery.com/jQuery.ajax).
     *  @param {String} content_type Content type expected from
     *  the server side. Use one of the values explained in
     *  the "dataType" entry in "settings" in the jQuery.ajax
     *  documentation [here](https://api.jquery.com/jQuery.ajax).
     *  It can be undefined, this is then interpreted as 'json'.
     */
    sendRequest(entity, node, module, data, done_func, fail_func,
                content_type) {
        if (content_type == undefined) {
            content_type = 'json';
        }

        $.ajax({
            url: 'process/' + this.id + '/' + entity + '/' + node + '/' + module,
            method: 'POST',
            dataType: content_type,
            data: data
        }).done((data, status, xhr) => {
            done_func(data);
        }).fail(fail_func);
    }
}

/**
 *  This abstract class represents an internal window.
 *
 *  If you want to display a window in Adaptyst Analyser,
 *  you must implement a new class inheriting from this class
 *  and implementing its abstract methods.
 */
class Window {
    /**
     *  Static dictionary storing all instances of a Window
     *  class (or one of its subclasses) under their IDs as returned
     *  by `getId()`.
     *
     *  @static
     */
    static instances = {};

    /**
     *  Static dictionary storing all modules loaded in the client
     *  side of Adaptyst Analyser.
     *
     *  @static
     */
    static modules_loaded = {};

    /**
     *  Static variable storing an instance of Sigma for displaying
     *  a system graph of the current session.
     *
     *  @static
     */
    static system_graph_view = undefined;

    // Private, not meant to be used by any external code.
    static #current_focused_id = undefined;

    // Private, not meant to be used by any external code.
    static #largest_z_index = 0;

    // Private, not meant to be called by any external code.
    static onResize(windows) {
        for (const window of windows) {
            let target = window.target;

            if (target === null) {
                continue;
            }

            let window_id = $(target).attr('id');
            while (target !== null && !(window_id in Window.instances)) {
                target = target.parentElement;
                window_id = $(target).attr('id');
            }

            if (target === null) {
                continue;
            }

            if (Window.instances[window_id].#first_resize_call) {
                Window.instances[window_id].#first_resize_call = false;
            } else {
                if (!Window.isInCompactMode()) {
                    let position = $(target).position();

                    target.style.transform = '';
                    target.style.top = position.top + 'px';
                    target.style.left = position.left + 'px';
                }

                Window.instances[window_id].triggerResize();
            }
        }
    }

    /**
     *  Gets the path to the server folder where JavaScript
     *  and CSS dependencies of modules are stored. Use the
     *  value returned by this method for constructing
     *  URLs to the dependencies.
     *
     *  @return {String} Path to the folder with JavaScript
     *                   and CSS module dependencies.
     *
     *  @static
     */
    static getDepsPath() {
        return '/static/deps';
    }

    /**
     *  Stops further propagation of an event. It may be useful
     *  e.g. for handling mouse clicks.
     *
     *  @param {Object} event Event which propagation should be stopped.
     *
     *  @static
     */
    static stopPropagation(event) {
        if (event != undefined) {
            event.stopPropagation();
            event.preventDefault();
        }
    }

    /**
     *  Returns whether Adaptyst Analyser is run in compact mode.
     *
     *  @return {bool} Whether compact mode is enabled.
     *
     *  @static
     */
    static isInCompactMode() {
        return $('body').attr('data-compact') === '1';
    }

    /**
     *  Creates a window from a JSON-able dictionary produced by `serialize()`
     *  or an equivalent JSON string.
     *
     *  The resulting window object can be accessed in Window.instances
     *  using the ID stored in the JSON string under "id".
     *
     *  @static
     *  @param [json] A JSON-able dictionary produced by `serialize()` or
     *  an equivalent JSON string.
     *  @param {Function} [ready_handler] Function to be called
     *  when a window finishes loading. It should have zero parameters and
     *  no return value. This is not run if an error occurs. It can be
     *  undefined.
     */
    static deserialize(json, ready_handler) {
        let obj = typeof json == 'string' || json instanceof String ? JSON.parse(json) : json;

        let createWindow = window_class => {
            let session = undefined;

            if (obj.session != undefined) {
                if (obj.session in Session.instances) {
                    session = Session.instances[obj.session];
                } else {
                    session =
                        new Session(obj.session,
                                    $('#results_combobox').find(
                                        'option[value="' + obj.session + '"]').attr(
                                            'data-label'));
                }
            }

            let window_obj = new window_class(true, ...obj.constr);
            window_obj.init(window_obj, session,
                            obj.entity,
                            obj.analysable,
                            obj.module,
                            obj.init_data,
                            obj.x,
                            obj.y,
                            obj.dependencies,
                            obj.id, obj.width,
                            obj.height,
                            w => {
                                if (obj.data != undefined) {
                                    w._importData(obj.data);
                                }

                                w.#editTitle(obj.custom_title);

                                if (obj.collapsed && !Window.isInCompactMode()) {
                                    w.onVisibilityClick();
                                }

                                if (ready_handler != undefined) {
                                    ready_handler();
                                }
                            });
        };

        if (obj.module == undefined) {
            if (obj.type === 'link') {
                createWindow(LinkWindow);
            } else if (obj.type === 'settings') {
                createWindow(SettingsWindow);
            } else if (obj.type === 'open_arrangement') {
                createWindow(OpenArrangementWindow);
            } else {
                window.alert('Could not find window type ' + obj.type +
                             ' (no module is specified)!');
            }
        } else {
            import('./modules/' + obj.module + '/backend.js')
                .then(backend => {
                    if (!(obj.module in Window.modules_loaded)) {
                        $('<link type="text/css" rel="stylesheet" href="/static/' +
                          'modules/' + obj.module + '/backend.css" />').appendTo('head');
                        Window.modules_loaded[obj.module] = true;
                    }

                    let window_class = backend.getWindowClass(obj.type);

                    if (window_class == undefined) {
                        window.alert('Could not find window type ' + obj.type + ' in module ' +
                                     obj.module + '!');
                        return;
                    }

                    createWindow(window_class);
                }, () => {
                    window.alert('Could not load module ' + obj.module + '! ' +
                                 'Are you sure it is installed?');
                });
        }
    }

    // Private, should not be called by any external code.
    static sendArrgmtRequest(req_data, done_func, fail_func) {
        $.ajax({
            url: '/arrgmt',
            method: 'POST',
            dataType: 'json',
            data: req_data
        }).done((data, status, xhr) => {
            done_func(data, status);
        }).fail(fail_func);
    }

    #id;
    #session;
    #entity_id;
    #analysable_id;
    #data;
    #module_name;
    #being_resized;
    #collapsed;
    #last_focus;
    #dom;
    #first_resize_call;
    #loading_jquery;
    #setup_data;
    #min_height;
    #last_height;
    #content;
    #custom_title;
    #window_dependencies;
    #constructor_data;
    #ready_handler;
    #centered;

    /**
     *  Constructs a Window object. This doesn't do anything
     *  else, including displaying a window: you need to call
     *  `init()` for this unless the window is deserialized
     *  (i.e. created by Window.deserialize(), this will
     *  be indicated by the first argument to the subclass
     *  constructor set to true).
     *
     *  @constructor
     */
    constructor() {

    }

    /**
     *  Initialises a Window object and displays a window
     *  corresponding to the object. This function must
     *  be called by all subclasses from their constructor,
     *  with the first argument being JavaScript "this".
     *
     *  The method should not be overridden: otherwise,
     *  the serialising/deserialising feature won't work
     *  properly if at all.
     *
     *  @param {Object} [instance] A Window subclass object
     *  referred to by JavaScript "this" inside the subclass
     *  constructor.
     *  @param {Object} [session] `Session` object corresponding
     *  to a window. This is provided by a parameter of
     *  `createRootWindow()`. It can be undefined.
     *  @param {String} [entity_id] The ID of an entity corresponding
     *  to a window. This is provided by a parameter of
     *  `createRootWindow()`. It can be undefined.
     *  @param {String} [analysable_id] The ID of an analysable corresponding
     *  to a window. This is provided by a parameter of
     *  `createRootWindow()`. It can be undefined.
     *  @param {String} [module_name] The name of a module within
     *  a node corresponding to a window. It can be undefined.
     *  @param [data] Arbitrary data to be passed to `_setup()` and
     *  `getTitle()`. It can be undefined. If window serialisation should be
     *  supported, the provided value must be either undefined or serialisable
     *  to JSON.
     *  @param {float} [x] x-part of the initial upper-left corner
     *  position of a window. If undefined, the value of `y` will
     *  be ignored and the window will be centered. This is always
     *  ignored in the compact mode.
     *  @param {float} [y] y-part of the initial upper-left corner
     *  position of a window. If undefined, the value of `x` will
     *  be ignored and the window will be centered. This is always
     *  ignored in the compact mode.
     *  @param {Array} [window_dependencies] Array of all Window
     *  objects or string IDs this window depends on, e.g. for obtaining data.
     *  It can be undefined.
     *  @param {String} [custom_id] The ID to be assigned to a window.
     *  All whitespaces are automatically replaced with an underscore.
     *  Leave this undefined unless you know what you're doing.
     *  @param {float} [width] Width of a window. It cannot be smaller
     *  than the minimum width specified in the CSS stylesheet of the
     *  module. If undefined, the default value will be used. This is
     *  always ignored in the compact mode.
     *  @param {float} [height] Height of a window. It cannot be smaller
     *  than the minimum height specified in the CSS stylesheet of the
     *  module. If undefined, the default value will be used. This is
     *  always ignored in the compact mode.
     *  @param {Function} [ready_handler] Function to be called
     *  when a window finishes loading. It should have one parameter
     *  corresponding to the loaded Window subclass object and no return value.
     *  This is not run if an error occurs. It can be undefined.
     */
    init(instance, session, entity_id, analysable_id,
         module_name, data, x, y,
         window_dependencies, custom_id,
         width, height, ready_handler) {
        let index = 0;
        let id = undefined;

        if (custom_id == undefined) {
            if (session == undefined) {
                id = `w_${this.getType()}_${index}`.replace(/\s/g, '_');

                while (id in Window.instances) {
                    index++;
                    id = `w_${this.getType()}_${index}`.replace(/\s/g, '_');
                }
            } else {
                id = `w_${session.label}_${this.getType()}_${index}`.replace(/\s/g, '_');

                while (id in Window.instances) {
                    index++;
                    id = `w_${session.label}_${this.getType()}_${index}`.replace(/\s/g, '_');
                }
            }
        } else {
            id = custom_id.replace(/\s/g, '_');
        }

        Window.instances[id] = instance;

        this.#id = id;
        this.#session = session;
        this.#entity_id = entity_id;
        this.#analysable_id = analysable_id;
        this.#data = {};
        this.#constructor_data = data;
        this.#module_name = module_name;
        this.#being_resized = false;
        this.#collapsed = false;
        this.#last_focus = Date.now();
        this.#dom = this.#createWindowDOM(width, height);
        this.#custom_title = undefined;
        this.#ready_handler = ready_handler;

        if (window_dependencies != undefined &&
            window_dependencies.length > 0 &&
            (typeof window_dependencies[0] == 'string' ||
             window_dependencies[0] instanceof String)) {
            this.#window_dependencies = [];

            for (const s of window_dependencies) {
                if (!(s in Window.instances)) {
                    console.error("Could not find a window dependency with ID " + s + " " +
                                  "when constructing a window of type " + this.getType() + "!");
                    continue;
                }

                this.#window_dependencies.push(Window.instances[s]);
            }
        } else {
            this.#window_dependencies = window_dependencies;
        }

        if (!Window.isInCompactMode()) {
            if (x != undefined && y != undefined) {
                this.#dom.css('left', x + 'px');
                this.#dom.css('top', y + 'px');
                this.#centered = false;
            } else {
                this.#dom.css('top', '50%');
                this.#dom.css('left', '50%');
                this.#dom.css('transform', 'translate(-50%, -50%)');
                this.#centered = true;
            }
        } else {
            this.#centered = false;
        }

        this.#first_resize_call = true;
        new ResizeObserver(Window.onResize).observe(this.#dom[0]);

        if (data == undefined) {
            this.#setup({});
        } else {
            this.#setup(data);
        }
    }

    /**
     *  Gets a Window subclass object. This is equivalent to the
     *  "this"/"self" keyword in an object-oriented programming (OOP)
     *  language.
     *
     *  Please note that JavaScript's "this" is NOT equivalent
     *  and you should not rely on it unless you know the difference
     *  between JavaScript and an OOP language in handling the "this"
     *  keyword.
     */
    inst() {
        return Window.instances[this.#id];
    }

    /**
     *  Sends a request to the server side of Adaptyst Analyser.
     *  The request will be handled by the Python code of a
     *  corresponding Adaptyst Analyser module.
     *
     *  Use this function only if you have constructed your
     *  object with all of an entity ID, a node ID, and a module
     *  name.
     *
     *  @param {Object} data Data to be sent in form of JSON.
     *  @param done_func Function to be called when the request
     *  succeeds. The function must take exactly one argument
     *  which is a JSON object returned by the server side.
     *  @param fail_func Function to be called when the request
     *  fails for any reason. The function must take exactly the
     *  arguments described in the "error" entry of "settings"
     *  in the jQuery.ajax() documentation
     *  [here](https://api.jquery.com/jQuery.ajax).
     *  @param {String} content_type Content type expected from
     *  the server side. Use one of the values explained in
     *  the "dataType" entry in "settings" in the jQuery.ajax
     *  documentation [here](https://api.jquery.com/jQuery.ajax).
     *  It can be undefined, this is then interpreted as 'json'.
     */
    sendRequest(data, done_func, fail_func, content_type) {
        this.getSession().sendRequest(this.getEntityId(),
                                      this.getAnalysableId(),
                                      this.getModuleName(),
                                      data, done_func, fail_func,
                                      content_type);
    }

    /**
     *  Gets the last time a window was focused.
     *
     *  @return Last time a window was focused,
     *  as a number representing a Unix timestamp in
     *  milliseconds.
     */
    getLastFocusTime() {
        return this.#last_focus;
    }

    /**
     *  Gets the ID of a window.
     *
     *  @return {String} ID of a window.
     */
    getId() {
        return this.#id;
    }

    /**
     *  Gets the entity ID of a window. It can be
     *  undefined.
     *
     *  @return {String} Entity ID of a window.
     */
    getEntityId() {
        return this.#entity_id;
    }

    /**
     *  Gets the ID of the analysable of a window. It can be
     *  undefined.
     *
     *  @return {String} ID of the analysable of a window.
     */
    getAnalysableId() {
        return this.#analysable_id;
    }

    /**
     *  Gets the module name of a window. It can be
     *  undefined.
     *
     *  @return {String} Module name of a window.
     */
    getModuleName() {
        return this.#module_name;
    }

    /**
     *  Gets the dictionary of a window. It can be
     *  filled with arbitrary data.
     *
     *  @return {Object} Dictionary of a window.
     */
    getData() {
        return this.#data;
    }

    /**
     *  Gets the performance session a window is part of.
     *
     *  @return {Object} Session of a window.
     */
    getSession() {
        return this.#session;
    }

    /**
     *  Gets the type of a window. This is used in the ID
     *  of a window, an HTML class of the window
     *  (i.e. `<type>_window`), and an HTML class of
     *  the window content (i.e. `<type>_content`).
     *
     *  @abstract
     *  @return {String} Type of a window.
     */
    getType() {
        throw new Error('This is an abstract method!');
    }

    // Private, not meant to be called by any external code.
    #getProcessedContentObject() {
        let content = $(this.getContentCode());

        // SVGs below are from Google Material Icons, licensing:
        // SPDX-FileCopyrightText: Google
        // SPDX-License-Identifier: Apache-2.0

        // ************************
        let setUpIcon = (target, code) => {
            let obj = content.find('[data-icon="' + target + '"]');
            let path = $(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
            path.attr('d', code);
            obj.append(path);
            obj.attr('xmlns', '');
            obj.attr('viewBox', '0 -960 960 960');
        };

        setUpIcon('general', 'M280-280h80v-200h-80v200Zm320 0h80v-400h-80v400Zm-160 0h80v-120h-80v120Zm0-200h80v-80h-80v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z');
        setUpIcon('warning', 'm40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z');
        setUpIcon('replace', 'M164-560q14-103 91.5-171.5T440-800q59 0 110.5 22.5T640-716v-84h80v240H480v-80h120q-29-36-69.5-58T440-720q-72 0-127 45.5T244-560h-80Zm620 440L608-296q-36 27-78.5 41.5T440-240q-59 0-110.5-22.5T240-324v84h-80v-240h240v80H280q29 36 69.5 58t90.5 22q72 0 127-45.5T636-480h80q-5 36-18 67.5T664-352l176 176-56 56Z');
        setUpIcon('download', 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z');
        setUpIcon('delete', 'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z');
        setUpIcon('copy', 'M120-220v-80h80v80h-80Zm0-140v-80h80v80h-80Zm0-140v-80h80v80h-80ZM260-80v-80h80v80h-80Zm100-160q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480Zm40 240v-80h80v80h-80Zm-200 0q-33 0-56.5-23.5T120-160h80v80Zm340 0v-80h80q0 33-23.5 56.5T540-80ZM120-640q0-33 23.5-56.5T200-720v80h-80Zm420 80Z');
        // ************************
        return content;
    }

    /**
     *  Gets the content of a window in form of an HTML code.
     *
     *  Window header and border rendering along with basic window
     *  operations except resizing is fully handled by Adaptyst
     *  Analyser and you shouldn't implement it yourself. Resizing
     *  is partially handled by Adaptyst Analyser and should also
     *  not be implemented here, see `startResize()` and
     *  `finishResize()` instead.
     *
     *  A padding of 5 pixels is applied to the content of
     *  all windows in Adaptyst Analyser.
     *
     *  @abstract
     *  @return {String} HTML code of the content of a window.
     */
    getContentCode() {
        throw new Error('This is an abstract method!');
    }

    /**
     *  Gets the content of a window in form of a jQuery object.
     *  The return value of this function is based on your implementation
     *  of `getContentCode()`.
     *
     *  @return {Object} jQuery object representing the content of a window.
     */
    getContent() {
        if (this.#content == undefined) {
            this.#content = this.#dom.find('.window_content');
        }

        return this.#content;
    }

    // Private, not meant to be called by any external code.
    #createWindowDOM(width, height) {
        const window_header = `
<div class="window_header">
  <span class="window_title"></span>
  <div class="window_buttons">
  <!-- This SVG is from Google Material Icons, licensing:
       SPDX-FileCopyrightText: Google
       SPDX-License-Identifier: Apache-2.0 -->
  <svg xmlns="http://www.w3.org/2000/svg" class="window_refresh" height="24px"
       viewBox="0 -960 960 960" width="24px" onmousedown="Window.stopPropagation(event)">
    <title>Reset/Refresh contents</title>
    <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100
             70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/>
  </svg>
  <!-- This SVG is from Google Material Icons, licensing:
       SPDX-FileCopyrightText: Google
       SPDX-License-Identifier: Apache-2.0 -->
  <svg id="share" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" height="24px" width="24px"
   class="window_share" onclick="">
     <title>Share window</title>
     <path d="M684-80q-48.33 0-82.17-33.83Q568-147.67 568-196q0-7.33 4.33-32l-293-171.33q-16.18 16.56-37.42 25.94Q220.67-364 196-364q-48.33 0-82.17-33.67Q80-431.33 80-480t33.83-82.33Q147.67-596 196-596q24 0 45 9.03T278-562l294.33-170q-2-7.67-3.16-15.5Q568-755.33 568-764q0-48.33 33.83-82.17Q635.67-880 684-880t82.17 33.83Q800-812.33 800-764t-33.83 82.17Q732.33-648 684-648q-23.52 0-44.09-8.83-20.58-8.84-36.58-23.84L307-513.33q2.67 7.66 3.83 16.16 1.17 8.5 1.17 16.84 0 8.33-.83 15.5-.84 7.16-2.84 14.83L604-280q16-15 36.4-23.5 20.39-8.5 43.7-8.5 48.57 0 82.23 33.83Q800-244.33 800-196t-33.83 82.17Q732.33-80 684-80Zm.02-66.67q20.98 0 35.15-14.19 14.16-14.19 14.16-35.16 0-20.98-14.19-35.15-14.19-14.16-35.16-14.16-20.98 0-35.15 14.19-14.16 14.19-14.16 35.16 0 20.98 14.19 35.15 14.19 14.16 35.16 14.16Zm-488-284q20.98 0 35.15-14.19 14.16-14.19 14.16-35.16 0-20.98-14.19-35.15-14.19-14.16-35.16-14.16-20.98 0-35.15 14.19-14.16 14.19-14.16 35.16 0 20.98 14.19 35.15 14.19 14.16 35.16 14.16Zm523.15-298.19q14.16-14.19 14.16-35.16 0-20.98-14.19-35.15-14.19-14.16-35.16-14.16-20.98 0-35.15 14.19-14.16 14.19-14.16 35.16 0 20.98 14.19 35.15 14.19 14.16 35.16 14.16 20.98 0 35.15-14.19ZM684-196ZM196-480Zm488-284Z"/>
  </svg>
  <!-- This SVG is from Google Material Icons, licensing:
       SPDX-FileCopyrightText: Google
       SPDX-License-Identifier: Apache-2.0 -->
  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960"
       width="24px" class="window_edit_title" onmousedown="Window.stopPropagation(event)">
    <title>Edit title</title>
    <path d="M160-400v-80h280v80H160Zm0-160v-80h440v80H160Zm0-160v-80h440v80H160Zm360 560v-123l221-220q9-9 20-13t22-4q12 0 23 4.5t20 13.5l37 37q8 9 12.5 20t4.5 22q0 11-4 22.5T863-380L643-160H520Zm300-263-37-37 37 37ZM580-220h38l121-122-18-19-19-18-122 121v38Zm141-141-19-18 37 37-18-19Z"/>
  </svg>
  <!-- This SVG is from Google Material Icons, licensing:
       SPDX-FileCopyrightText: Google
       SPDX-License-Identifier: Apache-2.0 -->
  <svg xmlns="http://www.w3.org/2000/svg" class="window_visibility" height="24px"
       viewBox="0 -960 960 960" width="24px" onmousedown="Window.stopPropagation(event)">
    <title>Toggle visibility</title>
    <path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45
             31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54
             137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"/>
  </svg>
  <!-- This SVG is from Google Material Icons, licensing:
       SPDX-FileCopyrightText: Google
       SPDX-License-Identifier: Apache-2.0 -->
  <svg xmlns="http://www.w3.org/2000/svg" class="window_close" height="24px"
       viewBox="0 -960 960 960" width="24px" onmousedown="Window.stopPropagation(event)">
    <title>Close</title>
    <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>
  </svg>
  </div>
</div>
`;

        let root = $('<div></div>');
        root.attr('class', 'window ' + this.getType() + '_window');

        let header = $(window_header);
        header.attr('id', this.#id + '_header');

        root.append(header);

        let content = $('<div></div>');
        content.attr('class', 'window_content ' + this.getType() + '_content');
        content.html(this.#getProcessedContentObject());

        root.append(content);

        root.attr('id', this.#id);

        if (Window.isInCompactMode()) {
            header.attr('onclick', `Window.instances['${this.#id}'].focus()`);
            header.attr('onauxclick', `Window.instances['${this.#id}'].onAuxClick(event)`);
        } else {
            root.attr('onclick', `Window.instances['${this.#id}'].focus()`);
            root.attr('onmouseup', `Window.instances['${this.#id}'].onMouseUp()`);
            root.find('.window_header').attr('onmousedown', `Window.instances['${this.#id}'].startDrag(event)`);
        }

        root.find('.window_refresh').attr(
            'onclick', `Window.instances['${this.#id}'].onRefreshClick(event)`);
        root.find('.window_share').attr(
            'onclick', `Window.instances['${this.#id}'].onShareClick(event)`);
        root.find('.window_visibility').attr(
            'onclick', `Window.instances['${this.#id}'].onVisibilityClick(event)`);
        root.find('.window_edit_title').attr(
            'onclick', `Window.instances['${this.#id}'].onEditTitleClick(event)`);
        root.find('.window_close').attr(
            'onclick', `Window.instances['${this.#id}'].close(event)`);

        if (width != undefined) {
            root.css('width', width + 'px');
        }

        if (height != undefined) {
            root.css('height', height + 'px');
        }

        return root;
    }

    // Private, not meant to be called by any external code.
    onAuxClick(event) {
        if (event.button === 1) {
            this.close(event);
        }
    }

    // Private, not meant to be called by any external code.
    #editTitle(new_title) {
        if (new_title == undefined || new_title === '') {
            return;
        }

        if (this.#session == undefined || Window.isInCompactMode()) {
            $('#' + this.#id + '_header').find('.window_title').text(new_title);
            $('#' + this.#id + '_header').attr('title', new_title);
        } else {
            $('#' + this.#id + '_header').find('.window_title').text(
                '[Session: ' + this.#session.label + '] ' +
                    new_title);
            $('#' + this.#id + '_header').attr('title',
                                               '[Session: ' +
                                               this.#session.label +
                                               '] ' +
                                               new_title);
        }

        this.#custom_title = new_title;
    }

    // Private, not meant to be called by any external code.
    onShareClick(event) {
        Window.stopPropagation(event);

        let getName = () => {
            return window.prompt(
                "You're about to save the single window/tab (along with its dependencies) for " +
                    "opening later or sharing with others using the same Adaptyst Analyser instance.\n\n" +
                    "This is called a single window arrangement: it is defined as your chosen window/tab, " +
                    "its dependencies if any, and " +
                    "the session formally associated with the " +
                    "window/tab if any.\n\n" +
                    "The window/tab content is also saved if the content export is supported by a corresponding module.\n\n" +
                    "What name would you like to give to your arrangement? It must not be empty.");
        };

        let name = getName();

        if (name == undefined || name === "") {
            return;
        }

        this.#dom.find('.window_share').addClass('disabled');
        this.#dom.find('.window_share').attr('onclick', '');
        this.showLoading();

        Window.sendArrgmtRequest({
            'type': 'check_name',
            'name': name
        }, (data, status) => {
            if (data.exists) {
                window.alert('The arrangement "' + name + '" already exists!');
                this.#dom.find('.window_share').removeClass('disabled');
                this.#dom.find('.window_share').attr('onclick', `Window.instances['${this.#id}'].onShareClick(event)`);
                this.hideLoading();
                return;
            }

            let session_id = this.#session != undefined ? this.#session.id : undefined;
            let windows = {};

            let cur_x = 10;
            let cur_y = 10;

            let cur_dependencies = new Set(this.getDependencyObjects());
            let all_dependencies = new Set(cur_dependencies);

            while (cur_dependencies.size > 0) {
                let new_dependencies = new Set();

                for (const d of cur_dependencies) {
                    for (const wd of d.getDependencyObjects()) {
                        new_dependencies.add(wd);
                    }
                }

                for (const d of new_dependencies) {
                    all_dependencies.add(d);
                }

                cur_dependencies = new_dependencies;
            }

            let instances = Array.from(all_dependencies);
            instances.sort((a, b) => {
                return a.getLastFocusTime() - b.getLastFocusTime();
            });

            for (const w of instances) {
                windows[w.getId()] = w.serialize(cur_x, cur_y, true);

                cur_x += 20;
                cur_y += 20;
            }

            let arrangement = {
                "session": session_id,
                "main_window": this.serialize(cur_x, cur_y),
                "other_windows": windows
            };

            Window.sendArrgmtRequest({
                'type': 'save',
                'name': name,
                'data': JSON.stringify(arrangement)
            }, (data, status) => {
                window.prompt('The arrangement "' + name + '" has been ' +
                              'saved successfully!\n\n' +
                              "Here's the auth token for changing the " +
                              "arrangement name or deleting the arrangement. " +
                              "You'll see it only once, save it in a safe place.",
                              data.token);

                this.#dom.find('.window_share').removeClass('disabled');
                this.#dom.find('.window_share').attr('onclick', `Window.instances['${this.#id}'].onShareClick(event)`);
                this.hideLoading();

                new LinkWindow(false, undefined, undefined, undefined, undefined, {
                    'arrgmt': data.id,
                    'name': name,
                    'compact': true,
                    'hide_header': true,
                    'hide_footer': true
                });
            }, (xhr, txt, error) => {
                window.alert('The arrangement "' + name + '" could not be saved ' +
                             'due to an error! (save stage, ' +
                             'error type: ' + txt + '/"' + error + '"/' + xhr.status + ')');

                this.#dom.find('.window_share').removeClass('disabled');
                this.#dom.find('.window_share').attr('onclick', `Window.instances['${this.#id}'].onShareClick(event)`);
                this.hideLoading();
            });
        }, (xhr, txt, error) => {
            window.alert('The arrangement "' + name + '" could not be saved ' +
                         'due to an error! (check name stage, ' +
                         'error type: ' + txt + '/"' + error + '"/' + xhr.status + ')');

            this.#dom.find('.window_share').removeClass('disabled');
            this.#dom.find('.window_share').attr('onclick', `Window.instances['${this.#id}'].onShareClick(event)`);
            this.hideLoading();
        });

        this.#dom.find('.window_share').removeClass('disabled');
        this.#dom.find('.window_share').attr('onclick', `Window.instances['${this.#id}'].onShareClick(event)`);
        this.hideLoading();
    }

    // Private, not meant to be called by any external code.
    onEditTitleClick(event) {
        Window.stopPropagation(event);

        let title = undefined;

        if (Window.isInCompactMode()) {
            title = window.prompt('Enter a new title for the window.',
                                  this.getCurrentTitle());
        } else {
            title = window.prompt('Enter a new title for the window. ' +
                                  'The session prefix will remain ' +
                                  'unchanged if present.',
                                  this.getCurrentTitle());
        }

        this.#editTitle(title);
    }

    /**
     *  Downloads a given SVG object in a window as an SVG file.
     *
     *  @param {String} [class_name] The class name of an SVG object.
     *  It is expected that the object has a unique class name within
     *  the window. Otherwise, the behaviour is undefined.
     *  @param {String} [css] The path to a CSS stylesheet to be
     *  applied to the SVG before downloading.
     */
    downloadSvg(class_name, css) {
        $.ajax({
            url: css,
            method: 'GET',
            dataType: 'text'
        }).done(res => {
            let svg = this.getContent().find('.' + class_name).children()[0].cloneNode(true);

            let style = document.createElement('style');
            style.innerHTML = res;
            svg.insertBefore(style, svg.firstChild);

            let data = document.createElement('a');
            data.download = 'flamegraph.svg';
            data.href = 'data:image/svg+xml;charset=utf-8,' +
                encodeURIComponent((new XMLSerializer()).serializeToString(svg));
            data.addEventListener('click', event => {
                event.stopPropagation();
            });
            data.click();
        }).fail(res => {
            window.alert('Could not download a stylesheet for the SVG!');
        });
    }

    /**
     *  Focuses a window.
     */
    focus() {
        let window_header = $('#' + this.#id + '_header');
        let window_buttons = window_header.find('.window_buttons');

        if (Window.#current_focused_id !== this.#id) {
            if (Window.isInCompactMode()) {
                this.#first_resize_call = true;

                $('#footer_text').hide();

                let current_content = $('#block').children();
                current_content.hide();
                this.#dom.show();

                if (this.#being_resized) {
                    this.finishResize();
                    this.#being_resized = false;
                }

                $('head').find('title').text('Adaptyst Analyser: ' +
                                             this.getCurrentTitle());
            } else {
                if (Window.#largest_z_index >= 10000) {
                    let z_index_arr = [];

                    for (const w of Object.values(Window.instances)) {
                        z_index_arr.push({'index': w.getZIndex(),
                                          'id': w.getId()});
                    }

                    z_index_arr.sort((a, b) => {
                        if (a.index == undefined) {
                            return -1;
                        } else if (b.index == undefined) {
                            return 1;
                        } else {
                            return a.index - b.index;
                        }
                    });

                    let index = 1;
                    for (const obj of z_index_arr) {
                        $('#' + obj.id).css('z-index', index);
                        index += 1;
                    }

                    this.#dom.css('z-index', index);
                    Window.#largest_z_index = index;
                } else {
                    Window.#largest_z_index += 1;
                    this.#dom.css('z-index', Window.#largest_z_index);
                }
            }

            window_header.css('background-color', 'black');
            window_header.css('color', 'white');
            window_header.css('fill', 'white');

            window_buttons.css('background-color', 'black');
            window_buttons.css('color', 'white');
            window_buttons.css('fill', 'white');
            window_buttons.css('border-left-color', 'white');

            for (const w of Object.values(Window.instances)) {
                if (w.getId() !== this.getId()) {
                    w.unfocus();
                }
            }

            Window.#current_focused_id = this.getId();
            this.#last_focus = Date.now();
        }
    }

    /**
     *  Unfocuses a window.
     */
    unfocus() {
        let unfocused_header = $('#' + this.#id + '_header');
        let unfocused_buttons = unfocused_header.find('.window_buttons');

        unfocused_header.css('background-color', 'lightgray');
        unfocused_header.css('color', 'black');
        unfocused_header.css('fill', 'black');

        unfocused_buttons.css('background-color', 'lightgray');
        unfocused_buttons.css('color', 'black');
        unfocused_buttons.css('fill', 'black');
        unfocused_buttons.css('border-left-color', 'black');

        if (Window.#current_focused_id === this.#id) {
            Window.#current_focused_id = undefined;
        }
    }

    // Private, not meant to be called by any external code.
    onMouseUp() {
        if (this.#being_resized) {
            this.finishResize();
            this.#being_resized = false;
        }
    }

    /**
     *  Triggers window resizing event-wise.
     */
    triggerResize() {
        if (this.#being_resized) {
            return;
        }

        if (Window.isInCompactMode()) {
            if (this.startResize()) {
                if (Window.#current_focused_id === this.#id) {
                    this.finishResize();
                } else {
                    this.#being_resized = true;
                }
            }
        } else {
            this.#being_resized = this.startResize();
        }
    }

    /**
     *  Called when a user starts resizing a window.
     *
     *  @abstract
     *  @return {bool} Whether finishResize() should be
     *  called after resizing is complete.
     */
    startResize() {
        throw new Error('This is an abstract method!');
    }

    /**
     *  Called when a user finishes resizing a window.
     *
     *  @abstract
     */
    finishResize() {
        throw new Error('This is an abstract method!');
    }

    // Private, not meant to be called by any external code.
    startDrag(event) {
        Window.stopPropagation(event);
        this.focus();

        let dragged = document.getElementById(this.#id);
        let startX = event.offsetX;
        let startY = event.offsetY;

        $('body').mousemove(event => {
            event.stopPropagation();
            event.preventDefault();
            let newX = event.pageX - startX;
            let newY = event.pageY - startY;
            let dragged_rect = dragged.getBoundingClientRect();

            this.#centered = false;
            dragged.style.transform = '';
            dragged.style.left = newX + 'px';
            dragged.style.top = newY + 'px';
        });

        $('body').mouseup(event => {
            $('body').off('mousemove');
            $('body').off('mouseup');
        });
    }

    // Private, not meant to be called by any external code.
    onRefreshClick(event) {
        Window.stopPropagation(event);

        if (Window.isInCompactMode()) {
            this.focus();
        }

        this.prepareRefresh(this.#setup_data);

        this.#dom.find('.window_content').html(this.#getProcessedContentObject());
        this.#setup();
    }

    /**
     *  Gets the value of the z-index CSS property of a window.
     *
     *  @return Value of z-index of a window.
     */
    getZIndex() {
        return this.#dom.css('z-index');
    }

    /**
     *  Called when a user refreshes a window, before the proper
     *  refresh process with the content resetup takes place.
     *
     *  The old window content is still available when this
     *  method is called.
     *
     *  @abstract
     *  @param data Arbitrary data that have been passed to the
     *  constructor and will be available in _setup(), e.g. a dictionary.
     */
    prepareRefresh(data) {
        throw new Error('This is an abstract method!');
    }

    /**
     *  Called when a user closes a window, before it is actually
     *  closed.

     *  @abstract
     */
    prepareClose() {
        throw new Error('This is an abstract method!');
    }

    /**
     *  Shows the loading indicator in a window.
     */
    showLoading() {
        if (this.#loading_jquery == undefined) {
            this.#loading_jquery = $('#loading').clone();
            this.#loading_jquery.removeAttr('id');
            this.#loading_jquery.attr('class', 'loading');
            this.#loading_jquery.prependTo(this.#dom.find('.window_content'));
            this.#loading_jquery.show();
            $('#' + this.#id + '_header').find('.window_refresh').addClass('disabled');
            $('#' + this.#id + '_header').find('.window_share').addClass('disabled');
            $('#' + this.#id + '_header').find('.window_refresh').attr('onclick', '');
            $('#' + this.#id + '_header').find('.window_share').attr('onclick', '');
        }
    }

    /**
     *  Hides the loading indicator in a window.
     */
    hideLoading() {
        if (this.#loading_jquery != undefined) {
            this.#loading_jquery.remove();
            this.#loading_jquery = undefined;

            $('#' + this.#id + '_header').find('.window_refresh').removeClass('disabled');
            $('#' + this.#id + '_header').find('.window_share').removeClass('disabled');
            $('#' + this.#id + '_header').find('.window_refresh').attr('onclick',
                                                                       `Window.instances['${this.#id}'].onRefreshClick(event)`);
            $('#' + this.#id + '_header').find('.window_share').attr('onclick',
                                                                     `Window.instances['${this.#id}'].onShareClick(event)`);

            if (this.#ready_handler != undefined) {
                this.#ready_handler(this.inst());
                this.#ready_handler = undefined;
            }
        }
    }

    // Private, not meant to be called by any external code.
    #setup(data) {
        let existing_window = false;

        if (data == undefined) {
            data = this.#setup_data;
            existing_window = true;
        }

        if (this.#custom_title == undefined) {
            let title = undefined;

            if (this.#session == undefined || Window.isInCompactMode()) {
                title = this.getTitle(data);
            } else {
                title = '[Session: ' + this.#session.label + '] ' +
                    this.getTitle(data);

            }

            let header = existing_window ? $('#' + this.#id + '_header') :
                this.#dom.find('.window_header');

            header.find('.window_title').text(title);
            header.attr('title', title);
        }

        this.showLoading();

        if (!existing_window) {
            if (Window.isInCompactMode()) {
                $('#tabs_content').append(this.#dom.find('.window_header'));
                $('#tabs').prop('scrollLeft', $('#tabs').prop('scrollWidth'));
                this.#dom.css('height', '100%');
                this.#dom.css('width', '100%');

                $('#graph').hide();
                $('#block').append(this.#dom);
            } else {
                this.#dom.appendTo('body');
            }

            this.focus();
        }

        this.#setup_data = data;
        this._setup(data, existing_window);
    }

    /**
     *  Gets the expected title of a window. A user is free
     *  to change it by using the "edit title" feature.
     *
     *  @param [data] Arbitrary data passed to the constructor, e.g.
     *  a dictionary.
     *
     *  @abstract
     *  @return {String} Expected title of a window.
     */
    getTitle(data) {
        throw new Error('This is an abstract method!');
    }

    /**
     *  Gets the title of a window.
     *
     *  @return {String} Title of a window.
     */
    getCurrentTitle() {
        if (this.#custom_title == undefined) {
            return this.getTitle(this.#constructor_data);
        } else {
            return this.#custom_title;
        }
    }

    /**
     *  Sets up a window. This is always called when the window is opened or
     *  refreshed. Use `getContent()` to get a jQuery object for manipulating
     *  the window content.
     *
     *  **Important:** This function must call `hideLoading()` at some point.
     *  Otherwise, there will be a loading indicator in the window instead
     *  of a desired content.
     *
     *  @abstract
     *  @param data Arbitrary data passed to the constructor, e.g.
     *  a dictionary.
     *  @param {bool} existing_window Whether a window is already displayed.
     */
    _setup(data, existing_window) {
        throw new Error('This is an abstract method!');
    }

    /**
     *  Gets an array containing the ID strings of all windows this window
     *  depends on, e.g. for obtaining data.
     *
     *  This method returns an empty array if no window dependencies
     *  have been provided in the constructor.
     *
     *  undefined should never be returned.
     *
     *  @return {Array} Array of window dependencies in form of ID strings.
     */
    getDependencies() {
        if (this.#window_dependencies == undefined) {
            return [];
        }

        let array = [];

        for (const w of this.#window_dependencies) {
            array.push(w.getId());
        }

        return array;
    }

    /**
     *  Same as `getDependencies()`, but an array of Window objects
     *  is returned instead of an array of window ID strings.
     *
     *  @return {Array} Array of window dependencies in form of Window
     *  objects.
     */
    getDependencyObjects() {
        if (this.#window_dependencies == undefined) {
            return [];
        }

        return this.#window_dependencies;
    }

    /**
     *  Serialises the window so that it can be reconstructed
     *  later using `Window.deserialize()`. This is useful e.g.
     *  for saving the window for opening later or sharing with
     *  other users of the same Adaptyst Analyser instance.
     *
     *  The return format is a JSON-able dictionary in the following form:
     *  ```
     *  {
     *    "id": <window ID: always present>,
     *    "module": <module name: not always present>,
     *    "type": <window type: always present>,
     *    "constr": <array of arguments to be passed to the window constructor: always present>,
     *    "session": <session ID: not always present>,
     *    "entity": <entity ID: not always present>,
     *    "analysable": <ID of analysable: not always present>,
     *    "init_data": <arbitrary data passed to _setup() and getTitle(): not always present>,
     *    "x": <x-part of the initial upper-left corner position of the window: not always present>,
     *    "y": <y-part of the initial upper-left corner position of the window: not always present>,
     *    "dependencies": <window dependencies as returned by getDependencies(): always present>,
     *    "collapsed": <whether the window is collapsed: always present>,
     *    "custom_title": <custom title if any: not always present>,
     *    "data": <window data returned by _exportData(): not always present>
     *  }
     *  ```
     *
     *  You should not assume that `Window.deserialize()` will be always called
     *  in the standard mode only or in the compact mode only.
     *
     *  @param {int} [x] x-part of the initial upper-left corner position
     *  of the window in case it cannot be extracted automatically (e.g.
     *  due to being in the compact mode). If undefined, the window will
     *  be centered in a screen when deserialised unless the coordinate
     *  can be obtained automatically.
     *  @param {int} [y] y-part of the initial upper-left corner position
     *  of the window in case it cannot be extracted automatically (e.g.
     *  due to being in the compact mode). If undefined, the window will
     *  be centered in a screen when deserialised unless the coordinate
     *  can be obtained automatically.
     *  @param {bool} [collapsed] Whether the window should be serialised
     *  in the collapsed state. If undefined, the current collapsed status
     *  will be used instead (which is always false if the compact mode is on).
     *  @return Window serialised in form of a JSON-able dictionary.
     */
    serialize(x, y, collapsed) {
        if (!Window.isInCompactMode()) {
            if (this.#centered) {
                x = undefined;
                y = undefined;
            } else {
                let x_tmp = Number.parseFloat(this.#dom.css('left'));
                let y_tmp = Number.parseFloat(this.#dom.css('top'));

                if (!isNaN(x_tmp) && !isNaN(y_tmp)) {
                    x = x_tmp;
                    y = y_tmp;
                }
            }
        }

        return {
            "id": this.#id,
            "module": this.#module_name,
            "type": this.getType(),
            "constr": this.getConstructorArgs(),
            "session": this.#session != undefined ? this.#session.id : undefined,
            "entity": this.#entity_id,
            "analysable": this.#analysable_id,
            "init_data": this.#constructor_data,
            "x": x,
            "y": y,
            "dependencies": this.getDependencies(),
            "collapsed": collapsed != undefined ? collapsed : (
                Window.isInCompactMode() ? false : this.#collapsed),
            "custom_title": this.#custom_title,
            "data": this._exportData(),
            "width": Window.isInCompactMode() ? undefined : this.#dom.outerWidth(),
            "height": Window.isInCompactMode() ? undefined :
                (this.#collapsed ? this.#last_height : this.#dom.outerHeight())
        };
    }

    /**
     *  Gets the array of arguments passed to the constructor (not init()) except for
     *  the first argument indicating whether the window is being deserialised. This is
     *  useful for serialising/deserialising a window.
     *
     *  The default implementation returns an empty array. undefined should
     *  never be returned.
     *
     *  @return Array of constructor arguments, starting from the second one.
     */
    getConstructorArgs() {
        return [];
    }

    /**
     *  Returns window content data to be used by `serialize()`.
     *  The extent to which the contents are saved in `_exportData()`
     *  is decided by your implementation.
     *
     *  When `Window.deserialize()` is called with a dictionary
     *  produced by `serialize()`, the part there generated by
     *  `_exportData()` is passed to `_importData()` to restore the window.
     *
     *  There are no specific guidelines on the format of the return data
     *  as long as it is JSON-compatible and accepted by the implementation
     *  of `_importData()`.
     *
     *  The default implementation returns undefined. You should override
     *  this method if you want a different behaviour.
     *
     *  @return Serialised content data of the window.
     */
    _exportData() {
        return undefined;
    }

    /**
     *  Restores the window content using data produced by `_exportData()`. This
     *  is used by `Window.deserialize()`, called e.g. when a user opens
     *  a window arrangement saved by another user of the same Adaptyst
     *  Analyser instance.
     *
     *  If used, this is guaranteed to be called after the window
     *  is constructed and `_setup()` is executed.
     *
     *  The default implementation does nothing. You should override
     *  this method if you want a different behaviour.
     *
     *  @param [data] Serialised content data of the window to be restored.
     */
    _importData(data) {

    }

    // Private, not meant to be called by any external code.
    close(event) {
        Window.stopPropagation(event);

        this.prepareClose();

        $('#' + this.#id + '_header').remove();
        this.#dom.remove();

        delete Window.instances[this.#id];

        if (Window.#current_focused_id === this.#id) {
            Window.#current_focused_id = undefined;
        }

        let keys = Object.keys(Window.instances);

        if (keys.length === 0) {
            if (Window.isInCompactMode()) {
                openSystemGraph();
            }

            return;
        }

        keys.sort((a, b) => {
            return Window.instances[b].getLastFocusTime() - Window.instances[a].getLastFocusTime();
        });

        Window.instances[keys[0]].focus();
    }

    // Private, not meant to be called by any external code.
    onVisibilityClick(event) {
        Window.stopPropagation(event);

        let window_content = this.#dom.find('.window_content');
        let window_header = $('#' + this.#id + '_header');

        if (!this.#collapsed) {
            let position = this.#dom.position();

            this.#dom.css('transform', '');
            this.#dom.css('left', position.left);
            this.#dom.css('top', position.top);

            this.#collapsed = true;
            this.#min_height = this.#dom.css('min-height');
            this.#last_height = this.#dom.outerHeight();
            this.#dom.css('min-height', '0');
            this.#dom.css('resize', 'horizontal');
            this.#dom.css('height', window_header.outerHeight() + 'px');
        } else {
            this.#collapsed = false;
            this.#dom.css('height', this.#last_height + 'px');
            this.#dom.css('min-height', this.#min_height);
            this.#dom.css('resize', 'both');
            this.#dom.css('opacity', '');
        }
    }
}

/**
 *  This class contains static methods for managing menus.
 *  It is not meant to be constructed.
 *
 *  **Only one menu can be open at a time.**
 */
class Menu {
    /**
     *  Creates and displays a menu.
     *
     *  If you want to refer to the menu block in CSS, use
     *  .<name_prefix>_menu.
     *
     *  @static
     *  @param {String} [name_prefix] Prefix to use for the menu
     *  block class in CSS.
     *  @param {int} [x] x-part of the upper-left corner position
     *  of a menu.
     *  @param {int} [y] y-part of the upper-left corner position
     *  of a menu.
     *  @param {Array} [options] Array of menu items of type
     *  `[k, v]`, where `k` is the label of a menu item to be
     *  displayed and `v` is of form `[<arbitrary data>,
     *  <click event handler>]`. Click event handlers must
     *  accept `event` (corresponding to a JavaScript
     *  click event object) as the first argument. `<arbitrary
     *  data>` will be accessible in a click handler through
     *  `event.data.data`.
     *  @param {bool} [html] Whether option texts should be
     *  treated as an HTML code. This is false by default.
     */
    static createMenu(name_prefix, x, y, options, html) {
        if (name_prefix.includes('"') || name_prefix.includes(' ')) {
            window.alert('Illegal characters in ' +
                         'name_prefix in createMenu()!');
            return;
        }

        let menu = $('<div id="menu" class="menu_block ' + name_prefix + '_menu"></div>');
        let first = true;

        for (const [k, v] of options) {
            let item = $('<div></div>');

            if (first) {
                item.addClass('menu_item_first');
                first = false;
            } else {
                item.addClass('menu_item');
            }

            item.addClass('menu_item_with_hover');

            item.on('click', {
                'data': v[0],
                'handler': v[1]
            }, event => {
                Window.stopPropagation(event);
                Menu.closeMenu();

                if (event.data.handler != undefined) {
                    event.data.handler(event);
                }
            });

            if (html) {
                item.html(k);
            } else {
                item.text(k);
            }

            menu.append(item);
        }

        menu.css('top', y);
        menu.css('left', x);
        menu.outerHeight('auto');
        menu.css('display', 'none');
        menu.css('z-index', '10001');

        Menu.closeMenu();
        $('body').append(menu);

        let height = menu.outerHeight();
        let width = menu.outerWidth();

        if (y + height > $(window).outerHeight() - 30) {
            menu.outerHeight($(window).outerHeight() - y - 30);
        }

        if (x + width > $(window).outerWidth() - 20) {
            menu.css('left', Math.max(0, x - width));
        }

        menu.css('display', 'flex');
    }

    /**
     *  Creates and displays a menu with custom-made blocks.
     *
     *  If you want to refer to the menu block in CSS, use
     *  .<name_prefix>_menu.
     *
     *  @static
     *  @param {String} name_prefix Prefix to use for the menu
     *  block class in CSS.
     *  @param {int} x x-part of the upper-left corner position
     *  of a menu.
     *  @param {int} y y-part of the upper-left corner position
     *  of a menu.
     *  @param {Array} blocks Array of custom menu items of type
     *  `{item: <item>, hover: <hover>, click_handler: [<arbitrary
     *  data>, <click event handler>]}`, where `<item>` is
     *  a jQuery object representing a custom menu item element
     *  (e.g. `$('<div>Hello World!</div>')`), `<hover>` is a
     *  boolean indicating whether the item should be highlighted
     *  on hover, and `[<arbitrary data>, <click event handler>]`
     *  is the same as in `createMenu()`. `<hover>` is optional,
     *  its default value is false.
     */
    static createMenuWithCustomBlocks(name_prefix, x, y, blocks) {
        Menu.closeMenu();

        if (name_prefix.includes('"') || name_prefix.includes(' ')) {
            window.alert('Illegal characters in ' +
                         'name_prefix in createMenuWithCustomBlocks()!');
            return;
        }

        let menu = $('<div id="menu" class="menu_block ' + name_prefix + '_menu"></div>');
        let first = true;

        for (const v of blocks) {
            // SVGs below are from Google Material Icons, licensing:
            // SPDX-FileCopyrightText: Google
            // SPDX-License-Identifier: Apache-2.0

            // ************************
            let setUpIcon = (target, code) => {
                let obj = v.item.find('[data-icon="' + target + '"]');
                let path = $(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
                path.attr('d', code);
                obj.append(path);
                obj.attr('xmlns', '');
                obj.attr('viewBox', '0 -960 960 960');
            };

            setUpIcon('general', 'M280-280h80v-200h-80v200Zm320 0h80v-400h-80v400Zm-160 0h80v-120h-80v120Zm0-200h80v-80h-80v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z');
            setUpIcon('warning', 'm40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z');
            setUpIcon('replace', 'M164-560q14-103 91.5-171.5T440-800q59 0 110.5 22.5T640-716v-84h80v240H480v-80h120q-29-36-69.5-58T440-720q-72 0-127 45.5T244-560h-80Zm620 440L608-296q-36 27-78.5 41.5T440-240q-59 0-110.5-22.5T240-324v84h-80v-240h240v80H280q29 36 69.5 58t90.5 22q72 0 127-45.5T636-480h80q-5 36-18 67.5T664-352l176 176-56 56Z');
            setUpIcon('download', 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z');
            setUpIcon('delete', 'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z');
            setUpIcon('copy', 'M120-220v-80h80v80h-80Zm0-140v-80h80v80h-80Zm0-140v-80h80v80h-80ZM260-80v-80h80v80h-80Zm100-160q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480Zm40 240v-80h80v80h-80Zm-200 0q-33 0-56.5-23.5T120-160h80v80Zm340 0v-80h80q0 33-23.5 56.5T540-80ZM120-640q0-33 23.5-56.5T200-720v80h-80Zm420 80Z');
            // ************************

            if (first) {
                v.item.addClass('menu_item_first');
                first = false;
            } else {
                v.item.addClass('menu_item');
            }

            if ('hover' in v && v.hover) {
                v.item.addClass('menu_item_with_hover');
            }

            if (v.click_handler == undefined) {
                v.item.on('click', event => {
                    Window.stopPropagation(event);
                });
            } else {
                v.item.on('click', {
                    'data': v.click_handler[0],
                    'handler': v.click_handler[1]
                }, event => {
                    Window.stopPropagation(event);
                    Menu.closeMenu();

                    if (event.data.handler != undefined) {
                        event.data.handler(event);
                    }
                });
            }

            menu.append(v.item);
        }

        menu.css('top', y);
        menu.css('left', x);
        menu.outerHeight('auto');
        menu.css('display', 'none');
        menu.css('z-index', '10001');

        Menu.closeMenu();
        $('body').append(menu);

        let height = menu.outerHeight();
        let width = menu.outerWidth();

        if (y + height > $(window).outerHeight() - 30) {
            menu.outerHeight($(window).outerHeight() - y - 30);
        }

        if (x + width > $(window).outerWidth() - 20) {
            menu.css('left', Math.max(0, x - width));
        }

        menu.css('display', 'flex');
    }

    /**
     *  Closes a menu.
     */
    static closeMenu() {
        $('#menu').remove();
    }
}

// Private, not meant to be used by any external code.
class LinkWindow extends Window {
    constructor(deserialized, ...args) {
        super();

        if (!deserialized) {
            this.init(this, ...args);
        }
    }

    getType() {
        return 'link';
    }

    getContentCode() {
        return `
<div class="link_header">
  <input class="link_box" type="text" readonly />
  <!-- This SVG is from Google Material Icons, licensing:
       SPDX-FileCopyrightText: Google
       SPDX-License-Identifier: Apache-2.0 -->
  <a href="" target="_blank" class="link_open">
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000">
      <title>Open in new browser tab/window</title>
      <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z"/>
    </svg>
  </a>
</div>
<div class="link_setting">
  <input type="checkbox" name="link_compact" class="link_compact" />
  <label title="Suitable for tablets, smaller desktop screens, and embedding in websites. May be *not* suitable for phones." class="help_pointer">Compact mode</label>
</div>
<div class="link_compact_setting">
  <input type="checkbox" name="link_hide_header" class="link_hide_header" />
  <label title="This saves space. A user can always toggle the header if needed." class="help_pointer">Hide header by default</label>
</div>
<div class="link_compact_setting">
  <input type="checkbox" name="link_hide_footer" class="link_hide_footer" />
  <label title="This saves space. A user can always toggle the footer if needed." class="help_pointer">Hide footer by default</label>
</div>
`;
    }

    startResize() {
        return false;
    }

    finishResize() {

    }

    getTitle(data) {
        let title = 'Link to share for ';

        if ('session' in data) {
            title += 'session: ' +
                $('#results_combobox').find("[value='" + data.session + "']").attr('data-label');
        } else if ('arrgmt' in data) {
            title += 'arrangement';

            if ('name' in data) {
                title += ': ' + data.name;
            }
        } else {
            return 'Link to share';
        }

        return title;
    }

    prepareRefresh() {

    }

    prepareClose() {

    }

    _exportData() {
        return {
            'compact': this.inst().getContent().find('.link_compact').prop('checked'),
            'hide_header': this.inst().getContent().find('.link_hide_header').prop('checked'),
            'hide_footer': this.inst().getContent().find('.link_hide_footer').prop('checked')
        }
    }

    _importData(data) {
        if (data.hide_header) {
            this.inst().getContent().find('.link_hide_header').prop('checked', true);
        } else {
            this.inst().getContent().find('.link_hide_header').prop('checked', false);
        }

        if (data.hide_footer) {
            this.inst().getContent().find('.link_hide_footer').prop('checked', true);
        } else {
            this.inst().getContent().find('.link_hide_footer').prop('checked', false);
        }

        if (data.compact) {
            this.inst().getContent().find('.link_compact').prop('checked', true);
        } else {
            this.inst().getContent().find('.link_compact').prop('checked', false);
        }

        this.inst().getContent().find('.link_compact').trigger('change');
    }

    _setup(data, existing_window) {
        let url_txt = './?';

        if ('session' in data) {
            url_txt += 'session=' + data.session;
        } else if ('arrgmt' in data) {
            url_txt += 'arrgmt=' + data.arrgmt;
        }

        if ('compact' in data && data.compact) {
            url_txt += '&compact=1';
            this.inst().getContent().find('.link_compact').prop('checked', true);

            if ('hide_header' in data && data.hide_header) {
                url_txt += '&hide_header=1';
                this.inst().getContent().find('.link_hide_header').prop('checked', true);
            }

            if ('hide_footer' in data && data.hide_footer) {
                url_txt += '&hide_footer=1';
                this.inst().getContent().find('.link_hide_footer').prop('checked', true);
            }
        } else {
            this.inst().getContent().find('.link_hide_header').prop('disabled', true);
            this.inst().getContent().find('.link_hide_footer').prop('disabled', true);
        }

        let url = new URL(url_txt, document.baseURI);

        this.inst().getContent().find('.link_box').val(url.href);
        this.inst().getContent().find('.link_box').select();
        this.inst().getContent().find('.link_open').attr('href', url.href);

        let refresh = () => {
            let url_txt = './?';

            if ('session' in data) {
                url_txt += 'session=' + data.session;
            } else if ('arrgmt' in data) {
                url_txt += 'arrgmt=' + data.arrgmt;
            }

            if (this.inst().getContent().find('.link_compact').prop('checked')) {
                url_txt += '&compact=1';

                this.inst().getContent().find('.link_hide_header').prop('disabled', false);
                this.inst().getContent().find('.link_hide_footer').prop('disabled', false);

                if (this.inst().getContent().find('.link_hide_header').prop('checked')) {
                    url_txt += '&hide_header=1';
                }

                if (this.inst().getContent().find('.link_hide_footer').prop('checked')) {
                    url_txt += '&hide_footer=1';
                }
            } else {
                this.inst().getContent().find('.link_hide_header').prop('disabled', true);
                this.inst().getContent().find('.link_hide_footer').prop('disabled', true);
            }

            let url = new URL(url_txt, document.baseURI);

            this.inst().getContent().find('.link_box').val(url.href);
            this.inst().getContent().find('.link_box').select();
            this.inst().getContent().find('.link_open').attr('href', url.href);
        };

        this.inst().getContent().find('.link_compact').on('change', refresh);
        this.inst().getContent().find('.link_hide_header').on('change', refresh);
        this.inst().getContent().find('.link_hide_footer').on('change', refresh);

        this.inst().hideLoading();
    }
}

// Private, not meant to be used by any external code.
class SettingsWindow extends Window {
    #current_backend;

    constructor(deserialized, ...args) {
        super();

        if (!deserialized) {
            this.init(this, ...args);
        }
    }

    getType() {
        return 'settings';
    }

    getContentCode() {
        return `
<div class="toolbar">
  <select name="settings_backends" class="settings_backends_combobox" autocomplete="off">
    <option value="" selected="selected" disabled="disabled">
      Please select a backend...
    </option>
  </select>
</div>
<div class="window_space settings_space">
<div class="centered">Select a backend first to be able to change its settings.</div>
</div>`;
    }

    startResize() {
        return false;
    }

    finishResize() {

    }

    getTitle() {
        return 'Settings';
    }

    prepareRefresh() {
        if (this.inst().#current_backend != undefined) {
            this.inst().#current_backend.hide();
            this.inst().#current_backend.appendTo('body');
            this.inst().#current_backend = undefined;
        }
    }

    prepareClose() {
        if (this.inst().#current_backend != undefined) {
            this.inst().#current_backend.hide();
            this.inst().#current_backend.appendTo('body');
        }

        $('#settings_settings').attr('class', 'pointer');
        $('#settings_settings').find('title').text('Settings');
        $('#settings_settings').attr('onclick', 'onSettingsClick(event)');
    }

    _setup(data, existing_window) {
        if (!existing_window) {
            $('#settings_settings').attr('class', 'disabled');
            $('#settings_settings').find('title').text('Settings (already open)');
            $('#settings_settings').attr('onclick', '');
        }

        let names = [];

        $('.settings_block').each((i, elem) => {
            names.push([$(elem).attr('data-backend'), $(elem).attr('id')]);
        });

        names.sort((a, b) => {
            if (a[0].toLowerCase() < b[0].toLowerCase()) {
                return -1;
            } else if (a[0].toLowerCase() > b[0].toLowerCase()) {
                return 1;
            } else {
                return 0;
            }
        });

        names.forEach(entry => {
            this.inst().getContent().find('.settings_backends_combobox').append(
                new Option(entry[0], entry[1]));
        });

        this.inst().getContent().find('.settings_backends_combobox').on('change', event => {
            this.inst().getContent().find('.settings_backends_combobox option:selected').each((i, elem) => {
                let id = $(elem).val();

                if (this.inst().#current_backend == undefined) {
                    this.inst().getContent().find('.settings_space').html('');
                } else {
                    this.inst().#current_backend.hide();
                    this.inst().#current_backend.appendTo('body');
                }

                this.inst().#current_backend = $('#' + id);
                this.inst().#current_backend.appendTo(this.inst().getContent().find('.settings_space'));
                this.inst().#current_backend.show();
            });
        });
        this.inst().hideLoading();
    }

    _exportData() {
        return {
            'module': this.inst().getContent().find('.settings_backends_combobox option:selected').val()
        };
    }

    _importData(data) {
        this.inst().getContent().find('.settings_backends_combobox').val(data.module);
        this.inst().getContent().find('.settings_backends_combobox').trigger('change');
    }
}

class OpenArrangementWindow extends Window {
    #types
    #sort
    #search
    #page
    #last_page

    constructor(deserialized, ...args) {
        super();

        if (!deserialized) {
            this.init(this, ...args);
        }
    }

    getType() {
        return 'open_arrangement';
    }

    getContentCode() {
        return `
<!-- All SVGs used in this initial window code are from Google Material Icons, licensing:
     SPDX-FileCopyrightText: Google
     SPDX-License-Identifier: Apache-2.0 -->
<div class="open_arrangement_header">
  <div class="open_arrangement_page">
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"
     class="pointer open_arrangement_first_page" onclick="Window.instances['${this.inst().getId()}'].onGoToFirstPageClick(event)">
      <title>Go to the first page</title>
      <path d="M440-240 200-480l240-240 56 56-183 184 183 184-56 56Zm264 0L464-480l240-240 56 56-183 184 183 184-56 56Z"/>
    </svg>
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"
     class="pointer open_arrangement_prev_page" onclick="Window.instances['${this.inst().getId()}'].onGoToPrevPageClick(event)">
      <title>Go to the previous page</title>
      <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/>
    </svg>
    <span class="open_arrangement_cur_page">
      Page <span class="open_arrangement_cur_page_num">1</span> of <span class="open_arrangement_last_page_num">1</span> (<span class="open_arrangement_cnt">0</span> arrang.)
    </span>
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"
     class="pointer open_arrangement_next_page" onclick="Window.instances['${this.inst().getId()}'].onGoToNextPageClick(event)">
      <title>Go to the next page</title>
      <path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/>
    </svg>
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"
     class="pointer open_arrangement_last_page" onclick="Window.instances['${this.inst().getId()}'].onGoToLastPageClick(event)">
      <title>Go to the last page</title>
      <path d="M383-480 200-664l56-56 240 240-240 240-56-56 183-184Zm264 0L464-664l56-56 240 240-240 240-56-56 183-184Z"/>
    </svg>
  </div>
  <div class="open_arrangement_table_actions">
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"
     class="pointer" onclick="Window.instances['${this.inst().getId()}'].onSearchClick(event)">
      <title>Search</title>
      <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
    </svg>
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"
     class="pointer" onclick="Window.instances['${this.inst().getId()}'].onFilterClick(event)">
      <title>Filter types</title>
      <path d="M440-160q-17 0-28.5-11.5T400-200v-240L168-736q-15-20-4.5-42t36.5-22h560q26 0 36.5 22t-4.5 42L560-440v240q0 17-11.5 28.5T520-160h-80Zm40-308 198-252H282l198 252Zm0 0Z"/>
    </svg>
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"
     class="pointer" onclick="Window.instances['${this.inst().getId()}'].onSortByClick(event)">
      <title>Sort by...</title>
      <path d="M120-240v-80h240v80H120Zm0-200v-80h480v80H120Zm0-200v-80h720v80H120Z"/>
    </svg>
  </div>
</div>
<table class="open_arrangement_table">
  <tr>
    <th>Name</th>
    <th>Type</th>
    <th>Last update (UTC)</th>
    <th>Actions</th>
  </tr>
</table>`;
    }

    // Private, not meant to be called by any external code.
    onGoToFirstPageClick(event) {
        this.inst().showLoading();
        Window.sendArrgmtRequest({
            'type': 'list',
            'types': this.inst().#types,
            'sort': this.inst().#sort,
            'search': this.inst().#search,
            'page': 1
        }, (data, status) => {
            this.inst().#populateTable(data, 1);
            this.inst().hideLoading();
        }, (xhr, txt, error) => {
            window.alert('Could not load the arrangements!\n\n' +
                         'Error type: ' + txt + '/"' + error + '"/' + xhr.status);
            this.inst().hideLoading();
        });

        Window.stopPropagation(event);
    }

    // Private, not meant to be called by any external code.
    onGoToPrevPageClick(event) {
        this.inst().showLoading();
        Window.sendArrgmtRequest({
            'type': 'list',
            'types': this.inst().#types,
            'sort': this.inst().#sort,
            'search': this.inst().#search,
            'page': this.inst().#page - 1,
        }, (data, status) => {
            this.inst().#populateTable(data, this.inst().#page - 1);
            this.inst().hideLoading();
        }, (xhr, txt, error) => {
            window.alert('Could not load the arrangements!\n\n' +
                         'Error type: ' + txt + '/"' + error + '"/' + xhr.status);
            this.inst().hideLoading();
        });

        Window.stopPropagation(event);
    }

    // Private, not meant to be called by any external code.
    onGoToNextPageClick(event) {
        this.inst().showLoading();
        Window.sendArrgmtRequest({
            'type': 'list',
            'types': this.inst().#types,
            'sort': this.inst().#sort,
            'search': this.inst().#search,
            'page': this.inst().#page + 1,
        }, (data, status) => {
            this.inst().#populateTable(data, this.inst().#page + 1);
            this.inst().hideLoading();
        }, (xhr, txt, error) => {
            window.alert('Could not load the arrangements!\n\n' +
                         'Error type: ' + txt + '/"' + error + '"/' + xhr.status);
            this.inst().hideLoading();
        });

        Window.stopPropagation(event);
    }

    // Private, not meant to be called by any external code.
    onGoToLastPageClick(event) {
        this.inst().showLoading();
        Window.sendArrgmtRequest({
            'type': 'list',
            'types': this.inst().#types,
            'sort': this.inst().#sort,
            'search': this.inst().#search,
            'page': this.inst().#last_page,
        }, (data, status) => {
            this.inst().#populateTable(data, this.inst().#last_page);
            this.inst().hideLoading();
        }, (xhr, txt, error) => {
            window.alert('Could not load the arrangements!\n\n' +
                         'Error type: ' + txt + '/"' + error + '"/' + xhr.status);
            this.inst().hideLoading();
        });

        Window.stopPropagation(event);
    }

    // Private, not meant to be called by any external code.
    onSearchClick(event) {
        let search = window.prompt('Please enter your search ' +
                                   'query for an arrangement name. Use regex.\n\n' +
                                   'To clear search later, click "Search" and leave ' +
                                   'the field empty.', this.inst().#search);

        if (search == undefined) {
            return;
        }

        if (search == '') {
            if (this.inst().#search != undefined) {
                this.inst().showLoading();
                Window.sendArrgmtRequest({
                    'type': 'list',
                    'types': this.inst().#types,
                    'sort': this.inst().#sort
                }, (data, status) => {
                    this.inst().#search = undefined;
                    this.inst().#populateTable(data, 1);
                    this.inst().hideLoading();
                }, (xhr, txt, error) => {
                    window.alert('Could not load the arrangements!\n\n' +
                                 'Error type: ' + txt + '/"' + error + '"/' + xhr.status);
                    this.inst().hideLoading();
                });
            }

            return;
        }

        this.inst().showLoading();
        Window.sendArrgmtRequest({
            'type': 'list',
            'types': this.inst().#types,
            'sort': this.inst().#sort,
            'search': search
        }, (data, status) => {
            this.inst().#search = search;
            this.inst().#populateTable(data, 1);
            this.inst().hideLoading();
        }, (xhr, txt, error) => {
            window.alert('Could not load the arrangements!\n\n' +
                         'Error type: ' + txt + '/"' + error + '"/' + xhr.status);
            this.inst().hideLoading();
        });

        Window.stopPropagation(event);
    }

    // Private, not meant to be called by any external code.
    onFilterClick(event) {
        let reload = types => {
            this.inst().showLoading();
            Window.sendArrgmtRequest({
                'type': 'list',
                'types': types,
                'sort': this.inst().#sort,
                'search': this.inst().#search
            }, (data, status) => {
                this.inst().#types = types;
                this.inst().#populateTable(data, 1);
                this.inst().hideLoading();
            }, (xhr, txt, error) => {
                window.alert('Could not load the arrangements!\n\n' +
                             'Error type: ' + txt + '/"' + error + '"/' + xhr.status);
                this.inst().hideLoading();
            });
        };

        let make_bold_if_needed = (txt, val) => {
            if (this.inst().#types == val) {
                return '<b>' + txt + '</b>';
            } else {
                return txt;
            }
        };

        let options = [
            [make_bold_if_needed('Show W only', 'W'),
             [undefined, () => {
                reload('W');
            }]],
            [make_bold_if_needed('Show SW only', 'SW'),
             [undefined, () => {
                reload('SW');
            }]],
            [make_bold_if_needed('Show both W and SW', 'both'),
             [undefined, () => {
                reload('both');
            }]]
        ];

        Menu.createMenu('open_arrangement_filter_menu',
                        event.pageX,
                        event.pageY,
                        options, true);

        Window.stopPropagation(event);
    }

    // Private, not meant to be called by any external code.
    onSortByClick(event) {
        let page = Number.parseInt(
            this.inst().getContent().find('.open_arrangement_cur_page_num').text());

        if (isNaN(page)) {
            page = 1;
        }

        let reload = sort => {
            this.inst().showLoading();
            Window.sendArrgmtRequest({
                'type': 'list',
                'sort': sort,
                'types': this.inst().#types,
                'search': this.inst().#search,
                'page': page
            }, (data, status) => {
                this.inst().#sort = sort;
                this.inst().#populateTable(data, page);
                this.inst().hideLoading();
            }, (xhr, txt, error) => {
                window.alert('Could not load the arrangements!\n\n' +
                             'Error type: ' + txt + '/"' + error + '"/' + xhr.status);
                this.inst().hideLoading();
            });
        };

        let make_bold_if_needed = (txt, val) => {
            if (this.inst().#sort == val) {
                return '<b>' + txt + '</b>';
            } else {
                return txt;
            }
        };

        let options = [
            [make_bold_if_needed('Sort by name (asc.)', 'name_asc'),
             [undefined, () => {
                reload('name_asc');
            }]],
            [make_bold_if_needed('Sort by name (desc.)', 'name_desc'),
             [undefined, () => {
                reload('name_desc');
            }]],
            [make_bold_if_needed('Sort by last update (asc.)', 'last_update_asc'),
             [undefined, () => {
                reload('last_update_asc');
            }]],
            [make_bold_if_needed('Sort by last update (desc.)', 'last_update_desc'),
             [undefined, () => {
                reload('last_update_desc');
            }]]
        ];

        Menu.createMenu('open_arrangement_sort_by_menu',
                        event.pageX,
                        event.pageY,
                        options, true);

        Window.stopPropagation(event);
    }

    startResize() {
        return false;
    }

    finishResize() {

    }

    getTitle() {
        return 'Open an arrangement';
    }

    prepareRefresh() {

    }

    prepareClose() {

    }

    #getActionsToolbarCode() {
        return `
<td class="open_arrangement_actions_toolbar">
  <!-- All SVGs used in this actions toolbar code are from Google Material Icons, licensing:
       SPDX-FileCopyrightText: Google
       SPDX-License-Identifier: Apache-2.0 -->
  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"
   class="pointer open_arrangement_get_link">
    <title>Get link</title>
    <path d="M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z"/>
  </svg>
  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"
   class="pointer open_arrangement_edit_name">
    <title>Edit name</title>
    <path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/>
  </svg>
  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"
   class="pointer open_arrangement_delete">
    <title>Delete</title>
    <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/>
  </svg>
</td>
`;
    }

    onGetLinkClick(event, arrgmt) {
        Window.stopPropagation(event);
        new LinkWindow(false, undefined, undefined, undefined, undefined, {
            'arrgmt': arrgmt.id,
            'name': arrgmt.name,
            'compact': arrgmt.type === 'SW',
            'hide_header': arrgmt.type === 'SW',
            'hide_footer': arrgmt.type === 'SW'
        });
    }

    onEditNameClick(event, arrgmt) {
        Window.stopPropagation(event);

        let name = window.prompt('Please enter the new name of your ' +
                                 'arrangement.', arrgmt.name);

        if (name == '' || name == undefined || name === arrgmt.name) {
            return;
        }

        let token = window.prompt('Please enter your auth token. ' +
                                  "If you don't have/remember one, " +
                                  'contact your Adaptyst Analyser ' +
                                  'instance administrator.');

        if (token == '' || token == undefined) {
            return;
        }

        this.inst().showLoading();
        Window.sendArrgmtRequest({
            'type': 'edit_name',
            'name': arrgmt.name,
            'new_name': name,
            'token': token
        }, (data, status) => {
            window.alert('The new name has just been saved!');
            this.inst().#reloadTable();
        }, (xhr, txt, error) => {
            if (xhr.status === 403) {
                window.alert('Invalid auth token!');
            } else if (xhr.status === 409) {
                window.alert('The new name is already taken by an ' +
                             'existing arrangement!');
            } else {
                window.alert('Could not save the new name!\n\n' +
                             'Error type: ' + txt + '/"' + error +
                             '"/' + xhr.status);
            }

            this.inst().hideLoading();
        });
    }

    onDeleteClick(event, arrgmt) {
        Window.stopPropagation(event);

        let token = window.prompt('Please enter your auth token to confirm ' +
                                  'deleting the arrangement "' + arrgmt.name + '". ' +
                                  "If you don't have/remember one, " +
                                  'contact your Adaptyst Analyser ' +
                                  'instance administrator.');

        if (token == '' || token == undefined) {
            return;
        }

        this.inst().showLoading();
        Window.sendArrgmtRequest({
            'type': 'delete',
            'name': arrgmt.name,
            'token': token
        }, (data, status) => {
            window.alert('The arrangement "' + arrgmt.name + '" ' +
                         'has just been deleted!');
            this.inst().#reloadTable();
        }, (xhr, txt, error) => {
            if (xhr.status === 403) {
                window.alert('Invalid auth token!');
            } else {
                window.alert('Could not save the new name!\n\n' +
                             'Error type: ' + txt + '/"' + error +
                             + '"/' + xhr.status);
            }

            this.inst().hideLoading();
        });
    }

    #reloadTable() {
        this.inst().showLoading();

        Window.sendArrgmtRequest({
            'type': 'list',
            'sort': this.inst().#sort,
            'types': this.inst().#types,
            'search': this.inst().#search,
            'page': this.inst().#page
        }, (data, status) => {
            this.inst().#populateTable(data, this.inst().#page);
            this.inst().hideLoading();
        }, (xhr, txt, error) => {
            window.alert('Could not load the arrangements!\n\n' +
                         'Error type: ' + txt + '/"' + error + '"/' + xhr.status);
            this.inst().hideLoading();
        });
    }

    #populateTable(data, page) {
        let numf = new Intl.NumberFormat('en-US');

        this.inst().getContent().find('.open_arrangement_cur_page_num').text(
            numf.format(page));
        this.inst().getContent().find('.open_arrangement_last_page_num').text(
            numf.format(data.general_total_pages));
        this.inst().getContent().find('.open_arrangement_cnt').text(
            numf.format(data.general_total_cnt));

        this.inst().#page = page;
        this.inst().#last_page = data.general_total_pages;

        if (page == 1) {
            this.inst().getContent().find('.open_arrangement_first_page').removeClass('pointer');
            this.inst().getContent().find('.open_arrangement_first_page').addClass('disabled');
            this.inst().getContent().find('.open_arrangement_first_page').attr('onclick', '');

            this.inst().getContent().find('.open_arrangement_prev_page').removeClass('pointer');
            this.inst().getContent().find('.open_arrangement_prev_page').addClass('disabled');
            this.inst().getContent().find('.open_arrangement_prev_page').attr('onclick', '');
        } else {
            this.inst().getContent().find('.open_arrangement_first_page').removeClass('disabled');
            this.inst().getContent().find('.open_arrangement_first_page').addClass('pointer');
            this.inst().getContent().find(
                '.open_arrangement_first_page').attr('onclick',
                                                     `Window.instances['${this.inst().getId()}'].` +
                                                     `onGoToFirstPageClick(event)`);

            this.inst().getContent().find('.open_arrangement_prev_page').removeClass('disabled');
            this.inst().getContent().find('.open_arrangement_prev_page').addClass('pointer');
            this.inst().getContent().find(
                '.open_arrangement_prev_page').attr('onclick',
                                                    `Window.instances['${this.inst().getId()}'].` +
                                                    `onGoToPrevPageClick(event)`);
        }

        if (page == data.general_total_pages) {
            this.inst().getContent().find('.open_arrangement_last_page').removeClass('pointer');
            this.inst().getContent().find('.open_arrangement_last_page').addClass('disabled');
            this.inst().getContent().find('.open_arrangement_last_page').attr('onclick', '');

            this.inst().getContent().find('.open_arrangement_next_page').removeClass('pointer');
            this.inst().getContent().find('.open_arrangement_next_page').addClass('disabled');
            this.inst().getContent().find('.open_arrangement_next_page').attr('onclick', '');
        } else if (page > data.general_total_pages) {
            this.inst().onGoToLastPageClick();
            return;
        } else {
            this.inst().getContent().find('.open_arrangement_last_page').removeClass('disabled');
            this.inst().getContent().find('.open_arrangement_last_page').addClass('pointer');
            this.inst().getContent().find(
                '.open_arrangement_last_page').attr('onclick',
                                                    `Window.instances['${this.inst().getId()}'].` +
                                                    `onGoToLastPageClick(event)`);

            this.inst().getContent().find('.open_arrangement_next_page').removeClass('disabled');
            this.inst().getContent().find('.open_arrangement_next_page').addClass('pointer');
            this.inst().getContent().find(
                '.open_arrangement_next_page').attr('onclick',
                                                    `Window.instances['${this.inst().getId()}'].` +
                                                    `onGoToNextPageClick(event)`);
        }

        let table = this.inst().getContent().find('.open_arrangement_table');
        table.find('.open_arrangement_data_row').remove()

        for (const arrgmt of data.list) {
            let row = $('<tr class="open_arrangement_data_row"></tr>');
            let type_title = arrgmt.type == 'W' ? "Window arrangement" :
                "Single window arrangement";

            row.append($(`<td>${arrgmt.name}</td>`));
            row.append($(`<td><span class="open_arrangement_type" ` +
                         `title="${type_title}">${arrgmt.type}</span></td>`));
            row.append($(`<td>${arrgmt.last_update}</td>`));

            let toolbar = $(this.inst().#getActionsToolbarCode());

            toolbar.find('.open_arrangement_get_link').click(event => {
                this.inst().onGetLinkClick(event, arrgmt);
            });
            toolbar.find('.open_arrangement_edit_name').click(event => {
                this.inst().onEditNameClick(event, arrgmt);
            });
            toolbar.find('.open_arrangement_delete').click(event => {
                this.inst().onDeleteClick(event, arrgmt);
            });

            row.append(toolbar);

            table.append(row);
        }
    }

    _exportData() {
        return {
            'types': this.inst().#types,
            'sort': this.inst().#sort,
            'search': this.inst().#search,
            'page': this.inst().#page
        };
    }

    _importData(data) {
        this.inst().#types = data.types;
        this.inst().#sort = data.sort;
        this.inst().#search = data.search;
        this.inst().#page = data.page;

        this.inst().#reloadTable();
    }

    _setup(data, existing_window) {
        Window.sendArrgmtRequest({
            'type': 'list'
        }, (data, status) => {
            this.inst().#sort = 'last_update_desc';
            this.inst().#types = 'both';
            this.inst().#populateTable(data, 1);
            this.inst().hideLoading();
        }, (xhr, txt, error) => {
            window.alert('Could not load the arrangements!\n\n' +
                         'Error type: ' + txt + '/"' + error + '"/' + xhr.status);
            this.inst().close();
        });
    }
}

// Private, not meant to be called by any external code.
function openSystemGraph() {
    if ($('#graph').is(':hidden')) {
        let current_content = $('#block').children();
        current_content.hide();
        $('#graph').show();
        $('#footer_text').show();

        for (const w of Object.values(Window.instances)) {
            w.unfocus();
        }

        if (Window.system_graph_view != undefined) {
            Window.system_graph_view.refresh();
        }

        $('head').find('title').text('Adaptyst Analyser');
    }
}

// Private, not meant to be called by any external code.
function loadCurrentSession(ready_handler) {
    let versionLessThan = (a, b) => {
        for (var i = 0; i < Math.min(a.length, b.length); i++) {
            if (a[i] > b[i]) {
                return false;
            }

            if (a[i] < b[i]) {
                return true;
            }
        }

        if (a.length >= b.length) {
            return false;
        } else {
            return true;
        }
    };

    $('#refresh').removeClass('pointer');
    $('#refresh').addClass('disabled');
    $('#share').removeClass('pointer');
    $('#share').attr('onclick', '');
    $('#share').addClass('disabled');
    $('#refresh').attr('onclick', '');
    $('#graph').html('');

    if (Window.isInCompactMode()) {
        $('#loading').addClass('loading');
        $('#block').append($('#loading'));
        $('#loading').css('display', 'flex');
    } else {
        $('#loading').css('display', 'flex');
        $('#footer_text').text('Please wait...');
    }

    $('#results_combobox option:selected').each(function() {
        let id = $(this).val();
        let label = $(this).attr('data-label');
        let session = id in Session.instances ? Session.instances[id] :
            new Session(id, label);
        let min_mod_vers = JSON.parse($('#viewer_script').attr('data-min-mod-vers'));

        $.ajax({
            url: 'get/' + id + '/',
            method: 'GET'
        }).done(ajax_obj => {
            let response = JSON.parse(ajax_obj);
            let graph = graphology.Graph.from(response.system);
            let positions = forceAtlas2(graph, {
                iterations: 50,
                settings: {
                    adjustSizes: true,
                    gravity: 100
                }
            });
            for (let node of Object.keys(positions)) {
                graph.mergeNodeAttributes(node, positions[node]);
            }
            Window.system_graph_view = new Sigma(graph, $('#graph')[0], {
                renderEdgeLabels: true,
                defaultEdgeType: 'curve',
                edgeProgramClasses: {
                    curve: SigmaEdgeCurve.EdgeCurvedArrowProgram
                },
                labelSize: 20,
                edgeLabelSize: 20,
                allowInvalidContainer: true
            });
            let view = Window.system_graph_view;
            view.getCamera().setState({ratio: 2});
            view.on('doubleClickNode', (node) => {
                node.event.preventSigmaDefault();
                let backends = graph.getNodeAttribute(node.node, 'backends');
                let entity = graph.getNodeAttribute(node.node, 'entity');
                let options = [];

                for (let [name, version] of backends) {
                    let item_label = name;

                    if (version.length === 0) {
                        item_label += ' (unknown version)';
                    }

                    options.push([item_label,
                                  [{
                                      backend_name: name,
                                      entity: entity,
                                      node: graph.getNodeAttribute(node.node, 'server_id'),
                                      session: session
                                  }, (event) => {
                                      if (version.length > 0 && (name in min_mod_vers) &&
                                          min_mod_vers[name].length > 0 &&
                                          versionLessThan(version, min_mod_vers[name])) {
                                          let proceed =
                                              window.confirm('The Adaptyst module used for producing the results is ' +
                                                             'older than the minimum version supported by the ' +
                                                             'corresponding Adaptyst Analyser module!\n\n' +
                                                             'Expect errors and incorrect behaviours. Click ' +
                                                             'OK if you want to proceed.');

                                          if (!proceed) {
                                              return;
                                          }
                                      }

                                      import('./modules/' + event.data.data.backend_name + '/backend.js')
                                          .then(backend => {
                                              if (!(event.data.data.backend_name in
                                                    Window.modules_loaded)) {
                                                  $('<link type="text/css" rel="stylesheet" href="/static/' +
                                                    'modules/' + event.data.data.backend_name + '/backend.css" />').appendTo('head');
                                                  Window.modules_loaded[event.data.data.backend_name] = true;
                                              }

                                              backend.createRootWindow(event.data.data.entity,
                                                                       event.data.data.node,
                                                                       event.data.data.session);
                                          }, () => {
                                              window.alert('Could not load the module! ' +
                                                           'Are you sure it is installed?');
                                          });
                                  }]]);
                }

                Menu.createMenu('system_graph',
                                node.event.original.pageX,
                                node.event.original.pageY,
                                options);
            });

            $('#loading').hide();

            if (Window.isInCompactMode()) {
                $('#main_tab').attr('title', 'System graph (session: ' +
                                    label + ')');
                $('#main_tab_title').text('System graph (session: ' +
                                          label + ')');

                $('#loading').removeClass('loading');
                $('#footer').append($('#loading'));
            }

            let non_zero_exit_codes = [];

            for (const [entity, data] of Object.entries(response.entities)) {
                if (data[0] > 0) {
                    non_zero_exit_codes.push([entity, data[0]]);
                }
            }

            if (non_zero_exit_codes.length === 0) {
                $('#footer_text').html('You can see a graph describing your computer system. ' +
                                       'Double-click any node and select a module to open an internal ' +
                                       (Window.isInCompactMode() ? 'tab' : 'window') + ' ' +
                                       'with a detailed analysis of the node done by the module.');
            } else {
                let entity_cnt_hover = '';

                for (let i = 0; i < non_zero_exit_codes.length; i++) {
                    entity_cnt_hover += non_zero_exit_codes[i][0] + ': exit code ' +
                        non_zero_exit_codes[i][1] +
                        (non_zero_exit_codes[i][1] === 210 ? ' (may suggest a fatal error, ' +
                         'e.g. a seg fault)' : '') +
                        (i < non_zero_exit_codes.length - 1 ? '\n' : '');
                }

                $('#footer_text').html('Double-click any node and select a module to open an internal ' +
                                       (Window.isInCompactMode() ? 'tab' : 'window') + ' ' +
                                       'with a detailed analysis of the node done by the module.<br />' +
                                       '<b><font color="#ff9900">WARNING:</font></b> The workflow in ' +
                                       '<span style="cursor:help; text-decoration:underline" ' +
                                       'title="' + entity_cnt_hover + '">' +
                                       (non_zero_exit_codes.length === 1 ? '1 entity' :
                                        (non_zero_exit_codes.length) + ' entities') + '</span> ' +
                                       'returned a non-zero exit code. Hover over the underlined text to ' +
                                       'see more details.');
            }

            $('#refresh').removeClass('disabled');
            $('#refresh').addClass('pointer');
            $('#refresh').attr('onclick', 'loadCurrentSession()');

            $('#footer_text').show();
            $('#share').removeClass('disabled');
            $('#share').addClass('pointer');
            $('#share').attr('onclick', 'onShareClick(event)');

            if (ready_handler != undefined) {
                ready_handler();
            }
        }).fail((xhr, txt, error) => {
            $('#loading').hide();

            if (Window.isInCompactMode()) {
                $('#loading').removeClass('loading');
                $('#footer').append($('#loading'));
            }

            if (xhr.status === 500) {
                $('#footer_text').html('<b><font color="red">Could not load the session because of an ' +
                                       'error on the server side!</font></b>');
            } else {
                $('#footer_text').html('<b><font color="red">Could not load the session! (error type: ' +
                                       txt + '/"' + error + '"/' + xhr.status + ')</font></b>');
            }

            $('#footer_text').show();
        });
    });
}

// Private, not meant to be called by any external code.
function onOpenClick(event) {
    new OpenArrangementWindow(false, undefined, undefined, undefined, undefined, {});
}

// Private, not meant to be called by any external code.
function openSessionLinkDialogs() {
    new LinkWindow(false, undefined, undefined, undefined, undefined, {
        'session': $('#results_combobox option:selected').attr('value'),
        'compact': false
    });
    // let id = $('#results_combobox option:selected').attr('value');
    // let url = new URL('./?session=' + id, document.baseURI);
    // let open_compact = window.prompt(
    //     "Here's the URL you can share with others to let them quickly " +
    //         "open your session and explore it themselves.\n\n" +
    //         "You can also get the compact mode URL by clicking OK. " +
    //         "Compact mode is " +
    //         "suitable for tablets, smaller desktop " +
    //         "screens, and embedding in websites. This does *not* include phones.",
    //     url.href);

    // if (open_compact != undefined) {
    //     url = new URL('./?compact=1&session=' + id, document.baseURI);
    //     let open_hide_footer = window.prompt(
    //         "Here's the requested compact mode URL you can share with others.\n\n" +
    //             "You can also get the compact mode URL, where the footer is hidden " +
    //             "by default to make more space (it can be still be toggled by users " +
    //             "if needed). Click OK if you want this.", url.href);

    //     if (open_hide_footer != undefined) {
    //         url = new URL('./?compact=1&hide_footer=1&session=' + id, document.baseURI);
    //         window.prompt("Here's the requested compact mode URL with the footer " +
    //                       "hidden by default.", url.href);
    //     }
    // }
}

// Private, not meant to be called by any external code.
function saveWindowArrangement() {
    let getName = () => {
        return window.prompt(
            "You're about to save the current window arrangement for " +
                "opening later or sharing with others using the same Adaptyst Analyser instance.\n\n" +
                "A window arrangement is defined as your current session choice, the camera state of the system graph, " +
                "and all of your windows/tabs " +
                "along with their content if the content export is supported by a corresponding module.\n\n" +
                "What name would you like to give to your arrangement? It must not be empty.");
    };

    let name = getName();

    if (name == undefined || name === "") {
        return;
    }

    $('#share').removeClass('pointer');
    $('#share').addClass('disabled_wait');
    $('#share').attr('onclick', '');
    $('html').css('cursor', 'progress');

    Window.sendArrgmtRequest({
        'type': 'check_name',
        'name': name
    }, (data, status) => {
        if (data.exists) {
            window.alert('The arrangement "' + name + '" already exists!');
            $('#share').removeClass('disabled_wait');
            $('#share').addClass('pointer');
            $('#share').attr('onclick', 'onShareClick(event)');
            $('html').css('cursor', '');
            return;
        }

        let session_id = $('#results_combobox option:selected').attr('value');
        let camera_state = Window.system_graph_view.getCamera().getState();
        let windows = {};

        let cur_x = 10;
        let cur_y = 10;

        let instances = Object.values(Window.instances);
        instances.sort((a, b) => {
            return a.getLastFocusTime() - b.getLastFocusTime();
        });

        for (const w of instances) {
            windows[w.getId()] = w.serialize(cur_x, cur_y);
            cur_x += 20;
            cur_y += 20;
        }

        let arrangement = {
            "session": session_id,
            "camera_state": camera_state,
            "windows": windows
        };

        Window.sendArrgmtRequest({
            'type': 'save',
            'name': name,
            'data': JSON.stringify(arrangement)
        }, (data, status) => {
            window.prompt('The arrangement "' + name + '" has been ' +
                          'saved successfully!\n\n' +
                          "Here's the auth token for changing the " +
                          "arrangement name or deleting the arrangement. " +
                          "You'll see it only once, save it in a safe place.",
                          data.token);

            $('#share').removeClass('disabled_wait');
            $('#share').addClass('pointer');
            $('#share').attr('onclick', 'onShareClick(event)');
            $('html').css('cursor', '');

            new LinkWindow(false, undefined, undefined, undefined, undefined, {
                'arrgmt': data.id,
                'name': name
            });
        }, (xhr, txt, error) => {
            window.alert('The arrangement "' + name + '" could not be saved ' +
                         'due to an error! (save stage, ' +
                         'error type: ' + txt + '/"' + error + '"/' + xhr.status + ')');

            $('#share').removeClass('disabled_wait');
            $('#share').addClass('pointer');
            $('#share').attr('onclick', 'onShareClick(event)');
            $('html').css('cursor', '');
        });
    }, (xhr, txt, error) => {
        window.alert('The arrangement "' + name + '" could not be saved ' +
                     'due to an error! (check name stage, ' +
                     'error type: ' + txt + '/"' + error + '"/' + xhr.status + ')');

        $('#share').removeClass('disabled_wait');
        $('#share').addClass('pointer');
        $('#share').attr('onclick', 'onShareClick(event)');
        $('html').css('cursor', '');
    });
}

// Private, not meant to be called by any external code.
function loadArrangement(data) {
    let openWindows = () => {
        let windows_to_open = [];
        let windows_visited = new Set();
        let error = false;

        let processDependency = (cur_w, window_dict) => {
            if (windows_visited.has(cur_w)) {
                return;
            }

            windows_visited.add(cur_w);

            if (cur_w.dependencies != undefined) {
                for (const w of cur_w.dependencies) {
                    if (error) {
                        return;
                    }

                    if (window_dict[w] == undefined) {
                        error = true;
                        return;
                    }

                    processDependency(window_dict[w],
                                      window_dict);
                }
            }

            windows_to_open.push(cur_w);
        };

        if (data.other_windows != undefined) {
            for (const w of Object.values(data.other_windows)) {
                if (error) {
                    break;
                }

                processDependency(w, data.other_windows);
            }
        }

        if (data.windows != undefined) {
            for (const w of Object.values(data.windows)) {
                if (error) {
                    break;
                }

                processDependency(w, data.windows);
            }
        }

        if (error) {
            window.alert('The arrangement refers to non-existing ' +
                         'windows! This means it is malformed and cannot ' +
                         'be opened.');
            return;
        }

        if (data.main_window != undefined) {
            windows_to_open.push(data.main_window);
        }

        let index = 0;
        let deserializeNextWindow = () => {
            if (++index < windows_to_open.length) {
                Window.deserialize(windows_to_open[index],
                                   deserializeNextWindow);
            } else {
                $('#arrgmt_loading').remove();
            }
        };

        if (windows_to_open.length > 0) {
            Window.deserialize(windows_to_open[0],
                               deserializeNextWindow);
        }
    };

    if (data.session != undefined) {
        $('#results_combobox').val(data.session);
        loadCurrentSession(() => {
            if (data.camera_state != undefined) {
                Window.system_graph_view.getCamera().setState(data.camera_state);
            }

            openWindows();
        });
    } else {
        openWindows();
    }
}

// Private, not meant to be called by any external code.
function onSessionRefreshClick(event) {
    loadCurrentSession();
}

// Private, not meant to be called by any external code.
function onSettingsClick(event) {
    new SettingsWindow(false, undefined, undefined, undefined, undefined, {});
}

// Private, not meant to be called by any external code.
function onShareClick(event) {
    let options = [
        ['Get session link', [undefined, openSessionLinkDialogs]],
        ['Save window arrangement', [undefined, saveWindowArrangement]]
    ];

    Menu.createMenu('share_menu',
                    event.pageX,
                    event.pageY,
                    options);

    Window.stopPropagation(event);
}

// Private, not meant to be called by any external code.
function onShowHeaderClick(event) {
    $('#header_container').removeClass('header_hidden');
    $('#header_container').addClass('header_shown');

    if ($('#graph').is(':visible')) {
        Window.system_graph_view.refresh();
    }
}

// Private, not meant to be called by any external code.
function onHideHeaderClick(event) {
    $('#header_container').removeClass('header_shown');
    $('#header_container').addClass('header_hidden');

    if ($('#graph').is(':visible')) {
        Window.system_graph_view.refresh();
    }
}

// Private, not meant to be called by any external code.
function onShowFooterClick(event) {
    $('#footer').removeClass('footer_hidden');
    $('#footer').addClass('footer_shown');

    if ($('#graph').is(':visible')) {
        Window.system_graph_view.refresh();
    }
}

// Private, not meant to be called by any external code.
function onHideFooterClick(event) {
    $('#footer').removeClass('footer_shown');
    $('#footer').addClass('footer_hidden');

    if ($('#graph').is(':visible')) {
        Window.system_graph_view.refresh();
    }
}

$(document).ready(() => {
    if ($('body').attr('data-arrgmt') != undefined) {
        let id = $('body').attr('data-arrgmt');
        Window.sendArrgmtRequest({
            'type': 'get',
            'id': id
        }, (data, status) => {
            loadArrangement(data);
        }, (xhr, txt, error) => {
            if (xhr.status === 404) {
                window.alert('The arrangement with ID ' + id +
                             "can't be found!");
            } else if (xhr.status === 422) {
                window.alert('The arrangement with ID ' + id +
                             ' refers to at least one performance ' +
                             'analysis session for which the fingerprint ' +
                             'verification has failed! This means that the ' +
                             'session is not present or has been tampered with.\n\n' +
                             'The first arrangement session encountering ' +
                             'this problem: ' +
                             JSON.parse(xhr.responseText).session_invalid);
            } else {
                window.alert('Could not load the arrangement with ID ' +
                             id + '!\n\n' +
                             'Error type: ' + error + '/"' +
                             txt + '"/' + xhr.status);
            }
        });
    } else if ($('body').attr('data-session') != undefined) {
        $('#results_combobox').val($('body').attr('data-session'));
        loadCurrentSession();
    }

    if (Window.isInCompactMode()) {
        $('#tabs')[0].addEventListener('wheel', event => {
            let coefficient = undefined;

            if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
                coefficient = 1;
            } else if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
                coefficient = 10;
            } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
                coefficient = 20;
            } else {
                coefficient = 0;
            }

            $('#tabs').prop('scrollLeft',
                            Math.max(0, $('#tabs').prop('scrollLeft') + coefficient * event.deltaY));
        });
    } else {
        $(document).on('change', '#results_combobox', () => {
            loadCurrentSession();
        });
    }
});
