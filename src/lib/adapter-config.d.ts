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
			deviceBlackList: [];
			deviceStatesIsWhiteList: boolean;
			deviceStatesBlackList: [];
			clientIsWhiteList: boolean;
			clientBlackList: [];
			clientStatesIsWhiteList: boolean;
			clientStatesBlackList: [];
			lanIsWhiteList: boolean;
			lanBlackList: [];
			lanStatesIsWhiteList: boolean;
			lanStatesBlackList: [];
			wlanIsWhiteList: boolean;
			wlanBlackList: [];
			wlanStatesIsWhiteList: boolean;
			wlanStatesBlackList: [];
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export { };