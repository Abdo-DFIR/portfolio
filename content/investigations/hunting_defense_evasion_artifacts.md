---
title: Hunting Defense Evasion Artifacts
date: 2026-11-14
category: Threat Hunting
summary: A threat-hunting investigation using Splunk to identify suspicious defense evasion techniques on Windwos endpoint.
tags: [Threat Hunting, Suspicious Execution, Defense Evasion]
tools: [Splunk, SPL, Sysmon, Powershell, MITRE ATT&CK]
attack: [ TT1685.005, CAR-2021-01-003]
source: Lab Scenario: SOC 201 Course From TCM Security.
---
## Scenario
After identifying **suspicious defense evasion** activities during the previous investigations, 
we started a new threat-hunting investigation in Splunk to examine how the attacker attempted to clear Windows event logs and hide their activities.

## Key Findings
:::callout Key Findings
- **What happened:** The Security, System, and Application event logs were cleared within 10 seconds (22:30:48–22:30:58).
- **How:** Three `wevtutil.exe` processes, launched by `cmd.exe` (PID `3916`), cleared the logs. The `cmd.exe` process was started by the malicious `THybZSNv.exe` service binary identified in the [previous investigation](/investigations/hunting_suspicious_command_execution_artifacts/).
- **Evidence:** Sysmon Event ID 1, Security Event ID 1102, and System Event ID 104.
- **Why evidence remained available:** The attacker continued working after clearing the logs. `mimi.exe` was downloaded at `22:31:19`, and the activity remained visible in Splunk.
:::

## Environment & Tools
- Operating System: Windows 10/11 Enterprise.
- Telemetry Collection: Sysmon.
- SIEM Platform: Splunk Enterprise.
- Log Sources: Sysmon & Security Event Logs.


## Hunting Overview
:::callout Questions to answer
### What are we hunting for?
- Events indicating that Windows event logs have been cleared.
- Execution of log-clearing commands or utilities, such as `wevtutil.exe` and<br> `Clear-EventLog`.
- Suspicious activity targeting Security, System, and Application logs.
### Where can we find this data?
- **Windows Security Logs:** EventIDs `4688`, and `1102`.
- **Windows System Logs:** `104`.
- **Sysmon Logs:** EventIDs  `1` .
### How can we analyze this data?
- Search dircetly for log file cleared events.
- Identify which event logs were cleared and when the activity occurred.
- Trace the processes and CommandLine responsible for log-clearing.
:::


##  Hunting & Analysis
During the previous investigation, we identified suspicious Defense Evasion activities related to Windows event log clearing that require further investigation.<br><br>
**The hunt covers four stages: confirming evidence of log clearing, identifying the commands responsible, tracing the process execution chain, and assessing the impact of the activity.**

---

### Stage 1: Confirming evidence of log clearing
First, I will search for Windows Event ID `1102` which indicate that Windows Security event log have been cleared.

```SPL
index="aa15cbf9" 
    source="XmlWinEventLog:Security" 
    EventID=1102
    | table _time, Computer, Channel, EventID, ProcessID, SubjectUserName, Name
```
![Security Event ID 1102 results](<assets/investigations/Hunting Defense Evasion Artifacts/1.png>)

The results show that the Security event log was cleared on `WKS-4F1D.avongate.local` at `2025-06-11 22:30:49`.

I also searched for Event ID `104` to check for additional evidence of Windows event log clearing.
```SPL
index="aa15cbf9" 
    source="XmlWinEventLog:System" 
    EventID=104
    | table _time, Computer, Channel, EventID, Name, object, action
```
![System Event ID 104 results](<assets/investigations/Hunting Defense Evasion Artifacts/5.png>)

Together, Event IDs `1102` and `104` confirm that the adversary cleared event logs to hide malicious activity.

---

