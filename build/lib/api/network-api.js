import { ALPNProtocol, AbortError, FetchError, Headers, context, timeoutSignal } from "@adobe/fetch";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { API_ERROR_LIMIT, API_RETRY_INTERVAL, API_TIMEOUT } from "./network-settings.js";
import { NetworkReportInterval } from "./network-types-report-stats.js";
import { SystemLogType } from "./network-types-system-log.js";
class NetworkApi extends EventEmitter {
  logPrefix = "NetworkApi";
  // private adapter: ioBroker.Adapter;
  apiErrorCount;
  apiLastSuccess;
  fetch;
  headers;
  log;
  host;
  port;
  isUnifiOs;
  site;
  password;
  username;
  _eventsWs;
  constructor(host, port, isUnifiOs, site, username, password, log = console) {
    super();
    this.log = log;
    this._eventsWs = null;
    this.apiErrorCount = 0;
    this.apiLastSuccess = 0;
    this.fetch = context({ alpnProtocols: [ALPNProtocol.ALPN_HTTP2], rejectUnauthorized: false, userAgent: "unifi-network" }).fetch;
    this.headers = new Headers();
    this.host = host;
    this.port = isUnifiOs ? "" : `:${port}`;
    this.isUnifiOs = isUnifiOs;
    this.site = site;
    this.username = username;
    this.password = password;
  }
  async login() {
    const logPrefix = `[${this.logPrefix}.login]`;
    try {
      this.logout();
      const loginSuccess = await this.loginController();
      this.emit("login", loginSuccess);
      return loginSuccess;
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return false;
  }
  // Login to the UniFi Network API.
  async loginController() {
    var _a;
    const logPrefix = `[${this.logPrefix}.loginController]`;
    try {
      if (this.headers.has("Cookie") && this.headers.has("X-CSRF-Token")) {
        return true;
      }
      if (!this.headers.has("X-CSRF-Token")) {
        const response2 = await this.retrieve(`https://${this.host}${this.port}`, { method: "GET" });
        if (response2 == null ? void 0 : response2.ok) {
          const csrfToken2 = response2.headers.get("X-CSRF-Token");
          if (csrfToken2) {
            this.headers.set("X-CSRF-Token", csrfToken2);
          }
        }
      }
      const response = await this.retrieve(this.getApiEndpoint("login" /* login */), {
        body: JSON.stringify({ password: this.password, rememberMe: true, token: "", username: this.username }),
        method: "POST"
      });
      if (!(response == null ? void 0 : response.ok)) {
        this.logout();
        return false;
      }
      const csrfToken = (_a = response.headers.get("X-Updated-CSRF-Token")) != null ? _a : response.headers.get("X-CSRF-Token");
      const cookie = response.headers.get("Set-Cookie");
      if (cookie) {
        this.headers.set("Cookie", cookie.split(";")[0]);
        if (csrfToken && csrfToken !== null) {
          this.headers.set("X-CSRF-Token", csrfToken);
        } else {
          if (cookie.includes("csrf_token=")) {
            let extractCsrf = cookie.split(";").map((c) => c.trim()).find((c) => c.includes("csrf_token="));
            extractCsrf = extractCsrf.split("csrf_token=").pop();
            this.headers.set("X-CSRF-Token", extractCsrf);
            this.log.debug(`${logPrefix} csrf token extracted from cookie`);
          } else {
            this.log.warn(`${logPrefix} cookie not have a csrf token! ${JSON.stringify(cookie)}`);
            return false;
          }
        }
        this.log.debug(`${logPrefix} successfully logged into the controller (host: ${this.host}${this.port}, site: ${this.site}, isUnifiOs: ${this.isUnifiOs})`);
        return true;
      }
      this.logout();
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return false;
  }
  /**
   * Clear the login credentials and terminate any open connection to the UniFi Network API.
   *
   * @category Authentication
   */
  logout() {
    var _a;
    const logPrefix = `[${this.logPrefix}.logout]`;
    try {
      this.reset();
      const csrfToken = (_a = this.headers) == null ? void 0 : _a.get("X-CSRF-Token");
      this.headers = new Headers();
      this.headers.set("Content-Type", "application/json");
      if (csrfToken) {
        this.headers.set("X-CSRF-Token", csrfToken);
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
  }
  /**
   * Terminate any open connection to the UniFi Network API.
   *
   * @category Utilities
   */
  reset() {
    var _a;
    (_a = this._eventsWs) == null ? void 0 : _a.terminate();
    this._eventsWs = null;
  }
  /**
   * Execute an HTTP fetch request to the Network controller.
   *
   * @param url       - Complete URL to execute **without** any additional parameters you want to pass.
   * @param options   - Parameters to pass on for the endpoint request.
   *
   * @returns Returns a promise that will resolve to a Response object successful, and `null` otherwise.
   *
   * @remarks This method should be used when direct access to the Network controller is needed, or when this library doesn't have a needed method to access
   *   controller capabilities. `options` must be a
   *   [Fetch API compatible](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#options) request options object.
   *
   * @category API Access
   */
  async retrieve(url, options = { method: "GET" }) {
    return this._retrieve(url, options);
  }
  /**
   * Execute an HTTP fetch request to the Network controller and retriev data as json
   * @param url       Complete URL to execute **without** any additional parameters you want to pass.
   * @param options   Parameters to pass on for the endpoint request.
   * @param retry     Retry once if we have an issue
   * @returns         Returns a promise json object
   */
  async retrievData(url, options = { method: "GET" }, retry = true) {
    const logPrefix = `[${this.logPrefix}.retrievData]`;
    try {
      if (!await this.loginController()) {
        return retry ? this.retrievData(url, options, false) : void 0;
      }
      const response = await this.retrieve(url, options);
      if (response && response !== null) {
        if (!response.ok) {
          this.log.error(`${logPrefix} Unable to retrieve data. code: ${response == null ? void 0 : response.status}, text: ${response == null ? void 0 : response.statusText}, url: ${url}`);
          return retry ? this.retrievData(url, options, false) : void 0;
        } else {
          const data = await response.json();
          if (data) {
            return data;
          }
        }
      }
    } catch (error) {
      if (error instanceof FetchError) {
        this.log.error(`${logPrefix} FetchError error: ${JSON.stringify(error)}`);
      } else if (error.includes("is not valid JSON")) {
        this.log.error(`${logPrefix} Network controller service is unavailable. This is usually temporary and will occur during device reboots.`);
      } else {
        this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
      }
    }
    return void 0;
  }
  // Internal interface to communicating HTTP requests with a Network controller, with error handling.
  async _retrieve(url, options = { method: "GET" }, decodeResponse = true, isRetry = false) {
    const logPrefix = `[${this.logPrefix}._retrieve]`;
    const isServerSideIssue = (code) => [400, 404, 429, 500, 502, 503].some((x) => x === code);
    let response;
    const signal = timeoutSignal(API_TIMEOUT);
    options.headers = this.headers;
    options.signal = signal;
    try {
      const now = Date.now();
      if (this.apiErrorCount >= API_ERROR_LIMIT) {
        if (this.apiErrorCount === API_ERROR_LIMIT) {
          this.log.error(`Throttling API calls due to errors with the ${this.apiErrorCount} previous attempts. Pausing communication with the Network controller for ${API_RETRY_INTERVAL / 60} minutes.`);
          this.apiErrorCount++;
          this.apiLastSuccess = now;
          this.reset();
          return null;
        }
        if (this.apiLastSuccess + API_RETRY_INTERVAL * 1e3 > now) {
          return null;
        }
        this.log.error(`Resuming connectivity to the UniFi Network API after pausing for ${API_RETRY_INTERVAL / 60} minutes.`);
        this.apiErrorCount = 0;
        this.reset();
        if (!await this.loginController()) {
          return null;
        }
      }
      response = await this.fetch(url, options);
      if (!decodeResponse) {
        return response;
      }
      this.apiErrorCount++;
      if (response.status === 401) {
        this.logout();
        this.log.error(`${logPrefix} code: ${response.status} - Invalid login credentials given. Please check your login and password.`);
        return null;
      }
      if (response.status === 403) {
        this.log.error(`${logPrefix} code: ${response.status} - Insufficient privileges for this user. Please check the roles assigned to this user and ensure it has sufficient privileges.`);
        return null;
      }
      if (response.status === 429) {
        this.log.error(`${logPrefix} code: ${response.status} - Too many requests. Please check the settings at your unifi network controller or wait a while and restart the connection`);
        return null;
      }
      if (response.status === 503) {
        this.log.error(`${logPrefix} code: ${response.status} - Network controller service is unavailable. This is usually temporary and will occur during device reboots.`);
        return null;
      }
      if (!response.ok && isServerSideIssue(response.status)) {
        this.log.error(`${logPrefix} code: ${response.status} - Unable to connect to the Network controller. This is usually temporary and will occur during device reboots.`);
        return null;
      }
      if (!response.ok) {
        this.log.error(`${logPrefix} code: ${response.status} - ${response.statusText}`);
        return null;
      }
      this.apiLastSuccess = Date.now();
      this.apiErrorCount = 0;
      return response;
    } catch (error) {
      this.apiErrorCount++;
      if (error instanceof AbortError) {
        this.log.error(`${logPrefix} Network controller is taking too long to respond to a request. This error can usually be safely ignored.`);
        this.log.debug(`${logPrefix} Original request was: ${url}`);
        return null;
      }
      if (error instanceof FetchError) {
        switch (error.code) {
          case "ECONNREFUSED":
          case "EHOSTDOWN":
          case "ERR_HTTP2_STREAM_CANCEL":
          case "ERR_HTTP2_STREAM_ERROR":
            this.log.error(`${logPrefix} Connection refused.`);
            break;
          case "ECONNRESET":
            if (!isRetry) {
              return this._retrieve(url, options, decodeResponse, true);
            }
            this.log.error(`${logPrefix} Network connection to Network controller has been reset.`);
            break;
          case "ENOTFOUND":
            this.log.error(`${logPrefix} Hostname or IP address not found: ${this.host}${this.port}. Please ensure the address you configured for this UniFi Network controller is correct.`);
            break;
          default:
            this.log.error(`${logPrefix} ${error.code} - ${error.message}`);
            break;
        }
      }
      return null;
    } finally {
      signal.clear();
    }
  }
  async sendData(cmd, payload, method = "POST") {
    const logPrefix = `[${this.logPrefix}.sendData]`;
    let url = `https://${this.host}${this.port}${this.isUnifiOs ? "/proxy/network" : ""}${cmd}`;
    if (cmd.startsWith("https://")) {
      url = cmd;
    }
    this.log.debug(`${logPrefix} url: ${url}, body: ${JSON.stringify(payload)}, method: ${method}`);
    return await this.retrieve(url, {
      body: JSON.stringify(payload),
      method
    });
  }
  /**
   * Detailed list of all devices on site
   * @param mac optional: mac address to receive only the data for this device
   * @returns 
   */
  async getDevices(mac = void 0) {
    const logPrefix = `[${this.logPrefix}.getDevices]`;
    try {
      const res = await this.retrievData(`${this.getApiEndpoint("devices" /* devices */)}${mac ? `/${mac.trim()}` : ""}`);
      if (res && res.data && res.data.length > 0) {
        return res.data;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  /**
   * API V2 - Detailed list of all devices on site
   * @param mac optional: mac address to receive only the data for this device
   * @returns 
   */
  async getDevices_V2(separateUnmanaged = false, includeTrafficUsage = false) {
    const logPrefix = `[${this.logPrefix}.getDevices_V2]`;
    try {
      const res = await this.retrievData(`${this.getApiEndpoint_V2("devices" /* devices */)}?separateUnmanaged=${separateUnmanaged}&includeTrafficUsage=${includeTrafficUsage}`);
      if (res) {
        return res;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  /**
   * List of all active (connected) clients
   * @returns 
   */
  async getClientsActive() {
    const logPrefix = `[${this.logPrefix}.getClientsActive]`;
    try {
      const res = await this.retrievData(this.getApiEndpoint("clientsActive" /* clientsActive */));
      if (res && res.data && res.data.length > 0) {
        return res.data;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  /**
   *  V2 API - List of all active (connected) clients
   * @returns 
   */
  async getClientsActive_V2(mac = void 0, includeTrafficUsage = false, includeUnifiDevices = true) {
    const logPrefix = `[${this.logPrefix}.getClientsActive_V2]`;
    try {
      const url = `${this.getApiEndpoint_V2("clientsActive" /* clientsActive */)}${mac ? `/${mac}` : ""}?includeTrafficUsage=${includeTrafficUsage}&includeUnifiDevices=${includeUnifiDevices}`;
      const res = await this.retrievData(url);
      if (res && res.length > 0) {
        return res;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  /**
   * List of all configured / known clients on the site
   * @returns 
   */
  async getClients() {
    const logPrefix = `[${this.logPrefix}.getClients]`;
    try {
      const res = await this.retrievData(this.getApiEndpoint("clients" /* clients */));
      if (res && res.data && res.data.length > 0) {
        return res.data;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  /**
   *  V2 API - List of all disconnected clients
   * @returns 
   */
  async getClientsHistory_V2(withinHour = 0, includeUnifiDevices = true) {
    const logPrefix = `[${this.logPrefix}.getClientsHistory_V2]`;
    try {
      const url = `${this.getApiEndpoint_V2("clientsHistory" /* clientsHistory */)}?includeUnifiDevices=${includeUnifiDevices}&withinHours=${withinHour}`;
      const res = await this.retrievData(url);
      if (res && res.length > 0) {
        return res;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  /**
   * List all WLan configurations
   * @param wlan_id optional: wlan id to receive only the configuration for this wlan
   * @returns 
   */
  async getWlanConfig(wlan_id = void 0) {
    const logPrefix = `[${this.logPrefix}.getWlanConfig]`;
    try {
      const res = await this.retrievData(`${this.getApiEndpoint("wlanConfig" /* wlanConfig */)}${wlan_id ? `/${wlan_id.trim()}` : ""}`);
      if (res && res.data && res.data.length > 0) {
        return res.data;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  /**
   * API V2 - List all WLan configurations
   * @returns 
   */
  async getWlanConfig_V2() {
    const logPrefix = `[${this.logPrefix}.getWlanConfig]`;
    try {
      const res = await this.retrievData(`${this.getApiEndpoint_V2("wlanConfig" /* wlanConfig */)}`);
      if (res && res.length > 0) {
        return res;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  /**
   * List all LAN configurations
   * @param network_id optional: network id to receive only the configuration for this wlan
   * @returns 
   */
  async getLanConfig(network_id = void 0) {
    const logPrefix = `[${this.logPrefix}.getLanConfig]`;
    try {
      const res = await this.retrievData(`${this.getApiEndpoint("lanConfig" /* lanConfig */)}${network_id ? `/${network_id.trim()}` : ""}`);
      if (res && res.data && res.data.length > 0) {
        return res.data;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  /**
   * API V2 - List all Lan configurations
   * @returns 
   */
  async getLanConfig_V2() {
    const logPrefix = `[${this.logPrefix}.getLanConfig_V2]`;
    try {
      const res = await this.retrievData(`${this.getApiEndpoint_V2("lanConfig" /* lanConfig */)}`);
      if (res && res.length > 0) {
        return res;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  /**
    * API V2 - List model information for devices
    * @returns 
    */
  async getDeviceModels_V2(model = void 0) {
    const logPrefix = `[${this.logPrefix}.getWlanConfig]`;
    try {
      const res = await this.retrievData(`${this.getApiEndpoint_V2("models" /* models */)}${model ? `/${model}` : ""}`);
      if (res && res.model_list && res.model_list.length > 0) {
        return res.model_list;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  /**
   * List all LAN configurations
   * @param firewallGroup_id optional: network id to receive only the configuration for this wlan
   * @returns 
   */
  async getFirewallGroup(firewallGroup_id = void 0) {
    const logPrefix = `[${this.logPrefix}.getFirewallGroup]`;
    try {
      const res = await this.retrievData(`${this.getApiEndpoint("firewallGroup" /* firewallGroup */)}${firewallGroup_id ? `/${firewallGroup_id.trim()}` : ""}`);
      if (res && res.data && res.data.length > 0) {
        return res.data;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  async testConnection() {
    const logPrefix = `[${this.logPrefix}.testConnection]`;
    try {
      const res = await this.retrieve(`${this.getApiEndpoint("self" /* self */)}`);
      if (res == null ? void 0 : res.ok) {
        return true;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return false;
  }
  /**
   * get statistics for site, gateway, switches or access points
   * @param type report type @see reportType
   * @param interval report interval @see reportInterval
   * @param attrs filter by attributes @see NetworkReportStats
   * @param mac filter by mac
   * @param start repot start timestamp
   * @param end report end timestamp
   * @returns 
   */
  async getReportStats(type, interval, attrs = void 0, mac = void 0, start = void 0, end = void 0) {
    const logPrefix = `[${this.logPrefix}.getReportStats]`;
    try {
      const url = `https://${this.host}${this.port}${this.isUnifiOs ? "/proxy/network" : ""}/api/s/${this.site}/stat/report/${interval}.${type}`;
      if (!end) {
        end = Date.now();
      }
      if (!start) {
        if (interval === NetworkReportInterval["5minutes"]) {
          start = end - 1 * 3600 * 1e3;
        } else if (interval === NetworkReportInterval.hourly) {
          start = end - 7 * 24 * 3600 * 1e3;
        } else if (interval === NetworkReportInterval.daily) {
          start = end - 1 * 7 * 24 * 3600 * 1e3;
        } else {
          start = end - 26 * 7 * 24 * 3600 * 1e3;
        }
      }
      if (!attrs) {
        attrs = ["time"];
      } else if (attrs !== "ALL") {
        attrs = ["time", ...attrs];
      } else {
        attrs = ["bytes", "cpu", "lan-num_sta", "mem", "num_sta", "rx_bytes", "time", "tx_bytes", "wan-rx_bytes", "wan-tx_bytes", "wlan-num_sta", "wlan_bytes"];
      }
      const payload = {
        attrs,
        start,
        end,
        mac
      };
      const res = await this.retrievData(url, {
        method: "POST",
        body: payload
      });
      if (res && res.data && res.data.length > 0) {
        return res.data;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  async getSystemLog(type, page_number = 0, pages_size = 10, start = void 0, end = void 0, macs = void 0) {
    const logPrefix = `[${this.logPrefix}.getSystemLog]`;
    try {
      const url = `https://${this.host}${this.port}${this.isUnifiOs ? "/proxy/network" : ""}/v2/api/site/${this.site}/system-log/${type}`;
      this.log.warn(url);
      if (!end) {
        end = Date.now();
      }
      if (!start) {
        start = end - 1 * 24 * 3600 * 1e3;
      }
      const payload = {
        timestampFrom: start,
        timestampTo: end,
        pageNumber: page_number,
        pageSize: pages_size
      };
      if (type === SystemLogType.critical) {
        payload["nextAiCategory"] = ["CLIENT", "DEVICE", "INTERNET", "VPN"];
      } else if (type === SystemLogType.devices) {
        if (!macs)
          payload["macs"] = macs;
      } else if (type === SystemLogType.admin) {
        payload["activity_keys"] = ["ACCESSED_NETWORK_WEB", "ACCESSED_NETWORK_IOS", "ACCESSED_NETWORK_ANDROID"];
        payload["change_keys"] = ["CLIENT", "DEVICE", "HOTSPOT", "INTERNET", "NETWORK", "PROFILE", "ROUTING", "SECURITY", "SYSTEM", "VPN", "WIFI"];
      } else if (type === SystemLogType.updates) {
        payload["systemLogDeviceTypes"] = ["GATEWAYS", "SWITCHES", "ACCESS_POINT", "SMART_POWER", "BUILDING_TO_BUILDING_BRIDGES", "UNIFI_LTE"];
      } else if (type === SystemLogType.clients) {
        payload["clientType"] = ["GUEST", "TELEPORT", "VPN", "WIRELESS", "RADIUS", "WIRED"];
        payload["guestAuthorizationMethod"] = ["FACEBOOK_SOCIAL_GATEWAY", "FREE_TRIAL", "GOOGLE_SOCIAL_GATEWAY", "NONE", "PASSWORD", "PAYMENT", "RADIUS", "VOUCHER"];
      } else if (type === SystemLogType.threats) {
        payload["threatTypes"] = ["HONEYPOT", "THREAT"];
      } else if (type === SystemLogType.triggers) {
        payload["triggerTypes"] = ["TRAFFIC_RULE", "TRAFFIC_ROUTE", "FIREWALL_RULE"];
      }
      const res = await this.retrievData(url, {
        method: "POST",
        body: payload
      });
      if (res) {
        return res;
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return void 0;
  }
  getApiEndpoint(endpoint) {
    let endpointSuffix;
    let endpointPrefix = this.isUnifiOs ? "/proxy/network" : "";
    switch (endpoint) {
      case "login" /* login */:
        endpointPrefix = "/api/";
        endpointSuffix = this.isUnifiOs ? "auth/login" : "login";
        break;
      case "self" /* self */:
        endpointPrefix = "/api/";
        endpointSuffix = this.isUnifiOs ? "users/self" : "self";
        break;
      case "devices" /* devices */:
        endpointSuffix = `/api/s/${this.site}/stat/device`;
        break;
      case "deviceRest" /* deviceRest */:
        endpointSuffix = `/api/s/${this.site}/rest/device`;
        break;
      case "deviceCommand" /* deviceCommand */:
        endpointSuffix = `/api/s/${this.site}/cmd/devmgr`;
        break;
      case "clients" /* clients */:
        endpointSuffix = `/api/s/${this.site}/rest/user`;
        break;
      case "clientsActive" /* clientsActive */:
        endpointSuffix = `/api/s/${this.site}/stat/sta`;
        break;
      case "clientCommand" /* clientCommand */:
        endpointSuffix = `/api/s/${this.site}/cmd/stamgr`;
        break;
      case "wlanConfig" /* wlanConfig */:
        endpointSuffix = `/api/s/${this.site}/rest/wlanconf`;
        break;
      case "lanConfig" /* lanConfig */:
        endpointSuffix = `/api/s/${this.site}/rest/networkconf`;
        break;
      case "firewallGroup" /* firewallGroup */:
        endpointSuffix = `/api/s/${this.site}/rest/firewallgroup`;
        break;
      default:
        break;
    }
    if (!endpointSuffix) {
      return "";
    }
    return `https://${this.host}${this.port}${endpointPrefix}${endpointSuffix}`;
  }
  getApiEndpoint_V2(endpoint) {
    let endpointSuffix;
    let endpointPrefix = this.isUnifiOs ? "/proxy/network" : "";
    switch (endpoint) {
      case "devices" /* devices */:
        endpointSuffix = `/v2/api/site/${this.site}/device`;
        break;
      case "clientsActive" /* clientsActive */:
        endpointSuffix = `/v2/api/site/${this.site}/clients/active`;
        break;
      case "clientsHistory" /* clientsHistory */:
        endpointSuffix = `/v2/api/site/${this.site}/clients/history`;
        break;
      case "wlanConfig" /* wlanConfig */:
        endpointSuffix = `/v2/api/site/${this.site}/wlan/enriched-configuration`;
        break;
      case "lanConfig" /* lanConfig */:
        endpointSuffix = `/v2/api/site/${this.site}/lan/enriched-configuration`;
        break;
      case "models" /* models */:
        endpointSuffix = `/v2/api/site/${this.site}/models`;
        break;
      default:
        endpointSuffix = "";
        break;
    }
    if (!endpointSuffix) {
      return "";
    }
    return `https://${this.host}${this.port}${endpointPrefix}${endpointSuffix}`;
  }
  async launchEventsWs() {
    var _a;
    const logPrefix = `[${this.logPrefix}.launchEventsWs]`;
    try {
      if (!await this.loginController()) {
        return false;
      }
      if (this._eventsWs) {
        return true;
      }
      const url = `wss://${this.host}${this.port}${this.isUnifiOs ? "/proxy/network" : ""}/wss/s/${this.site}/events?clients=v2&next_ai_notifications=true&critical_notifications=true`;
      const ws = new WebSocket(url, {
        headers: {
          Cookie: (_a = this.headers.get("Cookie")) != null ? _a : ""
        },
        rejectUnauthorized: false
      });
      if (!ws) {
        this.log.error("Unable to connect to the realtime update events API. Will retry again later.");
        this._eventsWs = null;
        return false;
      }
      let messageHandler;
      ws.once("close", () => {
        this._eventsWs = null;
        if (messageHandler) {
          ws.removeListener("message", messageHandler);
          messageHandler = null;
        }
      });
      ws.once("error", (error) => {
        this._eventsWs = null;
        if (error.message !== "WebSocket was closed before the connection was established") {
          if (error.message === "Unexpected server response: 502" || error.message === "Unexpected server response: 503" || error.message === "Unexpected server response: 200") {
            this.log.error(`${logPrefix} Network controller - WebSocket service is unavailable. This is usually temporary and will occur during device reboots.`);
          } else {
            this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
          }
        }
        ws.removeListener("message", messageHandler);
        ws.terminate();
      });
      ws.on("message", messageHandler = (data) => {
        try {
          if (data.toString().toLowerCase() === "pong") {
            this.log.warn("PONG");
          }
          if (data.toString() === "pong") {
            this.log.warn("PONG");
          }
          const event = JSON.parse(data.toString());
          if (event) {
            this.emit("message", event);
          }
        } catch (error) {
          this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
        }
      });
      ws.on("pong", messageHandler = (data) => {
        try {
          this.emit("pong");
          this.log.silly ? this.log.silly(`pong received`) : this.log.debug(`pong received`);
        } catch (error) {
          this.log.error(`${logPrefix} ws error: ${error.message}, stack: ${error.stack}`);
        }
      });
      this._eventsWs = ws;
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
    return true;
  }
  wsSendPing() {
    const logPrefix = `[${this.logPrefix}.wsSendPing]`;
    try {
      if (this._eventsWs && this._eventsWs !== null) {
        this._eventsWs.ping();
        this.log.silly ? this.log.silly(`ping sent`) : this.log.debug(`ping sent`);
      }
    } catch (error) {
      this.log.error(`${logPrefix} error: ${error}, stack: ${error.stack}`);
    }
  }
}
var ApiEndpoints = /* @__PURE__ */ ((ApiEndpoints2) => {
  ApiEndpoints2["login"] = "login";
  ApiEndpoints2["self"] = "self";
  ApiEndpoints2["devices"] = "devices";
  ApiEndpoints2["deviceRest"] = "deviceRest";
  ApiEndpoints2["deviceCommand"] = "deviceCommand";
  ApiEndpoints2["clients"] = "clients";
  ApiEndpoints2["clientsActive"] = "clientsActive";
  ApiEndpoints2["clientCommand"] = "clientCommand";
  ApiEndpoints2["wlanConfig"] = "wlanConfig";
  ApiEndpoints2["lanConfig"] = "lanConfig";
  ApiEndpoints2["firewallGroup"] = "firewallGroup";
  return ApiEndpoints2;
})(ApiEndpoints || {});
var ApiEndpoints_V2 = /* @__PURE__ */ ((ApiEndpoints_V22) => {
  ApiEndpoints_V22["devices"] = "devices";
  ApiEndpoints_V22["clientsActive"] = "clientsActive";
  ApiEndpoints_V22["clientsHistory"] = "clientsHistory";
  ApiEndpoints_V22["wlanConfig"] = "wlanConfig";
  ApiEndpoints_V22["lanConfig"] = "lanConfig";
  ApiEndpoints_V22["wanConfig"] = "wanConfig";
  ApiEndpoints_V22["models"] = "models";
  return ApiEndpoints_V22;
})(ApiEndpoints_V2 || {});
export {
  ApiEndpoints,
  ApiEndpoints_V2,
  NetworkApi
};
//# sourceMappingURL=network-api.js.map
