export interface Devices {
    _id: string
    _uptime: number
    adopt_ip: string
    adopt_url: string
    adoptable_when_upgraded: boolean
    adopted: boolean
    adoption_completed: boolean
    anomalies: number
    anon_id: string
    architecture: string
    ble_caps: number
    board_rev: number
    bytes: number
    cfgversion: string
    config_network: ConfigNetwork
    connect_request_ip: string
    connect_request_port: string
    connected_at: number
    connection_network_id: string
    connection_network_name: string
    credential_caps: number
    default: boolean
    detailed_states: DetailedStates
    device_id: string
    dhcp_server_table: any[]
    disconnected_at: number
    discovered_via: string
    displayable_version: string
    dot1x_fallback_networkconf_id: string
    dot1x_portctrl_enabled: boolean
    downlink_lldp_macs: string[]
    downlink_table: DownlinkTable[]
    ethernet_table: EthernetTable[]
    fan_level: number
    flowctrl_enabled: boolean
    fw2_caps: number
    fw_caps: number
    gateway_mac: string
    general_temperature: number
    "guest-num_sta": number
    has_fan: boolean
    has_temperature: boolean
    hash_id: string
    hw_caps: number
    inform_ip: string
    inform_url: string
    internet: boolean
    ip: string
    ipv6: string[]
    is_access_point: boolean
    jumboframe_enabled: boolean
    kernel_version: string
    known_cfgversion: string
    last_connection_network_id: string
    last_connection_network_name: string
    last_seen: number
    last_uplink: LastUplink
    lcm_brightness: number
    lcm_brightness_override: boolean
    lcm_idle_timeout_override: boolean
    lcm_night_mode_begins: string
    lcm_night_mode_enabled: boolean
    lcm_night_mode_ends: string
    lcm_orientation_override: number
    lcm_tracker_enabled: boolean
    lcm_tracker_seed: string
    led_override: string
    led_override_color: string
    led_override_color_brightness: number
    license_state: string
    lldp_table: LldpTable[]
    locating: boolean
    mac: string
    manufacturer_id: number
    mgmt_network_id: string
    min_inform_interval_seconds: number
    model: string
    model_in_eol: boolean
    model_in_lts: boolean
    model_incompatible: boolean
    name: string
    next_interval: number
    num_sta: number
    outdoor_mode_override: string
    overheating: boolean
    port_overrides: PortOverride[]
    port_table: PortTable[]
    power_source_ctrl_enabled: boolean
    prev_non_busy_state: number
    provisioned_at: number
    radiusprofile_id: string
    reboot_duration: number
    required_version: string
    rollupgrade: boolean
    rps: Rps
    rx_bytes: number
    safe_for_autoupgrade: boolean
    satisfaction: number
    serial: string
    setup_id: string
    shortname: string
    site_id: string
    slimcfg_caps: number
    snmp_contact: string
    snmp_location: string
    ssh_session_table: any[]
    start_connected_millis: number
    start_disconnected_millis: number
    startup_timestamp: number
    state: number
    stp_priority: string
    stp_version: string
    switch_caps: SwitchCaps
    sys_error_caps: number
    sys_stats: SysStats
    sysid: number
    syslog_key: string
    "system-stats": SystemStats
    total_max_power: number
    total_used_power: number
    two_phase_adopt: boolean
    tx_bytes: number
    type: string
    unsupported: boolean
    unsupported_reason: number
    upgradable: boolean
    upgrade_duration: number
    uplink: Uplink
    uplink_depth: number
    uptime: number
    "user-num_sta": number
    version: string
    x_aes_gcm: boolean
    x_authkey: string
    x_has_ssh_hostkey: boolean
    x_ssh_hostkey_fingerprint: string
}

export interface ConfigNetwork {
    bonding_enabled: boolean
    dns1: string
    dns2: string
    dnssuffix: string
    gateway: string
    ip: string
    netmask: string
    type: string
}

export interface DetailedStates {
    device_near_power_limit: boolean
}

export interface DownlinkTable {
    full_duplex: boolean
    mac: string
    port_idx: number
    speed: number
}

export interface EthernetTable {
    mac: string
    name: string
    num_port?: number
}

export interface LastUplink {
    port_idx: number
    type: string
    uplink_device_name: string
    uplink_mac: string
    uplink_remote_port: number
}

export interface LldpTable {
    chassis_id: string
    is_wired: boolean
    local_port_idx: number
    local_port_name: string
    port_id: string
}

