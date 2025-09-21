![Logo](admin/unifi-network.png)

# ioBroker.unifi-network

[![NPM version](https://img.shields.io/npm/v/iobroker.unifi-network.svg)](https://www.npmjs.com/package/iobroker.unifi-network)
[![Downloads](https://img.shields.io/npm/dm/iobroker.unifi-network.svg)](https://www.npmjs.com/package/iobroker.unifi-network)
![Number of Installations](https://iobroker.live/badges/unifi-network-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/unifi-network-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.unifi-network.png?downloads=true)](https://nodei.co/npm/iobroker.unifi-network/)

**Tests:** ![Test and Release](https://github.com/Scrounger/ioBroker.unifi-network/workflows/Test%20and%20Release/badge.svg)

## unifi-network adapter for ioBroker

Unifi Network uses the websocket interface to receive real-time information from the unifi-network application

## Important

1. **This adapter can be very resource intensive!**<br>This depends on your environment, i.e. how many unifi-devices and clients are in your network. This can be influenced somewhat via the `update interval` parameter in the adapter settings. Real-time events are not affected by this setting, only the cyclical update of devices, clients, etc.

2. **Not all states are directly available after the adapter has started**<br>States are only created and updated when the data is sent by the network controller, this can take some time until the data is sent for the first time

## Changelog

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### 1.1.0 (2025-09-21)

- (Scrounger) dependencies updated
- (Scrounger) check adapter settings for timeout and interval implemented
- (Scrounger) translation optimized
- (Scrounger) bug fixes

### 1.1.0-beta.0 (2025-09-03)

- (Scrounger) replaced fetch with undici
- (Scrounger) firewall group added
- (Scrounger) more network events handler added
- (Scrounger) bug fixes

### 1.0.0-beta.0 (2025-04-25)

- (Scrounger) initial release

## License

MIT License

Copyright (c) 2025 Scrounger <scrounger@gmx.net>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
