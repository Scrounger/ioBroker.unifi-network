export enum SystemLogType {
    critical = 'next-ai-alert',
    devices = 'device-alert',
    admin = 'admin-activity',
    updates = 'update-alert',
    clients = 'client-alert',
    threats = 'threat-alert',
    triggers = 'triggers',
    vpn = 'vpn-alert'
}


export interface SystemLog {
    data?: SystemLogData[]
    page_number?: number
    total_element_count?: number
    total_page_count?: number
}

export interface SystemLogData {
    category?: string
    id?: string
    key?: string
    message?: string
    message_raw?: string
    parameters?: SystemLogParameters
    severity?: string
    show_on_dashboard?: boolean
    status?: string
    target?: string
    timestamp?: number
    title_raw?: string
    type?: string
    destination?: SystemLogDestination
    source?: SystemLogSource
    trigger?: SystemLogTrigger
}

export interface SystemLogParameters {
    ACTION?: SystemLogAction
    CONSOLE_NAME?: SystemLogConsoleName
    DEVICE?: SystemLogDeviceOrClient
    CLIENT?: SystemLogDeviceOrClient
}

export interface SystemLogAction {
    id?: string
    name?: string
}

export interface SystemLogConsoleName {
    id?: string
    name?: string
}

export interface SystemLogDeviceOrClient {
    device_fingerprint_id?: number
    fingerprint_source?: number
    id?: string
    model?: string
    model_name?: string
    name?: string
}


export interface SystemLogDestination {
    ip?: string
    mac?: string
    port?: number
}

export interface SystemLogSource {
    ip?: string
    mac?: string
    name?: string
    port?: number
    type?: string
}

export interface SystemLogTrigger {
    trigger_id?: string
    type?: string
}