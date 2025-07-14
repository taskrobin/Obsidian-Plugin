export interface TaskRobinPluginSettings {
	hasWelcomedUser: boolean;
	emailAddress: string;
	accessToken: string;
	rootDirectory: string;
	downloadAttachments: boolean;
	forwardingEmailAlias: string;
	syncOnLaunch: boolean;
}

export interface SyncResponse {
	emails: Array<{
		[key: string]: {
			[key: string]: string;
		};
	}>;
}