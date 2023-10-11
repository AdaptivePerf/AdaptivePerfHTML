import os
from flask import Flask, render_template, request, send_from_directory
from results import ProfilingResults, PROFILING_STORAGE

app = Flask(__name__)

def get_tree(identifier):
    result = ProfilingResults(identifier)
    tree = result.get_thread_tree()

    def node_to_html(node):
        # process name, PID/TID, start time in ns, runtime in ns, runtime color code
        a, b, c, d, e = node.tag

        # Convert times to milliseconds
        c /= 1000000
        if d != -1:
            d /= 1000000

        # Convert runtime color code to red and green codes in RGB (blue is always 0)
        red, green = min(e, 255), min(510 - e, 255)

        to_return = f'<li id="{b.replace("/", "_")}">' + \
            f'[{c:.3f}+<span style="background-color:#{red:0{2}x}{green:0{2}x}00">{d:.3f}</span>] {a} ({b})' if d != -1 \
                else f'[{c:.3f}+?] {a} ({b})'

        children = tree.children(node.identifier)

        if len(children) > 0:
            to_return += '<ul>'
            for child in tree.children(node.identifier):
                to_return += node_to_html(child)
            to_return += '</ul>'

        to_return += '</li>'
        return to_return

    return '<ul>' + node_to_html(tree.get_node(tree.root)) + '</ul>'

@app.get('/<identifier>/<path:path>')
def get(identifier, path):
    if ProfilingResults.is_identifier(identifier):
        return send_from_directory(os.path.join(PROFILING_STORAGE, identifier),
                                   path)
    else:
        return '', 404

@app.post('/<identifier>/')
def post(identifier):
    if 'tree' in request.values:
        return get_tree(identifier)
    else:
        return '', 400

@app.route('/')
def main():
    return render_template('viewer.html', ids=ProfilingResults.get_all_ids())
