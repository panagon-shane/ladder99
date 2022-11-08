# Versions

Previous versions - see roadmap.md for plans.

| version | description |
| --- | --- |
| v0.7.x | partcount reset in adapter. work in progress, used by one client. old lower-case path syntax. |
| 0.8.x | multiple agents. refactored db so can point at multiple agents better. new path syntax like 'Mazak/Mill123/Axes/Linear[X]/...' |
| 0.9.x | merge 0.7 into 0.8, keep both working |
| 0.9.1 | work on opc-ua driver, rename micro driver to host |
| 0.9.2 | minor patch for host driver |
| 0.9.3 | update example setup |

We're currently (November 2022) working on 0.9

Beyond these, we'll work on a compiler for device modules and a visual data builder. 


<!-- 
future

| 0.10.x | expand metrics - use continuous aggregates to roll up events from history table, instead of bins table? calc oee etc |
| 0.11.x | refactor folder structure to allow client-specific drivers, modules, settings |
| 0.12.x | expand adapter to accommodate different output formats. clean up cache code |
| 0.13.x | optimize for security, traffic, size, cpu | 
-->


