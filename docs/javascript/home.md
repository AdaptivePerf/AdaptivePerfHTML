<!--
SPDX-FileCopyrightText: 2026 CERN
SPDX-License-Identifier: CC-BY-4.0
-->

## Welcome to the Adaptyst Analyser JavaScript documentation!

The main purpose of this website is explaining how you can make windows
and menus in Adaptyst Analyser as part of your module. The remainder
of the documentation is provided for reference and (obviously) does
not include any private methods/fields.

### Creating windows
In order to open a new window in Adaptyst Analyser, a new instance
of a class inheriting from `Window` must be constructed. See
[here](Window.html) for more details.

### Creating menus
In order to open a menu in Adaptyst Analyser, you need to use
one of the static methods provided by `Menu`. Only one menu can be
open at a time. See [here](Menu.html) for more details.
