export interface Integration {
	forwardingEmailAlias: string;
	rootDirectory: string;
}

export interface TaskRobinPluginSettings {
	hasWelcomedUser: boolean;
	accessToken: string;
	rootDirectory: string;
	downloadAttachments: boolean;
	syncOnLaunch: boolean;

	// Legacy fields for backward compatibility
	emailAddress: string;
	forwardingEmailAlias: string;

	// New field for multiple integrations
	integrations: Integration[];
}

export interface SyncResponse {
	emails: Array<{
		[key: string]: {
			[key: string]: string;
		};
	}>;
}
