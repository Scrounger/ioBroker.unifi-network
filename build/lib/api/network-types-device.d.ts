export interface NetworkDevice_V2 {
    network_devices: NetworkDevice[];
}
export interface NetworkDevice {
    _id: string;
    _uptime: number;
    active_geo_info?: NetworkDeviceActiveGeoInfo;
    adopt_ip?: string;
    adopt_url?: string;
    adoptable_when_upgraded: boolean;
    adopted: boolean;
    adopted_at?: number;
    adopted_by_client?: string;
    adoption_completed: boolean;
    anomalies?: number;
    anon_id: string;
    antenna_table?: NetworkDeviceAntennaTable[];
    architecture: string;
    atf_enabled?: boolean;
    bandsteering_mode?: string;
    ble_caps?: number;
    board_rev: number;
    bytes: number;
    "bytes-d"?: number;
    "bytes-r"?: number;
    cfgversion: string;
    config_network: NetworkDeviceConfigNetwork;
    config_network_lan?: NetworkDeviceConfigNetworkLan;
    connect_request_ip: string;
    connect_request_port: string;
    connected_at: number;
    connection_network_id: string;
    connection_network_name: string;
    device_domain?: string;
    country_code?: number;
    countrycode_table?: any[];
    credential_caps?: number;
    detailed_states?: NetworkDeviceDetailedStates;
    device_id: string;
    dhcp_excluded_ip_list?: NetworkDeviceDhcpExcludedIpList;
    dhcp_server_table?: any[];
    disconnected_at: number;
    disconnection_reason?: string;
    discovered_via?: string;
    displayable_version: string;
    dns_shield_server_list_hash?: string;
    dot1x_fallback_networkconf_id?: string;
    dot1x_portctrl_enabled: boolean;
    downlink_lldp_macs: string[];
    downlink_table: NetworkDeviceDownlinkTable[];
    ethernet_overrides?: NetworkDeviceEthernetOverride[];
    ethernet_table: NetworkDeviceEthernetTable[];
    fan_level?: number;
    fixed_ap_available?: boolean;
    flowctrl_enabled?: boolean;
    fw2_caps: number;
    fw_caps: number;
    geo_info?: NetworkDeviceGeoInfo;
    gateway_mac?: string;
    general_temperature?: number;
    "guest-lan-num_sta"?: number;
    "guest-num_sta": number;
    "guest-wlan-num_sta"?: number;
    guest_kicks?: number;
    guest_token?: string;
    has_eth1?: boolean;
    has_fan: boolean;
    has_lcm_override?: boolean;
    has_speaker?: boolean;
    has_temperature: boolean;
    hash_id: string;
    hide_ch_width?: string;
    hw_caps: number;
    ids_ips_last_known_signature?: string;
    ids_ips_signature?: NetworkDeviceIdsIpsSignature;
    inform_ip: string;
    inform_url: string;
    internet?: boolean;
    ip: string;
    ipv4_active_leases?: NetworkDeviceIpv4ActiveLeases;
    ipv6: string[];
    is_access_point: boolean;
    isolated?: boolean;
    jumboframe_enabled?: boolean;
    kernel_version: string;
    known_cfgversion: string;
    "lan-num_sta"?: number;
    lan_ip?: string;
    last_config_applied_successfully?: boolean;
    last_connection_network_id: string;
    last_connection_network_name: string;
    last_seen: number;
    last_uplink: NetworkDeviceLastUplink;
    last_wan_ip?: string;
    lcm_brightness?: number;
    lcm_brightness_override?: boolean;
    lcm_idle_timeout_override?: boolean;
    lcm_night_mode_begins?: string;
    lcm_night_mode_enabled?: boolean;
    lcm_night_mode_ends?: string;
    lcm_orientation_override?: number;
    lcm_tracker_enabled?: boolean;
    lcm_tracker_seed?: string;
    led_override?: string;
    led_override_color?: string;
    led_override_color_brightness?: number;
    led_state?: NetworkDeviceLedState;
    license_state: string;
    lldp_table: NetworkDeviceLldpTable[];
    locating: boolean;
    mac: string;
    manufacturer_id: number;
    mesh_sta_vap_enabled?: boolean;
    meshv3_peer_mac?: string;
    mgmt_network_id?: string;
    min_inform_interval_seconds: number;
    model: string;
    model_in_eol: boolean;
    model_in_lts: boolean;
    model_incompatible: boolean;
    name: string;
    network_table?: NetworkDeviceNetworkTable[];
    next_interval: number;
    num_desktop?: number;
    num_handheld?: number;
    num_mobile?: number;
    num_sta: number;
    outdoor_mode_override: string;
    overheating?: boolean;
    port_overrides?: NetworkDevicePortOverride[];
    port_table?: NetworkDevicePortTable[];
    power_source_ctrl_enabled?: boolean;
    prev_non_busy_state: number;
    provisioned_at: number;
    radio_table?: NetworkDeviceRadioTable[];
    radio_table_stats?: NetworkDeviceRadioTableStat[];
    radiusprofile_id?: string;
    reboot_duration: number;
    reported_networks?: NetworkDeviceReportedNetwork[];
    required_version: string;
    rollupgrade: boolean;
    rps?: NetworkDeviceRps;
    rx_bytes: number;
    "rx_bytes-d"?: number;
    safe_for_autoupgrade: boolean;
    satisfaction?: number;
    scan_radio_table?: any[];
    scanning?: boolean;
    serial: string;
    setup_id: string;
    shortname: string;
    site_id: string;
    setup_provision_completed?: boolean;
    setup_provision_tracking?: boolean;
    slimcfg_caps?: number;
    snmp_contact: string;
    snmp_location: string;
    spectrum_scanning?: boolean;
    "speedtest-status"?: NetworkDeviceSpeedtestStatus;
    ssh_session_table: any[];
    start_connected_millis: number;
    start_disconnected_millis: number;
    startup_timestamp: number;
    stat?: NetworkDeviceStat;
    state: number;
    storage?: NetworkDeviceStorage[];
    stp_priority?: string;
    stp_version?: string;
    support_wifi6e?: boolean;
    supports_fingerprint_ml?: boolean;
    switch_caps: NetworkDeviceSwitchCaps;
    sys_error_caps: number;
    sys_stats: NetworkDeviceSysStats;
    sysid: number;
    syslog_key: string;
    "system-stats": NetworkDeviceSystemStats;
    teleport_version?: string;
    temperatures?: NetworkDeviceTemperature[];
    total_max_power?: number;
    total_used_power?: number;
    two_phase_adopt: boolean;
    tx_bytes: number;
    "tx_bytes-d"?: number;
    type: string;
    udapi_caps?: number;
    udapi_version?: NetworkDeviceUdapiVersion;
    unsupported: boolean;
    unsupported_reason: number;
    upgradable: boolean;
    upgrade_duration: number;
    uplink?: NetworkDeviceUplink;
    uplink_depth: number;
    uptime: number;
    uptime_stats?: NetworkDeviceUptimeStats;
    "user-lan-num_sta"?: number;
    "user-num_sta": number;
    "user-wlan-num_sta"?: number;
    usg2_caps?: number;
    usg_caps?: number;
    vap_table?: NetworkDeviceVapTable[];
    version: string;
    wan1?: NetworkDeviceWanStats;
    wan2?: NetworkDeviceWanStats;
    vwireEnabled?: boolean;
    vwire_table?: any[];
    vwire_vap_table?: any[];
    wifi_caps?: number;
    wifi_caps2?: number;
    x_aes_gcm: boolean;
    x_authkey: string;
    x_has_ssh_hostkey: boolean;
    x_inform_authkey?: string;
    x_ssh_hostkey_fingerprint?: string;
    x_vwirekey?: string;
    iobTimestamp: number;
}
interface NetworkDeviceActiveGeoInfo {
    WAN: NetworkDeviceWan;
    WAN2: NetworkDeviceWan;
}
interface NetworkDeviceAntennaTable {
    default: boolean;
    id: number;
    name: string;
    wifi0_gain: number;
    wifi1_gain: number;
}
interface NetworkDeviceConfigNetwork {
    bonding_enabled: boolean;
    dns1: string;
    dns2: string;
    dnssuffix: string;
    gateway: string;
    ip: string;
    netmask: string;
    type: string;
}
interface NetworkDeviceConfigNetworkLan {
    cidr: string;
    dhcp_enabled: boolean;
    dhcp_range_start: string;
    dhcp_range_stop: string;
    vlan: number;
}
interface NetworkDeviceDetailedStates {
    device_near_power_limit: boolean;
}
interface NetworkDeviceDownlinkTable {
    full_duplex: boolean;
    mac: string;
    port_idx: number;
    speed: number;
}
interface NetworkDeviceEthernetTable {
    mac: string;
    name: string;
    num_port?: number;
}
interface NetworkDeviceLastUplink {
    port_idx: number;
    type: string;
    uplink_device_name: string;
    uplink_mac: string;
    uplink_remote_port: number;
}
interface NetworkDeviceLldpTable {
    chassis_id: string;
    is_wired: boolean;
    local_port_idx: number;
    local_port_name: string;
    port_id: string;
}
interface NetworkDeviceRadioTable {
    antenna_gain: number;
    antenna_id: number;
    builtin_ant_gain: number;
    builtin_antenna: boolean;
    channel: number;
    channel_optimization_enabled: boolean;
    current_antenna_gain: number;
    ht: number;
    is_11ac: boolean;
    is_11ax: boolean;
    max_txpower: number;
    min_rssi_enabled: boolean;
    min_txpower: number;
    name: string;
    nss: number;
    radio: string;
    radio_caps: number;
    radio_caps2: number;
    tx_power_mode: string;
    vwire_enabled: boolean;
    has_dfs?: boolean;
    has_fccdfs?: boolean;
    has_ht160?: boolean;
}
export interface NetworkDeviceRadioTableStat {
    ast_be_xmit: any;
    ast_cst: any;
    ast_txto: any;
    channel: number;
    cu_self_rx: number;
    cu_self_tx: number;
    cu_total: number;
    extchannel: number;
    gain: number;
    "guest-num_sta": number;
    last_channel: number;
    name: string;
    num_sta: number;
    radio: string;
    satisfaction: number;
    state: string;
    tx_packets: number;
    tx_power: number;
    tx_retries: number;
    "user-num_sta": number;
}
interface NetworkDevicePortOverride {
    name: string;
    poe_mode?: string;
    port_idx: number;
    portconf_id?: string;
    setting_preference: string;
    autoneg?: boolean;
    dot1x_ctrl?: string;
    dot1x_idle_timeout?: number;
    egress_rate_limit_kbps_enabled?: boolean;
    forward?: string;
    isolation?: boolean;
    lldpmed_enabled?: boolean;
    native_networkconf_id?: string;
    op_mode?: string;
    port_keepalive_enabled?: boolean;
    port_security_enabled?: boolean;
    port_security_mac_address?: string[];
    stormctrl_bcast_enabled?: boolean;
    stormctrl_bcast_rate?: number;
    stormctrl_mcast_enabled?: boolean;
    stormctrl_mcast_rate?: number;
    stormctrl_ucast_enabled?: boolean;
    stormctrl_ucast_rate?: number;
    stp_port_mode?: boolean;
    tagged_vlan_mgmt?: string;
    voice_networkconf_id?: string;
    excluded_networkconf_ids?: string[];
}
export interface NetworkDevicePortTable {
    aggregated_by: boolean;
    anomalies: number;
    autoneg: boolean;
    "bytes-r": number;
    dot1x_mode: string;
    dot1x_status: string;
    enable: boolean;
    flowctrl_rx: boolean;
    flowctrl_tx: boolean;
    forward: string;
    full_duplex: boolean;
    is_uplink: boolean;
    jumbo: boolean;
    mac_table_count: number;
    masked: boolean;
    media: string;
    name: string;
    op_mode: string;
    poe_caps: number;
    poe_class?: string;
    poe_current?: string;
    poe_enable?: boolean;
    poe_good?: boolean;
    poe_mode?: string;
    poe_power?: string;
    poe_voltage?: string;
    port_idx: number;
    port_poe: boolean;
    portconf_id?: string;
    rx_broadcast: number;
    rx_bytes: number;
    "rx_bytes-r": number;
    rx_dropped: number;
    rx_errors: number;
    rx_multicast: number;
    rx_packets: number;
    satisfaction: number;
    satisfaction_reason: number;
    setting_preference?: string;
    speed: number;
    speed_caps: number;
    stp_pathcost: number;
    stp_state: string;
    tx_broadcast: number;
    tx_bytes: number;
    "tx_bytes-r": number;
    tx_dropped: number;
    tx_errors: number;
    tx_multicast: number;
    tx_packets: number;
    up: boolean;
    dot1x_ctrl?: string;
    dot1x_idle_timeout?: number;
    egress_rate_limit_kbps_enabled?: boolean;
    isolation?: boolean;
    lldpmed_enabled?: boolean;
    native_networkconf_id?: string;
    port_keepalive_enabled?: boolean;
    port_security_enabled?: boolean;
    port_security_mac_address?: string[];
    stormctrl_bcast_enabled?: boolean;
    stormctrl_bcast_rate?: number;
    stormctrl_mcast_enabled?: boolean;
    stormctrl_mcast_rate?: number;
    stormctrl_ucast_enabled?: boolean;
    stormctrl_ucast_rate?: number;
    stp_port_mode?: boolean;
    tagged_vlan_mgmt?: string;
    voice_networkconf_id?: string;
    excluded_networkconf_ids?: string[];
    sfp_compliance?: string;
    sfp_found?: boolean;
    sfp_part?: string;
    sfp_rev?: string;
    sfp_rxfault?: boolean;
    sfp_serial?: string;
    sfp_txfault?: boolean;
    sfp_vendor?: string;
}
interface NetworkDeviceRps {
    power_management_mode: string;
    rps_port_table: NetworkDeviceRpsPortTable[];
}
interface NetworkDeviceRpsPortTable {
    name: string;
    port_idx: number;
    port_mode: string;
}
interface NetworkDeviceSwitchCaps {
    etherlight_caps: number;
    feature_caps: number;
    max_aggregate_sessions: number;
    max_class_maps: number;
    max_custom_ip_acls: number;
    max_custom_mac_acls: number;
    max_global_acls: number;
    max_l3_intf: number;
    max_mirror_sessions: number;
    max_qos_profiles: number;
    max_reserved_routes: number;
    max_static_routes: number;
    max_vlan_count: number;
    vlan_caps: number;
}
interface NetworkDeviceSysStats {
    loadavg_1: string;
    loadavg_15: string;
    loadavg_5: string;
    mem_buffer: number;
    mem_total: number;
    mem_used: number;
}
interface NetworkDeviceSystemStats {
    cpu: string;
    mem: string;
    uptime: string;
}
interface NetworkDeviceUplink {
    full_duplex: boolean;
    ip: string;
    mac: string;
    max_speed: number;
    media: string;
    name: string;
    netmask: string;
    num_port: number;
    port_idx: number;
    rx_bytes: number;
    "rx_bytes-r": number;
    rx_dropped: number;
    rx_errors: number;
    rx_multicast: number;
    rx_packets: number;
    speed: number;
    tx_bytes: number;
    "tx_bytes-r": number;
    tx_dropped: number;
    tx_errors: number;
    tx_packets: number;
    type: string;
    up: boolean;
    uplink_device_name: string;
    uplink_mac: string;
    uplink_remote_port: number;
    uplink_source: string;
}
export interface NetworkDeviceVapTable {
    anomalies_bar_chart: NetworkDeviceAnomaliesBarChart;
    anomalies_bar_chart_now: NetworkDeviceAnomaliesBarChart;
    ap_mac: string;
    avg_client_signal: number;
    bssid: string;
    bw: number;
    ccq: number;
    channel: number;
    dns_avg_latency: number;
    essid: string;
    extchannel?: number;
    icmp_avg_rtt: number;
    id: string;
    is_guest: boolean;
    is_wep: boolean;
    mac_filter_rejections: number;
    map_id: any;
    name: string;
    num_satisfaction_sta: number;
    num_sta: number;
    radio: string;
    radio_name: string;
    reasons_bar_chart: NetworkDeviceReasonsBarChart;
    reasons_bar_chart_now: NetworkDeviceReasonsBarChart;
    rx_bytes: number;
    rx_crypts: number;
    rx_dropped: number;
    rx_errors: number;
    rx_frags: number;
    rx_nwids: number;
    rx_packets: number;
    rx_tcp_stats: NetworkDeviceRxTcpStats;
    satisfaction: number;
    site_id: string;
    state: string;
    t: string;
    tx_bytes: number;
    tx_combined_retries: number;
    tx_data_mpdu_bytes: number;
    tx_dropped: number;
    tx_errors: number;
    tx_packets: number;
    tx_power: number;
    tx_retries: number;
    tx_rts_retries: number;
    tx_success: number;
    tx_tcp_stats: NetworkDeviceTxTcpStats;
    tx_total: number;
    up: boolean;
    usage: string;
    wifi_tx_attempts: number;
    wifi_tx_dropped: number;
    wifi_tx_latency_mov?: NetworkDeviceWifiTxLatencyMov;
    wlanconf_id: string;
}
interface NetworkDeviceWan {
    accuracy: number;
    address: string;
    asn: number;
    city: string;
    continent_code: string;
    country_code: string;
    country_name: string;
    isp_name: string;
    isp_organization: string;
    latitude: number;
    longitude: number;
    timezone: string;
}
interface NetworkDeviceAnomaliesBarChart {
    high_disconnect_count: number;
    high_dns_latency: number;
    high_icmp_rtt: number;
    high_tcp_latency: number;
    high_tcp_packet_loss: number;
    high_wifi_drops: number;
    high_wifi_latency: number;
    high_wifi_retries: number;
    low_phy_rate: number;
    no_dhcp_response: number;
    poor_stream_eff: number;
    sleepy_client: number;
    sta_arp_timeout: number;
    sta_dns_timeout: number;
    sta_ip_timeout: number;
    weak_signal: number;
}
interface NetworkDeviceReasonsBarChart {
    no_dhcp_response: number;
    phy_rate: number;
    signal: number;
    sleepy_client: number;
    sta_arp_timeout: number;
    sta_disconnects: number;
    sta_dns_latency: number;
    sta_dns_timeout: number;
    sta_icmp_rtt: number;
    sta_ip_timeout: number;
    stream_eff: number;
    tcp_latency: number;
    tcp_packet_loss: number;
    wifi_drops: number;
    wifi_latency: number;
    wifi_retries: number;
}
interface NetworkDeviceRxTcpStats {
    goodbytes: number;
    lat_avg: number;
    lat_max: number;
    lat_min: number;
    lat_samples: number;
    lat_sum: number;
    retries: number;
    stalls: number;
}
interface NetworkDeviceTxTcpStats {
    goodbytes: number;
    lat_avg: number;
    lat_max: number;
    lat_min: number;
    lat_samples: number;
    lat_sum: number;
    retries: number;
    stalls: number;
}
interface NetworkDeviceWifiTxLatencyMov {
    avg: number;
    max: number;
    min: number;
    total: number;
    total_count: number;
}
interface NetworkDeviceDhcpExcludedIpList {
    excluded_ip_list: NetworkDeviceExcludedIpList[];
    time: number;
}
interface NetworkDeviceExcludedIpList {
    address: string;
    mac: string;
}
interface NetworkDeviceEthernetOverride {
    ifname: string;
    networkgroup: string;
}
interface NetworkDeviceGeoInfo {
    WAN: NetworkDeviceWan;
    WAN2: NetworkDeviceWan;
}
interface NetworkDeviceLedState {
    pattern: string;
    tempo: number;
}
interface NetworkDeviceNetworkTable {
    _id: string;
    dhcpd_dns_1: string;
    dhcpd_dns_2?: string;
    dhcpd_dns_enabled: boolean;
    dhcpd_start: string;
    dhcpd_stop: string;
    dpistats_table: NetworkDeviceDpistatsTable;
    enabled: boolean;
    gateway_interface_name: string;
    ip: string;
    ip_subnet: string;
    is_guest: boolean;
    local_port?: number;
    name: string;
    num_sta: number;
    purpose: string;
    rx_bytes: number;
    rx_packets: number;
    setting_preference: string;
    site_id: string;
    tx_bytes: number;
    tx_packets: number;
    up: boolean;
    vpn_client_configuration_remote_ip_override?: string;
    vpn_client_configuration_remote_ip_override_enabled?: boolean;
    vpn_type?: string;
    wireguard_id?: number;
    wireguard_interface?: string;
    wireguard_local_wan_ip?: string;
    wireguard_public_key?: string;
    x_wireguard_private_key?: string;
    active_dhcp_lease_count?: number;
    attr_hidden_id?: string;
    attr_no_delete?: boolean;
    auto_scale_enabled?: boolean;
    dhcp_relay_enabled?: boolean;
    dhcpd_boot_enabled?: boolean;
    dhcpd_conflict_checking?: boolean;
    dhcpd_dns_3?: string;
    dhcpd_enabled?: boolean;
    dhcpd_gateway_enabled?: boolean;
    dhcpd_leasetime?: number;
    dhcpd_ntp_enabled?: boolean;
    dhcpd_tftp_server?: string;
    dhcpd_time_offset_enabled?: boolean;
    dhcpd_unifi_controller?: string;
    dhcpd_wpad_url?: string;
    dhcpdv6_allow_slaac?: boolean;
    dhcpdv6_dns_auto?: boolean;
    dhcpdv6_leasetime?: number;
    dhcpdv6_start?: string;
    dhcpdv6_stop?: string;
    dhcpguard_enabled?: boolean;
    domain_name?: string;
    gateway_type?: string;
    igmp_snooping?: boolean;
    internet_access_enabled?: boolean;
    ipv6_client_address_assignment?: string;
    ipv6_enabled?: boolean;
    ipv6_interface_type?: string;
    ipv6_link_local_address?: string;
    ipv6_pd_auto_prefixid_enabled?: boolean;
    ipv6_pd_start?: string;
    ipv6_pd_stop?: string;
    ipv6_ra_enabled?: boolean;
    ipv6_ra_preferred_lifetime?: number;
    ipv6_ra_priority?: string;
    ipv6_setting_preference?: string;
    is_nat?: boolean;
    lte_lan_enabled?: boolean;
    mac?: string;
    mdns_enabled?: boolean;
    nat_outbound_ip_addresses?: any[];
    networkgroup?: string;
    upnp_lan_enabled?: boolean;
    vlan_enabled?: boolean;
    network_isolation_enabled?: boolean;
    vlan: any;
    vpn_combined_enabled?: boolean;
    igmp_forward_unknown_multicast?: boolean;
    dhcpd_gateway?: string;
}
interface NetworkDeviceDpistatsTable {
    by_app: NetworkDeviceByApp[];
    by_cat: NetworkDeviceByCat[];
    last_updated: number;
}
interface NetworkDeviceByApp {
    app: number;
    cat: number;
    clients: NetworkDeviceClient[];
    known_clients: number;
    rx_bytes: number;
    rx_packets: number;
    tx_bytes: number;
    tx_packets: number;
}
interface NetworkDeviceClient {
    mac: string;
    rx_bytes: number;
    rx_packets: number;
    tx_bytes: number;
    tx_packets: number;
}
interface NetworkDeviceByCat {
    apps: number[];
    cat: number;
    rx_bytes: number;
    rx_packets: number;
    tx_bytes: number;
    tx_packets: number;
}
interface NetworkDeviceIdsIpsSignature {
    rule_count: number;
    sha_256: string;
    signature_type: string;
    update_time: number;
}
interface NetworkDeviceIpv4ActiveLeases {
    active_leases: NetworkDeviceActiveLease[];
    time: number;
}
interface NetworkDeviceActiveLease {
    leaseExpiry: number;
    mac: string;
}
interface NetworkDeviceReportedNetwork {
    address: string;
    name: string;
}
export interface NetworkDeviceTemperature {
    name: string;
    type: string;
    value: number;
}
interface NetworkDeviceUdapiVersion {
    path: string;
    version: number;
    versionFormat: string;
}
interface NetworkDeviceUptimeStats {
    WAN: NetworkDeviceWanUptimeStats;
    WAN2: NetworkDeviceWanUptimeStats;
}
interface NetworkDeviceWanUptimeStats {
    alerting_monitors: NetworkDeviceAlertingMonitor[];
    availability: number;
    latency_average: number;
    monitors: NetworkDeviceMonitor[];
    time_period: number;
    uptime: number;
}
interface NetworkDeviceAlertingMonitor {
    availability: number;
    latency_average: number;
    target: string;
    type: string;
}
interface NetworkDeviceMonitor {
    availability: number;
    latency_average: number;
    target: string;
    type: string;
}
interface NetworkDeviceWanStats {
    autoneg: boolean;
    availability: number;
    "bytes-r": number;
    dns: string[];
    enable: boolean;
    error_disabled: boolean;
    flowctrl_rx: boolean;
    flowctrl_tx: boolean;
    full_duplex: boolean;
    ifname: string;
    ip: string;
    ipv6: string[];
    is_uplink: boolean;
    latency: number;
    mac: string;
    mac_table: NetworkDeviceMacTable[];
    max_speed: number;
    media: string;
    name: string;
    netmask: string;
    num_port: number;
    poe_enable: boolean;
    poe_power: string;
    port_idx: number;
    port_poe: boolean;
    rx_broadcast: number;
    rx_bytes: number;
    "rx_bytes-r": number;
    rx_dropped: number;
    rx_errors: number;
    rx_multicast: number;
    rx_packets: number;
    rx_rate: number;
    "rx_rate-max": number;
    speed: number;
    speed_caps: number;
    tx_broadcast: number;
    tx_bytes: number;
    "tx_bytes-r": number;
    tx_dropped: number;
    tx_errors: number;
    tx_multicast: number;
    tx_packets: number;
    tx_rate: number;
    "tx_rate-max": number;
    type: string;
    up: boolean;
    uplink_ifname: string;
}
interface NetworkDeviceMacTable {
    age: number;
    authorized: boolean;
    hostname: string;
    ip: string;
    lastReachable: number;
    mac: string;
}
export interface NetworkDeviceSpeedtestStatus {
    latency: number;
    rundate: number;
    runtime: number;
    server: NetworkDeviceServer;
    source_interface: string;
    status_download: number;
    status_ping: number;
    status_summary: number;
    status_upload: number;
    xput_download: number;
    xput_upload: number;
}
export interface NetworkDeviceServer {
    cc: string;
    city: string;
    country: string;
    lat: number;
    lon: number;
    provider: string;
    provider_url: string;
}
export interface NetworkDeviceStorage {
    mount_point: string;
    name: string;
    size: number;
    type: string;
    used: number;
}
export interface NetworkDeviceStat {
    sw?: NetworkDeviceStatSwitch;
    gw?: NetworkDeviceStatGateway;
    ap?: NetworkDeviceStatAccessPoint;
}
export interface NetworkDeviceStatSwitch {
    duration?: number;
    rx_bytes?: number;
    tx_bytes?: number;
}
export interface NetworkDeviceStatGateway {
    duration?: number;
    "wan-rx_bytes"?: number;
    "wan-tx_bytes"?: number;
    "wan2-rx_bytes"?: number;
    "wan2-tx_bytes"?: number;
}
export interface NetworkDeviceStatAccessPoint {
    ap?: string;
    bytes?: number;
    "client-rx_bytes"?: number;
    "client-tx_bytes"?: number;
    datetime?: string;
    duration?: number;
    "guest-duration"?: number;
    "guest-mac_filter_rejections"?: number;
    "guest-rx_bytes"?: number;
    "guest-rx_crypts"?: number;
    "guest-rx_dropped"?: number;
    "guest-rx_errors"?: number;
    "guest-rx_frags"?: number;
    "guest-rx_packets"?: number;
    "guest-tx_bytes"?: number;
    "guest-tx_dropped"?: number;
    "guest-tx_errors"?: number;
    "guest-tx_packets"?: number;
    "guest-tx_retries"?: number;
    "guest-wifi0-duration"?: number;
    "guest-wifi0-mac_filter_rejections"?: number;
    "guest-wifi0-rx_bytes"?: number;
    "guest-wifi0-rx_crypts"?: number;
    "guest-wifi0-rx_dropped"?: number;
    "guest-wifi0-rx_errors"?: number;
    "guest-wifi0-rx_frags"?: number;
    "guest-wifi0-rx_packets"?: number;
    "guest-wifi0-tx_bytes"?: number;
    "guest-wifi0-tx_dropped"?: number;
    "guest-wifi0-tx_errors"?: number;
    "guest-wifi0-tx_packets"?: number;
    "guest-wifi0-tx_retries"?: number;
    "guest-wifi0-wifi_tx_attempts"?: number;
    "guest-wifi0-wifi_tx_dropped"?: number;
    "guest-wifi1-duration"?: number;
    "guest-wifi1-mac_filter_rejections"?: number;
    "guest-wifi1-rx_bytes"?: number;
    "guest-wifi1-rx_crypts"?: number;
    "guest-wifi1-rx_dropped"?: number;
    "guest-wifi1-rx_errors"?: number;
    "guest-wifi1-rx_frags"?: number;
    "guest-wifi1-rx_packets"?: number;
    "guest-wifi1-tx_bytes"?: number;
    "guest-wifi1-tx_dropped"?: number;
    "guest-wifi1-tx_errors"?: number;
    "guest-wifi1-tx_packets"?: number;
    "guest-wifi1-tx_retries"?: number;
    "guest-wifi1-wifi_tx_attempts"?: number;
    "guest-wifi1-wifi_tx_dropped"?: number;
    "guest-wifi_tx_attempts"?: number;
    "guest-wifi_tx_dropped"?: number;
    mac_filter_rejections?: number;
    "na-WIFI_4-rx_bytes"?: number;
    "na-WIFI_4-tx_bytes"?: number;
    "na-WIFI_5-rx_bytes"?: number;
    "na-WIFI_5-tx_bytes"?: number;
    "na-WIFI_6-rx_bytes"?: number;
    "na-WIFI_6-tx_bytes"?: number;
    "na-rx_bytes"?: number;
    "na-rx_packets"?: number;
    "na-signal_40-duration"?: number;
    "na-signal_40-tx_retries"?: number;
    "na-signal_40-wifi_tx_attempts"?: number;
    "na-signal_50-duration"?: number;
    "na-signal_50-tx_retries"?: number;
    "na-signal_50-wifi_tx_attempts"?: number;
    "na-signal_60-duration"?: number;
    "na-signal_60-tx_retries"?: number;
    "na-signal_60-wifi_tx_attempts"?: number;
    "na-signal_70-duration"?: number;
    "na-signal_70-tx_retries"?: number;
    "na-signal_70-wifi_tx_attempts"?: number;
    "na-signal_80-duration"?: number;
    "na-signal_80-tx_retries"?: number;
    "na-signal_80-wifi_tx_attempts"?: number;
    "na-signal_90-duration"?: number;
    "na-signal_90-tx_retries"?: number;
    "na-signal_90-wifi_tx_attempts"?: number;
    "na-tx_bytes"?: number;
    "na-tx_packets"?: number;
    "na-tx_retries"?: number;
    "na-wifi_tx_attempts"?: number;
    "na-wifi_tx_dropped"?: number;
    "ng-WIFI_4-rx_bytes"?: number;
    "ng-WIFI_4-tx_bytes"?: number;
    "ng-WIFI_6-rx_bytes"?: number;
    "ng-WIFI_6-tx_bytes"?: number;
    "ng-rx_bytes"?: number;
    "ng-rx_packets"?: number;
    "ng-signal_40-duration"?: number;
    "ng-signal_40-tx_retries"?: number;
    "ng-signal_40-wifi_tx_attempts"?: number;
    "ng-signal_50-duration"?: number;
    "ng-signal_50-tx_retries"?: number;
    "ng-signal_50-wifi_tx_attempts"?: number;
    "ng-signal_60-duration"?: number;
    "ng-signal_60-tx_retries"?: number;
    "ng-signal_60-wifi_tx_attempts"?: number;
    "ng-signal_70-duration"?: number;
    "ng-signal_70-tx_retries"?: number;
    "ng-signal_70-wifi_tx_attempts"?: number;
    "ng-signal_80-duration"?: number;
    "ng-signal_80-tx_retries"?: number;
    "ng-signal_80-wifi_tx_attempts"?: number;
    "ng-signal_90-duration"?: number;
    "ng-signal_90-tx_retries"?: number;
    "ng-signal_90-wifi_tx_attempts"?: number;
    "ng-tx_bytes"?: number;
    "ng-tx_packets"?: number;
    "ng-tx_retries"?: number;
    "ng-wifi_tx_attempts"?: number;
    "ng-wifi_tx_dropped"?: number;
    num_wifi_roam_to_events?: number;
    o?: string;
    oid?: string;
    rx_bytes?: number;
    rx_crypts?: number;
    rx_dropped?: number;
    rx_errors?: number;
    rx_frags?: number;
    rx_packets?: number;
    "signal_40-duration"?: number;
    "signal_50-duration"?: number;
    "signal_60-duration"?: number;
    "signal_70-duration"?: number;
    "signal_80-duration"?: number;
    "signal_90-duration"?: number;
    site_id?: string;
    time?: number;
    tx_bytes?: number;
    tx_dropped?: number;
    tx_errors?: number;
    tx_packets?: number;
    tx_retries?: number;
    "user-duration"?: number;
    "user-mac_filter_rejections"?: number;
    "user-rx_bytes"?: number;
    "user-rx_crypts"?: number;
    "user-rx_dropped"?: number;
    "user-rx_errors"?: number;
    "user-rx_frags"?: number;
    "user-rx_packets"?: number;
    "user-tx_bytes"?: number;
    "user-tx_dropped"?: number;
    "user-tx_errors"?: number;
    "user-tx_packets"?: number;
    "user-tx_retries"?: number;
    "user-wifi0-duration"?: number;
    "user-wifi0-mac_filter_rejections"?: number;
    "user-wifi0-rx_bytes"?: number;
    "user-wifi0-rx_crypts"?: number;
    "user-wifi0-rx_dropped"?: number;
    "user-wifi0-rx_errors"?: number;
    "user-wifi0-rx_frags"?: number;
    "user-wifi0-rx_packets"?: number;
    "user-wifi0-tx_bytes"?: number;
    "user-wifi0-tx_dropped"?: number;
    "user-wifi0-tx_errors"?: number;
    "user-wifi0-tx_packets"?: number;
    "user-wifi0-tx_retries"?: number;
    "user-wifi0-wifi_tx_attempts"?: number;
    "user-wifi0-wifi_tx_dropped"?: number;
    "user-wifi1-duration"?: number;
    "user-wifi1-mac_filter_rejections"?: number;
    "user-wifi1-rx_bytes"?: number;
    "user-wifi1-rx_crypts"?: number;
    "user-wifi1-rx_dropped"?: number;
    "user-wifi1-rx_errors"?: number;
    "user-wifi1-rx_frags"?: number;
    "user-wifi1-rx_packets"?: number;
    "user-wifi1-tx_bytes"?: number;
    "user-wifi1-tx_dropped"?: number;
    "user-wifi1-tx_errors"?: number;
    "user-wifi1-tx_packets"?: number;
    "user-wifi1-tx_retries"?: number;
    "user-wifi1-wifi_tx_attempts"?: number;
    "user-wifi1-wifi_tx_dropped"?: number;
    "user-wifi_tx_attempts"?: number;
    "user-wifi_tx_dropped"?: number;
    "wifi0-duration"?: number;
    "wifi0-mac_filter_rejections"?: number;
    "wifi0-rx_bytes"?: number;
    "wifi0-rx_crypts"?: number;
    "wifi0-rx_dropped"?: number;
    "wifi0-rx_errors"?: number;
    "wifi0-rx_frags"?: number;
    "wifi0-rx_packets"?: number;
    "wifi0-tx_bytes"?: number;
    "wifi0-tx_dropped"?: number;
    "wifi0-tx_errors"?: number;
    "wifi0-tx_packets"?: number;
    "wifi0-tx_retries"?: number;
    "wifi0-wifi_tx_attempts"?: number;
    "wifi0-wifi_tx_dropped"?: number;
    "wifi1-duration"?: number;
    "wifi1-mac_filter_rejections"?: number;
    "wifi1-rx_bytes"?: number;
    "wifi1-rx_crypts"?: number;
    "wifi1-rx_dropped"?: number;
    "wifi1-rx_errors"?: number;
    "wifi1-rx_frags"?: number;
    "wifi1-rx_packets"?: number;
    "wifi1-tx_bytes"?: number;
    "wifi1-tx_dropped"?: number;
    "wifi1-tx_errors"?: number;
    "wifi1-tx_packets"?: number;
    "wifi1-tx_retries"?: number;
    "wifi1-wifi_tx_attempts"?: number;
    "wifi1-wifi_tx_dropped"?: number;
    wifi_tx_attempts?: number;
    wifi_tx_dropped?: number;
}
export {};
