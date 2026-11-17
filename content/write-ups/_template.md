---
title: Triage a Windows host with KAPE
date: 2026-09-14
category: Tooling
summary: Collect the key artifacts from a live Windows machine and parse them into CSV files you can read straight away.
tags: [Tooling, Windows, Triage]
tools: [KAPE, Eric Zimmerman tools]
sample: true
---

## What KAPE does

KAPE works in two steps. A target step copies forensic artifacts (event logs, registry hives, Prefetch, browser data) from a drive. A module step runs parsers over what was copied. Splitting the two keeps the evidence untouched and lets you re-parse later.

## Collect

Run from an external drive, as administrator. The `!SANS_Triage` target is a good starting set.

```bash
$ kape.exe --tsource C: --tdest D:\case\target --target !SANS_Triage --vss
```

## Parse

```bash
$ kape.exe --msource D:\case\target --mdest D:\case\module --module !EZParser
```

This produces CSV files for the MFT, Prefetch, registry, event logs and more. Open them in Timeline Explorer to sort and filter.

## Habits that help

- Write down the time, the machine name and the command you ran
- Hash the collected folder and note the hash
- Keep the target output read-only and work on a copy
