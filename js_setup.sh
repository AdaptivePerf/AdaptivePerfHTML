#!/bin/bash
set -e

PROJ_DIR=$(pwd)
TMP_DIR=/tmp/adaptiveperfhtml.setup.$$

function error() {
    echo "====="
    echo "An error has occurred!"
    echo ""
    echo "Unless you've interrupted this script, this should not happen."
    echo "Make sure that npm is installed in your computer."
    echo ""
    echo "If the issue reoccurs, contact the AdaptivePerfHTML developers."
    echo "They may ask you to look at the contents of the temporary directory."
    echo "If so, look inside $TMP_DIR."
    echo "====="
    exit 2
}

trap "error" ERR

if [[ ! -d $PROJ_DIR/src/adaptiveperf/static ]]; then
    echo "====="
    echo "$PROJ_DIR/src/adaptiveperf/static does not exist!"
    echo "Run this script from the root folder of the AdaptivePerfHTML repository."
    echo "====="
    exit 1
fi

if [[ ! -d $PROJ_DIR/d3-flame-graph ]]; then
    echo "====="
    echo "$PROJ_DIR/d3-flame-graph does not exist!"
    echo ""
    echo "Run \"git submodule update --init --force\", followed by running this"
    echo "script from the root folder of the AdaptivePerfHTML repository."
    echo "====="
    exit 1
fi

cd $PROJ_DIR/d3-flame-graph
npm install

mkdir $TMP_DIR
cd $TMP_DIR
npm init --yes
npm install --install-links $PROJ_DIR/d3-flame-graph
npm install function-plot
cp node_modules/*/dist/*.min.js node_modules/*/dist/*.css $PROJ_DIR/src/adaptiveperf/static
cp node_modules/function-plot/dist/function-plot.js $PROJ_DIR/src/adaptiveperf/static
npm install vis-timeline@7.7.3
cp node_modules/vis-timeline/standalone/umd/vis-timeline-graph2d.min.js node_modules/vis-timeline/styles/vis-timeline-graph2d.min.css $PROJ_DIR/src/adaptiveperf/static

echo "====="
echo "Done! You can install AdaptivePerfHTML now."
echo "If you get an error below about deleting the temporary directory, you can ignore it."
echo "====="

cd $PROJ_DIR
rm -rf $TMP_DIR
