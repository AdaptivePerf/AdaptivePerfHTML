# AdaptivePerfHTML
A tool for producing the HTML summary of profiling results returned by AdaptivePerf.

## Installation
AdaptivePerfHTML can be used either as a standalone tool for producing local HTML summaries or as a Flask app for hosting a website displaying the results of all profiling sessions run so far in a given environment.

### Requirements
* Python 3.6 or newer
* [The patched ```perf```](https://gitlab.cern.ch/syclops/linux/-/tree/master/tools/perf) compiled with Python support
* treelib Python package installed system-wide
