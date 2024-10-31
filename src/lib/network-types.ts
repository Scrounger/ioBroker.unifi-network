export interface NetworkEvent {
    meta: NetworkEventMeta;
    data: any;
}

export interface NetworkEventMeta {
    message: string;
    rc: string;
    mac?: string;
    product_line: string;
}
