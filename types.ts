export interface Integration {
	forwardingEmailAlias: string;
	rootDirectory: string;
	originEmail: string;
}

export interface EmailAuth {
	originEmail: string;
	accessToken: string;
}

export interface TaskRobinPluginSettings {
	hasWelcomedUser: boolean;
	accessToken: string; // Legacy field, kept for backward compatibility
	rootDirectory: string;
	downloadAttachments: boolean;
	syncOnLaunch: boolean;

	// Legacy fields for backward compatibility
	emailAddress: string;
	forwardingEmailAlias: string;

	// New fields for multiple integrations
	integrations: Integration[];

	// New field for email authentication
	emailAuths: EmailAuth[];
}

export interface SyncResponse {
	emails: Array<{
		[key: string]: {
			[key: string]: string;
		};
	}>;
}