export interface PortOverride {
    name: string
    poe_mode?: string
    port_idx: number
    portconf_id?: string
    setting_preference: string
    autoneg?: boolean
    dot1x_ctrl?: string
    dot1x_idle_timeout?: number
    egress_rate_limit_kbps_enabled?: boolean
    forward?: string
    isolation?: boolean
    lldpmed_enabled?: boolean
    native_networkconf_id?: string
    op_mode?: string
    port_keepalive_enabled?: boolean
    port_security_enabled?: boolean
    port_security_mac_address?: string[]
    stormctrl_bcast_enabled?: boolean
    stormctrl_bcast_rate?: number
    stormctrl_mcast_enabled?: boolean
    stormctrl_mcast_rate?: number
    stormctrl_ucast_enabled?: boolean
    stormctrl_ucast_rate?: number
    stp_port_mode?: boolean
    tagged_vlan_mgmt?: string
    voice_networkconf_id?: string
    excluded_networkconf_ids?: string[]
}

export interface PortTable {
    aggregated_by: boolean
    anomalies: number
    autoneg: boolean
    "bytes-r": number
    dot1x_mode: string
    dot1x_status: string
    enable: boolean
    flowctrl_rx: boolean
    flowctrl_tx: boolean
    forward: string
    full_duplex: boolean
    is_uplink: boolean
    jumbo: boolean
    mac_table_count: number
    masked: boolean
    media: string
    name: string
    op_mode: string
    poe_caps: number
    poe_class?: string
    poe_current?: string
    poe_enable?: boolean
    poe_good?: boolean
    poe_mode?: string
    poe_power?: string
    poe_voltage?: string
    port_idx: number
    port_poe: boolean
    portconf_id?: string
    rx_broadcast: number
    rx_bytes: number
    "rx_bytes-r": number
    rx_dropped: number
    rx_errors: number
    rx_multicast: number
    rx_packets: number
    satisfaction: number
    satisfaction_reason: number
    setting_preference?: string
    speed: number
    speed_caps: number
    stp_pathcost: number
    stp_state: string
    tx_broadcast: number
    tx_bytes: number
    "tx_bytes-r": number
    tx_dropped: number
    tx_errors: number
    tx_multicast: number
    tx_packets: number
    up: boolean
    dot1x_ctrl?: string
    dot1x_idle_timeout?: number
    egress_rate_limit_kbps_enabled?: boolean
    isolation?: boolean
    lldpmed_enabled?: boolean
    native_networkconf_id?: string
    port_keepalive_enabled?: boolean
    port_security_enabled?: boolean
    port_security_mac_address?: string[]
    stormctrl_bcast_enabled?: boolean
    stormctrl_bcast_rate?: number
    stormctrl_mcast_enabled?: boolean
    stormctrl_mcast_rate?: number
    stormctrl_ucast_enabled?: boolean
    stormctrl_ucast_rate?: number
    stp_port_mode?: boolean
    tagged_vlan_mgmt?: string
    voice_networkconf_id?: string
    excluded_networkconf_ids?: string[]
    sfp_compliance?: string
    sfp_found?: boolean
    sfp_part?: string
    sfp_rev?: string
    sfp_rxfault?: boolean
    sfp_serial?: string
    sfp_txfault?: boolean
    sfp_vendor?: string
}

export interface Rps {
    power_management_mode: string
    rps_port_table: RpsPortTable[]
}

export interface RpsPortTable {
    name: string
    port_idx: number
    port_mode: string
}

export interface SwitchCaps {
    etherlight_caps: number
    feature_caps: number
    max_aggregate_sessions: number
    max_class_maps: number
    max_custom_ip_acls: number
    max_custom_mac_acls: number
    max_global_acls: number
    max_l3_intf: number
    max_mirror_sessions: number
    max_qos_profiles: number
    max_reserved_routes: number
    max_static_routes: number
    max_vlan_count: number
    vlan_caps: number
}

export interface SysStats {
    loadavg_1: string
    loadavg_15: string
    loadavg_5: string
    mem_buffer: number
    mem_total: number
    mem_used: number
}

export interface SystemStats {
    cpu: string
    mem: string
    uptime: string
}

export interface Uplink {
    full_duplex: boolean
    ip: string
    mac: string
    max_speed: number
    media: string
    name: string
    netmask: string
    num_port: number
    port_idx: number
    rx_bytes: number
    "rx_bytes-r": number
    rx_dropped: number
    rx_errors: number
    rx_multicast: number
    rx_packets: number
    speed: number
    tx_bytes: number
    "tx_bytes-r": number
    tx_dropped: number
    tx_errors: number
    tx_packets: number
    type: string
    up: boolean
    uplink_device_name: string
    uplink_mac: string
    uplink_remote_port: number
    uplink_source: string
}
