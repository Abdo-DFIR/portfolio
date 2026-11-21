---
title: Hunting Registry Run Key Persistence
date: 2026-11-17
category: Threat Hunting
summary: A threat-hunting investigation using Splunk to identify suspicious Registry Run key modifications and potential persistence activity.
tags: [Threat Hunting, Windows Registry, Persistence]
tools: [Splunk, SPL, Sysmon, MITRE ATT&CK]
attack: [T1547, T1547.001, CAR-2013-01-002]
source: Lab Scenario: SOC 201 Course From TCM Security.
---
## Scenario
Following the previous investigations, the SOC team initiated a new threat-hunting investigation to examine potential **persistence mechanisms**.
The investigation focuses on identifying **suspicious modifications to Windows Registry Run keys and Startup entries** that could allow an attacker to maintain persistence.

## Key Findings
:::callout Key Findings
vcxv
:::

## Environment & Tools
- Operating System: Windows 10/11 Enterprise.
- Telemetry Collection: Sysmon.
- SIEM Platform: Splunk Enterprise.
- Log Sources: Sysmon & Security Event Logs.

## Hunting Overview
:::callout Questions to answer
### What are we hunting for?
- New or modified Registry Run keys.
- New or modified Startup folder entries.
- Unknown programs configured to start automatically.
- Suspicious processes or DLLs linked to startup entries.
### Where can we find this data?
- **Sysmon Logs:** Event ID 13 (Registry changes) and Event ID 1 (Process Creation).
- **Windows Security Logs:** Event ID 4688 (Process Creation).
- **PowerShell Operational Logs**.
### How can we analyze this data?
- Filter for any registry changes.
- Identify new or modified Startup folder entries.
- Check which programs are configured to start automatically.
- Correlate Registry changes with process creation events
:::


##  Hunting & Analysis
During the previous investigation, we identified suspicious Registry Run key modifications that could indicate potential persistence activity.

---

### Stage 1: Identifying Suspicious Registry Modifications
According to MITRE ATT&CK technique T1547.001, Registry Run keys and Startup folders can be abused to achieve persistence.
![Registery Run Paths](<assets/investigations/Hunting Registry Run Key Persistence/1.png>)
We searched `Sysmon Event ID 13` for changes to Registry Run keys to identify suspicious modifications that could allow programs to execute automatically during system startup or user logon.
```SPL
index="aa15cbf9"
    source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational"
    EventID=13
    TargetObject="*\\Software\\Microsoft\\Windows\\CurrentVersion\\Run*"
    | table _time, Computer, User, TargetObject, Details, Image, ProcessGuid
    | sort - _time
```
![Registery Run Paths](<assets/investigations/Hunting Registry Run Key persistence/2.png>)


## Reconstructed Process Execution Tree


## Timeline
:::timeline
:::

## MITRE ATT&CK Mapping
| Observed Activity | Tactic | Technique |
|---|---|---|


## Indicators of Compromise
| Type | Value | Notes |
|---|---|---|


## Response actions


## Conclusion
