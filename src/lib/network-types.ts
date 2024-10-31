export interface NetworkEvent {
    meta: NetworkEventMeta;
    data: Array<{ [key: string]: boolean | number | object | string }>;
}

export interface NetworkEventMeta {
    message: string;
    rc: string;
    mac?: string;
    product_line: string;
}
