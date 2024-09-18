# AdaptivePerfHTML
[![License: GNU GPL v3](https://img.shields.io/badge/license-GNU%20GPL%20v3-blue)]()
[![Version: 0.1.dev](https://img.shields.io/badge/version-0.1.dev-red)]()

A tool for producing the HTML summary of profiling results returned e.g. by AdaptivePerf.

## Disclaimer
This is currently a dev version and the tool is under active development. Bugs are to be expected (with the test coverage to be expanded soon). Use at your own risk!

All feedback is welcome.

## License
Copyright (C) CERN.

The project is distributed under the GNU GPL v3 license. See LICENSE for details.

## Installation
### Requirements
Python 3.6 or newer. Also, you must have npm and Node.js 18 or newer during the installation process (you will not need these later). All other dependencies are installed automatically when setting up AdaptivePerfHTML.

### Setup
This is a Python package, so you can install it with ```pip```:
```
pip install git+https://github.com/AdaptivePerf/AdaptivePerfHTML
```

## How to use
AdaptivePerfHTML can be used as a [Flask](https://flask.palletsprojects.com) app for hosting a website displaying the results of all profiling sessions run so far in a given environment.

Firstly, set the ```FLASK_PROFILING_STORAGE``` environment variable to the path to the ```results``` directory created by AdaptivePerf. Then, start Flask and point it to ```adaptiveperf.app:app```.

### Using results from other programs than AdaptivePerf
While AdaptivePerfHTML is designed with AdaptivePerf in mind, it can be used with any other profiler which produces result files in the AdaptivePerf format.

You can check the source code of AdaptivePerf for learning how it formats its profiling results.

## Website layout
After opening the website, follow this getting started guide:
1. Select your profiling session from the "Please select a profiling session" combobox and wait until the timeline loads.
2. In the timeline, you can browse the thread/process tree (including expanding and collapsing threads/processes) on the left and see how long the thread/process ran for on the right in form of timeline blocks. The time axis is in milliseconds.
3. Each thread/process has a corresponding name, PID, and TID.
4. Each block has red and blue parts. Red parts correspond to on-CPU activity while blue parts correspond to off-CPU activity. Not every off-CPU activity may be shown on the timeline for rendering performance reasons (and also depending on the sampling rate chosen when running AdaptivePerf).
5. Right-click a thread/process block to check the exact runtime of the thread/process (as measured between the relevant start and exit syscalls), the ```perf```-sampled runtime, and the stack trace of a function which spawned the thread/process. If the difference between the sampled and exact runtime is significant (the threshold can be adjusted by the user at the website, above the timeline view), the sampled runtime will be shown in red.
6. Double-click a thread/process block to open the browser of thread/process-specific profiling results. There, you can select the analysis type you want to see (only flame graphs at the moment).
7. For flame graphs, you can change the profiling metric, switch between non-time-ordered and time-ordered graphs, search for a specific phrase (regular expressions are also supported), interact with the graphs themselves (e.g. zoom in/out), and download them (as PNG for now). For performance reasons, blocks corresponding to less than a specific percentage of samples will be collapsed ("(compressed)" will be shown instead, you can click it to expand it). This behaviour can be adjusted at the website, above the timeline view.

## Acknowledgements
The AdaptivePerfHTML development is possible thanks to the following funding sources:
* The European Union HE research and innovation programme, grant agreement No 101092877 (SYCLOPS).
