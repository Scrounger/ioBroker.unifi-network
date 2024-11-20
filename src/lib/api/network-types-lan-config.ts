export interface NetworkLanConfig_V2 {
    configuration: NetworkLanConfig
    details: NetworkLanConfigDetails
    statistics: NetworkLanConfigStatistics
}

export interface NetworkLanConfig {
    _id?: string
    attr_hidden_id?: string
    attr_no_delete?: boolean
    auto_scale_enabled?: boolean
    dhcp_relay_enabled?: boolean
    dhcpd_boot_enabled?: boolean
    dhcpd_conflict_checking?: boolean
    dhcpd_dns_1?: string
    dhcpd_dns_2?: string
    dhcpd_dns_3?: string
    dhcpd_dns_enabled?: boolean
    dhcpd_enabled?: boolean
    dhcpd_gateway_enabled?: boolean
    dhcpd_leasetime?: number
    dhcpd_ntp_enabled?: boolean
    dhcpd_start?: string
    dhcpd_stop?: string
    dhcpd_tftp_server?: string
    dhcpd_time_offset_enabled?: boolean
    dhcpd_unifi_controller?: string
    dhcpd_wpad_url?: string
    dhcpdv6_allow_slaac?: boolean
    dhcpdv6_dns_auto?: boolean
    dhcpdv6_leasetime?: number
    dhcpdv6_start?: string
    dhcpdv6_stop?: string
    dhcpguard_enabled?: boolean
    domain_name?: string
    enabled?: boolean
    gateway_type?: string
    igmp_snooping?: boolean
    internet_access_enabled?: boolean
    ip_subnet?: string
    ipv6_client_address_assignment?: string
    ipv6_enabled?: boolean
    ipv6_interface_type?: string
    ipv6_pd_auto_prefixid_enabled?: boolean
    ipv6_pd_start?: string
    ipv6_pd_stop?: string
    ipv6_ra_enabled?: boolean
    ipv6_ra_preferred_lifetime?: number
    ipv6_ra_priority?: string
    ipv6_setting_preference?: string
    is_nat?: boolean
    lte_lan_enabled?: boolean
    mdns_enabled?: boolean
    name?: string
    nat_outbound_ip_addresses?: any[]
    networkgroup?: string
    purpose?: string
    setting_preference?: string
    site_id?: string
    upnp_lan_enabled?: boolean
    vlan?: string
    vlan_enabled?: boolean
}

interface NetworkLanConfigDetails {
    creation_timestamp?: number
    gateway_interface_name?: string
    gateway_mac?: string
    wan_failover_group?: string
}

interface NetworkLanConfigStatistics {
    dhcp_active_leases?: number
    dhcp_max_leases?: number
}
