# Change Log

All notable changes to the "vscode-dbf" extension will be documented in this file.

## [0.2.0]
 - inline memo (`M`) columns read from the companion `.FPT`/`.DBT` file [#6](https://github.com/APerricone/vscode-dbf/issues/6)
 - rewrote the table virtual scrolling: rows are cached and painted as they
   arrive, fixing rows that flashed a loading bar but never filled while
   scrolling [#5](https://github.com/APerricone/vscode-dbf/issues/5)
 - open `.DBF` files whose extension is upper case
 - fixed sorting/filtering on the first column and the descending toggle
 - updated the tooling and dependencies to current versions (ESLint 10 flat
   config, Mocha 11, `@vscode/test-electron`, `iconv-lite` 0.7)

## [0.1.2]
 - first version of "generate code" tool
 - better binary column type conversion

## [0.1.1]
 - added management of escape key on filter
 - increase of stability

## [0.1.0]
 - added filters (!!)

## [0.0.8]
 - added command "reopen with encoding"

## [0.0.7]
 - added encoding setting and use

## [0.0.6]
 - improved stability

## [0.0.5]
 - performance boost

## [0.0.4]
 - added support for multiple types and test
 - added sort

## [0.0.3]
 - added support for resizing
 - minimal selection support
 - removed timeout on scroll
 - solved some cases of empty view

## [0.0.2]
 - fixed little table visualization

## [0.0.1]

- basic view of table
- goto rec command
