---
title: Hunting Command and Control (C2) Artifacts
date: 2026-11-25 
category: Threat Hunting
summary: A threat-hunting investigation using Splunk to identify suspicious Command and Control (C2) activity on Windows endpoints.
tags: [Threat Hunting, Command and Control]
tools: [Splunk, SPL, Sysmon, Powershell, MITRE ATT&CK]
attack: [T1105]
source: Lab Scenario: SOC 201 Course From TCM Security.
---
## Scenario
Following the suspicious activities identified during [**previous investigation**](/investigations/hunting_suspicious_command_execution_artifacts/),
we suspect the attacker may be establishing **Command and Control (C2)** communications with the compromised Windows endpoint to remotely interact with the system, 
transfer additional tools and payloads, and execute further commands.

## Environment & Tools
- Operating System: Windows 10/11 Enterprise.
- Telemetry Collection: Sysmon.
- SIEM Platform: Splunk Enterprise.
- Log Sources: Sysmon & Security Event Logs.

## Hunting Overview
:::callout Questions to answer
### What are we hunting for?
- Windows utilities downloading external payloads (`certutil`, `Invoke-WebRequest`, etc..).
- Outbound HTTP/HTTPS connections from unusual processes.
- Commands referencing external IPs or URLs.
- File creation by suspicious processes or in unusual locations.
### Where can we find this data?
- **Sysmon:** Event IDs 1, 3, and 11.
- **Windows Security:** Event ID 4688.
- **PowerShell:** Operational Logs.
### How can we analyze this data?
- Correlate process execution and command-line activity with network connections.
- Identify suspicious communications and related file creation.
:::

## Hunting & Analysis
During previous investigations, we found suspicious activities that may indicate C2 communication. 
We need to investigate further to identify suspicious network connections and file transfers.

---

### Stage 1: 

## Reconstructed Process Execution Tree

## MITRE ATT&CK Mapping

## Timeline (UTC)
:::timeline

:::

## Response actions


## Findings

## Conclusion
CAR-2013-07-001: Suspicious Arguments
CAR-2021-05-005: BITSAdmin Download File
CAR-2021-05-006: CertUtil Download With URLCache and Split Arguments
CAR-2021-05-007: CertUtil Download With VerifyCtl and Split Arguments