### Stage 2: Finding the command responsible
Based on MITRE ATT&CK technique **[T1685.005 (Clear Windows Event Logs)](https://attack.mitre.org/techniques/T1685/005/)**, I examined Sysmon process creation events for `wevtutil.exe` and 
filtered for commands containing `cl` to identify any Windows event log clearing activity.

```SPL
index="aa15cbf9" 
source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" EventID=1 
| search Image="*\\wevtutil.exe" AND CommandLine="*cl*"
| table _time, Computer, Image, CommandLine, ParentCommandLine ,ProcessId, ParentProcessId
| sort - _time
```
![evasion](<assets/investigations/Hunting Defense Evasion Artifacts/4.png>)
The results show commands used to clear the System and Application event logs.

- **Security**: `wevtutil cl Security` at 22:30:48.
- **System**: `wevtutil cl System` at 22:30:54.
- **Application**: `wevtutil cl Application` at 22:30:58.

**All three commands were executed by `cmd.exe` (PPID: 3916).**

---

### Stage 3: Who launched the cmd.exe?
Now we need to identify the PPID of the suspicious `cmd.exe` process PID 3916.

```SPL
index="aa15cbf9"
    source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational"
    EventID=1
    ProcessId=3916
    | table _time, Computer, User, Image, CommandLine,
        ParentImage, ParentCommandLine, ProcessId,
        ParentProcessId, ProcessGuid
    | sort _time
```
![Parent process of cmd.exe](<assets/investigations/Hunting Defense Evasion Artifacts/3.png>)

`THybZSNv.exe` launched the suspicious `cmd.exe` process responsible for clearing the Windows event logs. <br><br>
This executable was previously investigated in my blog **Hunting Suspicious Command Execution Artifacts**.

---

### Stage 4: Impact of the clearing

The logs were cleared between 22:30:48 and 22:30:58. <br> 

However, the attacker's activity continued afterward. According to the previous investigation, `mimi.exe` was downloaded at 22:31:19 and executed at 22:31:33.<br>

This shows that the attacker continued operating after clearing the logs, while other telemetry sources, such as Sysmon and Splunk, still provided evidence of the activity.

## Reconstructed Process Execution Tree
```
THybZSNv.exe
└── cmd.exe (PID: 3916)
    ├── wevtutil.exe (PID: 3892)
    │   └── wevtutil cl Security
    ├── wevtutil.exe (PID: 6288)
    │   └── wevtutil cl System
    └── wevtutil.exe (PID: 8480)
        └── wevtutil cl Application
```
## MITRE ATT&CK Mapping
| Observed Activity | Tactic | Technique ID | Technique |
|---|---|---|---|
| Clearing the Security, System, and Application event logs using `wevtutil.exe` | Defense Evasion | T1685.005 | Clear Windows Event Logs |

## Timeline (UTC)
:::timeline
2025-06-11 22:28:14 | Suspicious process execution | `THybZSNv.exe` launches `cmd.exe` (PID: 3916).
2025-06-11 22:30:48 | Security log clearing | `cmd.exe` executes `wevtutil cl Security` through `wevtutil.exe` (PID: 3892).
2025-06-11 22:30:49 | Security log cleared | Event ID 1102 recorded. [Security EID 1102]
2025-06-11 22:30:54 | System log clearing | `cmd.exe` executes `wevtutil cl System` through `wevtutil.exe` (PID: 6288).
2025-06-11 22:30:58 | Application log clearing | `cmd.exe` executes `wevtutil cl Application` through `wevtutil.exe` (PID: 8480).
:::

## Findings
| Type | Value | Notes |
|---|---|---|
| Host | `WKS-4F1D.avongate.local` | Affected workstation |
| Cleared Logs | Security, System, Application | Three Windows event logs were targeted |
| Clearing Utility | `wevtutil.exe` | Used to clear Windows event logs |
| Parent Process | `cmd.exe` (PID: `3916`) | Launched the three `wevtutil.exe` processes |
| Initial Process | `THybZSNv.exe` | Launched the suspicious `cmd.exe` process |
| Security Event | Event ID `1102` | Confirms the Security event log was cleared |
| System Event | Event ID `104` | Confirms the System event log was cleared |
| Post-Clearing Activity | `mimi.exe` | Downloaded at `22:31:19` and executed at `22:31:33` |
| Time Range | `22:30:48–22:30:58` | Three log-clearing commands were executed within 10 seconds |

## Response actions
1. Isolate the affected host.
2. Preserve the available forensic evidence.
3. Investigate `THybZSNv.exe`.
4. Check other hosts for log clearing activity.
5. Verify that log forwarding and Sysmon are active on the host, and add the detections above.

## Detection Improvement
- Alert on Security Event ID `1102` and System Event ID `104` on any host.
- Alert on Sysmon Event ID 1 where `Image` ends with `\wevtutil.exe` and the command line contains `cl` or `clear-log`.
- Alert on a log-clearing event whose parent process is `cmd.exe` or `powershell.exe` started by an unusual service.
- Forward logs off the host in near real time, so clearing does not remove the evidence.

## Conclusion
- The investigation identified suspicious Windows event log clearing activity on `WKS-4F1D.avongate.local`. 
- The analysis revealed that `THybZSNv.exe` launched a `cmd.exe` process that executed `wevtutil.exe` to clear the Security, System, and Application event logs.
- Sysmon process creation events and Windows Event IDs 1102 and 104 provided supporting evidence of this activity. 
- This behavior maps to MITRE ATT&CK technique T1685.005 Clear Windows Event Logs.
