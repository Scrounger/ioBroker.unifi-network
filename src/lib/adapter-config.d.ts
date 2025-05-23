// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			host: string;
			port: number;
			site: string;
			user: string;
			password: string;
			isUnifiOs: boolean;
			expert: boolean;
			expertAliveInterval: number;
			expertConnectionMaxRetries: number;
			realTimeApiDebounceTime: number;
			apiUpdateInterval: number;
			deviceImageDownload: boolean;
			clientRealtimeDisconnectDebounceTime: number;
			clientOfflineTimeout: number;
			vpnOfflineTimeout: number;
			clientImageDownload: boolean;
			keepIobSynchron: boolean;
			deleteClientsOlderThan: number;
			deleteGuestsOlderThan: number;
			devicesEnabled: boolean;
			clientsEnabled: boolean;
			guestsEnabled: boolean;
			vpnEnabled: boolean;
			wlanConfigEnabled: boolean;
			lanConfigEnabled: boolean;
			deviceIsWhiteList: boolean;
			deviceBlackList: { mac: string }[];
			deviceStatesIsWhiteList: boolean;
			deviceStatesBlackList: { id: string }[];
			clientIsWhiteList: boolean;
			clientBlackList: { mac: string }[];
			clientStatesIsWhiteList: boolean;
			clientStatesBlackList: { id: string }[];
			lanIsWhiteList: boolean;
			lanBlackList: { id: string }[];
			lanStatesIsWhiteList: boolean;
			lanStatesBlackList: { id: string }[];
			wlanIsWhiteList: boolean;
			wlanBlackList: { id: string }[];
			wlanStatesIsWhiteList: boolean;
			wlanStatesBlackList: { id: string }[];
			firewallRuleConfigEnabled: boolean;
			firewallRuleWhiteList: boolean;
			firewallRuleBlackList: { id: string }[];
			firewallRuleStatesIsWhiteList: boolean;
			firewallRuleStatesBlackList: { id: string }[];
			firewallGroupConfigEnabled: boolean;
			firewallGroupWhiteList: boolean;
			firewallGroupBlackList: { id: string }[];
			firewallGroupStatesIsWhiteList: boolean;
			firewallGroupStatesBlackList: { id: string }[];
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export { };