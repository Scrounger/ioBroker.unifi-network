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
			updateInterval: number;
			deviceImageDownload: boolean;
			clientOfflineTimeout: number;
			clientImageDownload: boolean;
			keepIobSynchron: boolean;
			deleteClientsOlderThan: number;
			deleteGuestsOlderThan: number;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export { };