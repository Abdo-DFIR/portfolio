---
title: Rebuilding a Windows logon timeline
date: 2026-10-25
category: Windows forensics
summary: Correlate Windows security events to determine which account logged in and when the session began.
tags: [Windows, Event Logs, CTF]
tools: [Event Viewer, Chainsaw]
source: Sample practice challenge
sample: true
---

## Challenge

Given a set of Windows Security event logs, identify the account used for the suspicious remote session and the time it started.

## Investigation

Filter for successful logon events (event ID 4624), then review the account, logon type, source address, and timestamp. Compare nearby failed logons (event ID 4625) to see whether they form part of the same sequence.

```text
Event ID: 4624
Logon type: 10
Account: analyst-temp
Source address: 198.51.100.24
Time: 2026-10-25 02:19:42 UTC
```

The sample records show several failed attempts followed by a successful remote-interactive logon. Confirm the machine's time zone before comparing these timestamps with other evidence.

## Solution

For this sample, the account is `analyst-temp`, and the successful session began at `2026-10-25 02:19:42 UTC`. The address is from a documentation-only range and is included as illustrative data.

Example sample flag: `CTF{correlate_the_logon_events}`

## Lessons learned

- A successful logon is more meaningful when correlated with nearby failures and other telemetry.
- Logon type helps distinguish an interactive remote session from other authentication activity.
- Normalize timestamps before assembling a cross-source timeline.
