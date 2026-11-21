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

### Stage 1: Creating a Registry Persistence Lookup Table
According to **[MITRE ATT&CK technique T1547.001](https://attack.mitre.org/techniques/T1547/001/)**, Registry Run keys and Startup folders can be abused to achieve persistence.

:::callout Why Use a Splunk Lookup Table?
I choose a **[Splunk Lookup Table](https://help.splunk.com/en/splunk-enterprise/manage-knowledge-objects/knowledge-management-manual/9.3/use-lookups-in-splunk-web/about-lookups)**
because it allows me to store multiple Registry paths and easily match them against Registry modification events.<br>
I created a CSV lookup file containing Registry paths associated with persistence, along with their corresponding MITRE ATT&CK technique IDs and descriptions.
:::

<details>
<summary>Lookup Table Contents</summary>

| RegistryPath | MITRE_ID | Description |
|---|---|---|
| `HKU\*\Software\Microsoft\Windows\CurrentVersion\Run\*` | T1547.001 | User-specific auto-run key |
| `HKU\*\Software\Microsoft\Windows\CurrentVersion\RunOnce\*` | T1547.001 | Runs once at user logon |
| `HKLM\Software\Microsoft\Windows\CurrentVersion\Run\*` | T1547.001 | Machine-wide auto-run key |
| `HKLM\Software\Microsoft\Windows\CurrentVersion\RunOnce\*` | T1547.001 | Runs once at system startup |
| `HKLM\Software\Microsoft\Windows\CurrentVersion\RunOnceEx\*` | T1547.001 | Extended RunOnce mechanism |
| `HKU\*\Software\Microsoft\Windows\CurrentVersion\RunOnceEx\*` | T1547.001 | User-level RunOnceEx mechanism |
| `HKLM\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Run\*` | T1547.001 | 32-bit machine-wide auto-run key |
| `HKU\*\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Run\*` | T1547.001 | 32-bit user auto-run key |
| `HKU\*\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run\*` | T1547.001 | User policy-based Run key |
| `HKLM\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run\*` | T1547.001 | Machine policy-based Run key |
</details>

#### Steps to Create the Lookup Table
1. Navigate to `Settings` > `Lookups`.
2. Open the Lookup table files section.
3. Click `New Lookup Table File`.
4. Select the destination app.
5. Click Choose File and upload the CSV file.
6. Enter the destination filename, ending in .csv.
7. Click Save.

We can now reference the uploaded CSV filename directly in our Splunk query using the `lookup` command.<br><br>

I also used **[Lookup Definitions](https://docs.splunk.com/Splexicon:Lookupdefinition?_gl=1*6ssuny*_gcl_au*NjQ5NjU4OTcyLjE3OTMyMDU4MTI.*FPAU*NjQ5NjU4OTcyLjE3OTMyMDU4MTI.*_ga*MTA0MDgyNzQ1LjE3OTMyMDU4MTI.*_ga_5EPM2P39FV*czE3OTUyOTAxNzMkbzE4JGcwJHQxNzk1MjkwMTczJGo2MCRsMCRoMTMyNTc4MDM4MA..*_fplc*cE1SVmxMWnVON1FCUiUyRnlrUzk1YW1Ub2l3NHY4b0VUQWlFTE5ScWNFJTJCMk9LR2pUckFZNDhhVTJSaEglMkZuJTJCeDRPZG5uNWdFMlVSNG1aM3JwTlIlMkJDM0F5REhMZUolMkZ5OUlGQWVTVXY3Mng3aDZRakwlMkY3OXhHcWZhbW9FSndZU2clM0QlM0Q.)**
to configure how Splunk accesses and uses the uploaded lookup table.

<details>
<summary>The following settings were applied:</summary>

- **Case sensitive match:** Unchecked, allowing case-insensitive matching.
- **Match Type:** `WILDCARD(RegistryPath)`, allowing Registry path patterns containing wildcards (`*`).
</details>

---

### Stage 2: Hunting for Registry Persistence Activity
After creating and configuring the Registry persistence lookup table, I used it to search Sysmon Event ID 13 logs for modifications to Registry locations associated with persistence.<br>

```SPL
index="aa15cbf9" 
    source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" 
    EventID=13
    | lookup registry_persistence_lookup RegistryPath AS TargetObject OUTPUT MITRE_ID, Description, RegistryPath
    | where isnotnull(MITRE_ID) 
    | table _time, Computer, User, TargetObject, Details, Image, ProcessGuid, ProcessId, MITRE_ID, Description
    | sort - _time
```

During the investigation, multiple Registry-based autostart entries were identified.<br>
While some appeared to be associated with legitimate applications, one entry stood out as suspicious.<br>
![Lookup table output](<assets/investigations/Hunting Registry Run Key Persistence/1.png>)


It was configured under the machine-wide `Run` key with the value `Updater`, pointing to `rundll32 C:\Windows\System32\dghelper.dll,MainFunc`. 

The Registry modification was performed by `reg.exe` under the `NT AUTHORITY\SYSTEM` account.<br>

This finding will be examined further by investigating the process responsible for creating the entry and reconstructing its execution chain.

---

### Stage 3: Tracing the Execution of the Persistence Entry
I started by searching for `dghelper.dll` across Sysmon Process Creation events to identify related process activity.
```SPL
index="aa15cbf9" 
    source="XmlWinEventLog:Microsoft-Windows-Sysmon/Operational" 
    EventID=1 "dghelper.dll"
    | table _time, Computer, User, Image, CommandLine, ParentCommandLine
    | sort - _time
```

## Reconstructed Process Execution Trees

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
