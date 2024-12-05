export enum NetworkReportInterval {
    '5minutes' = '5minutes',
    hourly = 'hourly',
    daily = 'daily',
    monthly = 'monthly'
}

export enum NetworkReportType {
    site = 'site',
    gateway = 'gw',
    switch = 'sw',
    accessPoint = 'ap',
    client = 'user'
}

export interface NetworkReportStats {
    time?: number,
    bytes?: number,
    mem?: number,
    cpu?: number,
    loadavg_5?: number,
    wlan_bytes?: number,
    rx_bytes?: number,
    tx_bytes?: number,
    'wan-rx_bytes'?: number,
    'wan-tx_bytes'?: number,
    num_sta?: number,
    'lan-num_sta'?: number,
    'wlan-num_sta'?: number,
    'lan-rx_bytes'?: number,
    'lan-tx_bytes'?: number,
    user?: string,
    sw?: string,
    gw?: string,
    ap?: string,
    o: string,
    oid: string
}