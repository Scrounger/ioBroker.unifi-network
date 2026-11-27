# Older changes
## 1.4.0 (2026-04-08)

- (Scrounger) bug fix for speed test event spamming since v.10.2.105
- (Scrounger) event messages improved #68 #54
- (Scrounger) dependencies updated
- (Scrounger) support for Unifi OS on custom port added (e.g. UniFi OS Server) #65
- (Scrounger) bug fix: vpn is wrongly shown as lan
- (Scrounger) system informations added #63
- (Scrounger) port states up, rx/tx error and rx/tx dropped added
- (Scrounger) event messages improved #64
- (Scrounger) read controller version added #59
- (Scrounger) option to set debug level for client connection events added #61
- (Scrounger) property version for devices added
- (Scrounger) satisfaction object create condition removed to prevent create and deletion of object
- (Scrounger) event messages for dream machines compatibility < v10.x added #72
- (Scrounger) weblate translation added
- (Scrounger) downgrade @iobroker/adapter-core to v3.3.1 to prevent conflicts with js-controller < v7.1.0 in rare cases #56

## 1.3.1 (2025-12-01)

- (Scrounger) null bug fix #48
- (Scrounger) dependencies updated
- (Scrounger) event messages improved #46
- (Scrounger) bug fixes

## 1.3.0 (2025-11-24)

- (Scrounger) event messages improved #46
- (Scrounger) option to change tx power mode of access point channels
- (Scrounger) dependencies updated
- (Scrounger) code optimized
- (Scrounger) logging optimized

## 1.2.2 (2025-11-14)

- (Scrounger) delete device event added
- (Scrounger) event messages improved #43

## 1.2.1 (2025-11-10)

- (Scrounger) 6 GHz interpreter bug fix #37
- (Scrounger) isOnline state icon bug fix
- (Scrounger) bug fixes

## 1.2.0 (2025-11-04)

- (Scrounger) option to set offline debounce time for single client added
- (Scrounger) dependencies updated

## 1.1.9 (2025-11-03)

- (Scrounger) client and devices IPv6 states added
- (Scrounger) start realtime api listener after adapter initialization finished
- (Scrounger) isOnline fallback method bug fix
- (Scrounger) states lastChange and timestamp bug fix
- (Scrounger) websocket ping pong bug fix
- (Scrounger) vpn client isOnline bug fix
- (Scrounger) dispatcher bug fix

## 1.1.8 (2025-10-26)

- (Scrounger) stp info's added #35
- (Scrounger) dependencies updated

## 1.1.7 (2025-10-19)

- (Scrounger) event 'UpgradeScheduled' added to ignore list
- (DEV2DEV-DE) german translation updated

## 1.1.6 (2025-10-08)

- (Scrounger) dependencies updated #22
- (Scrounger) firewall channel added #29
- (Scrounger) bug fix #28

## 1.1.5 (2025-10-06)

- (Scrounger) check site exist on self hosted controller
- (Scrounger) login bug fixes #27

## 1.1.4 (2025-10-06)

- (Scrounger) logging improved
- (Scrounger) auto detect UniFi OS or self hosted controller
- (Scrounger) auto translation bug fix
- (Scrounger) image downloading improved
- (Scrounger) bug fixes

## 1.1.3 (2025-10-03)

- (Scrounger) login bug fix for self hosted controllers v9.x.x

## 1.1.2 (2025-10-02)

- (Scrounger) login bug fix for self hosted controllers
- (Scrounger) dependencies updated
- (Scrounger) bug fixes

## 1.1.1 (2025-09-30)

- (Scrounger) bug fixes
- (Scrounger) roles added
- (Scrounger) reponsiv adapter config implemented

## 1.1.0 (2025-09-21)

- (Scrounger) dependencies updated
- (Scrounger) check adapter settings for timeout and interval implemented
- (Scrounger) translation optimized
- (Scrounger) bug fixes

## 1.1.0-beta.0 (2025-09-03)

- (Scrounger) replaced fetch with undici
- (Scrounger) firewall group added
- (Scrounger) more network events handler added
- (Scrounger) bug fixes

## 1.0.0-beta.0 (2025-04-25)

- (Scrounger) initial release
