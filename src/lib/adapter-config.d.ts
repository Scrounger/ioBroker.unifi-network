// This file extends the AdapterConfig type from "@types/iobroker"
import { myIob } from './myIob.js'
import { NetworkApi } from './api/network-api.js';
import { WriteValFunction, myCache } from './myTypes.js'

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			host: string;
			port: number;
			site: string;
			user: string;
			password: string;
			expertAliveInterval: number;
			expertConnectionMaxRetries: number;
			realTimeApiDebounceTime: number;
			apiUpdateInterval: number;
			deviceImageDownload: boolean;
			clientRealtimeDisconnectDebounceTime: number;
			clientDebouncingList: { mac: string, debounceTime: number }[];
			clientOfflineTimeout: number;
			vpnOfflineTimeout: number;
			clientImageDownload: boolean;
			clientDebugLevel: string;
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
			firewallGroupIsWhiteList: boolean;
			firewallGroupBlackList: { id: string }[];
			firewallGroupStatesIsWhiteList: boolean;
			firewallGroupStatesBlackList: { id: string }[];
		}

		interface myAdapter extends ioBroker.Adapter {
			// Functions must be public
			ufn: NetworkApi;
			myIob: myIob;
			cache: myCache;

			checkImageDownload(idImageUrl: string, url: string): Promise<void>
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export { };