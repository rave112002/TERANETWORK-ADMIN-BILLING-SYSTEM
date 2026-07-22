# HSGQ XE04I EPON OLT — COMPLETE LAB SETUP DOCUMENTATION

| Field | Value |
|---|---|
| **Document Version** | 1.0 |
| **Date** | Wednesday, May 06, 2026 |
| **Time** | 03:12 UTC (11:12 AM Philippine Time) |
| **Author** | Network Lab Session Transcript |
| **Purpose** | Complete technical reference for HSGQ XE04I test bench |
| **Classification** | Internal / Lab Use Only |

---

# Table of Contents

1. [Hardware Identification](#1-hardware-identification)  
2. [Network Topology](#2-network-topology)  
3. [MikroTik RB4011iGS+RM Configuration](#3-mikrotik-rb4011igsrm-configuration)  
4. [PC Configuration & Routing Solution](#4-pc-configuration--routing-solution)  
5. [HSGQ OLT Full Running Configuration](#5-hsgq-olt-full-running-configuration)  
6. [VLAN Architecture](#6-vlan-architecture)  
7. [PON Port Status](#7-pon-port-status)  
8. [Optical Diagnostics](#8-optical-diagnostics-complete-bidirectional)  
9. [ONU Alarm History](#9-onu-alarm-history)  
10. [ONU WiFi Status](#10-onu-wifi-status)  
11. [Management Interfaces](#11-management-interfaces)  
12. [CLI Navigation Map](#12-cli-navigation-map)  
13. [Confirmed Working Command Syntax](#13-confirmed-working-command-syntax)  
14. [Full EPON 1 Interface Command Tree](#14-full-epon-1-interface-command-tree)  
15. [Full Global Config Mode Command Tree](#15-full-global-config-mode-command-tree)  
16. [Access Method Status](#16-access-method-status)  
17. [Known Issues & Concerns](#17-known-issues--concerns)  
18. [Additional Capabilities](#18-additional-capabilities-not-yet-explored)  
19. [Master Checklist](#19-master-checklist)  
20. [Session Login Details](#20-session-login-details)  

---

# 1. Hardware Identification

## OLT Device

| Field | Value |
|---|---|
| Brand | HSGQ (Shenzhen-based, BDCOM-derived firmware) |
| Model | XE04I |
| Firmware | HSGQ-XE04I_I_V3.3.6C_Rel |
| Build Date | 2023/12/25 |
| PON Technology | EPON (IEEE 802.3ah) |
| PON Ports | 4x EPON SFP slots |
| Uplink Ports | 2x GE + 2x XGE (10 Gigabit) + 1x Management |
| PON SFP Installed | PX20+++ (high-power, +7.68 dBm TX) — PON1 slot only |
| OLT MAC (manage) | 98:C7:A4:18:51:9C |
| OLT MAC (inband) | 98:C7:A4:18:51:9D |
| PON Chipset MAC | 00:13:25:00:00:00 |
| PON FW Version | 4.2.7.58 |
| DDR2 CPU | 250 MHz |
| DDR2 PKT | 320 MHz |
| CPU Usage | 3.09% (idle/healthy) |
| Purpose | Lab/test bench (previously production ISP OLT) |

## ONU Device (Test Modem)

| Field | Value |
|---|---|
| Vendor | HWTC (Huawei Technologies Co.) |
| Model | EG8145V5 series (HGU — Home Gateway Unit) |
| Serial | 45V5 |
| Device Type | HGU (router + WiFi + VoIP capable) |
| Port Type | 4ge (4x Gigabit Ethernet LAN) |
| Firmware | V5R019C10S270 |
| MAC Address | 30:c5:0f:d8:7f:2c |
| ONU ID | 1/27 (PON port 1, slot 27) |
| WiFi | Dual-band (2.4GHz + 5GHz) |
| ONU Name | ONU01/27 |
| Description | Jacqueline-Rebancos PON 2 NAP 1 PORT 5 |
| Auth Status | TRUE |
| Config Status | TRUE |
| Online Status | Online |
| Registration Time | 2000/03/17 13:46:51 (incorrect clock) |

---

# 2. Network Topology

```text
                    [Converge ISP Router]
                    192.168.100.1
                            |
              +-------------+-------------------------+
              |             |                         |
              v             v                         |
   [PC - Ethernet]   [MikroTik RB4011iGS+RM]        |
   192.168.100.219    ether1-ISP1: 192.168.100.132   |
   (Converge direct)  PPPoE: 100.0.0.1/32            |
                       ether10-REMOTE-PC: 192.168.9.1 |
                       vlan88: 192.168.88.1/24        |
                              |                       |
              +---------------+                       |
              |                                       |
              v                                       |
       [HSGQ XE04I OLT]                               |
       vlan88: 192.168.88.10/24                       |
       vlanif1: 192.168.99.1/24                       |
       manage: 192.168.100.1/24                       |
       default gw: 192.168.88.1                       |
                              |                       |
                            [PON1]                    |
                              |                       |
                      Fiber (~0.2–0.5 km)             |
                              |                       |
                       [1:16 NAP Splitter]            |
                              |                       |
                    [Huawei EG8145V5 HGU]             |
```

## Physical Connections

- MikroTik `ether8` → OLT (`TO-HSGQ`) — VLANs 10/20/30/40
- MikroTik `ether9` → OLT (`HSGQ-XE041`) — VLAN 88 management
- MikroTik `ether10` → PC (`REMOTE-PC`) — 192.168.9.1/24
- MikroTik `ether1` → Converge ISP — 192.168.100.132
- OLT `PON1` → Fiber → 1:16 NAP → Huawei ONU

---

# 3. MikroTik RB4011iGS+RM Configuration

## IP Addresses

| # | Address | Network | Interface | VRF |
|---|---|---|---|---|
| 0 | 192.168.9.1/24 | 192.168.9.0 | ether10-REMOTE-PC | main |
| 1 | 192.168.88.1/24 | 192.168.88.0 | vlan88 | main |
| 2 | 100.0.0.1/32 | 100.0.0.254 | `<pppoe-TEST>` | main |
| 3 | 192.168.100.132/24 | 192.168.100.0 | ether1-ISP1 | main |

## Interfaces

| Name | Type | Status | Notes |
|---|---|---|---|
| ether1-ISP1 | ether | Running | Converge WAN |
| ether8 | ether | Running | TO-HSGQ |
| ether9--HSGQ-XE041 | ether | Running | OLT management |
| ether10-REMOTE-PC | ether | Running | PC connection |
| vlan10-PPPOE | vlan | Running | Customer VLAN |
| vlan20-PPPOE | vlan | Running | Customer VLAN |
| vlan30-PPPOE | vlan | Running | Customer VLAN |
| vlan40-PPPOE | vlan | Running | Customer VLAN |
| vlan88 | vlan | Running | OLT management |

## Firewall Filter Rules

```bash
/ip firewall filter add chain=forward \
src-address=192.168.100.0/24 \
dst-address=192.168.88.0/24 \
action=accept comment="PC to OLT"

/ip firewall filter add chain=forward \
src-address=192.168.88.0/24 \
dst-address=192.168.100.0/24 \
action=accept comment="OLT to PC"
```

## NAT Rule

```bash
/ip firewall nat add chain=srcnat \
src-address=192.168.100.0/24 \
dst-address=192.168.88.0/24 \
out-interface=vlan88 \
action=masquerade \
comment="PC to OLT NAT"
```

---

# 4. PC Configuration & Routing Solution

## Primary Adapter (Converge Direct)

| Field | Value |
|---|---|
| IPv4 Address | 192.168.100.219 |
| Gateway | 192.168.100.1 |
| Metric | 25 |

## Secondary Adapter (MikroTik)

| Field | Value |
|---|---|
| IPv4 Address | 192.168.100.5 |
| Gateway | 192.168.100.1 |
| Metric | 291 |

## Static Route Added

```cmd
route -p add 192.168.88.0 mask 255.255.255.0 192.168.100.132
```

## Verification

```text
ping 192.168.100.132  ✓
ping 192.168.88.1     ✓
ping 192.168.88.10    ✓
PuTTY Telnet          ✓
```

---

# 5. HSGQ OLT Full Running Configuration

```bash
hostname Tera-Network

vlan standard 1,10,20,30,40,88
exit

interface epon 1
  vlan hybrid 10 tagged
exit

interface epon 2
  vlan hybrid 20 tagged
exit

interface epon 3
  vlan hybrid 30 tagged
exit

interface epon 4
  vlan hybrid 40 tagged
exit

interface ge 1
  vlan hybrid 10,20,30,40,88 tagged
exit

interface ge 2
  vlan hybrid 10,20,30,40 tagged
exit

interface xge 1
  vlan hybrid 10,20,30,40,88 tagged
exit

interface xge 2
  vlan hybrid 10,20,30,40,88 tagged
exit

interface manage
  ifconfig 192.168.100.1 netmask 255.255.255.0
exit

interface vlanif 1
  ifconfig 192.168.99.1 netmask 255.255.255.0
exit

interface vlanif 88
  ifconfig 192.168.88.10 netmask 255.255.255.0
exit

route default gw 192.168.88.1
dns primary 8.8.8.8 secondary 8.8.4.4
```

---

# 6. VLAN Architecture

| VLAN ID | Role | Tagged Interfaces | IP Address |
|---|---|---|---|
| 1 | Default/Inbound Mgmt | All (default) | 192.168.99.1/24 |
| 10 | Customer data — PON1 | epon1, ge1, ge2, xge1, xge2 | — |
| 20 | Customer data — PON2 | epon2, ge1, ge2, xge1, xge2 | — |
| 30 | Customer data — PON3 | epon3, ge1, ge2, xge1, xge2 | — |
| 40 | Customer data — PON4 | epon4, ge1, ge2, xge1, xge2 | — |
| 88 | OOB Management | ge1, xge1, xge2 | 192.168.88.10/24 |

---

# 7. PON Port Status

| PON Port | Status | Online ONUs | Total Bound | VLAN |
|---|---|---|---|---|
| PON01 | UP | 1 | 60 | 10 |
| PON02 | DOWN | 0 | 36 | 20 |
| PON03 | DOWN | 0 | 56 | 30 |
| PON04 | DOWN | 0 | 48 | 40 |

---

# 8. Optical Diagnostics (Complete Bidirectional)

## OLT-Side Optical

| Parameter | Value | Status |
|---|---|---|
| Temperature | 50.13°C | Normal |
| Voltage | 3.39V | Normal |
| Bias Current | 23.95 mA | Healthy |
| TX Power | +7.68 dBm | High-power PX20+++ |
| RX Power | -16.07 dBm | Healthy |

## ONU-Side Optical

| Parameter | Value | Status |
|---|---|---|
| Temperature | 55°C | Acceptable |
| Voltage | 3.29V | Normal |
| Bias Current | 9 mA | Healthy |
| TX Power | +2.17 dBm | Normal |
| RX Power | -11.97 dBm | Excellent |

## Loss Budget Analysis

| Direction | TX | RX | Path Loss |
|---|---|---|---|
| Downstream | +7.68 dBm | -11.97 dBm | 19.65 dB |
| Upstream | +2.17 dBm | -16.07 dBm | 18.24 dB |

**Verdict:** Fiber plant is clean and healthy with strong optical margin.

---

# 9. ONU Alarm History

| Timestamp | Event | Meaning |
|---|---|---|
| 2000/03/17 13:46:21 | ONU dying gasp | ONU lost power |
| 2000/03/17 13:46:22 | ONU deregister | Removed from active |
| 2000/03/17 13:46:54 | ONU authorization success | Re-authorized |
| 2000/03/17 13:46:57 | ONU link up | MPCP established |

---

# 10. ONU WiFi Status

## 2.4 GHz WLAN

| Field | Value |
|---|---|
| Encrypt | 0 |
| SSID | Blank |
| Password | Blank |

## 5 GHz WLAN

| Field | Value |
|---|---|
| Encrypt | 0 |
| SSID | Blank |
| Password | Blank |

**Status:** OLT has not pushed WLAN configuration. ONU uses local Huawei GUI configuration.

---

# 11. Management Interfaces

| Interface | IP Address | Purpose |
|---|---|---|
| manage | 192.168.100.1/24 | Out-of-band |
| vlanif 1 | 192.168.99.1/24 | Default inbound mgmt |
| vlanif 88 | 192.168.88.10/24 | Active mgmt VLAN |

---

# 12. CLI Navigation Map

```text
Login
  |
  v
Tera-Network>
  |
  +-- enable
          |
          v
    Tera-Network#
          |
          +-- configure
                  |
                  v
          Tera-Network(config)#
                  |
                  +-- interface epon 1
                          |
                          v
                Tera-Network(config-epon-1)#
```

## Important Note

Unlike Cisco/Juniper/Huawei systems, most `show` commands exist inside **config mode**, not enable mode.

---

# 13. Confirmed Working Command Syntax

## Global Config Mode

```bash
show running-config
show save-config
show factory-config
show ipaddress
show pon-info
show cpu-usage
show memory
show route-table
ping <ip>
traceroute <ip>
```

## EPON Interface Mode

```bash
show onu-info all
show optical-info
show optical-rssi <1-64>
show onu-version all
show onu-info-alarm <1-64>
show onu-wlan <1-64>
```

---

# 14. Full EPON 1 Interface Command Tree

## Configuration Commands

- bind-onu
- blacklist
- ctc-ver
- onu-authorize
- onu-catv
- onu-crypto
- onu-deregister
- onu-reboot
- onu-upgrade
- onu-wanc
- onu-wlan
- splitter
- vlan
- performance
- switchport

## Show Commands

- show onu-info
- show optical-info
- show optical-rssi
- show splitter
- show vlan
- show statistic
- show voipinfo

---

# 15. Full Global Config Mode Command Tree

## Major Features

- aaa
- acl
- alarm
- dns
- dot1x
- igmp
- lacp
- lldp
- ntp
- qos
- route
- snmp
- spanning-tree
- ssh-server
- syslog-server
- telnet
- traffic-limit
- vlan

---

# 16. Access Method Status

| Method | Available | Status | Access |
|---|---|---|---|
| Telnet | YES | Working | 192.168.88.10:23 |
| SSH | YES | Not Enabled | ssh-server enable |
| Web GUI | YES | Not Enabled | http enable |
| SNMP | YES | Not Configured | snmp-config enable |

---

# 17. Known Issues & Concerns

| Issue | Severity | Fix |
|---|---|---|
| Clock stuck in year 2000 | Critical | Configure NTP |
| Default password unchanged | Critical | Change root password |
| VLAN1 DHCP client enabled | Medium | Disable DHCP |
| SSH disabled | Medium | Enable SSH |
| No SNMP monitoring | Medium | Configure SNMP |

---

# 18. Additional Capabilities (Not Yet Explored)

- PPPoE BNG
- IGMP/Multicast
- RADIUS
- TACACS+
- ERPS Ring Protection
- ONU Firmware Upgrade
- Rogue ONU Detection
- QoS
- ACLs
- IPv6
- Syslog
- Traffic Limiting

---

# 19. Master Checklist

## Phase 1 — Discovery & Access

- [x] Identify OLT IP address
- [x] Confirm Telnet access
- [x] Capture running configuration
- [x] Map command tree

## Phase 2 — Network Connectivity

- [x] Add static route
- [x] Configure firewall
- [x] Configure NAT
- [x] Verify connectivity

## Phase 3 — ONU Diagnostics

- [x] Identify ONU
- [x] Verify optical levels
- [x] Review alarms
- [x] Review WLAN config

## Phase 4 — Service Enablement

- [ ] Fix OLT clock
- [ ] Configure NTP
- [ ] Enable SSH
- [ ] Enable Web GUI
- [ ] Enable SNMP
- [ ] Save configuration

## Phase 5 — Security Hardening

- [ ] Change root password
- [ ] Create backup admin
- [ ] Disable Telnet
- [ ] Configure syslog

---

# 20. Session Login Details

| Field | Value |
|---|---|
| Username | root |
| Privilege Level | super |
| Access Method | Telnet via PuTTY |
| OLT IP | 192.168.88.10 |
| Config Entry | enable → configure |

## Alternative Access

```text
Winbox → New Terminal
/system telnet 192.168.88.10
```

---

# End of Document

| Field | Value |
|---|---|
| Prepared | Wednesday, May 06, 2026 |
| Location | Philippines (UTC+8) |
| OLT Uptime | Since boot |

---

## Notes

- OLT clock is not synchronized and currently displays timestamps in the year 2000.
- Telnet access is currently operational through VLAN 88 (`192.168.88.10`).
- SSH, Web GUI, SNMP, and NTP remain pending configuration.
- Optical levels and link budget are within healthy operating margins.
- Existing ONU bindings appear to originate from a previous production ISP deployment.
- VLAN 88 is functioning as the dedicated management VLAN.
- MikroTik RB4011 is acting as:
  - VLAN transport
  - Inter-VLAN routing helper
  - NAT intermediary for PC-to-OLT communication
- ONU 27 is operating normally in WiFi-only mode with no active Ethernet LAN clients connected.

---

## Recommended Immediate Actions

### 1. Secure Administrative Access

```bash
user root password <new-secure-password>
ssh-server enable
save
```

### 2. Fix System Time

```bash
timezone +08
ntp server pool.ntp.org
ntp enable
save
```

### 3. Disable Unnecessary DHCP Client on VLAN 1

```bash
interface vlanif 1
no ifconfig sub dhcp
exit
save
```

### 4. Enable Web Management

```bash
http enable
web-port 80
web-lang english
save
```

### 5. Configure SNMP Monitoring

```bash
snmp-config enable
snmp community public ro
save
```

---

## Suggested Future Improvements

### Infrastructure

- Configure redundant uplinks using LACP
- Enable spanning-tree protections
- Configure storm-control policies
- Implement centralized syslog collection
- Deploy LibreNMS or Zabbix monitoring

### ONU Management

- Rename stale ONU descriptions
- Remove unused ONU bindings
- Create standardized provisioning templates
- Test centralized WLAN provisioning

### Security

- Disable Telnet after SSH verification
- Implement ACL restrictions
- Configure backup administrator accounts
- Enable session timeout policies

---

## Final Lab Status Summary

| Component | Status |
|---|---|
| OLT Access | Operational |
| VLAN 88 Management | Operational |
| Telnet Connectivity | Operational |
| ONU Registration | Operational |
| Optical Power Levels | Healthy |
| MikroTik Routing | Operational |
| NAT Traversal | Operational |
| SSH Access | Pending |
| Web GUI | Pending |
| SNMP Monitoring | Pending |
| NTP Synchronization | Pending |
| Security Hardening | Pending |

---

## Lab Environment Summary

This HSGQ XE04I EPON OLT environment is currently functioning as a stable lab and testing platform with:

- Successful ONU registration
- Functional optical transport
- Working Layer 2 VLAN transport
- Functional management-plane access
- Verified MikroTik integration
- Healthy optical margins
- Expandable ISP-grade feature set

The system is suitable for:

- EPON learning and experimentation
- ONU provisioning tests
- PPPoE aggregation labs
- VLAN transport experiments
- Optical diagnostics training
- ISP infrastructure simulations
- SNMP/NMS integration testing
- WiFi provisioning experiments

---