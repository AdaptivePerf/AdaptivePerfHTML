# AdaptivePerfHTML
A tool for producing the HTML summary of profiling results returned by AdaptivePerf.

## Recent redesign
AdaptivePerfHTML has been redesigned recently and its documentation and build system are not updated/reverified yet. The documentation will be fully reverified soon!

## Disclaimer
This is currently a beta version and the tool is under active development. Bugs are to be expected (with the test coverage to be expanded soon). Use at your own risk!

All feedback is welcome.

## License
Copyright (C) CERN.

The project is distributed under the GNU GPL v3 license. See LICENSE for details.

## Installation
### Requirements
* Python 3.6 or newer

### Setup
This is a Python package, so you can install it with ```pip```:
```
pip install git+https://gitlab.cern.ch/adaptiveperf/AdaptivePerfHTML
```

## How to use
AdaptivePerfHTML can be used either as a standalone tool for producing local HTML summaries or as a Flask app for hosting a website displaying the results of all profiling sessions run so far in a given environment.

Both ways indicated below result in the same website layout.

### Standalone tool
```adaptiveperf-html``` is the command-line script for generating a local HTML summary of your profiling sessions. Please run it with the path to the ```results``` directory created by AdaptivePerf, for example:
```
adaptiveperf-html test/results
```

Afterwards, you'll be able to open the index.html file inside the specified ```results``` directory in your web browser.

### Flask app
Firstly, set the ```FLASK_PROFILING_STORAGE``` environment variable to the path to the ```results``` directory created by AdaptivePerf. Then, start Flask and point it to ```adaptiveperf.app:app```.

### Using results from other programs than AdaptivePerf
While AdaptivePerfHTML is designed with AdaptivePerf in mind, it can be used with any other profiler which produces result files in the AdaptivePerf format.

You can check the source code of AdaptivePerf for learning how it formats its profiling results.

## Website layout
More detailed documentation and usage instructions are coming soon!

In the meantime, here's the quick getting started guide after opening the website:
1. Select your profiling session from the "Please select a test executed by the CI" combobox and wait untli the timeline loads.
2. In the timeline, you can browse the thread/process tree (including expanding and collapsing threads/processes) on the left and see how long the thread/process ran for on the right in form of timeline blocks. The time axis is in milliseconds.
3. Each block indicates the name of the process, its PID, TID, its runtime as sampled by ```perf```, and the difference between the sampled time and the actual time (as measured between the relevant start and exit syscalls).
4. Each block has red and blue parts. Red parts correspond to on-CPU activity while blue parts correspond to off-CPU activity. Not every off-CPU activity may be shown on the timeline, depending on the sampling rate chosen when running AdaptivePerf.
5. Some threads/processes may be marked as red. This means that the difference between the sampled and exact runtime of a given thread/process is significant, resulting in potentially lower accuracy of corresponding flame graphs and flame charts.
6. Right-click a thread/process block to open the stack trace of a function which spawned that thread/process.
7. Double-click a thread/process block to open the browser of flame graphs/charts corresponding to the thread/process.
