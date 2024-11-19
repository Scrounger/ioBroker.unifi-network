export interface NetworkLanConfig_V2 {
    configuration: NetworkLanConfig
    details: NetworkLanConfigDetails
    statistics: NetworkLanConfigStatistics
}

export interface NetworkLanConfig {
    setting_preference?: string
    dhcpdv6_dns_auto?: boolean
    ipv6_pd_stop?: string
    dhcpd_gateway_enabled?: boolean
    dhcpd_dns_1?: string
    ipv6_client_address_assignment?: string
    dhcpd_start?: string
    dhcpd_unifi_controller?: string
    ipv6_ra_enabled?: boolean
    domain_name?: string
    ip_subnet?: string
    ipv6_interface_type?: string
    dhcpd_dns_2?: string
    dhcpd_dns_3?: string
    dhcpdv6_stop?: string
    is_nat?: boolean
    dhcpd_dns_enabled?: boolean
    internet_access_enabled?: boolean
    nat_outbound_ip_addresses?: string[]
    dhcp_relay_enabled?: boolean
    dhcpd_conflict_checking?: boolean
    ipv6_pd_auto_prefixid_enabled?: boolean
    name?: string
    site_id?: string
    dhcpdv6_leasetime?: number
    ipv6_enabled?: boolean
    _id?: string
    lte_lan_enabled?: boolean
    purpose?: string
    dhcpd_leasetime?: number
    igmp_snooping?: boolean
    dhcpd_time_offset_enabled?: boolean
    dhcpguard_enabled?: boolean
    dhcpdv6_allow_slaac?: boolean
    ipv6_ra_preferred_lifetime?: number
    dhcpd_stop?: string
    enabled?: boolean
    dhcpd_enabled?: boolean
    dhcpd_wpad_url?: string
    networkgroup?: string
    dhcpdv6_start?: string
    vlan_enabled?: boolean
    ipv6_setting_preference?: string
    gateway_type?: string
    ipv6_ra_priority?: string
    dhcpd_boot_enabled?: boolean
    ipv6_pd_start?: string
    upnp_lan_enabled?: boolean
    dhcpd_ntp_enabled?: boolean
    mdns_enabled?: boolean
    attr_no_delete?: boolean
    attr_hidden_id?: string
    dhcpd_tftp_server?: string
    auto_scale_enabled?: boolean
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
